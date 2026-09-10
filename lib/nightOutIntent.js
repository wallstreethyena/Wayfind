// The ten evidence-gated decisions behind the consolidated Night Out tile.
// A venue's score can rank it only after its identity clears one of these
// promises. Distance is evidence too: an unknown or >27-mile card is refused,
// never presented as "near you".

import { isDanceClub, isRooftop, isSpeakeasy } from "./birthdayIntent.js";
import { isDateRoom } from "./dateRoom.js";
import { isMealPlace } from "./mealPlace.js";
import { isQuickService } from "./quickService.js";
import { rankRailPlaces } from "./railRank.js";
import { NIGHT_OUT_DISTRICT_EVIDENCE } from "./nightOutEvidence.js";

export const NIGHT_OUT_NEAR_MI = 17;
export const NIGHT_OUT_MAX_MI = 27;

export const NIGHT_OUT_RAIL_DEFS = Object.freeze([
  { id: "clubs", title: "Clubs & Dancing", deck: "Real dance floors with serious energy." },
  { id: "cocktails", title: "Bars, Cocktails & Rooftops", deck: "Elevated drinks in atmosphere-first rooms." },
  { id: "live-music", title: "Live Music & Concerts", deck: "Where the music drives the night." },
  { id: "dinner-entertainment", title: "Dinner + Entertainment", deck: "One plan for dinner and a show." },
  { id: "date-dining", title: "Date-Night Dining", deck: "Tables with chemistry built into the room." },
  { id: "shows", title: "Shows, Comedy & Performing Arts", deck: "Live performances worth leaving home for." },
  { id: "districts", title: "Entertainment Districts After Dark", deck: "Walkable neighborhoods built for a full night." },
  { id: "waterfront", title: "Waterfront, Sunset & Night Cruises", deck: "Make the water part of tonight." },
  { id: "night-tours", title: "Night Tours & Something Different", deck: "Unexpected nighttime adventures with a guide." },
  { id: "social-play", title: "Social-Play Activities", deck: "Playful plans made better together." },
]);

const lower = (value) => String(value || "").toLowerCase();
const primaryOf = (item) => lower(item?.primaryType || item?.primary_type);
const typeTokensOf = (item) => [
  item?.primaryType, item?.primary_type, item?.category, item?.subcategory,
  ...(Array.isArray(item?.types) ? item.types : []),
].filter(Boolean).map(lower);
const evidenceFieldsOf = (item) => [
  item?.name, item?.event_name, item?.title, item?.editorial, item?.description,
  item?.knownFor, item?.hook, item?.take,
  ...(Array.isArray(item?.tags) ? item.tags : []),
].filter(Boolean).map(lower);
const explicit = (item, rx) => evidenceFieldsOf(item).some((field) => rx.test(field));
const hasType = (item, rx) => typeTokensOf(item).some((type) => rx.test(type));

// Admission is an identity decision and runs before any score can rank a row.
// These primary identities cannot become a night-out venue because a secondary
// type or prose happens to contain a nightlife word. Publix at University Walk
// was the production example: `walk` in its name and `food` in editorial were
// concatenated into the old Night Tours regex and became false tour evidence.
const NON_NIGHT_PRIMARY_RX = /^(?:supermarket|grocery_store|convenience_store|department_store|shopping_mall|store|food_store|bakery|pharmacy|drugstore|gas_station|bank|atm|school|university|hospital|doctor|dentist|church|place_of_worship|funeral_home|real_estate_agency|car_dealer|car_repair|parking|airport|transit_station|park|city_park|state_park|water_park|amusement_park|playground)$/;
const WATERFRONT_PARK_IDS = new Set([
  "ChIJY3qV_tYXw4gRoy-jOe1OAo4", // Bradenton Riverwalk
  "ChIJdyBKQzM9w4gRrAVyE50uvX8", // Riverwalk East
]);
const isGovernedDistrict = (item) => item?._nightOutAttributes?.district === true
  && !!NIGHT_OUT_DISTRICT_EVIDENCE[String(item?.id || item?.place_id || "")];
