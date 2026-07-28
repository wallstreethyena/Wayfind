// scripts/test-containment.mjs — prebuild gate for one-destination-one-card.
//
// The dangerous error here is a FALSE NEST: hiding a real, independently
// visitable destination inside an unrelated card. A visitor never finds it
// again. A missed nest costs one extra row. So the tests are weighted toward
// proving we do NOT over-nest.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("test-containment: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

const C = await import("../lib/venueContainment.js");
const { placeAllowed } = await import("../lib/placeFilter.js");

// Real Orlando geometry, approximate but correctly scaled: Magic Kingdom's
// core is ~1 km across; the Contemporary Resort sits ~600 m north; Universal
// Studios is ~14 km away.
const MK   = { id: "mk",  name: "Magic Kingdom Park", types: ["tourist_attraction", "amusement_park"], reviews: 90000, lat: 28.4177, lng: -81.5812 };
const SPACE= { id: "sm",  name: "Space Mountain",     types: ["tourist_attraction"], reviews: 12000, lat: 28.4189, lng: -81.5790 };
const HAUNT= { id: "hm",  name: "Haunted Mansion",    types: ["tourist_attraction"], reviews: 9000,  lat: 28.4200, lng: -81.5830 };
const TOY  = { id: "toy", name: "Once Upon a Toy",    types: ["toy_store", "store"], reviews: 1500,  lat: 28.4180, lng: -81.5805 };
const RESORT={ id: "res", name: "Disney's Contemporary Resort", types: ["lodging", "hotel"], reviews: 8000, lat: 28.4152, lng: -81.5745 };
const UNI  = { id: "uni", name: "Universal Studios Florida", types: ["tourist_attraction", "amusement_park"], reviews: 80000, lat: 28.4753, lng: -81.4680 };
const SCI  = { id: "sci", name: "Orlando Science Center", types: ["museum", "tourist_attraction"], reviews: 11000, lat: 28.5721, lng: -81.3680 };

/* ── parents and children are identified correctly ─────────────────────── */
{
  ok(C.isParentVenue(MK) === true, "a big theme park is a parent venue");
  ok(C.isParentVenue(UNI) === true, "so is Universal");
  ok(C.isParentVenue(SPACE) === false, "a ride is not a parent");
  ok(C.isParentVenue(SCI) === false, "a museum is not an enclosing venue");
  // A tiny attraction that happens to carry amusement_park must not become a
  // parent and start swallowing its neighbours.
  ok(C.isParentVenue({ name: "Tiny Fun Park", types: ["amusement_park"], reviews: 40 }) === false,
    "a low-review venue is not treated as an anchor");

  ok(C.canBeChild(SPACE) === true, "a ride can nest");
  ok(C.canBeChild(RESORT) === false, "a hotel is NEVER nested — it is its own destination");
  ok(C.canBeChild(MK) === false, "a park never nests inside another park");
  ok(C.canBeChild({ name: "Park Lot B", types: ["parking"] }) === false, "parking never nests (or appears)");
}

/* ── the actual grouping ───────────────────────────────────────────────── */
{
  const { groups, nestedIds } = C.groupByContainment([MK, SPACE, HAUNT, TOY, RESORT, UNI, SCI]);
  const top = groups.map((g) => g.place.id);

  ok(top.indexOf("sm") < 0 && top.indexOf("hm") < 0, "rides no longer appear as peer cards");
  ok(nestedIds.has("sm") && nestedIds.has("hm"), "rides are nested");
  const mkGroup = groups.find((g) => g.place.id === "mk");
  ok(!!mkGroup, "the park itself is still a top-level card");
  ok(mkGroup.children.length >= 2, "the park carries its rides as children, got " + mkGroup.children.length);

  // The three things that must NOT be swallowed.
  ok(top.indexOf("res") >= 0, "the resort hotel stays a top-level destination");
  ok(top.indexOf("uni") >= 0, "a second park 14 km away is never nested");
  ok(top.indexOf("sci") >= 0, "an unrelated museum across town stays top-level");

  // Order is presentation-only; merit ranking is decided upstream.
  ok(top[0] === "mk", "incoming rank order is preserved for top-level cards");
}

