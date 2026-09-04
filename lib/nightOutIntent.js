// The ten mutually-exclusive decisions behind the consolidated Night Out tile.
// A venue's score can rank it only after its identity clears one of these
// promises. Distance is evidence too: an unknown or >27-mile card is refused,
// never presented as "near you".

import { isDanceClub, isRooftop, isSpeakeasy } from "./birthdayIntent.js";
import { isDateRoom } from "./dateRoom.js";
import { isMealPlace } from "./mealPlace.js";
import { isQuickService } from "./quickService.js";
import { rankRailPlaces } from "./railRank.js";

export const NIGHT_OUT_NEAR_MI = 17;
export const NIGHT_OUT_MAX_MI = 27;

export const NIGHT_OUT_RAIL_DEFS = Object.freeze([
  { id: "clubs", title: "Clubs & Dancing", deck: "Actual dance floors, DJs and nightlife — a bar with background music is not a club." },
  { id: "cocktails", title: "Bars, Cocktails & Rooftops", deck: "Cocktail rooms, lounges, speakeasies and explicitly verified rooftops." },
  { id: "live-music", title: "Live Music & Concerts", deck: "Concerts and rooms whose identity is live music, not restaurants that sometimes hire a singer." },
  { id: "dinner-entertainment", title: "Dinner + Entertainment", deck: "Dinner theaters, cabarets and shows where the meal and performance are one plan." },
  { id: "date-dining", title: "Date-Night Dining", deck: "Sit-down rooms with occasion-level atmosphere — never counter service or an ordinary restaurant." },
  { id: "shows", title: "Shows, Comedy & Performing Arts", deck: "Comedy, theater, improv, drag, magic and performing arts with real program evidence." },
  { id: "districts", title: "Entertainment Districts After Dark", deck: "Walkable districts and destination promenades built for an evening, not a generic shopping center." },
  { id: "waterfront", title: "Waterfront, Sunset & Night Cruises", deck: "Sunset sails, night cruises, riverwalks and waterfront promenades with explicit water evidence." },
  { id: "night-tours", title: "Night Tours & Something Different", deck: "Ghost walks, night wildlife, food and art tours — something with a real guided nighttime format." },
  { id: "social-play", title: "Social-Play Activities", deck: "Bowling, arcades, karaoke, trivia, escape rooms and other activities made to do together." },
]);

const lower = (value) => String(value || "").toLowerCase();
const primaryOf = (item) => lower(item?.primaryType || item?.primary_type);
const wordsOf = (item) => [
  item?.name, item?.event_name, item?.title, item?.primaryType, item?.primary_type,
  item?.category, item?.subcategory, item?.segment, item?.genre, item?.editorial,
  item?.description, item?.knownFor, item?.hook, item?.take,
  ...(Array.isArray(item?.types) ? item.types : []),
  ...(Array.isArray(item?.tags) ? item.tags : []),
].filter(Boolean).join(" ").toLowerCase();

const explicit = (item, rx) => rx.test(wordsOf(item));

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
  return explicit(item, /\b(arcade|bowling|mini(?:ature)? golf|karaoke|trivia|escape room|board[- ]game|billiards?|pool hall|darts?|shuffleboard|axe throwing|cinema|movie theater)\b/);
}

function isShow(item) {
  const primary = primaryOf(item);
  return /^(comedy_club|performing_arts_theater|theater|opera_house)$/.test(primary)
    || explicit(item, /\b(comedy|comedian|theatre|theater|performing arts|improv|cabaret|drag show|magic show|opera|ballet|musical)\b/);
}

function isNightTour(item) {
  return explicit(item, /\b(ghost|haunted|night wildlife|nighttime|after[- ]dark|moonlight|historic|food|art)\b.{0,35}\b(tour|walk|safari)\b|\b(tour|walk|safari)\b.{0,35}\b(ghost|haunted|night|moonlight|food|art)\b/);
}

function isDinnerEntertainment(item) {
  return explicit(item, /\b(dinner (?:theater|theatre|show|cabaret|cruise)|medieval times|pirates dinner|sleuths mystery dinner|themed dinner|meal and (?:a )?show)\b/);
}

function isLiveMusic(item) {
  const primary = primaryOf(item);
  return /^(concert_hall|amphitheater|live_music_venue|jazz_club|piano_bar)$/.test(primary)
    || explicit(item, /\b(concert|live music|music venue|jazz club|piano bar|dueling pianos|amphitheater|singer[- ]songwriter)\b/);
}

function isDistrict(item) {
  return explicit(item, /\b(entertainment district|nightlife district|citywalk|disney springs|boardwalk district|resort promenade|downtown promenade|observation wheel district)\b/);
}

function isWaterfront(item) {
  return explicit(item, /\b(sunset|dinner|night|moonlight)\b.{0,24}\b(sail|cruise|boat tour)\b|\b(?:sail|cruise|boat tour)\b.{0,24}\b(sunset|night|moonlight|dinner)\b|\b(riverwalk|waterfront promenade|oceanfront promenade|night pier|harbor walk)\b/);
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
  if (!place) return null;
  if (isSocialPlay(place)) return "social-play";
  if (isDinnerEntertainment(place)) return "dinner-entertainment";
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

export function nightOutEventRail(event) {
  if (!event) return null;
  // `event_venue` is a building, not proof that a dated happening exists.
  const text = wordsOf(event);
  if (!text || (/\bevent venue\b/.test(text) && !event?.date && !event?.start_date)) return null;
  if (isSocialPlay(event)) return "social-play";
  if (isDinnerEntertainment(event)) return "dinner-entertainment";
  if (isNightTour(event)) return "night-tours";
  if (isShow(event)) return "shows";
  if (isLiveMusic(event) || /\b(music|concerts?)\b/.test(lower(event?.segment))) return "live-music";
  if (isWaterfront(event)) return "waterfront";
  if (isClub(event)) return "clubs";
  return null;
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
    const rail = nightOutEventRail(event);
    const distMi = nightOutDistanceMi(event, center);
    if (rail && distMi != null && distMi <= NIGHT_OUT_MAX_MI) eventBuckets[rail].push({ ...event, distMi });
  }
  for (const place of Array.isArray(places) ? places : []) {
    const rail = nightOutPlaceRail(place);
    const distMi = nightOutDistanceMi(place, center);
    if (rail && distMi != null && distMi <= NIGHT_OUT_MAX_MI) placeBuckets[rail].push({ ...place, distMi });
  }
  return {
    rails: NIGHT_OUT_RAIL_DEFS.map((definition) => ({
      ...definition,
      events: eventBuckets[definition.id],
      places: rankedPlaces(placeBuckets[definition.id]),
    })),
  };
}
