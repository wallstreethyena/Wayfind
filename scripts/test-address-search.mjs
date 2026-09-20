import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knownCityGeocode } from '../lib/knownCityGeocode.js';

// Execute the actual UI handlers; only network and React state setters are mocked.
const source = readFileSync(process.argv[2] || new URL('../app/home.js', import.meta.url), 'utf8');
function handler(name, next, ctx) {
  const start = source.indexOf(`  async function ${name}(`);
  assert(start > 0, `${name} exists`);
  const end = source.indexOf(next, start);
  assert(end > start, `${name} boundary exists`);
  return new Function('ctx', `with (ctx) { return (${source.slice(start, end).trim()}); }`)(ctx);
}
function harness(query, response = { suggestions: [{ placeId: 'address-id', text: query, kind: 'area' }] }) {
  const state = { suggestions: [], feedback: '', calls: [], nearby: 0 };
  const ctx = {
    query, center: { lat: 28.54, lng: -81.38 }, deviceLoc: null, locName: 'Orlando',
    manualRef: { current: true }, debounceRef: { current: null }, tokenRef: { current: 'test-session' }, suggestionRequestRef: { current: 0 },
    logEvent() {}, openSurprise() {}, themeParkIntent: () => null, feelingToMoment: () => null, EXPERIENCES: {},
    setSuggestions: x => state.suggestions = x, setSearchFeedback: x => state.feedback = x,
    setErr: x => state.error = x, setSugIdx() {}, setLoading: x => state.loading = x, setQuery: x => state.query = x,
    setCenter: x => state.center = x, setLocName: x => state.locName = x, setLocResolved() {}, setSearchMode() {}, setSearchLabel() {},
    geocodeCity: async q => knownCityGeocode(q),
    searchNearbyPlaces: async () => { state.nearby++; return []; },
    openDetail: x => state.detail = x,
    fetch: async (url, init) => { state.calls.push({url, body: JSON.parse(init.body), signal: init.signal}); return { ok: true, json: async () => response }; },
  };
  ctx.fetchSuggestions = handler('fetchSuggestions', '\n  // A photo entry', ctx);
  ctx.submitSearch = handler('submitSearch', '\n  function saveToList', ctx);
  return { ctx, state };
}
{
  const {ctx,state} = harness('400 W Church St, Orlando, FL');
  await ctx.submitSearch();
  assert.equal(state.suggestions[0]?.placeId, 'address-id', 'Enter must return address choices');
  assert.equal(state.nearby, 0, 'an address must not be filtered through scored businesses');
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].url, '/api/places/autocomplete');
  assert.equal(state.calls[0].body.input, ctx.query);
  assert(state.calls[0].signal, 'lookup has a deadline');
  assert.equal(state.center, undefined, 'unselected first match never moves the user');
  assert.equal(state.loading, false);
}
{
  const {ctx,state} = harness('Sarasota');
  await ctx.submitSearch();
  assert.equal(state.locName, 'Sarasota, FL');
  assert.equal(state.calls.length, 0, 'owned city remains free and deterministic');
}
{
  const {ctx,state} = harness('A particular cafe');
  await ctx.submitSearch();
  assert.equal(state.nearby, 1);
  assert.equal(state.suggestions.length, 1, 'unmatched name uses guarded lookup');
}
{
  const {ctx,state} = harness('A particular cafe');
  ctx.searchNearbyPlaces = async () => [{ id: 'owned-place' }];
  await ctx.submitSearch();
  assert.equal(state.detail.id, 'owned-place');
  assert.equal(state.calls.length, 0, 'existing business result does not buy another lookup');
}
for (const response of [{ suggestions: [] }, null]) {
  const {ctx,state} = harness('400 W Church St', response);
  await ctx.submitSearch();
  assert.match(state.feedback, response ? /No matching/ : /temporarily unavailable/);
  assert.equal(state.loading, false);
}
{
  const {ctx,state} = harness('400 W Church St');
  ctx.fetch = async () => ({ ok: false, status: 503 });
  await ctx.submitSearch();
  assert.match(state.feedback, /temporarily unavailable/);
  assert.equal(state.suggestions.length, 0);
}
{
  const {ctx,state} = harness('old query');
  let finish;
  ctx.fetch = () => new Promise(resolve => { finish = resolve; });
  const old = ctx.fetchSuggestions('old query');
  ctx.suggestionRequestRef.current++;
  state.suggestions = [{ placeId: 'new-choice' }];
  finish({ ok: true, json: async () => ({ suggestions: [{placeId:'old-choice',text:'old'}] }) });
  await old;
  assert.equal(state.suggestions[0].placeId, 'new-choice', 'late lookup cannot replace newer choices');
}
{
  const {ctx,state} = harness('old cafe');
  let finish;
  ctx.searchNearbyPlaces = () => new Promise(resolve => { finish = resolve; });
  const old = ctx.submitSearch();
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  assert(finish, 'business lookup started');
  ctx.suggestionRequestRef.current++;
  finish([]);
  await old;
  assert.equal(state.calls.length, 0, 'an older submitted search cannot launch suggestions over newer typing');
}
assert(source.includes('searchFeedback && !suggestions.length && <div role="status"'), 'failure feedback is rendered beside the shared search bar');
console.log('test-address-search: OK — address Enter, city, business, empty, unavailable, and stale responses');
