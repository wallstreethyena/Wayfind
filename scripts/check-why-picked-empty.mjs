#!/usr/bin/env node
// scripts/check-why-picked-empty.mjs — empty Why-Wayfind chrome cannot ship.
//
// Owner, 2026-08-29, Cirque Italia Sarasota: the LLM heading showed, then
// wrote nothing. The 2026-08-20 lock is two-beat sourced hook OR EMPTY —
// never a heading over a blank, never an LLM-on-render loading shell.
//
// This pin is the office / unknown client-inventory listing (no ChIJ in
// atlas, no public /places page, no current Gulf-coast tent). Why stays
// EMPTY. The sourced tent two-beat is stored only for a future public-tent
// Place ID — it is not attached by name.
//
// This file EXECUTES whyWayfindPickedBody + cirqueItaliaWhyBody, then reads
// Detail.js for the syntactic position: the heading is inside the branch
// that already has a body. A loading-shell mutation must turn this red.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { whyWayfindPickedBody } from "../lib/insightWhy.js";
import {
  CIRQUE_ITALIA_PUBLIC_TENT_PLACE_IDS,
  CIRQUE_ITALIA_TENT_WHY,
  cirqueItaliaBlocksEditorial,
  cirqueItaliaWhyBody,
  isCirqueItaliaPlace,
  isCirqueItaliaPublicTent,
} from "../lib/cirqueItalia.js";
import { carriedEditorial } from "../lib/editorialLookup.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// Non-Cirque two-beat. Invented Cirque copy must not live in this fixture —
// the Cirque pin is EMPTY until a public-tent ChIJ exists.
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
  const office = { name: "Cirque Italia Sarasota", id: "ChIJ_client_inventory_unknown" };
  const hq = { name: "Cirque Italia", id: "" };
  const llm = whyWayfindPickedBody({ why_wayfind_picked_this: REAL });
  ok(isCirqueItaliaPlace(office) === true, "name match: Cirque Italia Sarasota");
  ok(isCirqueItaliaPlace({ name: "Cirque du Soleil Store" }) === false, "Cirque du Soleil is not Cirque Italia");
  ok(isCirqueItaliaPlace({ name: "Cirque St. Armands" }) === false, "Cirque St. Armands restaurant is not Cirque Italia");
  ok(isCirqueItaliaPlace({ name: "Circus Museum" }) === false, "Circus Museum is not Cirque Italia");
  ok(CIRQUE_ITALIA_PUBLIC_TENT_PLACE_IDS.length === 0, "no public-tent ChIJ is listed — why stays empty");
  ok(isCirqueItaliaPublicTent(office) === false, "unknown client pin is not a public tent");
  ok(cirqueItaliaWhyBody(office, llm) === "", "office / unknown pin: why EXECUTED empty even if the LLM wrote a real paragraph");
  ok(cirqueItaliaWhyBody(hq, CIRQUE_ITALIA_TENT_WHY) === "", "HQ name with no tent id: sourced tent beat is NOT attached");
  ok(cirqueItaliaWhyBody({ name: "Marie Selby Botanical Gardens" }, REAL) === REAL, "non-Cirque places still receive a real why body");
  ok(cirqueItaliaBlocksEditorial(office) === true, "office pin blocks editorial inheritance");
  ok(carriedEditorial({ name: "Cirque Italia Sarasota", knownFor: CIRQUE_ITALIA_TENT_WHY }) === null,
    "carriedEditorial EXECUTED empty for Cirque Italia — a tent hook cannot ride the office pin");
  ok(CIRQUE_ITALIA_TENT_WHY === "Custom 35,000-gallon water stage under a traveling tent — acts play over the pool with rain curtains and fountain jets.",
    "the stored tent two-beat is the official-page sentence, unused until a tent ChIJ exists");
}

{
  const detail = readFileSync(join(ROOT, "app/components/sheets/Detail.js"), "utf8");
  ok(/whyWayfindPickedBody/.test(detail), "positive control: Detail.js calls whyWayfindPickedBody");
  ok(/cirqueItaliaWhyBody/.test(detail), "positive control: Detail.js calls cirqueItaliaWhyBody");
  const code = strip(detail);
  const BODY = "const body = cirqueItaliaWhyBody(detail, whyWayfindPickedBody(insight));";
  ok(code.includes(BODY),
    "the Why-Wayfind body is cirqueItaliaWhyBody(detail, whyWayfindPickedBody(insight))");
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
    "Detail.js does not invent Cirque Italia Sarasota copy (empty is correct for this pin)");
}

{
  const holdPath = join(ROOT, "data/atlas/HOLD-cirque-italia.md");
  ok(existsSync(holdPath), "HOLD note exists for Cirque Italia (no ChIJ, why EMPTY)");
  const hold = readFileSync(holdPath, "utf8");
  ok(/why EMPTY/i.test(hold) && /do not send people to HQ/i.test(hold),
    "HOLD note says why EMPTY and do not send people to HQ");
  ok(/past/i.test(hold) && /Palmetto/i.test(hold) && /Do not treat as current/i.test(hold),
    "Palmetto Jan 2025 is recorded as past — do not treat as current");
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
  const route = readFileSync(join(ROOT, "app/api/editorial/route.js"), "utf8");
  ok(/cirqueItaliaBlocksEditorial/.test(route),
    "/api/editorial CALLS cirqueItaliaBlocksEditorial before name-keyed cards");
}

console.log(`\ncheck-why-picked-empty: ${fail ? "FAIL" : "OK"} — ${pass} assertions; whyWayfindPickedBody + cirqueItaliaWhyBody EXECUTED; office pin empty; no inventory ChIJ; Detail omits heading/LLM shell when empty.`);
process.exit(fail ? 1 : 0);
