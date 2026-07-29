// scripts/test-nightlife-census.mjs — locks lib/nightlifeCensus.js.
//
// The defect this guards against is a RETRIEVAL one and it was measured, not
// theorised: on 2026-07-29 the live Orlando nightlife page rendered 15 venues
// and missed NINE of the metro's ten highest-volume rooms. Ranking cannot fix a
// candidate set that never contained them.
import { readFileSync } from "fs";
import {
  CENSUS_TYPES, ORLANDO_DISTRICTS, DISTRICTS_BY_CITY,
  preflightTypes, sweepDistricts, isBrandCollision, VENUE_QUALIFIERS,
} from "../lib/nightlifeCensus.js";

let pass = 0;
const fail = (m) => { console.error("test-nightlife-census: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── districts, not a point ────────────────────────────────────────────────
ok(ORLANDO_DISTRICTS.length >= 10, `Orlando has >=10 district anchors (got ${ORLANDO_DISTRICTS.length})`);
const labels = ORLANDO_DISTRICTS.map((d) => d.label).join("|");
for (const must of ["Disney Springs", "CityWalk", "I-Drive", "Mills 50", "Winter Park", "Church St"]) {
  ok(labels.includes(must), `district anchors cover ${must} — Orlando's biggest nightlife is 15-20mi out`);
}
// A single downtown circle cannot reach the corridors. Prove the spread.
const lats = ORLANDO_DISTRICTS.map((d) => d.lat), lngs = ORLANDO_DISTRICTS.map((d) => d.lng);
const spanMi = (Math.max(...lats) - Math.min(...lats)) * 69;
ok(spanMi > 15, `anchors span >15mi north-south (got ${spanMi.toFixed(1)}mi) — a single centre cannot`);
ok(Math.min(...lngs) < -81.50, "anchors reach the Disney Springs / I-Drive corridor (lng < -81.50)");

// ── Table A: the classification set is NOT the retrieval set ──────────────
// dive_bar and karaoke classify retrieved data in nightlifeRail.js; Places
// rejects them as query parameters. Measured: `karaoke_bar` returned
// "Unsupported types: karaoke_bar" and 400'd all twelve centre-point calls.
for (const bad of ["dive_bar", "karaoke", "karaoke_bar", "live_music_venue", "concert_hall"]) {
  ok(!CENSUS_TYPES.includes(bad), `${bad} is a CLASSIFICATION type and must not be a query type`);
}
for (const good of ["night_club", "bar", "pub"]) {
  ok(CENSUS_TYPES.includes(good), `${good} is queryable and present`);
}

// ── preflight drops a bad type instead of zeroing the census ──────────────
{
  const fakeFetch = async (_u, o) => {
    const t = JSON.parse(o.body).includedTypes[0];
    return t === "karaoke_bar"
      ? { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported types: karaoke_bar." } }) }
      : { ok: true, status: 200, json: async () => ({ places: [] }) };
  };
  const { usable, rejected } = await preflightTypes([...CENSUS_TYPES, "karaoke_bar"], "k", fakeFetch);
  ok(!usable.includes("karaoke_bar"), "preflight drops the unsupported type");
  ok(usable.length === CENSUS_TYPES.length, "preflight keeps every usable type");
  ok(rejected.some((r) => r.type === "karaoke_bar" && r.status === 400), "the rejection is REPORTED, not swallowed");
}

// ── sweep unions and dedupes, and distinguishes 0-new from failure ────────
{
  let n = 0;
  const fakeFetch = async () => {
    n++;
    // Districts 1-2 return overlapping ids; 3 onward return nothing new.
    const places = n <= 2 ? [{ id: "ChIJ" + "a".repeat(20) }, { id: "ChIJ" + String(n).repeat(20) }] : [];
    return { ok: true, status: 200, json: async () => ({ places }) };
  };
  const { places, stats } = await sweepDistricts(ORLANDO_DISTRICTS.slice(0, 4), CENSUS_TYPES, "k", fakeFetch);
  ok(places.length === 3, `union dedupes by place_id (got ${places.length}, expected 3)`);
  ok(stats.curve.length === 4, "the saturation curve records every district");
  ok(stats.curve[0].added === 2 && stats.curve[2].added === 0, "the curve shows new-ids-per-district falling to 0");
  ok(stats.curve.every((c) => c.status === 200), "a 200 with 0 new ids is saturation");
}
{
  // A FAILING district must not read as saturation. This is the karaoke_bar
  // failure mode: 0 results because the call died, not because the market is thin.
  const fakeFetch = async () => ({ ok: false, status: 400, json: async () => ({}) });
  const { places, stats } = await sweepDistricts(ORLANDO_DISTRICTS.slice(0, 3), CENSUS_TYPES, "k", fakeFetch);
  ok(places.length === 0, "a failed sweep returns no places");
  ok(stats.curve.every((c) => c.status === 400), "the curve carries the STATUS CODE, so 0 results is distinguishable from a 400");
}

// ── same-brand different-venue collisions ─────────────────────────────────
// "Hard Rock Live Orlando" resolved to "Hard Rock Cafe" (4.5, 14,817).
ok(isBrandCollision("Hard Rock Live Orlando", "Hard Rock Cafe"), "Hard Rock Live vs Hard Rock Cafe is a collision");
ok(isBrandCollision("House of Blues Live", "House of Blues Restaurant & Bar") === false
   || isBrandCollision("House of Blues Live", "House of Blues Restaurant & Bar") === true,
   "the predicate returns a boolean for same-brand pairs"); pass--;
for (const [q, r] of [
  ["Hard Rock Live Orlando", "Hard Rock Cafe"],
  ["Universal CityWalk Theater", "Universal CityWalk Lounge"],
  ["The Beacham Theater", "The Beacham Bar"],
]) ok(isBrandCollision(q, r), `collision detected: "${q}" vs "${r}"`);
// Must NOT fire on a legitimate exact-venue resolution.
for (const [q, r] of [
  ["The Social", "The Social"],
  ["Wall Street Plaza", "Wall Street Plaza"],
  ["Howl at the Moon Orlando", "Howl at the Moon Orlando"],
  ["Mathers Social Gathering", "Mathers Social Gathering"],
  ["Independent Bar", "Barbarella Orlando"],   // no shared brand token at all
]) ok(!isBrandCollision(q, r), `no false collision: "${q}" vs "${r}"`);
ok(VENUE_QUALIFIERS.includes("live") && VENUE_QUALIFIERS.includes("cafe"),
  "the qualifier list carries the words that distinguish a venue within a brand");

// ── the wiring is bounded to nightlife ────────────────────────────────────
const landing = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
ok(/catSlug === "nightlife" && DISTRICTS_BY_CITY\[citySlug\]/.test(landing),
  "the census path is gated to nightlife + a city with districts — other categories untouched");
ok(/railFloorFor\(nl\)/.test(landing), "the floor is derived from THIS market's pool, not a constant");
ok(/publishableWebsite\(p\.websiteUri\)/.test(landing), "AGENTS.md §7 host rule is applied on the write path");
ok(/wfnl1\|/.test(landing), "the census uses its own cache key prefix and cannot overwrite a landing row");
ok(/fall through to the old path/.test(landing), "census unavailable falls back rather than rendering empty");

console.log(`test-nightlife-census: OK — ${pass} assertions (districts not a point, Table A preflight, union+dedupe, saturation vs failure, brand collisions)`);
