// v5.72 prebuild gate — Part 4 measurement math. The ratio definitions and the
// 2% benchmark are the whole point; a wrong denominator makes the one number
// that matters a lie. (The browser instrumentation is guarded/no-op-safe and
// exercised at runtime, not here.)
import { computeShareMetrics, SHARE_BENCHMARK, SHARE_EVENTS, RETURN_WINDOW_DAYS } from "../lib/shareMetrics.js";

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
console.log("test-share-metrics: OK — share/open/return ratios and the 2% benchmark hold; no NaN/Infinity on empty or garbage input");
