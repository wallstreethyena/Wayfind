#!/usr/bin/env node
/**
 * check-atlas-diag-not-live — temporary debug logging may never run on a live cron.
 *
 * atlas-build is disabled in vercel.json and carries ATLAS-DIAG logging while we
 * find out why it failed 525 times in a row without ever raising an error (see
 * the header of app/api/cron/atlas-build/route.js and issue #438).
 *
 * Two ways that ends badly, and this guard blocks both:
 *
 *   1. Someone restores the schedule while ATLAS-DIAG is still in the file, and
 *      production runs debug logging on an hourly metered job.
 *   2. Someone deletes ATLAS-DIAG as "cleanup" without fixing anything, and the
 *      route goes back to the exact silence that hid a 100% failure rate for
 *      five days.
 *
 * So the rule is a COUPLING, not a ban: diagnostics present <=> cron disabled.
 * Re-enabling the schedule requires removing the diagnostics in the same change,
 * which is only defensible once the cause is actually fixed.
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
const scheduled = crons.some((c) => String(c && c.path || "").includes("/api/cron/atlas-build"));
const diag = /ATLAS-DIAG/.test(route);

// The coupling.
ok(!(scheduled && diag),
  "atlas-build is SCHEDULED while ATLAS-DIAG debug logging is still in the route — " +
  "remove the diagnostics in the same change that restores the schedule, and only after the cause is fixed");
ok(scheduled || diag,
  "atlas-build is disabled AND the ATLAS-DIAG diagnostics are gone — if the cause is fixed, restore the " +
  "vercel.json entry in this change; if it is not, keep the diagnostics. Silence is what hid the failure.");

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
console.log(`check-atlas-diag-not-live: OK — ${pass} assertions (cron disabled while diagnostics are live, both branches instrumented, no key in a log line)`);
