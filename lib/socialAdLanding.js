// True for a Facebook or Instagram ad landing (#2419): a non empty fbclid, or a
// utm_source naming a Meta surface. Tiny and dependency free so the cached
// /christmas-in-florida page can call it in the browser on window.location.
const SOCIAL_SOURCES = new Set(["meta", "facebook", "fb", "instagram", "ig", "threads", "an", "msg"]);
const firstParam = (v) => (Array.isArray(v) ? v[0] : v);
export function isSocialAdLanding(params) {
  if (!params || typeof params !== "object") return false;
  const fbclid = firstParam(params.fbclid);
  if (typeof fbclid === "string" && fbclid.trim()) return true;
  const src = firstParam(params.utm_source);
  return typeof src === "string" && SOCIAL_SOURCES.has(src.trim().toLowerCase());
}

