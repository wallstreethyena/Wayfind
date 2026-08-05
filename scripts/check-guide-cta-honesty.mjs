#!/usr/bin/env node
/**
 * check-guide-cta-honesty — a guide CTA must not promise more than it delivers,
 * and the events must be able to tell the two apart.
 *
 * WHY (measured 2026-08-05, owner excluded). Every tour-intent guide shipped the
 * same label, "Check tours & tickets", for a NAMED place. All nine of them
 * resolved to a generic Viator SEARCH — not one had an exact product. So 20
 * readers were promised tickets for a place and handed a search results page.
 * Zero of 20 clicked.
 *
 * bookingTargets() already distinguishes the two (verifiedUrl vs goFallback);
 * the CTA discarded that. And because cta_kind was "tour" either way, the 0/20
 * was unreadable: nobody could separate a bad OFFER from a vague LABEL.
 *
 * The same-surface evidence for preferring a deal: on the identical
 * intent_partner_rail, undercover_tourist offers drew 5 clicks from 23 viewers
 * (~17%) while generic viator drew 2 from 39 (~5%).
 *
 * Everything here CALLS guidePrimaryCta against the real guide registry. A regex
 * over the resolver's source would pass on a label built at runtime.
 */
import { GUIDES } from "../lib/guides.js";
import { guidePrimaryCta, guideIntent } from "../lib/guideCta.js";
import { couponForPlaceName } from "../lib/coupons.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const today = siteTodayStr();
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const slugs = Object.keys(GUIDES);
ok(slugs.length >= 10, `expected the guide registry to be populated (got ${slugs.length})`);

let monetized = 0, tours = 0, deals = 0, searches = 0;

for (const slug of slugs) {
  const cta = guidePrimaryCta(GUIDES[slug], today);

  // 1. `exact` is ALWAYS a boolean. An absent field and a false one are
  //    indistinguishable on a dashboard, which is how this gap stayed invisible.
  ok(typeof cta.exact === "boolean", `${slug}: cta.exact must be a boolean, got ${typeof cta.exact}`);

  if (cta.monetized) monetized++;
  if (cta.kind === "deal") deals++;

  if (cta.kind === "tour") {
    tours++;
    if (!cta.exact) searches++;

    // 2. THE HONESTY RULE. A search must never be labelled as tickets for a
    //    named place. This is the exact string that shipped and did not convert.
    ok(!/tickets|book now/i.test(cta.label) || cta.exact,
      `${slug}: a SEARCH destination is labelled "${cta.label}" — a label may only promise tickets when cta.exact is true`);

    // 3. A search label names the REGION (what it really searches), an exact
    //    label names the PLACE (what it really opens).
    if (cta.exact) {
      ok(cta.place && cta.label.includes(cta.place),
        `${slug}: an exact product CTA must name the place, got "${cta.label}"`);
    } else {
      const region = GUIDES[slug].region || "Orlando";
      ok(cta.label.includes(region),
        `${slug}: a search CTA must name the region it searches, got "${cta.label}"`);
    }
  }

  // 4. A monetized CTA always has an href; a non-monetized one never claims to earn.
  if (cta.monetized) ok(!!cta.href, `${slug}: a monetized CTA must have an href`);
  if (cta.kind === "directions") ok(cta.monetized === false, `${slug}: directions must stay non-monetized`);
}

// 5. The old label must be gone from the RESOLVED output, not merely from source.
const labels = slugs.map((s) => guidePrimaryCta(GUIDES[s], today).label).filter(Boolean);
ok(!labels.some((l) => /^Check tours & tickets$/.test(l)),
  "the generic 'Check tours & tickets' label must no longer be produced for any guide");

// Positive control: the assertions above ran against real tour guides. If the
// registry ever stops producing them, the honesty rule silently tests nothing.
ok(tours >= 5, `PROBE BROKEN: expected several tour-intent guides to exercise the honesty rule, got ${tours}`);

// 6. THE TOUR DEAL RUNG, asserted on the invariant rather than on a count.
//    `deals >= 1` was the first version of this and it was decoration: removing
//    the tour deal rung entirely left it GREEN, because a RESTAURANT-intent deal
//    kept the count at 1. The real rule is per-guide and derived from the data:
//    a tour-intent guide whose pick carries a live registry offer must resolve
//    to that deal, never to a generic search underneath it.
let tourDealOpportunities = 0;
for (const slug of slugs) {
  const g = GUIDES[slug];
  if (guideIntent(g) !== "tour") continue;
  const hit = (g.picks || []).find((p) => couponForPlaceName(p && p.name, today));
  if (!hit) continue;
  tourDealOpportunities++;
  const cta = guidePrimaryCta(g, today);
  ok(cta.kind === "deal",
    `${slug}: pick "${hit.name}" has a live registry offer but the CTA resolved to "${cta.kind}" — a deal converted ~17% of viewers on the same rail where generic search converted ~5%`);
}
ok(tourDealOpportunities >= 1,
  `PROBE BROKEN: no tour-intent guide currently has a matching live offer, so the rung above was never exercised (got ${tourDealOpportunities})`);

// 7. The events must carry `exact`, or none of this is readable.
const conv = readFileSync(REPO + "app/guides/[slug]/GuideConversion.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
for (const ev of ["commerce_impression", "commerce_cta_clicked"]) {
  const m = new RegExp(`track\\(\\s*["']${ev}["'][\\s\\S]{0,320}?\\)`).exec(conv);
  ok(m && /exact:\s*!!cta\.exact/.test(m[0]),
    `${ev} must carry exact: !!cta.exact — without it a search and a product are the same row`);
}

if (fail.length) {
  console.error("check-guide-cta-honesty: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-guide-cta-honesty: OK — ${pass} assertions across ${slugs.length} guides ` +
  `(${monetized} monetized, ${tours} tour-intent of which ${searches} are searches, ${deals} live deals); ` +
  `every CTA carries a boolean exact, no search is labelled as tickets, ` +
  `search labels name the region and exact labels name the place, events carry exact`
);
