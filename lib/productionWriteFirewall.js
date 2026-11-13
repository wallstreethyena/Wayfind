// lib/productionWriteFirewall.js — Fail-closed production write firewall & synthetic traffic gate.
//
// ARCHITECTURAL INVARIANT:
//   Production mutations (Supabase customer/attribution/analytics/commerce/inventory/event
//   writes, PostHog server capture, Meta CAPI, Google conversion uploads, outbound emails,
//   and webhooks) require an EXPLICIT verified production execution identity AND a
//   non-synthetic request identity AND a clean non-fixture payload.
//
//   Tests, guards, Vercel `npm run prebuild` / SSG build containers, preview deployments,
//   CI runners, local scripts, and synthetic monitors FAIL CLOSED — even when a developer
//   or guard script deletes `WF_SUPPRESS_ANALYTICS` while real production credentials are
//   present in `process.env`.

import { isSyntheticMonitor, isInternalVerifier } from "./crawler.js";

const LIVE_SUPABASE_HOST_RX = /^[a-z0-9]{20}\.supabase\.co$/i;

const TEST_OR_GUARD_SCRIPT_RX =
  /(?:^|[\\/])scripts[\\/](?:check-|test-|run-guards|run-synthetic-monitor|watchdog-|verify-synthetic-|reconcile-migrations|ops-nervous-system-report)/i;

const ALLOWLISTED_SCHEDULED_WRITER_RX =
  /(?:^|[\\/])scripts[\\/](?:record-workflow-pulse|photo-repair-worker|guide-visual-monitor|native-trends-collect|apply-migration|seed-owned-hours|festivals[\\/]publish)\.mjs$/i;

// PostgREST RPCs known to be strictly read-only / diagnostic (no customer/attribution writes).
// Any unlisted RPC defaults to MUTATION (fail closed).
export const READ_ONLY_SUPABASE_RPCS = new Set([
  "wf_migration_ledger_hashes",
  "wf_schema_objects",
  "wf_schema_audit",
  "wf_rpc_signatures",
  "wf_privileged_rpc_contract",
  "wf_client_permissions",
  "wf_best_picks",
  "wf_buzz_picks",
  "wf_things_to_do",
  "wf_nearest_beaches",
  "wf_cuisine_chips",
  "wf_gate_status",
  "wf_job_health",
  "wf_popularity_stale_batch",
  "wf_scout_candidates",
  "wf_search_documents_query",
  "wf_cc_excluded_users",
  "wf_cc_excluded_devices",
]);

// Known synthetic / fixture offer IDs and payload signatures that must NEVER be written
// into live production tables under any execution identity.
export const SYNTHETIC_OFFER_ID_RX =
  /^(?:1234P5|guardtest[-_a-z0-9]*|fixture[-_a-z0-9]*|test[-_]offer[-_a-z0-9]*|dummy[-_a-z0-9]*)$/i;
export const SYNTHETIC_CAMPAIGN_RX = /(?:^|-)1234p5$|\bguardtest\b|\bsynthetic[-_]fixture\b/i;
export const SYNTHETIC_CONTENT_RX =
  /^(?:guardtest|claude-verify|codex-verify|synthetic-probe|c_fixture_|test-fixture)/i;
export const FAKE_EMAIL_DOMAIN_RX =
  /@(?:example\.(?:com|org|net)|test\.invalid|invalid|localhost|fake\.test)$/i;
export const LOOPBACK_OR_TEST_URL_RX =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/]*\.(?:test|invalid|example))(?:[:/]|$)/i;
export const PLACEHOLDER_SECRET_RX =
  /(?:guardtest-fake-|e2e-placeholder-|phc_guard(?:_stub|test)|not-a-real-key)/i;
export const SYNTHETIC_PLACE_ID_RX =
  /^(?:test[-_]|fixture[-_]|fake[-_]|ChIJ_TEST|ChIJ000000|guardtest[-_])/i;

export const OPERATOR_WRITE_CAPABILITY_TOKEN = "ALLOW_EXPLICIT_OPERATOR_WRITE";

const firewallState = {
  blockedTotal: 0,
  blockedByReason: Object.create(null),
  blockedBySurface: Object.create(null),
  recentBlocked: [],
};

