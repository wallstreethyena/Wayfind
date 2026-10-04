#!/usr/bin/env node
// Execute the real fetcher and real cron body; no network, keys or database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as popularity from '../lib/popularity.js';
import { createWikimediaFetchPolicy } from '../lib/wikimediaFetchPolicy.js';
const place = { place_id: 'test', name: 'Example Park', lat: 28, lng: -81 };
const search = ['Example Park', ['Example Park'], [], []];
const page = { query: { pages: { 1: { title: 'Example Park', coordinates: [{ lat: 28, lon: -81 }] } } } };
const views = { items: [{ views: 12 }, { views: 9 }] };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let checks = 0;
async function observe(sequence, input = place) {
  let calls = 0;
  const result = await popularity.fetchWikipediaObserved(input, { fetchImpl: async () => {
    const next = sequence[calls++];
    assert.notEqual(next, undefined, 'fixture exhausted: unexpected provider call');
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : response(next);
  } });
  assert.deepEqual(calls, sequence.length); checks++;
  return result;
}
assert.deepEqual((await observe([search, page, views])).metric.metric_value, 21); checks++;
for (const [sequence, reason, failed] of [
  [[['Example Park', [], [], []]], 'no_match', false],
  [[search, { query: { redirects: [{ from: 'Example Park', to: 'Unrelated Novel' }], pages: { 1: { title: 'Unrelated Novel' } } } }], 'identity_redirect_unrelated', false],
  [[search, { query: { pages: { 1: { title: 'Example Park', coordinates: [{ lat: 48, lon: 12 }] } } } }], 'identity_geo_mismatch', false],
  [[search, page, { items: [{ views: 0 }] }], 'no_views', false],
  [[search, page, response({}, 404)], 'no_pageview_data', false],
  [[response({}, 429)], 'http_429', true],
  [[response({}, 500)], 'http_500', true],
  [[response({}, 503)], 'http_503', true],
  [[{ error: { code: 'badvalue' } }], 'api_error', true],
  [[search, { error: { code: 'badvalue' } }], 'api_error', true],
  [[search, page, response({}, 500)], 'http_500', true],
  [[{}], 'invalid_payload', true],
  [[search, {}], 'invalid_payload', true],
  [[search, page, {}], 'invalid_payload', true],
  [[search, page, { items: [{ views: '12' }] }], 'invalid_payload', true],
  [[new Response('invalid JSON')], 'invalid_json', true],
  [[new Error('offline')], 'network', true],
]) {
  const result = await observe(sequence);
  assert.deepEqual({ reason: result.reason, failed: result.failed, metric: result.metric }, { reason, failed, metric: null }); checks++;
}
// No stripped-name fallback after an outage; qualified valid empty searches still get it.
assert.deepEqual((await observe([response({}, 500)], { ...place, name: 'Example Park - Orlando' })).reason, 'http_500'); checks++;
const stripped = 'Example Park';
assert.deepEqual((await observe([['Example Park - Orlando', [], [], []], [stripped, [], [], []]], { ...place, name: 'Example Park - Orlando' })).reason, 'no_match'); checks++;

