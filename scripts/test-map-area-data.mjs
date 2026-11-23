import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadComponent } from './lib/jsxLoad.mjs';
import { stampOwnerPick } from '../lib/ownerBump.js';
import { applyCuratorPicks } from '../lib/curatorPicks.js';
import { readCompleteMapArea } from '../lib/mapAreaRead.js';
import { MAP_AREA_PAGE_SIZE, MAP_SPARSE_FALLBACK_MIN_SCORE, MAP_SPARSE_TOPUP_THRESHOLD, MAP_NEAREST_WIDEN_MAX_MILES, mergeMapAreaContext, keepMapPreview, mapInventoryPlace, readMapAreaPage, selectMapPlaces, selectMapPlacesSparseFallback, selectMapPlacesWithSparseTopUp, selectNearestAreaFallback, validMapBounds } from '../lib/mapAreaData.js';
const now = Date.parse('2026-09-10T12:00:00Z');
const origin = { lat: 28.5, lng: -81.5 };
const bounds = { north: 29, south: 28, east: -81, west: -82 };
const row = (i, extra = {}) => ({ place_id: `p${String(i).padStart(5, '0')}`, name: `Place ${i}`, lat: 28.5, lng: -81.5, category: ['food', 'nightlife', 'attractions', 'beach', 'hotels', 'shopping'][i % 6], primary_type: ['restaurant', 'bar', 'museum', 'beach', 'hotel', 'shopping_mall'][i % 6], google_types: [['restaurant'], ['bar'], ['museum'], ['beach'], ['hotel'], ['shopping_mall']][i % 6], signals: { rating: 4.9, reviews: 1000 }, status: 'OPERATIONAL', refreshed_at: new Date(now - 86400000).toISOString(), ...extra });
assert.equal(validMapBounds(bounds), true);
assert.equal(validMapBounds({ ...bounds, south: 30 }), false);
assert.equal(validMapBounds({ ...bounds, east: NaN }), false);
assert.ok(mapInventoryPlace(row(0), now));
assert.equal(mapInventoryPlace(row(0, { signals: {} }), now), null);
assert.equal(mapInventoryPlace(row(0, { signals: { rating: 5, reviews: 4 } }), now), null);
assert.equal(mapInventoryPlace(row(0, { refreshed_at: new Date(now - 31 * 86400000).toISOString() }), now), null);
assert.equal(mapInventoryPlace(row(0, { refreshed_at: null }), now), null);
assert.equal(mapInventoryPlace(row(0, { excluded: true }), now), null);
// needs_review flags a category for a human; the list serves those rows, so the
// map must too (lib/servableRow.js, scripts/check-map-list-row-gate.mjs).
assert.ok(mapInventoryPlace(row(0, { needs_review: true }), now), 'a needs_review row the list serves is a map candidate');
assert.equal(mapInventoryPlace(row(0, { status: 'CLOSED_PERMANENTLY' }), now), null);
// The distance term belongs to the governed number, measured from the actual
// search origin; moving the camera alone must not invent a new scoring origin.
const near = mapInventoryPlace(row(9), now, origin);
const far = mapInventoryPlace(row(9), now, { lat: 27.5, lng: -81.5 });
assert.ok(near.distMi < 1);
assert.ok(far.distMi > 17);
assert.equal(near.governed_score - far.governed_score, 2);
const creator = mapInventoryPlace(row(10, { place_id: 'ChIJfUYeWmAlw4gReflS439GCg0', name: 'Gamble Creek Farms', metro: 'Parrish', lat: 27.6, lng: -82.4 }), now, { lat: 27.6, lng: -82.4 });
assert.ok(creator.governed_score > creator.wfScore, 'a verified creator association is applied through the shared score law');
const pool = Array.from({ length: 1203 }, (_, i) => row(i));
let calls = 0;
const fetcher = async (url, init) => {
  calls++;
  assert.ok(url.startsWith('https://owned.example/rest/v1/wf_inventory?'));
  assert.equal(init.cache, 'no-store');
  const params = new URL(url).searchParams;
  assert.deepEqual(params.getAll('lat'), ['gte.28', 'lte.29']);
  assert.equal(params.get('order'), 'place_id.asc');
  assert.equal(params.has('category'), false);
  const cursor = params.get('place_id')?.slice(3) || '';
  return { ok: true, json: async () => pool.filter(r => r.place_id > cursor).slice(0, MAP_AREA_PAGE_SIZE) };
};
let cursor = '', complete = false;
const all = [];
do {
  const page = await readMapAreaPage({ bounds, origin, cursor, config: { url: 'https://owned.example', key: 'test-only' }, fetcher, now });
  all.push(...page.places); cursor = page.nextCursor; complete = page.complete;
} while (!complete);
assert.equal(calls, 3);
assert.equal(all.length, 1203, 'All qualifying places survive both 500 and historical 1000 ceilings');
assert.equal(selectMapPlaces(all).length, 1203);
for (const category of ['food', 'nightlife', 'attractions', 'beach', 'hotels', 'shopping']) {
  assert.ok(selectMapPlaces(all, category).length >= 200);
}
const p = mapInventoryPlace(row(7), now);
assert.equal(selectMapPlaces([p, p]).length, 1);
assert.equal(keepMapPreview(p, [], 'all', 'loading'), true, 'camera paging must keep the card during the next area load');
assert.equal(keepMapPreview(p, [], 'all', 'error'), true);
assert.equal(keepMapPreview(p, [], 'all', 'ready'), false, 'completed absence dismisses the old selection');
assert.equal(keepMapPreview(p, [p], 'all', 'ready'), true);
assert.equal(keepMapPreview({ ...p, wfScore: 91, governed_score: 91 }, [], 'all', 'loading'), false);
assert.equal(keepMapPreview(p, [], 'hotels', 'loading'), false, 'category change still dismisses a mismatched selection');
assert.equal(selectMapPlaces([{ ...p, lat: 30 }], 'all', bounds).length, 0);
assert.equal(selectMapPlaces([{ ...p, wfScore: 91, governed_score: 91 }]).length, 0);
assert.equal(selectMapPlaces([{ ...p, wfScore: 92, governed_score: 92 }]).length, 1);
assert.equal(selectMapPlaces([{ ...p, wfScore: 90, governed_score: 94 }]).length, 1, 'qualification uses the governed number the card displays');
assert.equal(selectMapPlaces([{ ...p, id: 'lower', governed_score: 92 }, { ...p, id: 'higher', governed_score: 94 }])[0].id, 'higher');
assert.equal(selectMapPlaces([{ ...p, category: 'food', secondaryCategories: ['hotels'] }], 'hotels').length, 0, 'incidental secondary categories cannot override current primary identity');
assert.equal(selectMapPlaces([{ ...p, category: 'nightlife', secondaryCategories: ['food'] }], 'food').length, 1, 'a legitimate bar secondary food identity remains admitted');
await assert.rejects(readMapAreaPage({ bounds, origin, config: { url: 'x', key: 'y' }, fetcher: async () => ({ ok: true, json: async () => Array.from({ length: MAP_AREA_PAGE_SIZE }, () => ({ name: 'broken cursor row' })) }) }), /pagination/);
await assert.rejects(readMapAreaPage({ bounds, origin, config: null, fetcher }), /configuration/);
await assert.rejects(readMapAreaPage({ bounds, origin, config: { url: 'x', key: 'y' }, fetcher: async () => ({ ok: false, status: 503 }) }), /failed/);
await assert.rejects(readMapAreaPage({ bounds, origin, cursor: 'injected&limit=1', config: { url: 'x', key: 'y' }, fetcher }), /cursor/);
// Current identity and curator rules apply before score admission.
assert.equal(selectMapPlaces([mapInventoryPlace(row(0, { primary_type: 'general_contractor', google_types: ['general_contractor'], name: 'HVAC contractor' }), now)]).length, 0, 'All also excludes services and adult/non-public inventory');
const borderline = row(0, { signals: { rating: 4.6, reviews: 1000 } });
const before = mapInventoryPlace(borderline, now);
assert.equal(before, null, 'a genuinely below-floor non-pick is not admitted');
const picked = mapInventoryPlace(borderline, now, origin, true);
assert.ok(picked && picked._members.ownerPick === true && picked.governed_score >= 92, 'server curator pick enters the floor after its disclosed bump');
assert.equal(stampOwnerPick(picked, true).governed_score, picked.governed_score, 'restamping a pick does not stack its score');
const preservedCreator = mapInventoryPlace(row(0, { signals: { rating: 4.9, reviews: 1000, creator_video: true } }), now, origin);
assert.equal(stampOwnerPick(preservedCreator, true).creator_video, true, 'owner recompute retains the recorded creator verdict');
const liveTrend = mergeMapAreaContext([preservedCreator], [{ id: preservedCreator.id, trending: true, trend_reason: 'Busy with locals' }])[0];
assert.equal(liveTrend.trend_reason, 'Busy with locals');
assert.equal(liveTrend.governed_score, Math.max(preservedCreator.governed_score, Math.min(99, preservedCreator.governed_score + 6)), 'current-session trend evidence and its disclosure remain one score input with the shared ceiling');
// API → context merge → current curator set → display floor. The server must
// not drop a valid owned identity before the session's score evidence exists.
const candidatePage = (rows, extra = {}) => readMapAreaPage({ bounds, origin, now,
  config: { url: 'https://owned.example', key: 'test-only' },
  fetcher: async () => ({ ok: true, json: async () => rows }), ...extra });
