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
import { preferPermittedRow, selectFreePhotoRow } from "./freePhoto.js";
import { vaultPublicUrl, commonsRenditionUrl } from "./photoVault.js";
import { toDiscoveryRef } from "./discoveryRef.js";

// SERVER-ONLY on purpose: lib/themeParks.js is in the homepage client bundle
// (home.js imports themeParkIntent) and these 17 ids cost 0.4KB gz against a
// 501KB ratchet with no headroom. Verified against wf_inventory 2026-10-27 (project gbhtoehdxkzjsmmkisgu): the
// one admitted, operational, photographed row per park. The server reads these
// ids first (primary-key lookup); the alias regex read in themeParksServer.js
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
    // Never pass a stored ref through as-is: a row read before the 2026-10-08
    // cleanup (or from the 3-day stale tier) can still hold a real Google photo
    // name, which must not reach page data. Only the place-only pseudo-ref ships.
    const photoRef = toDiscoveryRef(row.photo_ref);
    const place = {
      id: row.place_id, name: row.name, lat: Number(row.lat), lng: Number(row.lng),
      rating, reviews, wfScore: score, category: "Activities",
      primaryType: row.primary_type || "amusement_park", types: row.google_types || [],
      editorial: row.editorial || null, photoRef,
      photo: ownedPhoto
        || (photoRef ? `/api/photo?ref=${encodeURIComponent(photoRef)}&g=2&w=640` : `/api/photo?place=${encodeURIComponent(row.place_id)}&g=2&w=640`),
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

// ── Licensed photo credits (2026-11-11) ─────────────────────────────────────
// Every flagship park's card photo is a licensed Wikimedia file from
// wf_place_photo (CC BY / CC BY-SA, which require a visible credit). The card
// used a generic /api/photo src that resolved to that file server-side, so the
// card never knew whose photo it was and showed no credit. Now the server picks
// the ONE row /api/photo would serve (preferPermittedRow, same as findFreePhoto)
// and the card renders that row's own vault URL WITH that row's credit: image
// and credit come from the same row by construction, never paired by place.
// A Wayfind-owned photo (place-owned URL) still wins and owes no credit.
const PHOTO_SELECT = "place_id,image_url,license,attribution_text,attribution_url,source,storage_path,width";
const CARD_WIDTH = 640;
const lastGoodCredits = new Map(); // place_id -> credit, from the last successful read

/** Pure: wf_place_photo rows -> Map(place_id -> { url, attributionText, attributionUrl, license, source }). */
export function themeParkPhotoCredits(rows, { supabaseUrl, vaultUrl = vaultPublicUrl, renditionUrl = commonsRenditionUrl } = {}) {
  const byPlace = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.place_id) continue;
    if (!byPlace.has(row.place_id)) byPlace.set(row.place_id, []);
    byPlace.get(row.place_id).push(row);
  }
  const out = new Map();
  for (const [placeId, list] of byPlace) {
    const chosen = selectFreePhotoRow(preferPermittedRow(list), { supabaseUrl, vaultPublicUrl: vaultUrl, renditionUrl, width: CARD_WIDTH });
    if (chosen) out.set(placeId, chosen);
  }
  return out;
}

/**
 * Pure: attach each card's licensed photo + its own credit. A place mapped to
 * null (or `credits` null) is UNKNOWN: the read failed and nothing is remembered,
 * so the card keeps only a Wayfind-owned photo and otherwise shows the monogram,
 * never a licensed photo without its credit.
 */
export function applyThemeParkPhotoCredits(places, credits) {
  return (Array.isArray(places) ? places : []).map((place) => {
    if (isPlaceOwnedPhotoUrl(place.photo)) return place; // owned: no credit owed
    const credit = credits ? credits.get(place.id) : null;
    if (credit) {
      return { ...place, photo: credit.url, photoRef: null, photoAttr: credit.attributionText, photoAttrHref: credit.attributionUrl, photoLicense: credit.license };
    }
    // Unknown (read failed, nothing remembered for this place): withhold.
    if (credits === null || (credits.has(place.id) && credits.get(place.id) === null)) {
      return { ...place, photo: null, photoRef: null, photoWithheld: true };
    }
    return place; // known: no licensed photo exists for this place
  });
}

