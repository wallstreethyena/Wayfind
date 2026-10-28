#!/usr/bin/env node
/**
 * test-posthog-timeout-retry — one slow PostHog query must not email
 * "A connected data source is failing".
 *
 * THE INCIDENT THIS IS PINNED TO (2026-10-24 08:07Z)
 * The Command Center's 15s client-side timeout fired once on a PostHog HogQL
 * query. `run()` turned the AbortError into a source error, computeAlerts
 * rendered it as "PostHog: This operation was aborted" at WARN, and the cron
 * emailed the owner. The next run was fine. A single timeout is a slow query,
 * not a failing source.
 *
 * THE RULE
 *   - a timed-out query is retried ONCE with a longer budget;
 *   - a retry that succeeds is a success (no source error, no alert);
 *   - a second timeout IS reported, and the note says "timed out", not the
 *     browser-ism "This operation was aborted";
 *   - a real HTTP error is never retried (a 401 twice is still a 401).
 *
 * Everything below runs against the real module with an injected fetch; no
 * network, no key needed beyond a placeholder env.
 */
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const PH = await import(path.resolve("lib/commandCenter/sources/posthog.js"));
const env = { POSTHOG_PERSONAL_API_KEY: "phx_test", POSTHOG_PROJECT_ID: "1", POSTHOG_API_HOST: "https://example.invalid" };

// A fetch that honours AbortSignal like the real one: hangs until aborted, or
// answers immediately with `body`.
const hang = () => (url, init) => new Promise((_, reject) => {
  const err = new Error("This operation was aborted"); err.name = "AbortError";
  if (init.signal.aborted) return reject(err);
  init.signal.addEventListener("abort", () => reject(err), { once: true });
});
const answer = (body, status = 200) => () => Promise.resolve({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const script = (...steps) => { let i = 0; const calls = []; return { calls, fetchImpl: (u, init) => { calls.push(init); return steps[Math.min(i++, steps.length - 1)](u, init); } }; };
const fast = { timeoutMs: 20, retryTimeoutMs: 40, env, excludedUserIds: [] };
// run() memoises per query window, so each scenario gets its own window.
const win = (day) => [new Date(Date.UTC(2026, 0, day)), new Date(Date.UTC(2026, 0, day + 1))];

/* ── 1. first call times out, retry succeeds → data, no source error ──────── */
{
  const s = script(hang(), answer({ columns: ["visitors"], results: [[7]] }));
  const r = await PH.overviewCounts(...win(1), { ...fast, fetchImpl: s.fetchImpl, exclusionFetchImpl: answer({ columns: [], results: [] }) });
  ok(s.calls.length === 2, `1: a timed-out query is retried exactly once (fetch called ${s.calls.length}x)`);
  ok(r.source && r.source.connected === true, `1: the retry's success is a connected source (got ${JSON.stringify(r.source && r.source.connected)})`);
  ok(Array.isArray(r.data) && r.data.length === 1 && Number(r.data[0].visitors) === 7, "1: …and its rows are the data returned");
}

/* ── 2. both calls time out → reported once, in plain words ───────────────── */
{
  const s = script(hang(), hang());
  const r = await PH.overviewCounts(...win(2), { ...fast, fetchImpl: s.fetchImpl, exclusionFetchImpl: answer({ columns: [], results: [] }) });
  ok(s.calls.length === 2, `2: two timeouts stop at two attempts, never a loop (fetch called ${s.calls.length}x)`);
  ok(r.source && r.source.connected === false && r.source.reason === "error", "2: a second timeout IS a source error");
  ok(/timed out/i.test(String(r.source && r.source.note)) && !/operation was aborted/i.test(String(r.source && r.source.note)),
    `2: the note says it timed out, not "This operation was aborted" (got ${JSON.stringify(r.source && r.source.note)})`);
}

/* ── 3. a real HTTP failure is not retried ────────────────────────────────── */
{
  const s = script(answer({ detail: "nope" }, 401));
  const r = await PH.overviewCounts(...win(3), { ...fast, fetchImpl: s.fetchImpl, exclusionFetchImpl: answer({ columns: [], results: [] }) });
  ok(s.calls.length === 1, `3: a 401 is reported on the first attempt, never retried (fetch called ${s.calls.length}x)`);
  ok(r.source && r.source.connected === false && /401/.test(String(r.source.note)), "3: …and the note carries the status");
}

/* ── 4. the retry budget is longer than the first, and never shorter ──────── */
{
  const seen = [];
  const s = script((u, init) => { const t0 = Date.now(); return hang()(u, init).catch((e) => { seen.push(Date.now() - t0); throw e; }); });
  await PH.overviewCounts(...win(4), { ...fast, timeoutMs: 20, retryTimeoutMs: 60, fetchImpl: s.fetchImpl, exclusionFetchImpl: answer({ columns: [], results: [] }) });
  ok(seen.length === 2 && seen[1] >= seen[0], `4: the retry waits at least as long as the first attempt (${seen.join("ms, ")}ms)`);
}

if (fail.length) {
  console.error("test-posthog-timeout-retry: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`test-posthog-timeout-retry: OK — ${pass} assertions (one timeout retries once and succeeds silently, two timeouts report "timed out" once, HTTP errors never retry, the retry budget never shrinks)`);
