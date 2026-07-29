#!/usr/bin/env node
/**
 * check-atlas-diag-not-live — temporary debug logging may never run on a live cron.
 *
 * atlas-build carries ATLAS-DIAG logging because it failed 525 times in a row
 * without ever raising an error (see the route header and issue #438).
 *
 * Three ways that ends badly, and this guard blocks all three:
 *
 *   1. Someone restores the schedule at FULL rate while ATLAS-DIAG is still in
 *      the file, and production runs debug logging on an hourly metered job.
 *   2. Someone deletes ATLAS-DIAG as "cleanup" without fixing anything, and the
 *      route goes back to the exact silence that hid a 100% failure rate for
 *      five days.
 *   3. A "verification run" quietly becomes the resting state — notice still in
 *      the header, rate crept back up, nobody actually reading the output.
 *
 * The rule is a three-state COUPLING, not a ban. See the state table below.
 *
 * Also enforces the thing that makes ATLAS-DIAG safe to ship at all: it logs a
 * key LENGTH, never a key.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const route = readFileSync(path.resolve("app/api/cron/atlas-build/route.js"), "utf8");
const vercel = JSON.parse(readFileSync(path.resolve("vercel.json"), "utf8"));

const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
const atlasCron = crons.find((c) => String(c && c.path || "").includes("/api/cron/atlas-build"));
const scheduled = !!atlasCron;
const diag = /ATLAS-DIAG/.test(route);

// v6.66 — A THIRD STATE, because two were not enough.
//
// The first version said: diagnostics present XOR scheduled. That blocked the
// one thing actually needed to close the incident — running the job under
// diagnostics and watching the failing branch go silent. Proving the fix from a
// credit balance instead would be inference, which is what caused this episode.
//
// The states are:
//   disabled     + diagnostics   the halt (cause unknown)
//   VERIFICATION + diagnostics   scheduled at a REDUCED rate, deliberately watched
//   scheduled    + no diagnostics the healthy resting state
// The forbidden one is full-rate unattended with debug logging still on.
//
// The rate cap is what makes the middle state safe: at ?limit=3 a bad hour costs
// three rows, not twenty-five.
const VERIFICATION_LIMIT_CAP = 5;
const schedLimit = Number(
  new URLSearchParams(String((atlasCron && atlasCron.path) || "").split("?")[1] || "").get("limit") || 0);
const verifying = /VERIFICATION RUN/.test(route);

if (scheduled && diag) {
  ok(verifying,
    "atlas-build is SCHEDULED with ATLAS-DIAG still live and no 'VERIFICATION RUN' notice in the route — " +
    "either this is a deliberate watched run and it must say so, or the diagnostics belong in the same change that restored the schedule");
  ok(schedLimit > 0 && schedLimit <= VERIFICATION_LIMIT_CAP,
    `a verification run must be RATE-LIMITED: ?limit=${schedLimit} exceeds ${VERIFICATION_LIMIT_CAP}. ` +
    "The point is that a bad hour costs three rows instead of twenty-five");
} else {
  ok(scheduled || diag,
    "atlas-build is disabled AND the ATLAS-DIAG diagnostics are gone — if the cause is fixed, restore the " +
    "vercel.json entry in this change; if it is not, keep the diagnostics. Silence is what hid the failure.");
}
// A verification notice may not outlive the diagnostics: once ATLAS-DIAG is
// stripped, the route would be claiming to be a watched run with nothing watching.
ok(!(verifying && !diag),
  "the route still calls itself a VERIFICATION RUN but the ATLAS-DIAG diagnostics are gone — " +
  "when you strip the diagnostics, restore the normal limit and drop the verification notice in the same change");
// ...and a verification run must not quietly become the resting state at full rate.
ok(!(verifying && schedLimit > VERIFICATION_LIMIT_CAP),
  `a VERIFICATION RUN notice is present but the schedule is at ?limit=${schedLimit} — that is the resting state, not a watched run`);

// Both failure branches must be instrumented, or the diagnostic answers nothing:
// the whole point is telling Google's failure apart from Anthropic's.
if (diag) {
  ok(/ATLAS-DIAG places/.test(route), "the Google Places branch is instrumented");
  ok(/ATLAS-DIAG anthropic/.test(route), "the Anthropic branch is instrumented");
  ok(/ATLAS-DIAG places threw/.test(route) && /ATLAS-DIAG anthropic threw/.test(route),
    "the THROW paths are instrumented too — a timeout is a different failure from a non-200 and must not look the same");
}

// AGENTS.md §8: never print a key. A length is fine and is what we actually need.
const diagLines = route.split("\n").filter((l) => l.includes("ATLAS-DIAG"));
ok(diagLines.length > 0 || !diag, "diagnostic lines are findable for review");
for (const l of diagLines) {
  ok(!/\$\{\s*key\s*\}/.test(l) && !/\$\{\s*akey\s*\}/.test(l) && !/\$\{\s*gkey\s*\}/.test(l),
    `a diagnostic line interpolates a KEY, not its length: ${l.trim().slice(0, 90)}`);
  ok(!/x-api-key|X-Goog-Api-Key/i.test(l), `a diagnostic line logs an auth header: ${l.trim().slice(0, 90)}`);
}
if (diag) ok(/keyLen=/.test(route), "the Places diagnostic reports a key LENGTH — the safe form of the question");

if (fail.length) {
  console.error("check-atlas-diag-not-live: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-atlas-diag-not-live: OK — ${pass} assertions (halt-or-verification coupling, both branches instrumented, no key in a log line)`);