function bumpBlocked({ reason, surface, table, target }) {
  firewallState.blockedTotal += 1;
  const r = String(reason || "unknown");
  const s = String(surface || table || "unknown");
  firewallState.blockedByReason[r] = (firewallState.blockedByReason[r] || 0) + 1;
  firewallState.blockedBySurface[s] = (firewallState.blockedBySurface[s] || 0) + 1;
  if (firewallState.recentBlocked.length >= 25) {
    firewallState.recentBlocked.shift();
  }
  firewallState.recentBlocked.push({
    at: new Date().toISOString(),
    reason: r,
    surface: s,
    table: table ? String(table).slice(0, 64) : null,
    target: target ? String(target).slice(0, 80) : null,
  });
}

export function getFirewallTelemetry() {
  return {
    blockedTotal: firewallState.blockedTotal,
    blockedByReason: { ...firewallState.blockedByReason },
    blockedBySurface: { ...firewallState.blockedBySurface },
    recentBlocked: [...firewallState.recentBlocked],
  };
}

export function resetFirewallTelemetryForTests() {
  firewallState.blockedTotal = 0;
  firewallState.blockedByReason = Object.create(null);
  firewallState.blockedBySurface = Object.create(null);
  firewallState.recentBlocked = [];
}

function headerGet(headers, name) {
  if (!headers) return "";
  try {
    if (typeof headers.get === "function") {
      const v = headers.get(name);
      return v == null ? "" : String(v).trim();
    }
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (String(k).toLowerCase() === lower && v != null) return String(v).trim();
    }
  } catch {}
  return "";
}

