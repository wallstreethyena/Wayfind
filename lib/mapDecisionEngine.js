// lib/mapDecisionEngine.js — Contextual Spatial Decision Engine for the Wayfind Map.
//
// CORE LAW:
// 1. Public Wayfind Score (`governed_score` / `toDisplayScore`) is NEVER modified here.
// 2. Zero commercial, affiliate, ticket-commission, or sponsored signals ever enter
//    `mapDecisionScore` or `evaluateMapCandidate`.
// 3. In default ranking mode, `governed_score` remains strictly monotonic (`Shown == Sorted`),
//    while `mapDecisionScore` breaks ties inside each 0.1 Wayfind Score band.
// 4. Explicit Moment Lenses (`open_now`, `tonight`, `rain_safe`, `christmas`, `free`)
//    act as honest pre-sort eligibility gates backed by real evidence.
import { businessStatus, isOperational } from "./businessStatus.js";
import { toDisplayScore } from "./score.js";
import { byGovernedScore, governedScoreOf } from "./lawfulOrder.js";
import { siteHourFloat, bucketForHour, HEAT_ADVISORY_F, WET_RAIN_PCT } from "./nowContext.js";
import { siteTodayStr } from "./siteTime.js";
import { venueLean, coarseCat, humanTypeFallback } from "./ranking.js";
import { eventVisitStatus } from "./eventVisitFacts.js";
import { nextOpenDay } from "./scheduleNoteDays.js";
import { toHookLine } from "./editorialHook.js";
import { estimateFloridaDrive } from "./mapRouting.js";
import { placeInMapBounds, mapCategoryMatches, MAP_MIN_SCORE } from "./mapAreaData.js";

export const MAP_MOMENT_LENSES = Object.freeze([
  { id: "open_now", label: "Open now" },
  { id: "tonight", label: "Tonight" },
  { id: "rain_safe", label: "Rain-safe" },
  { id: "christmas", label: "Christmas" },
  { id: "free", label: "Free" },
]);

