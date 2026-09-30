// scripts/test-photo-monitor-cold-rate.mjs — a cold cache is not a placeholder.
//
// 2026-09-29: photo-monitor "breached" on every run for 21 days (84-94%
// placeholder against a 35% threshold) while real readers saw ~14% 404s. The
// probe never spends, so every uncached ref is `probe-no-spend`; with ledger
// headroom a real reader's first request buys a real photo. queueCandidates
// already refused to file cold probes as defects; the breach rate did not.
import fs from "node:fs";
import { computeBreach, readerPlaceholderRate } from "../lib/photoCoverage.js";

let pass = 0;
const fail = (m) => { console.error("test-photo-monitor-cold-rate: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// The real run of 2026-09-29 23:20Z: 499 probes, 84% placeholder, all cold.
const cold = { sampled: 499, byResult: { real: 80, compass: 0, miss: 419, rateLimited: 0, error: 0 }, byReason: { "probe-no-spend": 419, "inventory-ref-cache": 80 } };
const T = { placeholderThreshold: 0.35, openGrowth: 0, openGrowthThreshold: 0.2, sampleDegraded: false };

const a = readerPlaceholderRate(cold, { headroom: 1194 });
ok(a.rate === 0, "with headroom, cold probe-no-spend misses are not reader placeholders");
ok(Math.abs(a.rawRate - 419 / 499) < 1e-9, "the raw probe rate is still reported");
ok(a.coldSurfaces === 419, "cold surfaces are counted");
ok(computeBreach({ ...T, placeholderRate: a.rate }) === false, "an all-cold sample with headroom does not breach");
ok(computeBreach({ ...T, placeholderRate: a.rawRate }) === true, "control: the raw rate is what used to breach");

// Fail toward reporting: exhausted (0) or unreadable (null) ledger excludes nothing.
ok(readerPlaceholderRate(cold, { headroom: 0 }).rate === cold.byResult.miss / 499, "exhausted ledger: cold misses ARE placeholders");
ok(readerPlaceholderRate(cold, { headroom: null }).rate === cold.byResult.miss / 499, "unreadable ledger: nothing excluded");
ok(readerPlaceholderRate(cold, {}).coldSurfaces === 0, "no headroom argument: nothing excluded");

// Real defects still breach with headroom: no-photo compass, owned-miss, negative-cached.
const defects = { sampled: 100, byResult: { real: 40, compass: 20, miss: 40, rateLimited: 0, error: 0 }, byReason: { "probe-no-spend": 10, "no-photo": 20, "owned-miss": 30, "inventory-ref-cache": 40 } };
const d = readerPlaceholderRate(defects, { headroom: 500 });
ok(Math.abs(d.rate - 0.5) < 1e-9, "only the cold surfaces are removed; real defects stay in the rate");
ok(computeBreach({ ...T, placeholderRate: d.rate }) === true, "real defects still breach");

// Empty / malformed input never throws or fabricates.
ok(readerPlaceholderRate(null, { headroom: 5 }).rate === 0, "null summary is 0, not NaN");
ok(readerPlaceholderRate({ sampled: 0 }, { headroom: 5 }).rate === 0, "zero sampled is 0");

// Wiring: the monitor must feed the breach the reader rate, not the raw one.
const src = fs.readFileSync(new URL("./photo-monitor.mjs", import.meta.url), "utf8");
ok(/readerPlaceholderRate\(summary,\s*\{\s*headroom:\s*allowance\.headroom\s*\}\)/.test(src), "monitor computes the reader rate from the measured headroom");
ok(/computeBreach\(\{\s*placeholderRate:\s*reader\.rate,/.test(src), "computeBreach receives reader.rate, not summary.placeholderRate");

console.log(`test-photo-monitor-cold-rate: ok (${pass} checks)`);
