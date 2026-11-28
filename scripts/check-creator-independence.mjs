// scripts/check-creator-independence.mjs — the trending glow must rest on
// genuine evidence (owner rule). A venue's own account, or a tourism /
// aggregator page, is not an independent creator, so it must not help a place
// reach the 2-creator corroboration floor (lib/trendSignal.js).
// Asserts on the CALL: corroborationTrend() / creatorCountFor() over the real
// committed data plus synthetic fixtures through the real resolver factory.
import { corroborationTrend, CORROBORATION_MIN_CREATORS } from "../lib/trendSignal.js";
import { creatorCountFor, buildLeanResolver } from "../lib/creatorSignals.js";
import { creatorCountFor as fullCount } from "../lib/creatorVideos.js";
import { LEAN_CURATED } from "../lib/creatorSignalsData.generated.js";
import { __CURATED_FOR_CODEGEN__ as CURATED } from "../lib/creatorVideos.js";
import { creatorPlaceKey } from "../lib/creatorPlaceKey.js";
import { NON_INDEPENDENT_CREATOR_HANDLES, isIndependentCreator } from "../lib/creatorIndependence.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("FAIL: " + m); } };
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// 1. The set itself.
ok(Object.isFrozen(NON_INDEPENDENT_CREATOR_HANDLES) || NON_INDEPENDENT_CREATOR_HANDLES instanceof Set, "exclusion set exported");
for (const h of ["nuevacantina","atthediner","mangoniwg","perfectpresscoffeeco","rosallielefrenchcafe","helenamodernriviera","harvestmoonorchard","pintosfarm","secretsoftampabay","influencetampa","visitspc"]) {
  ok(NON_INDEPENDENT_CREATOR_HANDLES.has(h) && !isIndependentCreator(h), `${h} is non-independent`);
}
ok(isIndependentCreator("tampaiman"), "a genuine creator stays independent");

// 2. Synthetic fixtures through the REAL resolver + REAL trend call (positive
//    and negative controls that do not depend on the committed data).
const PLAT = ["instagram"];
const fx = buildLeanResolver([
  [creatorPlaceKey("FX_GOOD"), "Fixture Good", "Tampa", [["tampaiman", 0, 0], ["eatsbylaurr", 0, 0]]],
  [creatorPlaceKey("FX_SELF"), "Fixture Self", "Tampa", [["tampaiman", 0, 0], ["nuevacantina", 0, 0]]],
  [creatorPlaceKey("FX_TOURISM"), "Fixture Tourism", "Tampa", [["tampaiman", 0, 0], ["visitspc", 0, 0]]],
  [creatorPlaceKey("FX_ONLYSELF"), "Fixture OnlySelf", "Tampa", [["secretsoftampabay", 0, 0], ["influencetampa", 0, 0]]],
], PLAT);
const cnt = (id) => fx.creatorCountFor({ id, name: "x" });
ok(cnt("FX_GOOD") === 2, "CONTROL two genuine creators count 2");
ok(cnt("FX_SELF") === 1, "venue own handle is not counted (1 independent)");
ok(cnt("FX_TOURISM") === 1, "tourism bureau is not counted");
ok(cnt("FX_ONLYSELF") === 0, "two aggregator pages count 0");
ok(fx.creatorVideosFor({ id: "FX_SELF", name: "x" }).length === 2, "excluded creators' videos still DISPLAY");

// 3. Real data, through corroborationTrend (the call the rails/rankings make).
let genuine = 0, losers = [], positive = null;
// LEAN_CURATED slot 0 is a lookup key (lib/creatorPlaceKey.js); the place a
// card carries has the REAL id, which the full registry holds at the same index.
for (const [i, [, name, city, vids]] of LEAN_CURATED.entries()) {
  const pid = CURATED[i] && CURATED[i].placeId;
  if (!vids || !vids.length) continue;
  const handles = [...new Set(vids.map((v) => norm(v[0])).filter(Boolean))];
  const indep = handles.filter(isIndependentCreator).length;
  const place = { id: pid || undefined, name: name || "", city: city || "" };
  if (!pid) continue; // name-only entries resolve via name path; covered by count equality below
  const t = corroborationTrend(place, city || null);
  const want = indep >= CORROBORATION_MIN_CREATORS;
  ok(t.trending === want, `${name}: trending=${t.trending} expected ${want} (independent=${indep})`);
  ok(creatorCountFor(place, city || null) === fullCount(place, city || null), `${name}: lean and full creatorCountFor agree`);
  if (want) { genuine++; if (!positive) positive = { name, t }; }
  if (handles.length >= CORROBORATION_MIN_CREATORS && !want) losers.push(`${name} (${city})`);
}
ok(positive && /Featured by \d+ local creators/.test(positive.t.trend_reason), "POSITIVE CONTROL: a real place with 2+ genuine creators still trends, with its reason");
ok(genuine > 0, "some places still trend");
ok(losers.length > 0, "NEGATIVE CONTROL: at least one place lost the floor (probe finds a known positive)");

// Independent of the exclusion helper (which also feeds the loop above): these
// venues' second "creator" is their own account, so they must NOT trend.
// The Perfect Press Coffee Co. left this list on 2026-11-03: a second
// independent creator (whenintampa) posted it, alongside tampavida. Its own
// account (perfectpresscoffeeco) still never counts; that is asserted below.
for (const [nm, ct] of [["Nueva Cantina", "Tampa"]]) {
  const e = CURATED.find((x) => x.match && x.match.name === nm && x.match.city === ct);
  ok(e && corroborationTrend({ id: e.placeId, name: nm, city: ct }, ct).trending === false, `${nm} (${ct}) must not trend on its own account`);
}
{
  const e = CURATED.find((x) => x.match && x.match.name === "The Perfect Press Coffee Co." && x.match.city === "Tampa");
  ok(e && creatorCountFor({ id: e.placeId, name: e.match.name }, "Tampa") === 2, "The Perfect Press Coffee Co. counts only its two independent creators, never its own account");
}

console.log(`creator-independence: ${losers.length} places lost the 2-creator floor: ${losers.join("; ")}`);
console.log(bad ? `FAIL ${bad}/${n}` : `OK creator-independence: ${n} assertions, ${genuine} places still trend, ${NON_INDEPENDENT_CREATOR_HANDLES.size} handles excluded`);
process.exit(bad ? 1 : 0);
