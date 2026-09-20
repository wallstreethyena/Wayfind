// Registered guard entrypoint. Preserve every pre-existing source assertion.
import assert from 'node:assert/strict';
import { windowGrowth } from '../lib/trendSources/nativeCore.js';
assert.equal(windowGrowth(5, 10, 5), 100);
assert.equal(windowGrowth(0, 10, 5), null);
// Native route tests deliberately set/unset CRON_SECRET. Assert real process
// isolation here so a failed restore cannot contaminate the original token tests.
const environmentBefore = { ...process.env };
await import('./native-trends.spec.mjs');
await import('./native-trends.integration.mjs');
assert.deepEqual({ ...process.env }, environmentBefore, 'native test suites restore every environment variable');
// The unchanged original contract exits with its aggregate verdict. Run last.
await import('./trend-sources-contract.mjs');
