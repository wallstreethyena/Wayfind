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

if (failures) { console.error(`test-containment: ${failures} failure(s)`); process.exit(1); }
console.log("test-containment: OK");
