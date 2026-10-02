// scripts/test-inventory-all-adult.mjs — a category's "All" list never serves
// adult entertainment.
//
// THE DEFECT (2026-10-02, the #1612 production audit). #1612 made adult
// entertainment a global exclusion for every chip, menu gate and home rail.
// Production then still showed a nude strip club and four gentlemen's clubs
// under Night out → All in Tampa and Parrish: lib/inventoryServe.js's
// serveFromInventory runs the chip contract only for a narrow sub, so the
// "All" list was the raw nightlife category. The fix filters isAdultVenue
// (lib/placeCategory.js — the one predicate) before the cap, for every sub.
//
// Hermetic and by CALL: the real serveFromInventory runs against a fake
// PostgREST (globalThis.fetch), the same seam check-inventory-serve-complete-read
// uses. Keepers prove the filter is not "drop the nightlife category".
import { serveFromInventory } from "../lib/inventoryServe.js";

let total = 0;
let failed = 0;
const ok = (cond, msg) => { total++; if (!cond) { failed++; console.error("FAIL: " + msg); } };

const CENTER = { lat: 27.9506, lng: -82.4572 };
const RADIUS_M = 17 * 1609.34;
const ENV = { url: "https://fixture.supabase.co", key: "fixture-key" };
process.env.SUPABASE_URL = ENV.url;
process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.key;

let n = 0;
const row = (name, primary_type, google_types) => ({
  place_id: "wf_test_" + (++n), name, lat: CENTER.lat + n * 0.001, lng: CENTER.lng + n * 0.001,
  category: "nightlife", secondary_categories: [], primary_type, google_types, cuisines: [],
  status: "OPERATIONAL", excluded: false, signals: { rating: 4.6, reviews: 900 }, photo_ref: null,
});
const ADULT = [
  row("Mons Venus World Famous Nude Strip Club Tampa", "bar", ["bar", "night_club"]),
  row("Emperors Gentlemen's Club Tampa", "adult_entertainment", ["night_club", "bar"]),
  row("Omnia Blue Gentlemen’s Club", "adult_entertainment", ["night_club", "bar"]),
  row("Cheetah Lounge", "adult_entertainment", ["night_club", "point_of_interest"]),
];
const KEEP = [
  row("The Gator Club", "night_club", ["night_club", "bar"]),
  row("Sandbar Tavern", "bar", ["bar"]),
  row("Ella's Americana Folk Art Cafe", "bar", ["bar", "live_music_venue"]),
];
const world = [...ADULT, ...KEEP];

const orig = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  const body = !url.includes("/rest/v1/wf_inventory") ? []
    : /place_id=in\./.test(url) && !/lat=gte\./.test(url) ? [] // hydration reads: nothing to add
    : world;
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
const names = async (sub) => {
  const out = await serveFromInventory("nightlife", CENTER.lat, CENTER.lng, RADIUS_M, 40, sub, { env: ENV, skipEditorial: true });
  return (Array.isArray(out) ? out : (out && out.places) || []).map((p) => p.name || (p.displayName && p.displayName.text));
};
try {
  for (const sub of ["all", "", "clubs", "bars", "music"]) {
    const got = await names(sub);
    ok(!got.some((x) => ADULT.some((a) => a.name === x)), `Night out → ${sub || "(no sub)"} serves no adult venue (got: ${got.join(" | ")})`);
    if (sub === "all" || sub === "") ok(KEEP.every((k) => got.includes(k.name)), `keeper: Night out → ${sub || "(no sub)"} still serves every real club and bar (got: ${got.join(" | ")})`);
  }
} finally { globalThis.fetch = orig; }

console.log(`test-inventory-all-adult: ${total - failed}/${total} passed — serveFromInventory drops adult entertainment for "All" and every chip, keeps real clubs and bars (by call, fake PostgREST)`);
if (failed) process.exit(1);
