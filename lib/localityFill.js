// lib/localityFill.js — the daily city/county fill for NEW places.
//
// WHY (2026-11-12): the 2026-11-11 Census backfill gave 15,606 Florida places a
// city and/or county (docs/audits/2026-11-11-locality-census/). The insert path
// (lib/seedPlaces.js buildInventoryRow, via promote-index / scout) writes no
// locality or county, so every place added after it arrived city-less again:
// all 30 rows added 11-11 → 11-12 had neither (filled by hand 2026-11-12, same
// rule). Without this job the gap reopens every day, and a city-less place gets
// a city-less page title ("Caribou Coffee | Wayfind").
//
// THE RULE IS THE ONE ALREADY ACCEPTED, NOT A NEW ONE: the Census place that
// CONTAINS the row's own point (scripts/lib/localityEvidence.mjs censusLocality
// — the incorporated city, else the Census-designated place, else none), and
// the Census county. Never a guess from the name, a neighbour, or the metro.
//
// HELD, never written (each needs a person, or is simply not Florida):
//   - the Census says the point is not in Florida, or in more than one county
//   - the Census place is "Bay Lake" (Walt Disney World; owner decision pending)
//   - the lookup failed or came back without geographies
// Unincorporated points get the county only — that is the correct answer.
//
// ADD-ONLY: the write carries `locality=is.null&county=is.null`, so a row that
// anyone filled in the meantime (or a locked row) is never touched.
//
// Pure functions here; the network calls live in app/api/cron/locality-fill.
// scripts/test-locality-fill.mjs calls them.

import { censusLocality } from "../scripts/lib/localityEvidence.mjs";

import { isTampaLabelInSouthPinellas } from "./placeIdentity.js";
import { PROMOTE_METROS } from "./promoteIndex.js";

export const FLORIDA_STATE_FIPS = "12";
// North edge of the st-pete coverage box (lib/promoteIndex.js), the same edge
// the production canary uses for the south-Pinellas rule.
export const ST_PETE_MAX_LAT = PROMOTE_METROS["st-pete"].maxLat;
// Rough Florida box: only rows inside it are worth a Census call. The Census
// answer, not this box, decides (a Georgia point inside the box is held).
export const FL_BOX = { latMin: 24.3, latMax: 31.1, lngMin: -87.7, lngMax: -79.8 };
export const HELD_PLACES = new Set(["Bay Lake"]);
export const DAILY_LIMIT = 40;

export function censusUrl(lat, lng) {
  return "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
    + `?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`
    + "&benchmark=Public_AR_Current&vintage=Current_Current"
    + "&layers=Incorporated%20Places,Census%20Designated%20Places,Counties&format=json";
}

// The Census JSON → { inc, cdp, county, state } (names only), or null when the
// answer has no geographies at all.
export function parseCensusGeographies(json) {
  const g = json && json.result && json.result.geographies;
  if (!g || typeof g !== "object") return null;
  const names = (a) => (Array.isArray(a) ? a.map((x) => x && (x.BASENAME || x.NAME)).filter(Boolean) : []);
  const counties = Array.isArray(g.Counties) ? g.Counties : [];
  return {
    inc: names(g["Incorporated Places"]),
    cdp: names(g["Census Designated Places"]),
    county: names(counties),
    state: [...new Set(counties.map((c) => c && c.STATE).filter(Boolean))],
  };
}

// One row + its Census answer → what to write, or why not.
//   { action: "write", locality: string|null, county: string }
//   { action: "hold", why }
export function planLocalityWrite(row, geo) {
  if (!row || row.locked === true) return { action: "hold", why: "locked" };
  if (String(row.locality || "").trim() || String(row.county || "").trim()) return { action: "hold", why: "already has a value" };
  if (!geo) return { action: "hold", why: "no census answer" };
  if (geo.state.length !== 1 || geo.state[0] !== FLORIDA_STATE_FIPS) return { action: "hold", why: `not florida (${geo.state.join(",") || "no state"})` };
  if (geo.county.length !== 1) return { action: "hold", why: `county count ${geo.county.length}` };
  const locality = censusLocality(geo);
  if (locality && HELD_PLACES.has(locality)) return { action: "hold", why: `held place ${locality}` };
  const plan = { action: "write", locality: locality || null, county: geo.county[0] };
  // COVERAGE FOLLOWS THE COUNTY (2026-11-15). The insert path labels a row with
  // the seed sweep's metro, and the Tampa sweep reaches south Pinellas (Historic
  // Fort De Soto arrived as metro='tampa' on 2026-11-13). The county lands here,
  // so this is where the canary's south-Pinellas rule can be applied: same
  // predicate, same edge, and the write only lands while the row still says
  // the label the plan was made from (writeQuery adds that compare-and-set).
  if (isTampaLabelInSouthPinellas({ metro: row.metro, county: plan.county, lat: row.lat }, ST_PETE_MAX_LAT)) { plan.metro = "st-pete"; plan.fromMetro = row.metro; }
  return plan;
}

// The PostgREST read: newest city-less, county-less, unlocked rows inside the
// Florida box. Newest first, so places added since the last run are always
// reached before the long-held ones (Disney, out-of-state) that are re-asked.
export function candidatesQuery(limit = DAILY_LIMIT) {
  const b = FL_BOX;
  return "wf_inventory?select=place_id,name,lat,lng,metro,locality,county,locked"
    + "&locality=is.null&county=is.null&locked=not.is.true"
    + `&lat=gte.${b.latMin}&lat=lte.${b.latMax}&lng=gte.${b.lngMin}&lng=lte.${b.lngMax}`
    + `&order=seen_at.desc.nullslast&limit=${Math.max(1, Math.min(200, limit | 0))}`;
}

// The add-only write: one row, only while BOTH fields are still empty.
// A plan that also moves the coverage label adds a metro=eq.<plan.fromMetro>
// condition, so the label changes only while the row still carries the value
// the plan was made from.
export function writeQuery(placeId, plan = null) {
  const relabel = plan && plan.metro && plan.fromMetro ? `&metro=eq.${encodeURIComponent(plan.fromMetro)}` : "";
  return `wf_inventory?place_id=eq.${encodeURIComponent(placeId)}&locality=is.null&county=is.null${relabel}&select=place_id,locality,county,metro`;
}

export function writeBody(plan) {
  const body = plan.locality ? { locality: plan.locality, county: plan.county } : { county: plan.county };
  if (plan.metro) body.metro = plan.metro;
  return body;
}
