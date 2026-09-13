// Server-only owned-inventory reader for ThemeParkRail. No Google request and
// no partner destination crosses this boundary.
import { sbEnv } from "./serverCache.js";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { wayfindScore } from "./wayfindScore.js";
import { placePartnerPick } from "./placePartnerPicks.js";
import { isOperational } from "./businessStatus.js";
import { parksForMode, themeParkForPlace, themeParkOperator, orderThemeParks } from "./themeParks.js";

const FIELDS = "place_id,name,lat,lng,category,primary_type,google_types,status,excluded,signals,editorial,photo_ref";

function quoteIn(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function themeParkRows(rows, mode = "flagship", intent = null) {
  const allowed = new Set(parksForMode(mode).map((row) => row.key));
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const identity = themeParkForPlace(row);
    if (!identity || !allowed.has(identity.key)) continue;
    if (intent?.kind === "exact" && identity.key !== intent.park.key) continue;
    if (intent?.kind === "operator" && themeParkOperator(identity) !== intent.operator) continue;
    if (!isOperational(row) || row.excluded === true || seen.has(identity.key)) continue;
    const signals = row.signals || {};
    const ownedPhoto = signals.photo_url || signals.photoUrl || null;
    const rating = Number(signals.rating), reviews = Number(signals.reviews) || 0;
    const score = wayfindScore(rating, reviews);
    // A place-id photo lookup may call Google on a cold cache. This rail is
    // owned-inventory-only, so a stored photo URL/ref is part of admission.
    if (!(rating > 0) || !(score > 0) || !row.place_id || (!row.photo_ref && !ownedPhoto)) continue;
    const place = {
      id: row.place_id, name: row.name, lat: Number(row.lat), lng: Number(row.lng),
      rating, reviews, wfScore: score, category: "Activities",
      primaryType: row.primary_type || "amusement_park", types: row.google_types || [],
      editorial: row.editorial || null, photoRef: row.photo_ref || null,
      photo: ownedPhoto || `/api/photo?ref=${encodeURIComponent(row.photo_ref)}&w=640`,
      market: identity.market, themeParkKey: identity.key,
    };
    // Exact identity is not enough. A rail card only ships when today's shared
    // winner can produce its one ticket path.
    if (!placePartnerPick(place)) continue;
    seen.add(identity.key);
    out.push(place);
  }
  return orderThemeParks(out);
}

export async function loadThemeParks({ mode = "flagship", intent = null, env = sbEnv(), deadlineMs = DB_DEADLINE_MS } = {}) {
  if (!env) throw new Error("Theme park inventory configuration is unavailable");
  const parks = parksForMode(mode);
  const aliases = [...new Set(parks.flatMap((row) => row.aliases))];
  // Match whole aliases without depending on the inventory's capitalization.
  // No wildcard names: Epcot and EPCOT are identical, Epcot Hotel is not.
  const names = aliases.map((name) => `name.ilike.${quoteIn(name)}`).join(",");
  const url = `${env.url}/rest/v1/wf_inventory?select=${FIELDS}&or=${encodeURIComponent(`(${names})`)}&limit=${aliases.length}`;
  const response = await fetchDeadline(url, { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` }, cache: "no-store" }, deadlineMs);
  if (!response.ok) throw new Error(`Theme park inventory read returned ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Theme park inventory returned an invalid response");
  return themeParkRows(rows, mode, intent);
}
