#!/usr/bin/env node
/**
 * check-food-tour-rail — the cuisine sheet's money surface tells the truth.
 *
 * CONTEXT THIS GUARD PROTECTS
 * Real-user monetization is 0%: 14 days of PostHog, zero non-owner clicks on any
 * monetized link, and every click event fires on CLICK — so a zero cannot be read.
 * This rail exists to make the funnel legible (impression -> click -> redirect),
 * and each property below is one way that legibility silently breaks.
 *
 * Most assertions CALL the real functions (CLAUDE.md: assert on the CALL, not the
 * string). Where a property is about JSX POSITION, which cannot be executed here
 * without rendering an async server component, the check is textual and SAYS SO in
 * its message — a weaker check that reads as weaker, rather than as proof.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const { isFoodTour, pickFoodTours, METRO_DESTS, FOOD_TOUR_RX } = await import("../lib/foodTours.js");

// ── 1. the matcher, called against real corpus strings ───────────────────
// Every positive below is a VERBATIM wf_experiences title (2026-07-30).
const POSITIVES = [
  "Taste of Downtown Sarasota : Guided Walking History & Food Tour",
  "Sarasota Kayak and Food Tour",
  "Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food Tour",
  "Historic Ybor City Food and Culture Walking Tour",
  "Customized Ybor City Private Brewery Tour by Golf Cart",
  "Orlando Distillery Tour with Tasting Experience",
  "Evening Dining Yacht Cruise in Clearwater Beach",
  "The Tour and Wine Tasting Experience at Aspirations Winery",
  // These two are why 'eats' and 'feast' are required tokens — a
  // food|culinary|tasting matcher drops both, and both are real food tours.
  "Alt Eats Tour Discover International Flavors in Columbus",
  "St. Pete Street Feast Funky Bites Street Eats and Trivia Nights",
  // Plural: an earlier draft matched winery/wine and MISSED this one.
  "VIP Full Day Wineries Tour from Istanbul",
];
for (const t of POSITIVES) ok(isFoodTour(t), `matches a real food tour: "${t.slice(0, 52)}"`);

// The word-boundary negatives. An unanchored /eat/ matches every one of the first
// four, which is how a food rail fills up with airboat rides.
const NEGATIVES = [
  "Great Explorers Airboat Ride", "Theater District Walking Tour",
  "Best Seats Stadium Tour", "Wheat Field Nature Walk",
  "ZooTampa at Lowry Park Fast Track Ticket",
  "Clearwater Beach Parasailing Adventure",
  "Everglades Holiday Park Half Day Trip from Miami",
];
for (const t of NEGATIVES) ok(!isFoodTour(t), `does NOT match a non-food tour: "${t.slice(0, 52)}"`);
ok(isFoodTour("Sarasota Food Tour") && !isFoodTour("Great Seats"),
  "the matcher both accepts and rejects — not a blanket true/false that would make every case above vacuous");

// ── 2. selection: metro scope, dead links, ordering ──────────────────────
const ROWS = [
  { dest_id: "25738", product_code: "srq-hi", title: "Taste of Downtown Sarasota Food Tour", product_url: "https://www.viator.com/a", rating: 4.7, reviews: 220, link_ok: true },
  { dest_id: "25738", product_code: "srq-new", title: "Sarasota Paddle & Taste Food Tour", product_url: "https://www.viator.com/b", rating: 5.0, reviews: 0, link_ok: true },
  { dest_id: "25738", product_code: "srq-dead", title: "Sarasota Dead Link Food Tour", product_url: "https://www.viator.com/c", rating: 5.0, reviews: 999, link_ok: false },
  { dest_id: "25738", product_code: "srq-notfood", title: "Sarasota Kayak Rental", product_url: "https://www.viator.com/d", rating: 5.0, reviews: 900, link_ok: true },
  { dest_id: "666", product_code: "tpa", title: "Tampa Food Tour", product_url: "https://www.viator.com/e", rating: 5.0, reviews: 25, link_ok: true },
  { dest_id: "663", product_code: "mco", title: "Orlando Food Tour", product_url: "https://www.viator.com/f", rating: 5.0, reviews: 47, link_ok: true },
];
const srq = pickFoodTours(ROWS, { metro: "manatee-sarasota" });
ok(srq.length === 2, `Sarasota selects exactly its own 2 eligible tours (got ${srq.length})`);
ok(srq[0].product_code === "srq-hi",
  "a 4.7 with 220 reviews outranks a 5.0 with 0 — a 5.0-with-one-review leading a money rail is how it loses trust on the first click");
ok(!srq.some((r) => r.product_code === "srq-dead"),
  "a row with link_ok=false is excluded — a known-dead link is not an offer");
ok(!srq.some((r) => r.product_code === "srq-notfood"), "a non-food tour in the same metro is excluded");
ok(!srq.some((r) => ["tpa", "mco"].includes(r.product_code)),
  "another metro's tours never leak in — drawing wider than the label is the geo/entity mismatch class that shipped Dalí→Barcelona");
ok(pickFoodTours(ROWS, { metro: "tampa" }).every((r) => r.product_code === "tpa"), "Tampa selects only Tampa-area dests");
ok(pickFoodTours(ROWS, { metro: "nowhere" }).length === 0, "an unknown metro selects nothing rather than everything");
ok(pickFoodTours([], { metro: "manatee-sarasota" }).length === 0, "no rows in, no offers out");

// The metro sets must match the labels app/eat/[metro] actually shows a user.
ok(METRO_DESTS["manatee-sarasota"].length === 1 && METRO_DESTS["manatee-sarasota"][0] === "25738",
  "Sarasota & Bradenton draws from the Sarasota dest only — not the whole bay");
ok(METRO_DESTS.tampa.includes("666") && METRO_DESTS.tampa.includes("5403") && METRO_DESTS.tampa.includes("22457"),
  "Tampa Bay covers Tampa, St. Petersburg and Clearwater, matching the label the page shows");

// ── 3. the rail component's contract ─────────────────────────────────────
const RAIL = path.resolve("app/components/FoodTourRail.js");
ok(existsSync(RAIL), "the rail component exists");
const rail = readFileSync(RAIL, "utf8");

// Comments are stripped before any "this token must not appear" check. The first
// run of this guard failed on its own documentation: the rail's header comment
// says "a viator.com literal must never appear", and the check matched that
// sentence. A prose mention is not a constructed URL.
const railCode = rail.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok(railCode.length > rail.length * 0.4, "stripping comments left the rail's code intact (an over-eager strip would make the checks below vacuous)");

// The one rule that cannot be relaxed: the UI never builds a partner URL.
ok(/commerceHref\(/.test(railCode), "the rail builds its href through commerceHref() — our own redirect path");
ok(!/viator\.com/i.test(railCode),
  "no viator.com literal in the rail's CODE: the UI must never construct a partner URL (lib/commerce.js rule 2)");

// All three events, and the impression must be viewability-gated.
for (const ev of ["commerce_impression", "commerce_cta_clicked", "disclosure_viewed"]) {
  ok(new RegExp(`emitCommerce\\(\\s*["']${ev}["']`).test(rail), `the rail emits ${ev} via emitCommerce`);
}
ok(/IntersectionObserver/.test(rail),
  "the impression is gated on IntersectionObserver, not on mount — firing on mount would count a rail below the fold as 'seen', which is exactly the lie that makes a zero click-through unreadable");
ok(/threshold/.test(rail), "the observer sets a visibility threshold rather than firing on a 1px sliver");
ok(/unobserve\(/.test(rail), "each offer is unobserved after firing — one impression per offer per view, so scrolling past twice does not inflate the denominator");
ok(/rankBucket\(/.test(railCode), "rank is bucketed (top3/4-10/11+), never a raw position beside a payout");
ok(/rel=\{?["'][^"']*sponsored/.test(rail) && /nofollow/.test(rail),
  "the offer link carries rel=sponsored nofollow — an FTC and an SEO obligation both");
ok(/if \(!list\.length\) return null/.test(rail),
  "an empty rail renders NOTHING: an empty 'tours near you' frame costs trust and would still measure as a viewed surface");
ok(/DISCLOSURE_VERSION/.test(railCode), "the disclosure carries a version, so consent evidence ties to the exact wording shown");
ok(/may earn a commission/i.test(rail) && /no extra cost to you/i.test(rail),
  "the disclosure states plainly that Wayfind may earn a commission, at no extra cost");

// ── 4. the page mounts it, above the reading column ─────────────────────
const PAGE = path.resolve("app/eat/[metro]/page.js");
const page = readFileSync(PAGE, "utf8");
ok(/<FoodTourRail[\s/>]/.test(page),
  "the sheet RENDERS <FoodTourRail> (element form, not a bare mention — a page that only imported the name would pass a /FoodTourRail/ grep)");
// The property is "the offers prop is an AWAITED value", not "the code uses
// Promise.all". The first draft asserted the latter and broke the moment the
// concurrency was expressed differently — a guard coupled to an implementation
// shape fails on refactors that preserve the very thing it protects.
ok(/foodToursFor\(/.test(page), "the sheet calls foodToursFor()");
const offersVar = (page.match(/offers=\{(\w+)\}/) || [])[1];
ok(!!offersVar, `read the binding passed to offers= (got ${offersVar || "NONE"}) — without it the await check below would be vacuous`);
ok(offersVar && new RegExp(`const\\s+${offersVar}\\s*=\\s*await\\b`).test(page),
  `the offers prop (${offersVar}) is assigned from an AWAIT — an un-awaited async read would hand the rail a Promise, render nothing forever, and never throw`);
// POSITION: textual, and stated as such. Rendering an async server component to
// assert DOM order is not available here, so this compares source offsets.
const iHero = page.indexOf("<EditorialLandingHero");
const iRail = page.indexOf("<FoodTourRail");
const iCol = page.indexOf("maxWidth: 680");
ok(iHero > -1 && iRail > -1 && iCol > -1, "found all three anchors (a missing one would make the ordering check below vacuous)");
ok(iHero < iRail && iRail < iCol,
  "SOURCE ORDER: the rail sits after the hero and before the 680px reading column, i.e. full-bleed and as high as the shared template allows. This is a TEXTUAL check on source position — it cannot prove on-screen placement, and whether the rail clears the fold on a phone is a real-device question this guard does not answer");

// The dest scoping must not silently become a geo query: every row has a NULL lat.
ok(!/[?&]lat=|lat=\$\{|milesBetween|destsWithin/.test(page.slice(page.indexOf("async function foodToursFor"), page.indexOf("export async function generateMetadata"))),
  "the food-tour read filters by dest_id, never by lat/lng — all 1,234 wf_experiences rows have a NULL lat, so a geo filter returns nothing at all, silently");
ok(/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(page) && !/SERVICE_ROLE/.test(page),
  "the read uses the ANON key: the service-role key is a legacy JWT and legacy keys 401 on every call");

// COMMISSION CANNOT REACH THE RANKER — asserted on the DATA, not on whether the
// word "commission" appears. The first draft of this check tested /commission/i
// over the rail and failed on its own FTC disclosure, which of course says
// "commission". The real property is that the offer objects handed to the rail
// carry no payout field at all, so no component downstream can sort on one.
const fnBody = page.slice(page.indexOf("async function foodToursFor"), page.indexOf("export async function generateMetadata"));
const mapped = fnBody.slice(fnBody.indexOf(".map("));
const keys = [...mapped.matchAll(/^\s*([a-zA-Z_][\w]*)\s*:/gm)].map((m) => m[1]);
ok(keys.length >= 5, `read the offer shape handed to the rail (got keys: ${keys.join(",") || "NONE"}) — an empty parse would make the next check vacuous`);
const PAYOUT = /^(commission|commission_estimate|payout|rate|revenue|epc|margin|bounty)$/i;
ok(!keys.some((k) => PAYOUT.test(k)),
  `the offer objects carry NO payout field (${keys.join(",")}) — commission cannot influence order because it is not present in the data at all (lib/commerce.js rule 1, AGENTS.md §8)`);
// And the selection function is given no payout input either.
const ft = readFileSync(path.resolve("lib/foodTours.js"), "utf8");
const ftCode = ft.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok(!/commission|payout|epc|revenue/i.test(ftCode),
  "pickFoodTours' code references no payout concept — its ordering inputs are reviews and rating only");

if (fail.length) {
  console.error("check-food-tour-rail: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-food-tour-rail: OK — ${pass} assertions (matcher called against real titles, metro scope + dead links + review ordering, impression is viewability-gated and once-per-offer, no partner URL in the UI, disclosure adjacent and versioned)`);
