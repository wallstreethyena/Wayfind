#!/usr/bin/env node
/**
 * diagnose-night-out-funnel — WHERE DO NIGHT OUT'S THIN RAILS LOSE THEIR
 * CANDIDATES?
 *
 * Owner review, 2026-09-05: Dinner + Entertainment = 1, Date-Night Dining = 1
 * and Waterfront = 1 near Parrish. Before any presentation change, decide which
 * of four things is true, because the fix is different for each:
 *
 *   A. GENUINE SCARCITY   only one qualifying place exists within 27 miles
 *   B. CANDIDATE STARVATION  more qualifying owned rows exist, but they never
 *      enter the pool the classifier sees
 *   C. EVIDENCE STARVATION   the row IS in the pool, but Wayfind holds too
 *      little owned evidence for the predicate to recognise it
 *   D. TAXONOMY STARVATION   the row exists with evidence, but sits outside the
 *      three broad categories the route reads
 *
 * B is the suspicion, and it has a name in this repo already:
 * lib/browseInventory.js, "identity ∩ anchor top-N is thin BY CONSTRUCTION".
 * /api/night-out reads food + nightlife + attractions, each capped, and only
 * THEN asks whether a row is a dinner-show. A qualifying row ranked #437 in the
 * broad category never gets to compete.
 *
 * THIS SCRIPT MEASURES; IT CHANGES NOTHING. It reproduces the route's own read
 * (same helper, same radius, same cap) and, beside it, the FULL admissible set
 * — every owned row inside the same bounding box, paged past PostgREST's limit
 * — then runs the SAME classifier over both and diffs them. The gap between the
 * two columns is the answer, and it is measured rather than argued.
 *
 * Read-only. No provider calls. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *   node scripts/diagnose-night-out-funnel.mjs [lat] [lng]
 */
import { BROWSE_INVENTORY_N } from "../lib/browseInventory.js";
import { serveFromInventory, invRowToPlace, distMeters } from "../lib/inventoryServe.js";
import { sbEnv } from "../lib/serverCache.js";
import {
  NIGHT_OUT_MAX_MI, NIGHT_OUT_RAIL_DEFS,
  composeNightOutRails, nightOutPlaceRail,
} from "../lib/nightOutIntent.js";

const LAT = Number(process.argv[2] || 27.5949); // Parrish, the owner's own spot
const LNG = Number(process.argv[3] || -82.4265);
const CATS = ["food", "nightlife", "attractions"];
const RADIUS_M = NIGHT_OUT_MAX_MI * 1609.34;

const env = sbEnv();
if (!env) {
  console.error("diagnose-night-out-funnel: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — this script reads owned inventory and cannot run without them.");
  process.exit(2);
}
const H = { apikey: env.key, Authorization: `Bearer ${env.key}` };

