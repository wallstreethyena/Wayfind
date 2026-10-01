// tests/e2e/lib/containment.js — ordinary UI tests write NOTHING (#1603).
//
// 2026-09-30/10-01: early production checks blocked PostHog but not the
// first-party Supabase `events` insert (app/home.js logEvent), so a test run
// could become rows in the owner's own analytics. Blocking one hostname at a
// time is how that happened. This helper inverts it into a fail-closed rule:
//
//   - every non-GET/HEAD request is aborted (Supabase inserts, sendBeacon and
//     fetch keepalive posts, PostHog batches, form posts, CSP reports …);
//   - third-party analytics/ads hosts are aborted for every method (GET
//     pixels included);
//   - monetized redirects (/api/<partner>/go, /api/outbound) are aborted, so
//     a test can never become a partner click;
//   - everything blocked or passed is logged, and assertContained() proves no
//     write and no analytics request reached the network.
//
// This is NOT the controlled analytics test mode — that one deliberately
// writes a minimum of explicitly-labelled synthetic events and is documented
// in docs/analytics-testing.md. Never weaken this helper to make a UI test pass:
// opt a specific read-only POST in through `allowPost`, with a reason.
const ANALYTICS_HOSTS = /posthog|\/ingest\b|sentry|vercel-insights|vitals\.vercel|\/_vercel\/(insights|speed-insights)|googletagmanager|google-analytics|googleadservices|doubleclick|facebook\.(net|com)\/tr|clarity\.ms|hotjar/i;
const MONETIZED = /\/api\/[a-z0-9-]+\/go\b|\/api\/outbound\b/i;

async function containAnalytics(context, { allowPost = [], passThrough } = {}) {
  const log = { blocked: [], passed: [] };
  await context.route(/^https?:\/\//, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const write = method !== "GET" && method !== "HEAD" && !allowPost.some((rx) => rx.test(url));
    const reason = write ? "write" : ANALYTICS_HOSTS.test(url) ? "analytics" : MONETIZED.test(url) ? "monetized" : null;
    if (reason) { log.blocked.push({ reason, method, url: url.slice(0, 160) }); return route.abort(); }
    log.passed.push({ method, url: url.slice(0, 160) });
    return passThrough ? passThrough(route) : route.continue();
  });
  return log;
}

function assertContained(log, expect) {
  const leaked = log.passed.filter((r) => (r.method !== "GET" && r.method !== "HEAD") || ANALYTICS_HOSTS.test(r.url) || MONETIZED.test(r.url));
  expect(leaked, "a write, analytics or partner request reached the network").toEqual([]);
}

module.exports = { containAnalytics, assertContained, ANALYTICS_HOSTS, MONETIZED };
