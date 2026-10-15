// Sign-in resume for Group Vote: /favorites?return=<path> remembers where the
// person was, and home.js sends them back after sign-in. The path comes from a
// URL, so it is untrusted: only same-origin /group-plans paths pass.
export const AUTH_RETURN_KEY = "wf_auth_return";
const BASE = "https://wayfind.invalid";

// Returns the safe relative path (pathname + search, no hash) or null.
export function validateAuthReturn(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
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
