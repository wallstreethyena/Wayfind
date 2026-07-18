// lib/commandCenter/sources/synthetic.js — live self-checks. The serverless
// function probes the production site the way a visitor's browser would and
// reports what it MEASURED: HTTP status, response time, and which security
// headers the edge actually served. No third-party uptime vendor is configured
// yet (that stays an explicit "Not connected" with a recommendation) — but a
// real request with a real latency is honest monitoring, clearly labeled as a
// single-region spot check, not uptime history.

import { memTTL } from "../cache.js";
import { srcOk, srcError, srcMissing } from "../respond.js";
import { SITE_URL } from "../../site.js";
import { rpc, sbAdmin } from "../supabaseAdmin.js";

const NAME = "Synthetic check (this server → production)";

const TARGETS = [
  { key: "home", label: "Homepage", path: "/" },
  { key: "guides", label: "Guides index", path: "/guides" },
  { key: "api_geo", label: "API /api/geo", path: "/api/geo" },
  { key: "api_events", label: "API /api/events", path: "/api/events?lat=27.34&lng=-82.53" },
];

const SEC_HEADERS = [
  { key: "strict-transport-security", label: "HSTS" },
  { key: "content-security-policy", label: "CSP (enforced)" },
  { key: "content-security-policy-report-only", label: "CSP (report-only)" },
  { key: "x-content-type-options", label: "X-Content-Type-Options" },
  { key: "x-frame-options", label: "X-Frame-Options" },
  { key: "referrer-policy", label: "Referrer-Policy" },
  { key: "permissions-policy", label: "Permissions-Policy" },
];

async function probe(url, fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetchImpl(url, { cache: "no-store", redirect: "follow", signal: ctrl.signal, headers: { "user-agent": "wayfind-command-center-selfcheck" } });
    // Read (and discard) a little of the body so TTFB isn't the whole story.
    try { await r.arrayBuffer(); } catch {}
    return { status: r.status, ms: Date.now() - t0, headers: r.headers };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, error: String((e && e.name === "AbortError" ? "timeout" : e && e.message) || "failed") };
  } finally { clearTimeout(timer); }
}

export async function selfCheck(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const base = String(opts.baseUrl || SITE_URL || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return { source: srcError(NAME, "SITE_URL not configured"), data: null };
  try {
    const data = await memTTL(`syn:${Math.floor(Date.now() / 60000)}`, 55 * 1000, async () => {
      const results = await Promise.all(TARGETS.map(async (t) => {
        const p = await probe(base + t.path, fetchImpl, opts.timeoutMs || 6000);
        return { key: t.key, label: t.label, path: t.path, status: p.status, ms: p.ms, ok: p.status >= 200 && p.status < 400, error: p.error || null, _headers: p.headers };
      }));
      const home = results.find((r) => r.key === "home");
      const security = [];
      if (home && home._headers) {
        for (const h of SEC_HEADERS) {
          const v = home._headers.get(h.key);
          security.push({ header: h.label, present: !!v, value: v ? String(v).slice(0, 120) : null });
        }
      }
      for (const r of results) delete r._headers;
      return { checks: results, security, checkedFrom: "serverless (single region)", base };
    });
    return { source: srcOk(NAME, { confidence: "measured", note: "single-region spot check, not uptime history" }), data };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}

// Third-party integration presence — env-configured features, named the way
// lib/envAudit.js names them. Presence of a key ≠ a working provider, so this
// is labeled "configured", with live status only where we actually probed.
export function integrationsStatus(env = process.env) {
  const has = (k) => String(env[k] || "").trim().length > 0;
  const list = [
    { key: "google_maps", label: "Google Maps/Places", configured: has("NEXT_PUBLIC_GOOGLE_MAPS_KEY") },
    { key: "supabase", label: "Supabase (accounts + data)", configured: has("NEXT_PUBLIC_SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY") },
    { key: "posthog_ingest", label: "PostHog ingest (browser)", configured: has("NEXT_PUBLIC_POSTHOG_KEY") },
    { key: "posthog_query", label: "PostHog query (server)", configured: has("POSTHOG_PERSONAL_API_KEY") },
    { key: "sentry", label: "Sentry error monitor", configured: has("NEXT_PUBLIC_SENTRY_DSN") || has("SENTRY_DSN") },
    { key: "sentry_api", label: "Sentry issues API", configured: has("SENTRY_AUTH_TOKEN") },
    { key: "weather", label: "Weather (open-meteo)", configured: true, note: "keyless" },
    { key: "events_providers", label: "Events providers", configured: has("TICKETMASTER_API_KEY") || has("SEATGEEK_CLIENT_ID") || has("EVENTBRITE_PRIVATE_TOKEN") || has("PREDICTHQ_TOKEN") },
    { key: "viator", label: "Viator tours", configured: has("VIATOR_API_KEY") },
    { key: "travelpayouts", label: "Travelpayouts reporting", configured: has("TRAVELPAYOUTS_TOKEN") },
    { key: "pagespeed", label: "PageSpeed CWV cron", configured: has("PAGESPEED_API_KEY") },
    { key: "resend", label: "Email (Resend)", configured: has("RESEND_API_KEY") },
    { key: "vercel_api", label: "Vercel deployments API", configured: has("VERCEL_API_TOKEN") },
  ];
  return { source: srcOk("Environment (server)", { confidence: "measured", note: "presence of server keys; not a liveness probe" }), data: list };
}

// Lab CWV from the cwv_runs table (hourly PageSpeed cron). Empty table is an
// honest state the UI must show as-is: "cron configured but no stored runs
// yet — check CRON_SECRET + PAGESPEED_API_KEY on Vercel".
export async function labCWV(opts = {}) {
  if (!sbAdmin(opts.env)) {
    return { source: srcMissing("PageSpeed cron (cwv_runs)", "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment."), data: null };
  }
  try {
    const rows = await memTTL("labcwv", 10 * 60 * 1000, () => rpc("wf_cc_lab_cwv", {}, opts));
    return { source: srcOk("PageSpeed cron (cwv_runs)", { confidence: "lab" }), data: rows };
  } catch (e) {
    return { source: srcError("PageSpeed cron (cwv_runs)", e && e.message), data: null };
  }
}
