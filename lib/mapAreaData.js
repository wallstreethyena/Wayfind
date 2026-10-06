import { wayfindScore } from './wayfindScore.js';
import { toDisplayScore } from './score.js';
import { governedScoreOf, byGovernedScore } from './lawfulOrder.js';
import { isOperational } from './businessStatus.js';
import { existingTypeSignals } from './placeCategory.js';
import { placeAllowed } from './placeFilter.js';
import { isExcluded } from './placeCategory.js';
import { isNotPublicPlace } from './notPublicPlaces.js';
import { stampOwnerPick } from './ownerBump.js';
import { railDistanceMi } from './railCoverage.js';

export const MAP_MIN_SCORE = 9.2;
export const MAP_AREA_PAGE_SIZE = 500;
export const MAP_CATEGORIES = [
  { id: 'all', label: 'All places', icon: '✦' },
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'nightlife', label: 'Nightlife', icon: '🍸' },
  { id: 'attractions', label: 'Things to do', icon: '🎟️' },
  { id: 'beach', label: 'Beaches', icon: '🏖️' },
  { id: 'family', label: 'Family', icon: '👨‍👩‍👧' },
  { id: 'hotels', label: 'Stays', icon: '🛏️' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
];

export function validMapBounds(b) {
  return !!b && ['north', 'south', 'east', 'west'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k]))
    && b.north > b.south && b.north <= 90 && b.south >= -90
    && b.east > b.west && b.east <= 180 && b.west >= -180;
}
export function placeInMapBounds(p, b) {
  return validMapBounds(b) && typeof p?.lat === 'number' && typeof p?.lng === 'number'
    && p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}
function hasMapPlaceData(p) {
  const score = toDisplayScore(Number.isFinite(p?.governed_score) ? p.governed_score : p?.wfScore);
  return !!p?.id && !!p.name && score !== null && isOperational(p)
    && typeof p.lat === 'number' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
    && typeof p.lng === 'number' && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
}
export function mapPlaceQualifies(p) {
  const score = toDisplayScore(Number.isFinite(p?.governed_score) ? p.governed_score : p?.wfScore);
  return hasMapPlaceData(p) && score >= MAP_MIN_SCORE;
}
export function mapCategoryMatches(p, category, sub = 'all') {
  if (isExcluded(p) || isNotPublicPlace(p)) return false;
  if (category === 'all') return true;
  if (category !== 'family' && p.category !== category && !p.secondaryCategories?.includes(category)) return false;
  return placeAllowed(category, sub, p);
}
export function keepMapPreview(place, visiblePlaces, category, status) {
  if (!mapPlaceQualifies(place) || !mapCategoryMatches(place, category)) return false;
  return status !== 'ready' || visiblePlaces.some(p => p.id === place.id);
}
// Keep current-session evidence on fresh owned identities. Coordinates,
// freshness and category identity stay owned; known creator/trend disclosures
// are carried forward and the shared law recomputes their displayed score.
export function mergeMapAreaContext(areaPlaces, contextualPlaces) {
  const known = new Map();
  for (const p of contextualPlaces || []) {
    if (!p?.id) continue;
    // Context pools overlap. A later plain inventory copy must not erase an
    // earlier positive verdict, and creator/trend facts may live on separate
    // copies. Preserve the first disclosed trend in caller-priority order;
    // never borrow identity, coordinates, status or precomputed scores.
    const evidence = known.get(p.id) || {};
    if (p.creator_video === true) evidence.creator_video = true;
    if (!evidence.trending && p.trending && p.trend_reason) {
      evidence.trending = true;
      evidence.trend_reason = p.trend_reason;
    }
    known.set(p.id, evidence);
  }
  return (areaPlaces || []).map((p) => {
    const prior = known.get(p.id);
    if (!prior || (prior.creator_video !== true && !(prior.trending && prior.trend_reason))) return p;
    const next = { ...p, creator_video: p.creator_video === true || prior.creator_video === true,
      ...(prior.trending && prior.trend_reason ? { trending: true, trend_reason: prior.trend_reason } : {}) };
    delete next.governed_score;
    next.governed_score = governedScoreOf(next, p.city);
    return next;
  });
}
export function selectMapPlaces(places, category = 'all', bounds = null, sub = 'all') {
  const seen = new Set();
  return (places || []).filter(p => mapPlaceQualifies(p) && (!bounds || placeInMapBounds(p, bounds))
    && mapCategoryMatches(p, category, sub)
    && !seen.has(p.id) && seen.add(p.id)).sort((a, b) => byGovernedScore(a, b) || a.id.localeCompare(b.id));
}