function parseCookieMap(cookieHeader) {
  const out = Object.create(null);
  if (!cookieHeader) return out;
  for (const part of String(cookieHeader).split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/**
 * First-class synthetic traffic classifier (Mission 17).
 * Accepts a Fetch `Request`, a `{ headers, url }` object, or a `Headers` object.
 */
export function classifySyntheticTraffic(reqOrHeaders, opts = {}) {
  const headers =
    reqOrHeaders && typeof reqOrHeaders.get !== "function" && reqOrHeaders.headers
      ? reqOrHeaders.headers
      : reqOrHeaders;
  const reqUrl =
    opts.url ||
    (reqOrHeaders && typeof reqOrHeaders.url === "string" ? reqOrHeaders.url : "");

  const synthHeader = headerGet(headers, "x-wf-synthetic").toLowerCase();
  if (synthHeader && synthHeader !== "0" && synthHeader !== "false") {
    return {
      synthetic: true,
      reason: "x-wf-synthetic-header",
      preservePartnerRedirect: synthHeader === "monitor" || synthHeader === "link-check",
    };
  }

  if (headerGet(headers, "x-wayfind-qa") === "1") {
    return { synthetic: true, reason: "x-wayfind-qa-header", preservePartnerRedirect: false };
  }

  const ua = headerGet(headers, "user-agent");
  if (ua) {
    if (isSyntheticMonitor(ua)) {
      return {
        synthetic: true,
        reason: "synthetic-monitor-ua",
        preservePartnerRedirect: true,
      };
    }
    if (isInternalVerifier(ua)) {
      return {
        synthetic: true,
        reason: "internal-verifier-ua",
        preservePartnerRedirect: true,
      };
    }
    if (/WayfindQA\/|WayfindSynthetic/i.test(ua)) {
      return { synthetic: true, reason: "qa-user-agent", preservePartnerRedirect: false };
    }
  }

  const cookies = parseCookieMap(headerGet(headers, "cookie"));
  if (cookies.__wf_synthetic === "1" || cookies.wf_synthetic === "1" || cookies.wf_qa === "1") {
    return { synthetic: true, reason: "synthetic-cookie", preservePartnerRedirect: false };
  }
  if (cookies.wf_attr) {
    try {
      const decoded = JSON.parse(decodeURIComponent(cookies.wf_attr));
      if (decoded && (decoded.is_test === true || decoded.synthetic === true)) {
        return { synthetic: true, reason: "wf-attr-test-cookie", preservePartnerRedirect: false };
      }
    } catch {}
  }

  if (reqUrl) {
    try {
      const u = new URL(reqUrl, "https://www.gowayfind.com");
      const ws = (u.searchParams.get("wf_synthetic") || "").trim().toLowerCase();
      if (ws && ws !== "0" && ws !== "false") {
        return { synthetic: true, reason: "wf-synthetic-param", preservePartnerRedirect: false };
      }
      if ((u.searchParams.get("wf_test") || "").trim()) {
        return { synthetic: true, reason: "wf-test-param", preservePartnerRedirect: false };
      }
    } catch {}
  }

  return { synthetic: false, reason: null, preservePartnerRedirect: false };
}

export function isSyntheticRequest(reqOrHeaders, opts) {
  return classifySyntheticTraffic(reqOrHeaders, opts).synthetic;
}

/**
 * Determine whether the current Node/Edge process has an explicit, verified
 * production write execution identity. Fails closed on any ambiguity.
 */
export function classifyExecutionIdentity({
  env = typeof process !== "undefined" && process.env ? process.env : {},
  argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [],
} = {}) {
  const entryScript = String(argv[1] || "");

  // 1. Hard non-production vetoes — evaluated FIRST, override everything.
  if (String(env.WF_FORCE_NON_PRODUCTION || "").trim() === "1") {
    return { mode: "FORCED_NON_PRODUCTION", allowLiveWrites: false, reason: "forced-non-production" };
  }
  if (String(env.WF_GUARD_SUITE || "").trim() === "1") {
    return { mode: "GUARD_SUITE", allowLiveWrites: false, reason: "guard-suite-env" };
  }
  if (
    String(env.NODE_ENV || "").trim() === "test" ||
    Boolean(env.NODE_TEST_CONTEXT) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(entryScript)
  ) {
    return { mode: "TEST_PROCESS", allowLiveWrites: false, reason: "node-test-context" };
  }
  if (TEST_OR_GUARD_SCRIPT_RX.test(entryScript)) {
    return { mode: "TEST_OR_GUARD_SCRIPT", allowLiveWrites: false, reason: "guard-or-test-entrypoint" };
  }

  const nextPhase = String(env.NEXT_PHASE || "").trim();
  const npmEvent = String(env.npm_lifecycle_event || "").trim();
  if (
    nextPhase === "phase-production-build" ||
    npmEvent === "prebuild" ||
    npmEvent === "build"
  ) {
    return { mode: "BUILD_CONTAINER", allowLiveWrites: false, reason: "build-or-prebuild-phase" };
  }

  const vercelEnv = String(env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnv === "preview" || vercelEnv === "development") {
    return {
      mode: vercelEnv === "preview" ? "PREVIEW_RUNTIME" : "DEV_RUNTIME",
      allowLiveWrites: false,
      reason: `vercel-${vercelEnv}-runtime`,
    };
  }

  // 2. Positive explicit production execution identities.
  if (vercelEnv === "production") {
    return { mode: "PRODUCTION_RUNTIME", allowLiveWrites: true, reason: "vercel-production-runtime" };
  }

  if (
    String(env.GITHUB_ACTIONS || "").trim() === "true" &&
    (env.GITHUB_EVENT_NAME === "schedule" ||
      (env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_REF === "refs/heads/main")) &&
    ALLOWLISTED_SCHEDULED_WRITER_RX.test(entryScript)
  ) {
    return {
      mode: "AUTHORIZED_SCHEDULED_JOB",
      allowLiveWrites: true,
      reason: "github-scheduled-maintenance",
    };
  }

  if (
    String(env.WF_PRODUCTION_WRITE_CAPABILITY || "").trim() === OPERATOR_WRITE_CAPABILITY_TOKEN
  ) {
    return {
      mode: "AUTHORIZED_OPERATOR_CLI",
      allowLiveWrites: true,
      reason: "explicit-operator-capability",
    };
  }

  // 3. Default: fail closed (covers local dev, ad-hoc scripts with .env.local, PR CI, etc.).
  return {
    mode: "UNVERIFIED_EXECUTION_CONTEXT",
    allowLiveWrites: false,
    reason: "missing-production-execution-identity",
  };
}

/**
 * Distinguish real live external write targets from hermetic mock/fixture hosts.
 */
export function classifyWriteTarget(rawUrl, method = "GET", env = process.env) {
  const m = String(method || "GET").toUpperCase();
  if (!rawUrl) {
    return { isLiveTarget: false, isMutation: m !== "GET" && m !== "HEAD" && m !== "OPTIONS", kind: "none" };
  }
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    return { isLiveTarget: false, isMutation: false, kind: "invalid-url" };
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname || "/";

  // Hermetic / local / mock test hosts are NEVER live production targets.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".test") ||
    host.endsWith(".invalid") ||
    host.endsWith(".example") ||
    host === "example.com" ||
    host === "example.org" ||
    host === "example.supabase.co"
  ) {
    return { isLiveTarget: false, isMutation: false, kind: "hermetic-mock-host", host };
  }

  // Real Supabase project refs are 20 lowercase alphanumeric chars (zero hyphens).
  // Test fixtures like `guardtest-fake-project.supabase.co` or `viator-attr-test.supabase.co`
  // contain hyphens and are non-live mock hosts.
  const configuredSbHost = (() => {
    try {
      const u = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "").trim();
      return u ? new URL(u).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  })();

  const isLiveSupabaseHost = host.endsWith(".supabase.co")
    ? LIVE_SUPABASE_HOST_RX.test(host)
    : Boolean(
        configuredSbHost &&
          host === configuredSbHost &&
          !/(?:^|[.-])(?:fixture|mock|fake|test|guardtest|example)(?:[.-]|$)/i.test(host),
      );

  if (isLiveSupabaseHost) {
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") {
      return { isLiveTarget: true, isMutation: false, kind: "supabase-read", host };
    }
    const rpcMatch = pathname.match(/^\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)/);
    if (rpcMatch) {
      const rpcName = rpcMatch[1];
      if (READ_ONLY_SUPABASE_RPCS.has(rpcName) || rpcName.startsWith("wf_cc_")) {
        return { isLiveTarget: true, isMutation: false, kind: "supabase-readonly-rpc", host, table: rpcName };
      }
      return { isLiveTarget: true, isMutation: true, kind: "supabase-mutating-rpc", host, table: `rpc:${rpcName}` };
    }
    const tableMatch = pathname.match(/^\/rest\/v1\/([^/?]+)/);
    if (tableMatch) {
      return { isLiveTarget: true, isMutation: true, kind: "supabase-rest-write", host, table: tableMatch[1] };
    }
    if (pathname.startsWith("/storage/v1/") || pathname.startsWith("/auth/v1/admin")) {
      return { isLiveTarget: true, isMutation: true, kind: "supabase-admin-write", host, table: pathname };
    }
    return { isLiveTarget: true, isMutation: true, kind: "supabase-write", host, table: pathname };
  }

  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    if (host.endsWith(".posthog.com") || host === "posthog.com") {
      return { isLiveTarget: true, isMutation: true, kind: "posthog-capture", host, table: "posthog" };
    }
    if (host === "graph.facebook.com" && /\/events\b/.test(pathname)) {
      return { isLiveTarget: true, isMutation: true, kind: "meta-capi", host, table: "meta_capi" };
    }
    if (/^(?:datamanager|googleads)\.google[a]pis\.com$/i.test(host)) {
      return { isLiveTarget: true, isMutation: true, kind: "google-conversions", host, table: "google_ads" };
    }
    if (host === "api.resend.com") {
      return { isLiveTarget: true, isMutation: true, kind: "resend-email", host, table: "resend_email" };
    }
  }

  return { isLiveTarget: false, isMutation: false, kind: "external-other", host };
}

