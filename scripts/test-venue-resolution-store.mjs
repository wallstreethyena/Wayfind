#!/usr/bin/env node
// test-venue-resolution-store: lib/venueResolutionStore.js, EXECUTED.
//
// The event map publishes the browser's Apple answer for a provider venue to this store; the
// nearby picks, the stays rail and EventPlan subscribe (scripts/test-event-reanchor-render.mjs
// drives the real components). This file pins the store itself: the key, publish / read /
// subscribe / unsubscribe, the 32-entry first-in-first-out cap, the 300 m re-anchor threshold,
// and that one venue can never read another's answer, even with the same name.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REANCHOR_MIN_METERS, VENUE_RESOLUTION_MAX_ENTRIES, venueResolutionKey, publishVenueResolution,
  readVenueResolution, subscribeVenueResolution, shouldReanchor, clearVenueResolutionsForTests, venueResolutionCountForTests,
} from "../lib/venueResolutionStore.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (condition, message) => { if (condition) pass++; else fail.push(message); };
const stripped = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

const TROP = { name: "Tropicana Field", lat: 27.7373, lng: -82.6461 };
const APPLE = { lat: 27.7682, lng: -82.6534 };
const corrected = (over = {}) => ({ status: "corrected", point: APPLE, source: "apple-place", driftMeters: 3500, ...over });

// 1. KEY: the provider point as rendered, name trimmed and lowercased, 5 decimals.
clearVenueResolutionsForTests();
ok(venueResolutionKey(TROP) === JSON.stringify(["tropicana field", "27.73730", "-82.64610"]), `key is JSON of [name, lat.toFixed(5), lng.toFixed(5)] (got ${venueResolutionKey(TROP)})`);
ok(venueResolutionKey({ ...TROP, name: "  TROPICANA Field  " }) === venueResolutionKey(TROP), "key ignores name case and surrounding space");
ok(venueResolutionKey({ ...TROP, lat: "27.7373", lng: "-82.6461" }) === venueResolutionKey(TROP), "numeric strings (EventPlan receives raw row values) key the same as numbers");
ok(venueResolutionKey({ ...TROP, lat: 27.737300001 }) === venueResolutionKey(TROP), "sub-5-decimal noise does not change the key");
ok(venueResolutionKey({ ...TROP, lat: 27.7374 }) !== venueResolutionKey(TROP), "a different point is a different key");
ok(venueResolutionKey({ ...TROP, name: "Tropicana Field Parking" }) !== venueResolutionKey(TROP), "a different name is a different key");
for (const bad of [null, undefined, {}, { name: "x" }, { name: "x", lat: NaN, lng: 1 }, { name: "x", lat: "", lng: "" }, { name: "x", lat: 0, lng: 0 }, { name: "x", lat: 91, lng: 0 }, { name: "x", lat: 1, lng: 181 }]) {
  ok(venueResolutionKey(bad) === null, `no usable point gives a null key (${JSON.stringify(bad)})`);
}
ok(venueResolutionKey({ lat: 27.7, lng: -82.6 }) === JSON.stringify(["", "27.70000", "-82.60000"]), "a missing name still keys on the point");

