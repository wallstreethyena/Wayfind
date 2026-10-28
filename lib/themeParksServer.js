// Server-only owned-inventory reader for ThemeParkRail. No Google request and
// no partner destination crosses this boundary.
import { sbEnv, cget, cset } from "./serverCache.js";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { wayfindScore } from "./wayfindScore.js";
import { placePartnerPick } from "./placePartnerPicks.js";
import { isOperational } from "./businessStatus.js";
import { isPlaceOwnedPhotoUrl } from "./placePhoto.js";
import { isFreeSourceHotlink } from "./imageHostPolicy.js";
import { loadOwnerPickIds, applyCuratorPicksServer } from "./curatorPicksServer.js";
import { parksForMode, themeParkForPlace, themeParkOperator, orderThemeParks } from "./themeParks.js";

// SERVER-ONLY on purpose: lib/themeParks.js is in the homepage client bundle
// (home.js imports themeParkIntent) and these 17 ids cost 0.4KB gz against a
// 501KB ratchet with no headroom. Verified against wf_inventory 2026-10-27 (project gbhtoehdxkzjsmmkisgu): the
// one admitted, operational, photographed row per park. The server reads these
// ids first (primary-key lookup); the alias ilike read in themeParksServer.js
// runs only when a mapped id comes back missing (row re-keyed or removed).
// An id here is a lookup hint only; identity is still decided by name through
// themeParkForPlace(), so a stale id can never admit the wrong place.
export const THEME_PARK_PLACE_IDS = Object.freeze({
  walt_disney_world: ["ChIJ96XKNOZ-3YgRoPEc0B85Hqc"],
  magic_kingdom: ["ChIJgUulalN-3YgRGoTaWM2LawY"],
  epcot: ["ChIJGzFs3q9_3YgRvZd1y2NSJOo"],
  hollywood_studios: ["ChIJRx6CYyd83YgRD_HjNqPO_7s"],
  animal_kingdom: ["ChIJ_eH9PaOB3YgRuz8jIkYEODQ"],
  universal_orlando: ["ChIJvRBCrN9-54gRGZuuaCLGrQE"],
  universal_studios: ["ChIJdd8VlMN-54gRoaU0d_zYhfk"],
  islands_of_adventure: ["ChIJvRBCrN9-54gR84ltVW4FZBM"],
  epic_universe: ["ChIJa7bjTAB_54gR-M-m-KIOCP0"],
  volcano_bay: ["ChIJWdHR8wJ_54gRNNot6lDLYvk"],
  seaworld: ["ChIJfyPWjCh-54gR1SvWozmef5k"],
  discovery_cove: ["ChIJM3CugoKA3YgRV1x2KktePi0"],
  gatorland: ["ChIJ9RHZGx6H3YgRnWVYIWsHNPM"],
  kennedy: ["ChIJiTHKxDOu4IgRgAU6btoqIsU"],
  legoland: ["ChIJ38rlfogN3YgRGic46M9dbLw"],
  peppa_pig: ["ChIJu5o2QZAN3YgRMruJ3jk1KG8"],
  busch_gardens: ["ChIJhRo4DU_GwogRUgjhMAj-pag"],
});

const FIELDS = "place_id,name,lat,lng,category,primary_type,google_types,status,excluded,signals,editorial,photo_ref";

function quoteIn(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function themeParkRows(rows, mode = "flagship", intent = null, ownerPickIds = null) {
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
    const storedPhoto = signals.photo_url || signals.photoUrl || null;
    // Only a place-owned URL renders directly. A stored Commons hotlink routes
    // through /api/photo so the vaulted, resized copy is served instead.
    const ownedPhoto = isPlaceOwnedPhotoUrl(storedPhoto) ? String(storedPhoto) : null;
    const freeSourced = !!storedPhoto && isFreeSourceHotlink(String(storedPhoto));
    const rating = Number(signals.rating), reviews = Number(signals.reviews) || 0;
    const score = wayfindScore(rating, reviews);
    // A place-id photo lookup may call Google on a cold cache. This rail is
    // owned-inventory-only, so a stored photo URL/ref is part of admission.
    if (!(rating > 0) || !(score > 0) || !row.place_id || (!row.photo_ref && !ownedPhoto && !freeSourced)) continue;
    const place = {
      id: row.place_id, name: row.name, lat: Number(row.lat), lng: Number(row.lng),
      rating, reviews, wfScore: score, category: "Activities",
      primaryType: row.primary_type || "amusement_park", types: row.google_types || [],
      editorial: row.editorial || null, photoRef: row.photo_ref || null,
      photo: ownedPhoto
        || (row.photo_ref ? `/api/photo?ref=${encodeURIComponent(row.photo_ref)}&g=2&w=640` : `/api/photo?place=${encodeURIComponent(row.place_id)}&g=2&w=640`),
      market: identity.market, themeParkKey: identity.key,
    };
    // Exact identity is not enough. A rail card only ships when today's shared
    // winner can produce its one ticket path.
    if (!placePartnerPick(place)) continue;
    seen.add(identity.key);
    out.push(place);
  }
  // Owner curator picks land BEFORE the sort; failure leaves rows untouched.
  let ranked = out;
  try { ranked = applyCuratorPicksServer(out, ownerPickIds); } catch { ranked = out; }
  return orderThemeParks(ranked);
}

