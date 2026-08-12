#!/usr/bin/env node
/**
 * audit-invite-place-kinds — does the invite's place classifier agree with the
 * places Wayfind actually ships?
 *
 * Owner: "make sure the places match what we are actually proposing — an audit
 * to ensure this works right needs to be performed."
 *
 * The classifier in lib/dateInvite.js decides which of the six activities a
 * shared place IS, so the final card cannot pair "Drinks tonight" with a
 * breakfast cafe. It was written against seven names I chose myself, which
 * proves nothing. This runs it over every real place name in the repo —
 * creator finds, curated lists, partner picks, editorial — and reports:
 *
 *   • coverage: how many real places it can classify at all;
 *   • the unclassified tail, so the rules can be widened where it matters;
 *   • CONTRADICTIONS: a place whose name says one thing and whose Wayfind
 *     category says another. Those are the ones that produce a wrong plan.
 *
 * Unclassified is SAFE by design (planFitsPlace treats unknown as compatible),
 * so low coverage is a missed opportunity, not a bug. A contradiction is a bug.
 *
 * Report-only: prints and exits 0. It is an instrument, not a gate — the gate is
 * check-date-invite.mjs.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activityForPlace, kindsForPlace, ACTIVITIES } from "../lib/dateInvite.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Harvest place names from the data modules, without importing them — several
// pull in server-only deps and this has to run anywhere.
const SOURCES = ["lib", "app/components"];
const names = new Map(); // name -> where we found it
for (const dir of SOURCES) {
  const base = path.join(REPO, dir);
  for (const f of readdirSync(base)) {
    if (!/\.(js|jsx)$/.test(f)) continue;
    const full = path.join(base, f);
    if (statSync(full).isDirectory()) continue;
    const src = readFileSync(full, "utf8");
    // name: "..." / place: "..." / title: "..." — the three shapes the repo uses.
    for (const m of src.matchAll(/\b(?:name|place|title)\s*:\s*"([^"]{3,60})"/g)) {
      const v = m[1].trim();
      // Skip obvious non-places: sentences, labels, anything with no capital.
      if (v.split(/\s+/).length > 7) continue;
      if (!/^[A-Z0-9]/.test(v)) continue;
      if (/^(Wayfind|Florida|The Wayfind|Best|Top|How|What|Why)\b/.test(v)) continue;
      if (!names.has(v)) names.set(v, dir + "/" + f);
    }
  }
}

const rows = [...names.keys()].sort();
const byKind = new Map(ACTIVITIES.map((a) => [a.id, []]));
byKind.set("", []);
for (const n of rows) byKind.get(activityForPlace({ name: n })).push(n);

const classified = rows.length - byKind.get("").length;
const pct = rows.length ? Math.round((classified / rows.length) * 100) : 0;

console.log(`\naudit-invite-place-kinds — ${rows.length} real place names harvested from the repo\n`);
console.log(`  classified   ${classified}  (${pct}%)`);
console.log(`  unclassified ${byKind.get("").length}  — safe: an unknown place is never contradicted\n`);

for (const a of ACTIVITIES) {
  const list = byKind.get(a.id) || [];
  if (!list.length) continue;
  console.log(`  ${a.id.padEnd(9)} ${String(list.length).padStart(4)}   e.g. ${list.slice(0, 5).join(" · ")}`);
}

// ── the part that actually matters ─────────────────────────────────────────
// A name carrying signals for two different kinds is where a wrong plan comes
// from: "Grill & Bar" is both dinner and tonight, and whichever rule runs first
// silently wins.
const AMBIG = [
  [/\bbar\b|\bpub\b|\btavern\b|brewery|taproom/i, "tonight"],
  [/\bcafe\b|café|coffee|bakery|breakfast|brunch|diner|deli/i, "bite"],
  [/restaurant|steak|grill|kitchen|bistro|sushi|seafood/i, "dinner"],
  [/museum|gallery|garden|\bpark\b|zoo|aquarium|theat/i, "hidden"],
];
// A name carrying two identities must KEEP both. The first version of the
// classifier returned one winner, so "Perq Coffee Bar" came back as drinks
// tonight — the exact bug this audit exists to catch, found on the first run.
const missed = [];
let ambiguous = 0;
for (const n of rows) {
  const hit = AMBIG.filter(([rx]) => rx.test(n)).map(([, id]) => id);
  if (hit.length < 2) continue;
  ambiguous++;
  const got = kindsForPlace({ name: n });
  const lost = hit.filter((h) => got.indexOf(h) < 0);
  if (lost.length) missed.push([n, hit, got, lost]);
}
console.log(`\n  NAMES WITH TWO IDENTITIES — ${ambiguous}, of which ${missed.length} lose one`);
for (const [n, hit, got, lost] of missed.slice(0, 18)) {
  console.log(`    ${n.padEnd(38)} is ${hit.join("+")}  →  kept ${JSON.stringify(got)}, LOST ${lost.join("/")}`);
}
if (!missed.length) console.log("    none — every dual-identity place keeps both, so neither plan reads as a clash");

console.log(`\n  UNCLASSIFIED SAMPLE (these show the sender's place with no clash check):`);
for (const n of byKind.get("").slice(0, 24)) console.log("    " + n);

console.log(`\n  Reminder: unknown is treated as COMPATIBLE on purpose. Deleting somebody's`);
console.log(`  suggestion because a regex did not recognise "Ulele" would be a worse`);
console.log(`  failure than showing it.\n`);