const CHRISTMAS_RX = /\b(christmas|holiday lights?|santa|nutcracker|jingle|winter wonderland|candlelight|boat parade|dazzling nights|luminaria|ice!|mickey'?s very merry|holly jolly|tinsel|noel)\b/i;
const FREE_TYPE_SET = new Set(["park", "beach", "state_park", "national_park", "nature_preserve", "hiking_area", "plaza", "playground", "dog_park", "garden"]);
const NIGHT_FRIENDLY_RX = /\b(bar|cocktail|wine_bar|brewery|pub|night_club|performing_arts_theater|concert_hall|movie_theater|bowling_alley|restaurant|steak_house|seafood_restaurant|italian_restaurant|sushi_restaurant|dessert_shop|ice_cream_shop)\b/i;
const MORNING_FRIENDLY_RX = /\b(cafe|coffee_shop|bakery|breakfast_restaurant|brunch_restaurant|park|beach|botanical_garden|hiking_area|museum|zoo|aquarium)\b/i;
const DAYTIME_ONLY_OUTDOOR_RX = /\b(nature_preserve|hiking_area|state_park|wildlife_park|playground|dog_park|botanical_garden)\b/i;

export function minUsefulVisitMinutes(place) {
  const hay = [
    place?.primaryType,
    place?.category,
    ...(Array.isArray(place?.types) ? place.types : []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(theme_park|amusement_park|water_park|zoo|aquarium)\b/.test(hay)) return 90;
  if (/\b(museum|art_gallery|botanical_garden|performing_arts_theater|movie_theater)\b/.test(hay)) return 55;
  if (/\b(cafe|coffee_shop|bakery|ice_cream_shop|dessert_shop|donut_shop)\b/.test(hay)) return 15;
  if (/\b(restaurant|bar|brewery|steak_house|seafood_restaurant|wine_bar|bowling_alley)\b/.test(hay)) return 35;
  return 25;
}

export function resolveMapDaypart(nowMs = Date.now(), sunsetMs = null) {
  const hour = siteHourFloat(new Date(nowMs));
  const baseBucket = bucketForHour(hour);
  if (Number.isFinite(sunsetMs)) {
    const minsToSunset = Math.round((sunsetMs - nowMs) / 60000);
    if (minsToSunset >= -20 && minsToSunset <= 70) {
      return { phase: "sunset", bucket: baseBucket, hour, minsToSunset };
    }
  }
  if (hour >= 0 && hour < 5) return { phase: "after_midnight", bucket: "night", hour, minsToSunset: null };
  if (hour >= 22.5) return { phase: "late_night", bucket: "night", hour, minsToSunset: null };
  if (hour >= 18) return { phase: "evening", bucket: "night", hour, minsToSunset: null };
  if (hour >= 16.5 && hour < 18) return { phase: "sunset", bucket: baseBucket, hour, minsToSunset: null };
  if (hour >= 11.5) return { phase: "afternoon", bucket: "afternoon", hour, minsToSunset: null };
  return { phase: "morning", bucket: "morning", hour, minsToSunset: null };
}

export function evaluateHoursAndFeasibility(place, driveEstimate = null, nowMs = Date.now()) {
  const bs = businessStatus({
    ...place,
    oh: place?.oh || place?.regularOpeningHours || null,
    utcOffset: place?.utcOffset != null ? place.utcOffset : place?.utcOffsetMinutes,
  }, nowMs);

  const driveMin = driveEstimate && Number.isFinite(driveEstimate.driveMinEst) ? driveEstimate.driveMinEst : 10;
  const minVisitMin = minUsefulVisitMinutes(place);

  if (bs.open === true) {
    const closeInfo = bs.nextTransition && bs.nextTransition.type === "close" ? bs.nextTransition : null;
    const inMinutes = closeInfo && Number.isFinite(closeInfo.inMinutes) ? closeInfo.inMinutes : null;
    const alwaysOpen = inMinutes == null && bs.source === "live";
    if (inMinutes != null) {
      const neededMin = driveMin + minVisitMin;
      const feasible = inMinutes >= neededMin;
      const closingSoon = inMinutes <= 60;
      return {
        state: feasible ? (closingSoon ? "closing_soon" : "open") : "closing_infeasible",
        confirmedOpen: true,
        hoursUnconfirmed: false,
        alwaysOpen: false,
        closingFeasible: feasible,
        minutesUntilClose: inMinutes,
        closeLabel: closeInfo.label || null,
        neededMinutes: neededMin,
      };
    }
    return {
      state: alwaysOpen ? "always_open" : "open",
      confirmedOpen: true,
      hoursUnconfirmed: false,
      alwaysOpen,
      closingFeasible: true,
      minutesUntilClose: null,
      closeLabel: null,
      neededMinutes: driveMin + minVisitMin,
    };
  }

  if (bs.open === false) {
    const openInfo = bs.nextTransition && bs.nextTransition.type === "open" ? bs.nextTransition : null;
    const opensSoon = !!(openInfo && openInfo.soon && openInfo.today);
    return {
      state: opensSoon ? "opens_soon" : "closed",
      confirmedOpen: false,
      hoursUnconfirmed: false,
      alwaysOpen: false,
      closingFeasible: false,
      minutesUntilOpen: openInfo ? openInfo.inMinutes : null,
      openLabel: openInfo ? openInfo.label : null,
    };
  }

  return {
    state: "hours_unconfirmed",
    confirmedOpen: false,
    hoursUnconfirmed: true,
    alwaysOpen: false,
    closingFeasible: true,
    minutesUntilClose: null,
    closeLabel: null,
  };
}

export function evaluateEventEligibility(item, nowMs = Date.now()) {
  if (!item || (!item._isEventCard && item.kind !== "event" && !item.start_date && !item.visit_schedule)) {
    return null;
  }
  const now = new Date(nowMs);
  const todayStr = siteTodayStr(now);
  const status = eventVisitStatus(item, now, todayStr);
  if (status && status.expired) {
    return { activeToday: false, state: "ended", label: "Ended" };
  }
  if (item.start_date && String(item.start_date) > todayStr) {
    return { activeToday: false, state: "future", label: status?.label || `Opens ${item.start_date}` };
  }
  // Enforce hardened scheduleNoteDays / select-nights truth so "Nov 1 - Jan 5"
  // never claims "Tonight" on an off-night.
  if (item.start_date) {
    const nextDay = nextOpenDay(item, todayStr, todayStr);
    if (nextDay !== todayStr) {
      return { activeToday: false, state: "off_night", label: status?.label || "Select nights" };
    }
  }
  const tone = status?.tone || "today";
  return {
    activeToday: true,
    state: tone === "now" ? "happening_now" : tone === "soon" ? "starting_soon" : "tonight",
    label: status?.value ? `${status.label} · ${status.value}` : (status?.label || "Happening today"),
  };
}

export function isFreePlaceCandidate(place) {
  if (!place) return false;
  if (place.priceLevel === "PRICE_LEVEL_FREE" || place.priceNum === 0 || place.is_free === true) return true;
  const types = [place.primaryType, ...(Array.isArray(place.types) ? place.types : [])].filter(Boolean).map((t) => String(t).toLowerCase());
  if (types.some((t) => FREE_TYPE_SET.has(t)) && place.priceNum == null) return true;
  return false;
}

export function isChristmasCandidate(place) {
  if (!place) return false;
  if (place.seasonal === "christmas" || place._christmasCard === true) return true;
  const hay = `${place.name || ""} ${place.editorial || ""} ${place.line || ""} ${place.schedule_note || ""}`;
  return CHRISTMAS_RX.test(hay);
}

export function evaluateWeatherFit(place, weather, beachSignal = null) {
  const leanInfo = venueLean(place || {});
  const lean = leanInfo?.lean || "neutral";
  const isWater = !!leanInfo?.water || place?.category === "beach";
  const hasAdvisory = !!(beachSignal && beachSignal.water && (beachSignal.water.advisory || beachSignal.water.result === "Poor"));
  if (hasAdvisory) {
    return { delta: -28, rainSafe: false, outdoorPenalty: true, tag: "Water advisory" };
  }
  if (!weather) {
    return { delta: 0, rainSafe: lean === "indoor", outdoorPenalty: false, tag: lean === "indoor" ? "Indoor" : null };
  }
  const rainPct = Number(weather.rain) || 0;
  const isWet = weather.wet === true || rainPct >= WET_RAIN_PCT;
  const isShowery = !isWet && rainPct >= 35;
  const feels = Number(weather.feels ?? weather.temp);
  const extremeHeat = Number.isFinite(feels) && feels >= HEAT_ADVISORY_F;

  if (isWet) {
    if (lean === "indoor") return { delta: 22, rainSafe: true, outdoorPenalty: false, tag: "Rain-safe indoor" };
    if (isWater || lean === "outdoor") return { delta: -26, rainSafe: false, outdoorPenalty: true, tag: null };
    return { delta: 2, rainSafe: false, outdoorPenalty: false, tag: null };
  }
  if (isShowery && lean === "indoor") {
    return { delta: 10, rainSafe: true, outdoorPenalty: false, tag: "Indoor pick" };
  }
  if (extremeHeat) {
    if (lean === "indoor") return { delta: 12, rainSafe: true, outdoorPenalty: false, tag: "A/C indoor pick" };
    if (lean === "outdoor" && !isWater) return { delta: -12, rainSafe: false, outdoorPenalty: true, tag: null };
  }
  return { delta: 0, rainSafe: lean === "indoor", outdoorPenalty: false, tag: null };
}

export function evaluateDaypartFit(place, daypart, hoursEval) {
  const typesHay = [place?.primaryType, place?.category, ...(Array.isArray(place?.tags) ? place.tags : []), ...(Array.isArray(place?.types) ? place.types : [])]
    .filter(Boolean).join(" ").toLowerCase();
  const phase = daypart.phase;

  if (phase === "late_night" || phase === "after_midnight") {
    if (hoursEval.alwaysOpen) return { delta: 24, tag: "Open 24 hours" };
    if (hoursEval.confirmedOpen && hoursEval.closingFeasible) return { delta: 20, tag: "Open late" };
    if (DAYTIME_ONLY_OUTDOOR_RX.test(typesHay)) return { delta: -30, tag: null };
    if (/\b(museum|zoo|aquarium)\b/.test(typesHay) && !hoursEval.confirmedOpen) return { delta: -24, tag: null };
    if (NIGHT_FRIENDLY_RX.test(typesHay) && hoursEval.hoursUnconfirmed) return { delta: 6, tag: null };
    return { delta: -6, tag: null };
  }
  if (phase === "sunset") {
    if (place?.category === "beach" || /\b(beach|waterfront|rooftop|marina|pier|scenic|park)\b/.test(typesHay + " " + String(place?.name || "").toLowerCase())) {
      const sunsetTag = Number.isFinite(daypart.minsToSunset) && daypart.minsToSunset > 5
        ? `Sunset in ${daypart.minsToSunset} min`
        : "Golden-hour spot";
      return { delta: 14, tag: sunsetTag };
    }
  }
  if (phase === "morning") {
    if (MORNING_FRIENDLY_RX.test(typesHay)) return { delta: 12, tag: null };
    if (/\b(night_club|cocktail_bar|pub)\b/.test(typesHay) && !hoursEval.confirmedOpen) return { delta: -20, tag: null };
  }
  if (phase === "evening") {
    if (NIGHT_FRIENDLY_RX.test(typesHay)) return { delta: 12, tag: null };
    if (DAYTIME_ONLY_OUTDOOR_RX.test(typesHay) && !hoursEval.confirmedOpen) return { delta: -18, tag: null };
  }
  return { delta: 0, tag: null };
}

export function computeActionabilityCoverage(place, hoursEval, reasonLine) {
  const checks = {
    location: Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng)),
    distance: place?.distMi != null || place?._userMiles != null,
    hours: !hoursEval?.hoursUnconfirmed,
    status: isOperational(place),
    reason: Boolean(reasonLine),
    officialAction: Boolean(place?.lat != null && place?.lng != null),
    photo: Boolean(place?.photo || place?.photoRef || place?.photo_ref || place?.photo_url),
    score: toDisplayScore(Number.isFinite(place?.governed_score) ? place.governed_score : place?.wfScore) !== null,
  };
  const values = Object.values(checks);
  const covered = values.filter(Boolean).length;
  return { checks, covered, total: values.length, ratio: +(covered / values.length).toFixed(2) };
}

