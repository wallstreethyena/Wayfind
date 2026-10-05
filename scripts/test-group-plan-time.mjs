// Locks explicit time-zone roundtrips, including ambiguous and nonexistent times.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseZonedDateTime, formatGroupTime, assertGroupTimeZone, GroupPlanTimeError } from '../lib/groupPlanTime.js';

let count = 0;
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); count++; }
function rejects(fn, code) { assert.throws(fn, (error) => error instanceof GroupPlanTimeError && error.code === code); count++; }

eq(parseZonedDateTime('2026-10-10T18:30', 'America/New_York'), '2026-10-10T22:30:00.000Z', 'summer eastern wall clock');
eq(parseZonedDateTime('2026-12-10T18:30', 'America/New_York'), '2026-12-10T23:30:00.000Z', 'winter eastern wall clock');
eq(parseZonedDateTime('2026-10-10T18:30:45.12', 'Etc/UTC'), '2026-10-10T18:30:45.120Z', 'seconds and fractions');
eq(parseZonedDateTime('2026-10-10T18:30', 'Asia/Kathmandu'), '2026-10-10T12:45:00.000Z', 'fractional-hour offset');
eq(parseZonedDateTime('2028-02-29T01:30', 'UTC'), '2028-02-29T01:30:00.000Z', 'leap day');
rejects(() => parseZonedDateTime('2026-03-08T02:30', 'America/New_York'), 'NONEXISTENT_LOCAL_TIME');
rejects(() => parseZonedDateTime('2026-03-08T02:30', 'America/New_York', { disambiguation: 'later' }), 'NONEXISTENT_LOCAL_TIME');
rejects(() => parseZonedDateTime('2026-11-01T01:30', 'America/New_York'), 'AMBIGUOUS_LOCAL_TIME');
eq(parseZonedDateTime('2026-11-01T01:30', 'America/New_York', { disambiguation: 'earlier' }), '2026-11-01T05:30:00.000Z', 'earlier fold');
eq(parseZonedDateTime('2026-11-01T01:30', 'America/New_York', { disambiguation: 'later' }), '2026-11-01T06:30:00.000Z', 'later fold');
try { parseZonedDateTime('2026-11-01T01:30', 'America/New_York'); } catch (error) { eq(error.details.candidates, ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'], 'fold error gives both exact choices'); }
rejects(() => parseZonedDateTime('2026-04-05T01:45', 'Australia/Lord_Howe'), 'AMBIGUOUS_LOCAL_TIME');
eq(parseZonedDateTime('2026-04-05T01:45', 'Australia/Lord_Howe', { disambiguation: 'earlier' }), '2026-04-04T14:45:00.000Z', 'half-hour fold earlier');
eq(parseZonedDateTime('2026-04-05T01:45', 'Australia/Lord_Howe', { disambiguation: 'later' }), '2026-04-04T15:15:00.000Z', 'half-hour fold later');
rejects(() => parseZonedDateTime('2011-12-30T12:00', 'Pacific/Apia'), 'NONEXISTENT_LOCAL_TIME');
for (const value of ['2026-02-29T12:00', '2026-04-31T12:00', '2026-10-10T24:00', '2026-10-10T18:60', '2026-10-10T18:30:60', '2026-13-01T00:00', '0000-01-01T00:00', '2026-10-10', '2026-10-10T18:30Z', '2026-10-10T18:30-04:00', '10/10/2026 18:30', '2026-10-10T18:30:00.1234']) rejects(() => parseZonedDateTime(value, 'UTC'), 'INVALID_LOCAL_TIME');
for (const zone of ['', null, 'Mars/Olympus', '+05:00', ' America/New_York']) rejects(() => parseZonedDateTime('2026-10-10T18:30', zone), 'INVALID_TIME_ZONE');
rejects(() => parseZonedDateTime('2026-10-10T18:30', 'UTC', { disambiguation: 'compatible' }), 'INVALID_DISAMBIGUATION');
eq(assertGroupTimeZone('America/New_York'), 'America/New_York', 'zone remains explicit');
const formatted = formatGroupTime('2026-10-10T22:30:00.000Z', 'America/New_York');
assert.match(formatted, /6:30/); assert.match(formatted, /EDT/); count += 2;
const foldedEarlier = formatGroupTime('2026-11-01T05:30:00.000Z', 'America/New_York');
const foldedLater = formatGroupTime('2026-11-01T06:30:00.000Z', 'America/New_York');
assert.match(foldedEarlier, /EDT/); assert.match(foldedLater, /EST/); count += 2;
const interval = formatGroupTime({ startsAt: '2026-10-10T22:30:00.000Z', endsAt: '2026-10-11T00:30:00.000Z' }, 'America/New_York');
assert.match(interval, /6:30/); assert.match(interval, /8:30/); count += 2;
rejects(() => formatGroupTime('2026-10-10T18:30', 'UTC'), 'INVALID_INSTANT');
rejects(() => formatGroupTime(new Date('invalid'), 'UTC'), 'INVALID_INSTANT');
rejects(() => formatGroupTime('2026-02-30T12:00:00Z', 'UTC'), 'INVALID_INSTANT');
rejects(() => formatGroupTime('2026-10-10T12:00:00+24:00', 'UTC'), 'INVALID_INSTANT');
rejects(() => formatGroupTime({ startsAt: '2026-10-10T22:30:00Z', endsAt: '2026-10-10T22:30:00Z' }, 'UTC'), 'INVALID_INTERVAL');
const source = readFileSync(new URL('../lib/groupPlanTime.js', import.meta.url), 'utf8');
const ambientSourceDetector = /Date\.now\(|Math\.random\(|fetch\(|process\.env/;
// Each forbidden dependency has a positive fixture through the same detector.
assert.ok(ambientSourceDetector.test('const now = Date.now();'), 'ambient clock positive control'); count++;
assert.ok(ambientSourceDetector.test('const id = Math.random();'), 'ambient randomness positive control'); count++;
assert.ok(ambientSourceDetector.test('await fetch("https://example.test");'), 'network positive control'); count++;
assert.ok(ambientSourceDetector.test('const zone = process.env.TZ;'), 'ambient configuration positive control'); count++;
assert.ok(!ambientSourceDetector.test(source), 'time helper has no ambient clock/random/network/config'); count++;
console.log(`test-group-plan-time: ${count} assertions passed`);