const candidate = await candidatePage([borderline]);
assert.equal(candidate.places.length, 1, 'a fresh owned 9.0 survives transport as a candidate');
assert.equal(candidate.places[0].governed_score, 90);
assert.equal(candidate.complete, true);
assert.equal(candidate.nextCursor, null);
assert.equal(selectMapPlaces(candidate.places, 'all', bounds).length, 0, 'without session evidence a 9.0 never displays');
const knownTrend = { id: borderline.place_id, trending: true, trend_reason: 'Busy with locals',
  // Session data must never replace the current owned identity or base score.
  name: 'Old name', lat: 0, lng: 0, category: 'hotels', rating: 5, reviews: 999999, wfScore: 100, governed_score: 100 };
const admitted = selectMapPlaces(mergeMapAreaContext(candidate.places, [knownTrend]), 'all', bounds);
assert.equal(admitted.length, 1, 'fresh owned 9.0 plus known trend is admitted after the merge');
assert.equal(admitted[0].governed_score, 96, 'the display uses the real governed 9.6, not a synthetic minimum');
assert.equal(admitted[0].trend_reason, 'Busy with locals');
assert.equal(admitted[0].name, borderline.name);
assert.equal(admitted[0].category, borderline.category);
assert.equal(admitted[0].rating, borderline.signals.rating);
assert.equal(admitted[0].lat, borderline.lat);
assert.equal(admitted[0].lng, borderline.lng);
assert.equal(selectMapPlaces(mergeMapAreaContext([], [knownTrend]), 'all', bounds).length, 0, 'context alone cannot invent an owned result');
const creatorAdmitted = selectMapPlaces(mergeMapAreaContext(candidate.places, [{ id: borderline.place_id, creator_video: true }]), 'all', bounds);
assert.equal(creatorAdmitted[0]?.governed_score, 92, 'known creator evidence can also cross the floor');
assert.equal(creatorAdmitted[0]?.creator_video, true);
for (const duplicates of [
  [knownTrend, { id: borderline.place_id, trending: false, creator_video: false }],
  [{ id: borderline.place_id, trending: false, creator_video: false }, knownTrend],
]) {
  const result = selectMapPlaces(mergeMapAreaContext(candidate.places, duplicates), 'all', bounds);
  assert.equal(result[0]?.governed_score, 96, 'an unenriched duplicate cannot erase current-session trend evidence');
}
const splitEvidence = [knownTrend, { id: borderline.place_id, creator_video: true },
  { id: borderline.place_id, trending: false, creator_video: false, governed_score: 100 }];
