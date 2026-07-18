// lib/commandCenter/sources/sentry.js — error-monitor status. Sentry is wired
// into the app (errors-only, PR #204/#208); reading issue counts back requires
// an auth token, which is optional:
//
//   • With SENTRY_AUTH_TOKEN (org-scoped, Issues:Read): unresolved-issue count
//     + freshest issues for the 24h window.
//   • Without it: labeled Not connected with the exact step + a deep link —
//     PostHog's $exception/app_error counts (posthog.js) still cover the
//     "errors in the last 24 hours" KPI from a second real source.

import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "Sentry";
const NEXT = "Create an org auth token with Issues:Read (Sentry → Settings → Auth Tokens) and add SENTRY_AUTH_TOKEN to the Vercel environment. Dashboard: https://wayfind-llc.sentry.io";

function cfg(env = process.env) {
  const token = String(env.SENTRY_AUTH_TOKEN || "").trim();
  const org = String(env.SENTRY_ORG || "wayfind-llc").trim();
  const project = String(env.SENTRY_PROJECT || "wayfind").trim();
  return token ? { token, org, project } : null;
}

export async function sentryIssues(opts = {}) {
  const c = cfg(opts.env);
  if (!c) return { source: srcMissing(NAME, NEXT, { link: "https://wayfind-llc.sentry.io" }), data: null };
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const data = await memTTL("sentry:issues", 2 * 60 * 1000, async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
      try {
        const r = await fetchImpl(
          `https://sentry.io/api/0/projects/${encodeURIComponent(c.org)}/${encodeURIComponent(c.project)}/issues/?query=is:unresolved&statsPeriod=24h&limit=10`,
          { headers: { Authorization: `Bearer ${c.token}` }, cache: "no-store", signal: ctrl.signal }
        );
        if (!r.ok) throw new Error(`sentry ${r.status}`);
        const rows = await r.json();
        return {
          unresolved_24h: Array.isArray(rows) ? rows.length : 0,
          issues: (rows || []).slice(0, 5).map((x) => ({
            title: String(x.title || "").slice(0, 120),
            count: Number(x.count) || 0,
            users: Number(x.userCount) || 0,
            lastSeen: x.lastSeen,
            link: x.permalink,
          })),
        };
      } finally { clearTimeout(timer); }
    });
    return { source: srcOk(NAME, { link: "https://wayfind-llc.sentry.io" }), data };
  } catch (e) {
    return { source: srcError(NAME, e && e.message, { link: "https://wayfind-llc.sentry.io" }), data: null };
  }
}
