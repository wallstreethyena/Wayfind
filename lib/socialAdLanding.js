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

// The ad's own subject comes first (owner 2026-11-13: "the landing destination
// should fulfill the creative promise"). Keyed by the Meta ad id that every
// Wayfind ad's url tags carry as utm_content={{ad.id}}; the value is the
// listing that ad is about, which /christmas-in-florida then shows as the first
// photo pick, before the regular top picks. A deep link can ask for the same
// card with ?feature=<listing id>, but only for a listing named here, because
// the cached page carries only these cards.
export const SOCIAL_AD_FEATURES = Object.freeze({
  // "Dear Santa, we found your Florida headquarters" (Instagram post
  // DfiitL9p2Uc), Robert's Christmas Wonderland in Clearwater: 82% of all
  // Meta landing page views on Nov 11 to 13.
  "120252036823830033": "roberts-christmas-wonderland-2026",
});
export const SOCIAL_AD_FEATURE_IDS = Object.freeze([...new Set(Object.values(SOCIAL_AD_FEATURES))]);
export const SOCIAL_AD_FEATURE_ATTR = "data-wf-feature";

// The listing id a landing should feature first, or null.
export function socialAdFeature(params) {
  if (!params || typeof params !== "object") return null;
  const asked = firstParam(params.feature);
  if (typeof asked === "string" && SOCIAL_AD_FEATURE_IDS.includes(asked.trim())) return asked.trim();
  if (!isSocialAdLanding(params)) return null;
  const ad = firstParam(params.utm_content);
  return typeof ad === "string" && Object.prototype.hasOwnProperty.call(SOCIAL_AD_FEATURES, ad.trim()) ? SOCIAL_AD_FEATURES[ad.trim()] : null;
}

// The attribute <html> carries while a social ad landing is on screen; the
// picks' CSS shows them only under it.
export const SOCIAL_AD_ATTR = "data-wf-social";

// 2026-11-13: the same checks as isSocialAdLanding and socialAdFeature, as an
// inline script the page runs before first paint. Revealing the picks after
// hydration pushed the rest of the hero down (layout shift up to 0.15 on
// desktop, 0.08 in Facebook's in-app browser); deciding before paint draws them
// in place from the start.
export const SOCIAL_AD_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search),f=q.get('fbclid'),s=(q.get('utm_source')||'').trim().toLowerCase(),r=document.documentElement,m=${JSON.stringify(SOCIAL_AD_FEATURES)},k=${JSON.stringify(SOCIAL_AD_FEATURE_IDS)},a=(q.get('feature')||'').trim(),c=(q.get('utm_content')||'').trim(),soc=!!((f&&f.trim())||${JSON.stringify(SOCIAL_AD_SOURCES)}.indexOf(s)>-1),pick=k.indexOf(a)>-1?a:(soc&&Object.prototype.hasOwnProperty.call(m,c)?m[c]:'');if(soc||pick)r.setAttribute('${SOCIAL_AD_ATTR}','');if(pick)r.setAttribute('${SOCIAL_AD_FEATURE_ATTR}',pick)}catch(e){}})();`;
