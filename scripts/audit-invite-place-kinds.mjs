#!/usr/bin/env node
/**
 * audit-invite-place-kinds — does the invite's place classifier agree with the
 * places Wayfind actually ships?
 *
 * Owner: "make sure the places match what we are actually proposing — an audit
 * to ensure this works right needs to be performed." And then, after it found
 * one: "audit that and make sure this does not happen."
 *
 * So this file is BOTH. Run directly it prints the full report. Imported, it
 * hands the corpus and the contradiction check to check-date-invite.mjs, which
 * fails the build. That split matters: a report nobody runs is how "Drinks
 * tonight at a breakfast cafe" reached a real invite in the first place.
 *
 * WHAT IT PROVES. The classifier decides which of the six activities a shared
 * place IS, so the final card cannot pair a plan with a place that contradicts
 * it. It was originally written against seven names I chose myself, which proves
 * nothing — the first run over the real corpus immediately found "Perq Coffee
 * Bar" classified as DRINKS TONIGHT, because the bar rule ran before the cafe
 * rule and only one could win.
 *
 * Unclassified is SAFE by design (planFitsPlace treats unknown as compatible),
 * so low coverage is a missed opportunity, not a bug. A CONTRADICTION is a bug,
 * and contradictions are what the build now refuses.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activityForPlace, kindsForPlace, ACTIVITIES } from "../lib/dateInvite.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Every place-shaped name in the repo's data modules. */
export function harvest() {
  const names = new Map();
  for (const dir of ["lib", "app/components"]) {
    const base = path.join(REPO, dir);
    for (const f of readdirSync(base)) {
      if (!/\.(js|jsx)$/.test(f)) continue;
      const full = path.join(base, f);
      if (statSync(full).isDirectory()) continue;
      const src = readFileSync(full, "utf8");
      for (const m of src.matchAll(/\b(?:name|place|title)\s*:\s*"([^"]{3,60})"/g)) {
        const v = m[1].trim();
        if (v.split(/\s+/).length > 7) continue;      // a sentence, not a place
        if (!/^[A-Z0-9]/.test(v)) continue;
        if (/^(Wayfind|Florida|The Wayfind|Best|Top|How|What|Why)\b/.test(v)) continue;
        if (!names.has(v)) names.set(v, dir + "/" + f);
      }
    }
  }
  return names;
}

// A name carrying two identities must KEEP both. Losing one turns a real plan
// into a false clash, and picking the wrong single winner turns a coffee shop
// into a cocktail bar — which is the bug the owner reported, one layer down.
const AMBIG = [
  [/\bbars?\b|\bpubs?\b|\btavern\b|brewery|taproom/i, "tonight"],
  [/\bcaf[eé]s?\b|coffee|bakery|bakeries|breakfast|brunch|diner|deli/i, "bite"],
  [/restaurants?|steak|grill|kitchen|bistro|sushi|seafood/i, "dinner"],
  [/museums?|galler(y|ies)|gardens?|\bparks?\b|zoo|aquarium|theat/i, "hidden"],
];

/**
 * Every real place name whose classification LOSES an identity its name clearly
 * carries. This is the list that must stay empty.
 */
export function contradictions(names) {
  const out = [];
  for (const n of names.keys()) {
    const should = AMBIG.filter(([rx]) => rx.test(n)).map(([, id]) => id);
    if (should.length < 2) continue;
    const got = kindsForPlace({ name: n });
    const lost = should.filter((s) => got.indexOf(s) < 0);
    if (lost.length) out.push({ name: n, should, got, lost });
  }
  return out;
}

// ── the report, when run directly ──────────────────────────────────────────
const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const names = harvest();
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

  const bad = contradictions(names);
  const dual = rows.filter((n) => AMBIG.filter(([rx]) => rx.test(n)).length > 1).length;
  console.log(`\n  NAMES WITH TWO IDENTITIES — ${dual}, of which ${bad.length} lose one`);
  for (const c of bad.slice(0, 20)) {
    console.log(`    ${c.name.padEnd(38)} is ${c.should.join("+")} → kept ${JSON.stringify(c.got)}, LOST ${c.lost.join("/")}`);
  }
  if (!bad.length) console.log("    none — every dual-identity place keeps both, so neither plan reads as a clash");
  console.log(`\n  This check is ALSO a build gate: check-date-invite.mjs imports contradictions()`);
  console.log(`  and fails on a non-empty list, so a rule change cannot quietly reintroduce it.\n`);

  console.log(`  UNCLASSIFIED SAMPLE (these show the sender's place with no clash check):`);
  for (const n of byKind.get("").slice(0, 20)) console.log("    " + n);
  console.log(`\n  Unknown is COMPATIBLE on purpose. Deleting somebody's suggestion because a`);
  console.log(`  regex did not recognise "Ulele" would be a worse failure than showing it.\n`);
}
