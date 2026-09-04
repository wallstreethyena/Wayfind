// The combined answer behind "What Should We Do Today?".
//
// This replaces three competing homepage posters (Today, Best, Hidden Gems)
// with one decision surface. Membership is evidence-first and ranking is the
// score printed on the card. Beaches are the deliberate exception: current
// water quality decides first, then Wayfind Score inside the same water band.

import { isAttractionPlace, isFoodPlace, isNightlifePlace, isShoppingPlace, isSitOnSandPlace, isStayPlace } from "./chipIdentity.js";
import { creatorVideosFor } from "./creatorVideos.js";
import { beachWaterBand } from "./beachDecision.js";
import { wayfindScore } from "./wayfindScore.js";
import { byWayfindScore, railScoreOf } from "./railRank.js";

export const TODAY_NEAR_MI = 17;
export const TODAY_DISCOVERY_MI = 27;
export const TODAY_NATURE_MI = 75;
export const TODAY_BEST_SCORE_FLOOR = 82;

export const TODAY_DISCOVERY_RAIL_DEFS = Object.freeze([
  { id: "activities", title: "Top Activities", deck: "The strongest things to do nearby." },
  { id: "instagram", title: "Instagram Places", deck: "Creator-visited places with the original post." },
  { id: "springs", title: "Florida Springs", deck: "Clear-water escapes worth the whole day." },
  { id: "beaches", title: "Best Beach Today", deck: "Today's water quality leads the ranking." },
  { id: "food", title: "Best of the Best Food", deck: "Our highest-rated places to eat nearby." },
  { id: "water", title: "Water Activities", deck: "Florida adventures made for the water." },
  { id: "parks", title: "Theme Parks, Water Parks & Zoos", deck: "Big attractions that carry the whole day." },
  { id: "nature", title: "Go Explore Nature", deck: "Wild Florida places worth stepping into." },
  { id: "golf", title: "Golf", deck: "The strongest real courses and clubs." },
  { id: "pickleball", title: "Pickleball", deck: "The best courts and clubs nearby." },
]);

function primaryOf(place) {
  return String(place?.primaryType || place?.primary_type || "").toLowerCase();
}

function evidenceOf(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  return [place?.name, place?.editorial, primaryOf(place), ...types]
    .filter(Boolean).join(" ").toLowerCase();
}

function scoreOf(place) {
  const score = wayfindScore(place?.rating, place?.reviews);
  return score == null ? -1 : score;
}

export function hasInstagramEvidence(place, city = "") {
  try {
    return creatorVideosFor(place, city).some((video) =>
      String(video?.platform || "").toLowerCase() === "instagram"
      && /^https:\/\/(?:www\.)?instagram\.com\//i.test(String(video?.url || "")),
    );
  } catch {
    return false;
  }
}

export function isFloridaSpring(place) {
  if (!place || !isAttractionPlace(place)) return false;
  const evidence = evidenceOf(place);
  const primary = primaryOf(place);
  const springName = /\b(?:spring|springs)\b/.test(String(place.name || "").toLowerCase());
  const naturalIdentity = /^(?:natural_feature|state_park|national_park|park|nature_preserve|tourist_attraction)$/.test(primary)
    || /\b(?:natural_feature|state_park|national_park|nature_preserve|swimming|river)\b/.test(evidence);
  // "Spring Hill" businesses and ordinary parks fail: the name must identify
  // a spring and the structured identity must describe a natural destination.
  return springName && naturalIdentity;
}

export function isTopActivity(place) {
  return !!place
    && Number(place.distMi) <= TODAY_NEAR_MI
    && scoreOf(place) >= TODAY_BEST_SCORE_FLOOR
    && isAttractionPlace(place)
    // Inventory can preserve noisy secondary `tourist_attraction` tokens on a
    // restaurant or bar. Primary venue identities veto before any activity
    // evidence is considered; quality never turns dinner into an outing.
    && !isFoodPlace(place)
    && !isNightlifePlace(place)
    && !isStayPlace(place)
    && !isShoppingPlace(place)
    && !isFloridaSpring(place)
    && !isSitOnSandPlace(place)
    && !isWaterActivity(place)
    && !isDestinationPark(place)
    && !isNaturePlace(place)
    && !isGolfPlace(place)
    && !isPickleballPlace(place);
}

export function isBestFood(place) {
  return !!place
    && Number(place.distMi) <= TODAY_NEAR_MI
    && scoreOf(place) >= TODAY_BEST_SCORE_FLOOR
    && isFoodPlace(place);
}

export function isWaterActivity(place) {
  if (!place || !isAttractionPlace(place)) return false;
  const evidence = evidenceOf(place);
  const primary = primaryOf(place);
  if (/\b(?:boat dealer|boat ramp|marina store|marine supply|yacht broker)\b/.test(evidence)) return false;
  return /^(?:fishing_charter|water_sports|scuba_diving_center|surf_school)$/.test(primary)
    || /\b(?:kayak|canoe|paddleboard|paddle boarding|sup tour|snorkel|scuba|diving|surf lesson|jet ski|parasail|sailing|boat tour|airboat|fishing charter|dolphin cruise)\b/.test(evidence);
}