export function aggregateActionabilityCoverage(places = [], evaluatedMap = null) {
  const list = Array.isArray(places) ? places.filter(Boolean) : [];
  if (!list.length) return { count: 0, meanRatio: 1, fullyActionable: 0 };
  let sumRatio = 0;
  let fullyActionable = 0;
  for (const p of list) {
    const ev = evaluatedMap && typeof evaluatedMap.get === "function" ? evaluatedMap.get(p.id) : null;
    const cov = ev?.actionability || computeActionabilityCoverage(p, ev?.hoursEval, ev?.reasonLine || p.editorial);
    sumRatio += cov.ratio;
    if (cov.ratio >= 0.75) fullyActionable += 1;
  }
  return {
    count: list.length,
    meanRatio: +(sumRatio / list.length).toFixed(2),
    fullyActionable,
  };
}

/**
 * Produces ONE truthful, evidence-backed reason line for `MapCompactPreviewCard`.
 * Preserves the mandatory `🔥 trend_reason` prefix whenever `trending && trend_reason` is set.
 */
export function buildMapDecisionReason(place, evalResult, { editorial = null, aiSummary = null } = {}) {
  if (!place) return null;
  if (place.trending && place.trend_reason) {
    return "🔥 " + place.trend_reason;
  }
  const parts = [];
  const ev = evalResult?.eventEval;
  const hrs = evalResult?.hoursEval;
  const drv = evalResult?.driveEstimate;
  const wth = evalResult?.weatherEval;
  const dpt = evalResult?.daypartEval;

  if (ev && ev.activeToday) {
    parts.push(isChristmasCandidate(place) ? "Christmas event tonight" : ev.label);
  } else if (hrs && hrs.state === "closing_infeasible" && hrs.minutesUntilClose != null) {
    parts.push(`Closes in ${hrs.minutesUntilClose} min`);
    if (drv && drv.driveMinEst) parts.push(`~${drv.driveMinEst} min away`);
    return parts.join(" \u00b7 ");
  } else if (wth && wth.tag === "Rain-safe indoor") {
    parts.push("Rain-safe indoor");
  } else if (isFreePlaceCandidate(place) && dpt && dpt.tag && dpt.tag.startsWith("Sunset")) {
    parts.push("Free", dpt.tag);
    return parts.join(" \u00b7 ");
  } else if (dpt && dpt.tag) {
    parts.push(dpt.tag);
  }

  if (drv && drv.waterCrossing && drv.driveMinEst >= 18) {
    parts.push(`~${drv.driveMinEst} min (${drv.waterCrossing})`);
  } else if (drv && drv.hasPhysicalOrigin && drv.driveMinEst && drv.driveMinEst <= 35 && parts.length < 2) {
    parts.push(drv.isEstimate ? `~${drv.driveMinEst} min away` : `${drv.driveMinEst} min away`);
  }

  if (hrs && parts.length < 2) {
    if (hrs.confirmedOpen && hrs.closeLabel && hrs.closingFeasible) {
      parts.push(hrs.closeLabel.replace(/^Closes\s+/i, "Open until "));
    } else if (hrs.state === "opens_soon" && hrs.openLabel) {
      parts.push(hrs.openLabel);
    }
  }

  if (parts.length > 0) return parts.slice(0, 2).join(" \u00b7 ");

  const take = toHookLine(editorial || place.editorial, place.name);
  if (take) return take;
  const aiLine = aiSummary && typeof aiSummary === "object" && aiSummary.card_line_1 ? aiSummary.card_line_1 : null;
  if (aiLine) return aiLine;
  if (place._members && place._members.ownerPick) return "Curator pick \u00b7 Top local standout";
  const catLabel = place.cuisine || place.cardCategory || coarseCat(place) || humanTypeFallback(place.primaryType || place.primary_type) || "Local pick";
  return `${catLabel}${place.reviews ? ` \u00b7 ${Number(place.reviews).toLocaleString()} reviews` : ""}`;
}