// Owned inventory only. The score uses the same governed law as cards, including verified creator evidence,
// never taste, affiliate value or a synthetic minimum. Google content expires at 30d.
function mapInventoryCandidate(row, now = Date.now(), origin = null, ownerPick = false) {
  if (!row || row.excluded === true || row.needs_review === true || !isOperational(row)) return null;
  const refreshed = Date.parse(row.refreshed_at);
  if (!Number.isFinite(refreshed) || refreshed > now || now - refreshed > 30 * 86400000) return null;
  const s = row.signals || {};
  const types = existingTypeSignals(row);
  let p = {
    id: row.place_id, name: row.name, city: row.metro || null, lat: row.lat, lng: row.lng,
    rating: typeof s.rating === 'number' ? s.rating : null,
    reviews: typeof s.reviews === 'number' ? s.reviews : 0,
    wfScore: wayfindScore(s.rating, s.reviews || 0),
    category: row.category, secondaryCategories: row.secondary_categories || [],
    types, type: (row.primary_type || types[0] || '').replace(/_/g, ' '), primaryType: row.primary_type || null,
    cuisines: row.cuisines || [], status: row.status, priceNum: s.priceNum ?? null,
    photoRef: row.photo_ref || null, photo_ref: row.photo_ref || null,
    address: '', openNow: null, _wfInventory: true,
    creator_video: row.creator_video === true || s.creator_video === true,
    distMi: origin ? railDistanceMi(origin.lat, origin.lng, row.lat, row.lng) : null,
  };
  p.governed_score = governedScoreOf(p, row.metro);
  if (ownerPick) p = stampOwnerPick(p, true);
  return hasMapPlaceData(p) ? p : null;
}

// Direct callers still request an already-qualified place. The viewport API
// must keep fresh owned candidates until current-session evidence is merged:
// an owned 9.0 can become a governed 9.6 from a known, disclosed trend.
export function mapInventoryPlace(row, now = Date.now(), origin = null, ownerPick = false) {
  const p = mapInventoryCandidate(row, now, origin, ownerPick);
  return mapPlaceQualifies(p) ? p : null;
}

export async function readMapAreaPage({ bounds, origin, cursor = '', config, fetcher, now = Date.now(), ownerPickIds = null }) {
  if (!validMapBounds(bounds)) throw new Error('Invalid map area');
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || Math.abs(origin.lat) > 90 || Math.abs(origin.lng) > 180) throw new Error('Invalid map origin');
  if (!config?.url || !config?.key) throw new Error('Map inventory configuration is unavailable');
  if (cursor && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) throw new Error('Invalid map cursor');
  const q = new URLSearchParams({ select: 'place_id,name,metro,lat,lng,category,secondary_categories,primary_type,google_types,cuisines,status,excluded,needs_review,signals,photo_ref,refreshed_at', order: 'place_id.asc', limit: String(MAP_AREA_PAGE_SIZE) });
  q.append('lat', `gte.${bounds.south}`); q.append('lat', `lte.${bounds.north}`);
  q.append('lng', `gte.${bounds.west}`); q.append('lng', `lte.${bounds.east}`);
  q.append('refreshed_at', `gte.${new Date(now - 30 * 86400000).toISOString()}`);
  if (cursor) q.set('place_id', `gt.${cursor}`);
  const response = await fetcher(`${config.url}/rest/v1/wf_inventory?${q}`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Map inventory read failed (${response.status})`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length > MAP_AREA_PAGE_SIZE) throw new Error('Map inventory response is invalid');
  const nextCursor = rows.length === MAP_AREA_PAGE_SIZE ? rows[rows.length - 1]?.place_id : null;
  if (rows.length === MAP_AREA_PAGE_SIZE && (typeof nextCursor !== 'string' || nextCursor <= cursor || !/^[A-Za-z0-9_-]{1,256}$/.test(nextCursor))) throw new Error('Map inventory pagination did not advance');
  // Preserve owned freshness, operational status, category exclusions and
  // geography BEFORE any session evidence can be considered. The client only
  // borrows creator/trend facts for these identities and applies the unchanged
  // 9.2 floor after that merge and its current curator set. Pages stay capped
  // at 500 raw rows and advance from the raw cursor, including filtered pages.
  const seen = new Set();
  const places = rows.map(row => mapInventoryCandidate(row, now, origin, ownerPickIds?.has(String(row.place_id))))
    .filter(p => p && placeInMapBounds(p, bounds) && mapCategoryMatches(p, 'all') && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => byGovernedScore(a, b) || a.id.localeCompare(b.id));
  return { places, nextCursor, complete: !nextCursor, source: 'wayfind-inventory' };
}
