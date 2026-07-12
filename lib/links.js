// lib/links.js — the SINGLE validated source of truth for every outbound link.
//
// The recurring bug class this ends: a missing or malformed URL becoming a
// broken button ("Safari can't open the page"), a dead link, or a wrong-
// destination affiliate default ("Get tickets" -> Expedia). The rule, applied
// once here so it applies everywhere:
//
//   A URL is rendered or opened ONLY if it validates. Invalid or missing -> null,
//   and the caller HIDES the control (graceful degradation). Never a broken
//   link, never a fabricated fallback destination.
//
// Nothing else in the app may build or open an external link. Every anchor,
// every window.open, every "Get tickets" routes through safeUrl / openExternal /
// ticketHref below.
import { ticketOutUrl } from "./affiliates.js";

const JUNK = /^(n\/?a|tbd|tba|null|undefined|none|-+|#|about:blank)$/i;

// Returns a string safe to place in an href / hand to window.open, or null.
// Accepts:
//   - absolute http(s) URLs with a real host, and
//   - app-relative routes ("/api/viator/go?..." — our own redirect endpoints).
// Rejects: empty, whitespace, junk sentinels ("N/A", "TBD", "null"...),
//   javascript:/data:/mailto:/tel:, protocol-relative ("//evil"), bare words,
//   and anything the URL parser can't handle.
export function safeUrl(url) {
  if (typeof url !== "string") return null;
  const s = url.trim();
  if (!s || JUNK.test(s) || /\s/.test(s)) return null;

  // App-relative route (leading single slash) — an internal href/redirect. Safe.
  if (s[0] === "/" && s[1] !== "/") return s;

  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.hostname.indexOf(".") < 0) return null; // must have a real host
  return u.href;
}

export function isSafeUrl(url) { return safeUrl(url) != null; }

// The ticket/booking link for an event, or null. This NEVER falls back to an
// affiliate search — a missing ticket URL yields null so the caller hides the
// button, instead of routing the user to Expedia. Validate -> affiliate-wrap ->
// re-validate (belt and suspenders).
export function ticketHref(event) {
  if (!event || typeof event !== "object") return null;
  const raw = safeUrl(event.url || event.ticketUrl || event.ticket_url || null);
  if (!raw) return null;
  return safeUrl(ticketOutUrl(raw));
}

// The ONE opener. Validates first; opens in a NEW tab (never replaces the app);
// silently no-ops on an invalid URL (a caller should have hidden the control —
// this is the last line of defense). Optional onInvalid callback for a toast.
export function openExternal(url, onInvalid) {
  const safe = safeUrl(url);
  if (!safe) { if (typeof onInvalid === "function") { try { onInvalid(); } catch (e) {} } return false; }
  if (typeof window === "undefined") return false;
  try { const w = window.open(safe, "_blank", "noopener"); if (w) return true; } catch (e) {}
  // Popup blocked: synthesize an anchor click in the same gesture (new tab,
  // tracking intact). Same-tab navigation is banned — it swapped the app for
  // the partner page (v5.01 global rule).
  try {
    const a = document.createElement("a");
    a.href = safe; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  } catch (e) { return false; }
}
