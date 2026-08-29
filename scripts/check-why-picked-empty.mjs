#!/usr/bin/env node
// scripts/check-why-picked-empty.mjs — empty Why-Wayfind chrome cannot ship.
//
// Owner, 2026-08-29, Cirque Italia Sarasota: the LLM heading showed, then
// wrote nothing. Compact insight returned empty; atlas has ZERO hits;
// live GET /api/editorial?name=Cirque%20Italia → {none:true}. EMPTY is
// correct. Do not invent a two-beat. Stop mounting the opinion heading
// until whyWayfindPickedBody returns a validated non-empty paragraph.
// Loading may use a generic spinner, not that heading.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { whyWayfindPickedBody } from "../lib/insightWhy.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const REAL = "Selby Gardens is a bayfront botanical, not a roadside planting: walk the canopy, then sit on the water side when the light drops. That sequence is the reason to go, and it is on the grounds, not a nearby hotel lawn.";

ok(whyWayfindPickedBody(null) === "", "null insight is empty");
ok(whyWayfindPickedBody(undefined) === "", "undefined insight is empty");
ok(whyWayfindPickedBody({ error: true, why_wayfind_picked_this: REAL }) === "", "an error insight is empty even if it carries text");
ok(whyWayfindPickedBody({ unavailable: true }) === "", "unavailable is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: "" }) === "", "blank string is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: "   \n\t  " }) === "", "whitespace-only is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: "A highly reviewed nearby option with a strong rating." }) === "", "legacy filler is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: "Worth a look while you are nearby." }) === "", "worth-a-look filler is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: "A solid choice and it holds up." }) === "", "banned generic phrase is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: "Open now, 4.8 stars, 58 reviews, 14.1 mi." }) === "", "card-fact restatement is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: "I cannot assess this as an AI." }) === "", "model meta-commentary is empty");
ok(whyWayfindPickedBody({ why_wayfind_picked_this: REAL }) === REAL, "a real two-beat paragraph is kept");

{
  const detail = readFileSync(join(ROOT, "app/components/sheets/Detail.js"), "utf8");
  ok(/whyWayfindPickedBody/.test(detail), "positive control: Detail.js calls whyWayfindPickedBody");
  const code = strip(detail);
  const BODY = "const body = whyWayfindPickedBody(insight);";
  ok(code.includes(BODY),
    "the Why-Wayfind body is whyWayfindPickedBody(insight) — validated paragraph or empty");
  ok(/if \(!body\) return null;/.test(code),
    "no body → the block is omitted (heading cannot ship alone)");
  ok(!/if \(insightLoading\)/.test(code),
    "insightLoading must not gate a visible Why-Wayfind shell");
  ok(!/Reading the reviews/.test(code),
    "the LLM 'Reading the reviews' chrome is gone from Detail.js");
  const headingHits = code.match(/Why Wayfind picked this/g) || [];
  ok(headingHits.length >= 1, "positive control: the heading string still exists for a real body");
  const afterBody = code.split(BODY)[1] || "";
  ok(/if \(!body\) return null;[\s\S]*Why Wayfind picked this/.test(afterBody),
    "the heading is AFTER the empty-body return — it cannot render when body is empty");
  ok(!/Cirque Italia Sarasota/.test(detail),
    "Detail.js does not invent Cirque Italia Sarasota copy");
  ok(!/35,000-gallon/.test(detail),
    "Detail.js does not invent the tent two-beat");
}

{
  const holdPath = join(ROOT, "data/atlas/HOLD-cirque-italia.md");
  ok(existsSync(holdPath), "HOLD note exists for Cirque Italia (no ChIJ, why EMPTY)");
  const hold = readFileSync(holdPath, "utf8");
  ok(/why EMPTY/i.test(hold) && /Do not invent a two-beat/i.test(hold),
    "HOLD note says why EMPTY and do not invent a two-beat");
  ok(/Do not treat as current|past, not current/i.test(hold) && /Palmetto/i.test(hold),
    "Palmetto Jan 2025 is recorded as past, not current");
  ok(/Clown d'Or/i.test(hold) && /do \*\*not\*\* claim|do not claim/i.test(hold),
    "no Clown d'Or claim — HOLD forbids the medal");
}

{
  const inventoryGlobs = [
    "data/atlas/atlas-590.tsv",
    "data/atlas/editorial-cards.json",
    "data/atlas/owner-batch-2026-08-29.json",
    "data/atlas/owner-batch-2026-08-29b.json",
    "data/atlas/owner-batch-2026-08-29c.json",
    "data/atlas/owner-batch-2026-08-29d.json",
    "lib/editorial.js",
  ];
  let scanned = 0;
  for (const rel of inventoryGlobs) {
    const p = join(ROOT, rel);
    ok(existsSync(p), `positive control: inventory file exists (${rel})`);
    const src = readFileSync(p, "utf8");
    ok(src.length > 20, `positive control: ${rel} is non-empty`);
    ok(!/cirque\s+italia/i.test(src), `${rel} has no Cirque Italia row (no ChIJ to attach)`);
    scanned++;
  }
  ok(scanned === inventoryGlobs.length, `scanned ${scanned} inventory files`);

  const atlasDir = join(ROOT, "data/atlas");
  const extra = readdirSync(atlasDir).filter((f) => /\.(tsv|json)$/.test(f));
  ok(extra.length > 0, "positive control: data/atlas has tsv/json files");
  for (const f of extra) {
    const src = readFileSync(join(atlasDir, f), "utf8");
    if (/cirque\s+italia/i.test(src)) {
      ok(false, `data/atlas/${f} must not carry a Cirque Italia inventory row`);
    }
  }
}

{
  const libFiles = readdirSync(join(ROOT, "lib")).filter((f) => /\.(js|mjs)$/.test(f));
  ok(libFiles.length > 0, "positive control: lib/ has js files");
  for (const f of libFiles) {
    if (f === "insightWhy.js") continue;
    const src = readFileSync(join(ROOT, "lib", f), "utf8");
    if (/35,000-gallon/.test(src) || /CIRQUE_ITALIA_TENT_WHY/.test(src)) {
      ok(false, `lib/${f} must not store an invented Cirque two-beat`);
    }
  }
}

console.log(`\ncheck-why-picked-empty: ${fail ? "FAIL" : "OK"} — ${pass} assertions; whyWayfindPickedBody EXECUTED; no invented Cirque copy; Detail omits heading/LLM shell when empty.`);
process.exit(fail ? 1 : 0);
