// lib/venueAnchor.js — ANCHOR A TICKETMASTER VENUE ON WAYFIND'S OWN ROW.
//
// WHY (2026-10-22, owner: "fix it globally"). PR #1913 taught the browser to
// move a Ticketmaster venue pin to Apple's point, which fixed the map, the
// parking search and the walk/drive links. Everything the SERVER ranks from
// the event point — the nearby picks (lib/eventPairings.js), the stays rail
// (lib/eventStays.js), the plan's fetches — still started from Ticketmaster's
// ZIP/city centroid, 3.5 km from Tropicana Field and 10 km from Amerant Bank
// Arena. For the venues Wayfind already owns a row for (Tropicana Field,
// Jannus Live, Ruth Eckerd Hall, Kia Center, the Beacham, ...) the true point
// is in wf_inventory and costs nothing: anchor the event row on it BEFORE any
// ranking runs, so the first paint is right and nothing has to swap later.
// Venues Wayfind does not own are left to the browser's Apple check and the
// client re-anchor (lib/venueResolutionStore.js).
//
// RULES (wrong anchors are worse than none; same stance as
// lib/applePlaceMatch.js):
//   1. only a Ticketmaster row with a venue name and a usable point;
//   2. the inventory name must agree with the venue name at the strict bar
//      (nameScore >= NAME_STRICT after the shared normalization; the venue's
//      head form before " - " counts, so "Funny Bone Comedy Club - Tampa"
//      reaches "Funny Bone Comedy Club");
//   3. the row must sit within VENUE_ANCHOR_MAX_METERS of the provider point
//      ("Riverfront Park" in Oregon never anchors a Cocoa venue);
//   4. a row whose primary type is plainly not a venue (lodging, a store, a
//      gas station) is refused;
//   5. when both sides name a city they must agree;
//   6. exactly ONE distinct row may survive; two is ambiguous;
//   7. (reviewer, 2026-10-22) a generic name ("Park"), a known chain, or a
//      name the reader returned for more than one distinct row ("Dave &
//      Buster's" branches) needs an agreeing named city; and beyond
//      VENUE_ANCHOR_NEAR_METERS only a big single-site venue type or an
//      agreeing city carries the match.
// Within VENUE_ANCHOR_CONFIRM_METERS the provider was already right and the
// row is left alone (except that the matched place_id is recorded so the
// venue cannot appear as its own "nearby" pick).
//
// Inventory coordinates are used here for RANKING, the same use every rail
// and lib/eventPairings.js already make of them. The anchored row also feeds
// the browser map as its starting point; the map draws APPLE's point for it
// (lib/appleVenueLocation.js returns Apple's point on confirm as well as on
// correct), so no inventory coordinate is drawn without a provenance verdict.
import { nameScore, isGenericName, isKnownChain, normalizeName, NAME_STRICT, SAME_PLACE_METERS } from "./applePlaceMatch.js";
import { cityAgrees, metersBetween } from "./appleVenueLocation.js";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";

export const VENUE_ANCHOR_CONFIRM_METERS = 150;
// A same-named row this close is the venue on an exact name alone. Farther
// out (to the hard cap) only a big single-site venue type or an agreeing
// named city may carry it: most inventory rows have no locality, so within
// 30 km the name alone would also accept "Riverfront Park" in the next town.
export const VENUE_ANCHOR_NEAR_METERS = 5000;
export const VENUE_ANCHOR_MAX_METERS = 30000;
// Venue types with one site per name in a region: a stadium 9 km from the
// provider's centroid is still that stadium.
const BIG_VENUE_TYPE = /^(stadium|arena|amusement_park|theme_park|race_course|speedway|convention_center|amphitheat(er|re)|fairground|zoo|aquarium|performing_arts_theater|concert_hall|opera_house)$/;
const CACHE_TTL_MS = 7 * 86400000;
const MEM_MAX = 256;
const CACHE_PREFIX = "va1:";

// Inventory primary types that are never the ticketed venue.
const NON_VENUE_TYPE = /^(lodging|hotel|motel|resort_hotel|inn|bed_and_breakfast|rv_park|campground|gas_station|car_wash|car_repair|car_dealer|car_rental|parking|pharmacy|drugstore|bank|atm|hospital|doctor|dentist|school|primary_school|secondary_school|grocery_store|supermarket|convenience_store|department_store|clothing_store|shoe_store|electronics_store|hardware_store|furniture_store|home_goods_store|jewelry_store|pet_store|liquor_store|store|shopping_mall|real_estate_agency|insurance_agency|lawyer|accounting|post_office|police|fire_station|laundry|storage|moving_company|plumber|electrician|roofing_contractor)$/;

