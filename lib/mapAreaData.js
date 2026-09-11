import { wayfindScore } from './wayfindScore.js';
import { toDisplayScore } from './score.js';
import { governedScoreOf, byGovernedScore } from './lawfulOrder.js';
import { isOperational } from './businessStatus.js';
import { existingTypeSignals } from './placeCategory.js';
import { CAT_ALLOW, CAT_EXCLUDE } from './placeFilter.js';
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
export function mapPlaceQualifies(p) {
  const score = toDisplayScore(Number.isFinite(p?.governed_score) ? p.governed_score : p?.wfScore);
  return !!p?.id && !!p.name && score !== null && score >= MAP_MIN_SCORE && isOperational(p)
    && typeof p.lat === 'number' && Number.isFinite(p.lat) && typeof p.lng === 'number' && Number.isFinite(p.lng);
}
export function mapCategoryMatches(p, category) {
  if (category === 'all') return true;
  if (category === 'family') {
    const hay = [...existingTypeSignals(p), p.name || ''].join(' ');
    return CAT_ALLOW.family.test(hay) && !CAT_EXCLUDE.family.test(hay);
  }
  return p.category === category || p.secondaryCategories?.includes(category);
}
export function keepMapPreview(place, visiblePlaces, category, status) {
  if (!mapPlaceQualifies(place) || !mapCategoryMatches(place, category)) return false;
  return status !== 'ready' || visiblePlaces.some(p => p.id === place.id);
}
export function selectMapPlaces(places, category = 'all', bounds = null) {
  const seen = new Set();
  return (places || []).filter(p => mapPlaceQualifies(p) && (!bounds || placeInMapBounds(p, bounds))
    && mapCategoryMatches(p, category)
    && !seen.has(p.id) && seen.add(p.id)).sort((a, b) => byGovernedScore(a, b) || a.id.localeCompare(b.id));
}

// Owned inventory only. The score uses the same governed law as cards, including verified creator evidence,
// never taste, affiliate value or a synthetic minimum. Google content expires at 30d.
export function mapInventoryPlace(row, now = Date.now(), origin = null) {
  if (!row || row.excluded === true || row.needs_review === true || !isOperational(row)) return null;
  const refreshed = Date.parse(row.refreshed_at);
  if (!Number.isFinite(refreshed) || refreshed > now || now - refreshed > 30 * 86400000) return null;
  const s = row.signals || {};
  const types = existingTypeSignals(row);
  const p = {
    id: row.place_id, name: row.name, city: row.metro || null, lat: row.lat, lng: row.lng,
    rating: typeof s.rating === 'number' ? s.rating : null,
    reviews: typeof s.reviews === 'number' ? s.reviews : 0,
    wfScore: wayfindScore(s.rating, s.reviews || 0),
    category: row.category, secondaryCategories: row.secondary_categories || [],
    types, type: (row.primary_type || types[0] || '').replace(/_/g, ' '), primaryType: row.primary_type || null,
    cuisines: row.cuisines || [], status: row.status, priceNum: s.priceNum ?? null,
    photoRef: row.photo_ref || null, photo_ref: row.photo_ref || null,
    address: '', openNow: null, _wfInventory: true,
    distMi: origin ? railDistanceMi(origin.lat, origin.lng, row.lat, row.lng) : null,
  };
  p.governed_score = governedScoreOf(p, row.metro);
  return mapPlaceQualifies(p) ? p : null;
}

export async function readMapAreaPage({ bounds, origin, cursor = '', config, fetcher, now = Date.now() }) {
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
  if (!Array.isArray(rows)) throw new Error('Map inventory response is invalid');
  const nextCursor = rows.length === MAP_AREA_PAGE_SIZE ? rows[rows.length - 1]?.place_id : null;
  if (nextCursor && (nextCursor === cursor || !/^[A-Za-z0-9_-]{1,256}$/.test(nextCursor))) throw new Error('Map inventory pagination did not advance');
  return { places: selectMapPlaces(rows.map(row => mapInventoryPlace(row, now, origin)).filter(Boolean), 'all', bounds), nextCursor, complete: !nextCursor, source: 'wayfind-inventory' };
}
