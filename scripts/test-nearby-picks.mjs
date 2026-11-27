#!/usr/bin/env node
// test-nearby-picks: opt-in nearby picks + the shared alert rule book, EXECUTED.
//
// Owner ask (Gabe, 2026-11-27): nudge people toward hidden springs and the sweet
// spots everyone loves when they are close, opt-in, location used in the moment
// and never stored, one shared daily cap and quiet hours with push.
//
// What this proves, by calling the real modules (no network, no env):
//   1. lib/alertPolicy.js: quiet hours 9 PM to 9 AM in the reader's own zone,
//      one alert a day across surfaces, 30 day per-place cooldown, junk ledgers
//      normalise to empty and never hold a coordinate.
//   2. lib/nearbyHotspots.js: springs are the curated allowlist only, sweets need
//      a dessert venue type plus the rating and review floor, radii hold, three
//      per kind, coordinates round to 2 decimals.
//   3. lib/nearbyPicksServe.js: only the rounded point reaches a read, both reads
//      failing is a loud 503 (never an "empty" product state), one failing is
//      marked partial, responses are private no-store.
//   4. Wiring: the route is POST only and imports no metered provider, the
//      middleware guards it, /nearby mounts the component lazily, and the
//      component asks for location only on a tap and checks the policy before
//      any nudge.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

const policy = await import(path.join(ROOT, "lib/alertPolicy.js"));
const hot = await import(path.join(ROOT, "lib/nearbyHotspots.js"));
const serve = await import(path.join(ROOT, "lib/nearbyPicksServe.js"));

// ── 1. alert policy ─────────────────────────────────────────────────────────
const ET = "America/New_York";
const at = (iso) => Date.parse(iso);
const noonET = at("2026-11-27T17:00:00Z");   // 12:00 PM Eastern (EST, UTC-5)
ok(policy.DAILY_ALERT_CAP === 1 && policy.QUIET_START_HOUR === 21 && policy.QUIET_END_HOUR === 9, "one alert a day, quiet 9 PM to 9 AM");
ok(policy.canAlert(null, { now: noonET, tz: ET }).ok === true, "an empty ledger may alert at noon");
ok(policy.canAlert(null, { now: at("2026-11-28T02:30:00Z"), tz: ET }).reason === "quiet_hours", "9:30 PM Eastern is quiet");
ok(policy.canAlert(null, { now: at("2026-11-27T13:59:00Z"), tz: ET }).reason === "quiet_hours", "8:59 AM Eastern is quiet");
ok(policy.canAlert(null, { now: at("2026-11-27T14:00:00Z"), tz: ET }).ok === true, "9:00 AM Eastern is allowed");
ok(policy.canAlert(null, { now: at("2026-11-27T14:00:00Z"), tz: "America/Los_Angeles" }).reason === "quiet_hours", "quiet hours follow the reader's own zone (6 AM Pacific)");
const once = policy.recordAlert(null, { now: noonET, tz: ET, placeId: "A" });
ok(once.count === 1 && once.day === "2026-11-27", "recording an alert counts it on the reader's local day");
ok(policy.canAlert(once, { now: noonET + 3600e3, tz: ET, placeId: "B" }).reason === "daily_cap", "a second alert the same day is blocked, whatever the place");
const tomorrow = at("2026-11-28T16:00:00Z");
ok(policy.canAlert(once, { now: tomorrow, tz: ET, placeId: "B" }).ok === true, "the cap resets on the next local day");
ok(policy.canAlert(once, { now: tomorrow, tz: ET, placeId: "A" }).reason === "place_cooldown", "the same place does not nudge again inside 30 days");
ok(policy.canAlert(once, { now: noonET + 31 * 86400e3, tz: ET, placeId: "A" }).ok === true, "after 30 days the place may nudge again");
const twice = policy.recordAlert(once, { now: tomorrow, tz: ET, placeId: "B" });
ok(twice.count === 1 && twice.day === "2026-11-28", "a new day starts a fresh count");
const junk = policy.normalizeLedger({ day: "nope", count: -4, places: { x: "soon", y: 5 }, lat: 27.3, lng: -82.5 });
ok(junk.day === null && junk.count === 0 && Object.keys(junk.places).join() === "y" && !("lat" in junk) && !("lng" in junk), "a junk ledger normalises, keeps only numeric timestamps and never carries coordinates");
const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
ok(policy.writeAlertLedger(once, storage) && policy.readAlertLedger(storage).count === 1, "the ledger round-trips through storage");
ok(!/lat|lng|coords/i.test(mem.get(policy.ALERT_LEDGER_KEY)), "the stored ledger text holds no location field");
ok(policy.readAlertLedger({ getItem: () => { throw new Error("blocked"); } }).count === 0, "blocked storage reads as an empty ledger instead of throwing");

