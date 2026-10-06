#!/usr/bin/env node
// Exercise production transport, cache, cancellation and real component imports.
// Every network call is an in-process fixture. Never reads credentials or .env.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { fetchClassifiedPosterJson, fetchPosterJson } from '../lib/posterJson.js';
import { fetchRailJson } from '../lib/railFailure.js';
let checks = 0, serial = 0, calls = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const url = (path = '/api/night-out') => `${path}?lat=27.58&lng=-82.43&fixture=${serial++}`;
const healthy = (id = 'real') => ({ degraded: false, sourceFailures: 0, rails: [{ id: 'cocktails', places: [{ id }], total: 1, page: 0, hasMore: false }] });
const realFetch = globalThis.fetch, realNow = Date.now;
try {
  // One subscriber abort must not cancel the remaining reader or poison reuse.
  let release, sharedSignal, priority;
  globalThis.fetch = async (_url, init) => { calls++; sharedSignal = init.signal; priority = init.priority; return new Promise(resolve => { release = resolve; }); };
  const u = url(), a = new AbortController(), b = new AbortController();
  const first = fetchClassifiedPosterJson(u, { signal: a.signal, timeoutMs: 1000 });
  const second = fetchClassifiedPosterJson(u, { signal: b.signal, timeoutMs: 1000 });
  await flush();
  same(calls, 1, 'two readers share one physical fetch');
  same(priority, 'high', 'classified selected poster keeps high fetch priority');
  ok(sharedSignal !== a.signal && sharedSignal !== b.signal, 'transport owns its independent controller');
  a.abort();
  await assert.rejects(first, error => error.kind === 'cancelled'); checks++;
  ok(!sharedSignal.aborted, 'remaining subscriber keeps the transport alive');
  release(Response.json(healthy()));
  const value = await second;
  value.rails[0].places[0].id = 'mutated';
  const cached = await fetchClassifiedPosterJson(u, { signal: new AbortController().signal, timeoutMs: 1000 });
  same(cached.rails[0].places[0].id, 'real', 'every subscriber/cache reader receives an isolated clone');
  same(calls, 1, 'healthy answer survives close/reopen with a new signal');
  await assert.rejects(fetchClassifiedPosterJson(u, { signal: a.signal, timeoutMs: 1000 }), error => error.kind === 'cancelled'); checks++;

  // Final cancellation releases ownership; an abort-ignoring old result loses.
  calls = 0; let oldRelease, oldSignal;
  const lateUrl = url();
  globalThis.fetch = async (_url, init) => { calls++; if (calls === 1) { oldSignal = init.signal; return new Promise(resolve => { oldRelease = resolve; }); } return Response.json(healthy('new')); };
  const last = new AbortController();
  const cancelled = fetchClassifiedPosterJson(lateUrl, { signal: last.signal });
  await flush(); last.abort();
  await assert.rejects(cancelled, error => error.kind === 'cancelled'); checks++;
  ok(oldSignal.aborted, 'final subscriber abort cancels the shared transport');
  same((await fetchClassifiedPosterJson(lateUrl)).rails[0].places[0].id, 'new');
  oldRelease(Response.json(healthy('late'))); await flush();
  same((await fetchClassifiedPosterJson(lateUrl)).rails[0].places[0].id, 'new', 'late cancelled writer cannot overwrite its replacement');
  same(calls, 2);

  // Capacity eviction must not let a still-live old request steal a newer key.
  calls = 0; let evictedRelease;
  const evictedUrl = url();
  globalThis.fetch = async () => { calls++; if (calls === 1) return new Promise(resolve => { evictedRelease = resolve; }); return Response.json(healthy('replacement')); };
  const evicted = fetchClassifiedPosterJson(evictedUrl);
  await flush();
  for (let i = 0; i < 16; i++) await fetchClassifiedPosterJson(url());
  same((await fetchClassifiedPosterJson(evictedUrl)).rails[0].places[0].id, 'replacement');
  evictedRelease(Response.json(healthy('old-owner')));
  same((await evicted).rails[0].places[0].id, 'old-owner', 'evicted live reader can still receive its own result');
  same((await fetchClassifiedPosterJson(evictedUrl)).rails[0].places[0].id, 'replacement', 'evicted old writer cannot replace the current cache owner');
  same(calls, 18, '16-entry cap evicted the oldest pending identity');

  for (const stalledBody of [false, true]) {
    calls = 0;
    globalThis.fetch = async () => { calls++; const never = new Promise(() => {}); return stalledBody ? { ok: true, json: () => never } : never; };
    const timed = url();
    const reads = [fetchClassifiedPosterJson(timed, { timeoutMs: 250 }), fetchClassifiedPosterJson(timed, { timeoutMs: 250 })];
    const results = await Promise.allSettled(reads);
    ok(results.every(result => result.status === 'rejected' && result.reason.kind === 'degraded' && result.reason.reason === 'timeout'), 'shared header/body stalls settle as degraded timeout');
    same(calls, 1, 'full deadline stall does not add another attempt');
    globalThis.fetch = async () => { calls++; return Response.json(healthy('recovered')); };
    same((await fetchClassifiedPosterJson(timed, { timeoutMs: 250 })).rails[0].places[0].id, 'recovered');
    same(calls, 2, 'timed-out entry cannot poison the next reader');
  }

  calls = 0;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 503 }) : Response.json(healthy()); };
  const retryUrl = url();
  const retried = await Promise.all([fetchClassifiedPosterJson(retryUrl), fetchClassifiedPosterJson(retryUrl)]);
  same(calls, 2, 'subscribers share exactly one bounded retry');
  ok(retried.every(value => value.rails[0].places.length === 1));
  await fetchClassifiedPosterJson(retryUrl); same(calls, 2, 'a healthy retried answer may be reused');
  calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
  await assert.rejects(fetchClassifiedPosterJson(url()), error => error.kind === 'degraded' && error.retryAttempts === 1); checks++;
  same(calls, 2, 'persistent 503 stops after one retry');

  for (const [status, json, reason] of [[400, false, 'http_400'], [200, true, 'invalid_json']]) {
    calls = 0; const errorUrl = url();
    globalThis.fetch = async () => { calls++; return new Response(json ? 'broken-json' : '', { status }); };
    for (let i = 0; i < 2; i++) { await assert.rejects(fetchClassifiedPosterJson(errorUrl), error => error.kind === 'developer' && error.reason === reason); checks++; }
    same(calls, 2, 'developer errors never retry or enter the cache');
  }
  for (const [path, payload] of [
    ['/api/night-out', { ...healthy(), degraded: true }],
    ['/api/night-out', { rails: healthy().rails }],
    ['/api/night-out', { ...healthy(), partial: true }],
    ['/api/night-out', { ...healthy(), error: 'unavailable' }],
    ['/api/night-out', { degraded: false, rails: [{ id: 'empty', places: [] }] }],
    ['/api/events/fall', { ...healthy(), sourceFailures: 1 }],
    ['/api/events/fall', { degraded: false, rails: healthy().rails }],
  ]) {
    calls = 0; const unhealthy = url(path);
    globalThis.fetch = async () => { calls++; return Response.json(payload); };
    await fetchClassifiedPosterJson(unhealthy); await fetchClassifiedPosterJson(unhealthy);
    same(calls, 2, 'incomplete, error, empty or unknown-health payload is never retained');
  }

  // Custom request settings never share even when an endpoint is public.
  for (const options of [{ credentials: 'include' }, { headers: { authorization: 'fixture-only' } }, { cache: 'no-store' }, { method: 'POST', body: '{}' }, { mode: 'same-origin' }, { retries: 0 }, { requestId: 'custom' }]) {
    calls = 0; const custom = url();
    globalThis.fetch = async () => { calls++; return Response.json(healthy()); };
    await Promise.all([fetchClassifiedPosterJson(custom, options), fetchClassifiedPosterJson(custom, options)]);
    same(calls, 2, 'credentialed/custom calls bypass in-flight and ready reuse');
  }
  calls = 0; let observedSignal;
  globalThis.fetch = async (_url, init) => { calls++; observedSignal = init.signal; return new Promise(() => {}); };
  const customAbort = new AbortController();
  const customPending = fetchClassifiedPosterJson(url(), { credentials: 'include', signal: customAbort.signal });
  await flush(); customAbort.abort();
  await assert.rejects(customPending, error => error.kind === 'cancelled'); checks++;
  ok(observedSignal.aborted, 'bypassed custom transport still honors caller cancellation');

  calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(healthy()); };
  const identity = url();
  for (const options of [{ timeoutMs: 901 }, { timeoutMs: 902 }, { timeoutMs: 902, priority: 'low' }, { timeoutMs: 902, priority: 'high' }]) await fetchClassifiedPosterJson(identity, options);
  same(calls, 3, 'deadline/priority identities stay distinct and explicit/default high are identical');
  await fetchPosterJson(identity, { timeoutMs: 902, retries: 1 });
  same(calls, 4, 'classified and legacy retry transports never alias');
  await fetchClassifiedPosterJson(identity + '&city=other', { timeoutMs: 902 });
  same(calls, 5, 'different exact URLs/cities never alias');
  const ttl = url(); let now = realNow(); Date.now = () => now;
  await fetchClassifiedPosterJson(ttl); const before = calls;
  now += 29999; await fetchClassifiedPosterJson(ttl); same(calls, before, 'healthy answer reuses within30seconds');
  now += 2; await fetchClassifiedPosterJson(ttl); same(calls, before + 1, 'expired answer fetches again');
  Date.now = realNow;

  // Real component reopen regression. Keep the existing deterministic React
  // harness; replace only its transport doubles with production helpers.
  const source = readFileSync('scripts/test-poster-recovery.mjs', 'utf8');
  const moduleSource = source.slice(source.indexOf('function moduleWith('), source.indexOf('const realFetch'));
  let harnessSource = source.slice(source.indexOf('function componentHarness('), source.indexOf('const p={center:'));
  ok(moduleSource.startsWith('function moduleWith(') && harnessSource.startsWith('function componentHarness('), 'existing real-component harness was found');
  harnessSource = harnessSource.replace(/'\.\.\/\.\.\/lib\/posterJson\.js':\{[^\n]+\},/, "'../../lib/posterJson.js':{fetchPosterJson,fetchClassifiedPosterJson},");
  ok(harnessSource.includes("'../../lib/posterJson.js':{fetchPosterJson,fetchClassifiedPosterJson}"));
  harnessSource = harnessSource.replace('fetchRailJson:(url,opts)=>new Promise((resolve,reject)=>pending.push({url,resolve,reject,opts}))', 'fetchRailJson');
  harnessSource = harnessSource.replace('    react,', "    react,\n    'next/navigation':{useSearchParams:()=>new URLSearchParams('lat=29.1&lng=-81.1&city=Fixture')},\n    '../components/usePosterEvents.js':{usePosterEvents:()=>({byRail:{},pending:false,failed:false})},");
  harnessSource = harnessSource.replace('moduleWith(`app/components/${name}.js`', "moduleWith(name === 'SummerPicksClient' ? 'app/summer-picks/client.js' : `app/components/${name}.js`");

  const harness = new Function('ts', 'readFileSync', 'fetchPosterJson', 'fetchClassifiedPosterJson', 'fetchRailJson', moduleSource + '\n' + harnessSource + '\nreturn componentHarness;')(ts, readFileSync, fetchPosterJson, fetchClassifiedPosterJson, fetchRailJson);
  const componentCases = [['NightOutRails','/api/night-out'],['BirthdayRails','/api/birthday'],['TodayDiscoveryRails','/api/today-discovery'],['FallIntentRails','/api/events/fall'],['SummerIntentRails','/api/summer/places'],['SummerPicksClient','/api/summer/places']];
  for (const [name, endpoint] of componentCases) {
    const urls = [];
    globalThis.fetch = async target => {
      urls.push(String(target));
      if (String(target).startsWith('/api/experiences')) return Response.json({ items: [], dark: true, reason: 'empty' });
      if (String(target).startsWith('/api/summer/places')) return Response.json({ places: [{ id: 'summer-fixture', photo: '/fixture.jpg' }] });
      return Response.json({ degraded: false, sourceFailures: 0, rails: Array.from({ length: 10 }, (_, i) => ({ id: i ? `rail-${i}` : 'cocktails', title: 'Fixture', places: [{ id: 'real-card' }], cards: [{ id: 'real-card' }] })) });
    };
    const props = { center: { lat: 28.1, lng: -81.1 }, city: 'Fixture' };
    const h = harness(name);
    h.render(props); await h.flush(); h.render(props);
    h.replay(); h.render(props); await h.flush(); h.render(props);
    same(urls.filter(target => target.startsWith(endpoint + '?')).length, 1, `${name}: settled close/reopen uses the healthy response once`);
  }
} finally {
  globalThis.fetch = realFetch;
  Date.now = realNow;
}
console.log(`test-classified-poster-json: ${checks} assertions passed; real component reopen, subscriber cancellation, bounded retries/deadlines, strict admission and identity isolation`);
