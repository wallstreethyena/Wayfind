// scripts/check-map-list-row-gate.mjs — THE MAP ADMITS EXACTLY THE ROWS THE LIST ADMITS.
// Hermetic, no network. Locks lib/servableRow.js as the one row-level gate.
//
// 2026-10-20 live parity probe (scripts/verify-map-list-parity-live.mjs):
// drawableButNotInMap = 1 in St. Pete (Atelier St. Pete) and 2 in Miami (Art
// Deco Tours, Miami G). The list served each with mapCoord.ok=true; the map's
// row gate refused needs_review=true, which the list never refuses. This check
// CALLS the real list path (rankInventory + invRowToPlace's verdict) and the
// real map read (readMapAreaPage over a fake PostgREST) on a corpus that varies
// every row-level flag, and requires:
//   A. list serves + verdict ok  =>  map returns it (no silent missing pin)
//   B. map returns it            =>  list serves it with verdict ok
//   C. rankInventory's inline gate == isServableRow on every row
//   D. ownedPool / nightOutPool re-export the SAME function object
import { rankInventory, invRowToPlace } from "../lib/inventoryServe.js";
import { readMapAreaPage } from "../lib/mapAreaData.js";
import { isServableRow } from "../lib/servableRow.js";
import { isServableRow as ownedPoolGate } from "../lib/ownedPool.js";
import { isServableRow as nightOutGate } from "../lib/nightOutPool.js";
import { NOT_PUBLIC_PLACES } from "../lib/notPublicPlaces.js";

let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

const now = Date.now();
const DAY = 86400000;
const origin = { lat: 25.78, lng: -80.14 };
const bounds = { north: 25.9, south: 25.6, east: -80.0, west: -80.3 };
const base = (id, extra = {}) => ({
  place_id: id, name: `Place ${id}`, metro: "miami-dade", lat: 25.7760494, lng: -80.1375558,
  category: "attractions", secondary_categories: [], primary_type: "museum", google_types: ["museum", "point_of_interest", "establishment"],
  cuisines: [], tags: [], status: "OPERATIONAL", excluded: false, needs_review: false,
  signals: { rating: 4.9, reviews: 290 }, refreshed_at: new Date(now - 21 * DAY).toISOString(), independent_coords: null, ...extra,
});

// The three production rows the probe named, in their real row shape (2026-10-20).
const real = [
  base("ChIJzwuT633jwogRk-f-KeTnieU", { name: "Atelier St. Pete", metro: "st-pete", primary_type: "educational_institution", google_types: ["service", "point_of_interest", "educational_institution", "establishment"], signals: { rating: 5, reviews: 67 }, needs_review: true, lat: 25.79, lng: -80.15 }),
  base("ChIJUbi9qPS02YgRK-D8Zhm8LHc", { name: "Art Deco Tours", primary_type: "tourist_attraction", google_types: ["point_of_interest", "establishment"], needs_review: true }),
  base("ChIJ4SWhglK12YgROEW3wD-gjC0", { name: "Miami G", primary_type: "tourist_attraction", google_types: ["point_of_interest", "establishment"], signals: { rating: 4.8, reviews: 125 }, needs_review: true, lat: 25.7909106, lng: -80.140205 }),
];
const variants = [
  ["control", {}], ["needs_review", { needs_review: true }], ["excluded", { excluded: true }],
  ["closed", { status: "CLOSED_PERMANENTLY" }], ["temp closed", { status: "CLOSED_TEMPORARILY" }], ["null status", { status: null }],
  ["unrated", { signals: {} }], ["zero rating", { signals: { rating: 0, reviews: 10 } }],
  ["expired coord", { refreshed_at: new Date(now - 40 * DAY).toISOString() }], ["needs_review + expired", { needs_review: true, refreshed_at: new Date(now - 40 * DAY).toISOString() }],
  ["not public", { place_id: NOT_PUBLIC_PLACES[0].place_id }], ["needs_review + excluded", { needs_review: true, excluded: true }],
];
const corpus = [...real, ...variants.map(([label, patch], i) => ({ ...base(`ChIJfixture${String(i).padStart(3, "0")}`), ...patch, _label: label }))];

const fetcher = async (url) => {
  const cursor = new URL(url).searchParams.get("place_id");
  const rows = cursor ? [] : corpus.map(({ _label, ...r }) => r).sort((a, b) => (a.place_id < b.place_id ? -1 : 1));
  return { ok: true, status: 200, json: async () => rows };
};
const page = await readMapAreaPage({ bounds, origin, config: { url: "https://owned.example", key: "k" }, fetcher, now });
const mapIds = new Set(page.places.map((p) => p.id));

let listOk = 0, mapped = 0;
for (const row of corpus) {
  const label = row._label || row.name;
  const listed = rankInventory([row], origin.lat, origin.lng, 27000, 10).some((p) => p.id === row.place_id);
  const verdict = invRowToPlace(row).mapCoord;
  const inMap = mapIds.has(row.place_id);
  ok(listed === isServableRow(row), `C: rankInventory and isServableRow disagree on "${label}" (list=${listed}, gate=${isServableRow(row)})`);
  if (listed && verdict && verdict.ok) { listOk++; ok(inMap, `A: "${label}" is a list card with a drawable verdict but /api/places/map did not return it`); }
  if (inMap) { mapped++; ok(listed && verdict && verdict.ok, `B: "${label}" is on the map but the list would not serve it with a drawable verdict`); }
}
// Controls: the corpus really exercises both sides.
ok(real.every((r) => mapIds.has(r.place_id)), "positive control: the three probe rows (needs_review=true, fresh coordinate) are map candidates");
ok(mapIds.has("ChIJfixture000"), "positive control: the clean control row is on the map");
for (const label of ["excluded", "closed", "unrated", "not public", "expired coord", "needs_review + excluded"]) {
  const r = corpus.find((x) => x._label === label);
  ok(r && !mapIds.has(r.place_id), `negative control: "${label}" must not be on the map`);
}
ok(ownedPoolGate === isServableRow, "D: lib/ownedPool.js isServableRow is not lib/servableRow.js's function");
ok(nightOutGate === isServableRow, "D: lib/nightOutPool.js isServableRow is not lib/servableRow.js's function");

if (fails.length) {
  console.error(`check-map-list-row-gate: FAIL (${fails.length}/${n})\n  - ` + fails.join("\n  - "));
  process.exit(1);
}
console.log(`check-map-list-row-gate: OK — ${n} assertions over ${corpus.length} rows (3 real probe rows + ${variants.length} flag variants) through the real rankInventory/invRowToPlace list path and the real readMapAreaPage map read: ${listOk} list cards with a drawable verdict, ${mapped} map candidates, identical sets. False-positive surface: row-level gates only; category/score/viewport filters are out of scope (lib/mapListAccounting.js names those).`);