const combinedDuplicates = selectMapPlaces(mergeMapAreaContext(candidate.places, splitEvidence), 'all', bounds);
assert.equal(combinedDuplicates[0]?.governed_score, 98, 'positive creator and trend facts on different duplicates combine once');
assert.equal(combinedDuplicates[0]?.trend_reason, knownTrend.trend_reason);
assert.equal(combinedDuplicates[0]?.creator_video, true);
assert.equal(selectMapPlaces(mergeMapAreaContext(candidate.places,
  [{ id: borderline.place_id, trending: true }]), 'all', bounds).length, 0, 'a trend without a disclosure cannot admit a result');

const knownPick = { known: (id) => id === borderline.place_id, has: (id) => id === borderline.place_id };
assert.equal(selectMapPlaces(applyCuratorPicks(candidate.places, knownPick), 'all', bounds)[0]?.governed_score, 92,
  'current-session curator evidence still admits a fresh identity when the server curator read is unknown');
const serverPicked = await candidatePage([borderline], { ownerPickIds: new Set([borderline.place_id]) });
assert.equal(serverPicked.places[0].governed_score, 92);
assert.equal(applyCuratorPicks(serverPicked.places, knownPick)[0].governed_score, 92, 'server/client curator reconciliation never stacks');
const combined = selectMapPlaces(applyCuratorPicks(mergeMapAreaContext(candidate.places,
  [{ ...knownTrend, creator_video: true }]), knownPick), 'all', bounds)[0];
