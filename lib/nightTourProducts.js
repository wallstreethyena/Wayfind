import { DESTS, milesBetween, rankExperiences } from "./experiencesData.js";
import { isNightTourProductTitle } from "./experienceConcepts.js";
import { isDeniedViatorSku } from "./viatorDenylist.js";

const PRODUCT_CODE_RX = /^[A-Za-z0-9_-]{3,80}$/;

export function isNightTourProduct(title) {
  return isNightTourProductTitle(title);
}

// `/api/experiences` deliberately falls back to the nearest harvested market
// within 150 miles for broad activity browsing. Night Out promises 27 miles,
// so this surface must prove a destination is actually inside that radius
// before using the shared endpoint.
export function nightTourCacheCovers(center, maxMi = 27) {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  const radius = Number(maxMi);
  if (![lat, lng, radius].every(Number.isFinite) || radius <= 0) return false;
  return DESTS.some((destination) => milesBetween({ lat, lng }, destination) <= radius);
}

/**
 * Select strict Night Out products from the already geo-scoped, link-checked
 * `/api/experiences` response. This never broadens geography or performs a
 * provider lookup; an empty owned-cache result stays empty.
 */
export function nightTourProducts(items, count = 20) {
  const seen = new Set();
  const eligible = (Array.isArray(items) ? items : []).filter((item) => {
    const code = String(item?.code || "").trim();
    if (!PRODUCT_CODE_RX.test(code) || isDeniedViatorSku(code) || seen.has(code)) return false;
    if (String(item?.provider || "viator").toLowerCase() !== "viator") return false;
    if (!isNightTourProduct(item?.title)) return false;
    seen.add(code);
    return true;
  });
  return rankExperiences(eligible).slice(0, Math.max(0, Number(count) || 0));
}
