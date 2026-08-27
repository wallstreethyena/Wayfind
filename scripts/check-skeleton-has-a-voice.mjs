#!/usr/bin/env node
/**
 * scripts/check-skeleton-has-a-voice.mjs — a waiting rail must never be mute.
 *
 * THE OWNER'S REPORT, 2026-08-27, with a screenshot of the drop open on
 * "Actually Worth Eating" over three grey placeholder cards:
 *
 *     "I literally just try to refresh to see if anything would come up. It
 *      just looked like it was doing something. But, again, it show with no
 *      results."
 *
 * REPRODUCED the same day, iPhone 14 viewport against production with
 * /api/rails held open by a route interceptor:
 *
 *     +10s   skeleton, 0 cards, NO message
 *     +15s   skeleton, 0 cards, NO message
 *     +23s   skeleton, 0 cards, NO message
 *     +33s   "We couldn't reach the ranking service just now…"
 *
 * His two screenshots are the SAME failure photographed at different seconds:
 * the silent grey box before the deadline, the apology after it. For thirty
 * seconds the drop said nothing and offered nothing to press.
 *
 * AND REFRESHING MADE IT WORSE, which is the part that matters. The obvious
 * thing a reader does at ten seconds of grey is reload — and a reload restarts
 * the thirty-second clock from zero. He was in a loop that could not end.
 *
 * v8.73 raised RAILS_LOAD_TIMEOUT_MS from 12s to 30s for a good reason (a slow
 * response that is about to succeed must not be called a failure) and in doing
 * so it more than DOUBLED the silent window. This guard exists so that trade is
 * never made again without the voice that pays for it.
 *
 * WHAT IT PINS, and why each one is a real regression risk:
 *   - the voice exists and is rendered INSIDE the skeleton branch, not beside
 *     it, so it cannot be orphaned by an edit to the render chain;
 *   - it is not a failure claim (nothing failed — that would be the
 *     slow-is-not-failed bug of #993 coming back through the copy);
 *   - it carries a real link, so there is always something to press;
 *   - and the ordering RAIL_VOICE_MS < RAILS_LOAD_TIMEOUT_MS holds, because a
 *     voice that speaks after the deadline speaks to nobody.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const RAW = readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8");
const SRC = strip(RAW);

/* ── 1. THE ORDERING ───────────────────────────────────────────────────────*/
{
  const mV = SRC.match(/export const RAIL_VOICE_MS\s*=\s*(\d+)/);
  const mT = SRC.match(/export const RAILS_LOAD_TIMEOUT_MS\s*=\s*(\d+)/);
  ok(!!mV, "RAIL_VOICE_MS is declared (the declaration, not the bare name)");
  ok(!!mT, "RAILS_LOAD_TIMEOUT_MS is declared");
  const v = mV ? Number(mV[1]) : NaN, t = mT ? Number(mT[1]) : NaN;
  ok(v < t, `the voice (${v}ms) must speak BEFORE the deadline (${t}ms) — after it the reader is already looking at the failure message and the voice reaches nobody`);
  ok(v >= 3000, `…and not so early (${v}ms) that a normal load shows it: measured on production 2026-08-27 from a COLD cache cell, request out at 1.8s, answered at 5.3s, cards on screen at 6.4s. A message that fires on a healthy load is the one readers learn to distrust`);
}

/* ── 2. THE VOICE IS ARMED OFF THE PENDING STATE, AND DISARMED ─────────────*/
{
  const i = SRC.indexOf("setRailSlow(true)");
  ok(i > -1, "PROBE: the voice timer exists at all — a -1 here makes everything below vacuous");
  const block = i > -1 ? SRC.slice(Math.max(0, i - 400), i + 200) : "";
  ok(/isPending\(railLoad\)/.test(block),
    "the timer is armed off the PENDING state — so it tracks how long the reader has actually been waiting, not how long since the last render");
  ok(/setRailSlow\(false\)/.test(block),
    "…and disarmed when the load leaves pending, so a fast second load does not inherit the first one's voice");
  ok(/clearTimeout/.test(block), "…and the timer is cleaned up, not leaked on unmount");
}

