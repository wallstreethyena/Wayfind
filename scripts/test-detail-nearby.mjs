// Real detail-sheet render: a Washington visitor opening Universal Orlando
// must not see Washington places described as nearby to Universal.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { detailNearbyPool, detailDistanceMi, DETAIL_NEARBY_RADIUS_MI } from "../lib/detailNearby.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const seed = { id: "ChIJvRBCrN9-54gRGZuuaCLGrQE", name: "Universal Orlando Resort", lat: 28.4743, lng: -81.4678, distMi: 758, wfScore: 94, rating: 4.7, reviews: 5000, types: ["amusement_park"], photos: [] };
const local = { id: "orlando-local", name: "Orlando Local Control", lat: 28.472, lng: -81.45, distMi: 760, wfScore: 92, rating: 4.6, reviews: 3000, types: ["amusement_park"] };
const dc = { id: "dc-museum", name: "Smithsonian Natural History", lat: 38.8913, lng: -77.0261, distMi: 0.6, wfScore: 99, rating: 4.8, reviews: 6000, types: ["museum"] };
const coast = { ...local, id: "far-florida", lat: 27.3364, lng: -82.5307 };
const snapshot = JSON.stringify([seed, local, dc]);
ok(DETAIL_NEARBY_RADIUS_MI === 8, "reuse the sheet's existing Where to go next radius");
ok(detailNearbyPool(seed, [dc, local, coast, seed]).length === 1, "exclude DC, distant Florida, and selected place");
ok(detailNearbyPool(seed, [dc, local])[0] === local, "retain original local object, score, distance, and identity");
ok(detailDistanceMi(seed, local) > 0 && detailDistanceMi(seed, local) < 2, "measure from selected venue despite far visitor distance");
ok(detailNearbyPool(local, [seed])[0] === seed, "normal nearby-place control remains admitted");
for (const invalid of [null, undefined, "", "28.4", NaN, Infinity, 91]) {
  ok(detailNearbyPool({ ...seed, lat: invalid }, [local]).length === 0, "unknown/invalid subject coordinate fails closed: " + String(invalid));
  ok(detailNearbyPool(seed, [{ ...local, lat: invalid }]).length === 0, "unknown/invalid candidate coordinate fails closed: " + String(invalid));
}
ok(detailNearbyPool(seed, [{ ...local, lng: 181 }]).length === 0, "invalid longitude fails closed");
ok(detailNearbyPool(seed, undefined).length === 0, "unloaded pool is empty");
const north = (mi, id) => ({ ...local, id, lat: seed.lat + mi / 3958.8 * 180 / Math.PI, lng: seed.lng });
const justInside = north(7.99, "inside");
const justOutside = north(8.01, "outside");
ok(detailNearbyPool(seed, [justOutside, justInside])[0] === justInside && detailNearbyPool(seed, [justOutside]).length === 0, "admission uses the actual eight-mile boundary");
ok(detailNearbyPool(seed, [justInside, local]).map((p) => p.id).join() === "inside,orlando-local", "geographic gate never reorders admitted candidates");
ok(JSON.stringify([seed, local, dc]) === snapshot, "input facts never mutate");

const root = fileURLToPath(new URL("..", import.meta.url));
const { default: DetailSheet } = await loadComponent(fileURLToPath(new URL("../app/components/sheets/Detail.js", import.meta.url)), root);
const noop = () => {};
const nothing = () => null;
function context(detail, pool, alternatives = true) {
  return {
    detail, detailExtra: null, places: pool, suggested: [], locName: "Washington, DC", commentType: "Tip",
    placeComments: {}, taInfo: {}, viaTours: {}, offers: {}, liked: {}, disliked: {}, myVotes: {}, communityVotes: {},
    placePosts: [], videos: [], venueEvents: [], galleryRef: { current: null }, noteRef: { current: null },
    insight: null, insightFull: null, insider: {}, detailContext: {}, blurbs: {},
    isBeach: () => false, placeKind: () => "entertainment", primaryCategory: () => "attractions",
    dedupePlaces: (rows) => rows, experienceBadges: () => [],
    // Ranking is injected through the sheet's existing ctx seam. Deliberately
    // accept every candidate so a removed geographic gate cannot hide behind
    // an unrelated similarity/category filter. Real UI/pool wiring is exercised.
    similarPlaces: (rows) => rows,
    betterAlternatives: (_, rows) => alternatives ? rows.map((p) => ({ p, reasons: ["closer, 760.0 mi vs 762.0"], knownFor: "" })) : [],
    relatedPicks: (rows) => rows,
    liveOpen: () => true, isSaved: () => false,
    FeaturedTag: nothing, Critter: nothing, FallbackImg: nothing,
    curatedNote: nothing, curatedFor: nothing, wayfindNotes: nothing, blurbLine: nothing,
    setDetail: noop, setLightbox: noop, logEvent: noop, openDetail: noop,
    quickSaveFavorite: noop, toggleLike: noop, toggleDislike: noop,
    sheetDragStart: noop, sheetDragMove: noop, sheetDragEnd: noop,
    formatEventDate: () => ({}), ticketUrl: (url) => url,
  };
}
const render = (detail, pool, alternatives) => renderToStaticMarkup(createElement(DetailSheet, { ctx: context(detail, pool, alternatives) }));
// A render must not accidentally turn into a provider test.
const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = () => { requests++; throw new Error("No network in detail-nearby regression"); };
try {
  const html = render(seed, [dc, local]);
  ok(html.includes("More like Universal Orlando Resort"), "actual Detail renders similarity section");
  ok(html.includes("Worth comparing nearby"), "actual Detail renders alternatives section");
  ok(html.includes(local.name), "actual Detail retains Orlando positive control");
  ok(!html.includes(dc.name), "actual Detail excludes Washington despite its higher score/shorter visitor distance");
  ok(html.includes("mi from this place"), "destination distance has explicit origin");
  ok(html.includes("closer to you, 760.0 mi vs 762.0"), "visitor comparison reason names its different origin");
  const fallback = render(seed, [dc, local], false);
  ok(fallback.includes("One of the strongest nearby") && fallback.includes(local.name) && !fallback.includes(dc.name), "comparison fallback uses same destination gate");
  const farOnly = render(seed, [dc]);
  ok(!farOnly.includes("More like ") && !farOnly.includes("Worth comparing nearby") && !farOnly.includes("One of the strongest nearby"), "no destination-local pool hides all nearby recommendation claims");
  const unknown = render({ ...seed, lat: null }, [dc, local]);
  ok(!unknown.includes("More like ") && !unknown.includes("Worth comparing nearby"), "unknown destination coordinates never fall back to visitor origin");
  ok(requests === 0, "all real renders made zero network requests");
} finally { globalThis.fetch = originalFetch; }
ok(JSON.stringify([seed, local, dc]) === snapshot, "real renders preserve shared visitor distances and scores");

// Guard registration is part of the same change; never a test nobody runs.
ok(readFileSync(new URL("./guards.txt", import.meta.url), "utf8").includes("node scripts/test-detail-nearby.mjs"), "guard runs in prebuild");
console.log(`test-detail-nearby: OK — ${checks} assertions; real Detail renders exclude the far visitor pool and preserve nearby controls, zero network`);
