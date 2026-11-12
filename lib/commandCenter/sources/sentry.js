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
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function cfg(env = process.env) {
  const token = String(env.SENTRY_AUTH_TOKEN || "").trim();
  const org = String(env.SENTRY_ORG || "wayfind-llc").trim();
  const project = String(env.SENTRY_PROJECT || "wayfind").trim();
  return token ? { token, org, project, environment: "production" } : null;
}

// A statsPeriod controls the sparkline, not which issues are recent. Keep the
// actual activity window and deploy environment in the search itself. Follow
// cursors only, never a provider-supplied URL with our Authorization header.
export async function readSentryIssues(c, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const url = new URL(`https://sentry.io/api/0/projects/${encodeURIComponent(c.org)}/${encodeURIComponent(c.project)}/issues/`);
  url.search = new URLSearchParams({ query: "is:unresolved lastSeen:-24h", statsPeriod: "24h", environment: c.environment, sort: "date", limit: String(PAGE_SIZE) });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const issues = new Map();
  const cursors = new Set();
  let hasMore = false;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await fetchImpl(url.href, { headers: { Authorization: `Bearer ${c.token}` }, cache: "no-store", signal: ctrl.signal, redirect: "error" });
      if (!r.ok) throw new Error(`sentry ${r.status}`);
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.some((x) => !x || !x.id || typeof x.title !== "string" || !Number.isFinite(Date.parse(x.lastSeen)))) throw new Error("sentry invalid issues payload");
      for (const row of rows) issues.set(String(row.id), row);
      const next = (r.headers.get("link") || "").split(",").find((part) => /rel="next"/.test(part) && /results="true"/.test(part));
      hasMore = !!next;
      if (!next) break;
      const href = next.match(/<([^>]+)>/)?.[1];
      const nextUrl = href ? new URL(href) : null;
      const cursor = nextUrl?.searchParams.get("cursor");
      if (!cursor || nextUrl.origin !== url.origin || nextUrl.pathname !== url.pathname || cursors.has(cursor)) throw new Error("sentry invalid pagination");
      cursors.add(cursor);
      url.searchParams.set("cursor", cursor);
    }
    return {
      unresolved_24h: issues.size,
      unresolved_24h_has_more: hasMore,
      environment: c.environment,
      issues: [...issues.values()].slice(0, 20).map((x) => ({
        id: String(x.id), shortId: String(x.shortId || ""),
        title: String(x.title).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").replace(/https?:\/\/[^\s)]+/gi, "[url]").replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]").slice(0, 120),
        count: Number(x.count) || 0, users: Number(x.userCount) || 0,
        lastSeen: x.lastSeen,
        link: `https://${encodeURIComponent(c.org)}.sentry.io/issues/${encodeURIComponent(x.id)}/`,
      })),
    };
  } finally { clearTimeout(timer); }
}

export async function sentryIssues(opts = {}) {
  const c = cfg(opts.env);
  if (!c) return { source: srcMissing(NAME, NEXT, { link: "https://wayfind-llc.sentry.io" }), data: null };
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const data = await (opts.cacheImpl || memTTL)(`sentry:issues:v2:${c.org}:${c.project}:${c.environment}`, 2 * 60 * 1000, async () => {
      const result = await readSentryIssues(c, { fetchImpl, timeoutMs: opts.timeoutMs });
      // Private runtime diagnostics expose the actionable issues, not tokens,
      // request/user payloads or raw stacks. Keep old issues unresolved until
      // their fixes have actually been checked.
      try { (opts.log || console.info)(JSON.stringify({ tag: "sentry_issue_inventory", ...result })); } catch {}
      return result;
    });
    return { source: srcOk(NAME, { link: "https://wayfind-llc.sentry.io", ...(data._stale ? { confidence: "stale-cache", note: "Sentry unavailable; showing the last successful read" } : {}) }), data };
  } catch (e) {
    return { source: srcError(NAME, e && e.message, { link: "https://wayfind-llc.sentry.io" }), data: null };
  }
}
