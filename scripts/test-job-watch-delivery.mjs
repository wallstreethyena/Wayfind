#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobWatchDeliveryFailure, readJobWatchDelivery } from './lib/jobWatchDelivery.mjs';
import {
  HEARTBEAT_WATCH_JOB,
  HEARTBEAT_WATCH_MAX_STALENESS_MS,
  heartbeatWatchSilenceFailure,
  heartbeatWatchSilenceIncident,
  readHeartbeatWatchPulse,
} from '../lib/heartbeatWatch.js';
import {
  classifySupabaseAccessTokenStatus,
  verifySupabaseAccessToken,
} from './verify-supabase-access-token.mjs';
import {
  JOB_WATCH_REMINDER_MS,
  decodeJobWatchState,
  encodeJobWatchState,
  incidentFingerprint,
  jobWatchNotificationDecision,
} from '../lib/jobWatchAlert.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const now = Date.parse('2026-09-09T01:45:00Z');
const healthy = { job: 'job-watch', ran_at: '2026-09-09T01:44:00Z', attempted: 0, succeeded: 0, failed: 0 };
assert.equal(jobWatchDeliveryFailure([healthy], now), null);
assert.equal(jobWatchDeliveryFailure([{ ...healthy, attempted: 5, succeeded: 5 }], now), null);
const malformed = [[], null, [healthy, healthy], [{ ...healthy, failed: 1 }], [{ ...healthy, attempted: 5 }], [{ ...healthy, ran_at: '2026-09-08T23:00:00Z' }], [{ ...healthy, ran_at: 'invalid' }], [{ ...healthy, succeeded: 1 }], [{ ...healthy, failed: '0' }]];
assert.ok(malformed.every((rows) => jobWatchDeliveryFailure(rows, now)), 'missing, stale, malformed, or failed delivery evidence is rejected');
assert.rejects(readJobWatchDelivery({ url: '', key: '', fetchImpl: () => { throw new Error('must not fetch'); } }), /requires/);
assert.rejects(readJobWatchDelivery({ url: 'https://fixture.invalid', key: 'fixture', fetchImpl: async () => new Response('', { status: 503 }) }), /HTTP 503/);
assert.rejects(readJobWatchDelivery({ url: 'https://fixture.invalid', key: 'fixture', fetchImpl: async () => Response.json([]), now }), /No latest/);
await readJobWatchDelivery({ url: 'https://fixture.invalid', key: 'fixture', now, fetchImpl: async (url, init) => {
  assert.ok(url.searchParams.get('job') === 'eq.job-watch' && url.searchParams.get('order') === 'ran_at.desc,id.desc' && url.searchParams.get('limit') === '1' && Boolean(init.signal), 'canary reads exactly the newest persisted watcher outcome with a timeout');
  return Response.json([healthy]);
} });

const incidents = [{ job: 'popularity:foursquare', last_note: 'quota: breaker_open x25' }];
const fingerprint = incidentFingerprint(incidents);
const encoded = encodeJobWatchState({ status: 'open', fingerprint, lastSentAt: now });
assert.deepEqual(decodeJobWatchState(encoded), { status: 'open', fingerprint, lastSentAt: now }, 'watch state round-trips through the persisted pulse note');
const sameIncidentNextHour = [{ job: 'popularity:foursquare', last_note: 'quota: breaker_open x26' }];
const prior = decodeJobWatchState(encoded);
const suppressed = jobWatchNotificationDecision(sameIncidentNextHour, prior, now + 60 * 60 * 1000);
assert.ok(!suppressed.send && suppressed.kind === 'suppressed' && suppressed.fingerprint === fingerprint, 'hourly count churn does not resend the same incident');
const reminder = jobWatchNotificationDecision(sameIncidentNextHour, prior, now + JOB_WATCH_REMINDER_MS);
const recovery = jobWatchNotificationDecision([], prior, now + 2 * 60 * 60 * 1000);
assert.ok(reminder.send && reminder.kind === 'reminder' && recovery.send && recovery.kind === 'recovery' && jobWatchNotificationDecision(incidents, null, now).kind === 'incident', 'new incidents send immediately, unchanged incidents remind at 24h, and recovery sends once');

// The Supabase watcher runs every 15 minutes. Vercel job-watch independently
// checks its newest persisted beat and must reject total silence even though
// wf_job_health cannot classify a row that has disappeared from its window.
const heartbeatFresh = [{ job: HEARTBEAT_WATCH_JOB, ran_at: new Date(now - 15 * 60_000).toISOString() }];
assert.equal(heartbeatWatchSilenceFailure(heartbeatFresh, now), null, 'a recent heartbeat-watch pulse is current');
assert.ok(heartbeatWatchSilenceFailure([], now), 'a missing heartbeat-watch pulse is silence, not health');
assert.ok(heartbeatWatchSilenceFailure([{ ...heartbeatFresh[0], ran_at: new Date(now - HEARTBEAT_WATCH_MAX_STALENESS_MS - 1).toISOString() }], now), 'a pulse older than the one-hour cross-clock ceiling is stale');
assert.ok(heartbeatWatchSilenceFailure([{ ...heartbeatFresh[0], ran_at: new Date(now + 6 * 60_000).toISOString() }], now), 'an implausible future pulse cannot prove liveness');

