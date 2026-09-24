#!/usr/bin/env node
// scripts/check-ryans-cafe-sentinel.mjs — PERMANENT regression lock for the
// named real-world sentinel the 2026-09-23 exhaustive-read fix exists for:
// Ryan's Coffee House, Parrish (ChIJo_IdHf0lw4gRHDbQNKBRE84), Food > Cafés.
// See lib/inventoryServe.js's and lib/ownedPool.js's 2026-09-23 headers — a
// real, operational, 4.9★/205-review café sat past row 1,000 of 1,598 food
// rows in the Parrish box and was silently never read.
//
// Unlike scripts/check-inventory-serve-complete-read.mjs (the GENERAL
// exhaustive-read contract, driven by a large synthetic corpus with decoys,
// failure modes and paging edge cases), this guard is deliberately SMALL and
// PINNED to the one place the outage was about, using the SAME
// scripts/lib/synthetic/fixtures.mjs constants (RYANS_COFFEE_HOUSE, PARRISH)
// every other synthetic guard in this repo already anchors on — so a future
// regression against the real sentinel cannot hide behind a fixture that
// quietly stopped matching production identity.
import { serveFromInventory, distMeters } from "../lib/inventoryServe.js";
import { chipIdentity } from "../lib/chipIdentity.js";
import { placeAllowed } from "../lib/placeFilter.js";
import { fallCardClass, FALL_CARD_IDS } from "../lib/fallSkin.js";
import { verifiedInSeasonWindow } from "../lib/fallEvidence.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { RYANS_COFFEE_HOUSE, PARRISH } from "./lib/synthetic/fixtures.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ── 1. IDENTITY — chipIdentity/placeAllowed admit Ryan's under food:cafes ──
// Shaped exactly as lib/inventoryServe.js's serveFromInventoryUncached shapes
// a raw wf_inventory row before calling chipIdentity: name/types/primary_type/
// primaryType/category, never the Google-resource shape.
const ryansIdentityShape = {
  name: RYANS_COFFEE_HOUSE.name,
  types: ["coffee_shop", "cafe", "food"],
  primaryType: RYANS_COFFEE_HOUSE.primaryType,
  primary_type: RYANS_COFFEE_HOUSE.primaryType,
  category: "food",
};
ok(placeAllowed("food", "cafes", ryansIdentityShape) === true,
  "placeAllowed admits Ryan's Coffee House under food:cafes");
ok(chipIdentity("food", "cafes", ryansIdentityShape) === true,
  "chipIdentity — the function serveFromInventory ACTUALLY calls — admits Ryan's under food:cafes");
ok(chipIdentity("food", "lunch", ryansIdentityShape) === false,
  "Ryan's is a café, not a lunch room — the two Food menu chips do not overlap for it");

// ── 2. SERVICEABILITY — within 17mi of Parrish, the radius the outage was measured at ──
const RYANS_LAT = PARRISH.lat + 0.045; // ~3.1mi north — never exactly on the center point
const RYANS_LNG = PARRISH.lng + 0.02;
const distMi = distMeters(PARRISH.lat, PARRISH.lng, RYANS_LAT, RYANS_LNG) / 1609.34;
ok(distMi < 17, `the fixture's Ryan's row sits within 17mi of Parrish center (measured ${distMi.toFixed(2)}mi)`);

// ── 3. THE REAL serveFromInventory FINDS IT, from a fixture shaped so it sits
// past row 1,000 in the box's raw ("heap") storage order — the exact shape of
// the production outage. ──
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rnd = mulberry32(0x2ec0ffee);

const FILLER_N = 1100; // past the old limit=1000 cap on its own
const filler = Array.from({ length: FILLER_N }, (_, i) => ({
  place_id: `wf_ryans_guard_filler_${String(i).padStart(4, "0")}`,
  name: `Steakhouse ${i}`,
  lat: PARRISH.lat + ((i % 40) - 20) * 0.003,
  lng: PARRISH.lng + (((i * 7) % 40) - 20) * 0.003,
  category: "food", secondary_categories: [],
  primary_type: "restaurant", google_types: ["restaurant", "american_restaurant"],
  cuisines: ["american"], status: "OPERATIONAL", excluded: false,
  signals: { rating: 4.5 + (i % 5) / 10, reviews: 2000 + (i % 3000) },
  photo_ref: null,
}));
const ryansRow = {
  place_id: RYANS_COFFEE_HOUSE.placeId,
  name: RYANS_COFFEE_HOUSE.name,
  lat: RYANS_LAT, lng: RYANS_LNG,
  category: "food", secondary_categories: [],
  primary_type: RYANS_COFFEE_HOUSE.primaryType, google_types: ["coffee_shop", "cafe"],
  cuisines: [], status: "OPERATIONAL", excluded: false,
  signals: { rating: 4.9, reviews: 205 },
  photo_ref: null,
};
let world = shuffle([...filler, ryansRow], rnd);
let heapIndex = world.findIndex((r) => r.place_id === RYANS_COFFEE_HOUSE.placeId);
if (heapIndex < 1000) {
  const PINNED_INDEX = 1050;
  [world[heapIndex], world[PINNED_INDEX]] = [world[PINNED_INDEX], world[heapIndex]];
  heapIndex = PINNED_INDEX;
}
ok(heapIndex >= 1000, `FIXTURE SANITY: Ryan's sits at heap-order index ${heapIndex} (>= 1000), matching the real outage's row 1,001+ of 1,598`);

const FIXTURE_URL = "https://fixture.supabase.co";
const FIXTURE_KEY = "fixture-service-role-key";
process.env.SUPABASE_URL = FIXTURE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = FIXTURE_KEY;