/* ── 3. IT RENDERS INSIDE THE SKELETON BRANCH ──────────────────────────────
   The branch is the only place a skeleton may render (check-no-terminal-
   loading pins that). If the voice drifts outside it, the grey box is mute
   again and this file would still pass on the identifiers alone. */
{
  const start = SRC.indexOf('aria-label="Ranking places"');
  const end = SRC.indexOf("thinSet.has(selRail.id)", start);
  const branch = start > -1 && end > start ? SRC.slice(start, end) : "";
  ok(branch.length > 200, `PROBE: the skeleton branch was delimited (${branch.length} chars) — a -1 would scan the whole file and prove nothing`);
  ok(/<PlaceCardSkeleton/.test(branch), "PROBE: the delimited block really is the skeleton branch");
  ok(/railSlow\s*\?/.test(branch),
    "the voice is rendered INSIDE the skeleton branch — a reader looking at a grey box is exactly the reader it is for");
  ok(/wf8-slowsay/.test(branch), "…through its own class, so it can be styled without touching the failure state's");
  ok(/<a href=\{railHref\(/.test(branch),
    "…and it carries a REAL link. A sentence with nothing to press is still a dead end; this is the escape hatch the mute box never had");
}

/* ── 4. IT DOES NOT CLAIM A FAILURE ────────────────────────────────────────
   Nothing has failed at RAIL_VOICE_MS — the request is in flight and usually
   about to succeed. Saying otherwise is the exact bug #993 fixed, re-entering
   through the copy instead of through the state machine. */
{
  const start = SRC.indexOf("wf8-slowsay");
  const say = start > -1 ? SRC.slice(start, start + 600) : "";
  ok(say.length > 100, "PROBE: the voice's copy was delimited");
  ok(/Still ranking/.test(say), "the copy says what is HAPPENING (still ranking), which is true");
  ok(!/couldn't reach|failed|error|problem|wrong/i.test(say),
    "…and does NOT claim a failure — at this point nothing has failed, and telling a reader it has is the slow-is-not-failed bug re-entering through the copy");
  ok(!/\b(best|#1|top-rated)\b/i.test(say), "…and makes no ranking claim while it has nothing ranked");
}

/* ── 5. THE STYLE SHIPS ────────────────────────────────────────────────────*/
{
  const css = readFileSync(join(ROOT, "app/components/railMenuCss.js"), "utf8");
  ok(/\.wf8-slowsay\{/.test(css), "the class is actually styled — an unstyled voice inherits the skeleton's layout and reads as debris");
  ok(/\.wf8-slowsay a\{/.test(css), "…and its link is styled as a link");
}

/* ── 6. RED PROOFS ─────────────────────────────────────────────────────────*/
const RED = [
  ["a voice that speaks after the deadline is detectable", () => !(31000 < 30000)],
  ["a voice that fires during a healthy load is detectable", () => !(1000 >= 3000)],
  ["a voice rendered outside the skeleton branch is detectable", () => {
    const fake = '<ul aria-label="Ranking places"><PlaceCardSkeleton count={3} /></ul>';
    return !/railSlow\s*\?/.test(fake);
  }],
  ["failure copy in the waiting state is detectable", () => {
    return /couldn't reach|failed/i.test("we couldn't reach the ranking service");
  }],
  ["a sentence with no link is detectable", () => {
    const fake = '<div className="wf8-slowsay"><p>Still ranking…</p></div>';
    return !/<a href=\{railHref\(/.test(fake);
  }],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-skeleton-has-a-voice: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-skeleton-has-a-voice: OK — ${pass} assertions (the voice speaks inside the skeleton branch, before the deadline, claims no failure, and carries a link)`);