function validateSinglePayloadRow(row, table = "") {
  if (!row || typeof row !== "object") return null;

  const offerId = row.offer_id ?? row.offerId ?? "";
  if (offerId && SYNTHETIC_OFFER_ID_RX.test(String(offerId).trim())) {
    return `synthetic-offer-id:${String(offerId).trim().slice(0, 32)}`;
  }

  const campaign =
    row.placement_campaign ?? row.campaign ?? row.observed_utm_campaign ?? "";
  if (campaign && SYNTHETIC_CAMPAIGN_RX.test(String(campaign).trim())) {
    return "synthetic-campaign-marker";
  }

  if (row.is_test === true || row.synthetic === true || row.traffic_class === "synthetic") {
    return "explicit-synthetic-flag";
  }

  if (String(row.surface || "").trim().toLowerCase() === "qa") {
    return "qa-surface-row";
  }

  for (const field of ["content_id", "contentId", "client_click_id", "clientClickId"]) {
    const val = row[field];
    if (typeof val === "string" && SYNTHETIC_CONTENT_RX.test(val.trim())) {
      return `synthetic-${field}`;
    }
  }

  for (const emailField of ["email", "contact_email", "voter_email", "owner_email"]) {
    const val = row[emailField];
    if (typeof val === "string" && FAKE_EMAIL_DOMAIN_RX.test(val.trim())) {
      return `fake-email-domain:${emailField}`;
    }
  }

  for (const urlField of ["destination_url", "short_url", "website", "ticket_url", "source_url", "url"]) {
    const val = row[urlField];
    if (typeof val === "string" && LOOPBACK_OR_TEST_URL_RX.test(val.trim())) {
      return `loopback-or-test-url:${urlField}`;
    }
  }

  const placeId = row.place_id ?? row.placeId ?? "";
  if (placeId && SYNTHETIC_PLACE_ID_RX.test(String(placeId).trim())) {
    return "synthetic-place-id";
  }

  if (row.lat !== undefined || row.lng !== undefined) {
    const hasLat = row.lat !== null && row.lat !== undefined;
    const hasLng = row.lng !== null && row.lng !== undefined;
    if (hasLat || hasLng) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180 ||
        (lat === 0 && lng === 0)
      ) {
        return "impossible-coordinates";
      }
    }
  }

  // Reject placeholder keys accidentally serialized into config/settings rows.
  if (table && /settings|config|links/i.test(table)) {
    const raw = JSON.stringify(row);
    if (PLACEHOLDER_SECRET_RX.test(raw)) {
      return "placeholder-secret-in-payload";
    }
  }

  return null;
}

