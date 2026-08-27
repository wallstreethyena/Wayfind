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
  // NOTE: /api/events is POST-only (verified: GET → 405) — probe the GET-able
  // keyless weather API instead; it also exercises a third-party upstream.
  { key: "api_weather", label: "API /api/weather", path: "/api/weather?lat=27.34&lng=-82.53" },
  // THE ONE THAT WAS MISSING (v8.74). /api/rails is the source of every place
  // card on the homepage, and it is the endpoint behind the owner's own
  // screenshot of an empty rail — twice, weeks apart, found on his phone
  // rather than by anything we run.
  //
  // A STATUS CHECK HERE WOULD BE WORSE THAN NOTHING, which is why this target
  // carries an assertion instead. Every failure mode of this route answers
  // HTTP 200 by design: out-of-coverage is `{covered:false}` 200, the route's
  // own catch is `{covered:false}` 200, and a build that did not complete is
  // `{covered:true, data:{failed:true, places:{}}}` 200. So `status < 400`
  // reports GREEN during precisely the outage it was added to catch. CLAUDE.md
  // states the general rule this is an instance of: assert on the CALL, not on
  // the status code.
  //
  // Bradenton, because that is where the owner reads the site.
  {
    key: "api_rails",
    label: "API /api/rails (place cards)",
    path: "/api/rails?lat=27.4989&lng=-82.5748&v=2",
    assert: assertRailsBody,
    // A cold cache key legitimately rebuilds this from scratch. 20s is
    // railsData's own RAILS_SERVER_DEADLINE_MS: past it the server has stopped
    // waiting too, so this is not an opinion about speed, it is the same
    // deadline read from outside.
    slowMs: 20000,
    // MUST STAY INSIDE THE PANEL'S OWN BUDGET. Both callers of selfCheck run
    // it inside a Promise.all under `export const maxDuration = 30`
    // (app/api/command-center/[panel]/route.js), so a probe allowed to wait
    // the full 30s would take the whole route down with it and the owner's
    // dashboard would fail rather than report. 22s is just past railsData's
    // own 20s deadline — long enough to still MEASURE a healthy-but-slow cold
    // build, with 8s of headroom for everything else on the page.
    timeoutMs: 22000,
    // AND IT MEASURES WHAT A READER ACTUALLY GETS. Every other target sends
    // no-store, which is right for a liveness check. It is wrong here: this
    // endpoint is CDN-cached for an hour by design, so a no-store probe would
    // force a cold metro rebuild on every dashboard load and every hourly
    // cron — spending a rebuild, and timing something no reader experiences.
    // This file's own first line says it probes "the way a visitor's browser
    // would", and a visitor gets the cached copy.
    //
    // The trade-off, stated rather than hidden: a good cached entry can mask a
    // broken REBUILD for up to the hour that entry lives. That is the same
    // granularity the alert cron already runs at, and the failure it must
    // never miss — a reader being served an empty list — is exactly the one
    // this still sees, because it reads the same bytes the reader would.
    cdn: true,
  },
];

/**
 * Does an /api/rails body actually carry place cards?
 *
 * PURE and exported so scripts/check-rails-probe.mjs can run it against real
 * captured payloads — including the ones production returns while failing —
 * rather than trusting that a probe written today still means something.
 *
 * Returns {ok, error, cards, rails} — never throws, whatever it is handed.
 */
export function assertRailsBody(text) {
  let j;
  try { j = JSON.parse(String(text || "")); }
  catch (e) { return { ok: false, error: "body is not JSON (truncated or empty response)", cards: 0, rails: 0 }; }
  if (!j || typeof j !== "object") return { ok: false, error: "body is not an object", cards: 0, rails: 0 };
  // The probe point is inside a covered metro. `covered:false` here is not an
  // honest out-of-coverage answer, it is the route's fail-closed path.
  if (j.covered !== true) return { ok: false, error: "covered:false — the route fell through to its fail-closed path", cards: 0, rails: 0 };
  const d = j.data;
  if (!d || typeof d !== "object") return { ok: false, error: "covered:true with no data payload", cards: 0, rails: 0 };
  if (d.failed === true) return { ok: false, error: "data.failed — the rail build did not complete", cards: 0, rails: 0 };
  const places = d.places && typeof d.places === "object" ? d.places : {};
  const rails = Object.keys(places);
  // v=2 sends id lists; v=1 sends row objects. Count either.
  const cards = rails.reduce((a, k) => a + (Array.isArray(places[k]) ? places[k].length : 0), 0);
  if (!rails.length) return { ok: false, error: "zero rails in the payload", cards: 0, rails: 0 };
  // THE SILENT ONE. 200, covered, no failure flag, and nothing to show. This
  // is the shape a reader experiences as "I clicked and nothing came up", and
  // it is the shape no status check can ever see.
  if (cards < MIN_RAIL_CARDS) return { ok: false, error: `only ${cards} place cards across ${rails.length} rails (expected >= ${MIN_RAIL_CARDS})`, cards, rails: rails.length };
  return { ok: true, error: null, cards, rails: rails.length };
}