/* ── over-nesting guards ───────────────────────────────────────────────── */
{
  // Just outside the radius => independent.
  const near = { id: "n", name: "Nearby Mini Golf", types: ["tourist_attraction"], reviews: 800, lat: 28.4177, lng: -81.5812 };
  const far = Object.assign({}, near, { id: "f", lat: 28.4300, lng: -81.5812 }); // ~1.4 km north
  const r = C.groupByContainment([MK, far]);
  ok(r.groups.some((g) => g.place.id === "f"), "a place beyond the radius is NOT nested");
  const r2 = C.groupByContainment([MK, near]);
  ok(r2.nestedIds.has("n"), "a place at the park centroid IS nested");

  // With no parent in the list, nothing nests.
  const r3 = C.groupByContainment([SPACE, HAUNT, SCI]);
  ok(r3.nestedIds.size === 0, "no parent in the result set => nothing is nested");
  ok(r3.groups.length === 3, "all three stay top-level");

  // One park cannot fill the screen.
  const many = Array.from({ length: 20 }, (_, i) => ({ id: "r" + i, name: "Ride " + i, types: ["tourist_attraction"], reviews: 500, lat: 28.4177, lng: -81.5812 }));
  const r4 = C.groupByContainment([MK, ...many]);
  const g = r4.groups.find((x) => x.place.id === "mk");
  ok(g.children.length <= 6, "children are capped so one park cannot dominate, got " + g.children.length);
  ok(r4.groups.length === 1 + (20 - g.children.length), "uncapped extras stay visible as top-level rows, not silently dropped");
}

/* ── degenerate input never throws ─────────────────────────────────────── */
{
  let threw = null;
  try {
    C.groupByContainment(null); C.groupByContainment([]); C.groupByContainment([null, undefined]);
    C.groupByContainment([{ name: "No coords", types: ["tourist_attraction"] }, MK]);
    C.metresBetween(undefined, null, NaN, "x");
  } catch (e) { threw = e; }
  ok(!threw, "garbage input never throws (" + (threw && threw.message) + ")");
  ok(C.metresBetween(undefined, null, NaN, "x") === Infinity, "missing coordinates read as infinitely far, never as 0");
  // A place with no coordinates must NOT be nested (distance is Infinity).
  const r = C.groupByContainment([MK, { id: "nc", name: "No coords", types: ["tourist_attraction"], reviews: 100 }]);
  ok(r.groups.some((x) => x.place.id === "nc"), "a place without coordinates is never nested by accident");
}

/* ── the taxonomy fix this shipped alongside ───────────────────────────── */
{
  // Retail must not lead the Family tab (2026-07-28 Orlando list quality).
  for (const shop of [
    { name: "Once Upon a Toy", types: ["toy_store", "store"] },
    { name: "World of Disney", types: ["toy_store", "gift_shop", "store"] },
    { name: "The Emporium", types: ["toy_store", "gift_shop", "store"] },
  ]) {
    ok(placeAllowed("family", "all", shop) === false, "family excludes retail: " + shop.name);
    ok(placeAllowed("family", "kids", shop) === false, "family:kids excludes retail: " + shop.name);
  }
  // ...without breaking real family destinations.
  for (const good of [
    { name: "Magic Kingdom Park", types: ["tourist_attraction", "amusement_park"] },
    { name: "Orlando Science Center", types: ["museum", "tourist_attraction"] },
    { name: "Central Florida Zoo", types: ["zoo"] },
    { name: "Fun Spot America", types: ["amusement_park"] },
  ]) {
    ok(placeAllowed("family", "all", good) === true, "family still admits: " + good.name);
  }
  // Shopping keeps them — a shop is a shop, it just is not an attraction.
  ok(placeAllowed("shopping", "all", { name: "Once Upon a Toy", types: ["toy_store", "store"] }) === true,
    "toy shops still belong to Shopping");
}


