// Preserve every existing source assertion; extend the registered entrypoint.
import assert from 'node:assert/strict';
import { windowGrowth } from '../lib/trendSources/nativeCore.js';
assert.equal(windowGrowth(5,10,5),100);
assert.equal(windowGrowth(0,10,5),null);
await import('./native-trends.spec.mjs');
await import('./native-trends.integration.mjs');
// The original contract exits with its aggregate verdict. Run it last.
await import('./trend-sources-contract.mjs');