// Bradenton returns ~1,500 cards when healthy (measured 2026-08-27). The floor
// is set far below that on purpose: this is a "the lists are empty" detector,
// not an inventory-size opinion that would go red every time the owner
// re-curates. lib/railSelect.js MIN_CARDS is 3 per rail; a metro serving fewer
// than 50 across every rail it has is broken, not thin.
export const MIN_RAIL_CARDS = 50;

const SEC_HEADERS = [
  { key: "strict-transport-security", label: "HSTS" },
  { key: "content-security-policy", label: "CSP (enforced)" },
  { key: "content-security-policy-report-only", label: "CSP (report-only)" },
  { key: "x-content-type-options", label: "X-Content-Type-Options" },
  { key: "x-frame-options", label: "X-Frame-Options" },
  { key: "referrer-policy", label: "Referrer-Policy" },
  { key: "permissions-policy", label: "Permissions-Policy" },
];

async function probe(url, fetchImpl, timeoutMs, assertFn, cdn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetchImpl(url, { cache: cdn ? "default" : "no-store", redirect: "follow", signal: ctrl.signal, headers: { "user-agent": "wayfind-command-center-selfcheck" } });
    // Read the body either way, so TTFB isn't the whole story — and, where the
    // target carries an assertion, so there is something to assert ON. A 200
    // is not evidence that an endpoint answered the question it exists for.
    let body = null;
    try { if (assertFn) body = await r.text(); else await r.arrayBuffer(); } catch (e) {}
    const checked = assertFn ? assertFn(body) : null;
    return { status: r.status, ms: Date.now() - t0, headers: r.headers, checked };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, error: String((e && e.name === "AbortError" ? "timeout" : e && e.message) || "failed") };
  } finally { clearTimeout(timer); }
}

export async function selfCheck(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const base = String(opts.baseUrl || SITE_URL || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return { source: srcError(NAME, "SITE_URL not configured"), data: null };
  try {
    // The base belongs in the cache key. Without it, two selfChecks against
    // DIFFERENT origins in the same minute return the same rows — the second
    // caller silently receives a measurement of somewhere else. Found while
    // writing scripts/check-fetch-deadlines.mjs, where it made an assertion
    // pass vacuously by never running the probe at all.
    const data = await memTTL(`syn:${base}:${Math.floor(Date.now() / 60000)}`, 55 * 1000, async () => {
      const results = await Promise.all(TARGETS.map(async (t) => {
        const p = await probe(base + t.path, fetchImpl, t.timeoutMs || opts.timeoutMs || 6000, t.assert, !!t.cdn);
        // `ok` is status AND assertion. A target with an assertion that fails
        // is NOT ok, whatever the status line said — that is the whole point
        // of adding one.
        const httpOk = p.status >= 200 && p.status < 400;
        const bodyOk = !p.checked || p.checked.ok === true;
        return {
          key: t.key, label: t.label, path: t.path, status: p.status, ms: p.ms,
          ok: httpOk && bodyOk,
          error: p.error || (httpOk && !bodyOk ? p.checked.error : null),
          // Per-target slow budget. /api/rails cold-builds a metro and is
          // legitimately slower than /api/geo; holding it to the same 3s would
          // page the owner every hour for correct behaviour, and a guard that
          // fires on correct code gets switched off (CLAUDE.md).
          slowMs: t.slowMs || null,
          detail: p.checked ? { cards: p.checked.cards, rails: p.checked.rails } : null,
          _headers: p.headers,
        };
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

// Data freshness watchdog — per-pipeline "when did this cron last actually
// write a row", not just "did it respond 200". A cron can be reachable and
// exception-free while its write path silently fails (fields mask, schema
// drift, upstream returning empty) — this is the only check in the Command
// Center that would catch that class of failure, so it reads real table
// timestamps rather than cron invocation history.
export async function dataFreshness(opts = {}) {
  if (!sbAdmin(opts.env)) {
    return { source: srcMissing("Data freshness (cron pipelines)", "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment."), data: null };
  }
  try {
    const rows = await memTTL("datafreshness", 10 * 60 * 1000, () => rpc("wf_cc_data_freshness", {}, opts));
    return { source: srcOk("Data freshness (cron pipelines)", { confidence: "measured" }), data: rows };
  } catch (e) {
    return { source: srcError("Data freshness (cron pipelines)", e && e.message), data: null };
  }
}
