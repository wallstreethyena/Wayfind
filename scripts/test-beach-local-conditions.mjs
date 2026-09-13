import assert from 'node:assert/strict';
import { parseVisitBeachesReport, fetchVisitBeachesReport, refreshVisitBeachesReport } from '../lib/beachLocalConditions.js';
import { forecastPeriods, planningSummary } from '../lib/beachPlanning.js';

const NOW = Date.parse('2026-09-09T18:00:00Z');
const beach = { slug: 'lido', name: 'Lido Beach', lat: 27.3103, lng: -82.5779, visitBeachId: '4', visitBeachName: 'Lido Key Beach' };
const payload = (createdAt = '2026-09-09T15:42:39Z', value = 'green', overrides = {}) => ({ data: { beach: {
  id: '4', name: 'Lido Key Beach', latitude: 27.311997, longitude: -82.577852,
  lastThreeDaysOfReports: [{ id: '74381', createdAt, latitude: 27.311997, longitude: -82.577852,
    beachReport: [{ parameterCategory: { id: '1', slug: 'flag' }, reportParameters: [{ parameter: { id: '1', name: 'Flag' }, parameterValues: [{ id: value === 'double-red' ? '1' : '4', name: value === 'double-red' ? 'Double Red' : 'Green', value }], value: null }] }],
  }], ...overrides,
} } });

const green = parseVisitBeachesReport(beach, payload(), NOW);
assert.deepEqual(green, { flag: 'green', flagLabel: 'Green', waterClosure: 'unknown', reportedAt: '2026-09-09T15:42:39.000Z', age: 'current', reportId: '74381' });

const closed = parseVisitBeachesReport(beach, payload('2026-09-09T15:42:39Z', 'double-red'), NOW);
assert.equal(closed.flagLabel, 'Double Red');
assert.equal(closed.waterClosure, 'closed', 'only an explicit current Double Red report establishes water closure');
assert.match(planningSummary({ waterClosure: closed.waterClosure }).hazards[0], /water is closed to the public/);
const sunny = [{ start: '2026-09-09T18:00:00Z', daytime: true, rain: 0, summary: 'Sunny' }];
assert.ok(planningSummary({ periods: sunny, alerts: [], localFlag: 'green' }).better);
for (const localFlag of ['yellow', 'red', 'purple']) {
  const caution = planningSummary({ periods: sunny, alerts: [], localFlag });
  assert.equal(caution.better, null, 'a reported caution flag suppresses favorable suggestions');
  assert.match(caution.hazards[0], new RegExp(localFlag));
}
assert.equal(planningSummary({ periods: [{ ...sunny[0], summary: 'Thunderstorms' }], alerts: [], localFlag: 'green' }).better, null, 'green never clears a storm concern');

const stale = parseVisitBeachesReport(beach, payload('2026-09-08T15:00:00Z'), NOW);
assert.equal(stale.flag, 'unknown');
assert.equal(stale.waterClosure, 'unknown');
assert.equal(stale.age, 'stale');
assert.equal(stale.reportedAt, '2026-09-08T15:00:00.000Z');
assert.equal(parseVisitBeachesReport(beach, payload('2026-09-09T05:00:00Z'), NOW).age, 'stale', 'a same-day report older than 12 hours is stale');
assert.equal(parseVisitBeachesReport(beach, payload('2026-09-09T03:30:00Z'), Date.parse('2026-09-09T05:00:00Z')).age, 'stale', 'a recent report from the previous Florida day is stale');

const cachedBeforeMidnight = parseVisitBeachesReport(beach, payload('2026-09-09T03:00:00Z'), Date.parse('2026-09-09T03:30:00Z'));
assert.equal(cachedBeforeMidnight.flag, 'green');
assert.deepEqual(refreshVisitBeachesReport(cachedBeforeMidnight, Date.parse('2026-09-09T04:01:00Z')), {
  flag: 'unknown', flagLabel: 'Unknown', waterClosure: 'unknown', reportedAt: '2026-09-09T03:00:00.000Z', age: 'stale', reportId: '74381',
}, 'a cached flag is withdrawn immediately when the Florida calendar day changes');
const cachedBeforeTwelveHours = parseVisitBeachesReport(beach, payload('2026-09-09T08:00:00Z'), Date.parse('2026-09-09T19:59:00Z'));
assert.equal(refreshVisitBeachesReport(cachedBeforeTwelveHours, Date.parse('2026-09-09T20:01:00Z')).flag, 'unknown', 'a cached flag is withdrawn immediately after 12 hours');

