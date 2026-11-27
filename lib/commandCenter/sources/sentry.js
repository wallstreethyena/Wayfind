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

// WAYFIND-1M (2026-11-27): "SyntaxError: Unexpected token '{'" paged the owner
// as a bare title with count 20, users 0 and nothing else. A parse error has no
// useful stack, so the title alone cannot say whose script failed, in which
// browser, on which page. The latest event of each listed issue carries that:
// browser + version, OS, page path, the early-buffer source tags the client
// shim records (lib/sentryShared.earlyErrorContext) and the top frame. Read it
// for the first few issues, best-effort, on the same fail-closed request rules
// as the list (no redirects, our own URL only). Values are reduced to short
// labels: a page PATH (never the query or host), a script file NAME and the
// browser/OS labels. Nothing personal and no request payload is kept.
const LATEST_MAX = 3;
const label = (v, n = 60) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");
function pathOnly(v) {
  const raw = label(v, 300);
  if (!raw) return "";
  try { return new URL(raw, "https://placeholder.invalid").pathname.slice(0, 120); } catch { return ""; }
}
function fileName(v) {
  const raw = label(v, 300);
  if (!raw) return "";
  let host = "", path = raw;
  try { const u = new URL(raw); host = u.host; path = u.pathname; } catch {}
  const name = path.split("/").filter(Boolean).pop() || "";
  return (host && !/gowayfind\.com$/i.test(host) ? host + "/" : "") + name.slice(0, 80);
}
export function summarizeSentryEvent(ev) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return null;
  const tags = new Map((Array.isArray(ev.tags) ? ev.tags : []).filter((t) => t && typeof t.key === "string").map((t) => [t.key, t.value]));
  const ctx = ev.context && typeof ev.context === "object" ? ev.context : {};
  const exc = (Array.isArray(ev.entries) ? ev.entries : []).find((e) => e && e.type === "exception");
  const values = (exc && exc.data && Array.isArray(exc.data.values)) ? exc.data.values : [];
  const frames = values.flatMap((v) => (v && v.stacktrace && Array.isArray(v.stacktrace.frames)) ? v.stacktrace.frames : []);
  const top = frames.length ? frames[frames.length - 1] : null;
  const out = {
    browser: label(tags.get("browser")),
    os: label(tags.get("os") || tags.get("client_os")),
    device: label(tags.get("device")),
    page: pathOnly(tags.get("url") || (ev.request && ev.request.url)),
    early_source: label(tags.get("early_source"), 12),
    early_file: fileName(ctx.early_filename),
    early_line: Number.isFinite(Number(ctx.early_lineno)) && ctx.early_lineno !== null ? Number(ctx.early_lineno) : null,
    top_frame: top ? [fileName(top.abs_path || top.filename), label(top.function, 40)].filter(Boolean).join(" ") : "",
    seen: Number.isFinite(Date.parse(ev.dateCreated)) ? ev.dateCreated : "",
  };
  for (const k of Object.keys(out)) if (out[k] === "" || out[k] === null) delete out[k];
  return Object.keys(out).length ? out : null;
}
export async function describeLatestEvents(c, issues, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const list = Array.isArray(issues) ? issues.slice(0, LATEST_MAX) : [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await Promise.all(list.map(async (issue) => {
      if (!issue || !/^\d{1,20}$/.test(String(issue.id))) return issue;
      try {
        const url = `https://sentry.io/api/0/organizations/${encodeURIComponent(c.org)}/issues/${encodeURIComponent(issue.id)}/events/latest/`;
        const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${c.token}` }, cache: "no-store", signal: ctrl.signal, redirect: "error" });
        if (!r.ok) return issue;
        const latest = summarizeSentryEvent(await r.json());
        return latest ? { ...issue, latest } : issue;
      } catch { return issue; }
    }));
  } finally { clearTimeout(timer); }
}

export async function sentryIssues(opts = {}) {
  const c = cfg(opts.env);
  if (!c) return { source: srcMissing(NAME, NEXT, { link: "https://wayfind-llc.sentry.io" }), data: null };
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const data = await (opts.cacheImpl || memTTL)(`sentry:issues:v2:${c.org}:${c.project}:${c.environment}`, 2 * 60 * 1000, async () => {
      const result = await readSentryIssues(c, { fetchImpl, timeoutMs: opts.timeoutMs });
      if (result.issues.length) {
        const described = await describeLatestEvents(c, result.issues, { fetchImpl, timeoutMs: opts.latestTimeoutMs });
        result.issues = described.concat(result.issues.slice(described.length));
      }
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
