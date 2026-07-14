// scripts/atlas-extract.mjs — extract the "Wayfind Atlas 590-business Powerhouse
// Card" reference set from the Claude Code session transcript, VERBATIM.
//
// WHY FROM THE TRANSCRIPT: the cards were pasted into a chat, not handed over as
// a file. Retyping 590 Google Place IDs by hand would risk silent single-character
// corruption that later looks like "this place is missing from the inventory"
// when it is really a typo. The session JSONL holds the literal bytes the owner
// pasted, so we parse those and never retype.
//
// WHAT THE PASTE LOOKS LIKE ON DISK: it is a spreadsheet copy, so rows are
// separated by CARRIAGE RETURNS (\r) and fields by TABS (\t) — 1773 tabs = 3 x 591
// rows incl. header. The \r is why the rows appear glued together ("...Ao4attractions")
// in a \n-oriented view. Splitting on \r then \t recovers every field exactly,
// with no heuristics and nothing retyped.
//
// OUTPUT (all under data/atlas/, reference data — NOT production records):
//   atlas-590.raw.txt        the pasted block, byte-for-byte (the raw source)
//   atlas-590.tsv            the parsed records
//   review-malformed.tsv     ids that fail the Place-ID pattern
//   review-duplicate-ids.tsv the same place_id appearing more than once
//   review-same-place.tsv    same name+address, DIFFERENT place_id (likely one place, two ids)
//   atlas-report.json        machine-readable summary
//
// Read-only w.r.t. the transcript. Writes nothing outside data/atlas/.

import fs from "node:fs";
import path from "node:path";

const TRANSCRIPT = process.env.ATLAS_TRANSCRIPT ||
  `${process.env.HOME}/.claude/projects/-Users-gabrielpereira/104d5890-47e4-49c9-ae34-595f1f152fe9.jsonl`;
const OUT = path.join(process.cwd(), "data", "atlas");

const CATEGORIES = ["attractions", "beaches", "food", "hotels", "nightlife", "other", "shopping"];
// A Google Place ID as Google emits them: ChIJ + base64url-ish body.
const PLACE_ID = /^ChIJ[A-Za-z0-9_-]{20,}$/;
const HEADER = "category\tname\taddress\tgoogle_place_id";

const die = (m) => { console.error(`atlas-extract: ${m}`); process.exit(1); };

// ── 1. locate the pasted block in the transcript ────────────────────────────
if (!fs.existsSync(TRANSCRIPT)) die(`transcript not found: ${TRANSCRIPT}`);
const lines = fs.readFileSync(TRANSCRIPT, "utf8").split("\n").filter(Boolean);

let raw = null;
for (const line of lines) {
  let rec;
  try { rec = JSON.parse(line); } catch { continue; }
  if (rec.type !== "user") continue;
  const content = rec.message?.content;
  const parts = Array.isArray(content) ? content : [content];
  for (const p of parts) {
    const text = typeof p === "string" ? p : (p?.content ?? p?.text ?? "");
    if (typeof text !== "string" || !text.includes(HEADER)) continue;
    // Take everything from the header row to the end of the pasted block.
    const start = text.indexOf(HEADER);
    let block = text.slice(start);
    // The paste was quoted inside the prompt, so harness/prose text can follow the
    // closing quote and would otherwise glue onto the LAST record's place_id. Cut
    // at that quote — but ONLY when no Place ID appears after it, so this can never
    // silently truncate real data.
    const endQuote = block.lastIndexOf('"');
    if (endQuote > 0 && !block.slice(endQuote).includes("ChIJ")) block = block.slice(0, endQuote);
    if (!raw || block.length > raw.length) raw = block;
  }
}
if (!raw) die("could not find the pasted card block in the transcript");

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "atlas-590.raw.txt"), raw);

