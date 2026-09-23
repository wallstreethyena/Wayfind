import { placeCardDetailHref } from "./placeCardRoute.js";\n\n// Smallest statewide-guide handoff helper.
//
// Guide pages used to build `near={region}, FL` from g.region. That is correct
// for Orlando / Tampa / Sarasota / Crystal River. It is not correct for a
// Florida-wide article: `near=Florida, FL` is not a local market. Exact place
// IDs open the full /p/{id} app detail. Text fallbacks may name a real city. A statewide
// region omits `near` rather than inventing one. Other city regions keep the
// existing `{region}, FL` pin.

const STATEWIDE = new Set(["florida", "fl", "florida, fl", "florida,fl"]);

export function isStatewideGuideRegion(region) {
  return STATEWIDE.has(String(region || "").trim().toLowerCase());
}

function asNearValue(name) {
  const raw = String(name || "").trim();
  if (!raw || isStatewideGuideRegion(raw)) return null;
  return /,\s*[A-Z]{2}$/.test(raw) ? raw : raw + ", FL";
}

/** `City, FL` when the pick or guide names a real market; otherwise null. */
export function guideNearMarket(guide, pick) {
  const city = asNearValue((pick && (pick.near || pick.city)) || "");
  if (city) return city;
  return asNearValue((guide && guide.region) || "");
}

export function guidePlacePath(placeId) {
  const id = String(placeId || "").trim();
  return placeCardDetailHref(id);
}

/**
 * App handoff for a named place. Exact inventory identity wins. A statewide
 * guide without a per-pick city never emits near=Florida, FL.
 */
export function guideAppHandoffHref(name, guide, pick) {
  const byId = guidePlacePath(pick && pick.placeId);
  if (byId) return byId;
  const q = String(name || "").trim();
  if (!q) return "/";
  let href = "/?q=" + encodeURIComponent(q) + "&intent=place";
  const near = guideNearMarket(guide, pick);
  if (near) href += "&near=" + encodeURIComponent(near);
  return href;
}

export function handoffEmitsStatewideNear(href) {
  try {
    const u = new URL(String(href || ""), "https://www.gowayfind.com");
    return /^florida,\s*fl$/i.test(String(u.searchParams.get("near") || "").trim());
  } catch (e) {
    return /(?:\?|&)near=Florida(?:,|\+|%2C)\s*FL/i.test(String(href || ""));
  }
}