export function evaluateMapCandidate(place, ctx = {}) {
  const {
    nowMs = Date.now(),
    verifiedDeviceLoc = null,
    referenceCenter = null,
    liveRoute = null,
    weather = null,
    beachSignals = null,
    lens = null,
    bounds = null,
    category = "all",
    sub = "all",
    explicitList = false,
    skipScoreFloor = false,
  } = ctx;

  if (!place || !place.id) return { eligible: false, exclusionReason: "missing_identity" };
  if (!isOperational(place)) return { eligible: false, exclusionReason: "not_operational" };
  if (!Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
    return { eligible: false, exclusionReason: "no_permitted_coordinate" };
  }
  if (!explicitList && bounds && !placeInMapBounds(place, bounds)) {
    return { eligible: false, exclusionReason: "outside_viewport" };
  }
  const govScore = Number.isFinite(place.governed_score) ? place.governed_score : governedScoreOf(place, place.city);
  const displayScore = toDisplayScore(govScore);
  if (!explicitList && !skipScoreFloor && !place._isEventCard && (displayScore == null || displayScore < MAP_MIN_SCORE)) {
    return { eligible: false, exclusionReason: "below_score_floor", displayScore };
  }
  if (!explicitList && !place._isEventCard && !mapCategoryMatches(place, category, sub)) {
    return { eligible: false, exclusionReason: "wrong_category" };
  }

  const originForDrive = verifiedDeviceLoc || referenceCenter;
  const rawDrive = liveRoute || (originForDrive ? estimateFloridaDrive(originForDrive, place) : null);
  const driveEstimate = rawDrive ? { ...rawDrive, hasPhysicalOrigin: !!verifiedDeviceLoc } : null;
  const daypart = resolveMapDaypart(nowMs, weather?.sunsetMs);
  const hoursEval = evaluateHoursAndFeasibility(place, driveEstimate, nowMs);
  const eventEval = evaluateEventEligibility(place, nowMs);
  const beachSig = beachSignals && place.id ? beachSignals[place.id] : null;
  const weatherEval = evaluateWeatherFit(place, weather, beachSig);
  const daypartEval = evaluateDaypartFit(place, daypart, hoursEval);

  // Event-card baseline eligibility: never surface ended events on the map
  if (eventEval && eventEval.state === "ended") {
    return { eligible: false, exclusionReason: "event_ended", eventEval };
  }

  // Moment Lens strict gates (only applied when user activates a lens or search constraint)
  if (lens === "open_now") {
    if (eventEval) {
      if (!eventEval.activeToday) return { eligible: false, exclusionReason: "event_not_tonight", eventEval };
    } else {
      if (hoursEval.hoursUnconfirmed) return { eligible: false, exclusionReason: "hours_unconfirmed", hoursEval };
      if (!hoursEval.confirmedOpen) return { eligible: false, exclusionReason: "closed_now", hoursEval };
      if (!hoursEval.closingFeasible) return { eligible: false, exclusionReason: "closing_infeasible", hoursEval };
    }
  } else if (lens === "tonight") {
    if (eventEval) {
      if (!eventEval.activeToday) return { eligible: false, exclusionReason: eventEval.state === "future" ? "event_future" : "event_not_tonight", eventEval };
    } else {
      if (hoursEval.state === "closed" && !hoursEval.hoursUnconfirmed && daypart.bucket === "night") {
        return { eligible: false, exclusionReason: "closed_now", hoursEval };
      }
      if (!hoursEval.closingFeasible && daypart.bucket === "night") {
        return { eligible: false, exclusionReason: "closing_infeasible", hoursEval };
      }
      const typesHay = [place.primaryType, place.category, ...(Array.isArray(place.types) ? place.types : [])].join(" ").toLowerCase();
      if (DAYTIME_ONLY_OUTDOOR_RX.test(typesHay) && !hoursEval.confirmedOpen) {
        return { eligible: false, exclusionReason: "daytime_only_venue" };
      }
    }
  } else if (lens === "rain_safe") {
    if (!weatherEval.rainSafe) return { eligible: false, exclusionReason: "weather_incompatible", weatherEval };
  } else if (lens === "christmas") {
    if (!isChristmasCandidate(place)) return { eligible: false, exclusionReason: "not_seasonal_match" };
    if (eventEval && !eventEval.activeToday && eventEval.state === "ended") {
      return { eligible: false, exclusionReason: "event_ended", eventEval };
    }
  } else if (lens === "free") {
    if (!isFreePlaceCandidate(place)) return { eligible: false, exclusionReason: "not_free" };
  }

  // Contextual Map Decision Score (0..1000 internal tie-break & moment merit, ZERO commercial inputs)
  let decisionScore = (Number.isFinite(govScore) ? govScore : 90) * 6;
  if (hoursEval.confirmedOpen && hoursEval.closingFeasible) decisionScore += 35;
  else if (hoursEval.state === "closing_infeasible") decisionScore -= 55;
  else if (hoursEval.state === "closed") decisionScore -= 45;
  else if (hoursEval.state === "opens_soon") decisionScore += 8;

  if (eventEval && eventEval.activeToday) decisionScore += 40;
  decisionScore += weatherEval.delta;
  decisionScore += daypartEval.delta;

  if (driveEstimate && Number.isFinite(driveEstimate.driveMinEst)) {
    // Penalize water-barrier detours and long drives smoothly within tie bands
    const effortPenalty = Math.min(45, Math.round(driveEstimate.driveMinEst * 0.85) + (driveEstimate.waterCrossing ? 9 : 0));
    decisionScore -= effortPenalty;
  }

  const partial = {
    eligible: true,
    exclusionReason: null,
    governedScore: govScore,
    displayScore,
    mapDecisionScore: Math.round(decisionScore * 10) / 10,
    driveEstimate,
    hoursEval,
    eventEval,
    weatherEval,
    daypartEval,
    daypart,
  };
  const reasonLine = buildMapDecisionReason(place, partial);
  const actionability = computeActionabilityCoverage(place, hoursEval, reasonLine);
  return { ...partial, reasonLine, actionability };
}

