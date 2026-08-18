#!/usr/bin/env node
// scripts/test-birthday-universe.mjs — the owner's birthday list stays
// servable, honest, and inside the geography it promises.
//
// v8.15 (owner, 2026-08-18): "best place to go on your birthday", with a
// researched four-metro top-10 guide. lib/birthdayUniverse.js is that guide,
// venue-anchored. Mirrors scripts/test-summer-universe.mjs, because the
// registry pattern rots the same three ways wherever it lives:
//
//   · an entry with no placeId AND no sidecar row silently serving nothing
//     while looking curated (the pool-cap disease's cousin, locals v8.7)
//   · a why line drifting into hype or a policy claim the venue can revoke
//     (owner: free-dessert policies "change frequently and are often
//     discretionary" — so no card may promise one)
//   · a broken call reading as honest scarcity (check-rail-source-reachable's
//     whole reason to exist)
import { BIRTHDAY_UNIVERSE, BIRTHDAY_NEAR_RADIUS_MI, BIRTHDAY_DESTINATION_RADIUS_MI, birthdayEntries } from "../lib/birthdayUniverse.js";
import { BIRTHDAY_PLACE_IDS } from "../lib/birthdayPlaceIds.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

/* ── registry shape ─────────────────────────────────────────────────────── */
ok(BIRTHDAY_UNIVERSE.length >= 30,
  `the owner's four-metro guide came in at 34 entries — ${BIRTHDAY_UNIVERSE.length} must not shrink below 30 without an owner call`);
ok(new Set(BIRTHDAY_UNIVERSE.map((e) => e.key)).size === BIRTHDAY_UNIVERSE.length, "entry keys are unique");
ok(new Set(BIRTHDAY_UNIVERSE.map((e) => e.rank)).size === BIRTHDAY_UNIVERSE.length, "curation ranks are unique");
for (const e of BIRTHDAY_UNIVERSE) {
  ok(typeof e.key === "string" && /^[a-z0-9_]+$/.test(e.key), `${e.key}: key is a stable slug`);
  ok(typeof e.label === "string" && e.label.length > 0, `${e.key}: has a label`);
  ok(typeof e.why === "string" && e.why.length > 0 && e.why.length <= 110,
    `${e.key}: the card's editorial line is present and ≤110 chars (got ${e.why && e.why.length})`);
  ok(e.venue && typeof e.venue.name === "string" && typeof e.venue.city === "string",
    `${e.key}: venue carries a real name and city`);
  // Every venue is in Florida — a fat-fingered coordinate would put a card
  // hundreds of miles from the radius gates buildBirthdayPool applies.
  ok(Number.isFinite(e.venue.lat) && Number.isFinite(e.venue.lng)
    && e.venue.lat > 24.3 && e.venue.lat < 31.2 && e.venue.lng > -87.7 && e.venue.lng < -79.8,
    `${e.key}: venue coordinates are inside Florida (got ${e.venue.lat},${e.venue.lng})`);
  // The buzz rule travels here: editorial, never hype.
  ok(!/exploding|spiking|blowing up|everyone'?s searching/i.test(e.why),
    `${e.key}: the why line stays editorial — spike language belongs only behind the real trend flag`);
  // THE POLICY RULE (owner, 2026-08-18): free-dessert / comp claims are
  // discretionary and revocable — a card that promises one is a broken
  // promise waiting for a table. No why line may claim a freebie.
  ok(!/\bfree\b|\bcomplimentary\b|\bon the house\b|\bcomp(ed|s)?\b/i.test(e.why),
    `${e.key}: no free-dessert/comp claim on a card — the owner ruled those policies unclaimable (got "${e.why}")`);
}

/* ── the radii stay sane, and destination is the WIDE tier ──────────────── */
ok(Number.isFinite(BIRTHDAY_NEAR_RADIUS_MI) && BIRTHDAY_NEAR_RADIUS_MI >= 30 && BIRTHDAY_NEAR_RADIUS_MI <= 60,
  `near radius is a birthday-real drive (got ${BIRTHDAY_NEAR_RADIUS_MI})`);
ok(BIRTHDAY_DESTINATION_RADIUS_MI > BIRTHDAY_NEAR_RADIUS_MI,
  "the destination tier widens, never narrows");
ok(BIRTHDAY_UNIVERSE.some((e) => e.destination === true),
  "the destination tier exists — the owner's Orlando destination-birthday call");
ok(BIRTHDAY_UNIVERSE.filter((e) => e.destination === true).every((e) => e.venue.city === "Orlando"),
  "destination entries are exactly the Orlando tier — a local dinner never rides the 120mi reach");

/* ── the wired call can say yes ─────────────────────────────────────────── */
{
  const entries = birthdayEntries();
  ok(entries.length === BIRTHDAY_UNIVERSE.length, "birthdayEntries() returns the whole registry, sidecar merged");
  const withId = entries.filter((e) => e.venue.placeId);
  ok(withId.length >= 20,
    `at least 20 entries carry a usable placeId (inline or sidecar) — got ${withId.length}; below this the rail thins from resolver rot, not scarcity`);
}

/* ── flagship coverage: the owner's own area, and the Tampa Bay reader ──── */
{
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const hav = (aLat, aLng, bLat, bLng) => 2 * R * Math.asin(Math.sqrt(
    Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2));
  const servable = birthdayEntries().filter((e) => e.venue.placeId);
  const from = (lat, lng) => servable.filter((e) => {
    const d = hav(lat, lng, e.venue.lat, e.venue.lng);
    return d <= (e.destination ? BIRTHDAY_DESTINATION_RADIUS_MI : BIRTHDAY_NEAR_RADIUS_MI);
  });
  const bradenton = from(27.4989, -82.5748);
  ok(bradenton.length >= 8,
    `at least 8 servable entries reach a Bradenton reader — got ${bradenton.length}; the flagship reader must see a full rail`);
  const tampa = from(27.9506, -82.4572);
  ok(tampa.length >= 8,
    `at least 8 servable entries reach a Tampa reader — got ${tampa.length}`);
}

/* ── the sidecar stays coherent ─────────────────────────────────────────── */
for (const [k, v] of Object.entries(BIRTHDAY_PLACE_IDS)) {
  ok(BIRTHDAY_UNIVERSE.some((e) => e.key === k), `sidecar key "${k}" belongs to a real registry entry`);
  ok(typeof v === "string" && v.length > 10, `sidecar id for "${k}" looks like a place id`);
}

console.log(fail === 0
  ? `test-birthday-universe: OK — ${pass} assertions (owner's guide servable, no revocable policy claims, Bradenton+Tampa coverage held)`
  : `test-birthday-universe: FAIL — ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