// The route's own bounding box, copied from inventoryServe's boxForRadius so
// the FULL read below covers EXACTLY the same ground as the capped read. A
// wider box here would invent candidates the route never had a chance at and
// overstate the loss; a narrower one would hide it.
function box(lat, lng, radiusM) {
  const mi = (Number(radiusM) || 27000) / 1609.34 * 1.15 + 1;
  const dLat = mi / 69;
  const dLng = mi / Math.max(5, 69 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

const FIELDS = "place_id,name,lat,lng,category,secondary_categories,primary_type,google_types,cuisines,status,excluded,signals,editorial,photo_ref";

/** Every owned row of one category inside the box — paged past PostgREST's cap. */
async function readAll(category) {
  const b = box(LAT, LNG, RADIUS_M);
  const geo = `&lat=gte.${b.minLat.toFixed(4)}&lat=lte.${b.maxLat.toFixed(4)}`
    + `&lng=gte.${b.minLng.toFixed(4)}&lng=lte.${b.maxLng.toFixed(4)}`;
  const url = `${env.url}/rest/v1/wf_inventory?select=${FIELDS}${geo}`
    + `&or=(category.eq.${category},secondary_categories.cs.{${category}})&order=place_id.asc`;
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(url, { headers: { ...H, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" } });
    if (!r.ok) throw new Error(`${category} full read ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (from > 40000) break; // sanity stop; a category this large means the box is wrong
  }
  return out;
}

// The route's own row -> place shaping, so the classifier sees identical input
// on both sides of the comparison. (app/api/night-out/route.js toPlace().)
function toPlace(raw, origin) {
  const id = String(raw?.id || "");
  const name = String(raw?.displayName?.text || raw?.name || "").trim();
  const lat = Number(raw?.location?.latitude ?? raw?.lat);
  const lng = Number(raw?.location?.longitude ?? raw?.lng);
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id, name, lat, lng,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    reviews: Number(raw.userRatingCount || raw.reviews || 0),
    types: Array.isArray(raw.types) ? raw.types : [],
    primaryType: raw.primaryType || raw.primary_type || null,
    editorial: raw?.editorialSummary?.text || raw?.editorial || null,
    distMi: Math.round((distMeters(origin.lat, origin.lng, lat, lng) / 1609.34) * 10) / 10,
    _wfInventory: true,
  };
}

const origin = { lat: LAT, lng: LNG };
const dedupe = (places) => {
  const seen = new Set(); const out = [];
  for (const p of places) { if (!p || seen.has(p.id)) continue; seen.add(p.id); out.push(p); }
  return out;
};

// ── column 1: what the ROUTE actually sees ──────────────────────────────────
const opts = { failLoud: true, primaryOnly: false };
const served = await Promise.all(CATS.map((c) =>
  serveFromInventory(c, LAT, LNG, RADIUS_M, BROWSE_INVENTORY_N, undefined, opts)));
const routePlaces = dedupe(served.flat().map((r) => toPlace(r, origin)));

// ── column 2: EVERY owned row in the same box, within the same radius ───────
const allRaw = await Promise.all(CATS.map(readAll));
const allPlaces = dedupe(
  allRaw.flat()
    .filter((r) => String(r?.status || "OPERATIONAL") === "OPERATIONAL" && !r?.excluded)
    .map((r) => toPlace(invRowToPlace(r), origin))
    .filter((p) => p && p.distMi != null && p.distMi <= NIGHT_OUT_MAX_MI),
);

// The classifier, run over both pools. nightOutPlaceRail IS the membership
// function the route uses — called, not re-implemented, so this cannot disagree
// with production about what qualifies.
const tally = (places) => {
  const by = Object.fromEntries(NIGHT_OUT_RAIL_DEFS.map((r) => [r.id, []]));
  for (const p of places) { const id = nightOutPlaceRail(p); if (id && by[id]) by[id].push(p); }
  return by;
};
const routeQual = tally(routePlaces);
const allQual = tally(allPlaces);

// …and the real composed answer, so "final ranked count" is the shipped number
// rather than a re-derivation of it.
const composed = composeNightOutRails([], routePlaces, origin);
const finalBy = Object.fromEntries((composed.rails || []).map((r) => [r.id, (r.places || []).length]));

const perCatAll = Object.fromEntries(CATS.map((c, i) => [c, allRaw[i].length]));
const perCatServed = Object.fromEntries(CATS.map((c, i) => [c, served[i].length]));

console.log(`\nNIGHT OUT FUNNEL — ${LAT}, ${LNG} — radius ${NIGHT_OUT_MAX_MI}mi — cap ${BROWSE_INVENTORY_N}/category\n`);
console.log("owned rows in box, by category:", JSON.stringify(perCatAll));
console.log("rows the route's read ADMITTED:", JSON.stringify(perCatServed));
console.log(`rows entering composeNightOutRails: ${routePlaces.length}`);
console.log(`ALL admissible owned rows <=${NIGHT_OUT_MAX_MI}mi: ${allPlaces.length}`);
console.log("");

const W = [34, 9, 9, 9, 9];
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("rail", W[0]) + pad("qual/route", 12) + pad("qual/ALL", 10) + pad("lost", 8) + "final");
console.log("-".repeat(78));
const lost = {};
for (const def of NIGHT_OUT_RAIL_DEFS) {
  const r = routeQual[def.id].length;
  const a = allQual[def.id].length;
  lost[def.id] = a - r;
  console.log(pad(def.title.slice(0, 32), W[0]) + pad(r, 12) + pad(a, 10) + pad(a - r, 8) + (finalBy[def.id] ?? 0));
}
console.log("-".repeat(78));

const starved = NIGHT_OUT_RAIL_DEFS.filter((d) => lost[d.id] > 0);
console.log(`\nCandidates excluded specifically because they fell outside the ${BROWSE_INVENTORY_N}-row read: ${Object.values(lost).reduce((a, b) => a + b, 0)}`);
if (starved.length) {
  console.log("\nCANDIDATE STARVATION (B) — qualifying owned rows that never reached the classifier:");
  for (const d of starved) {
    const missing = allQual[d.id].filter((p) => !routeQual[d.id].some((q) => q.id === p.id));
    console.log(`\n  ${d.title}  +${lost[d.id]}`);
    for (const p of missing.slice(0, 12)) console.log(`    - ${p.name} (${p.distMi}mi, ${p.reviews} reviews, ${p.primaryType || "no primary_type"})`);
    if (missing.length > 12) console.log(`    …and ${missing.length - 12} more`);
  }
} else {
  console.log("\nNo candidate starvation: every qualifying owned row already reaches the classifier.");
  console.log("A one-card rail here is genuine scarcity (A), evidence starvation (C) or taxonomy starvation (D).");
}

// Evidence starvation (C) is visible as rows the predicate ALMOST matches. It
// is reported as a count of rows whose primary_type is night-relevant but which
// carry no editorial text at all, because the predicates read name + types +
// editorial and an empty editorial is the commonest missing input.
const NIGHTY = /^(bar|night_club|dance_club|cocktail_bar|wine_bar|lounge_bar|pub|brewery|beer_garden|comedy_club|performing_arts_theater|theater|concert_hall|amphitheater|live_music_venue|jazz_club|piano_bar|event_venue)$/;
const thinEvidence = allPlaces.filter((p) => NIGHTY.test(String(p.primaryType || "")) && !p.editorial && !nightOutPlaceRail(p));
console.log(`\nEVIDENCE WATCH (C): ${thinEvidence.length} night-typed owned rows within ${NIGHT_OUT_MAX_MI}mi match NO rail and carry NO editorial text.`);
for (const p of thinEvidence.slice(0, 10)) console.log(`    - ${p.name} (${p.primaryType}, ${p.distMi}mi, ${p.reviews} reviews)`);
console.log("");
