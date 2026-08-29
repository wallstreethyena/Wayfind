#!/usr/bin/env node
// scripts/check-why-picked-empty.mjs — empty Why-Wayfind chrome cannot ship.
//
// Owner, 2026-08-29, Cirque Italia Sarasota: the LLM heading showed, then
// wrote nothing. The 2026-08-20 lock is two-beat sourced hook OR EMPTY —
// never a heading over a blank, never an LLM-on-render loading shell.
//
// This file EXECUTES the render gate (whyWayfindPickedBody) and then reads
// Detail.js for the syntactic position: the heading is inside the branch
// that already has a body. A loading-shell mutation must turn this red.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { whyWayfindPickedBody } from "../lib/insightWhy.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const REAL = "The tent is a traveling European-style water circus: a 35,000-gallon stage under canvas, not a resident Sarasota house show. Sit close enough to feel the spray off the basin — that is the physical reason to go, and only when a unit is actually in town.";

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
  ok(/const body = whyWayfindPickedBody\(insight\);/.test(code),
    "the Why-Wayfind body is the function return, not a local stitch");
  ok(/if \(!body\) return null;/.test(code),
    "no body → the block is omitted (heading cannot ship alone)");
  ok(!/if \(insightLoading\)/.test(code),
    "insightLoading must not gate a visible Why-Wayfind shell");
  ok(!/Reading the reviews/.test(code),
    "the LLM 'Reading the reviews' chrome is gone from Detail.js");
  const headingHits = code.match(/Why Wayfind picked this/g) || [];
  ok(headingHits.length >= 1, "positive control: the heading string still exists for a real body");
  const afterBody = code.split("const body = whyWayfindPickedBody(insight);")[1] || "";
  ok(/if \(!body\) return null;[\s\S]*Why Wayfind picked this/.test(afterBody),
    "the heading is AFTER the empty-body return — it cannot render when body is empty");
  ok(!/Cirque Italia Sarasota/.test(detail),
    "Detail.js does not invent Cirque Italia Sarasota copy (empty is correct for this pin)");
}

console.log(`\ncheck-why-picked-empty: ${fail ? "FAIL" : "OK"} — ${pass} assertions; whyWayfindPickedBody EXECUTED on empty/filler/real, Detail omits the heading and the LLM shell when there is nothing to say.`);
process.exit(fail ? 1 : 0);