// 2. PUBLISH / READ.
ok(readVenueResolution(TROP) === null, "nothing published: read is null");
const stored = publishVenueResolution(TROP, corrected());
ok(stored && stored.status === "corrected" && stored.point.lat === APPLE.lat && stored.point.lng === APPLE.lng && stored.driftMeters === 3500 && stored.source === "apple-place", "publish stores point, status, drift and source");
ok(readVenueResolution(TROP) === stored && readVenueResolution({ ...TROP, name: "tropicana field " }) === stored, "read returns the stored entry, found through any spelling of the same key");
ok(readVenueResolution(TROP) === readVenueResolution(TROP), "the same object comes back until the answer changes (stable useSyncExternalStore snapshot)");
ok(Object.isFrozen(stored) && Object.isFrozen(stored.point), "stored entries are frozen");
const strangerPoint = { ...TROP, lat: 27.9, lng: -82.5 };
ok(readVenueResolution(strangerPoint) === null, "the same venue name at another provider point never reads this answer");
ok(readVenueResolution({ ...TROP, name: "Another Arena" }) === null, "another name at the same provider point never reads this answer");
ok(publishVenueResolution(TROP, null) === null && publishVenueResolution(TROP, "x") === null, "a non-object resolution is refused");
ok(publishVenueResolution(TROP, { status: "corrected", point: { lat: NaN, lng: 1 }, driftMeters: 900 }) === null, "a resolution without a usable point is refused");
ok(publishVenueResolution(TROP, { status: "corrected", point: { lat: 0, lng: 0 }, driftMeters: 900 }) === null, "a Null Island point is refused");
ok(publishVenueResolution({ name: "x" }, corrected()) === null, "a venue without a provider point is refused");
ok(readVenueResolution(TROP) === stored, "refused publishes leave the stored answer alone");
const kept = publishVenueResolution({ name: "Kept Hall", lat: 28.1, lng: -82.2 }, { status: "kept", point: { lat: 28.1, lng: -82.2 }, source: "provider", driftMeters: 0 });
ok(kept && kept.status === "kept", "kept and confirmed answers are stored too (the store records, shouldReanchor decides)");
const noDrift = publishVenueResolution({ name: "No Drift", lat: 28.3, lng: -82.3 }, { status: "confirmed", point: { lat: 28.3, lng: -82.3 } });
ok(noDrift && noDrift.driftMeters === 0 && noDrift.source === "", "a missing drift reads as 0 and a missing source as empty, never undefined");

// 3. SUBSCRIBE: wakes on a change, not on an identical repeat, not after unsubscribe, not for another key.
clearVenueResolutionsForTests();
let calls = 0, otherCalls = 0, brokenCalls = 0;
const stop = subscribeVenueResolution(TROP, () => { calls++; });
const stopOther = subscribeVenueResolution(strangerPoint, () => { otherCalls++; });
const stopBroken = subscribeVenueResolution(TROP, () => { brokenCalls++; throw new Error("listener bug"); });
publishVenueResolution(TROP, corrected());
ok(calls === 1 && brokenCalls === 1, "publishing wakes every subscriber of that key once, even when one listener throws");
ok(otherCalls === 0, "a subscriber for another key (same name, other point) is not woken");
publishVenueResolution(TROP, corrected());
ok(calls === 1, "an identical repeat of the same answer wakes nobody");
publishVenueResolution(TROP, corrected({ driftMeters: 4000 }));
ok(calls === 2, "a changed answer wakes subscribers again");
stop();
stop();
publishVenueResolution(TROP, corrected({ driftMeters: 4100 }));
ok(calls === 2 && brokenCalls === 3, "after unsubscribe (twice is harmless) the listener is silent and the others still run");
stopBroken();
stopOther();
ok(typeof subscribeVenueResolution(null, () => {}) === "function" && typeof subscribeVenueResolution(TROP, null) === "function", "subscribing for no venue or with no listener returns a harmless unsubscribe");
subscribeVenueResolution(null, () => {})();

// 4. CAP: 32 entries, first in first out; re-publishing a key never evicts.
clearVenueResolutionsForTests();
ok(VENUE_RESOLUTION_MAX_ENTRIES === 32, "the cap is 32 entries");
const venues = Array.from({ length: 40 }, (_, i) => ({ name: `Venue ${i}`, lat: 27 + i / 100, lng: -82 }));
let evictedWakes = 0;
const stopFirst = subscribeVenueResolution(venues[0], () => { evictedWakes++; });
for (let i = 0; i < 32; i++) publishVenueResolution(venues[i], corrected({ point: { lat: 28 + i / 100, lng: -81 } }));
ok(venueResolutionCountForTests() === 32 && readVenueResolution(venues[0]) !== null, "32 distinct venues fit");
const wakesBefore = evictedWakes;
publishVenueResolution(venues[0], corrected({ point: { lat: 28, lng: -81 }, driftMeters: 9999 }));
ok(venueResolutionCountForTests() === 32 && readVenueResolution(venues[0]) !== null && readVenueResolution(venues[0]).driftMeters === 9999, "updating an existing key does not evict anything");
ok(evictedWakes === wakesBefore + 1, "that update woke its own subscriber");
publishVenueResolution(venues[32], corrected());
ok(venueResolutionCountForTests() === 32, "the 33rd venue keeps the store at 32");
ok(readVenueResolution(venues[0]) !== null, "the oldest entry is NOT evicted while a surface is subscribed to it (an evicted key would flip that surface back to the provider point and refetch)");
ok(readVenueResolution(venues[1]) === null, "the oldest UNSUBSCRIBED entry went instead");
ok(readVenueResolution(venues[2]) !== null && readVenueResolution(venues[32]) !== null, "the next-oldest and the newest are still there");
ok(evictedWakes === wakesBefore + 1, "the subscribed key was not woken by someone else's eviction");
for (let i = 33; i < 40; i++) publishVenueResolution(venues[i], corrected());
ok(venueResolutionCountForTests() === 32 && [2, 3, 4, 5, 6, 7, 8].every((i) => readVenueResolution(venues[i]) === null), "seven more venues evict exactly the seven oldest unsubscribed entries, in order");
ok([0, 9, 10, 31, 32, 33, 39].every((i) => readVenueResolution(venues[i]) !== null), "the subscribed entry and everything newer than the evicted run survive");
stopFirst();
publishVenueResolution(venues[40] = { name: "Venue 40", lat: 27.4, lng: -82 }, corrected());
ok(readVenueResolution(venues[0]) === null && venueResolutionCountForTests() === 32, "once its last subscriber leaves, the oldest entry is evictable again");
stopFirst();

