#!/usr/bin/env node
import assert from 'node:assert/strict';
import { jobWatchDeliveryFailure, readJobWatchDelivery } from './lib/jobWatchDelivery.mjs';
import {
  JOB_WATCH_REMINDER_MS,
  decodeJobWatchState,
  encodeJobWatchState,
  incidentFingerprint,
  jobWatchNotificationDecision,
} from '../lib/jobWatchAlert.js';

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

console.log('test-job-watch-delivery: OK — delivery evidence plus incident dedupe, 24h reminder, and recovery policy checked');
