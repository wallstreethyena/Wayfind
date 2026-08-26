#!/usr/bin/env node
/**
 * check-exploding-nearby-floor — Parrish cannot paint
 * "Trend recommendations are temporarily unavailable." while the owner
 * list still exists.
 *
 * THE LIVE FAIL (owner, 2026-08-25, Food home, Parrish):
 *   Section title: "Showing Exploding Trends Near You near Parrish"
 *   Body: "Trend recommendations are temporarily unavailable."
 *   Button: Try again
 *   Cards under it (Ganges etc.) are a different rail.
 *
 * Two cooperating defects, both executed here rather than grepped:
 *
 *   1. /api/trends/nearby 502/503'd before the owner list could run.
 *      serverEnv() threw TrendConfigError; any later inventory/metro/match
 *      throw became trend_data_error. Both returned that sentence.
 *
 *   2. ExplodingNearby treated 502/503 / a thrown Google walk as the happy
 *      path for that sentence. The owner-list floor never got a chance.
 *
 * This guard CALLS the law (metro, serve, UI status). A regex over the
 * route body would go green the moment the copy moved.
 */
import { readFileSync } from "node:fs";
import { EXPLODING_NEARBY_UNIVERSE } from "../lib/trendTaxonomy.js";
import { TrendConfigError } from "../lib/trendRights.js";
import {
  explodingMetroFor,
  explodingUiStatus,
  needsOwnerFloor,
  ownerListExists,
  serveExplodingNearby,
  UNAVAILABLE_COPY,
  OWNER_LIST_EXPLANATION,
} from "../lib/explodingNearbyServe.js";