/* ── local category signals (bounded, never a placement) ───────────────── */
{
  const L = await import("../lib/localCategorySignals.js");
  ok(L.MAX_LOCAL_BOOST === 8, "the boost ceiling is small enough to only break near-ties");
  for (const a of L.ARCHETYPES) {
    ok(a.boost > 0 && a.boost <= L.MAX_LOCAL_BOOST, a.key + " respects the ceiling");
    ok(typeof a.why === "string" && a.why.length > 0, a.key + " carries an honest reason string");
  }
  // Archetypes match what Orlando guides actually name.
  ok(L.localCategoryBoost({ name: "Kelly Park / Rock Springs", types: ["park"] }) > 0, "springs are recognised");
  ok(L.localCategoryBoost({ name: "Boggy Creek Airboat Adventures", types: ["tourist_attraction"] }) > 0, "airboats are recognised");
  ok(L.localCategoryBoost({ name: "Orlando Science Center", types: ["museum"] }) > 0, "the museum cluster is recognised");
  ok(L.localCategoryBoost({ name: "Dr. Phillips Center for the Performing Arts", types: ["performing_arts_theater"] }) > 0, "performing arts is recognised");
  ok(L.localCategoryBoost({ name: "Lake Eola Park", types: ["park"] }) > 0, "lakefront parks are recognised");

  // Boosts never stack.
  const multi = { name: "Lake Eola Park Museum Boat Tour Spring", types: ["museum", "park"] };
  ok(L.localCategoryBoost(multi) <= L.MAX_LOCAL_BOOST, "multiple matches never stack past the ceiling");

  // No match => no boost, and no invented reason.
  ok(L.localCategoryBoost({ name: "Joe's Dry Cleaning", types: ["laundry"] }) === 0, "an unrelated business gets nothing");
  ok(L.localCategoryReason({ name: "Joe's Dry Cleaning", types: ["laundry"] }) === null, "no match => no reason is invented");
  ok(L.localCategoryBoost(null) === 0 && L.localCategoryBoost({}) === 0, "garbage input gets no boost");

  // It must not be able to outrank merit. An 8pt nudge is smaller than the gap
  // between a strong and a weak venue on the 0-100 internal scale.
  ok(L.MAX_LOCAL_BOOST < 15, "the archetype nudge is smaller than the first-party curated boost (15)");
}


