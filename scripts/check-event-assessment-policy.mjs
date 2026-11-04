#!/usr/bin/env node
/**
 * check-event-assessment-policy - a wf_events score of 0 means NOT YET ASSESSED, never
 * "assessed as poor", on every ranking surface (lib/eventAssessment.js).
 * Executed by CALL: assessedScore / isAssessed, then curatedEvents.scoreEvent on two rows
 * identical except for their scores, then thisWeekEvents.rankingScore. Source check: no
 * ranking module reads the three score columns raw.
 */
import { readFileSync, readdirSync } from "node:fs";
import { ASSESSMENT_PRIORS, assessedScore, isAssessed } from "../lib/eventAssessment.js";
import { scoreEvent } from "../lib/curatedEvents.js";
import { rankingScore, UNASSESSED_SCORE_PRIOR } from "../lib/thisWeekEvents.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ---- the policy itself */
ok(ASSESSMENT_PRIORS.editorial_score === 7 && ASSESSMENT_PRIORS.uniqueness_score === 5 && ASSESSMENT_PRIORS.popularity_score === 5, "priors: editorial 7 (bottom of the assessed band), uniqueness 5, popularity 5 (mid scale)");
ok(Object.isFrozen(ASSESSMENT_PRIORS), "priors are frozen");
for (const v of [0, "0", null, undefined, "", NaN, -1]) ok(!isAssessed({ editorial_score: v }), `editorial_score ${JSON.stringify(v)} is not an assessment`);
for (const v of [6, "6.9", 7, 8.4, 9.2]) ok(isAssessed({ editorial_score: v }), `editorial_score ${v} is an assessment`);
ok(assessedScore({ editorial_score: 0 }) === 7 && assessedScore({ editorial_score: null }) === 7 && assessedScore({}) === 7, "unassessed editorial reads as the prior 7");
ok(assessedScore({ editorial_score: 6 }) === 6 && assessedScore({ editorial_score: "8.4" }) === 8.4, "an assessed value is returned as a number, untouched (6 stays 6: assessed low stays below the prior)");
ok(assessedScore({ uniqueness_score: 0 }, "uniqueness_score") === 5 && assessedScore({ popularity_score: 0 }, "popularity_score") === 5 && assessedScore({ uniqueness_score: 8.5 }, "uniqueness_score") === 8.5, "uniqueness and popularity follow the same rule with their own priors");
let threw = false; try { assessedScore({}, "wayfind_score"); } catch { threw = true; }
ok(threw, "an unknown field throws rather than silently returning 0");

/* ---- scoreEvent: the hub, live picks and fall rails all rank through it */
const NOW = new Date("2026-11-03T15:00:00Z");
const base = { event_id: "x", event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "h", city: "Tampa", state: "FL", lat: 27.95, lng: -82.46, start_date: "2026-11-07", end_date: "2026-11-07", last_verified_at: "2026-11-03T12:00:00Z" };
const CTX = { now: NOW, lat: 27.95, lng: -82.46 };
const unassessed = scoreEvent({ ...base, editorial_score: 0, uniqueness_score: 0, popularity_score: 0 }, CTX);
const atPriors = scoreEvent({ ...base, editorial_score: 7, uniqueness_score: 5, popularity_score: 5 }, CTX);
const assessedLow = scoreEvent({ ...base, editorial_score: 6, uniqueness_score: 5, popularity_score: 5 }, CTX);
const assessedHigh = scoreEvent({ ...base, editorial_score: 8.4, uniqueness_score: 7, popularity_score: 7 }, CTX);
ok(Math.abs(unassessed - atPriors) < 1e-9, `an unassessed row scores exactly as a row assessed at the priors (${unassessed.toFixed(3)} vs ${atPriors.toFixed(3)})`);
ok(assessedLow < unassessed, "a row assessed 6 ranks below an unassessed row (assessed low stays low)");
ok(assessedHigh > unassessed, "a row assessed 8.4 ranks above an unassessed row");
const rawZero = 0 * 0.18 + 0 * 0.14 + 0 * 0.10;
const withPriors = 7 * 0.18 + 5 * 0.14 + 5 * 0.10;
ok(withPriors - rawZero > 2.4, `the penalty the old raw read imposed on every unreviewed row was ${(withPriors - rawZero).toFixed(2)} of ~10 points; it is gone`);

/* ---- the homepage strip reads the same policy */
ok(UNASSESSED_SCORE_PRIOR === ASSESSMENT_PRIORS.editorial_score && rankingScore({ editorial_score: 0 }) === 7 && rankingScore({ editorial_score: 8 }) === 8, "thisWeekEvents.rankingScore is the same policy");

/* ---- no ranking module reads the score columns raw */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const RAW = /Number\(\s*\w+\.(editorial|uniqueness|popularity)_score\s*(\|\||\?\?)/;
const rankingFiles = ["lib/curatedEvents.js", "lib/thisWeekEvents.js", "lib/fallIntentRails.js"];
for (const f of rankingFiles) {
  const src = strip(readFileSync(new URL("../" + f, import.meta.url), "utf8"));
  ok(!RAW.test(src), `${f} does not read a score column raw with a 0 fallback`);
}
ok(RAW.test("Number(e.editorial_score || 0) * 0.18"), "probe control: the pattern it looks for is the old raw read");
const curated = strip(readFileSync(new URL("../lib/curatedEvents.js", import.meta.url), "utf8"));
const scoreEventSrc = curated.slice(curated.indexOf("export function scoreEvent("), curated.indexOf("export function rankEvents("));
ok(scoreEventSrc.length > 100 && (scoreEventSrc.match(/assessedScore\(e, "(editorial|uniqueness|popularity)_score"\)/g) || []).length === 3, "scoreEvent reads all three columns through assessedScore");
ok(/const FAMOUS = \(e\) => assessedScore\(e, "popularity_score"\)/.test(curated) && /const UNEXPECTED = [\s\S]*?assessedScore\(e, "uniqueness_score"\)/.test(curated), "the rail composition predicates (famous, unexpected) read through the same helper");
ok(readdirSync(new URL("../lib", import.meta.url)).includes("eventAssessment.js"), "the policy module exists where every surface imports it from");

if (fail.length) { console.error("check-event-assessment-policy: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`check-event-assessment-policy: OK - ${pass} assertions; 0 means not yet assessed on scoreEvent (hub, live picks, fall rails) and the homepage strip; ${rankingFiles.length} ranking files scanned for raw reads`);