let pass = 0;
const fail = (m) => { console.error("check-exploding-nearby-floor: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── 1. Metro law, EXECUTED. Parrish / Bradenton must be manatee-sarasota. ──
const PARRISH = [
  { name: "Parrish (location-honesty pin)", lat: 27.5859, lng: -82.4254 },
  { name: "Parrish (marquee / guides pin)", lat: 27.5689, lng: -82.4393 },
  { name: "Parrish (typical 27.58,-82.42)", lat: 27.58, lng: -82.42 },
];
const BRADENTON = { lat: 27.498, lng: -82.575 };
const SARASOTA = { lat: 27.336, lng: -82.531 };
const TAMPA = { lat: 27.947, lng: -82.459 };

function metroLaw(fn) {
  return PARRISH.every((p) => fn(p.lat, p.lng) === "manatee-sarasota")
    && fn(BRADENTON.lat, BRADENTON.lng) === "manatee-sarasota"
    && fn(SARASOTA.lat, SARASOTA.lng) === "manatee-sarasota";
}

ok(typeof explodingMetroFor === "function", "explodingMetroFor is exported so the lock can CALL it");
for (const p of PARRISH) {
  ok(explodingMetroFor(p.lat, p.lng) === "manatee-sarasota", `${p.name} maps to manatee-sarasota (got ${explodingMetroFor(p.lat, p.lng)})`);
}
ok(explodingMetroFor(BRADENTON.lat, BRADENTON.lng) === "manatee-sarasota", "Bradenton market center maps to manatee-sarasota");
ok(explodingMetroFor(SARASOTA.lat, SARASOTA.lng) === "manatee-sarasota", "Sarasota market center maps to manatee-sarasota");
ok(explodingMetroFor(TAMPA.lat, TAMPA.lng) === "tampa", "Tampa is still tampa, not folded into manatee-sarasota");
ok(metroLaw(explodingMetroFor), "the metro law holds for every Parrish/Bradenton pin this repo uses");
ok(!metroLaw(() => null), "red-prove: a metroFor that misses Parrish fails the law");
ok(!metroLaw(() => "tampa"), "red-prove: mapping Parrish to tampa fails the law");

// ── 2. Owner-list floor, EXECUTED against a missing/invalid config. ──
const PARRISH_PIN = PARRISH[0];
ok(ownerListExists(EXPLODING_NEARBY_UNIVERSE), "positive control: the owner list is in the repo");
ok(UNAVAILABLE_COPY === "Trend recommendations are temporarily unavailable.",
  "the unavailable sentence is the one the owner photographed");

function isFailSoft(res) {
  if (!res) return false;
  if (res.httpStatus >= 500) return false;
  if (res.status === "trend_configuration_error" || res.status === "trend_data_error") return false;
  if (String(res.error || "") === UNAVAILABLE_COPY) return false;
  return res.status === "no_verified_inventory" || res.status === "ok";
}

const configMiss = await serveExplodingNearby({
  lat: PARRISH_PIN.lat, lng: PARRISH_PIN.lng,
  readRows: async () => { throw new TrendConfigError("SUPABASE_URL", "is not set for the Exploding Near You server read"); },
});
ok(configMiss.metro === "manatee-sarasota", "config-miss path still resolved Parrish to manatee-sarasota");
ok(isFailSoft(configMiss),
  `missing SUPABASE_URL fail-softs (got http ${configMiss.httpStatus} status=${configMiss.status} error=${configMiss.error})`);
ok(configMiss.status === "no_verified_inventory" && configMiss.httpStatus === 200,
  "missing config is honest empty, never 503 trend_configuration_error");

const storeFail = await serveExplodingNearby({
  lat: PARRISH_PIN.lat, lng: PARRISH_PIN.lng,
  readRows: async () => { throw new Error("trend store read failed (502)"); },
});
ok(isFailSoft(storeFail),
  `a thrown inventory read fail-softs (got http ${storeFail.httpStatus} status=${storeFail.status})`);
ok(storeFail.status === "no_verified_inventory" && storeFail.httpStatus === 200,
  "a dead store is honest empty, never 502 trend_data_error");

const emptyInv = await serveExplodingNearby({
  lat: PARRISH_PIN.lat, lng: PARRISH_PIN.lng,
  readRows: async (path) => {
    if (String(path).startsWith("wf_inventory")) return [];
    return [];
  },
});
ok(emptyInv.status === "no_verified_inventory" && emptyInv.httpStatus === 200,
  "verified-inventory miss is honest empty, not unavailable");

const nowIso = new Date().toISOString();
const provenSmash = {
  place_id: "place-smash-parrish-1",
  name: "Coastal Smash",
  category: "food",
  metro: "manatee-sarasota",
  lat: 27.58,
  lng: -82.43,
  status: "OPERATIONAL",
  needs_review: false,
  primary_type: "hamburger_restaurant",
  google_types: ["hamburger_restaurant", "restaurant"],
  tags: ["smash-burger"],
  refreshed_at: nowIso,
  photo_ref: "places/x/photos/one",
  signals: { rating: 4.8, reviews: 400, priceNum: 2 },
  editorial: { verified: true, facts: [{ claim: "They smash burgers on a flat top." }], hook: "Smash burgers on a flat top." },
};
const floorCards = await serveExplodingNearby({
  lat: PARRISH_PIN.lat, lng: PARRISH_PIN.lng,
  readRows: async (path) => {
    if (String(path).startsWith("wf_inventory")) return [provenSmash];
    return [];
  },
});
ok(floorCards.status === "ok" && floorCards.httpStatus === 200 && floorCards.basis === "owner_list",
  `owner-list floor returns cards when inventory proves an offering (got status=${floorCards.status} basis=${floorCards.basis})`);
ok(Array.isArray(floorCards.trends) && floorCards.trends.some((t) => t.conceptKey === "smash_burgers"),
  "Parrish owner-list floor surfaces smash burgers from verified inventory — not the unavailable sentence");
ok(floorCards.metro === "manatee-sarasota", "the successful floor names metro manatee-sarasota");

ok(!isFailSoft({ httpStatus: 503, status: "trend_configuration_error", error: UNAVAILABLE_COPY }),
  "red-prove: a 503 with the unavailable sentence fails the floor law");
ok(!isFailSoft({ httpStatus: 502, status: "trend_data_error", error: UNAVAILABLE_COPY }),
  "red-prove: a 502 with the unavailable sentence fails the floor law");

const noUniverse = await serveExplodingNearby({
  lat: PARRISH_PIN.lat, lng: PARRISH_PIN.lng,
  readRows: async () => { throw new TrendConfigError("SUPABASE_URL", "is not set"); },
  universe: [],
});
ok(noUniverse.httpStatus >= 500 && noUniverse.error === UNAVAILABLE_COPY,
  "unavailable is lawful only when the owner list itself is gone");

// ── 3. UI paint law, EXECUTED. 502/503 is not the happy path. ──
function unavailableUnreachable(fn, universe) {
  const samples = [
    { status: "trend_data_error", error: UNAVAILABLE_COPY, trends: [] },
    { status: "trend_configuration_error", error: UNAVAILABLE_COPY, trends: [] },
    { status: "trend_data_error", trends: [] },
    { status: undefined, error: UNAVAILABLE_COPY, trends: [] },
  ];
  return samples.every((s) => {
    const r = fn({ ...s, universe });
    return r.status === "no_verified_inventory"
      && r.error !== UNAVAILABLE_COPY
      && String(r.error || "") !== UNAVAILABLE_COPY;
  });
}

ok(unavailableUnreachable(explodingUiStatus, EXPLODING_NEARBY_UNIVERSE),
  "ExplodingNearby cannot paint the unavailable sentence while owner-list topics exist");
ok(!unavailableUnreachable(explodingUiStatus, []),
  "red-prove: with the owner list gone, the unavailable sentence is reachable");
ok(explodingUiStatus({ status: "ok", trends: [{ conceptKey: "smash_burgers", matches: [{ id: "x" }] }] }).status === "ok",
  "a real card list still paints as ok");
ok(explodingUiStatus({ status: "unsupported_location", trends: [] }).status === "unsupported_location",
  "unsupported_location stays geographic, not remapped to empty-inventory");
ok(needsOwnerFloor({ status: "trend_data_error", error: UNAVAILABLE_COPY, trends: [] }) === true,
  "a 502-shaped Google walk consults the owner-list floor");
ok(needsOwnerFloor({ status: "ok", trends: [{ conceptKey: "smash_burgers" }] }) === false,
  "a successful walk does not replace its cards with the floor");
ok(needsOwnerFloor({ status: "no_verified_inventory", trends: [] }) === true,
  "an honest Google empty still asks the owner-list floor for verified inventory");

// ── 4. Source position: the route and the rail CALL the law. ──
const route = strip(read("app/api/trends/nearby/route.js"));
ok(/serveExplodingNearby\s*\(/.test(route), "the nearby route calls serveExplodingNearby — it does not re-implement the 502/503 catch");
ok(!/status:\s*["']trend_configuration_error["']/.test(route),
  "the route no longer returns trend_configuration_error (that 503 was the live sentence)");
ok(!/status:\s*["']trend_data_error["']/.test(route),
  "the route no longer returns trend_data_error (that 502 was the live sentence)");

const ui = strip(read("app/components/ExplodingNearby.js"));
ok(/explodingUiStatus\s*\(/.test(ui), "ExplodingNearby calls explodingUiStatus — 502/503 is not a JSX happy path");
ok(/needsOwnerFloor\s*\(/.test(ui) && /\/api\/trends\/nearby/.test(ui),
  "a failed Google walk fetches the owner-list nearby floor");
ok((ui.match(/UNAVAILABLE_COPY/g) || []).length >= 1,
  "the unavailable sentence has one name; the rail does not hardcode a second copy as the 502 default");

const dpr = strip(read("app/components/DaypartRail.js"));
ok(/<ExplodingNearby[\s/>]/.test(dpr), "positive control: the trending drop still mounts ExplodingNearby");

ok(typeof OWNER_LIST_EXPLANATION === "string" && OWNER_LIST_EXPLANATION.length > 0, "owner-list matches carry a controlled explanation so selectExplodingNearby cannot drop them");
ok(!/650%|1,040%|search(?:es)? up/i.test(OWNER_LIST_EXPLANATION),
  "the owner-list explanation does not invent provider momentum or a search-data stat");

console.log(`check-exploding-nearby-floor: OK — ${pass} assertions (Parrish/Bradenton metro, config/store fail-soft, 502/503 is not the UI happy path, red-proved)`);
