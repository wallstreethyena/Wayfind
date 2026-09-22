// Operator/release collection with the SAME runtime as the Vercel cron.
// Results contain aggregates only; never print credentials or user data.
import assert from 'node:assert/strict';
import { runNativeTrends } from '../lib/trendSources/nativeRuntime.js';
import { nativeTransport, persistNativeSnapshot } from '../lib/trendSources/nativeEngine.js';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Native collection requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No collection ran.');
  process.exit(1);
}
try {
  const nowMs = Date.now();
  let writtenTopics = null;
  const fetchImpl = async (target, options) => {
    if (new URL(target).origin === new URL(url).origin && new URL(target).pathname === '/rest/v1/wf_trend_topics' && options?.method === 'POST') {
      writtenTopics = JSON.parse(options.body).map(({ snapshot_id, ...topic }) => topic);
    }
    return fetch(target, options);
  };
  const result = await runNativeTrends({url,key}, {nowMs,fetchImpl});
  let repeat = null;
  if (writtenTopics !== null || result.snapshot.topics === 0) {
    const { db } = nativeTransport({url,key});
    repeat = await persistNativeSnapshot(db, writtenTopics || [], result.sources, nowMs);
    assert.equal(repeat.id, result.snapshot.id, 'same real evidence reuses snapshot');
    assert.equal(repeat.reused, true, 'same real evidence does not create duplicates');
  }
  console.log(JSON.stringify({execution:'operator-or-release',revision:process.env.GITHUB_SHA || null,
    ...result, repeatVerified: repeat !== null || result.snapshot.reused}, null, 2));
} catch (error) {
  console.error(/^[a-z0-9:_-]{1,90}$/.test(String(error?.message)) ? error.message : 'native-collection-failed');
  process.exit(1);
}