function parseBoxQuery(url) {
  const u = new URL(url);
  const raw = u.search;
  const num = (re) => { const m = raw.match(re); return m ? Number(m[1]) : null; };
  const inListMatch = raw.match(/place_id=in\.\(([^)]*)\)/);
  return {
    order: u.searchParams.get("order") || "",
    minLat: num(/lat=gte\.(-?[\d.]+)/), maxLat: num(/lat=lte\.(-?[\d.]+)/),
    minLng: num(/lng=gte\.(-?[\d.]+)/), maxLng: num(/lng=lte\.(-?[\d.]+)/),
    isEditorialRead: !!inListMatch && !/lat=gte\./.test(raw),
    inList: inListMatch ? decodeURIComponent(inListMatch[1]).split(",").map((s) => s.trim()).filter(Boolean) : null,
  };
}
function jsonRes(body) { return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }; }

const calls = [];
const origFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (!url.includes("/rest/v1/wf_inventory")) return jsonRes([]);
  const q = parseBoxQuery(url);
  if (q.isEditorialRead) return jsonRes((q.inList || []).map((id) => ({ place_id: id, editorial: null })));
  const rangeHeader = String((init && init.headers && init.headers.Range) || "");
  const m = rangeHeader.match(/^(\d+)-(\d+)$/);
  const from = m ? Number(m[1]) : 0;
  const to = m ? Number(m[2]) : from + 999;
  calls.push({ order: q.order, range: rangeHeader });
  let matches = world.filter((r) => r.lat >= q.minLat && r.lat <= q.maxLat && r.lng >= q.minLng && r.lng <= q.maxLng);
  if (q.order === "place_id.asc") matches = matches.slice().sort((a, b) => (a.place_id < b.place_id ? -1 : a.place_id > b.place_id ? 1 : 0));
  return jsonRes(matches.slice(from, to + 1));
};

let served;
try {
  const result = await serveFromInventory("food", PARRISH.lat, PARRISH.lng, 17 * 1609.34, 20, "cafes", {
    env: { url: FIXTURE_URL, key: FIXTURE_KEY }, primaryOnly: true, withMeta: true,
  });
  served = result.places;
  ok(calls.length >= 2, `the ${FILLER_N + 1}-row fixture forced multiple box-read pages (got ${calls.length})`);
  ok(calls.every((c) => c.order === "place_id.asc"), "every page of the real serveFromInventory read carries order=place_id.asc");
} finally {
  globalThis.fetch = origFetch;
}
const servedIds = (served || []).map((p) => p.id);
ok(servedIds.includes(RYANS_COFFEE_HOUSE.placeId),
  `the REAL serveFromInventory serves Ryan's Coffee House under food:cafes from a fixture where it sits past row 1,000 (served: ${servedIds.join(",") || "(none)"})`);

// ── 4. THE FALL SKIN — consistent with the registry, not hardcoded to absent
// forever. (independent PR #1495 audit fix, 2026-09-23: the old version of
// this section asserted fallCardClass(Ryan's, ...) === "" unconditionally,
// which would have gone RED the day Ryan's is legitimately fall-verified and
// added to lib/fallSkin.FALL_CARD_IDS — a sentinel is supposed to survive a
// LEGITIMATE change to the thing it watches, not fail on one. The real
// invariant this guard protects is narrower and permanent: Ryan's card can
// only ever carry the fall skin IN SEASON, and only if the registry actually
// names it — never out of season, regardless of registry membership.)
ok(fallCardClass(RYANS_COFFEE_HOUSE.placeId, "2026-10-15") === (FALL_CARD_IDS.has(RYANS_COFFEE_HOUSE.placeId) ? " wf-fall-card" : ""),
  "fallCardClass(Ryan's, in-season date) matches registry membership — the skin is exactly as present as FALL_CARD_IDS.has(Ryan's) says, no more and no less");
ok(fallCardClass(RYANS_COFFEE_HOUSE.placeId, "2026-12-01") === "",
  "fallCardClass(Ryan's, out-of-season date) is empty regardless of registry membership — the season gate always wins");

// ── 4b. RED-PROVE the OTHER half of the registry contract: a Ryan's record
// that DID get into the fall registry but carries no current-season verified
// evidence must fail check-fall-registry-integrity.mjs's own blocking check.
// That guard is a standalone script with no exported function, so this
// exercises its EXACT dependency — verifiedInSeasonWindow(entry.verified,
// today), the same call scripts/check-fall-registry-integrity.mjs makes per
// entry — against a synthetic Ryan's-shaped row, proving the invariant on the
// call rather than re-asserting the guard's source text.
const today = siteTodayStr();
// The EXACT gate scripts/check-fall-registry-integrity.mjs computes per entry:
// `const windowOk = !!entry.verified && verifiedInSeasonWindow(entry.verified, today);`
const windowOk = (entry) => !!entry.verified && verifiedInSeasonWindow(entry.verified, today);
ok(windowOk({ verified: undefined }) === false,
  "a Ryan's record with NO verified date fails check-fall-registry-integrity's windowOk gate");
ok(windowOk({ verified: "2025-10-01" }) === false, // a real date, but a PRIOR fall season
  "a Ryan's record verified in a PRIOR fall season fails the same windowOk gate — stale evidence cannot smuggle Ryan's into the registry");
ok(windowOk({ verified: today }) === true,
  "positive control — a Ryan's record verified TODAY would pass windowOk, proving the gate above is discriminating rather than always-false");

if (fail.length) {
  console.error(`check-ryans-cafe-sentinel: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const msg of fail) console.error("  ✗ " + msg);
  process.exit(1);
}
console.log(`check-ryans-cafe-sentinel: OK (${pass} assertions) — Ryan's Coffee House, Parrish, is admitted, servable, and actually served under Food > Cafés`);