const num = (value) => (typeof value === "number" || typeof value === "string") && String(value).trim() !== "" ? Number(value) : NaN;
function point(row) {
  const lat = num(row && row.lat), lng = num(row && row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

// "David A. Straz Center - Carol Morsani Hall" -> ["David A. Straz Center - Carol Morsani Hall", "David A. Straz Center"]
export function venueNameForms(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const head = raw.split(/\s+[|\-–—:]\s+|\s*\(|\s*\//)[0].trim();
  return head && head !== raw && head.length >= 4 ? [raw, head] : [raw];
}

export function anchorableEvent(event) {
  return !!event && event.source === "Ticketmaster" && typeof event.venue === "string" && event.venue.trim() !== "" && point(event) !== null;
}

// PURE. Decide which inventory row, if any, IS this venue.
// -> { ok:true, place_id, lat, lng, name, driftMeters } | { ok:false, reason, considered }
export function matchInventoryVenue(event, rows) {
  if (!anchorableEvent(event)) return { ok: false, reason: "not-anchorable", considered: 0 };
  const origin = point(event);
  const forms = venueNameForms(event.venue);
  const list = Array.isArray(rows) ? rows : [];
  // How many DISTINCT rows anywhere in the reader's answer carry each name:
  // more than one means a multi-site business, whatever the distance.
  // One building listed twice (two ids within SAME_PLACE_METERS) is one site.
  const sitesByName = new Map();
  for (const row of list) {
    const key = normalizeName(row && row.name);
    const p = point(row);
    if (!key || !p || !(row && typeof row.place_id === "string" && row.place_id.trim())) continue;
    const sites = sitesByName.get(key) || [];
    if (!sites.some((site) => metersBetween(site, p) <= SAME_PLACE_METERS)) sites.push(p);
    sitesByName.set(key, sites);
  }
  const survivors = [];
  const why = {};
  const note = (reason) => { why[reason] = (why[reason] || 0) + 1; };
  for (const row of list) {
    const id = row && typeof row.place_id === "string" ? row.place_id.trim() : "";
    const p = point(row);
    if (!id || !p || typeof row.name !== "string" || !row.name.trim()) { note("no-identity"); continue; }
    const score = Math.max(...forms.map((form) => nameScore(form, row.name)));
    if (score < NAME_STRICT) { note("name-mismatch"); continue; }
    const type = typeof row.primary_type === "string" ? row.primary_type : "";
    if (type && NON_VENUE_TYPE.test(type)) { note("non-venue-type"); continue; }
    const drift = metersBetween(origin, p);
    if (drift > VENUE_ANCHOR_MAX_METERS) { note("too-far"); continue; }
    const agrees = cityAgrees(event.city, row.locality);
    if (agrees === false) { note("locality-mismatch"); continue; }
    // A same-named row sitting ON the provider point (confirm band) is that
    // place whatever else carries the name; otherwise a generic, chain or
    // multi-site name needs the named city to agree.
    const multiSite = isGenericName(row.name) || isKnownChain(row.name) || (sitesByName.get(normalizeName(row.name)) || []).length > 1;
    if (multiSite && agrees !== true && drift > VENUE_ANCHOR_CONFIRM_METERS) { note("multi-site-needs-locality"); continue; }
    if (drift > VENUE_ANCHOR_NEAR_METERS && agrees !== true && !BIG_VENUE_TYPE.test(type)) { note("far-needs-locality"); continue; }
    survivors.push({ id, name: row.name.trim(), lat: p.lat, lng: p.lng, drift, score });
  }
  const distinct = [];
  for (const s of survivors.sort((a, b) => b.score - a.score || a.drift - b.drift)) {
    if (!distinct.find((d) => d.id === s.id || metersBetween(d, s) <= SAME_PLACE_METERS)) distinct.push(s);
  }
  if (!distinct.length) {
    const top = Object.entries(why).sort((a, b) => b[1] - a[1])[0];
    return { ok: false, reason: list.length ? (top ? top[0] : "no-candidate") : "no-results", considered: list.length };
  }
  if (distinct.length > 1) return { ok: false, reason: "ambiguous", considered: list.length };
  const best = distinct[0];
  return { ok: true, place_id: best.id, lat: best.lat, lng: best.lng, name: best.name, driftMeters: Math.round(best.drift) };
}

// PURE. The event row to render, given a match.
export function applyVenueAnchor(event, match) {
  if (!event || !match || !match.ok) return event;
  const anchored = { ...event, place_id: event.place_id || match.place_id, venueAnchor: { place_id: match.place_id, driftMeters: match.driftMeters } };
  if (match.driftMeters > VENUE_ANCHOR_CONFIRM_METERS) {
    anchored.lat = match.lat;
    anchored.lng = match.lng;
    anchored.venueAnchor.source = "wayfind-inventory";
    anchored.venueAnchor.providerPoint = { lat: Number(event.lat), lng: Number(event.lng) };
  } else {
    anchored.venueAnchor.source = "provider-confirmed";
  }
  return anchored;
}

// PostgREST: inside a logic tree (`or=(...)`) a double-quoted value may carry
// reserved characters ("David A. Straz Center" has a dot) and is unquoted by
// the server; an ilike value without `*` is an exact, case-insensitive match.
// The logic-tree form is used even for one name so quoting always applies.
// Quotes inside a name are escaped; `%` and `_` are left to the exact-name
// re-check in matchInventoryVenue.
function quoted(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

async function supabaseEnv() {
  try {
    const { sbEnv } = await import("./serverCache.js");
    return sbEnv();
  } catch { return null; }
}

// Default inventory reader: the rows whose name equals one of the venue's
// name forms (case-insensitive), at most 20. Fails closed to [].
export async function readInventoryByName(forms, options = {}) {
  const names = [...new Set((forms || []).filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim()))];
  if (!names.length) return [];
  // Explicit null is the no-Supabase case (the guard passes env: null and a
  // reader that would return rows). `||` treated that null as "omitted" and
  // fell through to process.env, so a Vercel build with SUPABASE_* set
  // performed the read the guard forbids. Only an omitted env uses the process.
  const env = options.env === undefined ? await supabaseEnv() : options.env;
  if (!env) return [];
  const fetchImpl = options.fetchImpl || fetchDeadline;
  const filter = `or=${encodeURIComponent(`(${names.map((n) => `name.ilike.${quoted(n)}`).join(",")})`)}`;
  const url = `${env.url}/rest/v1/wf_inventory?select=place_id,name,locality,metro,lat,lng,primary_type&${filter}&limit=20`;
  try {
    const r = await fetchImpl(url, { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` }, cache: "no-store" }, options.deadlineMs || DB_DEADLINE_MS);
    if (!r || !r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

const MEM = new Map();
export function clearVenueAnchorCacheForTests() { MEM.clear(); }
export function venueAnchorCacheKey(event) {
  const origin = point(event);
  return `${CACHE_PREFIX}${String(event.venue).trim().toLowerCase()}|${String(event.city || "").trim().toLowerCase()}|${origin ? `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}` : "-"}`;
}

async function sharedCache() {
  try {
    const { cget, cset } = await import("./serverCache.js");
    return { cget, cset };
  } catch { return null; }
}

// Anchor one event row. Never throws; on any failure the row is returned as
// given. One inventory read per venue per week across instances (shared
// cache), per process in between (memory).
export async function anchorEventVenue(event, { read = readInventoryByName, cache, now = Date.now() } = {}) {
  if (!anchorableEvent(event)) return event;
  const key = venueAnchorCacheKey(event);
  try {
    const mem = MEM.get(key);
    if (mem && mem.exp > now) return applyVenueAnchor(event, mem.match);
    const shared = cache === undefined ? await sharedCache() : cache;
    if (shared && typeof shared.cget === "function") {
      const hit = await shared.cget(key);
      if (hit && hit.v && typeof hit.v === "object" && typeof hit.v.ok === "boolean") {
        remember(key, hit.v, now);
        return applyVenueAnchor(event, hit.v);
      }
    }
    const match = matchInventoryVenue(event, await read(venueNameForms(event.venue)));
    const stored = match.ok ? { ok: true, place_id: match.place_id, lat: match.lat, lng: match.lng, name: match.name, driftMeters: match.driftMeters } : { ok: false, reason: match.reason };
    remember(key, stored, now);
    if (shared && typeof shared.cset === "function") { try { await shared.cset(key, stored, CACHE_TTL_MS); } catch { /* best effort */ } }
    return applyVenueAnchor(event, stored);
  } catch {
    return event;
  }
}

function remember(key, match, now) {
  if (MEM.size >= MEM_MAX) MEM.delete(MEM.keys().next().value);
  MEM.set(key, { match, exp: now + CACHE_TTL_MS });
}
