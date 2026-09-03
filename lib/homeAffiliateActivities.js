import { rankExperiences } from "./experiencesData.js";

// The homepage is a ranked window into the same owned affiliate catalogue used
// by Activities. Fetch more than we display so a dead image/link can be removed
// without thinning the promised 30-card rail.
export const HOME_AFFILIATE_ACTIVITY_COUNT = 30;
export const HOME_AFFILIATE_ACTIVITY_FETCH_LIMIT = 60;
export const HOME_AFFILIATE_ACTIVITY_RADIUS_MI = 120;

const PRODUCT_CODE_RX = /^[A-Za-z0-9_-]{3,80}$/;

export function homeAffiliateActivities(items, count = HOME_AFFILIATE_ACTIVITY_COUNT) {
  const seen = new Set();
  const eligible = (Array.isArray(items) ? items : []).filter((item) => {
    const code = String(item?.code || "").trim();
    const url = String(item?.url || "").trim();
    if (!PRODUCT_CODE_RX.test(code) || !item?.image || !/[?&]pid=/.test(url) || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
  return rankExperiences(eligible).slice(0, Math.max(0, Number(count) || 0));
}