// Last good raw inventory read per mode. A slow or failed read serves this
// instead of a 503 (stale-while-error at the data layer; the route's s-maxage
// only helps once something succeeded). Raw rows are cached, not the shaped
// cards, so every q= intent shares one entry and still passes themeParkRows.
const STALE_KEY = (mode) => `theme-parks:rows:v1:${mode}`;
const STALE_TTL_MS = 3 * 86400000;
const STALE_WRITE_EVERY_MS = 10 * 60000;
const lastStaleWrite = new Map();

async function readInventory(url, env, deadlineMs, fetchInit) {
  const response = await fetchDeadline(url, { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` }, ...(fetchInit || { cache: "no-store" }) }, deadlineMs);
  if (!response.ok) throw new Error(`Theme park inventory read returned ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Theme park inventory returned an invalid response");
  return rows;
}

// Id-first: a primary-key IN read of the verified ids; the alias ilike read is
// the fallback, used only when a park in this mode has no row from the id read.
async function freshInventoryRows(mode, env, deadlineMs, fetchInit) {
  const parks = parksForMode(mode);
  const ids = [...new Set(parks.flatMap((row) => THEME_PARK_PLACE_IDS[row.key] || []))];
  if (ids.length) {
    const idUrl = `${env.url}/rest/v1/wf_inventory?select=${FIELDS}&place_id=in.(${ids.map(quoteIn).join(",")})&limit=${ids.length}`;
    const rows = await readInventory(idUrl, env, deadlineMs, fetchInit);
    const found = new Set(rows.map((row) => themeParkForPlace(row)?.key).filter(Boolean));
    if (parks.every((row) => found.has(row.key))) return rows;
  }
  const aliases = [...new Set(parks.flatMap((row) => row.aliases))];
  // Match whole aliases without depending on the inventory's capitalization.
  // No wildcard names: Epcot and EPCOT are identical, Epcot Hotel is not.
  const names = aliases.map((name) => `name.ilike.${quoteIn(name)}`).join(",");
  const url = `${env.url}/rest/v1/wf_inventory?select=${FIELDS}&or=${encodeURIComponent(`(${names})`)}&limit=${aliases.length}`;
  return readInventory(url, env, deadlineMs, fetchInit);
}

export async function loadThemeParks({ mode = "flagship", intent = null, env = sbEnv(), deadlineMs = DB_DEADLINE_MS, fetchInit = null } = {}) {
  if (!env) throw new Error("Theme park inventory configuration is unavailable");
  let rows;
  try {
    rows = await freshInventoryRows(mode, env, deadlineMs, fetchInit);
  } catch (error) {
    let stale = null;
    try { stale = await cget(STALE_KEY(mode), { staleMs: STALE_TTL_MS }); } catch { stale = null; }
    if (!stale || !Array.isArray(stale.v) || !stale.v.length) throw error;
    console.error("[theme-parks] serving last good list:", error.message);
    rows = stale.v;
  }
  if (rows.length) {
    const now = Date.now();
    const sig = rows.map((row) => row && row.place_id).sort().join("|");
    const last = lastStaleWrite.get(mode);
    // Write when the set of rows changed or the last write is old (cheap on the hot path).
    if (!last || last.sig !== sig || now - last.at > STALE_WRITE_EVERY_MS) {
      lastStaleWrite.set(mode, { at: now, sig });
      try { await Promise.race([cset(STALE_KEY(mode), rows, STALE_TTL_MS), new Promise((resolve) => setTimeout(resolve, 1500).unref?.())]); } catch { /* best effort */ }
    }
  }
  let ownerPickIds = null;
  try { ownerPickIds = await loadOwnerPickIds().catch(() => null); } catch { ownerPickIds = null; }
  return themeParkRows(rows, mode, intent, ownerPickIds);
}