const omitted = payload();
omitted.data.beach.lastThreeDaysOfReports[0].beachReport = [];
assert.equal(parseVisitBeachesReport(beach, omitted, NOW).flag, 'unknown', 'an omitted flag remains Unknown');

for (const bad of [
  payload('not-a-date'),
  payload('2026-09-09T19:00:00Z'),
  payload('2026-09-09T15:42:39Z', 'blue'),
  payload('2026-09-09T15:42:39Z', 'green', { latitude: 28, longitude: -82 }),
]) assert.throws(() => parseVisitBeachesReport(beach, bad, NOW));

for (const mutate of [
  data => { delete data.data.beach.lastThreeDaysOfReports[0].beachReport[0].parameterCategory.id; },
  data => { data.data.beach.lastThreeDaysOfReports[0].beachReport[0].reportParameters[0].parameter.name = 'Other'; },
  data => { delete data.data.beach.lastThreeDaysOfReports[0].beachReport[0].reportParameters[0].parameterValues[0].id; },
  data => { data.data.beach.name = 'Another Beach'; },
  data => { data.errors = [{ message: 'partial' }]; },
  data => { data.data.beach.lastThreeDaysOfReports[0].beachReport[0].reportParameters[0].parameterValues.push({ id: '3', name: 'Yellow', value: 'yellow' }); },
]) {
  const bad = payload(); mutate(bad); assert.throws(() => parseVisitBeachesReport(beach, bad, NOW));
}

let request;
const fetched = await fetchVisitBeachesReport(beach, { now: () => NOW, fetchImpl: async (url, options) => {
  request = { url, options };
  return Response.json(payload());
} });
assert.equal(fetched.flag, 'green');
assert.equal(request.url, 'https://api.visitbeaches.org/graphql');
assert.equal(request.options.method, 'POST');
assert.deepEqual(JSON.parse(request.options.body).variables, { id: '4' });

let retryCalls = 0, waits = [];
assert.equal((await fetchVisitBeachesReport(beach, { now: () => NOW, wait: async ms => waits.push(ms), fetchImpl: async () => ++retryCalls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '1' } }) : Response.json(payload()) })).flag, 'green');
assert.deepEqual(waits, [1000]);
retryCalls = 0; waits = [];
assert.equal((await fetchVisitBeachesReport(beach, { now: () => NOW, wait: async ms => waits.push(ms), fetchImpl: async () => ++retryCalls === 1 ? new Response('', { status: 503, headers: { 'Retry-After': 'Wed, 09 Sep 2026 18:00:01 GMT' } }) : Response.json(payload()) })).flag, 'green');
assert.deepEqual(waits, [1000]);
await assert.rejects(fetchVisitBeachesReport(beach, { wait: async () => {}, fetchImpl: async () => new Response('', { status: 429 }) }));
await assert.rejects(fetchVisitBeachesReport(beach, { fetchImpl: async () => Response.json({ data: {} }) }));
await assert.rejects(fetchVisitBeachesReport({ ...beach, visitBeachId: null }, { fetchImpl: async () => { throw new Error('must not call'); } }));

const staleForecast = forecastPeriods({ properties: { updateTime: '2026-09-09T11:59:00Z', periods: [{
  startTime: '2026-09-09T18:00:00Z', endTime: '2026-09-09T19:00:00Z', shortForecast: 'Sunny', isDaytime: true, probabilityOfPrecipitation: { value: 0 },
}] } }, NOW);
assert.deepEqual(staleForecast, []);
assert.equal(planningSummary({ periods: staleForecast, alerts: [] }).better, null, 'a stale sunny forecast cannot produce a better-time suggestion');

console.log('beach-local-conditions: exact location, freshness, flag schema, closure and failure controls passed');
