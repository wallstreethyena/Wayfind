// Regression for WAYFIND-10 (MapKit MapRect NaN) and WAYFIND-S (failed to pipe
// response from /api/weather). Both execute the real modules.
import assert from "node:assert/strict";
import { createAppleMapController, isMapkitSafePoint } from "../lib/appleMapsRuntime.js";

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };

// ── WAYFIND-10 ──
for (const [name, point, expected] of [
  ["Gulf Coast venue", { lat: 27.5689, lng: -82.4393 }, true],
  ["numeric strings", { lat: "27.5", lng: "-82.4" }, true],
  ["NaN latitude", { lat: NaN, lng: -82 }, false],
  ["Infinity longitude", { lat: 27, lng: Infinity }, false],
  ["pole latitude 90 (Mercator Infinity)", { lat: 90, lng: 0 }, false],
  ["latitude beyond the poles", { lat: 91, lng: 0 }, false],
  ["longitude out of range", { lat: 27, lng: 2026 }, false],
  ["null", null, false],
  ["missing lng", { lat: 27 }, false],
  ["empty string", { lat: "", lng: "" }, false],
  ["nested data cannot validate a different raw point", { lat: 91, lng: 0, coordinate: { lat: 27, lng: -82 } }, false],
  ["null latitude is not the equator", { lat: null, lng: -82 }, false],
]) ok(isMapkitSafePoint(point) === expected, "isMapkitSafePoint: " + name);

const made = [];
const mapkit = {
  Coordinate: class { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } },
  Padding: class {},
  CoordinateSpan: class {},
  CoordinateRegion: class {},
  ImageAnnotation: class { constructor(coordinate, options) { this.coordinate = coordinate; this.options = options; made.push(this); } },
  Map: class { constructor() { this.annotations = []; this.fits = 0; } addAnnotations(items) { this.annotations.push(...items); } showItems() { this.fits++; } removeAnnotations() {} destroy() {} },
};
const container = { clientWidth: 390, clientHeight: 340 };
const venue = { id: "v", name: "Venue", lat: 27.77, lng: -82.74 };
const good = { id: "a", name: "Good", lat: 27.78, lng: -82.7 };
const picks = [good, { id: "b", name: "Pole", lat: 90, lng: 0 }, { id: "c", name: "Far", lat: 27, lng: 9999 }, { id: "d", name: "NaN", lat: NaN, lng: 1 },
  { id: "nested", name: "Mismatched point", lat: 91, lng: 0, coordinate: { lat: 27, lng: -82 } }];
const controller = createAppleMapController({ mapkit, container, venue, picks });
ok(controller.map.annotations.length === 2, "only the venue and the one projectable pick reach MapKit");
ok(controller.map.fits === 1, "a regular phone viewport fits its annotations");
ok(made.every((a) => Number.isFinite(a.coordinate.latitude) && Math.abs(a.coordinate.latitude) <= 85.0511 && Math.abs(a.coordinate.longitude) <= 180), "every annotation coordinate is projectable");
controller.setPicks(picks);
ok(made.filter((a) => a.options.title === "Pole" || a.options.title === "Far").length === 0, "setPicks also drops unprojectable points");
let threw = null;
try { createAppleMapController({ mapkit, container, venue: { ...venue, lat: NaN }, picks: [] }); } catch (e) { threw = e; }
ok(threw instanceof RangeError, "an unprojectable venue fails before MapKit is touched (component shows its fallback)");
assert.throws(() => createAppleMapController({ mapkit, container, venue: { ...venue, lat: null } }), RangeError, "missing venue latitude cannot become zero");
await assert.rejects(controller.routeFromCoordinate({ lat: null, lng: -82 }), /map location is required/, "missing route latitude cannot become zero");
controller.setParkingMode(true, [{ id: "p1", name: "Lot", lat: 27.77, lng: -82.74 }, { id: "p2", name: "Bad", lat: 95, lng: 0 },
  { id: "nested-parking", name: "Bad", coordinate: { lat: 27, lng: -82 } }]);
ok(!made.some((a) => a.options.title === "Bad") && made.some((a) => a.options.title === "Lot"), "parking annotations are filtered the same way");
const compact = { clientWidth: 0, clientHeight: 340 };
const compactController = createAppleMapController({ mapkit, container: compact, venue, picks: [good] });
ok(compactController.map.fits === 0, "a collapsed map cannot fit annotations to an invalid padded frame");
compactController.setParkingMode(true, [good]);
ok(compactController.map.region === undefined, "a collapsed parking map does not assign a camera region");
compactController.setParkingMode(false);
compact.clientWidth = 390;
compactController.setPicks([good]);
ok(compactController.map.fits === 1, "the map can fit again after its frame opens");

