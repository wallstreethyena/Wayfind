// A single Places 429 must not shut photos off. Five rate limits in a minute
// open a short breaker. A confirmed daily-quota signal opens it immediately.
// After the backoff, one probe is allowed. An open breaker serves this place's
// stored photo, or the existing fallback image when nothing is stored.
import {
  FALLBACK_PATH,
  GOOGLE_PHOTOS_QUOTA_PROVIDER,
  resolvePlacePhoto,
} from "../lib/placePhotoServe.js";
import {
  PHOTO_RATE_TRIP_COUNT,
  claimHalfOpenProbe,
  photoBackoffMs,
  placesPhotoRecovered,
  placesPhotoTrip,
  resetPlacesPhotoBreaker,
} from "../lib/placesPhotoBreaker.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const eq = (actual, expected, m) => ok(actual === expected, `${m} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const PLACE = "ChIJPlacesBreakerTest01";
const NAME = `places/${PLACE}/photos/CURRENTNAME`;
const OWNED = "https://lh3.googleusercontent.com/p/AF1QipPlacesBreaker=s640-k-no";
const STORED = `/api/photo/stored/${PLACE}?v=abc`;
const NOW = Date.UTC(2026, 10, 9, 22, 32, 0);

function jsonRes(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function scripted(steps) {
  const calls = [];
  const fn = async (url) => {
    const u = String(url);
    const kind = u.includes("?fields=photos") ? "details" : "media";
    calls.push(kind);
    const step = steps.shift();
    if (!step) throw new Error("unexpected " + kind);
    if (step.throw) throw new Error("offline");
    return jsonRes(step.status, step.body);
  };
  return { fn, calls };
}
function breaker() {
  let row = null;
  const trips = [];
  return {
    trips,
    breakerOpen: async () => row,
    tripBreaker: async (provider, kind, reason, cooldownMs) => {
      trips.push({ provider, kind, reason, cooldownMs });
      row = { kind, reason, at: new Date(NOW).toISOString(), expiresAt: new Date(NOW + cooldownMs).toISOString() };
      return true;
    },
    expire() { if (row) row.expiresAt = new Date(NOW - 1000).toISOString(); },
    close() { row = null; },
  };
}
const detailsOk = { status: 200, body: { photos: [{ name: NAME }] } };
const rateLimit = { status: 429, body: { error: { message: "too many requests" } } };
const daily = { status: 429, body: { error: { status: "RESOURCE_EXHAUSTED", message: "redacted-in-test" } } };

async function once(fetchImpl, b, extra = {}) {
  let grants = 0;
  const result = await resolvePlacePhoto({
    place: PLACE, w: 640, serverKey: "server-key-test", googleSurface: true, retainGoogle: extra.retain === true,
    authorizeSpend: async () => { grants++; return true; },
  }, {
    inventoryGet: async () => null,
    retryDelayMs: 0,
    fetchImpl,
    now: NOW,
    breakerOpen: b.breakerOpen,
    tripBreaker: b.tripBreaker,
    photoStore: extra.photoStore || { read: async () => null, claim: async () => ({ state: "claimed", token: "t" }), save: async () => null, fail: async () => true },
  });
  return { result, grants };
}

resetPlacesPhotoBreaker();

// One bare 429 does not open the breaker, and the next request still reaches Google.
{
  const b = breaker();
  const first = scripted([detailsOk, rateLimit]);
  const a = await once(first.fn, b);
  eq(b.trips.length, 0, "one 429 does not open the breaker");
  eq(a.result.reason, "owned-miss", "one 429 is an honest miss for that request");
  eq(a.grants > 0, true, "one 429 still spent only through the existing ledger gate");
  const second = scripted([detailsOk, { status: 200, body: { photoUri: OWNED } }]);
  const c = await once(second.fn, b);
  eq(second.calls.includes("media"), true, "one 429 does not block the next photo");
  eq(c.result.type, "redirect", "the next photo is served");
  eq(c.result.location, OWNED, "the next photo is the place's own Google photo");
}

// N rate limits open the breaker. The next request does not call Google.
{
  resetPlacesPhotoBreaker();
  const b = breaker();
  for (let i = 1; i <= PHOTO_RATE_TRIP_COUNT; i++) {
    const s = scripted([detailsOk, rateLimit]);
    await once(s.fn, b);
    eq(b.trips.length, i === PHOTO_RATE_TRIP_COUNT ? 1 : 0, `rate limit ${i} of ${PHOTO_RATE_TRIP_COUNT} ${i === PHOTO_RATE_TRIP_COUNT ? "opens" : "does not open"} the breaker`);
  }
  eq(b.trips[0].provider, GOOGLE_PHOTOS_QUOTA_PROVIDER, "the trip uses the photo breaker key");
  eq(b.trips[0].cooldownMs, photoBackoffMs(0), "the first open is the short base backoff");
  ok(b.trips[0].cooldownMs < 60 * 1000, "the backoff is under a minute, not until midnight");
  const blocked = scripted([detailsOk, { status: 200, body: { photoUri: OWNED } }]);
  const held = await once(blocked.fn, b);
  eq(blocked.calls.length, 0, "an open breaker makes zero Places calls");
  eq(held.grants, 0, "an open breaker does not take a ledger grant");
  eq(held.result.reason, "quota-open", "an open breaker with no cache reports quota-open");
  eq(held.result.location, FALLBACK_PATH, "no cache serves the existing placeholder");
}

// After the backoff, one probe runs. A success closes the breaker.
{
  resetPlacesPhotoBreaker();
  const pure = [];
  for (let i = 0; i < PHOTO_RATE_TRIP_COUNT - 1; i++) pure.push(placesPhotoTrip({ upstream: "fresh-failed:quota", daily: false, status: 429, now: NOW + i }));
  eq(pure.every((row) => row.trip === false), true, "the pure window stays closed before N");
  const opened = placesPhotoTrip({ upstream: "fresh-failed:quota", daily: false, status: 429, now: NOW + PHOTO_RATE_TRIP_COUNT });
  eq(opened.trip, true, "the Nth pure rate limit opens");
  eq(opened.cooldownMs, photoBackoffMs(0), "pure open uses the base backoff");
  placesPhotoRecovered();
  const again = placesPhotoTrip({ upstream: "fresh-failed:quota", daily: false, status: 429, now: NOW + 10 });
  eq(again.trip, false, "a recovered window starts over");
  const dailyTrip = placesPhotoTrip({ upstream: "fresh-failed:quota", daily: true, status: 429, now: NOW + 11 });
  eq(dailyTrip.trip && dailyTrip.signal === "daily" && dailyTrip.cooldownMs === photoBackoffMs(0), true, "RESOURCE_EXHAUSTED opens immediately on the short backoff");
  const second = placesPhotoTrip({ upstream: "place-lookup-failed:quota", daily: true, status: 403, now: NOW + 12 });
  eq(second.cooldownMs, photoBackoffMs(1), "the next confirmed signal doubles the backoff");
  ok(second.cooldownMs <= 5 * 60 * 1000, "the doubled backoff stays capped well short of midnight");
}

// Half-open: while a probe lease is held, a second request does not call Google.
{
  resetPlacesPhotoBreaker();
  const b = breaker();
  b.tripBreaker(GOOGLE_PHOTOS_QUOTA_PROVIDER, "quota", "test", 15000);
  b.expire();
  ok(claimHalfOpenProbe(NOW), "the first half-open probe claims the lease");
  const waiting = scripted([detailsOk, { status: 200, body: { photoUri: OWNED } }]);
  const held = await once(waiting.fn, b);
  eq(waiting.calls.length, 0, "a second request during the probe does not call Google");
  eq(held.result.location, FALLBACK_PATH, "the waiting request gets the placeholder");
  placesPhotoRecovered();
  const probe = scripted([detailsOk, { status: 200, body: { photoUri: OWNED } }]);
  const served = await once(probe.fn, b);
  eq(probe.calls.includes("media"), true, "after the probe succeeds, photos are fetched again");
  eq(served.result.location, OWNED, "the recovered probe serves the place photo");
}

// Open breaker serves the stored photo of this place and does not call Google.
{
  resetPlacesPhotoBreaker();
  const b = breaker();
  await b.tripBreaker(GOOGLE_PHOTOS_QUOTA_PROVIDER, "quota", "test", 15000);
  const fetchImpl = scripted([detailsOk]);
  const hit = await once(fetchImpl.fn, b, { retain: true, photoStore: { read: async () => ({ src: STORED, credit: { name: "Ada" } }), claim: async () => { throw new Error("no claim"); }, save: async () => null, fail: async () => true } });
  eq(fetchImpl.calls.length, 0, "a stored photo is served without a Places call");
  eq(hit.grants, 0, "a stored photo does not take a ledger grant");
  eq(hit.result.location, STORED, "the open breaker serves this place's stored photo");
  eq(hit.result.reason, "google-stored", "the stored photo keeps its own reason");
}

if (fail.length) {
  for (const m of fail) console.error("FAIL:", m);
  process.exit(1);
}
console.log(`test-places-photo-breaker: ${pass}/${pass} passed`);
