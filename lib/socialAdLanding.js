// True for a Facebook or Instagram ad landing (#2419): a non empty fbclid, or a
// utm_source naming a Meta surface. Tiny and dependency free so the cached
// /christmas-in-florida page can call it in the browser on window.location.
export const SOCIAL_AD_SOURCES = ["meta", "facebook", "fb", "instagram", "ig", "threads", "an", "msg"];
const SOCIAL_SOURCES = new Set(SOCIAL_AD_SOURCES);
const firstParam = (v) => (Array.isArray(v) ? v[0] : v);
export function isSocialAdLanding(params) {
  if (!params || typeof params !== "object") return false;
  const fbclid = firstParam(params.fbclid);
  if (typeof fbclid === "string" && fbclid.trim()) return true;
  const src = firstParam(params.utm_source);
  return typeof src === "string" && SOCIAL_SOURCES.has(src.trim().toLowerCase());
}


// The attribute <html> carries while a social ad landing is on screen; the
// picks' CSS shows them only under it.
export const SOCIAL_AD_ATTR = "data-wf-social";

// 2026-11-13: the same check as isSocialAdLanding, as an inline script the page
// runs before first paint. Revealing the picks after hydration pushed the rest
// of the hero down (layout shift up to 0.15 on desktop, 0.08 in Facebook's
// in-app browser); deciding before paint draws them in place from the start.
export const SOCIAL_AD_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search),f=q.get('fbclid'),s=(q.get('utm_source')||'').trim().toLowerCase();if((f&&f.trim())||${JSON.stringify(SOCIAL_AD_SOURCES)}.indexOf(s)>-1)document.documentElement.setAttribute('${SOCIAL_AD_ATTR}','')}catch(e){}})();`;
