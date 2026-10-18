import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadComponent } from './lib/jsxLoad.mjs';
import { stampOwnerPick } from '../lib/ownerBump.js';
import { applyCuratorPicks } from '../lib/curatorPicks.js';
import { readCompleteMapArea } from '../lib/mapAreaRead.js';
import { MAP_AREA_PAGE_SIZE, mergeMapAreaContext, keepMapPreview, mapInventoryPlace, readMapAreaPage, selectMapPlaces, validMapBounds } from '../lib/mapAreaData.js';
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
assert.equal(mapInventoryPlace(row(0, { needs_review: true }), now), null);
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
  ['excluded', { excluded: true }], ['needs review', { needs_review: true }],
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
assert.match(screen, /selectMapPlaces\(applyCuratorPicks\(liveAreaPlaces, curatorSnap\)/);
assert.match(screen, /view\.map\(\(p, i\)/);
assert.match(screen, /readCompleteMapArea/);
assert.match(screen, /controller\.abort\(\)/);
assert.match(screen, /areaStatus === "error" \? "partial results"/);
assert.doesNotMatch(screen, /slice\(0, (40|60)\)/);
const root = fileURLToPath(new URL('../', import.meta.url));
const route = await loadComponent(path.join(root, 'app/api/places/map/route.js'), root, { onGraph(graph) {
  const configFile = graph.get(path.join(root, 'lib/serverCache.js'));
  assert.ok(configFile, 'production route config dependency was compiled');
  writeFileSync(configFile, 'export const sbEnv = () => null;\n');
} });
assert.equal((await route.GET(new Request('https://example.org/api/places/map'))).status, 400, 'invalid API origin is rejected by the real handler');
const apiQuery = new URLSearchParams({ ...bounds, originLat: origin.lat, originLng: origin.lng });
const unavailable = await route.GET(new Request('https://example.org/api/places/map?' + apiQuery));
assert.equal(unavailable.status, 503, 'missing owned source is a visible failure rather than normal empty');
assert.equal(unavailable.headers.get('cache-control'), 'private, no-store');
console.log('Map area data: 1203-place traversal, six categories, post-context 9.0→9.6 admission/curator fallback/creator continuity, freshness, geo, dedupe, shared filters, fetch/body deadlines and cancellation verified.');