assert.equal(combined.creator_video, true);
assert.equal(combined._members.ownerPick, true);
assert.equal(combined.governed_score, 99, 'creator, curator and disclosed trend retain the governed ceiling');
for (const [label, patch] of [
  ['excluded', { excluded: true }],
  ['closed', { status: 'CLOSED_PERMANENTLY' }], ['temporary closure', { status: 'CLOSED_TEMPORARILY' }],
  ['expired', { refreshed_at: new Date(now - 31 * 86400000).toISOString() }],
  ['future refresh', { refreshed_at: new Date(now + 86400000).toISOString() }],
  ['missing refresh', { refreshed_at: null }], ['out of viewport', { lat: bounds.north + 1 }],
  ['invalid coordinate', { lat: null }], ['unrated', { signals: {} }],
  ['service identity', { primary_type: 'general_contractor', google_types: ['general_contractor'], name: 'HVAC contractor' }],
  ['not public', { place_id: 'ChIJWSN54VZBw4gRJeqLPipSLEM' }],
]) {
  const rejectedRow = { ...borderline, ...patch };
  const rejectedPage = await candidatePage([rejectedRow]);
  assert.equal(rejectedPage.places.length, 0, `${label}: rejected on the server before session merge`);
  assert.equal(selectMapPlaces(applyCuratorPicks(mergeMapAreaContext(rejectedPage.places,
    [{ ...knownTrend, id: rejectedRow.place_id, creator_video: true }]), knownPick), 'all', bounds).length, 0,
    `${label}: trend/creator/curator evidence cannot resurrect rejected owned data`);
}
// A lower-score page is still a real page. Traverse it completely, then admit
// the final page's one known trend without truncating at a zero display count.
const candidateRows = Array.from({ length: 501 }, (_, i) => row(i, { signals: { rating: 4.6, reviews: 1000 } }));
let candidateCalls = 0;
const candidatePages = await readCompleteMapArea({ bounds, origin, fetcher: async (url) => {
  candidateCalls++;
  const cursor = new URL(url, 'https://wayfind.example').searchParams.get('cursor') || '';
  const raw = candidateRows.filter((r) => r.place_id > cursor).slice(0, MAP_AREA_PAGE_SIZE);
  const page = await candidatePage(raw, { cursor });
  assert.ok(page.places.length <= MAP_AREA_PAGE_SIZE, 'candidate payload is bounded by raw page size');
  return { ok: true, json: async () => page };
} });
assert.equal(candidateCalls, 2);
assert.equal(candidatePages.length, 501);
assert.equal(selectMapPlaces(candidatePages, 'all', bounds).length, 0);
const finalCandidate = candidateRows.at(-1);
assert.equal(selectMapPlaces(mergeMapAreaContext(candidatePages, [{ id: finalCandidate.place_id,
  trending: true, trend_reason: 'Busy with locals' }]), 'all', bounds)[0]?.id, finalCandidate.place_id,
  'complete raw pagination preserves a qualifying current-session place beyond a full lower-score page');