function canonicalVenueDedupeKey(place) {
  if (!place) return "";
  const normName = String(place.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 28);
  const latCell = Number.isFinite(Number(place.lat)) ? Math.round(Number(place.lat) * 1250) : "";
  const lngCell = Number.isFinite(Number(place.lng)) ? Math.round(Number(place.lng) * 1250) : "";
  return normName && latCell !== "" ? `${normName}@${latCell}:${lngCell}` : String(place.id || "");
}

/**
 * Ranks eligible map candidates while strictly preserving `Shown == Sorted`
 * (`byGovernedScore` primary, `mapDecisionScore` breaking ties inside each 0.1 chip band).
 */
export function rankMapCandidates(candidates, ctx = {}) {
  const evaluated = new Map();
  const exclusions = new Map();
  const kept = [];
  const seenIds = new Set();
  const seenVenues = new Set();

  // Sort raw candidates by governed score first so canonical deduplication always keeps the strongest row
  const orderedInput = [...(Array.isArray(candidates) ? candidates : [])].sort(
    (a, b) => byGovernedScore(a, b) || String(a?.id || "").localeCompare(String(b?.id || ""))
  );

  for (const p of orderedInput) {
    if (!p || !p.id) continue;
    if (seenIds.has(p.id)) {
      exclusions.set(p.id, { place: p, exclusionReason: "deduped_duplicate_id" });
      continue;
    }
    const ev = evaluateMapCandidate(p, ctx);
    if (!ev.eligible) {
      exclusions.set(p.id, { place: p, ...ev });
      continue;
    }
    const vKey = canonicalVenueDedupeKey(p);
    if (vKey && seenVenues.has(vKey)) {
      exclusions.set(p.id, { place: p, exclusionReason: "deduped_same_venue" });
      continue;
    }
    seenIds.add(p.id);
    if (vKey) seenVenues.add(vKey);
    evaluated.set(p.id, ev);
    kept.push(p);
  }

  if (!ctx.explicitList) {
    kept.sort((a, b) => {
      const govCmp = byGovernedScore(a, b);
      if (govCmp !== 0) return govCmp;
      const da = evaluated.get(a.id)?.mapDecisionScore ?? 0;
      const db = evaluated.get(b.id)?.mapDecisionScore ?? 0;
      if (db !== da) return db - da;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  return { places: kept, evaluated, exclusions };
}

export function buildMapTruthTrace(placeId, rankedBundle, locationTruth) {
  if (!rankedBundle) return null;
  const ev = rankedBundle.evaluated.get(placeId);
  if (ev) {
    const idx = rankedBundle.places.findIndex((p) => p.id === placeId);
    const place = rankedBundle.places[idx];
    return {
      status: "visible",
      rank: idx + 1,
      id: placeId,
      name: place?.name || null,
      coordSource: place?.coordSource || "wf_inventory",
      wayfindScore: ev.displayScore,
      governedScoreRaw: ev.governedScore,
      mapDecisionScore: ev.mapDecisionScore,
      reasonLine: ev.reasonLine,
      hours: ev.hoursEval,
      drive: ev.driveEstimate,
      weather: ev.weatherEval,
      daypart: { phase: ev.daypart?.phase, fitDelta: ev.daypartEval?.delta, tag: ev.daypartEval?.tag },
      event: ev.eventEval,
      actionability: ev.actionability,
      locationTruth: locationTruth ? {
        hasPhysicalGps: !!locationTruth.deviceLocation,
        mapArea: locationTruth.mapCenter?.areaLabel || null,
        searchSource: locationTruth.searchLocation?.source || null,
      } : null,
    };
  }
  return diagnoseExcludedPlace(placeId, rankedBundle);
}

export function diagnoseExcludedPlace(queryOrId, rankedBundle, allRawCandidates = []) {
  const q = String(queryOrId || "").trim().toLowerCase();
  if (!q || !rankedBundle) return { status: "not_found", query: queryOrId };
  if (rankedBundle.exclusions.has(queryOrId)) {
    const ex = rankedBundle.exclusions.get(queryOrId);
    return { status: "excluded", id: queryOrId, name: ex.place?.name || null, reason: ex.exclusionReason, detail: ex };
  }
  for (const [id, ex] of rankedBundle.exclusions.entries()) {
    if (id.toLowerCase() === q || String(ex.place?.name || "").toLowerCase().includes(q)) {
      return { status: "excluded", id, name: ex.place?.name || null, reason: ex.exclusionReason, detail: ex };
    }
  }
  const rawMatch = (allRawCandidates || []).find(
    (p) => p && (String(p.id || "").toLowerCase() === q || String(p.name || "").toLowerCase().includes(q))
  );
  if (rawMatch) {
    return { status: "excluded_upstream", id: rawMatch.id, name: rawMatch.name, reason: "filtered_before_candidate_pool" };
  }
  return { status: "not_in_pool", query: queryOrId, reason: "not_loaded_in_current_region" };
}
