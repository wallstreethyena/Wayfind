// Locks the Christmas map pins (lib/christmasMap.js): an approximate location
// is NEVER pinned (approxLocation, coord_kind city_approx, the approximate
// event list, missing / invalid / non Florida coordinates) and the pin count
// equals the verified listings in the result set (all of them, not one page).
// Executes the function on fixture listings and also reads the real research
// data through christmasBrowseListings to prove no returned pin is approximate.
import assert from "node:assert/strict";
import { christmasBrowsePins, isVerifiedChristmasPoint } from "../lib/christmasMap.js";
import { christmasBrowseListings } from "../lib/christmasBrowse.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const TODAY = "2026-11-12";
const base = (id, extra = {}) => ({
  id, kind: "event", title: "Lights " + id, name: "Lights " + id, city: "Orlando", region: "Central Florida",
  christmasRail: "lights", browse_categories: ["lights"], own_categories: [],
  lat: 28.54, lng: -81.38, start_date: "2026-11-01", end_date: "2026-12-31", occurrence_dates: undefined,
  price_kind: "free", audience: "all-ages", wfScore: 70, detailHref: "/florida-events/" + id, ...extra,
});
const verified = ["v1", "v2", "v3", "v4"].map((id, i) => base(id, { lat: 28.5 + i * 0.1, lng: -81.4 + i * 0.1, wfScore: 90 - i }));
const bad = [
  base("a1", { approxLocation: true }),
  base("a2", { coord_kind: "city_approx" }),
  base("a3", { coord_approx: true }),
  base("a4", { id: "fl26-sweet-season-farms-2026" }), // on the approximate event list
  base("m1", { lat: null, lng: null }),
  base("m2", { lat: undefined, lng: undefined }),
  base("m3", { lat: "", lng: "" }),
  base("i1", { lat: "abc", lng: "def" }),
  base("i2", { lat: 0, lng: 0 }),
  base("i3", { lat: 51.5, lng: -0.12 }), // not Florida
  base("i4", { lat: 28.5, lng: undefined }),
];
const listings = [...verified, ...bad];

const pins = christmasBrowsePins(listings, { category: "lights" }, TODAY);
eq(pins.length, verified.length, "pin count equals the verified listings");
eq(pins.map((p) => p.id).sort(), verified.map((p) => p.id).sort(), "only the verified listings are pinned");
for (const p of pins) {
  ok(Number.isFinite(p.lat) && Number.isFinite(p.lng), "finite coordinates on " + p.id);
  eq(Object.keys(p).sort(), ["city", "href", "id", "lat", "lng", "title"], "pin shape on " + p.id);
}
for (const b of bad) ok(!pins.some((p) => p.id === b.id), "no pin for " + b.id);
for (const b of bad) ok(!isVerifiedChristmasPoint(b), "not verified: " + b.id);
for (const v of verified) ok(isVerifiedChristmasPoint(v), "verified: " + v.id);
ok(pins.find((p) => p.id === "v1").href === "/florida-events/v1", "pin links to the card's page");

// All matches, not a page: 60 verified listings give 60 pins (the list pages 24).
const many = Array.from({ length: 60 }, (_, i) => base("many" + i, { lat: 27 + i * 0.01, lng: -82 + i * 0.01, title: "Many " + i, name: "Many " + i }));
eq(christmasBrowsePins(many, {}, TODAY).length, 60, "every match is pinned, not one page");
// The filter narrows the set.
eq(christmasBrowsePins([...verified, base("pk", { christmasRail: "parades", browse_categories: ["parade"] })], { category: "parades" }, TODAY).map((p) => p.id), ["pk"], "pins follow the filter");

// Real data: no pin is approximate.
const real = christmasBrowseListings([], TODAY);
const realPins = christmasBrowsePins(real, {}, TODAY);
ok(realPins.length > 0, "the shipped research yields pins");
const byId = new Map(real.map((c) => [c.id, c]));
for (const p of realPins) { const c = byId.get(p.id); ok(c && !c.approxLocation && c.coord_kind !== "city_approx", "real pin is not approximate: " + p.id); }
const approxInList = real.filter((c) => c.approxLocation || c.coord_kind === "city_approx");
for (const c of approxInList) ok(!realPins.some((p) => p.id === c.id), "real approximate listing is not pinned: " + c.id);
console.log("test-christmas-map-pins: OK (" + n + " assertions; " + realPins.length + " real pins, " + approxInList.length + " approximate listings excluded)");
