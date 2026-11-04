#!/usr/bin/env node
// scripts/test-guide-pick-facts.mjs — every guide pick must surface its
// planning facts, and every surfaced fact must come from the pick itself.
//
// THE COMPLAINT (owner, 2026-11-03): on /guides/florida-holiday-nights-out-2026
// the dates, times and tips a reader needs to plan were buried in prose or
// dropped entirely, and the place sheet behind "Open place" showed none of
// it. lib/guidePickFacts.js extracts the facts from each pick's own verified
// fields (eyebrow / when / months / city / blurb / tip) as verbatim
// substrings. This test EXECUTES that extraction over every guide in
// lib/guides.js and proves: (1) no fact value is invented — each is a
// substring of the pick's own fields; (2) coverage floors hold, so a future
// guide schema change cannot silently strip the facts strip; (3) the guide
// template actually renders the strip.
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guidePickFacts, guidePickWhen, guidePickTimes } from "../lib/guidePickFacts.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
let picks = 0, anyFact = 0, whens = 0, times = 0;
for (const [slug, g] of Object.entries(GUIDES)) {
  for (const p of g.picks || []) {
    picks++;
    const facts = guidePickFacts(p, g);
    if (facts.length) anyFact++;
    if (facts.some((f) => f.label === "When")) whens++;
    if (facts.some((f) => f.label === "Times")) times++;
    const own = norm([p.eyebrow, p.when, p.months, p.city, p.blurb, p.tip, g.region].filter(Boolean).join(" · "));
    for (const f of facts) {
      const parts = f.label === "Times" ? f.value.split(" · ") : [f.value];
      for (const part of parts) {
        ok(own.includes(norm(part)), `${slug}/${p.name}: fact "${f.label}: ${part}" is not a verbatim substring of the pick's own fields`);
      }
    }
  }
}
ok(picks >= 600, `expected the full guide corpus (>=600 picks), saw ${picks}`);
ok(anyFact / picks >= 0.95, `facts coverage ${anyFact}/${picks} fell below 95% — picks are losing their planning facts`);
ok(whens >= 235, `only ${whens} picks surface a When date (floor 235)`);
ok(times >= 195, `only ${times} picks surface Times (floor 195)`);

const holiday = GUIDES["florida-holiday-nights-out-2026"];
ok(!!holiday, "the reported guide (florida-holiday-nights-out-2026) must exist");
if (holiday) {
  const selby = (holiday.picks || []).find((p) => /Selby/i.test(p.name || ""));
  ok(!!selby, "holiday guide must carry the Selby pick");
  if (selby) {
    ok(guidePickWhen(selby) === "Dec 5 to Jan 2", `Selby When must read "Dec 5 to Jan 2", got "${guidePickWhen(selby)}"`);
    ok(guidePickTimes(selby).join(" ").includes("5:30 to 9 p.m."), `Selby Times must include the early-entry range, got "${guidePickTimes(selby).join(", ")}"`);
  }
}

const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
ok(page.includes("guidePickFacts") && page.includes("wf-guide-pick-facts"), "guide template must import guidePickFacts and render the wf-guide-pick-facts strip");

if (fail.length) {
  console.error(`test-guide-pick-facts: FAIL — ${fail.length} assertion(s)`);
  for (const f of fail.slice(0, 12)) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-guide-pick-facts: OK — ${pass} assertions (every fact verbatim from its pick; ${anyFact}/${picks} picks surface facts, ${whens} with dates, ${times} with times; template renders the strip)`);
