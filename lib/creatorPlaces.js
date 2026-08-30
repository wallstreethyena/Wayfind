// lib/creatorPlaces.js — SERVER-ONLY. The coordinates behind a creator's map.
//
// Owner, 2026-08-30: "a nice interactive map of all of the places that she has
// recommended … don't forget to link all of the places into the interactive
// cindy map."
//
// A creator's curated entry (lib/creatorVideos.js) carries a NAME, a city and —
// once resolved — a placeId. It does not carry coordinates, and it must not:
// duplicating lat/lng into the curation file would create a second, silently
// drifting copy of something wf_inventory already owns and keeps fresh. So the
// map's rows are a JOIN, done here, on the server, at render time.
//
// WHAT THIS REFUSES TO DO: approximate. A spot with no placeId, or a placeId
// wf_inventory has never seen, produces NO PIN — never a city-centre dot
// standing in for a café. A map that guesses is worse than a map with a gap,
// because the reader cannot tell which pins are real. The creator page still
// lists that spot in full; it simply is not on the map yet.
//
// It also never calls Google. This is a read of inventory Wayfind already owns
// (the same rule lib/landingInventory.js follows for SSG), so a creator page
// costs zero metered API calls no matter how often it rebuilds.
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";

// PostgREST `in.(…)` takes a comma list. Place IDs are Google's opaque tokens
// (letters, digits, - and _), so anything else is not a place ID and is dropped
// rather than escaped — there is no legitimate value this rejects, and it is
// what keeps a curation-file typo out of the query string.
const ID_OK = /^[A-Za-z0-9_-]{10,255}$/;

export function placeIdsFor(spots) {
  const out = [];
  const seen = new Set();
  for (const s of spots || []) {
    const id = s && s.placeId ? String(s.placeId) : "";
    if (!id || seen.has(id) || !ID_OK.test(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// PURE. An inventory row -> the shape <MapView> and the sidebar read. Exported
// so the guard can assert the mapping without a network call.
export function invRowToMapRow(r, spot) {
  if (!r) return null;
  // num(), not Number(). `Number(null)`, `Number("")` and `Number([])` are all
  // 0 and all finite — so a row whose lat/lng never got ingested would have
  // produced a pin at 0,0, in the Gulf of Guinea, which is precisely the
  // "approximate rather than omit" failure this file exists to refuse. Caught by
  // test-creator-pages calling this with lat:null.
  const num = (v) => (typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN));
  const lat = num(r.lat), lng = num(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const s = r.signals || {};
  return {
    id: r.place_id,
    name: (spot && spot.name) || r.name || "Place",
    lat,
    lng,
    // pinFamily() reads primary_type first and falls back to category — both
    // come straight off the row, so a pin's colour is the inventory's own
    // classification rather than a second opinion invented here.
    primary_type: r.primary_type || null,
    category: r.category || null,
    rating: typeof s.rating === "number" ? s.rating : null,
    reviews: typeof s.reviews === "number" ? s.reviews : null,
    city: (spot && spot.city) || null,
    videoUrl: (spot && spot.video && spot.video.url) || null,
  };
}

/**
 * The map rows for one creator's spots, in the order the spots were curated.
 * Returns [] when Supabase is unconfigured, on any error, or on a timeout —
 * the panel renders nothing rather than a half-map, and the page below it is
 * unaffected.
 */
export async function creatorMapRows(spots) {
  const ids = placeIdsFor(spots);
  if (!ids.length) return [];
  const { sbEnv } = await import("./serverCache.js");
  const env = sbEnv();
  if (!env) return [];
  // select=* for the same reason lib/inventoryServe.js gives: naming a column
  // that has not been migrated yet turns this into a 400 and the map into a
  // blank, which is exactly the failure the explicit list is supposed to avoid.
  const url = `${env.url}/rest/v1/wf_inventory?select=*&place_id=in.(${ids.join(",")})&limit=${ids.length}`;
  let rows = [];
  try {
    const r = await fetchDeadline(url, { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` }, cache: "no-store" }, DB_DEADLINE_MS);
    if (!r.ok) return [];
    rows = await r.json();
  } catch { return []; }
  const byId = new Map();
  for (const row of rows || []) if (row && row.place_id) byId.set(String(row.place_id), row);
  const out = [];
  const used = new Set();
  for (const s of spots || []) {
    const id = s && s.placeId ? String(s.placeId) : "";
    if (!id || used.has(id)) continue;
    const mapped = invRowToMapRow(byId.get(id), s);
    if (!mapped) continue;
    used.add(id);
    out.push(mapped);
  }
  return out;
}
