// lib/dealsData.js — SERVER-side reader for the wf_deals coupon/deal feed, read
// through the service role (matching lib/experiencesServe.js). The /api/deals
// route calls serveDeals(); the client rail fetches that route (same shape as
// the sibling Viator rail → /api/experiences). Reading server-side sidesteps the
// P0 anon-RLS lockdown and keeps the query same-origin.
//
// wf_deals_ranked already applies the per-provider quality gate (>= min_quality_10)
// and orders best-first; the 3h link guardian (wf_verify_affiliate_links) has
// already dropped any dead link. So the rows are safe to render verbatim.
import { sbEnv } from "./serverCache.js";

export const SUBCAT_LABEL = {
  theme_parks: "Theme-park tickets",
  theme_park_hotels: "Theme-park hotels & packages",
  seasonal_events: "Seasonal events",
  car_rental: "Car rentals",
  movies: "Movie tickets",
  ski: "Ski & lift tickets",
};
const SUBCAT_ORDER = ["theme_parks", "theme_park_hotels", "seasonal_events", "car_rental", "movies", "ski"];

function shape(row, providers) {
  const pv = providers[row.provider] || {};
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: pv.label || row.provider,
    title: row.title,
    subtitle: row.subtitle || "",
    subcategory: row.subcategory,
    image: row.image_url || null,
    photoRef: row.photo_ref || null, // Google photo ref (from base wf_deals) → /api/photo
    gradient: row.gradient || null,
    discount: row.discount_text || "",
    badge: row.badge || null,
    href: row.affiliate_url,          // the verified CJ deep link — render VERBATIM
    quality10: row.quality10 != null ? Number(row.quality10) : null,
  };
}

// Pure: shape + group rows into subcategory rails in the fixed priority order.
// Exported so the guard can lock the grouping without any I/O.
export function buildRails(data, providers) {
  const groups = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const key = row.subcategory || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shape(row, providers || {}));
  }
  return [...groups.keys()]
    .sort((a, b) => (SUBCAT_ORDER.indexOf(a) + 1 || 99) - (SUBCAT_ORDER.indexOf(b) + 1 || 99))
    .map((subcategory) => ({ subcategory, label: SUBCAT_LABEL[subcategory] || subcategory, items: groups.get(subcategory) }));
}

async function providerMap(s, h) {
  const m = {};
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_affiliate_providers?select=provider,display_name,disclosure`, { headers: h, cache: "no-store" });
    if (r.ok) for (const p of await r.json()) m[p.provider] = { label: p.display_name || p.provider, disclosure: p.disclosure || "" };
  } catch { /* chip falls back to the raw provider key */ }
  return m;
}

// Pull photo_ref from the base wf_deals table for the given ranked rows and
// stamp it onto each (the ranked view omits the column). Best-effort; on any
// error the rows keep whatever image_url/gradient they had.
async function mergePhotoRefs(s, h, rows) {
  const ids = rows.map((r) => r.id).filter((x) => x != null);
  if (!ids.length) return;
  try {
    const u = `${s.url}/rest/v1/wf_deals?id=in.(${ids.join(",")})&select=id,photo_ref`;
    const r = await fetch(u, { headers: h, cache: "no-store" });
    if (!r.ok) return;
    const byId = new Map();
    for (const row of await r.json()) if (row.photo_ref) byId.set(row.id, row.photo_ref);
    for (const row of rows) if (byId.has(row.id)) row.photo_ref = byId.get(row.id);
  } catch { /* keep existing images */ }
}

// Ranked deals for a category, grouped by subcategory. Returns
// { dark, rails: [{ subcategory, label, items:[deal…] }] }. Fail-soft (never throws).
// Where each deal's attraction actually IS, keyed by maps_to. Deals have no
// coords of their own, so this pins them geographically. A user far from all of
// these (e.g. Greenville SC → ~350mi from Orlando) must NOT be shown Orlando
// theme-park hotels/tickets — the rail geo-gates and hides when nothing's local.
export const DEAL_COORDS = {
  "walt disney world": { lat: 28.385, lng: -81.564 },
  "magic kingdom": { lat: 28.385, lng: -81.564 },
  "universal orlando": { lat: 28.475, lng: -81.466 },
  "seaworld orlando": { lat: 28.411, lng: -81.464 },
  "discovery cove": { lat: 28.393, lng: -81.465 },
  "gatorland": { lat: 28.353, lng: -81.400 },
  "kennedy space center": { lat: 28.573, lng: -80.649 },
  "legoland florida": { lat: 27.990, lng: -81.689 },
  "peppa pig": { lat: 27.998, lng: -81.690 },
  "busch gardens tampa bay": { lat: 28.037, lng: -82.419 },
  "orlando": { lat: 28.538, lng: -81.379 },
  "disneyland": { lat: 33.812, lng: -117.919 },
};
const DEAL_RADIUS_MI = 150; // day-trip-able; beyond this the deals aren't "near you"
function milesBetween(a, bLat, bLng) {
  const toR = (d) => (d * Math.PI) / 180, R = 3958.7554;
  const dLat = toR(bLat - a.lat), dLng = toR(bLng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}
// Keep only deals whose attraction is within DEAL_RADIUS_MI of the user. A deal
// whose maps_to has no known coords is kept (can't prove it's far). No user
// location → keep all (server/no-geo callers unchanged).
export function geoFilterDeals(rows, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return rows;
  return (rows || []).filter((row) => {
    const c = DEAL_COORDS[row.maps_to];
    if (!c) return true;
    return milesBetween(c, lat, lng) <= DEAL_RADIUS_MI;
  });
}

export async function serveDeals(category, lat, lng) {
  const s = sbEnv();
  if (!s) return { dark: true, rails: [] };
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const cat = String(category || "").replace(/[^a-z_]/gi, "");
  if (!cat) return { dark: false, rails: [] };
  try {
    const providers = await providerMap(s, h);
    const url = `${s.url}/rest/v1/wf_deals_ranked?category=eq.${cat}&order=quality10.desc.nullslast&select=*`;
    const r = await fetch(url, { headers: h, cache: "no-store" });
    if (!r.ok) return { dark: true, rails: [] };
    let data = await r.json();
    if (!Array.isArray(data)) return { dark: true, rails: [] };
    // GEO-GATE: never show a far-away region's deals (Orlando hotels in SC).
    data = geoFilterDeals(data, Number(lat), Number(lng));
    // The ranked VIEW doesn't expose photo_ref (Google photo refs live on the
    // base wf_deals table). Fetch them for these ids and merge, so a card with no
    // image_url can still render its Google photo before falling back to gradient.
    await mergePhotoRefs(s, h, data);
    return { dark: false, rails: buildRails(data, providers) };
  } catch { return { dark: true, rails: [] }; }
}
