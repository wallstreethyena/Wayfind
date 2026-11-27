// Sign-in resume for Group Vote, Live Trips and event pages:
// /favorites?return=<path> remembers where the person was, and home.js sends
// them back after sign-in. The path comes from a URL, so it is untrusted: only
// same-origin /group-plans paths, exact /trips/<uuid> paths, and exact event
// page paths (/florida-events/<slug>, /events/<city>/<slug>; no query) pass.
export const AUTH_RETURN_KEY = "wf_auth_return";
const BASE = "https://wayfind.invalid";
const LIVE_TRIP_RETURN = /^\/trips\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Event pages (2026-11-27): the header "Sign in" on both event routes brings
// the reader back to the event. A curated slug is lowercase words and digits.
// A provider slug ends in an encoded id ("name--<id>"), so it may carry
// percent escapes, but never an encoded slash, backslash, control or "%25".
const FLORIDA_EVENT_RETURN = /^\/florida-events\/[a-z0-9][a-z0-9-]{0,199}$/;
const CITY_EVENT_RETURN = /^\/events\/[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9](?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2}){0,299}$/;
const UNSAFE_ESCAPE = /%(?:2f|5c|0d|0a|00|25)/i;

// Returns the safe relative path (pathname + search, no hash) or null.
export function validateAuthReturn(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (LIVE_TRIP_RETURN.test(value)) return value.toLowerCase();
  if (FLORIDA_EVENT_RETURN.test(value)) return value;
  if (CITY_EVENT_RETURN.test(value) && !UNSAFE_ESCAPE.test(value)) return value;
  if (!/^\/group-plans(\/|\?|$)/.test(value)) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.indexOf("#") >= 0) return null;
  const queryAt = value.indexOf("?");
  const rawPath = queryAt >= 0 ? value.slice(0, queryAt) : value;
  if (rawPath.indexOf("//") >= 0 || /%(?:2f|5c|0d|0a|00)/i.test(rawPath) || /%25/i.test(rawPath)) return null;
  let url;
  try { url = new URL(value, BASE); } catch { return null; }
  if (url.origin !== BASE) return null;
  if (!/^\/group-plans(\/|$)/.test(url.pathname) || url.pathname.indexOf("//") >= 0) return null;
  return url.pathname + url.search;
}

export function signInUrlWithReturn(returnPath) {
  const safe = validateAuthReturn(returnPath);
  return safe ? "/favorites?return=" + encodeURIComponent(safe) : "/favorites";
}

// storage is sessionStorage-like. Never throws.
export function rememberAuthReturn(storage, value) {
  try { const safe = validateAuthReturn(value); if (safe && storage) { storage.setItem(AUTH_RETURN_KEY, safe); return safe; } } catch {}
  return null;
}

// Reads, removes, and re-validates. Returns the path to navigate to, or null.
export function consumeAuthReturn(storage) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(AUTH_RETURN_KEY);
    if (raw === null || raw === undefined) return null;
    storage.removeItem(AUTH_RETURN_KEY);
    return validateAuthReturn(raw);
  } catch { return null; }
}