const isGovernedRiverwalkPark = (item) => primaryOf(item) === "park"
  && WATERFRONT_PARK_IDS.has(String(item?.id || item?.place_id || ""))
  && /^(?:bradenton )?riverwalk(?: east)?$/.test(lower(item?.name));

export function isNightOutEligiblePlace(item) {
  if (!item) return false;
  const primary = primaryOf(item);
  if (primary && NON_NIGHT_PRIMARY_RX.test(primary)) {
    // A source-backed district overlay may admit the exact open-air center;
    // it is deliberately narrow and cannot turn a supermarket/store into one.
    if (!(primary === "shopping_mall" && isGovernedDistrict(item)) && !isGovernedRiverwalkPark(item)) return false;
  }
  // With no declared primary, a visible counter-identity is still a refusal.
  // A positive primary remains authoritative over noisy secondary Google types.
  if (!primary) {
    const counters = typeTokensOf(item).filter((type) => NON_NIGHT_PRIMARY_RX.test(type));
    if (counters.length && !(isGovernedDistrict(item) && counters.every((type) => type === "shopping_mall"))) return false;
  }
  return true;
}

export function nightOutDistanceMi(item, center = {}) {
  if (Number.isFinite(item?.distMi)) return Math.round(Number(item.distMi) * 10) / 10;
  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  const cLat = Number(center?.lat);
  const cLng = Number(center?.lng);
  if (![lat, lng, cLat, cLng].every(Number.isFinite)) return null;
  const toRad = (n) => n * Math.PI / 180;
  const dLat = toRad(lat - cLat);
  const dLng = toRad(lng - cLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(cLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round((3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
}

function isSocialPlay(item) {
  return hasType(item, /^(?:bowling_alley|amusement_center|video_arcade|karaoke|movie_theater)$/)
    || explicit(item, /\b(arcade|bowling|mini(?:ature)? golf|karaoke|trivia|escape room|board[- ]game|billiards?|pool hall|darts?|shuffleboard|axe throwing|cinema|movie theater)\b/);
}

function isShow(item) {
  const primary = primaryOf(item);
  return /^(comedy_club|performing_arts_theater|theater|opera_house)$/.test(primary)
    || (/^(?:event_venue|concert_hall|amphitheater|amphitheatre|auditorium|cultural_center)$/.test(primary)
      && explicit(item, /\b(comedy|comedian|theatre|theater|performing arts|improv|cabaret|drag show|magic show|opera|ballet|musical)\b/));
}

function isNightTour(item) {
  const tourIdentity = /^(?:tour_operator|tour_agency|sightseeing_tour_agency)$/.test(primaryOf(item))
    || hasType(item, /^(?:tour_operator|tour_agency|sightseeing_tour_agency)$/);
  const namedNightTour = explicit(item, /\b(?:ghost|haunted|night wildlife|nighttime|after[- ]dark|moonlight|historic|food|art)\b.{0,35}\b(?:tour|guided walk|safari)\b|\b(?:tour|guided walk|safari)\b.{0,35}\b(?:ghost|haunted|night|moonlight|food|art)\b/);
  return namedNightTour && (tourIdentity || explicit(item, /\b(?:tour|guided walk|safari)\b/));
}

function isDinnerShow(item) {
  return explicit(item, /\b(dinner (?:theater|theatre|show|cabaret|cruise)|medieval times|pirates dinner|sleuths mystery dinner|themed dinner|meal and (?:a )?show)\b/);
}

function isDinnerEntertainment(item) {
  return isDinnerShow(item)
    || isLiveMusic(item) || isSpeakeasy(item) || isRooftop(item)
    || explicit(item, /\bkaraoke\b/);
}

function isLiveMusic(item) {
  const primary = primaryOf(item);
  return /^(concert_hall|amphitheater|amphitheatre|live_music_venue|jazz_club|piano_bar)$/.test(primary)
    || (/^(?:performing_arts_theater|theater|opera_house|event_venue|auditorium|cultural_center|bar|bar_and_grill|cocktail_bar|lounge_bar|pub|irish_pub|night_club|dance_club|restaurant|[a-z_]+_restaurant)$/.test(primary)
      && (hasType(item, /^(?:concert_hall|amphitheater|amphitheatre|live_music_venue|jazz_club|piano_bar)$/)
        || explicit(item, /\b(concerts?|live music|music venue|jazz club|piano bar|dueling pianos|singer[- ]songwriter)\b/)));
}

function isDistrict(item) {
  if (isGovernedDistrict(item)) return true;
  return explicit(item, /\b(entertainment district|nightlife district|citywalk|disney springs|boardwalk district|resort promenade|downtown promenade|observation wheel district)\b/);
}

function isWaterfront(item) {
  if (isGovernedRiverwalkPark(item)) return true;
  const primary = primaryOf(item);
  const cruise = /^(?:tour_operator|tour_agency|sightseeing_tour_agency|boat_tour_agency|cruise_agency)$/.test(primary)
    && explicit(item, /\b(sunset|dinner|night|moonlight)\b.{0,24}\b(sail|cruise|boat tour)\b|\b(?:sail|cruise|boat tour)\b.{0,24}\b(sunset|night|moonlight|dinner)\b/);
  const promenade = /^(?:tourist_attraction|promenade|pier|marina)$/.test(primary)
    && explicit(item, /\b(waterfront promenade|oceanfront promenade|night pier|harbor walk)\b/);
  return cruise || promenade;
}

function isClub(item) {
  if (isDanceClub(item)) return true;
  const primary = primaryOf(item);
  const nightlifeRoom = /^(night_club|dance_club|bar|sports_bar|cocktail_bar|lounge_bar|pub|event_venue)$/.test(primary);
  return nightlifeRoom
    && explicit(item, /\b(dance|dancing|dance floor|dance part(?:y|ies)|dj|edm|latin night|salsa|nightclub)\b/);
}

function isCocktailRoom(item) {
  const primary = primaryOf(item);
  if (isRooftop(item) || isSpeakeasy(item)) return true;
  return /^(bar|cocktail_bar|wine_bar|lounge_bar|hotel_bar|cigar_bar|brewery|beer_garden|pub)$/.test(primary)
    || explicit(item, /\b(cocktail bar|wine bar|hotel lounge|cigar bar|beer garden|speakeasy|rooftop bar)\b/);
}

function isDateDining(item) {
  if (!isMealPlace(item) || isQuickService(item) || !isDateRoom(item)) return false;
  return explicit(item, /\b(fine dining|romantic|date night|special occasion|candlelit|omakase|tasting menu|steakhouse|chophouse|chef[- ]driven|waterfront dining|rooftop dining|sunset dining|intimate dining)\b/);
}

// Order is identity precedence, not presentation order. It makes an arcade bar
// Social Play, a comedy club Shows, and a dinner show Dinner + Entertainment.
export function nightOutPlaceRail(place) {
  if (!isNightOutEligiblePlace(place)) return null;
  if (isSocialPlay(place)) return "social-play";
  if (isDinnerShow(place)) return "dinner-entertainment";
  if (isClub(place)) return "clubs";
  if (isShow(place)) return "shows";
  if (isNightTour(place)) return "night-tours";
  if (isLiveMusic(place)) return "live-music";
  if (isDistrict(place)) return "districts";
  if (isWaterfront(place)) return "waterfront";
  if (isCocktailRoom(place)) return "cocktails";
  if (isDateDining(place)) return "date-dining";
  return null;
}

export function nightOutPlaceRails(place) {
  if (!isNightOutEligiblePlace(place)) return [];
  const first = nightOutPlaceRail(place);
  if (!first) return [];
  const ids = [first];
  const theater = /^(?:performing_arts_theater|theater|opera_house)$/.test(primaryOf(place));
  const music = isLiveMusic(place);
  // These overlaps are product promises, not every incidental predicate hit:
  // concert/theater inventory also serves Shows and Live Music, while live
  // music, karaoke, speakeasies and rooftops also serve Dinner + Entertainment.
  if (music || theater) ids.push("live-music");
  if (isShow(place) || music) ids.push("shows");
  if (isDinnerEntertainment(place)) ids.push("dinner-entertainment");
  return [...new Set(ids)];
}

export function nightOutEventRail(event) {
  if (!event) return null;
  const fields = evidenceFieldsOf(event);
  if (!fields.length || (hasType(event, /^event_venue$/) && !event?.date && !event?.start_date)) return null;
  if (isSocialPlay(event)) return "social-play";
  if (isDinnerShow(event)) return "dinner-entertainment";
  if (isNightTour(event)) return "night-tours";
  if (isShow(event) || /\b(?:arts?\s*(?:&|and)\s*theatre|theater|theatre|comedy)\b/.test(lower(event?.segment))) return "shows";
  if (isLiveMusic(event) || /\b(?:music|concerts?)\b/.test(lower(event?.segment))) return "live-music";
  if (isWaterfront(event)) return "waterfront";
  if (isClub(event)) return "clubs";
  return null;
}

export function nightOutEventRails(event) {
  if (!event) return [];
  // `event_venue` is a building, not proof that a dated happening exists.
  const fields = evidenceFieldsOf(event);
  if (!fields.length || (hasType(event, /^event_venue$/) && !event?.date && !event?.start_date)) return [];
  const first = nightOutEventRail(event);
  if (!first) return [];
  const ids = [first];
  const segment = lower(event?.segment);
  const theater = isShow(event) || /\b(?:arts?\s*(?:&|and)\s*theatre|theater|theatre)\b/.test(segment);
  const music = isLiveMusic(event) || /\b(?:music|concerts?)\b/.test(segment);
  if (music || theater) ids.push("live-music");
  if (theater || music) ids.push("shows");
  if (isDinnerEntertainment(event) || music) ids.push("dinner-entertainment");
  return [...new Set(ids)];
}

// RANKING LAW (lib/railRank.js): Wayfind Score DESC, reviews DESC, distance
// ASC, place_id ASC. NIGHT_OUT_NEAR_MI/NIGHT_OUT_MAX_MI remain ADMISSION
// rules only — composeNightOutRails below still refuses anything beyond
// NIGHT_OUT_MAX_MI. There is no longer a distance RING that pre-empts score:
// that ring is exactly what put a 9.0 (Enigma, 18mi) below a 7.7 (La Jaula,
// 14.9mi) in the owner's screenshot. Distance now only breaks a tie.
const rankedPlaces = rankRailPlaces;

export function composeNightOutRails(events, places, center = {}) {
  const eventBuckets = Object.fromEntries(NIGHT_OUT_RAIL_DEFS.map((rail) => [rail.id, []]));
  const placeBuckets = Object.fromEntries(NIGHT_OUT_RAIL_DEFS.map((rail) => [rail.id, []]));
  for (const event of Array.isArray(events) ? events : []) {
    const rails = nightOutEventRails(event);
    const distMi = nightOutDistanceMi(event, center);
    if (distMi != null && distMi <= NIGHT_OUT_MAX_MI) {
      for (const rail of rails) eventBuckets[rail].push({ ...event, distMi });
    }
  }
  for (const place of Array.isArray(places) ? places : []) {
    const rails = nightOutPlaceRails(place);
    const distMi = nightOutDistanceMi(place, center);
    if (distMi != null && distMi <= NIGHT_OUT_MAX_MI) {
      for (const rail of rails) placeBuckets[rail].push({ ...place, distMi });
    }
  }
  return {
    rails: NIGHT_OUT_RAIL_DEFS.map((definition) => ({
      ...definition,
      events: eventBuckets[definition.id],
      places: rankedPlaces(placeBuckets[definition.id]),
    })),
  };
}