// ── WAYFIND-S ──
const { GET } = await import("../app/api/weather/route.js");
const realFetch = globalThis.fetch;
try {
  let call = null;
  globalThis.fetch = async (url, init) => { call = { url: String(url), init }; return new Response('{"current":{"temperature_2m":70}}', { status: 200 }); };
  const res = await GET(new Request("https://www.gowayfind.com/api/weather?lat=27.5689&lng=-82.4393"));
  ok(res.status === 200 && (await res.text()).includes("temperature_2m"), "weather body passes through");
  ok(call.init && call.init.next === undefined, "no Next data-cache revalidate option (its detached refresh escaped the catch)");
  ok(call.init.cache === "no-store" && call.init.signal && typeof call.init.signal.aborted === "boolean", "awaited fetch carries no-store and its own abort deadline");
  ok(/s-maxage=600/.test(res.headers.get("cache-control") || ""), "CDN cache header preserved");
  for (const failure of [new Error("fetch failed"), Object.assign(new Error("Connect Timeout Error"), { name: "ConnectTimeoutError" })]) {
    globalThis.fetch = async () => { throw failure; };
    const failed = await GET(new Request("https://www.gowayfind.com/api/weather?lat=27&lng=-82"));
    ok(failed.status === 200 && (await failed.text()) === "{}", "upstream failure soft-fails to {} inside the handler");
  }
  call = null;
  globalThis.fetch = async (url, init) => { call = { url, init }; return new Response("{}"); };
  const bad = await GET(new Request("https://www.gowayfind.com/api/weather?lat=abc&lng=-82"));
  ok(call === null && (await bad.text()) === "{}", "non-numeric coordinates never reach Open-Meteo");
} finally { globalThis.fetch = realFetch; }

// ── WAYFIND-10, second pass (event seen again 2026-11-23) ──
// #2566 guarded only the event venue map. The main map (appleExplorerMap) still
// let |lat| up to 90 through, and the creator map checked finiteness only.
{
  const { finitePoint, MERCATOR_MAX_LAT } = await import("../lib/appleExplorerMap.js");
  ok(MERCATOR_MAX_LAT === 85.0511, "explorer map uses the Web Mercator limit");
  for (const [name, point, expected] of [
    ["Gulf Coast place", { lat: 27.5, lng: -82.4 }, true],
    ["pole 90", { lat: 90, lng: 0 }, false],
    ["86 (finite but unprojectable)", { lat: 86, lng: 0 }, false],
    ["-89 south", { lat: -89, lng: 0 }, false],
    ["lng 181", { lat: 27, lng: 181 }, false],
  ]) ok(!!finitePoint(point) === expected, "explorer finitePoint: " + name);

  const { createCreatorAppleMap } = await import("../lib/creatorAppleMap.js");
  const pinned = [];
  const noop = () => {};
  const permissive = (target) => new Proxy(target, { get: (t, k) => (k in t ? t[k] : noop) });
  const creatorKit = {
    Coordinate: class { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } },
    Padding: class {},
  CoordinateSpan: class {},
  CoordinateRegion: class {},
    ImageAnnotation: class { constructor(coordinate, options) { this.coordinate = coordinate; this.options = options; } },
    Map: class { constructor() { return permissive({ addAnnotations: (items) => pinned.push(...items), showItems: noop }); } },
  };
  createCreatorAppleMap({ mapkit: creatorKit, container: {}, places: [
    { id: "ok", name: "Real", lat: 27.33, lng: -82.53 },
    { id: "pole", name: "Pole", lat: 90, lng: 0 },
    { id: "far", name: "Far north", lat: 87, lng: 0 },
  ], onSelect: noop });
  ok(pinned.length === 1 && pinned[0].options.title === "Real", "creator map drops unprojectable pins before MapKit sees them");
  ok(pinned.every((a) => Math.abs(a.coordinate.latitude) <= 85.0511), "every creator pin is projectable");
}

// ── /api/weather vs the Command Center self-check (alert 2026-11-24 14:07 ET) ──
// The probe gives the route 6s. With the upstream deadline also 6s, a slow
// Open-Meteo made both give up together and the probe paged "timeout (6005ms)"
// instead of seeing the route's {} soft-fail. EXECUTED: a hung upstream.
{
  const { GET: weatherGET } = await import("../app/api/weather/route.js");
  const probeSrc = (await import("node:fs")).readFileSync(new URL("../lib/commandCenter/sources/synthetic.js", import.meta.url), "utf8");
  ok(/t\.timeoutMs \|\| opts\.timeoutMs \|\| 6000/.test(probeSrc) && /key: "api_weather"(?![^}]*timeoutMs)/.test(probeSrc), "the self-check still gives /api/weather the 6s default budget");
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = (url, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })), { once: true });
    });
    // AbortSignal.timeout's timer is unref'd; hold the loop open so the
    // deadline can actually fire in this script.
    const keepAlive = setInterval(() => {}, 1000);
    const t0 = Date.now();
    const hung = await weatherGET(new Request("https://www.gowayfind.com/api/weather?lat=27.34&lng=-82.53"));
    const ms = Date.now() - t0;
    clearInterval(keepAlive);
    ok(hung.status === 200 && (await hung.text()) === "{}", "a hung upstream soft-fails to {}");
    ok(ms < 5500, `…and answers well inside the probe's 6s budget (${ms}ms)`);
  } finally { globalThis.fetch = saved; }
}

console.log("test-sentry-mapkit-nan-weather: OK — " + assertions + " assertions");
