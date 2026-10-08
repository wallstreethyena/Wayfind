import fs from "node:fs";
import ts from "typescript";
import { fetchClassifiedPosterJson } from "../lib/posterJson.js";
import { isRailCancelled, railDeveloperFailure } from "../lib/railFailure.js";
import {
  TODAY_DISCOVERY_RAIL_DEFS,
  composeTodayDiscoveryRails,
  hasInstagramEvidence,
  isBestFood,
  isDestinationPark,
  isFloridaSpring,
  isGolfPlace,
  isNaturePlace,
  isPickleballPlace,
  isTopActivity,
  isWaterActivity,
} from "../lib/todayDiscoveryRails.js";
import { RAILS } from "../lib/rails.js";
import { DAYPARTS } from "../lib/dayparts.js";
import { wayfindScore } from "../lib/wayfindScore.js";

let pass = 0;
const fail = [];
const ok = (condition, message) => { if (condition) pass++; else fail.push(message); };
const place = (id, name, primaryType, types, extras = {}) => ({
  id, name, primaryType, types, rating: 4.8, reviews: 800, distMi: 5,
  photo: "https://images.example/" + id + ".jpg", ...extras,
});

const fixtures = [
  place("activity", "The Great Museum", "museum", ["museum", "tourist_attraction"]),
  place("instagram", "Catrina's Tacos", "mexican_restaurant", ["mexican_restaurant"], { distMi: 4 }),
  place("spring", "Rainbow Springs State Park", "state_park", ["state_park", "park"]),
  place("beach-good", "Coquina Beach", "beach", ["beach"], { water: { result: "good", sampled_at: new Date().toISOString() } }),
  place("food", "Best Bistro", "american_restaurant", ["american_restaurant"]),
  place("water", "Manatee Kayak Tours", "tour_agency", ["tour_agency", "kayaking"]),
  place("park", "Florida Adventure Theme Park", "theme_park", ["theme_park", "amusement_park"]),
  place("nature", "Myakka River State Park", "state_park", ["state_park", "nature_preserve"]),
  place("golf", "River Strand Golf Course", "golf_course", ["golf_course"]),
  place("pickleball", "Parrish Pickleball Club", "sports_club", ["sports_club", "athletic_field"]),
];

ok(TODAY_DISCOVERY_RAIL_DEFS.length === 10, "Today's Best Options has exactly ten approved rails");
ok(TODAY_DISCOVERY_RAIL_DEFS.map((rail) => rail.id).join(",") === "activities,instagram,springs,beaches,food,water,parks,nature,golf,pickleball", "the ten rails keep the founder-approved order");
ok(isTopActivity(fixtures[0]), "a high-scoring museum reaches Top Activities");
ok(hasInstagramEvidence(fixtures[1], "Tampa"), "a verified Instagram association reaches Instagram Places");
ok(isFloridaSpring(fixtures[2]), "a structured state-park spring reaches Florida Springs");
ok(isBestFood(fixtures[4]), "high-scoring restaurant evidence reaches Best Food");
ok(isWaterActivity(fixtures[5]), "kayaking evidence reaches Water Activities");
ok(isDestinationPark(fixtures[6]), "theme-park identity reaches Parks & Zoos");
ok(isNaturePlace(fixtures[7]), "a state park reaches Go Explore Nature");
ok(isGolfPlace(fixtures[8]), "a real golf course reaches Golf");
ok(isPickleballPlace(fixtures[9]), "specific pickleball evidence reaches Pickleball");

const rails = composeTodayDiscoveryRails(fixtures, { city: "Tampa" }).rails;
ok(rails.length === 10, "the composer returns all ten rails, including honest empty rails");
const expectedIds = {
  activities: ["activity"], instagram: ["instagram"], springs: ["spring"],
  beaches: ["beach-good"], food: ["instagram", "food"], water: ["water"],
  parks: ["park"], nature: ["nature"], golf: ["golf"], pickleball: ["pickleball"],
};
for (const [id, expected] of Object.entries(expectedIds)) {
  const actual = rails.find((rail) => rail.id === id)?.places.map((row) => row.id).sort() || [];
  ok(actual.join(",") === expected.slice().sort().join(","), `${id} contains only evidence-qualified fixtures`);
}
ok(rails.find((rail) => rail.id === "activities").places.every((row) => !["spring", "beach-good", "water", "park", "nature", "golf", "pickleball"].includes(row.id)), "specialized outdoor identities do not leak into Top Activities");

