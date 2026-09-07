#!/usr/bin/env node
import assert from 'node:assert/strict';
import { jobWatchDeliveryFailure, readJobWatchDelivery } from './lib/jobWatchDelivery.mjs';

const now = Date.parse('2026-09-07T15:00:00Z');
const healthy = { job: 'job-watch', ran_at: '2026-09-07T14:45:00Z', attempted: 0, succeeded: 0, failed: 0 };
assert.equal(jobWatchDeliveryFailure([healthy], now), null);
assert.equal(jobWatchDeliveryFailure([{ ...healthy, attempted: 5, succeeded: 5 }], now), null);
for (const rows of [[], null, [healthy, healthy], [{ ...healthy, failed: 1 }], [{ ...healthy, attempted: 5 }], [{ ...healthy, ran_at: '2026-09-07T12:45:00Z' }], [{ ...healthy, ran_at: '2026-09-08T00:00:00Z' }], [{ ...healthy, ran_at: 'invalid' }], [{ ...healthy, succeeded: 1 }], [{ ...healthy, failed: '0' }]]) {
  assert.ok(jobWatchDeliveryFailure(rows, now));
}
await assert.rejects(readJobWatchDelivery({ url: '', key: '', fetchImpl: () => { throw new Error('must not fetch'); } }), /requires/);
await assert.rejects(readJobWatchDelivery({ url: 'https://fixture.invalid', key: 'fixture', fetchImpl: async () => new Response('', { status: 503 }) }), /HTTP 503/);
await assert.rejects(readJobWatchDelivery({ url: 'https://fixture.invalid', key: 'fixture', fetchImpl: async () => Response.json([]), now }), /No latest/);
await readJobWatchDelivery({ url: 'https://fixture.invalid', key: 'fixture', now, fetchImpl: async (url, init) => {
  assert.equal(url.searchParams.get('job'), 'eq.job-watch');
  assert.equal(url.searchParams.get('order'), 'ran_at.desc,id.desc');
  assert.equal(url.searchParams.get('limit'), '1');
  assert.ok(init.signal);
  return Response.json([healthy]);
} });
console.log('test-job-watch-delivery: OK — delivered, healthy idle, missing, stale, malformed and failed evidence checked');
