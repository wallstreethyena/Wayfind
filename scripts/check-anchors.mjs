// scripts/check-anchors.mjs — STATIC integrity check on data/anchors.json.
//
// The anchor list is the coverage guarantee: marquee places (Mote, Selby,
// Ringling…) that MUST appear in a category regardless of what Google's types
// return. This check protects the DEFINITIONS so a typo can't silently break the
// guarantee — every anchor must name a real category and carry only sub-filter
// tags that category actually has (the read path matches tags to chips by
// EQUALITY, so a bad tag is a dead, unmatchable value).
//
// STATIC on purpose: it validates the FILE, not the live inventory, so it is safe
// in prebuild (no Supabase, no Google, no network). The LIVE coverage check —
// "is every anchor actually IN wf_inventory, above rank N" — needs credentials
// and runs post-seed via scripts/seed-anchors.mjs, not here.
//
// Vocabulary is parsed from lib/google.js SUBFILTERS (the read path's source of
// truth), the same way scripts/test-taxonomy.mjs does it — so this check moves in
// lock-step when a sub-filter is added, renamed, or (as in v6.16) moved between
// categories.

import { readFileSync } from "node:fs";

const CATEGORIES = ["food", "nightlife", "attractions", "beach", "hotels", "shopping"];

// ── vocabulary, parsed from the source of truth ────────────────────────────
const src = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const sfBlock = src.slice(src.indexOf("export const SUBFILTERS"), src.indexOf("export function queryFor"));
const VOCAB = {};
for (const cat of CATEGORIES) {
  const m = sfBlock.match(new RegExp(cat + "\\s*:\\s*\\[([\\s\\S]*?)\\]"));
  VOCAB[cat] = new Set(m ? [...m[1].matchAll(/id:\s*"([a-z]+)"/g)].map((x) => x[1]) : []);
}

// ── load anchors ───────────────────────────────────────────────────────────
let doc;
try { doc = JSON.parse(readFileSync(new URL("../data/anchors.json", import.meta.url), "utf8")); }
catch (e) { console.error("check-anchors: data/anchors.json is not valid JSON — " + e.message); process.exit(1); }

const errors = [];
let anchorCount = 0;

for (const [metro, list] of Object.entries(doc)) {
  if (metro.startsWith("_")) continue; // _note / _schema / _owner_todo prose keys
  if (!Array.isArray(list)) { errors.push(`metro "${metro}" is not an array`); continue; }

  const seen = new Set();
  for (const [i, a] of list.entries()) {
    const at = `${metro}[${i}] ${a && a.name ? `"${a.name}"` : ""}`.trim();
    if (!a || typeof a !== "object") { errors.push(`${at}: not an object`); continue; }
    anchorCount++;

    if (!a.name || typeof a.name !== "string") errors.push(`${at}: missing/invalid name`);
    if (!a.city || typeof a.city !== "string") errors.push(`${at}: missing/invalid city (needed to resolve the right Place ID)`);

    if (!CATEGORIES.includes(a.category)) {
      errors.push(`${at}: category "${a.category}" is not one of ${CATEGORIES.join("|")}`);
    } else {
      const tags = a.tags || [];
      if (!Array.isArray(tags)) errors.push(`${at}: tags must be an array`);
      else for (const t of tags) {
        if (!VOCAB[a.category].has(t)) {
          errors.push(`${at}: tag "${t}" is not a valid ${a.category} sub-filter (valid: ${[...VOCAB[a.category]].join(", ") || "none"})`);
        }
      }
    }

    const key = (a.name || "").toLowerCase().trim();
    if (key && seen.has(key)) errors.push(`${at}: duplicate anchor name within "${metro}"`);
    seen.add(key);
  }
}

if (errors.length) {
  console.error(`check-anchors: FAIL — ${errors.length} problem(s) in data/anchors.json:`);
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log(`check-anchors: OK — ${anchorCount} anchors well-formed; every category valid and every tag is a real sub-filter id`);