export function isDestinationPark(place) {
  if (!place || !isAttractionPlace(place)) return false;
  const evidence = evidenceOf(place);
  const primary = primaryOf(place);
  return /^(?:theme_park|amusement_park|water_park|zoo|aquarium|wildlife_park)$/.test(primary)
    || /\b(?:theme_park|amusement_park|water_park|zoo|aquarium|wildlife_park)\b/.test(evidence);
}

export function isGolfPlace(place) {
  if (!place || !isAttractionPlace(place)) return false;
  const evidence = evidenceOf(place);
  const primary = primaryOf(place);
  if (/\b(?:miniature golf|mini golf|golf store|golf shop|golf instruction|driving range)\b/.test(evidence)) return false;
  return primary === "golf_course" || /\bgolf_course\b/.test(evidence);
}

export function isPickleballPlace(place) {
  if (!place) return false;
  const primary = primaryOf(place);
  const evidence = evidenceOf(place);
  const suitable = /^(?:sports_club|sports_activity_location|park|recreation_center|athletic_field)$/.test(primary)
    || /\b(?:sports_club|sports_activity_location|recreation_center|athletic_field|court)\b/.test(evidence);
  return suitable && /\bpickleball\b/.test(evidence);
}

export function isNaturePlace(place) {
  if (!place || !isAttractionPlace(place)) return false;
  if (isFloridaSpring(place) || isSitOnSandPlace(place) || isWaterActivity(place) || isDestinationPark(place) || isGolfPlace(place) || isPickleballPlace(place)) return false;
  const primary = primaryOf(place);
  const evidence = evidenceOf(place);
  return /^(?:state_park|national_park|park|nature_preserve|wildlife_refuge|hiking_area|botanical_garden|garden|natural_feature)$/.test(primary)
    || /\b(?:state_park|national_park|nature_preserve|wildlife_refuge|hiking_area|botanical_garden|nature trail|hiking trail|wildlife preserve)\b/.test(evidence);
}

// RANKING LAW (lib/railRank.js): Wayfind Score DESC, reviews DESC, distance
// ASC, place_id ASC — distance is a tie-break only.
const rankByScore = byWayfindScore;

// Beach is the ONE deliberate, stated exception (see this rail's own deck:
// "Current water quality decides first, then Wayfind Score and distance").
// Water safety is not a ranking preference, it is an admission fact the
// reader cannot see on a card photo — a 9.4-scored beach under a bacteria
// advisory is not a better beach to visit today than a 7.8 with clean water.
// That is a documented, narrow carve-out for one real-world safety signal,
// not the distance/ring shape this law exists to ban: it never reorders two
// places on DISTANCE ahead of score, only on water safety ahead of score.
const WATER_RANK = { good: 4, moderate: 3, unknown: 2, poor: 1, advisory: 0 };
function rankBeach(a, b) {
  const water = (WATER_RANK[beachWaterBand(b?.water)] ?? 2) - (WATER_RANK[beachWaterBand(a?.water)] ?? 2);
  return water || rankByScore(a, b);
}

function uniqueRanked(places, rank = rankByScore) {
  const ids = new Set();
  const names = new Set();
  return places.slice().sort(rank).filter((place) => {
    const id = String(place?.id || "");
    const name = String(place?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!id || !name || ids.has(id) || names.has(name)) return false;
    ids.add(id);
    names.add(name);
    return true;
  });
}

export function composeTodayDiscoveryRails(places, { city = "" } = {}) {
  const pool = Array.isArray(places) ? places : [];
  const buckets = {
    activities: pool.filter(isTopActivity),
    instagram: pool.filter((place) => Number(place?.distMi) <= TODAY_DISCOVERY_MI && hasInstagramEvidence(place, city)),
    springs: pool.filter((place) => Number(place?.distMi) <= TODAY_NATURE_MI && isFloridaSpring(place)),
    beaches: pool.filter((place) => Number(place?.distMi) <= TODAY_NATURE_MI && isSitOnSandPlace(place)),
    food: pool.filter(isBestFood),
    water: pool.filter((place) => Number(place?.distMi) <= TODAY_NATURE_MI && isWaterActivity(place)),
    parks: pool.filter((place) => Number(place?.distMi) <= TODAY_NATURE_MI && isDestinationPark(place)),
    nature: pool.filter((place) => Number(place?.distMi) <= TODAY_NATURE_MI && isNaturePlace(place)),
    golf: pool.filter((place) => Number(place?.distMi) <= TODAY_DISCOVERY_MI && isGolfPlace(place)),
    pickleball: pool.filter((place) => Number(place?.distMi) <= TODAY_DISCOVERY_MI && isPickleballPlace(place)),
  };
  return {
    rails: TODAY_DISCOVERY_RAIL_DEFS.map((definition) => ({
      ...definition,
      places: uniqueRanked(buckets[definition.id], definition.id === "beaches" ? rankBeach : rankByScore),
    })),
  };
}
