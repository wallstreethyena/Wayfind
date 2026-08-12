#!/usr/bin/env node
// scripts/test-marquee-day-trips.mjs — the marquee lane of Worth the Drive.
//
// OWNER (2026-08-11): "give me disney springs give me them parks give me the
// best of the best it's worth the drive… 2 hour drive max." These asserts
// execute the registry, the band, the identity proof and the wiring — a
// regression puts a county park back on top of a rail that promised Disney.
import { readFileSync } from "node:fs";
import {
  MARQUEE_DAY_TRIPS, DRIVE_MAX_MI, IDENTITY_RADIUS_MI, MARQUEE_RAIL_MAX, MARQUEE_FLOOR,
  marqueeCandidates, marqueeDistMi, verifiedMarqueeRow, resolveMarqueeDayTrips,
} from "../lib/marqueeDayTrips.js";

let pass = 0;
const fail = (m) => { console.error("test-marquee-day-trips: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── Registry integrity ─────────────────────────────────────────────────────
ok(MARQUEE_DAY_TRIPS.length >= 12, "the registry holds the state's headline draws");
const keys = MARQUEE_DAY_TRIPS.map((a) => a.key);
ok(keys.length === new Set(keys).size, "anchor keys are unique");
for (const a of MARQUEE_DAY_TRIPS) {
  ok(Number.isFinite(a.lat) && Number.isFinite(a.lng) && a.lat > 24 && a.lat < 31 && a.lng > -88 && a.lng < -79,
    `${a.key} carries real Florida coordinates`);
  ok(a.proof instanceof RegExp && a.proof.test(a.name), `${a.key}'s own name passes its identity proof`);
  ok([1, 2].includes(a.tier) && Array.isArray(a.types) && a.types.length > 0, `${a.key} declares tier and allowed types`);
}
ok(MARQUEE_DAY_TRIPS.some((a) => a.key === "disney_springs") && MARQUEE_DAY_TRIPS.some((a) => a.key === "magic_kingdom"),
  "Disney Springs and the parks are in — the owner's exact ask");
ok(DRIVE_MAX_MI === 110, "the 2-hour cap is 110 straight-line miles (~2h of Florida highway at a 1.2 road factor)");

// ── The band ───────────────────────────────────────────────────────────────
const parrish = { lat: 27.5689, lng: -82.4393 };
const cands = marqueeCandidates(parrish);
ok(cands.length === MARQUEE_RAIL_MAX, "the resolution budget is capped");
ok(cands.every((a) => a.distMi > 17 && a.distMi <= DRIVE_MAX_MI), "every candidate sits inside (minDistanceMi, 2h]");
ok(cands.every((a) => a.tier === 1), "tier 1 fills the budget first when more anchors are in range than seats");
ok(!marqueeCandidates(parrish, { max: 13 }).some((a) => a.key === "kennedy_space_center"),
  "Kennedy Space Center is beyond two hours of Bradenton and is excluded by the cap");
const tampa = { lat: 27.9506, lng: -82.4572 };
ok(!marqueeCandidates(tampa, { max: 13 }).some((a) => a.key === "busch_gardens"),
  "Busch Gardens is NOT a day trip for a Tampa reader — under the near edge it belongs to the nearby rails");
ok(marqueeCandidates(parrish, { max: 13 }).some((a) => a.key === "busch_gardens"),
  "…but it IS one for a Bradenton-area reader");
ok(marqueeCandidates({ lat: NaN, lng: -82 }).length === 0, "no origin, no candidates, never a throw");

// ── Identity proof ─────────────────────────────────────────────────────────
const anchor = MARQUEE_DAY_TRIPS.find((a) => a.key === "magic_kingdom");
const g = (id, name, types, lat, lng, extra) => ({
  id, displayName: { text: name }, rating: 4.7, userRatingCount: 190000, types,
  location: { latitude: lat, longitude: lng }, photos: [{ name: "places/" + id + "/photos/a" }], ...extra,
});
ok(verifiedMarqueeRow(anchor, [g("mk", "Magic Kingdom Park", ["amusement_park", "tourist_attraction"], 28.4177, -81.5812)]) != null,
  "the real park, at its real coordinates, with its real type, is verified");
ok(verifiedMarqueeRow(anchor, [g("shop", "World of Disney", ["gift_shop", "store"], 28.4177, -81.5812)]) == null,
  "a Disney gift shop is not Magic Kingdom — name proof refuses it");
ok(verifiedMarqueeRow(anchor, [g("resort", "Disney's Contemporary Resort", ["tourist_attraction", "hotel"], 28.4155, -81.5779)]) == null,
  "a nearby resort with an allowed type at the right coordinates is refused by NAME — the card must BE the park");
ok(verifiedMarqueeRow(anchor, [g("far", "Magic Kingdom Park", ["amusement_park"], 28.9, -81.58)]) == null,
  "the right name in the wrong place is refused — coordinates are identity too");
ok(verifiedMarqueeRow(anchor, [g("untyped", "Magic Kingdom Park", ["travel_agency"], 28.4177, -81.5812)]) == null,
  "a travel agency named like the park is refused on type");

// ── Resolution: anchor-keyed cache, verified cards only, 2h re-checked ─────
const calls = [];
const fakeFetch = async (url) => {
  calls.push(String(url));
  const u = new URL(String(url), "https://wayfind.test");
  const q = u.searchParams.get("q") || "";
  const a = MARQUEE_DAY_TRIPS.find((x) => x.name === q);
  if (!a) return { ok: true, json: async () => ({ places: [] }) };
  // Google answers with the real venue for the parks, junk for Epic Universe.
  const placesFor = a.key === "epic_universe"
    ? [g("junk", "Epic Universe Gift Outlet", ["store"], a.lat, a.lng)]
    : [g("g-" + a.key, a.name, [a.types[0]], a.lat, a.lng)];
  return { ok: true, json: async () => ({ places: placesFor }) };
};
const rows = await resolveMarqueeDayTrips({ origin: parrish, minDistanceMi: 17, fetchImpl: fakeFetch });
ok(rows.length === MARQUEE_RAIL_MAX - 1, "every verified anchor becomes a card; the unproven one is dropped, never guessed");
ok(rows.every((r) => r.marquee === true && Number.isFinite(r.distMi) && r.distMi <= DRIVE_MAX_MI),
  "every marquee row is stamped, distance-bearing, and inside the 2-hour cap");
ok(!rows.some((r) => /gift outlet/i.test(r.name)), "the junk answer for Epic Universe did not become a card");
for (const u of calls) {
  const url = new URL(u, "https://wayfind.test");
  const q = url.searchParams.get("q"), lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
  const a = MARQUEE_DAY_TRIPS.find((x) => x.name === q);
  ok(a && Math.abs(lat - a.lat) < 0.02 && Math.abs(lng - a.lng) < 0.02,
    "each search is keyed to the ANCHOR's coordinates — one shared cached call per anchor, for every reader on earth");
  ok(!url.searchParams.has("cat"), "no cat param: inventory serving must never answer a named-destination query");
}

// ── Wiring: both surfaces, same module, marquee lane leads ────────────────
const rail = read("app/components/IntentRail.js");
ok(rail.includes('resolveMarqueeDayTrips({ origin: { lat, lng }, minDistanceMi: def.minDistanceMi })'),
  "the home rail resolves the marquee lane with the rail's own near edge");
ok(/intent === "worth-the-drive"[\s\S]{0,700}ranked = marquee\.concat\(ranked\.filter/.test(rail),
  "the marquee lane LEADS the home rail and the local lane backfills, deduped");
ok(rail.indexOf('POOL.set(key, ranked)') > rail.indexOf('ranked = marquee.concat'),
  "the merged rail is what gets cached — a reopened section keeps the marquee lane");
const page = read("app/components/IntentPageClient.js");
ok(page.includes('resolveMarqueeDayTrips({ origin: { lat: loc.lat, lng: loc.lng }, minDistanceMi: def.minDistanceMi })'),
  "the destination page resolves the same lane from the same module");
ok(/intent === "worth-the-drive"[\s\S]{0,700}ranked = marquee\.concat\(ranked\.filter/.test(page),
  "the page leads with the marquee lane too — the card you tapped and the page you landed on agree");
ok(MARQUEE_FLOOR.reviews >= 5000, "the marquee floor demands destination-scale review depth");

console.log(`test-marquee-day-trips: OK — ${pass} assertions (registry, 2h band, identity proof, anchor-keyed cache, two-surface wiring)`);
