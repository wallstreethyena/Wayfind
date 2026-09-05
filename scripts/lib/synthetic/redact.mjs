// scripts/lib/synthetic/redact.mjs — the ONE place synthetic-monitor evidence
// passes through before it touches disk, a log line, or a failure message.
//
// THE RULE IS BLANKET, NOT A DENYLIST. An earlier draft of this file matched
// query-param NAMES that "look sensitive" (pid, key, token, sid, click_id...).
// That is the exact shape CLAUDE.md's guard-honesty section warns about: a
// denylist is only as good as the list of credential names someone thought of
// TODAY, and Wayfind's own affiliate stack has grown new ones without warning
// (NEXT_PUBLIC_VIATOR_PID, click_id, sub_id, mcid...). So every query-string
// VALUE is replaced, unconditionally, keeping only the parameter NAMES (which
// are useful for a developer reproducing a failure and carry no secret) and
// the origin+path (also not a secret — it is the endpoint, not the credential).
//
// This module does ZERO network and ZERO process.env reads — it is pure string
// handling, which is what makes scripts/check-synthetic-monitor-hermetic.mjs
// able to prove it correct without touching the network.
const REDACTED = "[REDACTED]";

/**
 * Redact every query-string VALUE in a URL (relative or absolute). Keeps the
 * scheme+host+path and every parameter NAME, so a developer can still see
 * "this hit /api/viator/go with offer= and provider= set" without ever seeing
 * what they were set TO.
 * @param {string} rawUrl
 * @returns {string}
 */
export function redactUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return rawUrl;
  const hadQuery = rawUrl.includes("?");
  let u;
  try {
    // A base is required for a relative URL (e.g. "/api/viator/go?offer=123").
    // The sentinel base is stripped back out below — it never leaks into output.
    u = new URL(rawUrl, "http://wf-redact.invalid");
  } catch {
    // Not a parseable URL at all (rare: a malformed request target). Still
    // never emit anything after the first "?" verbatim.
    const qIdx = rawUrl.indexOf("?");
    return qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx) + "?" + REDACTED;
  }
  const keys = [...u.searchParams.keys()];
  const rebuilt = new URLSearchParams();
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) continue; // one redacted marker per NAME, not per repeated value
    seen.add(key);
    rebuilt.set(key, REDACTED);
  }
  const isRelative = u.origin === "http://wf-redact.invalid";
  const base = isRelative ? u.pathname : u.origin + u.pathname;
  const qs = rebuilt.toString();
  const hash = u.hash ? "#" + REDACTED : "";
  if (!hadQuery && !qs) return base + hash;
  return base + (qs ? "?" + qs : "") + hash;
}

/** Redact a whole captured network-failure row, keeping only shapes. */
export function redactNetworkFailure(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return {
    url: redactUrl(String(entry.url || "")),
    method: entry.method ? String(entry.method) : undefined,
    status: typeof entry.status === "number" ? entry.status : null,
    resourceType: entry.resourceType ? String(entry.resourceType) : undefined,
    failure: entry.failure ? String(entry.failure).slice(0, 300) : undefined,
  };
}

/** Redact a list of captured network-failure rows. Never throws on a bad entry. */
export function redactNetworkFailures(list) {
  if (!Array.isArray(list)) return [];
  return list.map((e) => {
    try {
      return redactNetworkFailure(e);
    } catch {
      return { url: "[unreadable]" };
    }
  });
}

// A browser console.error can itself embed a full URL — e.g. a fetch failure
// logs "GET https://partner.example.com/go?apiKey=... 500" straight from
// Chromium's own network layer. redactUrl() alone only helps a caller who
// already has an isolated URL string; this finds and redacts every URL
// EMBEDDED inside a longer piece of free text, so console/error messages get
// the same guarantee as the structured network-failure rows above.
const URL_IN_TEXT_RE = /\bhttps?:\/\/[^\s"'<>)]+/g;

/**
 * Redact every http(s) URL found inside a free-text string, in place of the
 * URL's query values (same rule as redactUrl — origin+path+param NAMES kept,
 * values replaced). Non-URL text is returned unchanged. Never throws.
 * @param {string} text
 * @returns {string}
 */
export function redactUrlsInText(text) {
  const s = String(text == null ? "" : text);
  try {
    return s.replace(URL_IN_TEXT_RE, (m) => redactUrl(m));
  } catch {
    return s;
  }
}

/** Redact every URL embedded in each string of a list. Never throws on a bad entry. */
export function redactTextList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((e) => {
    try {
      return redactUrlsInText(e);
    } catch {
      return "[unreadable]";
    }
  });
}

/**
 * True when `text` contains NONE of the raw secret values — the assertion
 * every evidence-writing path is checked against. Case-sensitive substring
 * search: a credential is exact bytes, never a fuzzy match.
 * @param {string} text
 * @param {string[]} secrets
 */
export function containsNoRawSecret(text, secrets) {
  const hay = String(text == null ? "" : text);
  return secrets.every((s) => s && !hay.includes(s));
}

/**
 * Shape-and-boolean-only description of a redirect Location header. NEVER
 * returns the raw URL, the query string, or anything from it — only the
 * hostname (the endpoint identity, not a credential) and booleans a developer
 * can act on. This is what the Book-links scenario reports.
 *
 * The two host tests are PREDICATE FUNCTIONS rather than a plain hostname
 * list so the caller can reuse the REAL production allowlists
 * (lib/commerceProviders.js's regex-per-provider `hosts`, and
 * lib/affiliates.js's isTicketmasterFamily) instead of a second, hand-kept
 * copy that can drift from what the redirect route actually enforces. This
 * function itself stays pure and hermetic — it never calls the network, it
 * only calls the two functions it is handed.
 * @param {string} rawLocation
 * @param {(hostname: string, rawUrl: string) => boolean} isAttributedPartnerHost
 * @param {(hostname: string, rawUrl: string) => boolean} isOwnFallbackHost
 */
export function describeRedirectDestination(rawLocation, isAttributedPartnerHost, isOwnFallbackHost) {
  let hostname = null;
  let parsed = false;
  let search = "";
  try {
    const u = new URL(rawLocation);
    hostname = u.hostname.toLowerCase();
    search = u.search;
    parsed = true;
  } catch {}
  const isAttributedPartner = parsed && !!isAttributedPartnerHost(hostname, rawLocation);
  const isOwnFallback = parsed && !!isOwnFallbackHost(hostname, rawLocation);
  return {
    resolved: parsed,
    hostname: parsed ? hostname : null,
    isAttributedPartner,
    isOwnFallback,
    // hasQueryParams tells a developer "the link carried tracking" without
    // ever surfacing what the tracking VALUE was.
    hasQueryParams: parsed ? search.length > 1 : false,
  };
}

export const REDACTED_MARKER = REDACTED;