// 5. THRESHOLD: only a CORRECTED answer that moved the venue by MORE than 300 m re-anchors.
ok(REANCHOR_MIN_METERS === 300, "the default threshold is 300 m");
ok(shouldReanchor({ status: "corrected", driftMeters: 300.01 }) === true, "corrected at 300.01 m re-anchors");
ok(shouldReanchor({ status: "corrected", driftMeters: 300 }) === false, "corrected at exactly 300 m does not (strictly more than)");
ok(shouldReanchor({ status: "corrected", driftMeters: 250 }) === false, "corrected at 250 m does not");
ok(shouldReanchor({ status: "corrected", driftMeters: 3500 }) === true && shouldReanchor({ status: "corrected", driftMeters: 10000 }) === true, "corrected by kilometres re-anchors");
ok(shouldReanchor({ status: "confirmed", driftMeters: 5000 }) === false && shouldReanchor({ status: "kept", driftMeters: 5000 }) === false, "a confirmed or kept answer never re-anchors, whatever drift it carries");
ok(shouldReanchor({ status: "corrected", driftMeters: NaN }) === false && shouldReanchor({ status: "corrected" }) === false && shouldReanchor({ status: "corrected", driftMeters: "900" }) === false, "a corrected answer with no numeric drift does not");
ok(shouldReanchor(null) === false && shouldReanchor(undefined) === false && shouldReanchor({}) === false, "no answer does not");
ok(shouldReanchor({ status: "corrected", driftMeters: 150 }, 100) === true && shouldReanchor({ status: "corrected", driftMeters: 150 }, 200) === false, "the threshold is a parameter");

// 6. NO AMBIENT STATE: no window global, no storage, no React.
const code = stripped(readFileSync(path.join(ROOT, "lib/venueResolutionStore.js"), "utf8"));
ok(!/\b(window|document|localStorage|sessionStorage|indexedDB|globalThis|navigator)\b/.test(code), "the store touches no window global and no browser storage");
ok(!/from\s+["']react["']|require\(\s*["']react["']\)/.test(code), "the store imports no React (client-safe, usable from any module)");
ok(!/\bfetch\s*\(|XMLHttpRequest|process\.env/.test(code), "the store makes no request and reads no environment");
ok(!/^\s*import\s/m.test(code), "the store has no imports at all");
const before = Object.keys(globalThis).sort().join(",");
clearVenueResolutionsForTests();
publishVenueResolution(TROP, corrected());
ok(Object.keys(globalThis).sort().join(",") === before, "using the store adds nothing to globalThis");
clearVenueResolutionsForTests();

if (fail.length) {
  console.error(`test-venue-resolution-store: FAIL - ${fail.length} of ${pass + fail.length} assertions`);
  for (const f of fail) console.error("  FAIL: " + f);
  process.exit(1);
}
console.log(`test-venue-resolution-store: OK - ${pass} assertions (key normalisation, publish/read/subscribe/unsubscribe, identical repeats wake nobody, 32-entry first-in-first-out cap, strict 300 m re-anchor threshold, no leak between same-named venues at different points, no window/storage/React).`);
