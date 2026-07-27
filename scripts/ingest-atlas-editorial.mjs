// ingest-atlas-editorial.mjs — attach the Wayfind Atlas editorial cards to wf_inventory.
//
//   node scripts/ingest-atlas-editorial.mjs             # DRY-RUN: parse + validate + write JSON snapshot, NO db write
//   node scripts/ingest-atlas-editorial.mjs --commit    # PATCH editorial_card onto the matching wf_inventory rows
//
// - Only PUBLISH-READY CANDIDATE cards ship (NEEDS / REVIEW-SUPPRESS are skipped).
// - Attaches by Google place_id (verified 100% present in wf_inventory, names cross-checked).
// - Idempotent. Reads OUR data only — zero Google/Places API calls, zero new cost.
// - Requires supabase/atlas-editorial.sql applied first (adds wf_inventory.editorial_card jsonb).
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.env.ATLAS_MD ||
  process.env.HOME + "/Documents/Codex/2026-07-10/au/outputs/atlas590-full/atlas590-editorial-cards.md";
const OUT = join(ROOT, "data/atlas/editorial-cards.json");
const COMMIT = process.argv.includes("--commit");

// label in markdown -> key in the editorial_card JSON.
// TWO label vocabularies map onto the SAME keys: the original Atlas-590 headings
// and the owner's Wayfind Card Standard headings (docs/WAYFIND_CARD_STANDARD.md).
// The standard's names already match what Detail.js renders ("Why it stands out",
// "Good to know", "Heads up", "The story"), so aliasing beats renaming the keys.
// Order matters only in that a LATER alias must not clobber an earlier hit —
// see the `if (v != null)` guard in the parse loop below.
const FIELDS = {
  // --- stable across both vocabularies ---
  "Vibe Check": "vibeCheck", "Why Go": "whyGo", "Best For": "bestFor", "Known For": "knownFor",
  "Food Move": "foodMove", "Drink Move": "drinkMove", "Insider Move": "insiderMove",
  "Fun Fact": "funFact",
  "Phone": "phone", "Official website": "officialWebsite", "Address": "address",
  // --- Atlas-590 (original) ---
  "Powerhouse Proof": "powerhouseProof", "Verified Story": "verifiedStory",
  "Current Useful Detail": "currentUsefulDetail", "Watch-Out / Not For Everyone": "watchOut",
  // --- Wayfind Card Standard (owner's headings) -> same keys ---
  "Why It Stands Out": "powerhouseProof", "The Story": "verifiedStory",
  "Good to Know": "currentUsefulDetail", "Heads Up": "watchOut",
  // --- new in the Wayfind Card Standard: no prior key existed ---
  "Pro Move": "proMove",
};
// Sections the Wayfind Card Standard expects. Absence is reported (never silent)
// but is not fatal — Atlas-590 cards legitimately predate the newer sections.
const STANDARD_KEYS = [
  "whyGo", "knownFor", "insiderMove", "powerhouseProof", "currentUsefulDetail",
  "watchOut", "bestFor", "proMove", "verifiedStory", "vibeCheck", "funFact",
];
const unNull = (v) => (v == null || v === "`null`" || v === "null" || v === "") ? null : v;
const field = (card, label) => {
  const re = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + ":\\s*(.*)$", "m");
  const m = card.match(re); return m ? unNull(m[1].trim()) : null;
};