/* ── wiring: both surfaces collapse in-venue results ───────────────────── */
{
  const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
  const landing = readFileSync(join(ROOT, "lib/landing.js"), "utf8");

  ok(home.indexOf("groupByContainment") >= 0, "the in-app list groups by containment");
  ok(home.indexOf("_children") >= 0, "children ride along on the place object");
  ok(/const restView = \(\) =>|const restView = \(/.test(home), "restView is the grouped list");
  // The grouping must be fail-soft: a throw here would blank the entire feed.
  ok(/catch \(e\) \{ return restView0; \}/.test(home), "grouping failure falls back to the ungrouped list, never an empty feed");

  ok(landing.indexOf("groupByContainment") >= 0, "the ranked landing list groups too");
  ok(landing.indexOf("topLevel") >= 0, "landing renders top-level groups");
  // Structured data must describe what is actually rendered, or Google sees a
  // list that does not exist on the page.
  ok(/numberOfItems: topLevel\.length/.test(landing), "ItemList JSON-LD counts only rendered top-level cards");
  ok(!/itemListElement: list\.map/.test(landing), "JSON-LD no longer enumerates nested children as separate list items");

  // Ranking is upstream and must not be reordered by presentation.
  ok(landing.indexOf("localCategoryBoost(p)") >= 0, "the archetype boost is applied in the ranking pass, not at render");
}


/* ── complexes: real Orlando data that survived the first pass ─────────── */
{
  // Live /things-to-do/orlando (2026-07-28) showed three Universal cards at one
  // street address and three ICON Park cards, because (a) a park could never
  // nest inside a park and (b) ICON Park is typed only tourist_attraction so it
  // was never an anchor despite 51k reviews.
  const UOR  = { id: "uor",  name: "Universal Orlando Resort",     types: ["tourist_attraction", "amusement_park"], reviews: 191760, address: "6000 Universal Blvd, Orlando, FL 32819, USA", lat: 28.4750, lng: -81.4680 };
  const IOA  = { id: "ioa",  name: "Universal Islands of Adventure", types: ["tourist_attraction", "amusement_park"], reviews: 108574, address: "6000 Universal Blvd, Orlando, FL 32819, USA", lat: 28.4722, lng: -81.4704 };
  const VB   = { id: "vb",   name: "Universal Volcano Bay",        types: ["water_park"], reviews: 31729, address: "6000 Universal Blvd, Orlando, FL 32819, USA", lat: 28.4650, lng: -81.4720 };
  const ICON = { id: "icon", name: "ICON Park",                    types: ["tourist_attraction"], reviews: 51062, address: "Orlando, FL 32819, USA", lat: 28.4432, lng: -81.4690 };
  const EYE  = { id: "eye",  name: "The Orlando Eye",              types: ["tourist_attraction"], reviews: 21763, address: "8387 International Dr, Orlando, FL 32819, USA", lat: 28.4434, lng: -81.4692 };
  const SF   = { id: "sf",   name: "Orlando Starflyer",            types: ["tourist_attraction"], reviews: 2023, address: "8265 International Dr Unit c suite 108, Orlando, FL 32819, USA", lat: 28.4430, lng: -81.4688 };
  const MK2  = { id: "mk2",  name: "Magic Kingdom Park",           types: ["amusement_park"], reviews: 90000, address: "Base Dr, Lake Buena Vista, FL 32830, USA", lat: 28.4177, lng: -81.5812 };
  const EP   = { id: "ep",   name: "EPCOT",                        types: ["amusement_park"], reviews: 88000, address: "200 Epcot Center Dr, Orlando, FL 32821, USA", lat: 28.3747, lng: -81.5494 };

  ok(C.isParentVenue(ICON) === true, "a 51k-review attraction is an anchor even without a theme-park type");

  const { groups } = C.groupByContainment([UOR, IOA, VB, ICON, EYE, SF, MK2, EP]);
  const top = groups.map((g) => g.place.id);

  // The complex survives and keeps its rank; its sub-parks fold in.
  ok(top.indexOf("uor") >= 0, "the Universal complex stays a top-level card");
  const uor = groups.find((g) => g.place.id === "uor");
  ok(uor.children.some((c) => c.id === "ioa"), "Islands of Adventure folds into the resort");
  ok(uor.children.some((c) => c.id === "vb"), "Volcano Bay folds into the resort");
  ok(top.indexOf("ioa") < 0 && top.indexOf("vb") < 0, "no duplicate Universal rows remain");

  const icon = groups.find((g) => g.place.id === "icon");
  ok(!!icon && icon.children.length === 2, "ICON Park absorbs the Eye and the Starflyer");

  // THE GUARD: two comparable parks must never swallow each other.
  ok(top.indexOf("mk2") >= 0 && top.indexOf("ep") >= 0, "Magic Kingdom and EPCOT both stay top-level — peer parks never nest");

  // Direction matters. The bigger venue is always the parent, whatever the
  // iteration order — a probe on real data once made the 191k resort a child of
  // its own 108k sub-park and dropped it off the list entirely.
  ok(C.canBeChild(UOR, IOA) === false, "the larger complex is NEVER nested under its smaller sub-park");
  ok(C.canBeChild(IOA, UOR) === true, "the smaller sub-park nests under the complex");
  const reversed = C.groupByContainment([IOA, VB, UOR]);
  ok(reversed.groups.some((g) => g.place.id === "uor"), "result order cannot change who the parent is");

  // Address key normalisation.
  ok(C.addressKey(SF) === C.addressKey({ address: "8265 International Dr, Orlando, FL" }), "suite/unit noise is stripped from the address key");
  ok(C.addressKey(UOR) === C.addressKey(IOA), "same street address yields the same key");
  ok(C.addressKey(UOR) !== C.addressKey(EYE), "different streets yield different keys");
  ok(C.addressKey({ address: "Orlando, FL 32819, USA" }) === null, "a city-only address is not distinctive enough to merge on");
  ok(C.addressKey({}) === null && C.addressKey(null) === null, "missing address is never a key");
}


/* ── market-relative review floor ──────────────────────────────────────── */
{
  const F = await import("../lib/marketFloor.js");
  // Real Orlando review counts from the live list (2026-07-28).
  const orlando = [4727, 24634, 5746, 1014, 287, 191760, 108574, 61, 17273, 2023, 31729, 21763, 51062, 14623].map((r) => ({ rating: 4.5, reviews: r }));
  const parrish = [45, 120, 61, 200, 310, 88, 150].map((r) => ({ rating: 4.5, reviews: r }));

  const oFloor = F.marketReviewFloor(orlando);
  const pFloor = F.marketReviewFloor(parrish);
  ok(oFloor > 100, "a major market sets a real bar, got " + oFloor);
  ok(pFloor === F.REL_FLOOR_MIN, "a small market is unchanged at the original floor, got " + pFloor);

  // The case that started this: a building, not a destination.
  ok(F.passesMarketFloor({ rating: 4.4, reviews: 61 }, oFloor, false) === false,
    "Historic Angebilt Building (61 reviews) no longer clears the Orlando bar");
  // ...without cutting a small but real venue.
  ok(F.passesMarketFloor({ rating: 4.8, reviews: 287 }, oFloor, false) === true,
    "CityArts (287 reviews) still clears it");
  // ...and without changing small-town behaviour.
  ok(F.passesMarketFloor({ rating: 4.5, reviews: 61 }, pFloor, false) === true,
    "the same 61-review place is still valid in a small market");

  // Guards.
  ok(F.passesMarketFloor({ rating: 4.0, reviews: 3 }, oFloor, true) === true, "a curated pick is never dropped by the floor");
  ok(F.passesMarketFloor({ rating: null, reviews: 0 }, oFloor, false) === true, "an unrated POI is judged by floorOk, not by this");
  ok(F.marketReviewFloor([]) === F.REL_FLOOR_MIN, "an empty pool falls back to the original floor");
  ok(F.marketReviewFloor([{ reviews: 5 }, { reviews: 9 }]) === F.REL_FLOOR_MIN, "too few samples to infer a bar => original floor");
  // One mega-venue must not raise the bar out of reach.
  const skewed = [{ reviews: 5 }, { reviews: 8 }, { reviews: 12 }, { reviews: 20 }, { reviews: 40 }, { reviews: 5000000 }];
  ok(F.marketReviewFloor(skewed) <= F.REL_FLOOR_MAX, "the floor is clamped so an outlier cannot wipe a market");
  ok(F.passesMarketFloor(null, oFloor, false) === false, "null place never passes");

  // The list must never be emptied to enforce a bar.
  const landing = readFileSync(join(ROOT, "lib/landing.js"), "utf8");
  ok(/if \(_kept\.length >= 5\) pool = _kept;/.test(landing),
    "a floor that would wipe the market is not applied — a thin market gets the honest unfiltered pool");
}

if (failures) { console.error(`test-containment: ${failures} failure(s)`); process.exit(1); }
console.log("test-containment: OK");
