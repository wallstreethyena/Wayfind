#!/usr/bin/env node
// test-primary-cta-gap — locks the redefined primary_cta_null (2026-11-20).
//
// EVIDENCE (PostHog 2026-11-19 ET): 311 primary_cta_null per 372 detail_open. The event fired on
// mount for every non-monetized sheet, before the website verdict / reserve list / tours had
// resolved, so it counted Official site, See admission and Ask about a table as "nothing". Real
// terminals logged: directions for 228 restaurants, 148 bars, 81 cafes, 20 hotels, 14 museums...
//
// This runs the REAL ladder (lib/detailCta.js resolveDetailCta) with production-shaped rows read
// from wf_inventory (place_id, primary_type, google_types) for the places named in the report, and
// asserts primaryCtaGap() on the finished CTA. Nothing here invents a partner id, product or URL:
// the only partner product exercised is a founder-verified registry row and a verified-hotel row
// read from the shipped data files.
import { readFileSync } from "node:fs";
import { resolveDetailCta, primaryCtaGap, CTA_GAP_REASONS, DETAIL_CTA_TYPES } from "../lib/detailCta.js";
import { hotelBookingRecords } from "../lib/hotelBookingVerification.js";
import { PLACE_PARTNER_PICKS } from "../lib/placePartnerPicks.js";

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL: " + m); } };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Production shapes (wf_inventory, 2026-11-20): id = place_id, types = google_types, primaryType = primary_type.
const P = (id, name, category, primaryType, types, extra = {}) => ({ id, name, category, primaryType, types, ...extra });
const ATTR = {
  snowcat: P("wfadd_snowcat_ridge_dade_city", "Snowcat Ridge Alpine Snow Park", "attractions", "amusement_park", ["amusement_park", "tourist_attraction", "point_of_interest", "establishment"]),
  jungle: P("ChIJ_37IauQ_w4gRz03lc0QInIE", "Sarasota Jungle Gardens", "attractions", "zoo", ["zoo", "tourist_attraction", "botanical_garden", "point_of_interest", "establishment"]),
  mote: P("ChIJRyOEfAo5w4gR664aD_YYBLU", "Mote Science Education Aquarium (SEA)", "attractions", "aquarium", ["aquarium", "point_of_interest", "establishment"]),
  selby: P("ChIJPTvxtmpAw4gReToYD5mTNwE", "Marie Selby Botanical Gardens Downtown Sarasota", "attractions", "botanical_garden", ["botanical_garden", "tourist_attraction", "museum", "point_of_interest", "establishment"]),
  chronos: P("ChIJ6x03AQB_54gRcGfGXDnqv9E", "Chronos Tower", "attractions", "tourist_attraction", ["tourist_attraction", "point_of_interest", "establishment"]),
};
const singer = P("ChIJ7_YlkOzU2IgRI_h_VJyHP2o", "The Singer Oceanfront Resort, Curio Collection by Hilton", "hotels", "hotel", ["hotel", "resort_hotel", "lodging", "point_of_interest", "establishment"], { address: "3800 N Ocean Dr, Singer Island, FL 33404, USA", lat: 26.79, lng: -80.03 });
const FOOD = {
  onSwann: P("ChIJ5crCip3EwogRQnhkbw_Ir6U", "On Swann", "food", "american_restaurant", ["american_restaurant", "restaurant", "food", "point_of_interest", "establishment"]),
  blueGiraffe: P("ChIJ0USuYfYw24gRsMQjHPYIz7o", "Blue Giraffe Island Bar and Grill", "food", "restaurant", ["restaurant", "bar_and_grill", "breakfast_restaurant", "bar", "point_of_interest", "food", "establishment"]),
  keysSteak: P("ChIJDTUi27je0IgR2CcOLyLY49o", "Florida Keys Steak and Lobster House", "food", "steak_house", ["steak_house", "restaurant", "food", "point_of_interest", "establishment"]),
  americanSocial: P("ChIJzyHjx5LEwogRuGs9V-RMHrA", "American Social - Bar & Kitchen", "food", "american_restaurant", ["american_restaurant", "sports_bar", "brunch_restaurant", "bar", "restaurant", "point_of_interest", "food", "establishment"]),
  zoto: P("ChIJJYDKlHM5w4gRpCS0kh1pDG8", "Zōtō", "food", "japanese_restaurant", ["japanese_restaurant", "restaurant", "food", "point_of_interest", "establishment"]),
  sifu: P("ChIJq19C-PK72YgRlgO2-QusVy0", "SiFÚ DORAL", "food", "seafood_restaurant", ["seafood_restaurant", "soup_restaurant", "breakfast_restaurant", "restaurant", "food", "point_of_interest", "establishment"]),
  bonefish: P("ChIJg7FbHLJBw4gRopVXpogJqQ4", "Bonefish Grill", "food", "seafood_restaurant", ["seafood_restaurant", "californian_restaurant", "bar_and_grill", "brunch_restaurant", "meal_takeaway", "american_restaurant", "catering_service", "wine_bar", "food_delivery", "bar", "service", "restaurant", "food", "point_of_interest", "establishment"]),
  coopers: P("ChIJg3dcWgZHw4gRXN7pMNzP_pA", "Cooper’s Hawk Winery & Restaurant", "food", "american_restaurant", ["american_restaurant", "wine_bar", "bar", "restaurant", "food", "point_of_interest", "establishment"]),
  donJulio: P("ChIJaSlJnIVn54gR_f9Ru5W-BaU", "Don Julio Mexican Kitchen - Waterford lakes", "food", "mexican_restaurant", ["mexican_restaurant", "bar", "restaurant", "point_of_interest", "food", "establishment"]),
  keke: P("ChIJfeY1tNk4w4gRNX1FjX6p6xo", "Keke's Breakfast Cafe", "food", "breakfast_restaurant", ["breakfast_restaurant", "family_restaurant", "brunch_restaurant", "diner", "cafe", "american_restaurant", "restaurant", "point_of_interest", "food", "establishment"]),
  patricks: P("ChIJqSpP-xJAw4gRkdxPyFzB5lc", "Patricks 1481", "food", "restaurant", ["restaurant", "soul_food_restaurant", "steak_house", "family_restaurant", "brunch_restaurant", "seafood_restaurant", "sandwich_shop", "meal_takeaway", "american_restaurant", "point_of_interest", "food", "establishment"]),
  highball: P("ChIJ-5e_t_1954gR8tCh-RxplfA", "Highball & Harvest", "food", "american_restaurant", ["american_restaurant", "restaurant", "food", "point_of_interest", "establishment"]),
};
const SITE = "https://example-venue.test/";
const run = (detail, kind, over = {}) => {
  const cta = resolveDetailCta({ detail, kind, viaTours: { [detail.id]: { loading: false, items: [] } }, locName: "Sarasota, FL", offers: {}, openState: true, ...over });
  return { cta, gap: primaryCtaGap({ detail, primaryCta: cta }) };
};

