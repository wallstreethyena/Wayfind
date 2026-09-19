// v5.72 prebuild gate — Part 4 measurement math. The ratio definitions and the
// 2% benchmark are the whole point; a wrong denominator makes the one number
// that matters a lie. (The browser instrumentation is guarded/no-op-safe and
// exercised at runtime, not here.)
import { readFileSync } from "node:fs";
import { computeShareMetrics, markSessionStart, startSessionRecording, SHARE_BENCHMARK, SHARE_EVENTS, RETURN_WINDOW_DAYS } from "../lib/shareMetrics.js";

let failures = 0;
const fail = (m) => { console.error("test-share-metrics: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

ok(SHARE_BENCHMARK === 0.02, "the benchmark is 2% of sessions");
ok(RETURN_WINDOW_DAYS === 7, "the return window is 7 days");
ok(SHARE_EVENTS.session === "session" && SHARE_EVENTS.share === "share" && SHARE_EVENTS.open === "share_open" && SHARE_EVENTS.return === "share_return", "event names are stable");

// The three ratios.
{
  const m = computeShareMetrics({ sessions: 1000, shares: 30, opens: 21, shareVisitors: 50, returns: 10 });
  ok(near(m.share_rate, 0.03), "share_rate = shares / sessions (30/1000 = 0.03)");
  ok(near(m.open_rate, 0.7), "open_rate = opens / shares (21/30 = 0.7)");
  ok(near(m.return_rate, 0.2), "return_rate = returns / shared-card visitors (10/50 = 0.2)");
  ok(m.meets_benchmark === true, "3% share_rate beats the 2% bar");
}

// Session recording is acknowledgement-based. The September 2026 regression
// set wf_sess while the lazily loaded Supabase client was still null, then the
// mount-only effect never retried: active devices stayed real while sessions
// fell to zero. A failed write must leave the guard clear, and concurrent
// effects must still emit only one accepted event.
{
  const memory = new Map();
  global.window = { location: { pathname: "/", search: "" } };
  global.sessionStorage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, String(value)),
  };

  let unavailableCalls = 0;
  const unavailable = await markSessionStart(() => { unavailableCalls++; return false; });
  ok(unavailable === false && unavailableCalls === 1, "an unavailable event writer reports failure");
  ok(!memory.has("wf_sess"), "a failed session insert does not poison the per-tab retry guard");
  ok(await markSessionStart(() => undefined) === false && !memory.has("wf_sess"), "only an explicit insert acknowledgement can mark the session recorded");

  let acceptedCalls = 0;
  let release;
  const accepted = () => {
    acceptedCalls++;
    return new Promise((resolve) => { release = () => resolve(true); });
  };
  const first = markSessionStart(accepted);
  const concurrent = markSessionStart(accepted);
  const third = markSessionStart(accepted);
  ok(acceptedCalls === 1, "concurrent readiness effects share one in-flight session insert");
  release();
  ok(await first === true && await concurrent === true && await third === true, "the acknowledged session insert resolves for all concurrent callers");
  ok(memory.get("wf_sess") === "1", "the duplicate guard is written after acknowledgement");
  ok(await markSessionStart(accepted) === true && acceptedCalls === 1, "the acknowledged session is never inserted twice in one tab");

  memory.delete("wf_sess");
  let readinessWrites = 0;
  let scheduled = null;
  const schedule = (fn) => { scheduled = fn; return 1; };
  startSessionRecording(false, () => { readinessWrites++; return true; }, { setTimer: schedule });
  await new Promise((resolve) => setImmediate(resolve));
  ok(readinessWrites === 0 && scheduled === null, "the executed readiness helper emits nothing before the event client is ready");
  startSessionRecording(true, () => { readinessWrites++; return readinessWrites > 1; }, { setTimer: schedule, retryMs: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  ok(readinessWrites === 1 && typeof scheduled === "function" && !memory.has("wf_sess"), "a ready writer executes once and schedules a failed insert retry without marking the session");
  scheduled();
  await new Promise((resolve) => setImmediate(resolve));
  ok(readinessWrites === 2 && memory.get("wf_sess") === "1", "the executed retry records exactly one acknowledged session after readiness");

  delete global.window;
  delete global.sessionStorage;
}

{
  const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
  const start = home.indexOf("const stopSessionRecording = startSessionRecording(true, logEvent)");
  const block = home.slice(start, start + 400);
  ok(start > 0 && /if \(!supabaseReady\) return;/.test(home.slice(start - 300, start)), "session recording waits for the lazy Supabase client");
  ok(/\}, \[supabaseReady\]\);/.test(block), "session recording reruns when the lazy client becomes ready");
  ok(/return supabase\.from\("events"\)\.insert\(row\)\.then\(\(\{ error \}\) => !error/.test(home), "logEvent returns the database insert acknowledgement to the session guard");
  const screenStart = home.indexOf('logEvent("screen_view", null, { screen })');
  const screenBlock = home.slice(screenStart - 220, screenStart + 180);
  ok(screenStart > 0 && /if \(!supabaseReady\) return;/.test(screenBlock) && /\[screen, supabaseReady\]/.test(screenBlock), "the initial screen view waits for the same lazy writer and emits once when ready");
}

// The bar.
{
  ok(computeShareMetrics({ sessions: 1000, shares: 20 }).meets_benchmark === true, "exactly 2% meets the bar (>=)");
  ok(computeShareMetrics({ sessions: 1000, shares: 19 }).meets_benchmark === false, "1.9% does not meet the bar");
  ok(near(computeShareMetrics({ sessions: 1000, shares: 15 }).share_rate, 0.015), "1.5% share rate computes");
}

// Division-by-zero + garbage guards: never NaN, never Infinity.
{
  const z = computeShareMetrics({});
  ok(z.share_rate === 0 && z.open_rate === 0 && z.return_rate === 0, "all-zero input yields 0 rates, not NaN");
  ok(z.meets_benchmark === false, "no data does not meet the bar");
  const g = computeShareMetrics({ sessions: -5, shares: "x", opens: null, shareVisitors: undefined, returns: NaN });
  ok(Number.isFinite(g.share_rate) && Number.isFinite(g.open_rate) && Number.isFinite(g.return_rate), "garbage input still yields finite rates");
  ok(computeShareMetrics({ sessions: 0, shares: 5 }).share_rate === 0, "shares with zero sessions is 0, not Infinity");
}

if (failures) { console.error(`test-share-metrics: ${failures} failure(s)`); process.exit(1); }
console.log("test-share-metrics: OK — ratios hold; session waits for the event client, retries failed inserts, and dedupes concurrent effects");
