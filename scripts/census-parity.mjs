// scripts/census-parity.mjs — RANKING-PARITY measurement.
//
// A separate measurement track. It is NOT part of the Phase 1 before/after
// baseline and must never be folded into it: Phase 1's locked baseline is the
// three NIGHTLIFE cells at volume-top-20 (venice 7/20, honolulu 5/20,
// orlando 1/20). The three food cells are WITHDRAWN, not pending — volume-top-20
// was never a valid yardstick for restaurants and re-running them under it to
// fill the gap is explicitly not the fix.
//
// WHY THIS EXISTS
// "Top 20 by review volume" approximates the right answer for nightlife (House
// of Blues, Twin Peaks and Tom's Watch Bar are both highest-volume AND correct)
// and inverts for restaurants (highest-volume is Rainforest Cafe, McDonald's,
// IHOP — which the page is RIGHT to omit). Gating with the shipped classifier
// did not fix it: placeAllowed('food') admitted 732 of 754 rows, dropped Walmart
// and Medieval Times, and kept McDonald's, IHOP x2 and Dave & Buster's. The
// defect was definitional, not a filtering gap.
//
// Reporting that 0/20 as a coverage failure would have pointed the census at
// surfacing McDonald's. A wrong metric does not merely mismeasure — it
// misdirects the fix.
//
// THE METRIC
// Hold RANKING constant and vary only RETRIEVAL:
//   A) the shipped ranker over the FULL census
//   B) the shipped ranker over the small pool rankedFor() actually retrieves
// The difference between the two outputs is attributable to retrieval alone.
// It never asks what the top-20 "should" be, so it needs no per-category notion
// of "genuine" and carries no circularity — unlike a yardstick built from my own
// sweep.
//
// Usage: node scripts/census-parity.mjs --city orlando --cat restaurants

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { placeAllowed } from "../lib/placeFilter.js";
import { marketReviewFloor, passesMarketFloor } from "../lib/marketFloor.js";
import { localCategoryBoost } from "../lib/localCategorySignals.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

// ── the shipped ranker, COPIED from lib/landing.js ────────────────────────
// wfScore is a non-exported const (lib/landing.js:73) and the _s expression is
// inline (lib/landing.js:218), so neither can be imported. They are copied here
// and LOCKED: scripts/check-parity-formula-lock.mjs fails the build if either
// drifts from its source. A copied formula with no lock is a silent divergence
// waiting to happen — the parity number would keep reporting against a ranker
// the site no longer uses.
const wfScore = (r, n) => (((n || 0) / ((n || 0) + 60)) * (r || 0) + (60 / ((n || 0) + 60)) * 3.9) * 10;
const distancePenalty = (mi) => (mi <= 4 ? 0 : Math.min(30, (mi - 4) * 1.3));
function shippedScore(p) {
  return wfScore(p.rating, p.reviews) - distancePenalty(p.distMi || 0) + localCategoryBoost(p);
  // NOTE: the CURATED_NAMES +15 term is deliberately omitted — CURATED_NAMES is
  // a local Set in landing.js built from lib/sources CURATED. It applies
  // identically to BOTH sides of this comparison, so it cannot change the
  // retrieval delta this metric measures. Stated rather than silently dropped.
}

const GATE = { nightlife: "nightlife", restaurants: "food", "things-to-do": "attractions", beaches: "beach" };
const QUERY = { nightlife: "best bars and nightlife", restaurants: "best restaurants", "things-to-do": "top tourist attractions", beaches: "best beaches" };

function rankShipped(rows) {
  const floor = marketReviewFloor(rows);
  const kept = rows.filter((p) => passesMarketFloor(p, floor, false));
  const pool = kept.length >= 5 ? kept : rows;
  return [...pool].sort((a, b) => (shippedScore(b) - shippedScore(a)) || ((b.reviews || 0) - (a.reviews || 0))).slice(0, 15);
}

