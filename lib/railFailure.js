// One client-side failure contract for reader-facing discovery rails.
//
// This does not repair an upstream Supabase/provider outage. It keeps a transient
// outage from looking like an empty town or an endless skeleton, while keeping
// Wayfind's own 4xx/schema bugs visibly different from provider trouble.
//
// Contract:
//   retryable transport/408/429/5xx -> exactly one jittered retry -> degraded
//   caller navigation/unmount       -> cancelled immediately, never surfaced
//   4xx or malformed JSON/payload   -> developer error, never auto-retried
// Healthy empty JSON is still a success; callers decide how to render emptiness.

export const RAIL_FAILURE_KIND = Object.freeze({
  DEGRADED: "degraded",
  DEVELOPER: "developer",
  CANCELLED: "cancelled",
});

export const RAIL_RETRY_MIN_MS = 120;
export const RAIL_RETRY_MAX_MS = 260;

const nowMs = () => Date.now();

function newRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `rail-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function railRoute(url) {
  try { return new URL(String(url || ""), "https://wayfind.local").pathname || "/"; }
  catch { return String(url || "").split("?")[0] || "/"; }
}

export function classifyRailFailure({ status = null, network = false, timeout = false, cancelled = false } = {}) {
  if (cancelled) return { kind: RAIL_FAILURE_KIND.CANCELLED, reason: "cancelled", retryable: false };
  if (timeout) return { kind: RAIL_FAILURE_KIND.DEGRADED, reason: "timeout", retryable: true };
  if (network) return { kind: RAIL_FAILURE_KIND.DEGRADED, reason: "network", retryable: true };
  const code = Number(status);
  if (code === 408 || code === 429 || code >= 500) {
    return { kind: RAIL_FAILURE_KIND.DEGRADED, reason: `http_${code}`, retryable: true };
  }
  if (code >= 400 && code < 500) {
    return { kind: RAIL_FAILURE_KIND.DEVELOPER, reason: `http_${code}`, retryable: false };
  }
  return { kind: RAIL_FAILURE_KIND.DEVELOPER, reason: code ? `http_${code}` : "invalid_response", retryable: false };
}

export class RailFailure extends Error {
  constructor(message, { kind, reason, status = null, retryAttempts = 0, requestId = "", route = "/", cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "RailFailure";
    this.kind = kind;
    this.reason = reason;
    this.status = status == null ? null : Number(status);
    this.retryAttempts = Number(retryAttempts) || 0;
    this.requestId = String(requestId || newRequestId());
    this.route = String(route || "/");
  }
}

export function railDeveloperFailure(reason = "invalid_payload", meta = {}) {
  return new RailFailure(`Rail payload error: ${reason}`, {
    kind: RAIL_FAILURE_KIND.DEVELOPER,
    reason,
    retryAttempts: meta.retryAttempts || 0,
    requestId: meta.requestId || newRequestId(),
    route: meta.route || "/",
    status: meta.status ?? null,
    cause: meta.cause || null,
  });
}

export function isRailCancelled(error) {
  return error?.kind === RAIL_FAILURE_KIND.CANCELLED || error?.name === "AbortError";
}

function abortError(meta) {
  return new RailFailure("Rail request cancelled", {
    ...meta,
    kind: RAIL_FAILURE_KIND.CANCELLED,
    reason: "cancelled",
  });
}

function retryDelay(random = Math.random) {
  const span = RAIL_RETRY_MAX_MS - RAIL_RETRY_MIN_MS;
  return RAIL_RETRY_MIN_MS + Math.floor(Math.max(0, Math.min(0.999999, Number(random()) || 0)) * (span + 1));
}

export function abortableSleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError({ requestId: newRequestId(), route: "/" }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, ms));
    function cleanup() { if (signal) signal.removeEventListener("abort", onAbort); }
    function done() { cleanup(); resolve(); }
    function onAbort() { clearTimeout(timer); cleanup(); reject(abortError({ requestId: newRequestId(), route: "/" })); }
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Both attempts share timeoutMs. Keep the first attempt's existing deadline;
// only a failure that leaves time can retry. Reserving 30% for a retry would
// newly abort healthy responses between 7 and 10 seconds.
export async function fetchRailJson(url, {
  timeoutMs = 10000,
  signal = null,
  fetchImpl = globalThis.fetch,
  random = Math.random,
  sleepImpl = abortableSleep,
  requestId = "",
  ...init
} = {}) {
  const route = railRoute(url);
  let activeRequestId = String(requestId || newRequestId());
  const started = nowMs();
  const deadline = started + Math.max(250, Number(timeoutMs) || 10000);

  if (signal?.aborted) throw abortError({ requestId: activeRequestId, route, retryAttempts: 0 });

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw abortError({ requestId: activeRequestId, route, retryAttempts: attempt });
    const remaining = deadline - nowMs();
    if (remaining <= 0) {
      throw new RailFailure("Rail request timed out", {
        kind: RAIL_FAILURE_KIND.DEGRADED, reason: "timeout", retryAttempts: attempt, requestId: activeRequestId, route,
      });
    }

    const attemptBudget = Math.max(1, remaining);
    const controller = new AbortController();
    let timedOut = false;
    let rejectDeadline;
    const deadlinePromise = new Promise((_, reject) => { rejectDeadline = reject; });
    const onCallerAbort = () => {
      controller.abort(signal?.reason || new Error("caller cancelled"));
      rejectDeadline(abortError({ requestId: activeRequestId, route, retryAttempts: attempt }));
    };
    if (signal) signal.addEventListener("abort", onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("request deadline"));
      rejectDeadline(new Error("request deadline"));
    }, attemptBudget);

    let response = null;
    let thrown = null;
    let payload;
    try {
      const result = await Promise.race([
        Promise.resolve().then(async () => {
          const value = await fetchImpl(url, { ...init, signal: controller.signal });
          let body;
          if (value.ok) {
            try { body = await value.json(); }
            catch (error) {
              if (controller.signal.aborted) throw error;
              throw railDeveloperFailure("invalid_json", { requestId: activeRequestId, route, retryAttempts: attempt, cause: error });
            }
          }
          return { response: value, body };
        }),
        deadlinePromise,
      ]);
      response = result.response;
      payload = result.body;
    } catch (error) {
      if (error?.kind === RAIL_FAILURE_KIND.DEVELOPER) throw error;
      thrown = error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onCallerAbort);
    }

    if (signal?.aborted) throw abortError({ requestId: activeRequestId, route, retryAttempts: attempt });

    if (response) {
      try {
        const serverId = response.headers?.get?.("x-request-id") || response.headers?.get?.("x-vercel-id");
        if (serverId) activeRequestId = String(serverId);
      } catch {}
      if (response.ok) return payload;
      const verdict = classifyRailFailure({ status: response.status });
      if (verdict.retryable && attempt === 0) {
        try { await response.body?.cancel?.(); } catch {}
        const delay = Math.min(retryDelay(random), Math.max(0, deadline - nowMs() - 1));
        if (delay > 0) await sleepImpl(delay, signal);
        continue;
      }
      throw new RailFailure(`Rail request returned ${response.status}`, {
        kind: verdict.kind, reason: verdict.reason, status: response.status,
        retryAttempts: attempt, requestId: activeRequestId, route,
      });
    }

    const verdict = classifyRailFailure({ timeout: timedOut, network: !timedOut });
    if (verdict.retryable && attempt === 0 && deadline - nowMs() > 1) {
      const delay = Math.min(retryDelay(random), Math.max(0, deadline - nowMs() - 1));
      if (delay > 0) await sleepImpl(delay, signal);
      continue;
    }
    throw new RailFailure(timedOut ? "Rail request timed out" : "Rail request failed", {
      kind: verdict.kind, reason: verdict.reason, retryAttempts: attempt,
      requestId: activeRequestId, route, cause: thrown,
    });
  }

  throw new RailFailure("Rail request failed", {
    kind: RAIL_FAILURE_KIND.DEGRADED, reason: "network", retryAttempts: 1, requestId: activeRequestId, route,
  });
}

export function railDegradedEvent(failure, { rail = "" } = {}) {
  return {
    name: "discovery_rail_degraded",
    properties: {
      rail: String(rail || "unknown"),
      reason: String(failure?.reason || "unknown"),
      retry_attempts: Number(failure?.retryAttempts) || 0,
      request_id: String(failure?.requestId || "unknown"),
      route: String(failure?.route || "/"),
    },
  };
}

// Fire only when a mascot state actually mounts. Callers own that visibility
// decision so a usable local fallback never generates a false outage event.
export async function emitRailDegraded(failure, meta = {}) {
  if (failure?.kind !== RAIL_FAILURE_KIND.DEGRADED || typeof window === "undefined") return false;
  const event = railDegradedEvent(failure, meta);
  try {
    const { track } = await import("./track.js");
    track(event.name, event.properties);
    return true;
  } catch {
    return false;
  }
}
