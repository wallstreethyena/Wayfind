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
]) ok(isMapkitSafePoint(point) === expected, "isMapkitSafePoint: " + name);

const made = [];
const mapkit = {
  Coordinate: class { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } },
  Padding: class {},
  ImageAnnotation: class { constructor(coordinate, options) { this.coordinate = coordinate; this.options = options; made.push(this); } },
  Map: class { constructor() { this.annotations = []; } addAnnotations(items) { this.annotations.push(...items); } showItems() {} removeAnnotations() {} destroy() {} },
};
const container = {};
const venue = { id: "v", name: "Venue", lat: 27.77, lng: -82.74 };
const good = { id: "a", name: "Good", lat: 27.78, lng: -82.7 };
const picks = [good, { id: "b", name: "Pole", lat: 90, lng: 0 }, { id: "c", name: "Far", lat: 27, lng: 9999 }, { id: "d", name: "NaN", lat: NaN, lng: 1 }];
const controller = createAppleMapController({ mapkit, container, venue, picks });
ok(controller.map.annotations.length === 2, "only the venue and the one projectable pick reach MapKit");
ok(made.every((a) => Number.isFinite(a.coordinate.latitude) && Math.abs(a.coordinate.latitude) <= 85.0511 && Math.abs(a.coordinate.longitude) <= 180), "every annotation coordinate is projectable");
controller.setPicks(picks);
ok(made.filter((a) => a.options.title === "Pole" || a.options.title === "Far").length === 0, "setPicks also drops unprojectable points");
let threw = null;
try { createAppleMapController({ mapkit, container, venue: { ...venue, lat: NaN }, picks: [] }); } catch (e) { threw = e; }
ok(threw instanceof RangeError, "an unprojectable venue fails before MapKit is touched (component shows its fallback)");
controller.setParkingMode(true, [{ id: "p1", name: "Lot", lat: 27.77, lng: -82.74 }, { id: "p2", name: "Bad", lat: 95, lng: 0 }]);
ok(!made.some((a) => a.options.title === "Bad") && made.some((a) => a.options.title === "Lot"), "parking annotations are filtered the same way");

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

console.log("test-sentry-mapkit-nan-weather: OK — " + assertions + " assertions");