const cancellation = new AbortController();
const abandoned = readCompleteMapArea({ bounds, origin, timeoutMs: 1000, signal: cancellation.signal, fetcher: async () => new Promise(() => {}) });
cancellation.abort(new Error('cancelled old viewport'));
await assert.rejects(abandoned, /cancelled old viewport/, 'even an uncooperative fetch settles immediately when its viewport is abandoned');
let pageCalls = 0;
const pages = await readCompleteMapArea({ bounds, origin, fetcher: async () => ({ ok: true, json: async () => ++pageCalls === 1 ? { places: all.slice(0, 500), nextCursor: 'p00499', complete: false } : { places: all.slice(500), nextCursor: null, complete: true } }) });
assert.equal(pages.length, 1203, 'browser paging consumes the complete pool beyond the old 1000-row ceiling');
await assert.rejects(readCompleteMapArea({ bounds, origin, fetcher: async () => ({ ok: true, json: async () => ({ places: [], complete: false }) }) }), /Incomplete/);
await assert.rejects(readCompleteMapArea({ bounds, origin, timeoutMs: 10, fetcher: async () => new Promise(() => {}) }), /deadline/, 'a stuck fetch settles within the page deadline');
await assert.rejects(readCompleteMapArea({ bounds, origin, timeoutMs: 10, fetcher: async () => ({ ok: true, json: async () => new Promise(() => {}) }) }), /deadline/, 'a stuck response body also settles');
const cancelled = new AbortController();
cancelled.abort();
await assert.rejects(readCompleteMapArea({ bounds, origin, signal: cancelled.signal, fetcher: async () => { throw new Error('must not fetch'); } }), /abort/i);
const screen = readFileSync(new URL('../app/components/screens/Map.js', import.meta.url), 'utf8');
assert.match(screen, /<AppleExplorerMap/);
assert.match(screen, /<MapView[\s\S]{0,400}onViewportChange=\{setViewport\}/);
assert.match(screen, /<CategoryMenu compact activeCat=\{cat\}/, 'shared category and current default remain');
assert.match(screen, /shouldApplyMapDefault/);
assert.match(screen, /selectMapPlacesWithSparseTopUp\(applyCuratorPicks\(liveAreaPlaces, curatorSnap\)/);
assert.match(screen, /view\.map\(\(p, i\)/);
assert.match(screen, /readCompleteMapArea/);
assert.match(screen, /controller\.abort\(\)/);
// List-scoped and area maps share one status label (lib/mapListScope.js).
assert.match(screen, /mapStatus === "error" \? "partial results"/);
assert.match(screen, /const mapStatus = explicitList \? listStatus : areaStatus;/);
assert.match(screen, /const reqId = \+\+areaReqSeq\.current;/, 'monotonic request counter prevents out-of-order area responses from overwriting newer state');
assert.match(screen, /areaReqSeq\.current !== reqId/, 'stale in-flight page and completion callbacks are ignored');
assert.match(screen, /const outside = existing\.filter\(\(r\) => !placeInMapBounds\(r, viewport\)\);/, 'completed viewport reads replace stale in-viewport rows while retaining out-of-viewport cache');
assert.match(screen, /const activeSet = filterTrim && filteredView\.some\(\(x\) => x && x\.id === mp\.id\) \? filteredView : view;/, 'single-card preview pager and List (N) return button stay synchronized with the active drawer filter');
assert.doesNotMatch(screen, /slice\(0, (40|60)\)/);
const root = fileURLToPath(new URL('../', import.meta.url));
const route = await loadComponent(path.join(root, 'app/api/places/map/route.js'), root, { onGraph(graph) {
  const configFile = graph.get(path.join(root, 'lib/serverCache.js'));
  assert.ok(configFile, 'production route config dependency was compiled');
  const orig = readFileSync(configFile, 'utf8');
  writeFileSync(configFile, orig.replace(/export function sbEnv\(\)[\s\S]*?^\}/m, 'export const sbEnv = () => null;'));
} });
assert.equal((await route.GET(new Request('https://example.org/api/places/map'))).status, 400, 'invalid API origin is rejected by the real handler');
const apiQuery = new URLSearchParams({ ...bounds, originLat: origin.lat, originLng: origin.lng });
const unavailable = await route.GET(new Request('https://example.org/api/places/map?' + apiQuery));
assert.equal(unavailable.status, 503, 'missing owned source is a visible failure rather than normal empty');
assert.equal(unavailable.headers.get('cache-control'), 'private, no-store');

// Owner 2026-11-23: sparse-area top-up (< 8 strict 9.2+) and bounded 15-mi nearest-area auto-widen.
{
  assert.equal(MAP_SPARSE_FALLBACK_MIN_SCORE, 7.5);
  assert.equal(MAP_SPARSE_TOPUP_THRESHOLD, 8);
  assert.equal(MAP_NEAREST_WIDEN_MAX_MILES, 15);
  const parrishBounds = { north: 27.69, south: 27.55, east: -82.12, west: -82.58 };
  const parrishCafe = { id: 'parrish-bistro', name: 'Parrish Breakfast Cafe', category: 'food', primaryType: 'breakfast_restaurant', types: ['breakfast_restaurant', 'cafe'], lat: 27.58, lng: -82.42, wfScore: 84, governed_score: 84 };
  const parrishDiner = { id: 'parrish-diner', name: 'Countryside Diner', category: 'food', primaryType: 'diner', types: ['diner', 'restaurant'], lat: 27.59, lng: -82.41, wfScore: 75, governed_score: 75 };
  const fastFoodSubpar = { id: 'subpar-fast', name: 'Highway Drive-Thru Breakfast', category: 'food', primaryType: 'fast_food_restaurant', types: ['fast_food_restaurant', 'breakfast_restaurant'], lat: 27.58, lng: -82.43, wfScore: 74, governed_score: 74 };
  const lunchOnly = { id: 'lunch-steak', name: 'Parrish Steakhouse', category: 'food', primaryType: 'steak_house', types: ['steak_house', 'restaurant'], lat: 27.58, lng: -82.44, wfScore: 89, governed_score: 89 };
  const sparsePool = [parrishCafe, parrishDiner, fastFoodSubpar, lunchOnly];

  assert.equal(selectMapPlaces(sparsePool, 'food', parrishBounds, 'breakfast').length, 0, 'strict 9.2+ yields 0 matches in sparse Parrish Breakfast');
  const fallback = selectMapPlacesSparseFallback(sparsePool, 'food', parrishBounds, 'breakfast');
  assert.deepEqual(fallback.map(x => x.id), ['parrish-bistro', 'parrish-diner'], 'sparse fallback surfaces >= 7.5 local Breakfast spots and excludes < 7.5 and non-breakfast spots');

  // Sparse top-up (< 8 strict 9.2+): 2 strict Food spots + 2 >= 7.5 spots -> all 4 returned with 9.2+ leading.
  const eliteSpot1 = { ...parrishCafe, id: 'elite-brunch-1', name: 'Elite Brunch House', wfScore: 95, governed_score: 95 };
  const eliteSpot2 = { ...parrishCafe, id: 'elite-brunch-2', name: 'Morning Roasters', wfScore: 92, governed_score: 92 };
  const topUpSparse = selectMapPlacesWithSparseTopUp([...sparsePool, eliteSpot1, eliteSpot2], 'food', parrishBounds, 'breakfast');
  assert.equal(topUpSparse.sparseFallback, true, 'sparse top-up triggers when strict 9.2+ count is below MAP_SPARSE_TOPUP_THRESHOLD (8)');
  assert.deepEqual(topUpSparse.places.map(x => x.id), ['elite-brunch-1', 'elite-brunch-2', 'parrish-bistro', 'parrish-diner'], 'sparse top-up leads with 9.2+ then >= 7.5 and excludes < 7.5');

  // Dense area (>= 8 strict 9.2+) stays 100% strict 9.2+ with sparseFallback: false.
  const denseElites = Array.from({ length: 8 }, (_, i) => ({ ...parrishCafe, id: `dense-${i}`, name: `Dense ${i}`, wfScore: 92 + (i % 6), governed_score: 92 + (i % 6) }));
  const topUpDense = selectMapPlacesWithSparseTopUp([...denseElites, parrishCafe, parrishDiner], 'food', parrishBounds, 'breakfast');
  assert.equal(topUpDense.sparseFallback, false, 'dense area with >= 8 strict 9.2+ stays strictly 9.2+');
  assert.equal(topUpDense.places.length, 8, 'dense area never admits < 9.2 spots');

  // Strict 9.2+ stays strict whenever called directly.
  const strictWithElite = selectMapPlaces([...sparsePool, eliteSpot1], 'food', parrishBounds, 'breakfast');
  assert.deepEqual(strictWithElite.map(x => x.id), ['elite-brunch-1'], 'when 9.2+ exists, strict selectMapPlaces never admits < 9.2');

  // Bounded 15-mi nearest-area fallback (e.g. Parrish Creekside Commons Breakfast 0.4 mi south of viewport).
  const parrishCenter = { lat: 27.588, lng: -82.426 };
  const firstWatch = { id: 'first-watch', name: 'First Watch', category: 'food', primaryType: 'breakfast_restaurant', types: ['breakfast_restaurant'], lat: 27.542, lng: -82.425, wfScore: 92, governed_score: 92 };
  const butterfields = { id: 'butterfields', name: 'Butterfields Family Restaurant', category: 'food', primaryType: 'breakfast_restaurant', types: ['breakfast_restaurant'], lat: 27.540, lng: -82.424, wfScore: 90, governed_score: 90 };
  const tampaFar = { id: 'tampa-far-bfast', name: 'Tampa Far Brunch', category: 'food', primaryType: 'breakfast_restaurant', types: ['breakfast_restaurant'], lat: 27.95, lng: -82.46, wfScore: 98, governed_score: 98 };
  const widened = selectNearestAreaFallback([firstWatch, butterfields, tampaFar, fastFoodSubpar], 'food', 'breakfast', parrishCenter);
  assert.deepEqual(widened.map(x => x.id), ['first-watch', 'butterfields'], 'nearest-area fallback finds Creekside Commons breakfast spots within 15 mi and never widens across metros (> 15 mi)');
  // When > 16 places exist within 15 mi, nearest 16 win over farther 14.9 mi places, then sort by governed_score.
  const crowdedFarWithin15 = Array.from({ length: 18 }, (_, i) => ({
    ...firstWatch, id: `edge-${i}`, name: `Edge ${i}`, lat: 27.40, lng: -82.426, wfScore: 96, governed_score: 96,
  }));
  const cappedWiden = selectNearestAreaFallback([...crowdedFarWithin15, butterfields, firstWatch], 'food', 'breakfast', parrishCenter, { limit: 16 });
  assert.equal(cappedWiden.length, 16, 'nearest-area fallback respects limit');
  assert.ok(cappedWiden.some(x => x.id === 'first-watch') && cappedWiden.some(x => x.id === 'butterfields'), 'closest 3-mi spots are preserved over 13-mi edge spots before final governed-score sort');
  assert.deepEqual(selectNearestAreaFallback([firstWatch], 'food', 'breakfast', null), [], 'missing referenceCenter returns empty');

  // keepMapPreview respects allowSparseFallback.
  assert.equal(keepMapPreview(parrishCafe, fallback, 'food', 'ready'), false, 'keepMapPreview rejects < 9.2 without allowSparseFallback');
  assert.equal(keepMapPreview(parrishCafe, fallback, 'food', 'ready', { allowSparseFallback: true }), true, 'keepMapPreview keeps sparse fallback card when allowSparseFallback=true');
  assert.equal(keepMapPreview(fastFoodSubpar, fallback, 'food', 'ready', { allowSparseFallback: true }), false, 'keepMapPreview still rejects < 7.5 even with allowSparseFallback=true');
}

// Owner 2026-11-23: wire GoWayfind's existing inventory metadata + stored photos (Tier 1/2/3, zero external API calls).
{
  const { hydrateMapPlacesWithStoredPhotos } = await import('../lib/mapAreaPhotos.js');

  // 1. mapInventoryPlace preserves existing GoWayfind fields from wf_inventory.
  const richRow = row(42, {
    place_id: 'ChIJRichInventoryPlace01',
    editorial: 'Wood-fired pizzas and housemade pasta.',
    signals: {
      rating: 4.9,
      reviews: 1200,
      priceNum: 2,
      website: 'https://richvenue.example/',
      photo_url: '/places/rich-cover.webp',
      photos: ['/place-photos/batch-1/rich.jpg'],
      photo_gallery: [{
        url: '/place-photos/batch-1/rich.jpg',
        source: 'official_website',
        license: 'Courtesy of venue',
        attribution_text: 'Photo: Rich Venue',
        attribution_url: 'https://richvenue.example/',
      }],
    },
  });
  const richMapped = mapInventoryPlace(richRow, now, origin);
  assert.equal(richMapped.photo_url, '/places/rich-cover.webp');
  assert.equal(richMapped.photoUrl, '/places/rich-cover.webp');
  assert.deepEqual(richMapped.owned_photos, ['/place-photos/batch-1/rich.jpg']);
  assert.equal(richMapped.photo_gallery.length, 1);
  assert.deepEqual(richMapped.editorialSummary, { text: 'Wood-fired pizzas and housemade pasta.' });
  assert.equal(richMapped.website, 'https://richvenue.example/');
  assert.equal(richMapped.priceLevel, 2);

  // 2. mergeMapAreaContext preserves GoWayfind photos, editorial, cuisines, tags, price, address, website, hours without replacing owned identity/score.
  const bareArea = mapInventoryPlace(row(43, { place_id: 'ChIJBareAreaRow0000001', cuisines: [], tags: [], editorial: null, signals: { rating: 4.8, reviews: 900 } }), now, origin);
  const ctxRich = {
    id: bareArea.id,
    name: 'Wrong Context Name',
    lat: 0,
    lng: 0,
    governed_score: 100,
    wfPhoto: { src: '/api/photo/stored/ChIJBareAreaRow0000001?v=' + 'a'.repeat(64), source: 'google', credit: { name: 'Photog', mapsUri: 'https://maps.google.com/?cid=1', authors: [{ name: 'Photog' }] } },
    photo: '/api/photo/stored/ChIJBareAreaRow0000001?v=' + 'a'.repeat(64),
    photo_url: '/places/ctx-cover.jpg',
    photoRef: 'places/ChIJBareAreaRow0000001/photos/Ref123',
    editorial: 'Neighborhood taco stand with handmade tortillas.',
    line: 'Neighborhood taco stand with handmade tortillas.',
    cuisines: ['Mexican'],
    tags: ['lunch', 'dinner'],
    priceNum: 2,
    address: '123 Main St, Parrish, FL',
    website: 'https://tacos.example/',
  };
  const mergedRich = mergeMapAreaContext([bareArea], [ctxRich])[0];
  assert.equal(mergedRich.name, bareArea.name, 'mergeMapAreaContext never overrides owned name');
  assert.equal(mergedRich.lat, bareArea.lat, 'mergeMapAreaContext never overrides owned lat');
  assert.equal(mergedRich.governed_score, bareArea.governed_score, 'mergeMapAreaContext never borrows precomputed governed_score');
  assert.equal(mergedRich.wfPhoto.src, ctxRich.wfPhoto.src, 'mergeMapAreaContext carries wfPhoto');
  assert.equal(mergedRich.photo, ctxRich.photo, 'mergeMapAreaContext carries photo');
  assert.equal(mergedRich.photoRef, ctxRich.photoRef, 'mergeMapAreaContext carries photoRef');
  assert.equal(mergedRich.editorial, ctxRich.editorial, 'mergeMapAreaContext carries editorial');
  assert.deepEqual(mergedRich.editorialSummary, { text: ctxRich.editorial }, 'mergeMapAreaContext derives editorialSummary');
  assert.equal(mergedRich.line, ctxRich.line, 'mergeMapAreaContext carries line');
  assert.deepEqual(mergedRich.cuisines, ['Mexican'], 'mergeMapAreaContext carries cuisines');
  assert.deepEqual(mergedRich.tags, ['lunch', 'dinner'], 'mergeMapAreaContext carries tags');
  assert.equal(mergedRich.priceNum, 2, 'mergeMapAreaContext carries priceNum');
  assert.equal(mergedRich.address, ctxRich.address, 'mergeMapAreaContext carries address');
  assert.equal(mergedRich.website, ctxRich.website, 'mergeMapAreaContext carries website');

  // 3. hydrateMapPlacesWithStoredPhotos: Tier 1 gallery, Tier 2 wf_place_photo, Tier 3 wf_google_photo_store, ZERO external API calls, fail-soft.
  const ID_T1 = 'ChIJTierOneGallery00001';
  const ID_T2 = 'ChIJTierTwoFreePhoto002';
  const ID_T3 = 'ChIJTierThreeGoogle0003';
  const ID_NONE = 'ChIJNoStoredPhoto000004';
  const HASH64 = 'b'.repeat(64);
  const rawRowsById = new Map([
    [ID_T1, {
      place_id: ID_T1,
      signals: {
        photo_gallery: [{
          url: `https://www.gowayfind.com/place-photos/batch-1/${ID_T1}/cover.jpg`,
          source: 'official_website',
          license: 'Courtesy of venue',
          attribution_text: 'Photo: Tier One Cafe',
          attribution_url: 'https://tierone.example/',
        }],
      },
    }],
  ]);
  const requestedUrls = [];
  const hydrated = await hydrateMapPlacesWithStoredPhotos(
    [
      { id: ID_T1, name: 'Tier One', photo_gallery: rawRowsById.get(ID_T1).signals.photo_gallery },
      { id: ID_T2, name: 'Tier Two' },
      { id: ID_T3, name: 'Tier Three' },
      { id: ID_NONE, name: 'No Photo' },
    ],
    {
      rawRowsById,
      config: { url: 'https://owned.supabase.co', key: 'service-role-fixture' },
      stripRawGallery: true,
      vaultPublicUrl: (sp, base) => `${base}/storage/v1/object/public/place-photos/${sp}`,
      renditionUrl: (u) => u,
      fetcher: async (url, init) => {
        requestedUrls.push(String(url));
        assert.ok(String(url).startsWith('https://owned.supabase.co/rest/v1/'), 'must only hit configured Supabase REST, zero external APIs');
        assert.equal(init.headers.apikey, 'service-role-fixture');
        if (String(url).includes('/wf_place_photo')) {
          return {
            ok: true,
            json: async () => [{
              place_id: ID_T2,
              image_url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Spot.jpg',
              storage_path: `${ID_T2}/vault.webp`,
              license: 'CC BY-SA 4.0',
              attribution_text: 'Commons Author',
              attribution_url: 'https://commons.wikimedia.org/wiki/File:Spot.jpg',
              source: 'wikimedia',
              width: 1200,
            }],
          };
        }
        if (String(url).includes('/wf_google_photo_store')) {
          return {
            ok: true,
            json: async () => [{
              place_id: ID_T3,
              state: 'ready',
              version: HASH64,
              storage_path: `${ID_T3}/12345678-1234-1234-1234-123456789abc/${HASH64}`,
              content_type: 'image/jpeg',
              width: 1200,
              height: 800,
              bytes: 95000,
              credit: {
                name: 'Jane Google Photog',
                uri: 'https://maps.google.com/maps/contrib/1',
                mapsUri: 'https://maps.google.com/?cid=999',
                authors: [{ name: 'Jane Google Photog', uri: 'https://maps.google.com/maps/contrib/1' }],
              },
            }],
          };
        }
        throw new Error('unexpected URL: ' + url);
      },
    },
  );
  assert.equal(requestedUrls.length, 2, 'batch hydration makes at most 1 wf_place_photo + 1 wf_google_photo_store query');
  assert.ok(!requestedUrls[0].includes(ID_T1), 'Tier 1 hit is excluded from Tier 2 batch query');
  assert.ok(!requestedUrls[1].includes(ID_T1) && !requestedUrls[1].includes(ID_T2), 'Tier 1 & 2 hits are excluded from Tier 3 batch query');
  const h1 = hydrated.find((x) => x.id === ID_T1);
  const h2 = hydrated.find((x) => x.id === ID_T2);
  const h3 = hydrated.find((x) => x.id === ID_T3);
  const h4 = hydrated.find((x) => x.id === ID_NONE);
  assert.equal(h1.photo, `/place-photos/batch-1/${ID_T1}/cover.jpg`, 'Tier 1 sets photo from signals.photo_gallery');
  assert.equal(h1.wfPhoto.source, 'permitted');
  assert.equal(h1.wfPhoto.credit.name, 'Photo: Tier One Cafe');
  assert.equal('photo_gallery' in h1, false, 'stripRawGallery removes raw photo_gallery after hydrating wfPhoto');
  assert.equal(h2.photo, `https://owned.supabase.co/storage/v1/object/public/place-photos/${ID_T2}/vault.webp`, 'Tier 2 serves vaulted wf_place_photo URL');
  assert.equal(h2.wfPhoto.source, 'licensed');
  assert.equal(h2.wfPhoto.credit.license, 'CC BY-SA 4.0');
  assert.equal(h3.photo, `/api/photo/stored/${ID_T3}?v=${HASH64}`, 'Tier 3 sets stored Google photo URL');
  assert.equal(h3.wfPhoto.source, 'google');
  assert.equal(h3.wfPhoto.credit.name, 'Jane Google Photog', 'Tier 3 preserves photographer credit');
  assert.equal(h3.wfPhoto.credit.mapsUri, 'https://maps.google.com/?cid=999', 'Tier 3 preserves Google Maps credit link');
  assert.equal(h4.wfPhoto, undefined, 'place with no stored photo remains clean without fabrication');

  // Fail-soft: DB network errors never break map area responses.
  const failSoft = await hydrateMapPlacesWithStoredPhotos(
    [{ id: ID_T3, name: 'Still Here' }],
    { config: { url: 'https://owned.supabase.co', key: 'k' }, fetcher: async () => { throw new Error('db timeout'); } },
  );
  assert.equal(failSoft.length, 1);
  assert.equal(failSoft[0].id, ID_T3);
}

console.log('Map area data: 1203-place traversal, six categories, post-context 9.0→9.6 admission/curator fallback/creator continuity, freshness, geo, dedupe, shared filters, sparse-area top-up (<8), bounded 15-mi nearest-area fallback, GoWayfind Tier 1/2/3 batch photo hydration & metadata preservation, fetch/body deadlines and cancellation verified.');
