// Birthday as seven location-aware decision rails over Wayfind's full owned
// inventory. Pure predicates make every inclusion testable and keep category
// words from leaking across rails.

import { isMealPlace } from "./mealPlace.js";
import { isQuickService } from "./quickService.js";
import { wayfindScore } from "./wayfindScore.js";

export const BIRTHDAY_NEAR_MI = 10;
export const BIRTHDAY_WIDEN_MI = 27;

export const BIRTHDAY_RAIL_DEFS = [
  { id: "gifts", title: "Birthday Free Gifts", deck: "The exact gift, the catch, and when to claim it." },
  { id: "upscale", title: "Upscale Birthday Dinner", deck: "A dinner that feels like the occasion, not another Tuesday." },
  { id: "private", title: "Private Dining Rooms", deck: "A room the group can actually call its own." },
  { id: "rooftops", title: "Rooftops", deck: "Open-air skyline energy — an ordinary terrace does not count." },
  { id: "beachfront", title: "Beachfront Birthdays", deck: "Direct beach atmosphere — not somewhere that is merely near the coast." },
  { id: "clubs", title: "Dance Clubs", deck: "Real dance floors for the part of the birthday that starts after dinner." },
  { id: "speakeasies", title: "Speakeasies", deck: "Hidden doors, low light, and cocktails with a point of view." },
];

export const BIRTHDAY_RAIL_ORDER = BIRTHDAY_RAIL_DEFS.map((rail) => rail.id);

const PRICE_ENUM = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function priceNumOf(place) {
  if (typeof place?.priceNum === "number") return place.priceNum;
  if (typeof place?.priceLevel === "number") return place.priceLevel;
  return PRICE_ENUM[place?.priceLevel] ?? 0;
}

function primaryOf(place) {
  return String(place?.primaryType || place?.primary_type || "").toLowerCase();
}

function evidenceOf(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  return [place?.name, place?.editorial, place?.description, place?.knownFor, ...types]
    .filter(Boolean).join(" ").toLowerCase();
}

function identityEvidenceOf(place) {
  return [place?.name, place?.editorial, place?.description, place?.knownFor]
    .filter(Boolean).join(" ").toLowerCase();
}

function qualityClearsBirthdayBar(place) {
  const rating = Number(place?.rating || 0);
  const reviews = Number(place?.reviews || place?.userRatingCount || 0);
  return rating >= 4.4 && reviews >= 75;
}

function qualityAtLeast(place, ratingFloor, reviewFloor) {
  return Number(place?.rating || 0) >= ratingFloor
    && Number(place?.reviews || place?.userRatingCount || 0) >= reviewFloor;
}

export function isBirthdayGift(place) {
  const reward = place && place._birthdayReward;
  return !!(reward && reward.gift && reward.requirement && reward.window && reward.verifiedAt);
}

export function isUpscaleBirthdayDinner(place) {
  if (!place || !isMealPlace(place) || isQuickService(place)) return false;
  const primary = primaryOf(place);
  const identity = identityEvidenceOf(place);
  if (!/(restaurant|steak_house|chophouse|bistro)$/.test(primary)) return false;
  if (!qualityClearsBirthdayBar(place)) return false;
  if (/\b(casual|sports[- ]?pub|sports bar|ale house|tiki bar|bar\s*(?:&|and)\s*grill|family restaurant|fast food|diner)\b/.test(identity)) return false;
  if (place?._birthdayAttributes?.upscale === true) return true;
  if (priceNumOf(place) >= 3 || primary === "fine_dining_restaurant") return true;
  return /\b(upscale|fine dining|refined|sophisticated|elegant|polished|chophouse|prime steakhouse|special occasion)\b/.test(identity);
}

export function hasPrivateDiningRoom(place) {
  if (place?._birthdayAttributes?.privateDining === true) return true;
  return /\b(private dining room|private dining|private room|private event room|banquet room)\b/.test(evidenceOf(place));
}

export function isRooftop(place) {
  if (place?._birthdayAttributes?.rooftop === true) return true;
  const primary = primaryOf(place);
  const evidence = evidenceOf(place);
  const celebrationVenue = isMealPlace(place) || /(bar|night_club|dance_club)$/.test(primary);
  return qualityAtLeast(place, 4.2, 75)
    && celebrationVenue
    && !/\brooftop pool\b/.test(evidence)
    && /\b(rooftop|roof deck|sky bar)\b/.test(evidence);
}

export function isBeachfront(place) {
  if (place?._birthdayAttributes?.beachfront === true) return true;
  const primary = primaryOf(place);
  const celebrationVenue = isMealPlace(place) || /(bar|night_club|dance_club|beach_club)$/.test(primary);
  return qualityAtLeast(place, 4.2, 75)
    && celebrationVenue
    && /\b(beachfront|on the beach|oceanfront|gulf[- ]front)\b/.test(evidenceOf(place));
}

export function isDanceClub(place) {
  if (place?._birthdayAttributes?.danceClub === true) return true;
  // A restaurant that carries night_club as a secondary type is still a
  // restaurant. The primary identity must be the dance venue.
  const identity = identityEvidenceOf(place);
  return /^(night_club|dance_club)$/.test(primaryOf(place))
    && qualityAtLeast(place, 4.0, 50)
    && !/\b(comedy|cabaret)\b/.test(identity)
    && /\b(nightclub|night club|club|dance|dancing|dance floor|dj|djs|edm|hip[- ]hop|reggae|music)\b/.test(identity);
}

export function isSpeakeasy(place) {
  if (place?._birthdayAttributes?.speakeasy === true) return true;
  const identity = identityEvidenceOf(place);
  if (/\bspeakeasy[- ](?:vibe|style|inspired)\b/.test(identity)) return false;
  return qualityAtLeast(place, 4.3, 50) && (
    /\bspeakeasy\b/.test(identity)
    || /\b(hidden|secret) (?:cocktail )?(?:bar|door|room)\b/.test(identity)
  );
}

const MEMBERS = {
  gifts: isBirthdayGift,
  upscale: isUpscaleBirthdayDinner,
  private: hasPrivateDiningRoom,
  rooftops: isRooftop,
  beachfront: isBeachfront,
  clubs: isDanceClub,
  speakeasies: isSpeakeasy,
};

export function birthdayRailMembership(id, place) {
  const predicate = MEMBERS[id];
  return typeof predicate === "function" && predicate(place);
}

function scoreOf(place) {
  const score = wayfindScore(place?.rating, place?.reviews);
  return score == null ? -1 : score;
}

function birthdayRank(a, b) {
  const scoreDelta = scoreOf(b) - scoreOf(a);
  if (scoreDelta) return scoreDelta;
  return (a?.distMi ?? 99) - (b?.distMi ?? 99);
}

function uniqueRankedPlaces(places) {
  const seenNames = new Set();
  return places.slice().sort(birthdayRank).filter((place) => {
    const key = String(place?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
}

export function composeBirthdayRails(places, opts = {}) {
  const widenMi = Number.isFinite(opts.widenMi) ? opts.widenMi : BIRTHDAY_WIDEN_MI;
  const pool = (Array.isArray(places) ? places : []).filter((place) =>
    Number.isFinite(place?.distMi) && place.distMi <= widenMi,
  );
  return {
    rails: BIRTHDAY_RAIL_DEFS.map((definition) => ({
      ...definition,
      places: uniqueRankedPlaces(pool.filter((place) => birthdayRailMembership(definition.id, place))),
    })),
  };
}