const ordered = composeTodayDiscoveryRails([
  place("low", "Lower Museum", "museum", ["museum"], { rating: 4.3, reviews: 300 }),
  place("high", "Higher Museum", "museum", ["museum"], { rating: 4.9, reviews: 300 }),
]).rails.find((rail) => rail.id === "activities").places;
ok(ordered.map((row) => row.id).join(",") === "high,low", "ordinary rails rank highest-to-lowest by canonical Wayfind Score");
ok(wayfindScore(ordered[0].rating, ordered[0].reviews) > wayfindScore(ordered[1].rating, ordered[1].reviews), "the asserted order is backed by the displayed score formula");

const beaches = composeTodayDiscoveryRails([
  place("excellent-poor", "Excellent Beach", "beach", ["beach"], { rating: 4.9, reviews: 2000, water: { result: "poor", sampled_at: new Date().toISOString() } }),
  place("good-water", "Good Water Beach", "beach", ["beach"], { rating: 4.5, reviews: 500, water: { result: "good", sampled_at: new Date().toISOString() } }),
]).rails.find((rail) => rail.id === "beaches").places;
ok(beaches.map((row) => row.id).join(",") === "good-water,excellent-poor", "current good water outranks a higher-score beach with poor water");

const leaks = [
  place("noisy-restaurant", "Kitchen and Cocktails", "restaurant", ["restaurant", "bar", "tourist_attraction"]),
  place("spring-hill-shop", "Spring Hill Golf Shop", "store", ["store", "sporting_goods_store"]),
  place("mini-golf", "Adventure Mini Golf", "miniature_golf_course", ["miniature_golf_course"]),
  place("marina-store", "Beach Marina Supply", "store", ["store"]),
  place("tennis", "Parrish Tennis Club", "sports_club", ["sports_club"]),
];
ok(!isTopActivity(leaks[0]), "a restaurant with a noisy tourist-attraction token cannot become Top Activities");
ok(!isFloridaSpring(leaks[1]), "Spring Hill retail cannot become a Florida spring");
ok(!isGolfPlace(leaks[2]), "miniature golf cannot become Golf");
ok(!isWaterActivity(leaks[3]), "a marina supply store cannot become a water activity");
ok(!isPickleballPlace(leaks[4]), "a generic sports club cannot become Pickleball without pickleball evidence");

const todayRail = RAILS.find((rail) => rail.id === "today");
ok(todayRail?.title === "Today's Best Options" && todayRail?.art === "today", "the combined poster replaces the guarded Today artwork slot");
ok(!RAILS.some((rail) => rail.id === "best" || rail.id === "gems"), "Best Around You and Places You'd Never Find are retired from the homepage poster registry");
for (const [band, definition] of Object.entries(DAYPARTS)) {
  // Christmas in Florida (2026-10-08) sits directly behind Fall: ceiling moves from index 5 to 6.
  ok(definition.order.indexOf("today") >= 0 && definition.order.indexOf("today") <= 6,
    `Today's Best Options stays in the first seven posters during ${band}, after the approved Fall and Christmas leads`);
}