let heartbeatReads = 0;
const heartbeatRead = await readHeartbeatWatchPulse({
  url: 'https://fixture.supabase.co',
  key: 'service-fixture',
  now,
  fetchImpl: async (url, init) => {
    heartbeatReads += 1;
    assert.equal(url.searchParams.get('job'), 'eq.heartbeat-watch');
    assert.equal(url.searchParams.get('select'), 'job,ran_at');
    assert.equal(url.searchParams.get('order'), 'ran_at.desc,id.desc');
    assert.equal(url.searchParams.get('limit'), '1');
    assert.ok(init.signal && init.cache === 'no-store', 'heartbeat liveness read has a timeout and bypasses cache');
    return Response.json(heartbeatFresh);
  },
});
assert.equal(heartbeatReads, 1, 'one independent PostgREST read decides heartbeat-watch liveness');
assert.equal(heartbeatRead.failure, null);
const silenceIncident = heartbeatWatchSilenceIncident('Heartbeat-watch pulse is stale');
assert.equal(silenceIncident.job, 'heartbeat-watch');
assert.match(silenceIncident.last_note, /^unavailable: heartbeat-watch silence/);
assert.equal(jobWatchNotificationDecision([silenceIncident], null, now).kind, 'incident', 'watcher silence enters the existing immediate incident path');

const routeSource = readFileSync(join(HERE, '../app/api/cron/job-watch/route.js'), 'utf8');
assert.match(routeSource, /readHeartbeatWatchPulse\s*\(/, 'the Vercel job-watch route actually performs the independent watcher read');
assert.match(routeSource, /heartbeatWatchSilenceIncident\s*\(/, 'the route actually promotes watcher silence into its existing incident set');

// SUPABASE_ACCESS_TOKEN preflight. This is deliberately a read-only one-GET
// probe, not a fake migration. It answers whether the canonical migration
// apply path has a usable Management API credential before any write is tried.
assert.equal(classifySupabaseAccessTokenStatus(200), 'valid');
assert.equal(classifySupabaseAccessTokenStatus(401), 'rejected');
assert.equal(classifySupabaseAccessTokenStatus(403), 'rejected');
assert.equal(classifySupabaseAccessTokenStatus(404), 'rejected');
assert.equal(classifySupabaseAccessTokenStatus(429), 'unknown');
assert.equal(classifySupabaseAccessTokenStatus(500), 'unknown');

const tokenEnv = {
  SUPABASE_ACCESS_TOKEN: 'sbp_fixture_secret',
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
};
let tokenGets = 0;
const validToken = await verifySupabaseAccessToken({
  env: tokenEnv,
  fetchImpl: async (url, init) => {
    tokenGets += 1;
    assert.equal(url, 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst');
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, 'Bearer sbp_fixture_secret');
    assert.ok(!Object.hasOwn(init, 'body'), 'the token probe sends no request body');
    return { status: 200 };
  },
});
assert.equal(tokenGets, 1, 'a configured token probe performs exactly one Management API GET');
assert.equal(validToken.status, 'valid');
assert.equal((await verifySupabaseAccessToken({ env: tokenEnv, fetchImpl: async () => ({ status: 401 }) })).status, 'rejected');
assert.equal((await verifySupabaseAccessToken({ env: tokenEnv, fetchImpl: async () => ({ status: 503 }) })).status, 'unknown');
assert.equal((await verifySupabaseAccessToken({ env: tokenEnv, fetchImpl: async () => { throw new Error('network down'); } })).status, 'unknown');
let missingTokenFetches = 0;
const missingToken = await verifySupabaseAccessToken({ env: { SUPABASE_URL: tokenEnv.SUPABASE_URL }, fetchImpl: async () => { missingTokenFetches += 1; return { status: 200 }; } });
assert.equal(missingToken.status, 'unknown');
assert.equal(missingTokenFetches, 0, 'missing credentials never trigger a network request');

// Managed pg_cron contract. The live heartbeat watcher is created if missing;
// the retired affiliate writer may be absent or disabled, but can never be
// silently re-enabled or rewritten.
const managedCron = readFileSync(join(HERE, '../supabase/migrations/20260910145500_wf_managed_monitor_cron_contract.sql'), 'utf8');
for (const expected of [
  "'wf-affiliate-link-integrity'::text",
  "'13 */3 * * *'::text",
  "'select public.wf_verify_affiliate_links();'::text",
  "'wf-heartbeat-watch'::text",
  "'*/15 * * * *'::text",
  "'select public.wf_heartbeat_watch()'::text",
]) assert.ok(managedCron.includes(expected), `managed cron migration pins ${expected}`);
assert.match(managedCron, /'wf-affiliate-link-integrity'[\s\S]*false[\s\S]*'wf-heartbeat-watch'[\s\S]*true/, 'affiliate writer is retired while heartbeat watcher stays active');
assert.match(managedCron, /if job_count = 0 then\s+if expected\.must_be_active then\s+perform cron\.schedule\(/, 'a missing active monitor is created through pg_cron');
assert.match(managedCron, /else\s+[\s\S]*continue;/, 'a missing retired writer is not recreated');
assert.match(managedCron, /elsif job_count > 1 then\s+raise exception/, 'duplicate named jobs fail loudly');
assert.match(managedCron, /actual\.schedule is distinct from expected\.schedule[\s\S]*actual\.active is distinct from expected\.must_be_active[\s\S]*raise exception/, 'existing schedule or active-state drift fails instead of being overwritten');
assert.doesNotMatch(managedCron, /cron\.unschedule\s*\(/, 'the reconciliation migration never deletes a live cron to force its preferred value');
assert.doesNotMatch(managedCron, /cron\.alter_job\s*\(/, 'the contract verifies existing jobs rather than silently mutating them');

console.log('test-job-watch-delivery: OK — delivery, cross-clock watcher silence, read-only token preflight, cron drift policy, dedupe, reminder, and recovery checked');
