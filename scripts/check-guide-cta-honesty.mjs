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
import { guidePrimaryCta, guideIntent, pickVenueLabel } from "../lib/guideCta.js";
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

// WHAT AN EXACT LABEL MAY NAME. This assertion previously demanded the label
// contain cta.place — the raw pick name. That encoded the bug: pick names are
// editorial ("Gatorland: the classic park"), and #611 stops naming them. The
// old rule therefore FAILED the fix on Vercel, which is the only environment
// with a Viator PID and so the only place an exact CTA exists at all.
//
// The rule is: name the product title when one resolved, else the VENUE derived
// from the pick, else name nothing and say so.
function exactLabelIsHonest(cta) {
  const label = String(cta.label || "");
  const place = String(cta.place || "");
  const want = cta.productTitle || pickVenueLabel(place);
  if (!want) return label === "See tickets & availability";
  // It must name the right thing...
  if (!label.includes(String(want).slice(0, 30))) return false;
  // ...and must NOT still carry the editorial remainder. Containment alone is
  // too weak: "See tickets for Gatorland: the classic park" contains
  // "Gatorland", so an includes() check passes the very bug being rejected.
  if (place && place !== want && label.includes(place)) return false;
  return true;
}

// Driven with fixtures, because no guide resolves exact without a PID and the
// loop below would otherwise assert nothing on a dev box — which is exactly how
// the stale rule survived until a Vercel build rejected it.
const EXACT_FIXTURES = [
  [{ exact: true, place: "Gatorland: the classic park", label: "See tickets for Gatorland" }, true,
   "the venue, with the editorial suffix stripped"],
  [{ exact: true, place: "Gatorland: the classic park", label: "See tickets for Gatorland: the classic park" }, false,
   "THE SHIPPED BUG: the full pick heading"],
  [{ exact: true, place: "What the hour actually covers", label: "See tickets & availability" }, true,
   "prose pick -> names nothing, honestly"],
  [{ exact: true, place: "What the hour actually covers", label: "See tickets: What the hour actually covers" }, false,
   "prose pick must never be named"],
  [{ exact: true, place: "Winter Park Scenic Boat Tour", productTitle: "Clear Kayak Sunset Tour through The Winter Park chain",
     label: "See tickets: Clear Kayak Sunset Tour through The Winter\u2026" }, true,
   "resolved product title wins over the pick"],
];
for (const [cta, want, why] of EXACT_FIXTURES) {
  ok(exactLabelIsHonest(cta) === want, `exact-label rule (${why}): expected ${want} for "${cta.label}"`);
}
ok(EXACT_FIXTURES.some(([c]) => exactLabelIsHonest(c)) && EXACT_FIXTURES.some(([c]) => !exactLabelIsHonest(c)),
  "PROBE BROKEN: the exact-label rule must be capable of both answers");

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
      // Name what the click OPENS. When a product resolved, that is the PRODUCT
      // title — a resolved product is often a related experience rather than the
      // pick itself (Winter Park Scenic Boat Tour resolves to a kayak tour on
      // the same lake chain), so naming the pick would over-promise exactly the
      // way the old label did.
      ok(exactLabelIsHonest(cta),
        `${slug}: an exact CTA must name what it opens — the product title, or the VENUE from the pick, or nothing at all — got "${cta.label}"`);
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

// 8. AN EXACT LABEL MAY NAME ONLY A VENUE, never a pick heading.
//    Shipped 2026-08-06: "See tickets for Gatorland: the classic park". #606
//    fixed the render-time upgrade path; this is the sibling path in guideCta,
//    and it was invisible locally because no pick resolves verifiedUrl without
//    an API key — so pickVenueLabel is DRIVEN directly here.
const VENUE_CASES = [
  ["Gatorland: the classic park", "Gatorland", "editorial suffix stripped"],
  ["Wild Florida \u2014 the airboat experience", "Wild Florida", "em-dash suffix stripped"],
  ["The Ringling", "The Ringling", "a bare venue survives"],
  ["Winter Park Scenic Boat Tour", "Winter Park Scenic Boat Tour", "a long all-proper name survives"],
  ["Museum of Fine Arts", "Museum of Fine Arts", "connectors are discounted, not counted against it"],
  ["What the hour actually covers", null, "THE PRODUCTION BUG: prose must never be named"],
  ["Seventh Avenue and the cigar legacy", null, "a heading is prose even when it starts with a proper noun"],
  ["Tickets, timing, and the cash catch", null, "a list heading is prose"],
  ["the verdict", null, "lowercase prose"],
  ["", null, "nothing to name"],
];
for (const [input, want, why] of VENUE_CASES) {
  const got = pickVenueLabel(input);
  ok(got === want, `pickVenueLabel(${JSON.stringify(input)}) should be ${JSON.stringify(want)} (${why}) — got ${JSON.stringify(got)}`);
}
// Positive + negative controls: the rule must be capable of both answers, or the
// cases above are all passing for the wrong reason.
ok(VENUE_CASES.some(([i]) => pickVenueLabel(i) !== null), "PROBE BROKEN: pickVenueLabel names nothing at all");
ok(VENUE_CASES.some(([i]) => pickVenueLabel(i) === null), "PROBE BROKEN: pickVenueLabel never refuses");

// EVERY real pick that can reach this path must be nameable or explicitly not.
// A pick with a curated viatorUrl is the only input this label ever sees.
for (const slug of slugs) {
  for (const p of (GUIDES[slug].picks || [])) {
    if (!p || !p.viatorUrl) continue;
    const v = pickVenueLabel(p.name);
    ok(v === null || !/[:\u2014\u2013]/.test(v),
      `${slug}: pick ${JSON.stringify(p.name)} yields ${JSON.stringify(v)} — an editorial suffix must never reach the label`);
  }
}

// 8b. THE WIRING. pickVenueLabel is driven directly above with ten cases, but
//     the exact branch that CONSUMES it cannot be reached offline: verifiedUrl
//     needs NEXT_PUBLIC_VIATOR_PID, which lib/affiliates reads at module load,
//     so no guide resolves exact without it. This is therefore a POSITION check
//     and is weaker than a call — stated plainly so it reads as weaker.
const cta_src = readFileSync(REPO + "lib/guideCta.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
ok(/const\s+venue\s*=\s*exact\s*\?\s*pickVenueLabel\(/.test(cta_src),
  "the exact branch must derive its name through pickVenueLabel");
ok(!/See tickets for \$\{p\.name\}/.test(cta_src),
  "the exact label must never interpolate the raw pick name — that is the shipped bug");
ok(/See tickets & availability/.test(cta_src),
  "an unnameable venue must fall back to a label that names nothing");

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