// ── 1. Attractions: no partner product exists for them, so the honest outcomes are
//       Official admission (verified site) or Directions. Neither is a silent "nothing".
for (const [k, kind] of [["snowcat", "entertainment"], ["jungle", "wildlife"], ["mote", "wildlife"], ["selby", "museum"]]) {
  const p = ATTR[k];
  const withSite = run(p, kind, { websiteHref: SITE });
  ok(withSite.cta.type === DETAIL_CTA_TYPES.admission && withSite.cta.monetized === false, `${p.name}: verified site gives See admission (got ${withSite.cta.type})`);
  ok(withSite.gap === null, `${p.name}: a correct See admission is NOT a primary_cta_null`);
  const bare = run(p, kind);
  ok(bare.cta.type === DETAIL_CTA_TYPES.directions && bare.cta.actionSource === "fallback_directions", `${p.name}: no verified site and no product stays on Directions`);
  ok(bare.gap === CTA_GAP_REASONS.attraction, `${p.name}: Directions-only on a ticketed attraction IS the gap, reason ${bare.gap}`);
}
{
  const c = run(ATTR.chronos, "landmark", { websiteHref: SITE });
  ok(c.cta.type === DETAIL_CTA_TYPES.directions, "Chronos Tower: no ticket evidence, Directions is correct (nothing invented)");
}

// ── 2. Hotel: the fail-closed gate stays. Unverified hotel -> Directions + lodging_booking_unverified.
{
  const r = run(singer, "hotel");
  ok(r.cta.type === DETAIL_CTA_TYPES.directions && r.cta.monetized === false, "Singer Oceanfront: no stored Stay22 verification, no Check rates (owner rule 2026-09-23)");
  ok(r.gap === CTA_GAP_REASONS.lodgingUnverified, `Singer Oceanfront: the gap names WHY (${r.gap})`);
  const rec = hotelBookingRecords().find((x) => x.placeId);
  const verified = P(rec.placeId, "Verified Control Hotel", "hotels", "hotel", ["hotel", "lodging", "point_of_interest", "establishment"], { address: "1 Main St, Sarasota, FL 34236, USA", lat: 27.3, lng: -82.5 });
  const v = run(verified, "hotel");
  ok(v.cta.type === DETAIL_CTA_TYPES.rates && v.cta.monetized === true && /^\/api\/hotels\/go\?/.test(v.cta.href), "control: a hotel with a stored verification still gets Check rates through /api/hotels/go");
  ok(v.gap === null, "control: a monetized hotel is never a gap");
}

