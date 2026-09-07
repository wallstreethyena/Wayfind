// lib/wikimediaFetchPolicy.js — transport policy for Wayfind's background Wikimedia reads.
//
// Why this exists (2026-09-07): the 12:23 popularity run selected 100 Wikipedia
// candidates, succeeded on 18, and recorded http_429 x52. Those 52 are not bad
// matches; they are candidates Wikimedia did not let us observe. The popularity
// cron itself runs a 5-wide worker pool, while Wikimedia's 2026 API guidance says
// automated clients should keep concurrency at 3 or fewer, respect Retry-After on
// 429/503, and use maxlag for noninteractive Action API work.
//
// This module changes TRANSPORT ONLY. It knows nothing about Wayfind's matching,
// CONFIDENCE_FLOOR, identity verifier, score, or which places are eligible.
// The policy is deliberately conservative:
//   - at most 2 Wikimedia HTTP requests in flight (one slot of headroom under 3),
//   - a 429/503 arms the provider's Retry-After window (5s fallback if absent),
//   - calls already queued behind that response fail locally instead of adding
//     more traffic during the backoff window,
//   - the cron asks controller.canRequest() before starting the NEXT Wikipedia
//     candidate, so unstarted candidates are not stamped into the attempt ledger,
//   - Action API requests get maxlag=5, Wikimedia's recommended noninteractive
//     value, so Wayfind yields when the replicas are stressed.
//
// No inline sleep/retry happens here. lib/popularity.js owns a 4.5s AbortController
// around each fetch; sleeping 5+ seconds inside fetch would guarantee the retry is
// born aborted. The safe retry is the next candidate/run AFTER Retry-After, not an
// attempt hidden inside an already-expiring request.

export const WIKIMEDIA_MAX_CONCURRENCY = 2;
export const WIKIMEDIA_RETRY_FALLBACK_MS = 5000;
export const WIKIMEDIA_MAXLAG = 5;

const INSTALL_KEY = Symbol.for("wayfind.wikimedia-fetch-policy.v1");

const nowMs = () => Date.now();

export function retryAfterMs(value, now = nowMs()) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return WIKIMEDIA_RETRY_FALLBACK_MS;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const sec = Number(raw);
    return Number.isFinite(sec) ? Math.max(0, Math.ceil(sec * 1000)) : WIKIMEDIA_RETRY_FALLBACK_MS;
  }
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - now);
  return WIKIMEDIA_RETRY_FALLBACK_MS;
}

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function isWikimediaUrl(input) {
  const raw = requestUrl(input);
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.hostname === "en.wikipedia.org" || u.hostname === "wikimedia.org";
  } catch {
    return false;
  }
}

function actionApiInput(input) {
  const raw = requestUrl(input);
  if (!raw) return input;
  try {
    const u = new URL(raw);
    if (u.hostname !== "en.wikipedia.org" || u.pathname !== "/w/api.php") return input;
    if (!u.searchParams.has("maxlag")) u.searchParams.set("maxlag", String(WIKIMEDIA_MAXLAG));
    if (typeof input === "string") return u.toString();
    if (input instanceof URL) return u;
    // Current popularity call sites pass strings. Do not rebuild an arbitrary
    // Request object and risk dropping body/credentials for a future caller.
    return input;
  } catch {
    return input;
  }
}

function syntheticBackoffResponse(ms, status = 429, reason = "retry_after") {
  const retrySec = Math.max(1, Math.ceil(Math.max(0, ms) / 1000));
  return new Response(JSON.stringify({ error: "wikimedia_backoff", reason }), {
    status,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retrySec),
      "x-wayfind-wikimedia-backoff": "1",
    },
  });
}

export function createWikimediaFetchPolicy(baseFetch, { now = nowMs } = {}) {
  if (typeof baseFetch !== "function") throw new TypeError("baseFetch must be a function");

  let active = 0;
  const waiters = [];
  let blockedUntil = 0;

  const remainingBackoffMs = () => Math.max(0, blockedUntil - now());
  const canRequest = () => remainingBackoffMs() <= 0;

  function armBackoff(header) {
    const ms = retryAfterMs(header, now());
    blockedUntil = Math.max(blockedUntil, now() + ms);
    return ms;
  }

  async function acquire() {
    if (active < WIKIMEDIA_MAX_CONCURRENCY) {
      active++;
      return;
    }
    await new Promise((resolve) => waiters.push(resolve));
    // release() hands the slot to this waiter without decrementing active.
  }

  function release() {
    const next = waiters.shift();
    if (next) next();
    else active = Math.max(0, active - 1);
  }

  async function policyFetch(input, init) {
    if (!isWikimediaUrl(input)) return baseFetch(input, init);

    // Nothing new is allowed onto the wire during Retry-After. This path is
    // mainly for requests that were already queued before the first 429 arrived;
    // the cron also checks canRequest() before starting subsequent candidates.
    const before = remainingBackoffMs();
    if (before > 0) return syntheticBackoffResponse(before, 429, "active_backoff");

    await acquire();
    try {
      const afterQueue = remainingBackoffMs();
      if (afterQueue > 0) return syntheticBackoffResponse(afterQueue, 429, "active_backoff");

      const actualInput = actionApiInput(input);
      const response = await baseFetch(actualInput, init);

      if (response && (response.status === 429 || response.status === 503)) {
        armBackoff(response.headers && response.headers.get ? response.headers.get("retry-after") : null);
        return response;
      }

      // MediaWiki's maxlag response is an Action API JSON error that can arrive
      // with HTTP 200. Convert it to a transport failure so lib/popularity's
      // existing diagnostics do not mistake {error:{code:"maxlag"}} for data.
      if (response && response.ok && requestUrl(actualInput).includes("/w/api.php")) {
        try {
          const probe = await response.clone().json();
          if (probe && probe.error && probe.error.code === "maxlag") {
            const ms = armBackoff(response.headers && response.headers.get ? response.headers.get("retry-after") : null);
            return syntheticBackoffResponse(ms, 503, "maxlag");
          }
        } catch {
          // The real caller owns JSON parsing; a non-JSON 2xx is not rewritten.
        }
      }

      return response;
    } finally {
      release();
    }
  }

  return Object.freeze({
    fetch: policyFetch,
    canRequest,
    remainingBackoffMs,
    state: () => Object.freeze({ active, queued: waiters.length, blockedUntil, remainingBackoffMs: remainingBackoffMs() }),
  });
}

export function installWikimediaFetchPolicy() {
  const existing = globalThis[INSTALL_KEY];
  if (existing) return existing;
  if (typeof globalThis.fetch !== "function") throw new Error("global fetch is unavailable");

  const originalFetch = globalThis.fetch.bind(globalThis);
  const controller = createWikimediaFetchPolicy(originalFetch);
  globalThis.fetch = controller.fetch;
  globalThis[INSTALL_KEY] = controller;
  return controller;
}