/**
 * Data-quality firewall for outgoing production payloads (Mission 18).
 */
export function validateProductionWritePayload({ table = "", payload } = {}) {
  if (payload == null) return { ok: true, reason: null };
  let parsed = payload;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return { ok: true, reason: null };
    if (PLACEHOLDER_SECRET_RX.test(trimmed)) {
      return { ok: false, reason: "placeholder-secret-in-payload" };
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: true, reason: null };
    }
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  for (const r of rows) {
    const violation = validateSinglePayloadRow(r, table);
    if (violation) {
      return { ok: false, reason: violation };
    }
  }
  return { ok: true, reason: null };
}

/**
 * Evaluate whether a write operation is permitted to execute against live production.
 *
 * Hermetic unit tests that inject an explicit mock `fetch`/`store` or point at a
 * non-live mock host (`example.supabase.co`, `*-test.supabase.co`, `fixture.invalid`)
 * are allowed to exercise unit logic in memory, EXCEPT that known production-polluting
 * fixture offer IDs (`1234P5`) and explicit `x-wf-synthetic` requests are always blocked
 * on customer/attribution surfaces.
 */
export function evaluateProductionWrite({
  surface = "unknown",
  table = "",
  method = "POST",
  targetUrl = "",
  payload = null,
  req = null,
  headers = null,
  hasExplicitTestDouble = false,
  env = typeof process !== "undefined" && process.env ? process.env : {},
  argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [],
} = {}) {
  // 1. Request-level synthetic traffic is NEVER allowed to mutate customer/attribution state.
  if (req || headers) {
    const synth = classifySyntheticTraffic(req || headers);
    if (synth.synthetic) {
      bumpBlocked({ reason: `synthetic-request:${synth.reason}`, surface, table, target: targetUrl });
      return {
        allowed: false,
        reason: `synthetic-request:${synth.reason}`,
        mode: "SYNTHETIC_REQUEST",
      };
    }
  }

  // 2. Always reject the known `1234P5` Viator contamination fixture even before network resolution.
  if (payload && typeof payload === "object") {
    const rows = Array.isArray(payload) ? payload : [payload];
    for (const r of rows) {
      const offer = r && (r.offer_id ?? r.offerId);
      if (offer && String(offer).trim().toUpperCase() === "1234P5") {
        bumpBlocked({ reason: "fixture-offer-1234P5", surface, table, target: targetUrl });
        return { allowed: false, reason: "fixture-offer-1234P5", mode: "PAYLOAD_FIREWALL" };
      }
    }
  }

  // 3. If caller supplied an explicit hermetic mock (`deps.fetch` / `deps.store`) AND
  //    the target URL is NOT a live production host, allow hermetic unit test execution.
  const target = targetUrl
    ? classifyWriteTarget(targetUrl, method, env)
    : { isLiveTarget: !hasExplicitTestDouble, isMutation: true, kind: "domain-write" };

  if (!target.isLiveTarget && hasExplicitTestDouble) {
    return { allowed: true, reason: "hermetic-test-double", mode: "HERMETIC_UNIT_TEST" };
  }
  if (targetUrl && (!target.isLiveTarget || !target.isMutation)) {
    return { allowed: true, reason: "non-live-or-readonly-target", mode: "READ_OR_MOCK" };
  }

  // 4. Live target write: enforce fail-closed execution identity!
  const identity = classifyExecutionIdentity({ env, argv });
  if (!identity.allowLiveWrites) {
    bumpBlocked({
      reason: `execution-identity:${identity.reason}`,
      surface,
      table: table || target.table,
      target: target.host || targetUrl,
    });
    return {
      allowed: false,
      reason: `execution-identity:${identity.reason}`,
      mode: identity.mode,
    };
  }

  // 5. Payload data-quality firewall on all live writes!
  const quality = validateProductionWritePayload({
    table: table || target.table || "",
    payload,
  });
  if (!quality.ok) {
    bumpBlocked({
      reason: `payload-quality:${quality.reason}`,
      surface,
      table: table || target.table,
      target: target.host || targetUrl,
    });
    return {
      allowed: false,
      reason: `payload-quality:${quality.reason}`,
      mode: "PAYLOAD_FIREWALL",
    };
  }

  return { allowed: true, reason: identity.reason, mode: identity.mode };
}

