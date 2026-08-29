#!/usr/bin/env node
// scripts/check-event-day-is-venue-local.mjs — AN EVENT ENDS ON THE VENUE'S
// CLOCK, NOT THE SERVER'S.
//
// v8.84, found on the night a partner was open. The Möbius Sarasota Night
// Market — a signed Wayfind partner — runs 7pm to 1am on BOTH 2026-08-28 and
// 2026-08-29. lib/curatedEvents.js decided eligibility with:
//
//     new Date(`${end}T23:59:59`) < now
//
// That string carries no timezone, so JS parses it in the SERVER's zone, and
// Vercel is UTC. The event therefore expired at 2026-08-29T23:59:59Z — which
// is 7:59 PM EASTERN. Fifty-nine minutes after the partner's doors opened on
// night two, Wayfind stopped listing them, and stayed silent for the five
// hours that were the whole point of the evening. The event PAGE stayed up;
// every path that leads a reader to it went dark.
//
// CLAUDE.md documents this trap by name — "that's UTC and drops tonight's
// events after ~8 PM ET" — but the grep that catches it looks for
// `toISOString().slice(0,10)`, and this was a different spelling of the same
// mistake. So this guard tests the BEHAVIOUR at the boundary rather than the
// spelling, on a runtime pinned to UTC, which is the only way it reproduces.
//
// Every assertion runs the real exported functions. TZ is forced to UTC for
// the child that matters because a check that only passes on a developer's
// Eastern laptop proves nothing about the server that actually serves.
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// The probe runs in a child process with TZ=UTC so the assertion measures the
// production runtime. Running it in-process would inherit whatever zone the
// developer's machine has, and on an Eastern laptop the ORIGINAL BUG PASSES.
const probe = `
import { isEligible, daysUntil } from ${JSON.stringify(join(ROOT, "lib/curatedEvents.js"))};
const partner = { start_date: "2026-08-28", end_date: "2026-08-29" };
const oneDay  = { start_date: "2026-08-29", end_date: "2026-08-29" };
const future  = { start_date: "2026-09-05", end_date: "2026-09-05" };
const openRun = { start_date: "2026-08-01", end_date: null };
const at = (iso) => new Date(iso);
const out = {
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  // night two of the partner's market, across the UTC midnight boundary
  n2_6pm:    daysUntil(partner, at("2026-08-29T22:00:00Z")),
  n2_758pm:  daysUntil(partner, at("2026-08-29T23:58:00Z")),
  n2_805pm:  daysUntil(partner, at("2026-08-30T00:05:00Z")),
  n2_11pm:   daysUntil(partner, at("2026-08-30T03:00:00Z")),
  nextMorning: daysUntil(partner, at("2026-08-30T13:00:00Z")),
  // a single-night event, same boundary
  one_805pm: daysUntil(oneDay, at("2026-08-30T00:05:00Z")),
  // the countdown for something genuinely ahead must not shift by a day
  future_758pm: daysUntil(future, at("2026-08-29T23:58:00Z")),
  future_805pm: daysUntil(future, at("2026-08-30T00:05:00Z")),
  openRunEnd: daysUntil(openRun, at("2026-08-29T23:58:00Z")),
  openRunSameDay: daysUntil(openRun, at("2026-08-02T00:05:00Z")),
};
console.log(JSON.stringify(out));
`;
let res;
try {
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
    env: { ...process.env, TZ: "UTC" }, encoding: "utf8",
  });
  res = JSON.parse(stdout.trim().split("\n").pop());
} catch (e) {
  console.error("check-event-day-is-venue-local: the probe itself failed to run —", e && e.message);
  process.exit(1);
}

ok(res.tz === "UTC", `positive control: the probe really ran on a UTC runtime (got ${res.tz}) — on an Eastern laptop the original bug PASSES, so this is the assertion that makes the rest mean anything`);

// ── THE FIVE HOURS ──────────────────────────────────────────────────────────
// daysUntil === 0 is what marks an event HAPPENING NOW. Every one of these is
// inside the partner's own advertised hours on night two.
ok(res.n2_6pm === 0, `6:00 PM ET on night two reads as happening now (got ${res.n2_6pm})`);
ok(res.n2_758pm === 0, `7:58 PM ET — one minute before the old UTC cutoff — reads as happening now (got ${res.n2_758pm})`);
ok(res.n2_805pm === 0, `8:05 PM ET reads as happening now (got ${res.n2_805pm}) — THIS is the assertion that was false, and it was false for five hours a night`);
ok(res.n2_11pm === 0, `11:00 PM ET, with the market open until 1am, still reads as happening now (got ${res.n2_11pm})`);
ok(res.one_805pm === 0, `a SINGLE-night event is still on at 8:05 PM ET (got ${res.one_805pm}) — the bug was never specific to multi-night runs`);

// ── AND THE OTHER DIRECTION, so this is not just "always say yes" ───────────
ok(res.nextMorning < 0, `the morning after, the run reads as past (got ${res.nextMorning})`);
ok(res.future_758pm === 7 && res.future_805pm === 7,
  `a future event's countdown does not shift by a day across UTC midnight (7:58 PM -> ${res.future_758pm}, 8:05 PM -> ${res.future_805pm}; want 7 and 7)`);
// An end_date of null falls back to start_date here, so a row with no end
// reads as a ONE-DAY event — 28 days later it is past, which is correct for
// this function. The fall rail's open-run concept (end_date null stays visible
// OPEN_RUN_DAYS from its start) lives in lib/fallPool, deliberately: the file
// header says the two surfaces need different DATE laws and share only the
// trust law. Pinned in both directions so nobody "fixes" daysUntil into
// answering a question that belongs to the other surface.
ok(res.openRunEnd < 0, `an end_date-less row 28 days on reads as past here (got ${res.openRunEnd}) — the open-run window is lib/fallPool's law, not this function's`);
ok(res.openRunSameDay === 0, `...and on 8:05 PM ET of its own ET start-day it is still in progress (got ${res.openRunSameDay}) — which is the half that was broken`);

// ── THE SPELLING THAT CAUSED IT MAY NOT COME BACK ───────────────────────────
// Weaker than the behavioural tests above and named as such: a source check,
// scoped to the two functions that decide whether an event is over. The
// behaviour tests are the real lock; this one makes the NEXT instance obvious
// in review instead of five hours into somebody's event.
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(join(ROOT, "lib/curatedEvents.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const bad = src.match(/new Date\(`\$\{[^`]*\}T\d{2}:\d{2}:\d{2}`\)/g) || [];
  ok(bad.length === 0,
    `no timezone-less \`new Date(\\\`\${date}Thh:mm:ss\\\`)\` remains in curatedEvents (found ${bad.length}: ${bad.join(", ")}) — that parse is server-local, and the server is UTC`);
  ok(/import \{ siteTodayStr \} from "\.\/siteTime\.js"/.test(src),
    "curatedEvents reads the ONE clock (lib/siteTime.js), rather than deriving a second one");
}

console.log(`\ncheck-event-day-is-venue-local: ${fail ? "FAIL" : "OK"} — ${pass} assertions, the behavioural ones executed in a child process pinned to TZ=UTC so they measure the runtime that actually serves; the partner's night-two hours (7pm–1am) are walked across the UTC midnight that used to end them at 7:59 PM ET`);
process.exit(fail ? 1 : 0);
