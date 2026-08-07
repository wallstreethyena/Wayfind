#!/usr/bin/env node
/**
 * test-composition-render — MOUNT the shared list composition, don't grep it.
 *
 * This is the mandatory render half of the extraction guard pair (CLAUDE.md,
 * "Extraction PRs"). v6.72 moved two things between modules:
 *   - the coupon strip / "Perfect right now" / methodology markup, out of
 *     app/components/screens/Experience.js into app/components/ExperienceBlocks.js
 *   - ViatorRail, out of app/home.js (where it was a local function closing over
 *     logEvent and openExternal) into app/components/ViatorRail.js
 *
 * That is the same move that took the site down on 2026-07-30: #486 lifted a
 * helper out, left a call site behind, and every place-detail render threw a
 * ReferenceError while SIX checks reported green. The one property all six
 * shared was that nothing ever CALLED the component. So this calls them.
 *
 * IT ALSO LOCKS THE ORDER. The composition is monetization-first — offer,
 * bookable, reasoned, browse — and that order is the whole reason it works. A
 * refactor that renders the list before the coupon strip is not a style change,
 * it is a revenue change, so the order is asserted on the RENDERED OUTPUT by
 * comparing the index at which each block's text appears.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

const Blocks = await loadComponent(path.join(ROOT, "app/components/ExperienceBlocks.js"), ROOT);
const RailMod = await loadComponent(path.join(ROOT, "app/components/ViatorRail.js"), ROOT);
const ViatorRail = RailMod.default;

// ── the exports exist and are components ────────────────────────────────────
for (const nm of ["default", "CouponStrip", "PerfectRightNow", "Methodology"]) {
  ok(typeof Blocks[nm] === "function", `ExperienceBlocks must export ${nm} as a component (got ${typeof Blocks[nm]})`);
}
ok(typeof ViatorRail === "function", "ViatorRail must have a default-exported component");
ok(typeof Blocks.METHODOLOGY_LINE === "string" && Blocks.METHODOLOGY_LINE.length > 60,
  "METHODOLOGY_LINE must be the real sentence, exported for reuse");

const render = (el) => renderToStaticMarkup(el);

// ── 1. HONEST DEGRADATION — every block absent, never a placeholder ─────────
// The owner's rule: "no coupons for this metro/intent -> the strip is absent,
// not empty. No tours -> no rail. No momentPicks -> no section. Never a
// placeholder, never filler." Each of these renders EMPTY STRING or it fails.
ok(render(createElement(Blocks.CouponStrip, { intentId: null })) === "",
  "CouponStrip with no intent must render NOTHING, not an empty card");
ok(render(createElement(Blocks.CouponStrip, { intentId: "no-such-intent-xyz" })) === "",
  "CouponStrip with an intent that has no live deals must render NOTHING");
ok(render(createElement(Blocks.PerfectRightNow, { picks: null, places: [] })) === "",
  "PerfectRightNow with no picks must render NOTHING");
ok(render(createElement(Blocks.PerfectRightNow, { picks: [{ id: "a", why: "x" }], places: [] })) === "",
  "PerfectRightNow whose picks resolve to no known place must render NOTHING (half a row is worse than no row)");
ok(render(createElement(ViatorRail, { title: "T", items: [] })) === "",
  "ViatorRail with no tours must render NOTHING");
ok(render(createElement(ViatorRail, { title: "T", items: null })) === "",
  "ViatorRail with null tours must render NOTHING");

// ── 1b. THE GEO GATE — a Sarasota deal must never render in Orlando ────────
// THE BUG THIS LOCKS (live-verified 2026-07-31, found by loading the page and
// looking at it — no source-reading guard could see it): the coupon strip
// filtered by INTENT only. On /tonight and /date-night for ORLANDO it rendered
// "Bradenton Marauders", "Gecko's Grill — Lakewood Ranch" and "Clipp — dining
// certificates in Sarasota". Those are 130 miles away. The owner's brief names
// this exact failure as the standard for an unacceptable recommendation.
//
// Asserted by RENDERING at two real coordinates and diffing the output, not by
// reading the filter.
const ORLANDO = { lat: 28.54, lng: -81.38 };
const SARASOTA = { lat: 27.34, lng: -82.53 };
const orl = render(createElement(Blocks.CouponStrip, { intentId: "nightout", ...ORLANDO }));
const sar = render(createElement(Blocks.CouponStrip, { intentId: "nightout", ...SARASOTA }));
ok(!/Bradenton|Sarasota|Lakewood Ranch/.test(orl),
  "GEO: an Orlando coupon strip must not name a Sarasota-Manatee business — this is the 'Sarasota deal in Orlando' class");
// The positive control derives the expected names FROM THE LIVE REGISTRY
// rather than freezing three token strings. The frozen form went red on
// 2026-08-07 when the Clipp per-merchant harvest added Bradenton/Palmetto
// nightout inventory that expires sooner than Gecko's — the strip correctly
// showed the NEW regional deals, and the hardcoded /Bradenton|Sarasota|Gecko/
// list simply didn't know their names. The invariant was always "a Sarasota
// viewer sees sarasota-metro inventory", so assert exactly that: at least one
// business whose dealScope resolves to the sarasota metro is in the render.
{
  const { couponsForIntent } = await import(path.join(ROOT, "lib/coupons.js"));
  const { dealScope } = await import(path.join(ROOT, "lib/dealSheet.js"));
  const sarNames = couponsForIntent("nightout")
    .filter((c) => dealScope(c).metro === "sarasota")
    .map((c) => String(c.business));
  ok(sarNames.length > 0,
    "GEO positive control has sarasota-metro nightout inventory to look for — an empty list would make the next assertion vacuous");
  ok(sarNames.some((n) => n && sar.includes(n)),
    "GEO: the Sarasota strip MUST still show its own regional deals — the gate must not be a mute (positive control)");
}
// NO LOCATION: main's rule is that an unknown viewer does NOT filter — every
// live deal for the intent shows. This test locks THAT, not a preference.
//
// I think unknown-location should fall back to nationwide-only ("absent beats
// wrong" is the rule everywhere else in this composition), but that is a
// PRODUCT change to behaviour another lane shipped on main in #526, and an
// extraction is not the place to make it silently. Raised for the owner
// instead; if it changes, this assertion flips with it.
const noloc = render(createElement(Blocks.CouponStrip, { intentId: "eatnow" }));
ok(noloc.includes("Local deals on this list"),
  "GEO: with no viewer location the strip still renders — matching main's shipped rule (unknown viewer does not filter)");

// ── 2. THE BLOCKS ACTUALLY RENDER THEIR CONTENT ────────────────────────────
// A component that renders "" for every input would pass section 1 completely.
// These are the positive controls that make the absence assertions meaningful.
const picks = [
  { id: "p1", why: "Quiet at this hour and five minutes away" },
  { id: "p2", why: "Open and nearby" },
];
const alwaysOpen = { periods: [{ open: { day: 0, hour: 0 }, close: { day: 0, hour: 0 } }] };
const places = [
  { id: "p1", name: "Ortygia", rating: 4.7, reviews: 900, distMi: 2.1, oh: alwaysOpen, utcOffset: 0 },
  { id: "p2", name: "Second place", rating: 4.6, reviews: 700, distMi: 3.2, oh: alwaysOpen, utcOffset: 0 },
];
const pr = render(createElement(Blocks.PerfectRightNow, { picks, places, durablePlaces: [places[1], places[0]] }));
ok(pr.includes("Right now"), "PerfectRightNow renders its heading when it has data");
ok(pr.includes("Ortygia"), "PerfectRightNow renders the place NAME");
ok(pr.includes("2.1 miles away"), "PerfectRightNow derives a current distance reason instead of trusting generic API copy");
ok(/>1</.test(pr), "PerfectRightNow renders the rank number");
ok(render(createElement(Blocks.PerfectRightNow, { picks: picks.slice(0, 1), places, durablePlaces: [places[1]] })) === "",
  "PerfectRightNow suppresses a single result because one card is not a shortlist");

const tours = [{ code: "T1", url: "https://www.viator.com/tours/x", title: "Sunset sail", rating: 4.8, reviews: 200, fromPrice: 65, duration: "2h" }];
const rail = render(createElement(ViatorRail, { title: "Top-rated experiences", items: tours }));
ok(rail.includes("Sunset sail"), "ViatorRail renders the tour title");
ok(rail.includes("Top-rated experiences"), "ViatorRail renders its title");
// FTC + attribution, both load-bearing. v6.44: this rail once rendered a raw
// t.url while its sibling wrapped the identical payload, so every booking from
// that surface earned nothing.
ok(/rel="noopener sponsored nofollow"/.test(rail), "ViatorRail keeps sponsored/nofollow affiliate rel metadata");
ok(/may earn a commission/.test(rail), "ViatorRail keeps the commission disclosure");
// THE REVENUE HOLE. The UI must link to Wayfind's own redirect, not a partner
// domain. That redirect records the click, validates the destination and keeps
// click_id joinable through to provider_redirect_started.
const decodeEntities = (s) => String(s)
  .replace(/&(?:quot|#34|#x22);/gi, '"')
  .replace(/&(?:apos|#39|#x27);/gi, "'")
  .replace(/&(?:lt|#60|#x3c);/gi, "<")
  .replace(/&(?:gt|#62|#x3e);/gi, ">")
  .replace(/&(?:amp|#38|#x26);/gi, "&");
const { commerceHref } = await import(path.join(ROOT, "lib/commerce.js"));
const expectedHref = commerceHref({ provider: "viator", offerId: "T1", surface: "viator_rail" });
const renderedHrefs = [...rail.matchAll(/href="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
ok(renderedHrefs.includes(expectedHref),
  `ViatorRail must route through /api/commerce/go. Expected href="${expectedHref}", rendered ${JSON.stringify(renderedHrefs)}`);
// The decoder is load-bearing for the assertion above, so it is proven both ways
// rather than trusted: it must undo React's escaping, and must not mangle a url
// that never had any.
ok(decodeEntities("a?x=1&amp;y=2") === "a?x=1&y=2", "self-test: decodeEntities undoes React's &amp; escaping");
ok(decodeEntities("a?x=1&y=2") === "a?x=1&y=2", "self-test: decodeEntities leaves an unescaped url untouched");
ok(!renderedHrefs.some((href) => /^https?:\/\/(?:www\.)?viator\.com/i.test(href)), "the rail never exposes a raw Viator destination");

const meth = render(createElement(Blocks.Methodology));
ok(meth.includes("No ads, no paid placement"), "Methodology renders the trust claim");

// ── 3. THE ORDER IS MONETIZATION-FIRST ─────────────────────────────────────
// Asserted on rendered OUTPUT positions, not on the source. A reorder in JSX
// that happens to keep every block present would pass a source grep and fail
// here, which is the point.
const FakeRail = ({ title }) => createElement("div", null, "RAILMARK:" + title);
const full = render(createElement(Blocks.default, {
  intentId: "eatnow", ...SARASOTA,
  showTours: true, ViatorRail: FakeRail, tours: [{ code: "x" }], toursTitle: "Bookable",
  momentPicks: picks, places, durablePlaces: [places[1], places[0]],
  rows: places,
  renderRow: (p) => createElement("div", { key: p.id }, "ROWMARK:" + p.name),
  loading: false,
  onOpenCoupons: () => {},
}));

const at = (needle) => full.indexOf(needle);
const iCoupon = at("Local deals on this list");
const iRail = at("RAILMARK:");
const iPicks = at("Right now");
const iRow = at("ROWMARK:");
const iMeth = at("No ads, no paid placement");

ok(iCoupon >= 0, "the full composition renders the coupon strip when the intent has live deals");
ok(iRail >= 0, "the full composition renders the tour rail when tours are present");
ok(iPicks >= 0, "the full composition renders Right now");
ok(iRow >= 0, "the full composition renders the list rows through the renderRow seam");
ok(iMeth >= 0, "the full composition renders the methodology line");

ok(iCoupon < iRail, "ORDER: the coupon strip (the offer) comes before the bookable rail");
ok(iRail < iPicks, "ORDER: the bookable rail comes before the reasoned picks");
ok(iPicks < iRow, "ORDER: the reasoned picks come before the browse list");
ok(iCoupon < iRow, "ORDER: monetization blocks precede the list — this is the whole thesis");

// The one documented divergence between the brief and the reference: the
// reference renders methodology ABOVE the list. Locked so a future edit has to
// be deliberate about which reading it is implementing.
ok(iMeth < iRow, "ORDER: methodology sits above the list, matching the reference implementation (see the header note in ExperienceBlocks.js)");
const last = render(createElement(Blocks.default, {
  intentId: "eatnow", rows: places, renderRow: (p) => createElement("div", { key: p.id }, "ROWMARK:" + p.name),
  loading: false, methodologyLast: true,
}));
ok(last.indexOf("No ads, no paid placement") > last.indexOf("ROWMARK:"),
  "methodologyLast:true moves it below the list — the escape hatch works if the owner confirms the brief's order");

// ── 4. LOADING NEVER SHOWS A FALSE EMPTY ───────────────────────────────────
const loading = render(createElement(Blocks.default, {
  intentId: "eatnow", rows: [], renderRow: () => null, loading: true,
  emptyState: createElement("div", null, "NOTHINGFOUND"),
}));
ok(!loading.includes("NOTHINGFOUND"),
  "while loading, the empty state must NOT render — a flash of 'nothing here' during a fetch is a lie about the market");

if (fails.length) {
  console.error(`test-composition-render: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`test-composition-render: OK — ${n} assertions, every one by MOUNTING the component (5 blocks rendered, order verified on output positions, honest-degradation proven with positive controls)`);