// ── 2. parse: rows on \r (or \r\n / \n), fields on \t. No heuristics. ───────
const rows = raw.split(/\r\n|\r|\n/).map((r) => r.trim()).filter(Boolean);
const head = rows.shift();
if (head !== HEADER) die(`unexpected header: ${JSON.stringify(head)}`);

const records = [];
const malformed = [];
const structurallyBad = [];

for (const [i, row] of rows.entries()) {
  const f = row.split("\t");
  if (f.length !== 4) { structurallyBad.push({ line: i + 2, row, fields: f.length }); continue; }
  const [category, name, address, google_place_id] = f.map((s) => s.trim());
  const rec = { category, name, address, google_place_id };
  records.push(rec);
  if (!PLACE_ID.test(google_place_id)) malformed.push(rec);
}
if (structurallyBad.length) {
  console.error(`atlas-extract: ${structurallyBad.length} row(s) did not have exactly 4 fields:`);
  console.error(JSON.stringify(structurallyBad, null, 2));
}

// ── 3. validate ────────────────────────────────────────────────────────────
const idLens = {};
for (const r of records) idLens[r.google_place_id.length] = (idLens[r.google_place_id.length] || 0) + 1;

const byId = new Map();
for (const r of records) {
  if (!byId.has(r.google_place_id)) byId.set(r.google_place_id, []);
  byId.get(r.google_place_id).push(r);
}
const duplicateIds = [...byId.entries()].filter(([, v]) => v.length > 1);

// Same name+address but a DIFFERENT place id => almost certainly one real place
// carrying two Google ids (a genuine data problem). Distinct from a chain, which
// shares a name but has different addresses.
const byNameAddr = new Map();
for (const r of records) {
  const k = `${r.name.trim().toLowerCase()}|${r.address.trim().toLowerCase()}`;
  if (!byNameAddr.has(k)) byNameAddr.set(k, []);
  byNameAddr.get(k).push(r);
}
const samePlaceTwoIds = [...byNameAddr.entries()]
  .filter(([k, v]) => v.length > 1 && new Set(v.map((r) => r.google_place_id)).size > 1)
  .filter(([k]) => !k.includes("(no address in fsq)")); // no-address rows can't be compared this way

const catCounts = {};
for (const r of records) catCounts[r.category] = (catCounts[r.category] || 0) + 1;

const noAddress = records.filter((r) => /^\(no address in FSQ\)$/i.test(r.address.trim()));

// ── 4. write outputs ───────────────────────────────────────────────────────
const tsv = (rows) => [HEADER, ...rows.map((r) => `${r.category}\t${r.name}\t${r.address}\t${r.google_place_id}`)].join("\n") + "\n";
fs.writeFileSync(path.join(OUT, "atlas-590.tsv"), tsv(records));
fs.writeFileSync(path.join(OUT, "review-malformed.tsv"), tsv(malformed));
fs.writeFileSync(path.join(OUT, "review-duplicate-ids.tsv"), tsv(duplicateIds.flatMap(([, v]) => v)));
fs.writeFileSync(path.join(OUT, "review-same-place.tsv"), tsv(samePlaceTwoIds.flatMap(([, v]) => v)));

const report = {
  source: TRANSCRIPT,
  rawBytes: raw.length,
  parsed: records.length,
  expected: 590,
  countOk: records.length === 590,
  structurallyBadRows: structurallyBad.length,
  placeIdOccurrencesInRaw: (raw.match(/ChIJ/g) || []).length,
  categories: catCounts,
  unknownCategories: [...new Set(records.map((r) => r.category))].filter((c) => !CATEGORIES.includes(c)),
  idLengthHistogram: idLens,
  malformedIds: malformed.length,
  uniqueIds: byId.size,
  duplicateIdGroups: duplicateIds.length,
  duplicateIdRows: duplicateIds.reduce((n, [, v]) => n + v.length, 0),
  samePlaceTwoIdGroups: samePlaceTwoIds.length,
  noAddressRows: noAddress.length,
};
fs.writeFileSync(path.join(OUT, "atlas-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
