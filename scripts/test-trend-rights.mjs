#!/usr/bin/env node
// scripts/test-trend-rights.mjs — trend cadence and freshness policy.
//
// The former external-approval gate was removed by owner decision. This guard
// proves the remaining operational configuration by execution and also prevents
// the retired approval variables from quietly returning.

import { readFileSync } from "node:fs";
import {
  importCadence, CADENCES, TrendConfigError, snapshotFreshness,
} from "../lib/trendRights.js";

let pass = 0;
const fail = (m) => { console.error("test-trend-rights: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const throws = (fn, want, m) => {
  try { fn(); } catch (e) { ok(e instanceof TrendConfigError && String(e.message).includes(want), `${m} (threw "${String(e.message).slice(0, 90)}", wanted mention of "${want}")`); return; }
  fail(m + " — did NOT throw");
};

// ── Missing / unknown operational config fails loudly and names the variable ─
throws(() => importCadence({}), "EXPLODING_TOPICS_IMPORT_CADENCE", "an unset cadence must throw naming the variable");
throws(() => importCadence({ EXPLODING_TOPICS_IMPORT_CADENCE: "hourly" }), "not a recognised cadence", "an unknown cadence must throw");

ok(importCadence({ EXPLODING_TOPICS_IMPORT_CADENCE: "weekly" }).maxAgeDays === 8, "weekly cadence carries an 8-day ceiling");
ok(importCadence({ EXPLODING_TOPICS_IMPORT_CADENCE: "daily" }).maxAgeDays < CADENCES.weekly.maxAgeDays, "daily cadence has a SHORTER ceiling than weekly — that is the point of choosing it");

// ── Staleness ──────────────────────────────────────────────────────────────
const weekly = CADENCES.weekly, DAY = 86400000, now = Date.now();
const f0 = snapshotFreshness(now, now, weekly);
ok(f0.freshnessFactor === 1 && !f0.stale, "a just-imported snapshot is fully fresh");
const f4 = snapshotFreshness(now - 4 * DAY, now, weekly);
ok(!f4.stale && f4.freshnessFactor > 0 && f4.freshnessFactor < 1, "freshness decays continuously, not in a step");
const f8 = snapshotFreshness(now - 8 * DAY, now, weekly);
ok(f8.stale && f8.freshnessFactor === 0, "at the ceiling the snapshot is stale and the factor is exactly 0");
const f9 = snapshotFreshness(now - 9 * DAY, now, weekly);
ok(f9.stale && f9.freshnessFactor === 0, "past the ceiling stays stale");
// A future-dated export is corrupt, not maximally fresh — otherwise a bad date
// pins freshness at 1.0 forever.
ok(snapshotFreshness(now + 5 * DAY, now, weekly).stale, "a snapshot dated in the FUTURE is stale, never fresh");
ok(snapshotFreshness(NaN, now, weekly).stale, "an unparseable observation date is stale");
ok(snapshotFreshness(now - 3 * DAY, now, CADENCES.daily).stale, "3 days old is stale under DAILY cadence but not weekly — the cadence is load-bearing");
ok(!snapshotFreshness(now - 3 * DAY, now, weekly).stale, "…and the same snapshot is fresh under weekly");
// Monotonic decay — no accidental non-monotonicity in the arithmetic.
let prev = 2;
for (let d = 0; d <= 8; d++) {
  const v = snapshotFreshness(now - d * DAY, now, weekly).freshnessFactor;
  ok(v <= prev, `freshness is monotonically non-increasing (day ${d})`);
  prev = v;
}

// ── The retired external-approval gate must stay gone ──────────────────────
const policy = readFileSync(new URL("../lib/trendRights.js", import.meta.url), "utf8");
const doc = readFileSync(new URL("../docs/exploding-topics-rights.md", import.meta.url), "utf8");
for (const retired of ["EXPLODING_TOPICS_RIGHTS_MODE", "EXPLODING_TOPICS_RIGHTS_REF", "rightsReference", "requireCapability"]) {
  ok(!policy.includes(retired), `the runtime no longer contains the retired approval gate token "${retired}"`);
  ok(!doc.includes(retired), `the operator note no longer instructs anyone to configure "${retired}"`);
}
ok(/owner decision/i.test(doc) && /no separate Semrush approval/i.test(doc), "the operator note records why the gate was removed");

console.log(`test-trend-rights: OK — ${pass} assertions (approval gate absent; cadence explicit; staleness decays and expires)`);