async function loadThemeParkPhotoCredits(placeIds, { env, deadlineMs, fetchInit }) {
  const ids = [...new Set(placeIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const url = `${env.url}/rest/v1/wf_place_photo?select=${PHOTO_SELECT}&status=eq.active&place_id=in.(${ids.map(quoteIn).join(",")})&limit=${ids.length * 5}`;
  try {
    const rows = await readInventory(url, env, deadlineMs, fetchInit);
    const credits = themeParkPhotoCredits(rows, { supabaseUrl: env.url });
    for (const id of ids) {
      if (credits.has(id)) lastGoodCredits.set(id, credits.get(id));
      else lastGoodCredits.delete(id);
    }
    return credits;
  } catch (error) {
    console.error("[theme-parks] photo credit read failed:", error.message);
    // Last known credits for these exact places, or null (unknown) when this
    // instance has none: never fall back to an uncredited licensed photo.
    return new Map(ids.map((id) => [id, lastGoodCredits.has(id) ? lastGoodCredits.get(id) : null]));
  }
}

// Last good raw inventory read per mode. A slow or failed read serves this
// instead of a 503 (stale-while-error at the data layer; the route's s-maxage
// only helps once something succeeded). Raw rows are cached, not the shaped
// cards, so every q= intent shares one entry and still passes themeParkRows.
// Two tiers: this instance's own memory first (free, and it does not live in
// the database that is stalling), then the shared wf_places_cache row under a
// short bound of its own.
// v2 (2026-11-11): v1 entries could hold pre-cleanup rows; never read them.
const STALE_KEY = (mode) => `theme-parks:rows:v2:${mode}`;
const STALE_TTL_MS = 3 * 86400000;
const STALE_WRITE_EVERY_MS = 10 * 60000;
const STALE_READ_MS = 1000;
const lastStaleWrite = new Map();
const lastGood = new Map(); // mode -> { rows, at }

// The owner pick set only reorders; it is never worth stalling the rail for.
export const OWNER_PICKS_DEADLINE_MS = 1500;

function within(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([Promise.resolve(promise).catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

// Stale is for an upstream that is slow or overloaded, never for a request we
// built wrong: a 4xx (unknown column, bad filter) must fail loudly instead of
// hiding behind a three-day-old list. Transient = no response at all (deadline,
// abort, network) or 5xx/429.
export function isTransientInventoryError(error) {
  if (!error) return false;
  if (Number.isFinite(error.status)) return error.status >= 500 || error.status === 429;
  return error.transient === true;
}

async function readInventory(url, env, deadlineMs, fetchInit) {
  let response;
  try {
    response = await fetchDeadline(url, { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` }, ...(fetchInit || { cache: "no-store" }) }, deadlineMs);
  } catch (error) {
    const wrapped = new Error(`Theme park inventory read failed: ${error?.name || "Error"}: ${error?.message || error}`);
    wrapped.transient = true;
    wrapped.cause = error;
    throw wrapped;
  }
  if (!response.ok) {
    const error = new Error(`Theme park inventory read returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Theme park inventory returned an invalid response");
  return rows;
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One anchored, escaped, case-insensitive regex over every alias (PostgREST
// imatch = Postgres ~*). Same row set as the old 42-term ilike OR (verified on
// prod 2026-10-29: 21 = 21 rows, identical md5 of sorted place_ids), but ~*
// is served by the wf_inventory name trigram GIN index (Bitmap Index Scan,
// ~15ms) where the ilike OR was a full Seq Scan (~1.1s) of ~21.5k rows.
// Anchored ^(...)$: whole names only. Epcot and EPCOT are identical, Epcot
// Hotel is not.
export function themeParkAliasPattern(aliases) {
  return `^(${aliases.map(regexEscape).join("|")})$`;
}

// Id-first: a primary-key IN read of the verified ids; the alias regex read is
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
  const url = `${env.url}/rest/v1/wf_inventory?select=${FIELDS}&name=imatch.${encodeURIComponent(themeParkAliasPattern(aliases))}&limit=${aliases.length}`;
  return readInventory(url, env, deadlineMs, fetchInit);
}

async function staleRows(mode) {
  const mem = lastGood.get(mode);
  if (mem && Date.now() - mem.at <= STALE_TTL_MS && mem.rows.length) return mem.rows;
  const shared = await within(cget(STALE_KEY(mode), { staleMs: STALE_TTL_MS }), STALE_READ_MS, null);
  return shared && Array.isArray(shared.v) && shared.v.length ? shared.v : null;
}

// The likes fetch carries its own abort, and the race above bounds anything
// else in the path (a shared in-flight read started by another caller).
function boundedOwnerPickIds() {
  return loadOwnerPickIds({ fetchImpl: (url, init) => fetchDeadline(url, init, OWNER_PICKS_DEADLINE_MS) });
}

export async function loadThemeParks({ mode = "flagship", intent = null, env = sbEnv(), deadlineMs = DB_DEADLINE_MS, fetchInit = null, loadPicks = boundedOwnerPickIds, loadPhotoCredits = loadThemeParkPhotoCredits } = {}) {
  if (!env) throw new Error("Theme park inventory configuration is unavailable");
  let rows, fresh = true;
  try {
    rows = await freshInventoryRows(mode, env, deadlineMs, fetchInit);
  } catch (error) {
    if (!isTransientInventoryError(error)) throw error;
    const stale = await staleRows(mode);
    if (!stale) throw error;
    console.error("[theme-parks] serving last good list:", error.message);
    rows = stale;
    fresh = false;
  }
  // Only a fresh read renews last-good; re-saving a stale list would restart
  // its clock and let it outlive the three-day cap.
  if (fresh && rows.length) {
    const now = Date.now();
    lastGood.set(mode, { rows, at: now });
    const sig = rows.map((row) => row && row.place_id).sort().join("|");
    const last = lastStaleWrite.get(mode);
    // Write when the set of rows changed or the last write is old (cheap on the hot path).
    if (!last || last.sig !== sig || now - last.at > STALE_WRITE_EVERY_MS) {
      lastStaleWrite.set(mode, { at: now, sig });
      try { await within(cset(STALE_KEY(mode), rows, STALE_TTL_MS), 1500, undefined); } catch { /* best effort */ }
    }
  }
  // null = unknown: rows keep their order, never "nothing is picked".
  const ownerPickIds = await within(Promise.resolve().then(loadPicks), OWNER_PICKS_DEADLINE_MS, null);
  const places = themeParkRows(rows, mode, intent, ownerPickIds);
  const credits = await loadPhotoCredits(places.map((place) => place.id), { env, deadlineMs, fetchInit });
  return applyThemeParkPhotoCredits(places, credits);
}