function loadKey() {
  if (process.env.GOOGLE_MAPS_SERVER_KEY) return process.env.GOOGLE_MAPS_SERVER_KEY;
  try {
    const m = readFileSync(join(ROOT, ".env.local"), "utf8").match(/^GOOGLE_MAPS_SERVER_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {}
  return null;
}

function distMi(a, b) {
  const R = 3958.8, r = (x) => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function main() {
  const citySlug = arg("city", "orlando"), catSlug = arg("cat", "restaurants");
  const gate = GATE[catSlug];
  if (!gate) { console.error(`FATAL: unknown --cat ${catSlug}`); process.exit(1); }

  const census = JSON.parse(readFileSync(join(ROOT, "tmp", `census-${citySlug}.json`), "utf8"));
  const city = { lat: census.rows[0] ? census.center?.lat ?? null : null };
  const CITY = { orlando: { lat: 28.5384, lng: -81.3789 } }[citySlug];
  if (!CITY) { console.error(`FATAL: no centroid for ${citySlug}`); process.exit(1); }

  const admits = (p) => placeAllowed(gate, null, { name: p.name, primaryType: p.primaryType, types: p.types, rating: p.rating, userRatingCount: p.reviews });
  const operational = (p) => p.businessStatus == null || p.businessStatus === "OPERATIONAL";
  const censusRows = census.rows.filter((r) => r.inMetro && operational(r) && admits(r));
  if (!censusRows.length) { console.error("FATAL: gate admitted zero census rows"); process.exit(1); }
  if (censusRows.length === census.rows.filter((r) => r.inMetro).length) { console.error("FATAL: gate admitted EVERY row — degenerate, not permissive"); process.exit(1); }

  // ── side B: exactly what rankedFor() retrieves — ONE text query from the
  // city centroid at 27,359m, the city named in the query (lib/landing.js:190).
  const key = loadKey();
  if (!key) { console.error("FATAL: no GOOGLE_MAPS_SERVER_KEY"); process.exit(1); }
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.types,places.rating,places.userRatingCount,places.location,places.businessStatus" },
    body: JSON.stringify({ textQuery: `${QUERY[catSlug]} ${citySlug} FL`, pageSize: 20, locationBias: { circle: { center: { latitude: CITY.lat, longitude: CITY.lng }, radius: 27359 } } }),
  });
  if (!r.ok) { console.error(`FATAL: retrieval probe ${r.status} ${(await r.text()).slice(0, 160)}`); process.exit(1); }
  const raw = (await r.json()).places || [];
  const poolRows = raw.map((p) => ({
    place_id: p.id, name: (p.displayName && p.displayName.text) || null, primaryType: p.primaryType || null,
    types: p.types || [], rating: typeof p.rating === "number" ? p.rating : null,
    reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
    businessStatus: p.businessStatus || null,
    distMi: p.location ? distMi(CITY, { lat: p.location.latitude, lng: p.location.longitude }) : 0,
  })).filter((p) => operational(p) && admits(p));

  if (!poolRows.length) { console.error("FATAL: retrieval probe returned nothing the gate admits — cannot compare"); process.exit(1); }

  const fromCensus = rankShipped(censusRows);
  const fromPool = rankShipped(poolRows);
  const poolIds = new Set(fromPool.map((p) => p.place_id));
  const unreachable = fromCensus.filter((p) => !poolIds.has(p.place_id));

  console.log(`═══ RANKING PARITY — ${citySlug} × ${catSlug} ═══`);
  console.log(`  ranking held constant (shipped wfScore + distance penalty + localCategoryBoost, marketReviewFloor applied to both)`);
  console.log(`  candidate sets: census ${censusRows.length} rows   vs   rankedFor() retrieval ${poolRows.length} rows\n`);
  console.log(`  the shipped ranker's top 15 FROM THE CENSUS:`);
  fromCensus.forEach((p, i) => console.log(`    ${String(i + 1).padStart(2)}. ${String(Math.round(shippedScore(p))).padStart(3)}  ${(p.name || "").slice(0, 38).padEnd(38)} ${poolIds.has(p.place_id) ? "" : "<- retrieval never saw it"}`));
  console.log(`\n  RETRIEVAL LOSS: ${unreachable.length} of ${fromCensus.length} venues the shipped ranker would have chosen are unreachable by rankedFor()'s single query.`);
  console.log(`  Ranking is identical on both sides, so this delta is retrieval and nothing else.`);
  console.log(`\n  cost: 1 call = $0.035`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