const route = fs.readFileSync(new URL("../app/api/today-discovery/route.js", import.meta.url), "utf8");
ok(/fastCachedRail\(key/.test(route) && /serveFromInventory/.test(route) && !/searchPlaces|places\.googleapis/.test(route), "the endpoint is FastCache-backed, owned-inventory-only, and makes no Google search");

// v8.98 — THE READ SPLIT IN TWO, SO THIS ASSERTION FOLLOWED IT.
//
// It used to read `Promise.all(categories.map(...))` and the invariant it was
// protecting was never that literal: it was that the inventory reads are
// CONCURRENT, not a serial waterfall. attractions + beach now come through
// lib/ownedPool.js identity-first (the narrow nature rails were starving behind
// a top-400-of-75-miles cut) while the other four stay on the shared reader, and
// both halves still start together inside ONE Promise.all. Following the code is
// the rule; deleting the assertion would re-open the waterfall it was written
// for, and — worse — a path-shaped assertion goes GREEN the moment code leaves
// it, which is the dangerous half (CLAUDE.md).
const readBlock = (route.match(/await Promise\.all\(\[[\s\S]*?\]\);/) || [""])[0];
ok(!!readBlock, "positive control: the endpoint no longer has an `await Promise.all([...])` read block at all");
ok(/fetchOwnedPool\(/.test(readBlock) && /broadCategories\.map\(/.test(readBlock),
  "the identity-first pool and the broad category reads no longer start together in one Promise.all — a serial waterfall doubles the cold miss");
ok(/serveFromInventory\(category, lat, lng, radiusM, BROWSE_INVENTORY_N/.test(readBlock),
  "the four broad category reads changed shape without this guard being re-read");
ok(/identity:\s*\(place\)\s*=>\s*claimsTodayRail\(/.test(route),
  "the attractions/beach read lost its identity predicate — the narrow nature rails would go back to competing for the top 400 of a 75-mile box");
// The cache key must stay VERSIONED and carry the city. The number itself is not
// asserted: pinning v2 is what sent this guard red on a correct bump. What is
// asserted is that a version segment exists at all, because FastCache is shared
// across deployments and a membership change that inherits an earlier
// generation's answer is invisible.
ok(/today-discovery:v\d+:/.test(route) && /cityKey/.test(route) && /inventoryCategories\?\.includes\("beach"\)/.test(route), "versioned cache identity includes creator city and duplicated beach inventory still receives water evidence");
const component = fs.readFileSync(process.argv[2] || new URL("../app/components/TodayDiscoveryRails.js", import.meta.url), "utf8");
// Follow the production import rather than pinning the old transport's spelling.
// The classified poster helper retains the deadline and caller cancellation,
// and adds recoverable service failures without treating outages as emptiness.
const componentAst = ts.createSourceFile("TodayDiscoveryRails.jsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const posterImport = componentAst.statements.find((node) => ts.isImportDeclaration(node)
  && node.moduleSpecifier.text === "../../lib/posterJson.js"
  && node.importClause?.namedBindings?.elements?.some((item) => (item.propertyName || item.name).text === "fetchClassifiedPosterJson"));
const fetchName = posterImport?.importClause.namedBindings.elements.find((item) => (item.propertyName || item.name).text === "fetchClassifiedPosterJson")?.name.text;
let requestEffect;
function findRequestEffect(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect") {
    let fetchesToday = false;
    function findFetch(child) {
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === fetchName
        && ts.isBinaryExpression(child.arguments[0]) && ts.isStringLiteral(child.arguments[0].left)
        && child.arguments[0].left.text === "/api/today-discovery?") fetchesToday = true;
      ts.forEachChild(child, findFetch);
    }
    if (node.arguments[0]) findFetch(node.arguments[0]);
    if (fetchesToday) requestEffect = node.arguments[0].getText(componentAst);
  }
  ts.forEachChild(node, findRequestEffect);
}
findRequestEffect(componentAst);
ok(!!fetchName && !!requestEffect && /payload\.rails\.map/.test(component), "the lazy drop fetches and renders the dedicated ten-rail answer through the current classified bounded helper");

// Execute the actual request effect with the actual imported transport. Only
// React state and fetch are fixture boundaries; no request algorithm is copied.
if (fetchName && requestEffect) {
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  const realNow = Date.now;
  const tick = () => new Promise((resolve) => realSetTimeout(resolve, 0));
  const healthyPayload = { degraded: false, sourceFailures: 0, rails: TODAY_DISCOVERY_RAIL_DEFS.map((rail, index) => ({
    ...rail, places: [fixtures[index]], total: 1, page: 0, hasMore: false,
  })) };
  const effectHarness = (city) => {
    const state = { payload: null, failure: null, tracks: [], errors: [] };
    const ctx = {
      key: "28.54|-81.38", city, retry: 0, asked: { current: "" },
      [fetchName]: fetchClassifiedPosterJson, isRailCancelled, railDeveloperFailure,
      setPayload: (payload) => { state.payload = payload; },
      setFailure: (failure) => { state.failure = failure; },
      onTrack: (...args) => { state.tracks.push(args); },
      console: { error: (...args) => { state.errors.push(args); } },
    };
    const effect = new Function("ctx", `with(ctx) { return (${requestEffect}); }`)(ctx);
    return { state, ctx, start: effect };
  };
  const settle = async (harness) => {
    const deadline = realNow() + 1500;
    while (!harness.state.payload && !harness.state.failure && realNow() < deadline) await tick();
    ok(!!harness.state.payload || !!harness.state.failure, "the exercised request effect actually reached a terminal state");
  };
  try {
    let calls = [];
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(healthyPayload); };
    const healthy = effectHarness("Fixture healthy");
    const cleanupHealthy = healthy.start(); await settle(healthy);
    ok(calls.length === 1 && calls[0].url.startsWith("/api/today-discovery?"), "the real effect fetches only its dedicated owned-inventory endpoint");
    const query = new URL(calls[0].url, "https://fixture.invalid").searchParams;
    ok(query.get("lat") === "28.54" && query.get("lng") === "-81.38" && query.get("city") === "Fixture healthy", "the actual fetch preserves its location and creator city");
    ok(calls[0].options.signal instanceof AbortSignal && calls[0].options.priority === "high", "the production classified helper supplies cancellable high-priority transport");
    ok(healthy.state.payload.rails.length === 10 && healthy.state.payload.rails.every((rail, index) => rail.places[0].id === fixtures[index].id), "the effect delivers all ten original rail definitions and place rows intact");
    ok(healthy.state.tracks.length === 1 && healthy.state.tracks[0][1].places === 10, "the successful effect tracks the ten real loaded rows once");
    cleanupHealthy();

    for (const [label, response, kind, reason, expectedCalls] of [
      ["malformed", () => Response.json({ rails: null }), "developer", "invalid_payload", 1],
      ["forbidden", () => new Response("", { status: 403 }), "developer", "http_403", 1],
      ["outage", () => new Response("", { status: 503 }), "degraded", "http_503", 2],
    ]) {
      calls = [];
      globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response(); };
      const failed = effectHarness(`Fixture ${label}`);
      const cleanup = failed.start(); await settle(failed);
      ok(failed.state.failure?.kind === kind && failed.state.failure?.reason === reason && !failed.state.payload,
        `${label} remains an explicit ${kind} state instead of successful empty inventory`);
      ok(calls.length === expectedCalls, `${label} retains the transport's bounded retry contract`);
      cleanup();
    }

    let release, transportSignal;
    globalThis.fetch = async (_url, options) => { transportSignal = options.signal; return new Promise((resolve) => { release = resolve; }); };
    const cancelled = effectHarness("Fixture cancelled");
    const cleanupCancelled = cancelled.start(); await tick();
    ok(typeof release === "function", "the cancellation control really starts an in-flight fetch");
    cleanupCancelled(); await tick();
    ok(transportSignal.aborted && cancelled.ctx.asked.current === "", "effect cleanup cancels transport and releases the same-location retry gate");
    release(Response.json(healthyPayload)); await tick(); await tick();
    ok(!cancelled.state.payload && !cancelled.state.failure, "a cancelled late answer cannot paint stale cards or an outage");

    // Fire the real scheduled deadline callbacks deterministically, rather
    // than waiting ten seconds or swapping out the transport under test.
    const deadlines = [];
    let now = realNow();
    Date.now = () => now;
    globalThis.setTimeout = (fn, ms, ...args) => {
      const handle = realSetTimeout(fn, ms, ...args);
      if (ms === 10000) deadlines.push({ fn, args, handle });
      return handle;
    };
    globalThis.fetch = async () => new Promise(() => {});
    const stalled = effectHarness("Fixture deadline");
    const cleanupStalled = stalled.start(); await tick();
    ok(deadlines.length > 0, "the real effect arms its ten-second deadline in the current transport");
    now += 10000;
    for (const timer of deadlines) { clearTimeout(timer.handle); timer.fn(...timer.args); }
    await settle(stalled);
    ok(stalled.state.failure?.kind === "degraded" && stalled.state.failure?.reason === "timeout" && !stalled.state.payload,
      "a stalled current transport settles as a recoverable timeout rather than an endless skeleton");
    cleanupStalled();
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
    Date.now = realNow;
  }
}

if (fail.length) {
  console.error("test-today-discovery-rails: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`test-today-discovery-rails: OK — ${pass} assertions`);
