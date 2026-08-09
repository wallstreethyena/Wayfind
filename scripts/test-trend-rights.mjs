#!/usr/bin/env node
// scripts/test-trend-rights.mjs — the licence gate, by EXECUTION.
//
// Every assertion here CALLS the module and checks the return or the throw.
// Nothing greps lib/trendRights.js, because a regex over that file would pass on
// a version whose gate had been inverted — the identifiers would all still be
// there (CLAUDE.md, "assert on the CALL, not on the string").

import { readFileSync } from "node:fs";
import {
  rightsMode, importCadence, RIGHTS_MODES, CADENCES, TrendConfigError,
  mayReadSourceData, mayProcessWithAi, mayInfluencePublicRanking, mayDisplayPublicly, mayRunDiscovery,
  rightsPosture, requireCapability, snapshotFreshness, rightsReference,
} from "../lib/trendRights.js";

let pass = 0;
const fail = (m) => { console.error("test-trend-rights: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const throws = (fn, want, m) => {
  try { fn(); } catch (e) { ok(e instanceof TrendConfigError && String(e.message).includes(want), `${m} (threw "${String(e.message).slice(0, 90)}", wanted mention of "${want}")`); return; }
  fail(m + " — did NOT throw");
};

// ── Missing / unknown configuration fails loudly and NAMES the variable ─────
throws(() => rightsMode({}), "EXPLODING_TOPICS_RIGHTS_MODE", "an unset rights mode must throw naming the variable");
throws(() => rightsMode({ EXPLODING_TOPICS_RIGHTS_MODE: "" }), "EXPLODING_TOPICS_RIGHTS_MODE", "an EMPTY rights mode is missing, not a value");
throws(() => rightsMode({ EXPLODING_TOPICS_RIGHTS_MODE: "   " }), "EXPLODING_TOPICS_RIGHTS_MODE", "whitespace-only rights mode is missing");
throws(() => rightsMode({ EXPLODING_TOPICS_RIGHTS_MODE: "approved" }), "not a recognised rights mode", "a typo must never be read as permission");
throws(() => rightsMode({ EXPLODING_TOPICS_RIGHTS_MODE: "COMMERCIAL_APPROVED" }), "not a recognised rights mode", "mode matching is exact — case variants are not accepted");
throws(() => importCadence({}), "EXPLODING_TOPICS_IMPORT_CADENCE", "an unset cadence must throw naming the variable");
throws(() => importCadence({ EXPLODING_TOPICS_IMPORT_CADENCE: "hourly" }), "not a recognised cadence", "an unknown cadence must throw");

// There is NO default. Proven by calling with an empty env, which is the exact
// condition a fallback would hide.
ok(RIGHTS_MODES.length === 3, "there are exactly three rights modes");
for (const m of RIGHTS_MODES) ok(rightsMode({ EXPLODING_TOPICS_RIGHTS_MODE: m }) === m, `"${m}" is accepted`);
ok(importCadence({ EXPLODING_TOPICS_IMPORT_CADENCE: "weekly" }).maxAgeDays === 8, "weekly cadence carries an 8-day ceiling");
ok(importCadence({ EXPLODING_TOPICS_IMPORT_CADENCE: "daily" }).maxAgeDays < CADENCES.weekly.maxAgeDays, "daily cadence has a SHORTER ceiling than weekly — that is the point of choosing it");

// ── Capability matrix ──────────────────────────────────────────────────────
ok(!mayReadSourceData("unconfirmed"), "unconfirmed may NOT read the real export");
ok(!mayProcessWithAi("unconfirmed"), "unconfirmed may NOT pass rows to an LLM");
ok(!mayInfluencePublicRanking("unconfirmed"), "unconfirmed may NOT influence public ranking");
ok(!mayDisplayPublicly("unconfirmed"), "unconfirmed may NOT display anything publicly");
ok(!mayRunDiscovery("unconfirmed"), "unconfirmed may NOT spend Google quota");

ok(mayReadSourceData("internal_research"), "internal_research MAY read the export");
// The one that is easy to get wrong: reading the data and feeding it to a model
// are separate permissions, and Semrush restricts the second specifically.
ok(!mayProcessWithAi("internal_research"), "internal_research may NOT pass rows to an LLM — reading and AI-processing are separate permissions");
ok(!mayInfluencePublicRanking("internal_research"), "internal_research may NOT alter public ranking");
ok(!mayDisplayPublicly("internal_research"), "internal_research may NOT display publicly");

ok(mayProcessWithAi("commercial_approved"), "commercial_approved MAY use AI processing");
ok(mayInfluencePublicRanking("commercial_approved"), "commercial_approved MAY influence ranking");
ok(mayDisplayPublicly("commercial_approved"), "commercial_approved MAY display publicly");

// An unknown mode grants NOTHING — fail closed, not open.
for (const cap of [mayReadSourceData, mayProcessWithAi, mayInfluencePublicRanking, mayDisplayPublicly, mayRunDiscovery]) {
  ok(!cap("wat"), `${cap.name} fails CLOSED on an unrecognised mode`);
  ok(!cap(undefined), `${cap.name} fails CLOSED on undefined`);
}

// ── rightsPosture / requireCapability ──────────────────────────────────────
const p = rightsPosture({ EXPLODING_TOPICS_RIGHTS_MODE: "unconfirmed" });
ok(p.mode === "unconfirmed" && Object.values(p).filter((v) => v === true).length === 0, "the unconfirmed posture grants nothing");
throws(() => rightsPosture({}), "EXPLODING_TOPICS_RIGHTS_MODE", "rightsPosture throws rather than returning a partial table on bad config");
throws(
  () => requireCapability("displayPublicly", { EXPLODING_TOPICS_RIGHTS_MODE: "internal_research" }),
  "docs/exploding-topics-rights.md",
  "a refused capability points at the rights doc — the remedy is a conversation with Semrush, not a code change"
);
ok(requireCapability("readSourceData", { EXPLODING_TOPICS_RIGHTS_MODE: "internal_research" }).mode === "internal_research", "a permitted capability returns the posture");

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

// ── A raised mode must name the approval it rests on ───────────────────────
//
// HERMETIC BY CONSTRUCTION: every case passes an explicit env OBJECT. An earlier
// version of this block read process.env to decide its verdict, and
// scripts/check-guard-hermeticity.mjs correctly rejected it — a guard that
// consults the shell answers differently in a clean terminal than in one with a
// .env sourced, which is how 5c541b4 turned a live-affiliate guard into
// decoration for six hours. The env read moved into lib/trendRights.js, where it
// is a runtime gate rather than a build-time verdict.
ok(rightsReference({ EXPLODING_TOPICS_RIGHTS_MODE: "unconfirmed" }) === null,
  "unconfirmed needs no reference — there is nothing to point at");
for (const mode of ["internal_research", "commercial_approved"]) {
  throws(() => rightsReference({ EXPLODING_TOPICS_RIGHTS_MODE: mode }), "EXPLODING_TOPICS_RIGHTS_REF",
    `raising the mode to "${mode}" without naming the written approval must throw`);
  for (const junk of ["TODO", "tbd", "n/a", "<contract ref>", "   ", "???"]) {
    throws(() => rightsReference({ EXPLODING_TOPICS_RIGHTS_MODE: mode, EXPLODING_TOPICS_RIGHTS_REF: junk }),
      "EXPLODING_TOPICS_RIGHTS_REF", `a placeholder reference (${JSON.stringify(junk)}) is not a licence`);
  }
  ok(rightsReference({ EXPLODING_TOPICS_RIGHTS_MODE: mode, EXPLODING_TOPICS_RIGHTS_REF: "semrush-support-#84213" }) === "semrush-support-#84213",
    `a real reference is accepted for "${mode}"`);
}

// ── The rights doc exists and asks the questions that decide the mode ──────
const doc = readFileSync(new URL("../docs/exploding-topics-rights.md", import.meta.url), "utf8");
ok(/EXPLODING_TOPICS_RIGHTS_MODE/.test(doc), "the rights doc names the variable an operator has to set");
ok(/EXPLODING_TOPICS_RIGHTS_REF/.test(doc), "…and the reference variable that must move with it");
ok(/AI\/ML|AI processing/i.test(doc), "the doc asks Semrush about AI processing specifically");
ok(/Derived ranking/i.test(doc), "…about derived ranking specifically");
ok(/Public display/i.test(doc), "…and about public display specifically");

console.log(`test-trend-rights: OK — ${pass} assertions (config fails loudly; capabilities fail closed; staleness decays and expires)`);