const raw = readFileSync(SRC, "utf8");
const blocks = raw.split(/\n(?=## \d+\. )/).filter((b) => /^## \d+\. /.test(b));
const cards = [];
for (const b of blocks) {
  if (field(b, "Quality Level") !== "PUBLISH-READY CANDIDATE") continue;
  const num = (b.match(/^## (\d+)\./) || [])[1];
  const name = (b.match(/^## \d+\. (.+)$/m) || [])[1]?.trim();
  const placeId = (b.match(/^Google Place ID: `([^`]+)`/m) || [])[1];
  const category = (field(b, "Category") || "").replace(/^.*\(`([a-z]+)`\).*$/, "$1") || null;
  // hours: drop the "| expires: ..." bookkeeping suffix
  let hours = field(b, "Hours"); if (hours) hours = hours.replace(/\s*\|\s*expires:.*$/i, "").trim();
  const card = { placeId, name, num: Number(num), category, hours };
  // Every key starts null so the shape is stable, then each label fills its key
  // ONLY on a hit. Without the null-guard a later alias ("Heads Up") would
  // overwrite an earlier hit ("Watch-Out / Not For Everyone") back to null.
  for (const key of Object.values(FIELDS)) if (!(key in card)) card[key] = null;
  for (const [label, key] of Object.entries(FIELDS)) { const v = field(b, label); if (v != null) card[key] = v; }
  // source URLs (for "Live menu →" etc.) — the block after "Source URLs:" excluding the google-maps line
  const srcBlock = (b.split(/\nSource URLs:/)[1] || "");
  card.sourceUrls = (srcBlock.match(/https?:\/\/\S+/g) || []).filter((u) => !u.includes("google.com/maps/search"));
  if (placeId && name) cards.push(card);
}

// ---- validation ------------------------------------------------------------
const problems = [];
for (const c of cards) {
  for (const req of ["vibeCheck", "whyGo", "knownFor"]) if (!c[req]) problems.push(`#${c.num} ${c.name}: missing ${req}`);
  const blob = JSON.stringify(c);
  if (/`null`/.test(blob)) problems.push(`#${c.num} ${c.name}: literal \`null\` leaked into JSON`);
  if (!c.placeId) problems.push(`#${c.num} ${c.name}: no place_id`);
}
const pids = cards.map((c) => c.placeId);
const dupes = pids.filter((p, i) => pids.indexOf(p) !== i);

// Per-section coverage. The old parser dropped an unrecognised heading to null
// with no signal, so a card could lose 5 of its 11 sections and still "pass".
// Losing a section is still allowed (Atlas-590 cards predate some of them) —
// it just can no longer happen quietly.
const coverage = STANDARD_KEYS.map((k) => [k, cards.filter((c) => c[k] != null).length]);

console.log(`Parsed ${cards.length} PUBLISH-READY cards from ${SRC.replace(process.env.HOME, "~")}`);
console.log(`Validation: ${problems.length ? problems.length + " PROBLEM(S)" : "clean"}${dupes.length ? `; ${dupes.length} duplicate place_id(s)!` : ""}`);
for (const p of problems.slice(0, 20)) console.log("  ! " + p);
console.log("\nSection coverage (Wayfind Card Standard):");
for (const [k, n] of coverage) {
  const pct = cards.length ? Math.round((n / cards.length) * 100) : 0;
  console.log(`  ${n === 0 ? "!" : " "} ${k.padEnd(20)} ${String(n).padStart(4)}/${cards.length}  ${pct}%`);
}
const sample = cards.find((c) => c.name?.includes("Siesta")) || cards[0];
console.log(`\nSample — ${sample.name} (${sample.placeId}):`);
console.log(JSON.stringify(sample, null, 2).split("\n").slice(0, 16).join("\n") + "\n  ...");

writeFileSync(OUT, JSON.stringify(cards, null, 2));
console.log(`\nWrote snapshot: ${OUT.replace(ROOT, ".")} (${cards.length} cards)`);

if (!COMMIT) { console.log("\nDRY-RUN — no database write. Re-run with --commit to attach to wf_inventory."); process.exit(problems.length ? 1 : 0); }
if (problems.length) { console.error("\nREFUSING to commit: validation problems above. Fix first."); process.exit(1); }

// ---- commit: PATCH editorial_card by place_id ------------------------------
const env = {};
for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim(); }
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, svc = env.SUPABASE_SERVICE_ROLE_KEY;
let ok = 0, fail = 0;
for (const c of cards) {
  const r = await fetch(`${url}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(c.placeId)}`, {
    method: "PATCH",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ editorial_card: c }),
  });
  if (r.ok) ok++; else { fail++; console.error(`  FAIL ${c.name} (${c.placeId}): ${r.status} ${(await r.text()).slice(0, 140)}`); }
  process.stdout.write(`  committed ${ok}/${cards.length}\r`);
}
console.log(`\nDone: ${ok} attached, ${fail} failed.`);
process.exit(fail ? 1 : 0);