// ── 2. hotspot selection ────────────────────────────────────────────────────
ok(hot.SPRING_PLACE_IDS.length >= 20 && new Set(hot.SPRING_PLACE_IDS).size === hot.SPRING_PLACE_IDS.length && hot.SPRING_PLACE_IDS.every((id) => /^ChIJ[\w-]{10,}$/.test(id)), "the spring allowlist is unique Google place ids");
ok(hot.roundCoord(27.336051) === 27.34 && hot.roundCoord(-82.5433576) === -82.54, "coordinates round to 2 decimals");
ok(hot.validOrigin(0, 0) === null && hot.validOrigin("x", 1) === null && hot.validOrigin(91, 0) === null, "invalid origins are refused");
ok(JSON.stringify(hot.validOrigin(27.336051, -82.5433576)) === '{"lat":27.34,"lng":-82.54}', "a valid origin comes back rounded");
const SPRING = hot.SPRING_PLACE_IDS[0];
const row = (over) => ({ id: "ChIJsweet0000000001", name: "Sweet", rating: 4.8, reviews: 500, primaryType: "ice_cream_shop", distMi: 1, governed_score: 94, ...over });
const sel = hot.selectHotspots({
  springs: [
    row({ id: SPRING, primaryType: "state_park", distMi: 30, governed_score: 90 }),
    row({ id: "ChIJnotaspring00001", primaryType: "tourist_attraction", name: "Spring Hill Pink Dinosaur", distMi: 2, governed_score: 99 }),
    row({ id: hot.SPRING_PLACE_IDS[1], primaryType: "park", distMi: 61, governed_score: 99 }),
  ],
  sweets: [
    row({ id: "a1", governed_score: 95 }), row({ id: "a2", governed_score: 93 }), row({ id: "a3", governed_score: 92 }), row({ id: "a4", governed_score: 91 }),
    row({ id: "low", rating: 4.4, governed_score: 99 }), row({ id: "thin", reviews: 99, governed_score: 99 }),
    row({ id: "far", distMi: 5.1, governed_score: 99 }), row({ id: "diner", primaryType: "restaurant", governed_score: 99 }),
  ],
});
ok(sel.springs.length === 1 && sel.springs[0].id === SPRING, "only allowlisted springs within 60 miles are picked (a name match on spring is not enough)");
ok(sel.sweets.map((r) => r.id).join() === "a1,a2,a3", "sweets need the venue type, 4.5 and 100 reviews, within 5 miles, best three by score");
const picks = { springs: [{ id: "s", lat: 27.0, lng: -82.0 }], sweets: [{ id: "w", lat: 27.3, lng: -82.5 }] };
const flat = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 69;
ok(hot.nudgeCandidate({ lat: 27.3, lng: -82.505 }, picks, flat)?.place.id === "w", "a sweet spot nudges within 0.4 miles");
ok(hot.nudgeCandidate({ lat: 27.3, lng: -82.52 }, picks, flat) === null, "a sweet spot 1.4 miles off does not nudge");
ok(hot.nudgeCandidate({ lat: 27.03, lng: -82.0 }, picks, flat)?.kind === "spring", "a spring nudges within 3 miles");

// ── 3. serving ──────────────────────────────────────────────────────────────
ok(serve.NEARBY_PICKS_CACHE_CONTROL === "private, no-store, max-age=0", "responses are private, no-store");
const env = () => ({ url: "https://db.example", key: "k" });
const paths = [];
const inv = (over) => ({ place_id: "ChIJsweet0000000001", name: "Main Street Creamery", lat: 27.336, lng: -82.543, category: "food", secondary_categories: [], google_types: ["ice_cream_shop", "dessert_shop"], primary_type: "ice_cream_shop", cuisines: [], signals: { rating: 4.9, reviews: 568 }, photo_ref: null, status: "OPERATIONAL", excluded: false, editorial: null, ...over });
const fakeRead = async (_e, p) => { paths.push(p); return p.includes("place_id=in.")
  ? [inv({ place_id: SPRING, name: "Blue Spring State Park", category: "attractions", primary_type: "state_park", google_types: ["state_park", "park"], lat: 27.5, lng: -82.5, signals: { rating: 4.8, reviews: 18811 } })]
  : [inv({}), inv({ place_id: "ChIJclosed000000001", status: "CLOSED_PERMANENTLY" })]; };
