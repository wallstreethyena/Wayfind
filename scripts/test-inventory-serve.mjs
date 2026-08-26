// test-inventory-serve — the pure logic behind the 429 -> wf_inventory fallback
// (lib/inventoryServe.js): mapping a wf_inventory row into the Google Places
// (New) shape the client renders, and the geo-filter + quality rank. Fixtures
// match the real wf_inventory row shape (signals.{rating,reviews,priceNum},
// google_types, status, photo_ref).
import { invRowToPlace, rankInventory, distMeters, VIRTUAL_CATS } from "../lib/inventoryServe.js";

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; if (!c) console.log("FAIL " + n); };

// ── invRowToPlace: wf_inventory row -> Google (New) resource shape ──
{
  const p = invRowToPlace({ place_id: "g_ritz", name: "The Ritz-Carlton, Sarasota", lat: 27.33, lng: -82.55, signals: { rating: 4.6, reviews: 2000, priceNum: 4 }, google_types: ["hotel", "lodging"], editorial: "Waterfront luxury.", photo_ref: "places/g_ritz/photos/abc", status: "OPERATIONAL" });
  ok("id = place_id", p.id === "g_ritz");
  ok("displayName.text = name", p.displayName.text === "The Ritz-Carlton, Sarasota");
  ok("location has latitude/longitude", p.location.latitude === 27.33 && p.location.longitude === -82.55);
  ok("rating/userRatingCount mapped", p.rating === 4.6 && p.userRatingCount === 2000);
  ok("priceNum 4 -> PRICE_LEVEL_VERY_EXPENSIVE", p.priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE");
  ok("types = google_types", JSON.stringify(p.types) === JSON.stringify(["hotel", "lodging"]));
  ok("editorial -> editorialSummary.text", p.editorialSummary.text === "Waterfront luxury.");
  ok("photo_ref -> photos[{name}] (client getURI builds the media URL)", p.photos[0].name === "places/g_ritz/photos/abc");
  ok("provenance marker set", p._wfInventory === true);
  ok("businessStatus mapped", p.businessStatus === "OPERATIONAL");
}
{
  const p = invRowToPlace({ place_id: "x", name: "No Signals Inn", lat: 27.3, lng: -82.5, signals: null, google_types: null });
  ok("missing signals -> rating null, reviews 0", p.rating === null && p.userRatingCount === 0);
  ok("no priceNum -> no priceLevel key", !("priceLevel" in p));
  ok("no photo -> no photos key", !("photos" in p));
  ok("null types -> []", Array.isArray(p.types) && p.types.length === 0);
}
{
  const p = invRowToPlace({ place_id: "cafe1", name: "Parrish Coffee", lat: 27.5, lng: -82.4, signals: { rating: 4.5, reviews: 80 }, google_types: [], primary_type: "cafe" });
  ok("empty google_types[] reuses primary_type", JSON.stringify(p.types) === JSON.stringify(["cafe"]));
  ok("primaryType rides along for identity predicates", p.primaryType === "cafe");
}
{
  const p = invRowToPlace({ place_id: "x", name: "No Type Place", lat: 27.3, lng: -82.5, signals: null, google_types: [], primary_type: null, category: "food" });
  ok("category is not invented into types", Array.isArray(p.types) && p.types.length === 0);
}

// ── rankInventory: geo-filter + rank + cap ──
const C = { lat: 27.34, lng: -82.53 };
const rows = [
  { place_id: "near_best", name: "Near Best", lat: 27.34, lng: -82.54, signals: { rating: 4.7, reviews: 3000 }, status: "OPERATIONAL" },
  { place_id: "near_ok", name: "Near OK", lat: 27.35, lng: -82.53, signals: { rating: 4.1, reviews: 400 }, status: "OPERATIONAL" },
  { place_id: "far", name: "Far Away", lat: 28.5, lng: -82.53, signals: { rating: 4.9, reviews: 9000 }, status: "OPERATIONAL" }, // ~130km north
  { place_id: "closed", name: "Closed Place", lat: 27.34, lng: -82.535, signals: { rating: 4.8, reviews: 5000 }, status: "CLOSED_PERMANENTLY" },
  { place_id: "no_geo", name: "No Coords", lat: null, lng: null, signals: { rating: 5, reviews: 1 }, status: "OPERATIONAL" },
];
{
  const out = rankInventory(rows, C.lat, C.lng, 27000, 20);
  const ids = out.map((p) => p.id);
  ok("far place beyond the radius is dropped", !ids.includes("far"));
  ok("closed place is dropped", !ids.includes("closed"));
  ok("place with no coords is dropped", !ids.includes("no_geo"));
  ok("two near operational places kept", ids.length === 2 && ids.includes("near_best") && ids.includes("near_ok"));
  ok("higher quality ranks first", ids[0] === "near_best");
  ok("output is Google-shaped (displayName.text)", out[0].displayName.text === "Near Best");
}
// ── v8.60: rankInventory ranks by the WAYFIND SCORE, not rating*20 ──────────
// The old formula gave rating 100 of ~120 points and review count at most 20,
// so a 5.0 from four reviews scored 100.04 - level with a 5.0 backed by three
// thousand, and ahead of a proven 4.6. Owner screenshot, Parrish > Family >
// Kids, 2026-08-26: "Renaissance Event Center", 4 reviews, in a kids list.
// The Bayesian blend pulls thin ratings toward the 3.9 baseline, and it is the
// same number the card renders - so the shelf and the chip finally agree.
{
  const thin = { place_id: "thin5", name: "Thin Five", lat: 27.34, lng: -82.531, signals: { rating: 5, reviews: 4 }, status: "OPERATIONAL" };
  // 4.3/600 is chosen deliberately: it is the band where the two formulas
  // DISAGREE. old = 92.00 vs the thin row's 100.04 (thin wins, wrong);
  // wayfindScore = 85 vs 79 (proven wins, right). A 4.6/1337 fixture would
  // pass under BOTH formulas and prove nothing - measured before it was used.
  const proven = { place_id: "proven43", name: "Proven 4.3", lat: 27.34, lng: -82.531, signals: { rating: 4.3, reviews: 600 }, status: "OPERATIONAL" };
  const ids = rankInventory([thin, proven], C.lat, C.lng, 27000, 20).map((p) => p.id);
  ok("a proven 4.3 outranks a 5.0 with four reviews", ids[0] === "proven43");

  // …and the cap is where it actually bites: with one slot, the thin 5.0 must
  // not be the row that survives.
  const one = rankInventory([thin, proven], C.lat, C.lng, 27000, 1).map((p) => p.id);
  ok("the single surviving slot goes to the proven place", one.length === 1 && one[0] === "proven43");

  // An unrated row is dropped upstream of the rank (measured, not assumed), so
  // it can never reach a shelf on a phantom number - the defect
  // lib/wayfindScore.js's header records for landing.js cannot occur here.
  const unrated = { place_id: "unrated", name: "Unrated", lat: 27.34, lng: -82.531, signals: { rating: null, reviews: 0 }, status: "OPERATIONAL" };
  const withUnrated = rankInventory([unrated, proven], C.lat, C.lng, 27000, 20).map((p) => p.id);
  ok("an unrated row never reaches the shelf", withUnrated.length === 1 && withUnrated[0] === "proven43");
}
{
  const out = rankInventory(rows, C.lat, C.lng, 27000, 1);
  ok("n cap respected (n=1 -> 1 result)", out.length === 1 && out[0].id === "near_best");
}
{
  ok("distMeters ~0 for same point", distMeters(27.34, -82.53, 27.34, -82.53) < 1);
  ok("distMeters ~111km for 1deg lat", Math.abs(distMeters(27, -82, 28, -82) - 111000) < 2000);
}

// ── v6.34 VIRTUAL family category: attractions rows through family contracts ──
// (The July 15 outage: Family 502'd while every physical category served from
// inventory. Family must serve kid-appropriate attractions, never nightlife.)
{
  const fam = VIRTUAL_CATS.family;
  ok("family virtual category exists and maps to attractions", !!fam && fam.base === "attractions");
  ok("zoo row passes the family gate", fam.keep({ name: "ZooTampa at Lowry Park", google_types: ["zoo", "tourist_attraction"] }));
  ok("empty google_types + primary_type=zoo still passes family", fam.keep({ name: "Regional Zoo", google_types: [], primary_type: "zoo" }));
  ok("stored category food does not pass family without types", !fam.keep({ name: "Acme Holdings", google_types: [], category: "food" }));
  ok("children's museum passes by name alone", fam.keep({ name: "The Children's Museum of Sarasota", google_types: [] }));
  ok("trampoline park passes", fam.keep({ name: "Bounce Kingdom Trampoline Park", google_types: ["amusement_center"] }));
  ok("night club never serves family", !fam.keep({ name: "Neon Nights", google_types: ["night_club"] }));
  ok("liquor store never serves family", !fam.keep({ name: "ABC Liquor", google_types: ["liquor_store"] }));
  ok("office park never serves family (park in name is not enough)", !fam.keep({ name: "Regus Office Park", google_types: ["office"] }));
}

console.log(`\ntest-inventory-serve: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log("test-inventory-serve: OK — row->Google-shape mapping, geo gate, closed-drop, quality rank, n-cap, and the family virtual category all hold");
