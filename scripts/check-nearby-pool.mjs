#!/usr/bin/env node
/**
 * check-nearby-pool — THE CANDIDATES MUST COME FROM WHERE THE READER IS.
 *
 * THE DEFECT, measured 2026-08-22 with the owner standing in Sarasota: the
 * homepage served him the same list it serves from Parrish, eighteen miles
 * away. Not a ranking problem — a RETRIEVAL one. Every rail's candidates came
 * from rankedFor(category, CITY): a Google "best X" search around a centroid,
 * `pool.slice(0, 15)` rows per category per town, so a metro's four towns gave
 * every rail on the page a field of about 150 places. Owned inventory within
 * seventeen miles of that Sarasota pin: 2,319, of which 960 are food.
 *
 * And rankedFor's second round drops the city name and searches 30 miles,
 * accepting results out to 39 — so two towns eighteen miles apart retrieve from
 * what is effectively one circle, and marketReviewFloor then strips the small
 * local rooms out of both. Identical answers, by construction.
 *
 * WHAT THIS GUARD PINS, and none of it can be satisfied by editing a list:
 *   1. The ladder tightens before it widens, and a ring only widens when it
 *      cannot fill — that is the whole mechanism that lets one rule serve a
 *      downtown and a rural town honestly.
 *   2. The same discovery gate the city path uses runs here too, or this pool
 *      becomes the one door in the app a tennis court can walk through into
 *      Beach Day.
 *   3. The primary type survives shaping (v8.19 and v8.30.1 both lost a rail to
 *      dropping it).
 *   4. The pool is NOT capped at fifteen. The cap is the defect.
 *   5. A failed inventory read is LOUD. The identity pools read the same table
 *      inside a bare `if (r.ok)`, so a rotated key would send every rail back to
 *      the anchor top-N with nothing in the logs — and this project's legacy
 *      anon JWT is ALREADY disabled and answers 401.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NEARBY_CATS, NEARBY_RINGS_MI, NEARBY_BEACH_RINGS_MI, NEARBY_TARGET_ROWS,
  NEARBY_STANDALONE_MIN, shapeNearbyRow, nearbyBbox, nearbyMiBetween,
  buildNearbyPool,
} from "../lib/nearbyPool.js";
import { BEACH_NEAR_MI } from "../lib/beaches.js";
import { MIN_CARDS } from "../lib/railSelect.js";
import { RAIL_SELECT } from "../lib/railSelect.js";
import * as NEARBY from "../lib/nearbyPool.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const SARASOTA = { lat: 27.3364, lng: -82.5307 };

// ── 1. the ladder ───────────────────────────────────────────────────────────
ok(NEARBY_RINGS_MI.length >= 2, "the ladder has more than one rung, or it is just a radius");
eq([...NEARBY_RINGS_MI].sort((a, b) => a - b), NEARBY_RINGS_MI,
  `the ladder tightens before it widens (${NEARBY_RINGS_MI.join(" → ")}) — a descending ladder retrieves the region first and the neighbourhood never`);
ok(NEARBY_RINGS_MI[0] <= 6,
  `the first rung is a neighbourhood, not a metro (${NEARBY_RINGS_MI[0]}mi). 691 of Sarasota's places sit within five miles; a first rung past that spends the dense case on the sparse one`);
ok(NEARBY_RINGS_MI[NEARBY_RINGS_MI.length - 1] >= 17,
  "the last rung still reaches a thin market — Parrish holds 106 places within five miles");
eq(NEARBY_BEACH_RINGS_MI, [BEACH_NEAR_MI],
  "beaches keep the owner's 23-mile rule, imported and not restated — there is exactly one of it");

// ── 2. the ladder, which is the only thing left with a number ───────────────
// v8.33 — NEARBY_POOL_CAP is GONE (owner: "no more max on anything"). It was
// 60, justified as "several rails deep", and with the card ceiling removed
// there was nothing left for it to be deep ENOUGH for: every row it was
// trimming had already passed the category gate, the identity and the
// discovery filter. Sixty was the fifteen-row cap this module exists to delete,
// wearing a bigger number.
//
// NEARBY_TARGET_ROWS is NOT a cap and must survive. It stops the LADDER —
// reach it in the 6-mile ring and the pool never widens to 17 — which is the
// entire mechanism that keeps a dense downtown local. Removing it would widen
// every reader to the furthest ring and hand back the "Sarasota gets Parrish's
// list" defect this module was written for. Asserted here so nobody deletes it
// in the name of the same instruction that correctly deleted the others.
ok(!Object.prototype.hasOwnProperty.call(NEARBY, "NEARBY_POOL_CAP"),
  "there must be no pool ceiling — a survivor of the identity has earned its place in the field");
ok(NEARBY_TARGET_ROWS > 15,
  `the ladder must not stop at the fifteen that caused this (${NEARBY_TARGET_ROWS})`);
ok(NEARBY_TARGET_ROWS >= MIN_CARDS * 8,
  "the ring stops widening at a real field, not at one rail's worth");
ok(NEARBY_STANDALONE_MIN >= MIN_CARDS,
  "the standalone floor is at least a rail's minimum");

// ── 3. the category map is real on both sides ───────────────────────────────
const railPools = new Set(Object.values(RAIL_SELECT).flatMap((c) => c.pools));
for (const [slug, cfg] of Object.entries(NEARBY_CATS)) {
  ok(railPools.has(slug), `"${slug}" is a pool some rail actually reads`);
  ok(!!cfg.column && !!cfg.gate, `${slug}: maps to an inventory category and a discovery gate`);
}
// The four inventory categories that carry discovery inventory. `hotels` and
// `shopping` are deliberately absent: no rail reads them as an anchor pool.
eq(Object.values(NEARBY_CATS).map((c) => c.column).sort(),
  ["attractions", "beach", "food", "nightlife"],
  "the inventory categories are the four a rail can anchor on");

// ── 4. shaping: the gate runs, and the primary type survives ────────────────
const row = (over) => ({
  place_id: "ChIJshapeshapeshapeshape", name: "Test Room", lat: 27.34, lng: -82.53,
  primary_type: "restaurant", google_types: ["restaurant", "food"],
  signals: { rating: 4.6, reviews: 200 }, photo_ref: "ref", status: "OPERATIONAL", ...over,
});
const shaped = shapeNearbyRow(row(), SARASOTA, "food");
ok(!!shaped, "a real food row shapes");
ok(shaped.primaryType === "restaurant",
  "the PRIMARY TYPE survives shaping — v8.19 and v8.30.1 each lost a rail to dropping it");
ok(Array.isArray(shaped.types) && shaped.types.length > 0, "the type array survives shaping");
ok(Number.isFinite(shaped.distMi) && shaped.distMi < 2, "the distance is measured from the READER");
ok(shaped.photoRef === "ref", "the photo ref survives — a card without one is a broken card");
// The floor: a place with no rating cannot be scored, and the governed score
// would be null, which sorts last by construction anyway.
ok(shapeNearbyRow(row({ signals: { rating: 0, reviews: 900 } }), SARASOTA, "food") === null,
  "an unrated row is refused rather than ranked on an invented figure");
ok(shapeNearbyRow(row({ signals: { rating: 4.9, reviews: 3 } }), SARASOTA, "food") === null,
  "a three-review row is refused");
ok(shapeNearbyRow(row({ lat: null }), SARASOTA, "food") === null, "a row with no coordinates is refused");
ok(shapeNearbyRow(null, SARASOTA, "food") === null, "a malformed row is refused, never thrown on");
// THE DISCOVERY GATE. This is the door that keeps a tennis court out of Beach
// Day and a contractor out of Activities — the same placeAllowed() the city
// path applies to its Google results.
// THE DISCOVERY GATE, on its own. placeAllowed() is the door the city path
// puts its Google results through, and inventory has to walk through the same
// one — otherwise this pool becomes the only place in the app where a service
// business is an attraction. These rows are refused by the GATE alone: no
// category identity is involved, so deleting placeAllowed shows up here.
ok(shapeNearbyRow(row({
  place_id: "ChIJcontractorcontractor1", name: "Gulf Coast Roofing & General Contractor",
  primary_type: "general_contractor", google_types: ["general_contractor", "roofing_contractor"],
}), SARASOTA, "attractions") === null, "a general contractor is not an attraction — the discovery gate refuses it");
ok(shapeNearbyRow(row({
  place_id: "ChIJlawyerlawyerlawyer12", name: "Sarasota Injury Law Offices",
  primary_type: "lawyer", google_types: ["lawyer", "point_of_interest"],
}), SARASOTA, "attractions") === null, "nor is a law office");
ok(shapeNearbyRow(row({
  place_id: "ChIJdentistdentistdenti1", name: "Bayfront Family Dentistry",
  primary_type: "dentist", google_types: ["dentist"],
}), SARASOTA, "food") === null, "nor is a dentist a restaurant");

// THE CATEGORY IDENTITY, exercised exactly as production calls it. The
// discovery gate alone is not enough for beaches: placeAllowed's beach rule
// admits on the NAME, so every row below walks through it.
const beachOpts = { identity: NEARBY_CATS.beaches.identity };
ok(typeof NEARBY_CATS.beaches.identity === "function",
  "the beaches pool carries an identity, not just a gate — the gate admits anything named 'beach'");
const notABeach = (over, why) => ok(
  shapeNearbyRow(row(over), SARASOTA, "beach", beachOpts) === null, why);
notABeach({ place_id: "ChIJtenniscourttenniscourtx", name: "Holmes Beach Tennis Courts", primary_type: "tennis_court", google_types: ["tennis_court"] },
  "a tennis court categorised `beach` in inventory does not become a beach");
notABeach({ place_id: "ChIJmassagemassagemassagex", name: "Beach Therapy - (Asian massage)", primary_type: "massage_spa", google_types: ["massage_spa"] },
  "nor does a massage spa whose NAME contains 'Beach'");
notABeach({ place_id: "ChIJaccessaccessaccessacc", name: "Public Beach Access 5", primary_type: "beach", google_types: ["beach"] },
  "nor a numbered beach ACCESS — primary type `beach` and still not a beach");
notABeach({ place_id: "ChIJparkingparkingparking", name: "Coquina Beach Parking", primary_type: "park", google_types: ["park"] },
  "nor the car park");
notABeach({ place_id: "ChIJtowertowertowertower", name: "Coquina Beach Lifeguard / Paramedic Tower", primary_type: "beach", google_types: ["beach"] },
  "nor the lifeguard tower");
notABeach({ place_id: "ChIJweddingweddingwedding", name: "Siesta key Beach,Florida", primary_type: "wedding_venue", google_types: ["wedding_venue"] },
  "nor the wedding venue");
notABeach({ place_id: "ChIJpreservepreserveprese", name: "Apollo Beach Preserve", primary_type: "nature_preserve", google_types: ["nature_preserve"] },
  "nor a bayside nature preserve with 4,733 reviews and no swimmable beach");
// …and the real ones survive, or the identity has been drawn too tight.
for (const [nm, pt] of [["Siesta Beach", "beach"], ["Manatee Public Beach", "beach"], ["Coquina Beach", "beach"], ["Manatee Beach Park", "beach"], ["Pass A Grille Dog Beach", "beach"]]) {
  ok(shapeNearbyRow(row({ place_id: "ChIJreal" + nm.replace(/\W/g, "").slice(0, 18).padEnd(18, "x"), name: nm, primary_type: pt, google_types: [pt] }), SARASOTA, "beach", beachOpts) !== null,
    `${nm} is still a beach — an identity that drops the real ones is drawn too tight`);
}

// ── 5. the bbox contains its ring ───────────────────────────────────────────
for (const r of [...NEARBY_RINGS_MI, BEACH_NEAR_MI]) {
  const b = nearbyBbox(SARASOTA, r);
  for (const [dLat, dLng] of [[r / 69, 0], [-r / 69, 0], [0, r / 55], [0, -r / 55]]) {
    const pt = { lat: SARASOTA.lat + dLat, lng: SARASOTA.lng + dLng };
    if (nearbyMiBetween(SARASOTA.lat, SARASOTA.lng, pt.lat, pt.lng) > r) continue;
    ok(pt.lat >= b.minLat && pt.lat <= b.maxLat && pt.lng >= b.minLng && pt.lng <= b.maxLng,
      `the ${r}mi bbox contains a point inside the ${r}mi ring — a box that clips the ring drops real rows`);
  }
}

// ── 6. no credentials, no invention ─────────────────────────────────────────
// HERMETIC: this guard never READS the ambient environment — it only ever SETS
// explicit values for its own assertions. check-guard-hermeticity caught the
// first draft doing the save-and-restore dance, and it was right to: a guard
// that consults the shell gives one verdict in a clean terminal and another in
// one with .env.production.local sourced.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
eq(await buildNearbyPool(SARASOTA, "restaurants"), [], "with no credentials the pool is EMPTY, never guessed");
eq(await buildNearbyPool(null, "restaurants"), [], "with no reader point the pool is empty — this is a near-ME pool or it is nothing");
eq(await buildNearbyPool(SARASOTA, "hotels"), [], "an unmapped category returns empty rather than a wrong table");

// ── 7. the ladder and the read, executed against a stub ─────────────────────
// No network: a fetch stub that answers the tight ring thinly and the wide one
// fully proves the widening actually happens, and that a thin ring never LOSES
// rows the wider ring found.
{
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub";
  const mk = (i, lat) => ({
    place_id: "ChIJstub" + String(i).padStart(16, "0"), name: "Stub Room " + i,
    lat, lng: -82.5307, primary_type: "restaurant", google_types: ["restaurant"],
    signals: { rating: 4.5, reviews: 100 + i }, status: "OPERATIONAL",
  });
  const rings = [];
  const fetchImpl = async (u) => {
    const m = String(u).match(/lat=gte\.([-\d.]+)/);
    const span = (SARASOTA.lat - Number(m[1])) * 69;   // ≈ the ring, plus padding
    rings.push(Math.round(span));
    // 4 rows inside ~2mi; 50 more only out at ~9mi.
    const near = Array.from({ length: 4 }, (_, i) => mk(i, SARASOTA.lat + 0.02));
    const far = Array.from({ length: 50 }, (_, i) => mk(100 + i, SARASOTA.lat + 0.13));
    return { ok: true, json: async () => (span > 10 ? [...near, ...far] : near) };
  };
  const out = await buildNearbyPool(SARASOTA, "restaurants", { fetchImpl });
  ok(rings.length >= 2, `the ladder widened when the tight ring could not fill (rings tried: ${rings.join(", ")})`);
  ok(out.length > 4, `widening KEPT what it found (${out.length} rows) — a thin ring must never lose the wider ring's rows`);
  // v8.33 — this asserted `out.length <= NEARBY_POOL_CAP`. There is no cap, so
  // the property worth pinning is the opposite one: the pool hands on EVERY row
  // the ladder found, and 54 fixture rows must arrive as 54.
  ok(out.length === 54, `the pool hands on every row it found, untrimmed (${out.length} of 54)`);
  const scored = out.every((r) => Number.isFinite(r.governed_score) && r.governed_score === r._s);
  ok(scored, "every row carries the ONE stamp, and _s is that same number — shown == sorted");
  const ordered = out.every((r, i) => i === 0 || (out[i - 1].governed_score >= r.governed_score));
  ok(ordered, "the pool ships in governed-score order, highest first");
}

// ── 8. a failed read is LOUD ────────────────────────────────────────────────
const src = readFileSync(new URL("../lib/nearbyPool.js", import.meta.url), "utf8");
ok(/console\.warn\([^)]*wf_inventory read failed/.test(src),
  "a non-ok inventory read must report itself — the identity pools swallow theirs inside a bare `if (r.ok)`, so a rotated key sends every rail back to the anchor top-N with nothing in the logs");
ok(/console\.warn\([^)]*read threw/.test(src), "…and so must a thrown one");

console.log(`check-nearby-pool: ${n} assertions OK — ladder ${NEARBY_RINGS_MI.join("→")}mi `
  + `(beaches ${BEACH_NEAR_MI}mi), fill at ${NEARBY_TARGET_ROWS}, NO ceiling, `
  + `stand alone above ${NEARBY_STANDALONE_MIN}`);
