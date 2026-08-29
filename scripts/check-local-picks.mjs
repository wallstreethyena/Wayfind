#!/usr/bin/env node
/**
 * check-local-picks — the owner's handpicked board (lib/localPicks.js) is the
 * "What Should We Do Today?" card, for one town and one hour. This guard pins
 * the four things that make that sentence true, by executing them.
 *
 *  1. ONE CARD. He pointed at the tile: "Its for this card btw". The registry
 *     feeds `today` and nothing else. Asserted in BOTH directions, because the
 *     tempting next step — letting the dinner picks also feed Tonight's Move —
 *     is a change to six other rails that nobody decided to make.
 *
 *  2. ONE TOWN. Every centroid here sits within ~11 miles of every other, so
 *     the first cut's 12-mile radius served a Parrish reader ALL FIVE boards,
 *     70 places deep — the long directory this exists to replace. Executed at
 *     each market centroid, not read from the source.
 *
 *  3. ONE HOUR. The band FILTERS: morning board at 8am, night board at 8pm.
 *     Display order is the governed score on every rail, so membership is the
 *     only lever the hour has — if this filter stops working the hour stops
 *     meaning anything, and nothing else in the suite would notice.
 *
 *  4. THE BOARD IS THE CARD, so the board must be able to FILL the card.
 *     `today` serves only handpicked rows when a board exists, which means a
 *     thin board is a thin card with no organic fallback behind it. Every
 *     market × every band is asserted to clear MIN_CARDS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOCAL_PICKS, LOCAL_PICK_VENUES, LOCAL_PICK_MARKETS, LOCAL_PICK_RAIL,
  LOCAL_PICK_MARKET_MI, LOCAL_PICK_REACH_MI, LOCAL_PICK_DAYPARTS, BAND_TO_PICK_DAYPART,
  localPickEntries, localPickEntriesNear, localPickMarketsNear, localPickVenue, localPickPending,
} from "../lib/localPicks.js";
import { RAIL_SELECT, LOCAL_PICK_RAILS, MIN_CARDS } from "../lib/railSelect.js";
import { DAYPARTS, DAYPART_IDS } from "../lib/dayparts.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// ── 1. shape ────────────────────────────────────────────────────────────────
const PLACE_ID_RX = /^[A-Za-z0-9_-]{20,}$/;
// The five towns of batch 1, plus the day-trip edge the owner named himself
// (Siesta / Lido). Outside this box is a resolver mismatch — the same-name
// wrong-city failure lib/summerUniverse.js documents.
const BBOX = { minLat: 27.15, maxLat: 27.75, minLng: -82.80, maxLng: -82.28 };

ok(Object.keys(LOCAL_PICK_MARKETS).length === 5, "batch 1 covers five markets");
for (const [id, m] of Object.entries(LOCAL_PICK_MARKETS)) {
  ok(Number.isFinite(m.lat) && Number.isFinite(m.lng), `${id}: market has coordinates`);
  ok(m.lat >= BBOX.minLat && m.lat <= BBOX.maxLat && m.lng >= BBOX.minLng && m.lng <= BBOX.maxLng,
    `${id}: market centre is inside the Manatee/Sarasota box`);
}

const seenPlaceId = new Map();
for (const [key, v] of Object.entries(LOCAL_PICK_VENUES)) {
  ok(!!v.name && !!v.city, `${key}: has a name and a city`);
  const resolved = localPickVenue(key);
  if (!resolved.placeId) continue;                     // pending — nothing to assert
  ok(PLACE_ID_RX.test(resolved.placeId), `${key}: place_id is well formed`);
  ok(Number.isFinite(v.lat) && Number.isFinite(v.lng), `${key}: a resolved venue carries coordinates`);
  ok(v.lat >= BBOX.minLat && v.lat <= BBOX.maxLat && v.lng >= BBOX.minLng && v.lng <= BBOX.maxLng,
    `${key}: ${v.name} sits inside the Manatee/Sarasota box (${v.lat}, ${v.lng})`);
  // Two keys sharing one id would put the same card on the rail twice.
  ok(!seenPlaceId.has(resolved.placeId),
    `${key}: place_id is not already used by "${seenPlaceId.get(resolved.placeId)}"`);
  seenPlaceId.set(resolved.placeId, key);
}

const slots = new Set();
for (const p of LOCAL_PICKS) {
  ok(!!LOCAL_PICK_MARKETS[p.market], `${p.key}: "${p.market}" is a real market`);
  ok(LOCAL_PICK_DAYPARTS.includes(p.daypart), `${p.key}: "${p.daypart}" is a real daypart`);
  ok(!!LOCAL_PICK_VENUES[p.key], `placement references a real venue: ${p.key}`);
  ok(Number.isInteger(p.rank) && p.rank > 0, `${p.key}: rank is a positive integer`);
  ok(!!p.why && p.why.length <= 110, `${p.key}/${p.market}/${p.daypart}: why line is <= 110 chars`);
  // The card's own chip prints the score and the hours; a curation line that
  // also claims them is a second, unversioned source of truth.
  ok(!/\bopen now\b|\bopen 24\b|★|\bguaranteed\b/i.test(p.why), `${p.key}: why line claims no hours or rating`);
  const slot = `${p.market}/${p.daypart}/${p.key}`;
  ok(!slots.has(slot), `no duplicate placement: ${slot}`);
  slots.add(slot);
}

// ── 2. ONE CARD (failure 1) ─────────────────────────────────────────────────
eq(LOCAL_PICK_RAILS, [LOCAL_PICK_RAIL], "the registry declares exactly one rail");
ok(!!RAIL_SELECT[LOCAL_PICK_RAIL], `"${LOCAL_PICK_RAIL}" is a real rail`);
const todayPools = RAIL_SELECT[LOCAL_PICK_RAIL].pools;
ok(todayPools.includes("localpicks"), "the today rail reads the localpicks pool");
// FIRST, not last. selectFor() dedupes by id and keeps the first pool a row
// appears in. With a board active only handpicked rows pass the pick, so an
// organic row seen first would be dropped by the pick AND would have consumed
// the id — the handpicked clone of the same venue could never get in, and the
// owner's #1 would silently vanish from his own card.
eq(todayPools[0], "localpicks", `today reads localpicks FIRST (${todayPools.join(", ")}) — last would swallow the board`);
for (const r of Object.keys(RAIL_SELECT)) {
  if (r === LOCAL_PICK_RAIL) continue;
  ok(!(RAIL_SELECT[r].pools || []).includes("localpicks"),
    `rail "${r}" does not read the handpicked board — it is for one card only`);
}

// ── 3. ONE HOUR (failure 3) ─────────────────────────────────────────────────
for (const b of DAYPART_IDS) {
  ok(!!BAND_TO_PICK_DAYPART[b], `band "${b}" maps to a pick daypart`);
  ok(LOCAL_PICK_DAYPARTS.includes(BAND_TO_PICK_DAYPART[b]), `band "${b}" maps to a real daypart`);
  ok(!!DAYPARTS[b], `band "${b}" is a real daypart band`);
}
eq(Object.keys(BAND_TO_PICK_DAYPART).sort(), [...DAYPART_IDS].sort(),
  "every rendered band has a mapping — an unmapped band would serve nothing");

// ── 4. fail-closed ──────────────────────────────────────────────────────────
const entries = localPickEntries();
const pending = localPickPending();
ok(entries.length > 0, "the board serves something");
for (const key of pending) {
  ok(!entries.some((e) => e.key === key),
    `${key}: an unresolved venue serves NOTHING until the resolver fills its id`);
}
for (const e of entries) ok(!!e.venue.placeId, `${e.key}: a served entry always carries a place_id`);

// ── 5. ONE TOWN, ONE HOUR, AND ENOUGH TO FILL (failures 2 and 4) ────────────
for (const [id, m] of Object.entries(LOCAL_PICK_MARKETS)) {
  const at = { lat: m.lat, lng: m.lng };
  eq(localPickMarketsNear(at).map((x) => x.id), [id],
    `a reader at ${m.label} gets exactly one board, and it is ${m.label}'s`);
  const byBand = {};
  for (const b of DAYPART_IDS) {
    const served = localPickEntriesNear(at, b);
    byBand[b] = served;
    ok(served.length >= MIN_CARDS,
      `${m.label} / ${b}: the board can fill the card (${served.length} >= ${MIN_CARDS})`);
    ok(served.every((e) => e.market === id), `${m.label} / ${b}: no neighbouring town's picks leak in`);
    ok(served.every((e) => e.daypart === BAND_TO_PICK_DAYPART[b]),
      `${m.label} / ${b}: only ${BAND_TO_PICK_DAYPART[b]} picks are served`);
    ok(served.every((e) => Number.isFinite(e.venue.lat)), `${m.label} / ${b}: every served pick is venue-anchored`);
  }
  // The filter is REAL: the morning card and the night card are different
  // cards. If these ever became equal the hour would have stopped mattering
  // while every other assertion here still passed.
  const ids = (b) => new Set(byBand[b].map((e) => e.venue.placeId));
  const mIds = ids("morning"), nIds = ids("night");
  ok([...mIds].some((x) => !nIds.has(x)), `${m.label}: the morning board is not the night board`);
  ok([...nIds].some((x) => !mIds.has(x)), `${m.label}: the night board is not the morning board`);
  // …and the owner's one "afternoon" covers both of the app's midday bands,
  // and his one "night" covers evening + late night.
  eq([...ids("lunch")].sort(), [...ids("afternoon")].sort(),
    `${m.label}: lunch and afternoon share the owner's afternoon board`);
  eq([...ids("evening")].sort(), [...ids("night")].sort(),
    `${m.label}: evening and night share the owner's night board`);
}
// Out of coverage is EMPTY, never the nearest-by-arithmetic town.
for (const [label, pt] of [["Tampa", { lat: 27.95, lng: -82.46 }], ["Miami", { lat: 25.77, lng: -80.19 }], ["nowhere", { lat: NaN, lng: NaN }]]) {
  eq(localPickMarketsNear(pt), [], `${label}: outside batch 1, no board`);
  for (const b of DAYPART_IDS) eq(localPickEntriesNear(pt, b), [], `${label} / ${b}: outside batch 1, no picks`);
}
// An unknown band serves NOTHING, never all three boards at once.
eq(localPickEntriesNear({ lat: 27.5714, lng: -82.4276 }, "elevenses"), [],
  "an unrecognised band serves nothing, never every daypart merged");

// ── 6. the today predicate ──────────────────────────────────────────────────
const pick = RAIL_SELECT[LOCAL_PICK_RAIL].pick;
const handpicked = { id: "ChIJhandpickedhandpicked", name: "Handpicked", _ownerPicked: true, rating: 4.5, reviews: 100, types: [], distMi: 3 };
const organic = { id: "ChIJorganicorganicorganic", name: "Organic", rating: 4.7, reviews: 900, types: [], distMi: 3 };
ok(pick(handpicked, { ownerBoard: true }) === true, "board on: a handpicked row is the card");
ok(pick(organic, { ownerBoard: true }) === false, "board on: the ranked pool does not dilute the board");
ok(pick(organic, { ownerBoard: false }) === true, "board off: the rail behaves exactly as it did before");
ok(pick(organic, undefined) === true, "no ctx at all: the rail behaves exactly as it did before");
// The summer registry's own rule must survive the new branch.
const summerElsewhere = { id: "ChIJsummersummersummerx", name: "Far Summer", _summerSourced: true, _summerRails: ["eat"], distMi: 200, types: [] };
ok(pick(summerElsewhere, { ownerBoard: false }) === false, "board off: the summer rule is untouched");

// ── 7. the band has to REACH the server (the silent-break check) ────────────
// This one is a source assertion on purpose. Everything above proves the
// filter works given a band; none of it would notice if the client stopped
// sending one or the route stopped reading it, and the symptom would be a
// homepage frozen on whichever board the CDN warmed in — with every guard
// green. Both ends are pinned.
const route = readFileSync(new URL("../app/api/rails/route.js", import.meta.url), "utf8");
const rail = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
ok(/DAYPART_IDS\.includes\(askedBand\)/.test(route), "/api/rails validates the band against DAYPART_IDS");
ok(/railMenuData\(slug, \{[^}]*band[^}]*\}\)/.test(route), "/api/rails passes the band into railMenuData");
ok(/\/api\/rails\?[^`]*band=\$\{encodeURIComponent\(daypart\)\}/.test(rail), "DaypartRail sends the reader's band");
ok(/daypart === initialDaypart/.test(rail), "DaypartRail refetches when the band moves, not only when the reader does");
// The board is a "near you" claim, so it is built from the READER's point and
// never from a city centroid. Sarasota's centre sits 8 miles from Lakewood
// Ranch's — inside LOCAL_PICK_MARKET_MI — so building from `origin` would hand
// the prerendered homepage's flagship ranking a board it has no reader for, and
// every cold visitor on earth would see one Florida town's picks at first paint.
const railsData = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");
ok(/buildLocalPicksPool\(pools, userOrigin, band\)/.test(railsData),
  "the board is built from the reader's own point (userOrigin), never a city centroid");
ok(/ownerBoard: pools\.localpicks\.length > 0/.test(railsData),
  "ownerBoard is derived from the pool that was actually built, never from the registry");

const resolved = Object.keys(LOCAL_PICK_VENUES).length - pending.length;
console.log(`check-local-picks: ${n} assertions OK · ${Object.keys(LOCAL_PICK_VENUES).length} venues `
  + `(${resolved} resolved, ${pending.length} pending: ${pending.join(", ") || "none"}) · `
  + `${LOCAL_PICKS.length} placements · ${entries.length} serving on the ${LOCAL_PICK_RAIL} card · `
  + `market ${LOCAL_PICK_MARKET_MI}mi, reach ${LOCAL_PICK_REACH_MI}mi`);