const origin = hot.validOrigin(27.336051, -82.5433576);
const r1 = await serve.serveNearbyPicks(origin, { read: fakeRead, env });
ok(r1.status === 200 && r1.body.status === "ok" && r1.body.partial === false, "a good read answers 200 ok");
ok(r1.body.springs.length === 1 && r1.body.sweets.length === 1 && r1.body.sweets[0].name === "Main Street Creamery", "real rows come back, a closed place is dropped");
ok(!paths.some((p) => /27\.336|82\.543/.test(p)), "no read ever sees the unrounded point");
ok(paths[0].includes("place_id=in.(") && !/lat=|lng=/.test(paths[0]), "the spring read is by allowlist only");
ok(/primary_type=in\.\(/.test(paths[1]) && /lat=gte\./.test(paths[1]), "the sweets read is a bounded box of dessert venue types");
ok(!("signals" in r1.body.sweets[0]) && !("excluded" in r1.body.sweets[0]), "cards carry no raw signals or internal flags");
const r2 = await serve.serveNearbyPicks(origin, { read: async () => { throw new Error("down"); }, env });
ok(r2.status === 503 && r2.body.status === "unavailable", "both reads failing is a loud 503, never an empty product state");
let n = 0;
const r3 = await serve.serveNearbyPicks(origin, { read: async (e, p) => { if (n++ === 0) throw new Error("down"); return fakeRead(e, p); }, env });
ok(r3.status === 200 && r3.body.partial === true, "one read failing is marked partial");
const r4 = await serve.serveNearbyPicks(origin, { read: fakeRead, env: () => null });
ok(r4.status === 503, "missing database configuration is a 503");
const r5 = await serve.serveNearbyPicks(null, { read: fakeRead, env });
ok(r5.status === 400, "no origin is a 400");
const badReq = await serve.parseBody({ json: async () => { throw new Error("bad"); } });
ok(badReq === null, "a malformed body parses to no origin");
const parsed = await serve.parseBody({ json: async () => ({ lat: 27.336051, lng: -82.5433576 }) });
ok(parsed && parsed.lat === 27.34 && parsed.lng === -82.54, "the server rounds the point again on arrival and never uses finer input");

// ── 4. wiring ───────────────────────────────────────────────────────────────
const routeSrc = code("app/api/nearby-picks/route.js");
ok(/export async function POST\s*\(/.test(routeSrc) && !/export (async )?function GET|export const GET/.test(routeSrc), "the route is POST only, so the point never sits in a URL");
const libSrc = code("lib/nearbyPicksServe.js") + code("lib/nearbyHotspots.js");
ok(!/google|serpapi|foursquare|fsq/i.test((libSrc + routeSrc).match(/from\s+["'][^"']+["']/g).join(" ")), "no metered provider is imported");
ok(!/console\.(log|info|warn|error)/.test(code("lib/nearbyPicksServe.js") + routeSrc), "the serving path logs nothing (the point can never reach a log)");
ok(/"\/api\/nearby-picks"/.test(code("middleware.js")), "middleware guards /api/nearby-picks (same-origin + per-IP)");
const intent = code("app/components/IntentPageClient.js");
ok(/dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/NearbyAlerts["']\)/.test(intent) && /intent === "nearby" \? <NearbyAlerts \/>/.test(intent), "/nearby mounts NearbyAlerts lazily and only on the nearby intent");
const comp = code("app/components/NearbyAlerts.js");
const showBody = comp.slice(comp.indexOf("const showPicks"), comp.indexOf("const onPosition"));
ok((comp.match(/getCurrentPosition\(/g) || []).length === 1 && showBody.includes("getCurrentPosition("), "location is asked only inside the tap handler, never on load");
ok(/roundCoord\(pos\.coords\.latitude\)/.test(showBody) && /method: "POST"/.test(showBody), "the point is rounded on the phone and sent once by POST");
const posBody = comp.slice(comp.indexOf("const onPosition"), comp.indexOf("useEffect("));
ok(posBody.indexOf("canAlert(") > -1 && posBody.indexOf("canAlert(") < posBody.indexOf("setNudge("), "the shared policy is checked before any nudge");
ok(!/fetch\(/.test(posBody), "the watch never sends location anywhere");
ok(/if \(!watching/.test(comp) && /visibilitychange/.test(comp) && /clearWatch/.test(comp), "the watch runs only while opted in and stops when the tab is hidden");
ok(!/localStorage\.setItem/.test(comp), "the component writes nothing to storage except through the coordinate-free ledger");
ok(!/viral/i.test(read("app/components/NearbyAlerts.js").replace(/\/\/.*$/gm, "")), "the reader copy never claims a place is viral");

if (fail.length) {
  console.error(`test-nearby-picks: ${fail.length} FAILED, ${pass} passed`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-nearby-picks: ${pass} checks passed (alert policy, hotspot selection, serving, wiring)`);