const routeSource = readFileSync(new URL('../app/api/cron/popularity/route.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const routeBody = routeSource.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
async function runCron({ sequence, candidates, upsertError = false, observed, availableSources = ["wikipedia"], fetchers }) {
  let wireCalls = 0;
  const pulses = [], attempts = [], rows = [];
  const policy = createWikimediaFetchPolicy(async () => {
    const next = sequence[wireCalls++];
    assert.notEqual(next, undefined, 'unexpected wire request');
    return next instanceof Response ? next : response(next);
  });
  const db = {
    rpc: async (name, input) => {
      if (name === 'wf_popularity_stale_batch') return { data: candidates };
      assert.equal(name, 'wf_popularity_record_attempts');
      attempts.push(...input.p_attempts); return {};
    },
    from: (name) => { assert.equal(name, 'wf_place_popularity'); return { upsert: async (chunk) => { rows.push(...chunk); return upsertError ? { error: { message: 'test write failure' } } : {}; } }; },
  };
  const dependencies = {
    ...popularity,
    createClient: () => db,
    FETCHERS: fetchers || popularity.FETCHERS,
    fetchWikipediaObserved: observed || ((p) => popularity.fetchWikipediaObserved(p, { fetchImpl: policy.fetch })),
    installWikimediaFetchPolicy: () => policy,
    popularityAvailability: (src) => ({ ready: availableSources.includes(src), reason: 'parked', failure: false }),
    breakerOpen: async () => null, FSQ_BREAKER: 'unused',
    recordPulse: async (job, options) => { pulses.push({ job, ...options }); },
    jobCannotRun: () => { throw new Error('unexpected configuration failure'); },
    jobFailed: () => { throw new Error('unexpected batch failure'); },
    console: { log: () => {}, error: () => {} },
    process: { env: { CRON_SECRET: 'test', NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
  };
  const get = await new AsyncFunction(...Object.keys(dependencies), routeBody + '\nreturn GET;')(...Object.values(dependencies));
  const result = await get(new Request('https://example.test/api/cron/popularity', { headers: { authorization: 'Bearer test' } }));
  assert.deepEqual(result.status, 200); checks++;
  return { pulses, stats: await result.json(), pulse: pulses.find((p) => p.job === 'popularity:wikipedia'), attempts, rows, wireCalls };
}
const mixed = await runCron({ candidates: [1, 2, 3, 4].map((id) => ({ ...place, place_id: String(id) })), sequence: [search, page, views, ['Example Park', [], [], []], search, { query: { pages: { 1: { title: 'Example Park', pageprops: { disambiguation: '' } } } } }, response({}, 500)] });
assert.deepEqual({ attempted: mixed.pulse.attempted, succeeded: mixed.pulse.succeeded, failed: mixed.pulse.failed }, { attempted: 4, succeeded: 1, failed: 1 }); checks++;
assert.deepEqual(mixed.attempts.map((a) => a.outcome), ['ok', 'no_match', 'identity_disambiguation', 'http_500']); checks++;
assert.deepEqual(mixed.rows.length, 1); checks++;
assert.match(mixed.pulse.note, /no_match=1/); checks++;
assert.match(mixed.pulse.note, /identity_disambiguation=1/); checks++;
// Red proof: legacy default failed=attempted-succeeded mislabels two completed rejections.
assert.notEqual(mixed.pulse.attempted - mixed.pulse.succeeded, mixed.pulse.failed); checks++;
const throttle = await runCron({ candidates: [place, { ...place, place_id: 'next' }], sequence: [response({}, 429)] });
assert.deepEqual(throttle.wireCalls, 1); checks++;
assert.deepEqual(throttle.attempts, []); checks++;
assert.deepEqual({ attempted: throttle.pulse.attempted, succeeded: throttle.pulse.succeeded, failed: throttle.pulse.failed }, { attempted: 1, succeeded: 0, failed: 1 }); checks++;
assert.deepEqual(throttle.stats.skipped_rate_limit_backoff, 2); checks++;
const maxlag = await runCron({ candidates: [place, { ...place, place_id: 'next' }], sequence: [{ error: { code: 'maxlag' } }] });
assert.deepEqual(maxlag.wireCalls, 1); checks++;
assert.deepEqual(maxlag.attempts, []); checks++;
assert.deepEqual(maxlag.pulse.failed, 1); checks++;
const writeFailure = await runCron({ candidates: [place], sequence: [search, page, views], upsertError: true });
assert.deepEqual({ succeeded: writeFailure.pulse.succeeded, failed: writeFailure.pulse.failed }, { succeeded: 0, failed: 1 }); checks++;
assert.match(writeFailure.pulse.note, /write_error=1/); checks++;
assert.deepEqual(writeFailure.attempts.map((a) => a.outcome), ['write_error']); checks++;
assert.deepEqual(writeFailure.stats.wikipedia_outcomes, { write_error: 1 }); checks++;
const unexpected = await runCron({ candidates: [place], sequence: [], observed: async () => null });
assert.deepEqual(unexpected.pulse.failed, 1); checks++;
assert.deepEqual(unexpected.attempts.map((a) => a.outcome), ['exception']); checks++;
const lowConfidence = await runCron({ candidates: [place], sequence: [], observed: async () => ({ metric: { metric_value: 21, match_confidence: 0.1 }, reason: 'ok', failed: false }) });
assert.deepEqual(lowConfidence.stats.wikipedia_outcomes, { low_confidence: 1 }); checks++;
assert.deepEqual(lowConfidence.rows, []); checks++;
assert.deepEqual({ succeeded: lowConfidence.pulse.succeeded, failed: lowConfidence.pulse.failed }, { succeeded: 0, failed: 0 }); checks++;
const others = ['yelp', 'foursquare', 'tripadvisor'];
const otherProviders = await runCron({ candidates: [place], sequence: [], availableSources: others, fetchers: Object.fromEntries(others.map((source) => [source, async () => { popularity.notePop(source, 'no_match'); return null; }])) });
assert.deepEqual(otherProviders.wireCalls, 0); checks++;
assert.deepEqual(otherProviders.pulses.length, 3); checks++;
for (const pulse of otherProviders.pulses) {
  assert.deepEqual({ attempted: pulse.attempted, succeeded: pulse.succeeded, failed: pulse.failed }, { attempted: 1, succeeded: 0, failed: null }); checks++;
}

console.log(`test-wikipedia-outcomes: OK — ${checks} assertions, real fetcher + mixed cron + backoff + write failure; no network`);