export function shouldAllowProductionWrite(opts) {
  return evaluateProductionWrite(opts).allowed;
}

/**
 * Universal network egress write guard wrapping `globalThis.fetch` idempotently.
 * Note: Unit tests that replace `globalThis.fetch` with a mock intercept BEFORE
 * reaching this wrapper; tests that forward unhandled URLs to `originalFetch`
 * (the exact vector that leaked 2,760 `1234P5` rows into live Supabase!) hit
 * this wrapper and fail closed before opening a network socket.
 */
function isRealRuntimeFetch(fn) {
  if (typeof fn !== "function") return false;
  if (fn.__wfIsSocketSpy === true) return true;
  if (fn.name !== "fetch") return false;
  const src = String(fn);
  return src.includes("if (!fetchImpl)") || src.includes("[native code]");
}

export function installProductionWriteFetchGuard() {
  if (typeof globalThis === "undefined" || typeof globalThis.fetch !== "function") {
    return false;
  }
  if (globalThis.fetch.__wfFirewallWrapped === true) {
    return true;
  }
  if (!isRealRuntimeFetch(globalThis.fetch)) {
    return false;
  }
  const nativeFetch = globalThis.fetch;
  const guardedFetch = async function wfGuardedFetch(input, init) {
    let url = "";
    let method = (init && init.method) || "GET";
    try {
      if (typeof input === "string" || input instanceof URL) {
        url = String(input);
      } else if (input && typeof input === "object" && typeof input.url === "string") {
        url = input.url;
        if (!init?.method && input.method) method = input.method;
      }
    } catch {}

    const target = classifyWriteTarget(url, method);
    if (target.isLiveTarget && target.isMutation) {
      const verdict = evaluateProductionWrite({
        surface: `fetch:${target.kind}`,
        table: target.table || "",
        method,
        targetUrl: url,
        payload: init && init.body ? init.body : null,
      });
      if (!verdict.allowed) {
        if (
          typeof process !== "undefined" &&
          process.env &&
          process.env.WF_FIREWALL_STRICT_THROW === "1"
        ) {
          throw new Error(
            `[ProductionWriteFirewall] Blocked live write (${verdict.reason}) to ${target.host || url}`,
          );
        }
        return new Response(
          JSON.stringify({
            error: "production_write_blocked",
            blocked: true,
            reason: verdict.reason,
            mode: verdict.mode,
          }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "X-Wayfind-Write-Firewall": `blocked; reason=${verdict.reason}`,
            },
          },
        );
      }
    }

    return nativeFetch.call(this, input, init);
  };

  Object.defineProperty(guardedFetch, "__wfFirewallWrapped", {
    value: true,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(guardedFetch, "__wfNativeFetch", {
    value: nativeFetch,
    enumerable: false,
    configurable: false,
  });

  globalThis.fetch = guardedFetch;
  return true;
}

// Auto-install on module import so any process loading any firewall-protected module
// automatically guards underlying native fetch sockets as well.
installProductionWriteFetchGuard();