// ── 3. Restaurants and bars: the ask lane, a verified site, or (closed) a plan are all correct.
for (const [k, p] of Object.entries(FOOD)) {
  const ask = run(p, "restaurant", { reserveLane: "ask", websiteHref: SITE });
  ok(ask.cta.type === DETAIL_CTA_TYPES.reserve && ask.cta.href === "#reserve", `${p.name}: sit-down place with the ask lane gets Ask about a table`);
  ok(ask.gap === null, `${p.name}: Ask about a table is NOT a primary_cta_null`);
  const site = run(p, "restaurant", { websiteHref: SITE });
  ok(site.gap === null && site.cta.type !== DETAIL_CTA_TYPES.directions, `${p.name}: a verified site is a real action, not null (${site.cta.type})`);
  const closed = run(p, "restaurant", { openState: false });
  ok(closed.gap === null, `${p.name}: closed now shows Add to my trip, not a gap`);
  const bare = run(p, "restaurant");
  if (k === "keke" || k === "patricks") {
    // breakfast cafe / takeaway-heavy rows: whichever the ladder decides, the gap only fires for sit-down places.
    ok(bare.gap === null || bare.gap === CTA_GAP_REASONS.dining, `${p.name}: gap is null or dining_no_route only`);
  } else {
    ok(bare.gap === CTA_GAP_REASONS.dining, `${p.name}: Directions-only on a sit-down restaurant is the gap while the reserve list is unresolved (${bare.gap})`);
  }
}

// ── 4. Places that must NEVER report a gap: free, beach, cafe, retail, an event card.
{
  const beach = P("b1", "Siesta Beach", "beach", "beach", ["beach", "tourist_attraction", "natural_feature"]);
  ok(run(beach, "beach").gap === null, "beach: never a gap (beach exclusion untouched)");
  const park = P("p1", "Robinson Preserve Trailhead", "attractions", "park", ["park", "hiking_area", "point_of_interest"]);
  ok(run(park, "nature").gap === null, "free land park: never a gap");
  const freeAttr = { ...ATTR.selby, admissionTruth: { status: "FREE" } };
  const fr = run(freeAttr, "museum");
  ok(fr.cta.actionSource === "fallback_directions" && fr.gap === null, "verified-free attraction: Directions is correct, never a gap");
  const coffee = P("c1", "Corner Coffee", "food", "coffee_shop", ["coffee_shop", "cafe", "food", "point_of_interest"]);
  ok(run(coffee, "cafe").gap === null, "cafe: never a gap");
  const shop = P("s1", "Some Boutique", "shopping", "clothing_store", ["clothing_store", "store", "point_of_interest"]);
  ok(run(shop, "shopping").gap === null, "retail: never a gap");
  ok(primaryCtaGap({ detail: { ...ATTR.jungle, _event: { name: "x" } }, primaryCta: { type: "directions", monetized: false, actionSource: "fallback_directions" } }) === null, "event detail: never a gap");
  ok(primaryCtaGap({ detail: ATTR.jungle, primaryCta: { type: "tickets", monetized: true, actionSource: "partner_exact" } }) === null, "monetized: never a gap");
}

// ── 5. A founder-verified registry pick still wins and is not a gap (control that the ladder is unchanged).
{
  const row = PLACE_PARTNER_PICKS.find((r) => r.provider === "viator" && r.placeIds && r.placeIds.length);
  const pinned = P(row.placeIds[0], row.aliases[0], "attractions", "tourist_attraction", ["tourist_attraction", "park"]);
  const r = run(pinned, "nature");
  ok(r.cta.actionSource === "partner_exact" && r.cta.monetized === true && r.gap === null, "control: registry pin still resolves partner_exact and is never a gap");
}

// ── 6. Wiring: Detail.js fires through primaryCtaGap, after settle, once; guides are tagged apart.
{
  const detail = strip(readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8"));
  const guide = strip(readFileSync(new URL("../app/guides/[slug]/GuideConversion.js", import.meta.url), "utf8"));
  ok(!/!primaryCta\.monetized\)\s*logEvent\("primary_cta_null"/.test(detail), "Detail.js no longer fires primary_cta_null on mount for every non-monetized sheet");
  const calls = detail.match(/logEvent\("primary_cta_null"/g) || [];
  ok(calls.length === 2, `Detail.js has exactly 2 primary_cta_null emit sites (true null + gap), found ${calls.length}`);
  ok(/primaryCtaGap\(\{/.test(detail) && /ctaInputsSettled/.test(detail), "Detail.js computes the gap with primaryCtaGap and gates it on ctaInputsSettled");
  ok(/!ctaGap \|\| !ctaInputsSettled/.test(detail) && /ctaGapFiredFor/.test(detail), "the gap event waits for settle and fires once per place");
  ok(/gap_reason: ctaGap/.test(detail) && /surface: "detail"/.test(detail), "the gap event carries gap_reason and surface=detail");
  ok(/track\("primary_cta_null", \{ surface: "guide"/.test(guide), "GuideConversion tags its primary_cta_null surface=guide so it is never summed with place gaps");
}

if (fail) { console.error(`test-primary-cta-gap: FAIL — ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`test-primary-cta-gap: OK — ${pass} assertions (real ladder, production-shaped rows for 5 attractions, 1 hotel, ${Object.keys(FOOD).length} restaurants)`);
