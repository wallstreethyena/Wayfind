#!/usr/bin/env node
/**
 * check-guide-conversion — the conversion overhaul's rules, per
 * docs/GUIDE_CONVERSION_DIRECTIVE.md.
 *
 * The bet: remove live monetized surface area (per-pick book/rates on EVERY pick)
 * and trade many weak links for ONE strong CTA. That is only defensible if it is
 * falsifiable, so the instrumentation is part of the contract, not decoration.
 */
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guidePrimaryCta, guideIntent, guideContinue } from "../lib/guideCta.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const raw = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

const page = code("app/guides/[slug]/page.js");
const conv = code("app/guides/[slug]/GuideConversion.js");
const cta = code("lib/guideCta.js");

// ── §1 ONE primary CTA, through THE predicate ─────────────────────────────
ok(/bookingTargets/.test(cta), "the resolver goes through bookingTargets — THE single predicate");
ok(!/experienceGoUrl\(|hotelSearchUrl\(/.test(page), "the guide page no longer resolves booking hrefs directly");
ok(!/Check tours &amp; tickets|Check rates ↗/.test(page), "the per-pick link wall is gone");
// Behavioural, not text-presence. `/Open in Wayfind/` passed even with the whole
// link disabled to `{false ? ...}`, because the string stayed in the file. That is
// the same mistake that shipped the dead cuisine chips.
ok(/\{\(pick\.appQuery !== null\) \? <a href=\{appUrl\(/.test(page),
  "'Open in Wayfind' SURVIVES per pick, gated on pick.appQuery and not on a constant (owner condition 3a)");
ok(/Open in Wayfind/.test(page), "...and still carries its label");
ok(/guidePrimaryCta\(g\)/.test(page), "exactly one CTA is resolved per guide");
ok(/guideContinue\(/.test(page), "one continue card, not a four-link 'More guides' wall");
ok(!/More Wayfind guides/.test(page), "the old four-link list is removed");

// Resolution over ALL 17 real guides — both sides exercised.
{
  let monetized = 0, directions = 0, none = 0;
  for (const slug of Object.keys(GUIDES)) {
    const c = guidePrimaryCta(GUIDES[slug], "2026-07-30");
    ok(typeof c.monetized === "boolean", `${slug}: resolver returns a monetized flag`);
    if (c.monetized) { monetized++; ok(!!c.href, `${slug}: a monetized CTA has an href`); ok(c.sponsored === true, `${slug}: a monetized CTA is sponsored`); }
    else if (c.kind === "directions") { directions++; ok(c.sponsored === false, `${slug}: Directions is NOT tagged sponsored — it earns nothing`); }
    else none++;
    const n = guideContinue(GUIDES[slug], slug, GUIDES);
    ok(n && n.slug !== slug, `${slug}: the continue card points at a DIFFERENT guide`);
  }
  ok(monetized >= 5, `at least 5 guides resolve a monetized CTA (got ${monetized})`);
  ok(directions >= 1, `the honest Directions terminal is exercised (got ${directions})`);
  ok(none >= 1, `guides with no CTA exist and are counted, not hidden (got ${none})`);
  ok(monetized + directions + none === Object.keys(GUIDES).length, "every guide resolves to exactly one outcome");
}

// ── §3 social proof: three outcomes kept DISTINCT ─────────────────────────
// My first version collapsed "lookup failed" and "no match" into one null and I
// wrote a comment defending it. That is precisely what the standing rule forbids.
ok(/socialStatus/.test(page), "the page tracks a social-proof STATUS, not just a value");
for (const st of ['"ok"', '"no-match"', '"unavailable"'])
  ok(page.includes(st), `social status ${st} is a distinct outcome`);
ok(/console\.error\(`\[guide\] social proof/.test(page), "a FAILED social lookup logs loudly — it must not look like a sparse page");
ok(/hit === false[\s\S]{0,160}?socialStatus = "unavailable"/.test(page),
  "a failed inventory request is UNAVAILABLE, never disguised as a no-match");
ok(/hit === "unconfigured"[\s\S]{0,160}?socialStatus = "unavailable"/.test(page),
  "an unconfigured inventory source is UNAVAILABLE, never disguised as a no-match");
ok(!/rankedFor\("things-to-do"/.test(page),
  "guide rendering never falls through to rankedFor's no-store path");
ok(/social_status: socialStatus/.test(conv), "the status rides the impression event so a degraded lookup is countable");
ok(/social \?/.test(conv) && !/reviews: 0|rating: 0/.test(conv), "absent social proof renders NOTHING — no placeholder, no fake zero");

// ── §4 real deadlines only ────────────────────────────────────────────────
ok(/couponEndsLabel/.test(cta), "the deadline comes from couponEndsLabel — the actual expiry in the data");
ok(/couponForPlaceName/.test(cta), "a deal must match a place the guide actually mentions");
ok(!/Ends (July|Aug|Sept|Oct|Nov|Dec|Jan)/.test(cta + conv), "no HARDCODED deadline anywhere");
ok(!/hurry|last chance|only \d+ left|ending soon/i.test(conv), "no manufactured urgency — a real expiry is the only permitted deadline");
ok(/cta\.deal && cta\.deal\.ends/.test(conv), "the deadline renders only when a real expiry exists");

// ── §5 + instrumentation: the bet is falsifiable ──────────────────────────
for (const ev of ["commerce_impression", "commerce_cta_clicked", "guide_next_step", "primary_cta_null"])
  ok(conv.includes(ev), `${ev} is emitted`);
ok(/IntersectionObserver/.test(conv), "the impression fires on VISIBILITY, not on render — a render-time impression makes CTR meaningless");
ok(/acted\.current/.test(conv), "guide_next_step fires ONCE per reader, so the funnel cannot exceed 100%");
for (const v of ['"cta"', '"continue"', '"save"'])
  ok(conv.includes(v), `guide_next_step value ${v} exists`);
ok(/!cta \|\| !cta\.monetized/.test(conv),
  "primary_cta_null keys off MONETIZABLE, so Directions correctly still fires it (directive redefinition)");
ok(/guide_saved/.test(conv) && /Save this guide/.test(conv), "§5 exit-on-peak save prompt exists");

if (fail.length) {
  console.error("check-guide-conversion: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-guide-conversion: OK — ${pass} assertions (one CTA through THE predicate, link wall gone, Open-in-Wayfind kept, social status distinct, real deadlines only, bet falsifiable)`);
