// lib/gamePlan.js — Pure, deterministic synthesis for the Place Detail
// above-the-fold "Your Game Plan" decision brief.
//
// Rules enforced by scripts/test-game-plan-and-entity-resolution.mjs:
//   1. Never fabricate missing facts (duration, cost, parking, arrival).
//   2. Never show empty rows.
//   3. Never say "Go now" when a place is closed (openState === false) or when
//      hours are unknown (openState == null).
//   4. Never attach a paid ticket CTA to a free beach or bare public park.
//   5. Surface an official admission/website step when a tickety venue has no
//      monetized partner pick but has a verified websiteHref.
//   6. Surface indoor pivot guidance when weather is wet on an outdoor venue.
//   7. Affiliate status never modifies wfScore or organic ranking.

import * as Aff from "./affiliates.js";
import * as Dining from "./dining.js";
import { isBeachPlace } from "./placePartnerPicks.js";
import { priceLabel, priceLevelOf } from "./price.js";
import * as Ranking from "./ranking.js";
import * as Tags from "./tags.js";

export const GAME_PLAN_CONFIDENCE = Object.freeze({
  CONFIRMED: "CONFIRMED",
  LIKELY: "LIKELY",
  UNKNOWN: "UNKNOWN",
});

function cleanText(v) {
  if (typeof v !== "string") return "";
  const trimmed = v.replace(/\s*\(Live menu below\.\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  // Strip trailing "Verified YYYY-MM-DD; refresh before display."
  return trimmed
    .replace(/\s*\(?verified\s+[^.;)]+\)?[.;]?\s*(?:refresh\s+before\s+display\.?)?/gi, "")
    .trim();
}

function splitSentences(text) {
  const s = cleanText(text);
  if (!s) return [];
  const DOT = "\u0000";
  const protectedStr = s
    .replace(/\b([ap])\.m\./gi, "$1" + DOT + "m" + DOT)
    .replace(/\b(St|Dr|Mr|Mrs|Ms|Jr|Sr|Ft|Mt|vs|No|Inc|Co|Rd|Ave|Blvd)\./gi, "$1" + DOT);
  const parts = protectedStr.split(/([.!?])\s+/);
  const sentences = [];
  for (let i = 0; i < parts.length; i += 2) {
    const combined = (parts[i] + (parts[i + 1] || "")).replaceAll(DOT, ".").trim();
    if (combined) sentences.push(combined);
  }
  return sentences;
}

/**
 * Extract an explicit visit duration ONLY when supported by verified text.
 * Never guesses or fabricates a duration from category/type alone.
 */
export function extractSupportedDuration({ editorial, insider, wayfindNotesList } = {}) {
  const candidates = [
    editorial && editorial.bestFor,
    editorial && editorial.watchOut,
    editorial && editorial.insiderMove,
    editorial && editorial.proMove,
    editorial && editorial.goodToKnow,
    editorial && editorial.why,
    insider && insider.tip,
    insider && insider.bestTime,
    ...(Array.isArray(wayfindNotesList)
      ? wayfindNotesList.map((n) => (typeof n === "string" ? n : n && n.text))
      : []),
  ].filter(Boolean);

  const DURATION_PATTERNS = [
    /\b(?:budget|allow|plan|spend)\s+(?:about\s+|around\s+|at\s+least\s+)?((?:a\s+)?(?:half[- ]day|full[- ]day|half[- ]morning|half[- ]afternoon|(?:[0-9]+(?:\.[0-9]+)?|one|two|three|four|five|ninety|sixty|forty-five|thirty)(?:\s*(?:minutes?|mins?|hours?|hrs?))?\s*(?:to|–|-)\s*(?:[0-9]+(?:\.[0-9]+)?|two|three|four|five|six|ninety|sixty)\s*(?:hours?|hrs?|minutes?|mins?)|(?:[0-9]+(?:\.[0-9]+)?|one|two|three|four|ninety|sixty|forty-five|thirty)\s+(?:hours?|hrs?|minutes?|mins?)))\b/i,
    /\b((?:[0-9]+(?:\.[0-9]+)?|one|two|three|four|sixty|ninety)(?:\s*(?:minutes?|mins?|hours?|hrs?))?\s*(?:to|–|-)\s*(?:[0-9]+(?:\.[0-9]+)?|two|three|four|seventy|ninety)\s*[- ]?(?:minute|min|hour|hr)s?(?:\s+guided\s+tour|\s+tour|\s+visit|\s+paddle|\s+walk|\s+loop)?)\b/i,
    /\b((?:about|around|roughly)\s+(?:[0-9]+(?:\.[0-9]+)?|one|two|three|four|a\s+couple\s+of)\s+(?:hours?|hrs?|minutes?|mins?))\b/i,
    /\b((?:a\s+)?(?:half[- ]day|full[- ]day|half[- ]morning))\b/i,
  ];

  for (const raw of candidates) {
    for (const sentence of splitSentences(raw)) {
      for (const re of DURATION_PATTERNS) {
        const m = sentence.match(re);
        if (m && m[1]) {
          const phrase = m[1].replace(/\s+/g, " ").trim();
          const formatted = phrase.charAt(0).toUpperCase() + phrase.slice(1);
          return {
            value: formatted,
            sub: sentence.length <= 130 && sentence.toLowerCase() !== formatted.toLowerCase() ? sentence : null,
            confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Extract verified arrival timing / best window without repeating generic boilerplate.
 */
export function extractSupportedWhen({ detail, editorial, insider, detailExtra, openState, formatEventDate, eventWhenLabel } = {}) {
  if (detail && detail._event) {
    const ev = detail._event;
    const ef = typeof formatEventDate === "function" ? formatEventDate(ev.date, ev.time) : {};
    const rel = typeof eventWhenLabel === "function" ? eventWhenLabel(ev) : "";
    const whenText = rel
      ? rel + (ef && ef.time ? " · " + ef.time : "")
      : (ef && ef.wd ? `${ef.wd}, ${ef.mo} ${ef.day}${ef.time ? " · " + ef.time : ""}` : (ev.time || ev.date || ""));
    if (whenText) {
      return {
        value: whenText,
        sub: openState === false ? "Venue currently closed" : null,
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      };
    }
  }

  if (insider && typeof insider.bestTime === "string" && insider.bestTime.trim()) {
    return {
      value: cleanText(insider.bestTime),
      sub: openState === true ? "Open now" : openState === false ? "Closed right now" : null,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    };
  }

  const goodToKnow = cleanText(editorial && editorial.goodToKnow);
  const BOILERPLATE_OPEN = /^open\s+and\s+operating\s+as\s+of\s+this\s+check\b/i;
  const RedTideReport = /\bred\s+tide\s+was\s+clear\b/i;
  if (goodToKnow && !BOILERPLATE_OPEN.test(goodToKnow) && !RedTideReport.test(goodToKnow)) {
    const timeSentences = splitSentences(goodToKnow).filter((s) =>
      /\b(?:am|pm|a\.m\.|p\.m\.|morning|afternoon|evening|sunset|sunrise|dawn|dusk|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|daily|hours|season|early|late|noon|midnight|show)\b/i.test(s)
    );
    if (timeSentences.length > 0) {
      return {
        value: timeSentences[0],
        sub: openState === true ? "Open now" : openState === false ? "Closed right now" : null,
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      };
    }
  }

  // Check insiderMove / watchOut / bestFor for explicit timing advice (e.g. "Come early on a sunny day", "Get there by about 12:45pm")
  for (const field of [editorial && editorial.insiderMove, editorial && editorial.watchOut, editorial && editorial.bestFor]) {
    for (const s of splitSentences(field)) {
      if (/\b(?:arrive\s+early|come\s+early|get\s+there\s+by|before\s+the\s+midday\s+heat|dawn-to-dusk|sunrise\s+to\s+sunset|closes\s+at\s+\d|open\s+only\s+[a-z]+)/i.test(s)) {
        return {
          value: s,
          sub: openState === true ? "Open now" : openState === false ? "Closed right now" : null,
          confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        };
      }
    }
  }

  // Fallback to verified hours array when present
  const hoursLines = (detailExtra && Array.isArray(detailExtra.hours) && detailExtra.hours.length > 0)
    ? detailExtra.hours
    : (detail && detail.oh && Array.isArray(detail.oh.weekdayDescriptions) && detail.oh.weekdayDescriptions.length > 0
        ? detail.oh.weekdayDescriptions
        : null);
  if (hoursLines && hoursLines.length > 0) {
    return {
      value: hoursLines[0],
      sub: openState === true ? "Open now" : openState === false ? "Closed right now" : null,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    };
  }

  return null;
}

/**
 * Extract verified parking or arrival logistics only when explicitly stated.
 */
export function extractSupportedParking({ editorial, insider } = {}) {
  const beachParking = editorial && editorial.beachExtras && typeof editorial.beachExtras.parking === "string"
    ? cleanText(editorial.beachExtras.parking)
    : "";
  if (beachParking) {
    return {
      value: beachParking,
      sub: null,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    };
  }

  const sources = [
    editorial && editorial.insiderMove,
    editorial && editorial.watchOut,
    editorial && editorial.goodToKnow,
    insider && insider.tip,
  ].filter(Boolean);

  const PARKING_RE = /\b(?:park\s+free|free\s+parking|free\s+self-parking|complimentary\s+parking|parking\s+is\s+free|parking\s+fills|parking\s+lot|shared\s+.*\s+lot|garage|[0-9]+-space\s+lot|trailer\s+parking|boat\s+ramp|kayak\/canoe\s+launch|kayak\s+launch|put-in|valet)\b/i;

  for (const src of sources) {
    for (const s of splitSentences(src)) {
      if (PARKING_RE.test(s)) {
        return {
          value: s,
          sub: null,
          confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        };
      }
    }
  }

  return null;
}

function isOfficialAdmissionCandidate(detail) {
  if (!detail || detail._event || isBeachPlace(detail)) return false;
  if (Aff.isTicketyPlace && Aff.isTicketyPlace(detail)) return true;
  const id = Tags.resolveIdentity ? Tags.resolveIdentity(detail.types, false) : "";
  if (["attraction", "museum", "themePark", "tour"].includes(id)) return true;
  const t = ((detail.types || []).join(" ")).toLowerCase();
  return /\b(?:museum|aquarium|zoo|botanical_garden|amusement_park|water_park|performing_arts_theater|art_gallery|cultural_center|historical_landmark)\b/.test(t);
}

/**
 * Extract verified cost / admission / ticket details.
 * Never fabricates prices and never attaches a paid ticket CTA to a beach or free park.
 */
export function extractSupportedCost({ detail, editorial, wayfindNotesList, primaryCta, websiteHref } = {}) {
  if (!detail) return null;
  const beach = isBeachPlace(detail);

  // Scan verified editorial / notes for explicit admission, free window, or dollar facts
  const noteTexts = Array.isArray(wayfindNotesList)
    ? wayfindNotesList.map((n) => (typeof n === "string" ? n : n && n.text)).filter(Boolean)
    : [];
  const textPool = [
    editorial && editorial.watchOut,
    editorial && editorial.insiderMove,
    editorial && editorial.goodToKnow,
    ...noteTexts,
  ].filter(Boolean);

  const COST_RE = /(?:\$[0-9]+(?:\.[0-9]{2})?|\bfree\s+monday\b|\bfree\s+admission\b|\bfree\s+entry\b|\badmission\s+is\s+free\b|\bno\s+admission\b|\bseparate\s+tickets?\b|\bseparate\s+admission\b|\bcombo\s+or\s+guided\s+ticket\b|\bpaid\s+membership\b|\bpark\s+entry\b)/i;

  let admissionFact = null;
  for (const src of textPool) {
    for (const s of splitSentences(src)) {
      if (COST_RE.test(s)) {
        admissionFact = s;
        break;
      }
    }
    if (admissionFact) break;
  }

  // Beaches are free public access; never attach a ticket CTA.
  if (beach) {
    if (admissionFact) {
      return {
        value: admissionFact,
        sub: "Public beach access",
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        action: null,
      };
    }
    return null;
  }

  // Dining / Nightlife cost band
  const coarse = Ranking.coarseCat ? (Ranking.coarseCat(detail) || "") : "";
  const isDining = ["Food", "Nightlife"].includes(coarse);
  const diningCost = isDining && Dining.costForTwo ? Dining.costForTwo(detail) : null;
  const priceLvl = priceLevelOf(
    detail.priceNum != null
      ? detail.priceNum
      : detail.price_level != null
        ? detail.price_level
        : detail.priceLevel
  );

  // Verified partner ticket option (only when non-beach and primaryCta is monetized tickets/deal)
  const hasPartnerTicket = !!(
    primaryCta &&
    primaryCta.monetized &&
    primaryCta.href &&
    (primaryCta.type === "tickets" || primaryCta.type === "deal" || primaryCta.type === "rates")
  );

  // Official site & admission fallback for tickety venues without a monetized partner pick
  const canUseOfficialAdmission = !hasPartnerTicket && isOfficialAdmissionCandidate(detail) && typeof websiteHref === "string" && /^https?:\/\//i.test(websiteHref);

  let action = null;
  if (hasPartnerTicket) {
    action = {
      kind: "partner_ticket",
      label: primaryCta.label || "Check availability",
      href: primaryCta.href,
      provider: primaryCta.provider || null,
      offerId: primaryCta.offerId || null,
      merchant: primaryCta.merchant || null,
      monetized: true,
    };
  } else if (canUseOfficialAdmission) {
    action = {
      kind: "official_admission",
      label: "Official site & admission ↗",
      href: websiteHref,
      monetized: false,
    };
  }

  if (admissionFact) {
    return {
      value: admissionFact,
      sub: hasPartnerTicket
        ? `Bookable via ${primaryCta.merchant || "partner"}`
        : canUseOfficialAdmission
          ? "Check current hours & admission on the official venue site"
          : null,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      action,
    };
  }

  if (diningCost && diningCost.listed && diningCost.text) {
    return {
      value: diningCost.text,
      sub: "Estimated for two",
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      action,
    };
  }

  const canonicalPriceLabel = priceLabel(priceLvl);
  if (canonicalPriceLabel) {
    return {
      value: canonicalPriceLabel,
      sub: null,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      action,
    };
  }

  if (hasPartnerTicket) {
    const lbl = primaryCta.label || "Tickets available";
    const merch = primaryCta.merchant || "";
    const alreadyNamesMerchant = merch && new RegExp(`\\b${merch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lbl);
    return {
      value: alreadyNamesMerchant ? lbl : `${lbl}${merch ? ` via ${merch}` : ""}`,
      sub: Tags.requiresParkAdmission && Tags.requiresParkAdmission(detail.types)
        ? "May require separate park admission"
        : "Live dates & pricing on partner page",
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      action,
    };
  }

  if (canUseOfficialAdmission) {
    return {
      value: "Direct venue admission — check official site for tickets & hours",
      sub: "No partner markup · links directly to the venue",
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      action,
    };
  }

  return null;
}

/**
 * Extract the single highest-leverage insider move without duplicating sentences
 * already shown in `when`, `cost`, or `parking`.
 */
export function extractSupportedInsiderMove({ editorial, insider, usedSentences = new Set() } = {}) {
  const candidates = [
    editorial && editorial.insiderMove,
    editorial && editorial.proMove,
    editorial && editorial.move,
    insider && insider.tip,
    editorial && editorial.foodMove,
    editorial && editorial.drinkMove,
    insider && insider.dontMiss,
    editorial && editorial.watchOut,
  ].filter(Boolean);

  const normSent = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  for (const raw of candidates) {
    const cleaned = cleanText(raw);
    if (!cleaned) continue;
    const sentences = splitSentences(cleaned).filter((s) => !usedSentences.has(normSent(s)));
    if (sentences.length > 0) {
      const text = sentences.slice(0, 2).join(" ");
      return {
        value: text,
        sub: editorial && editorial.bestFor ? cleanText(editorial.bestFor) : null,
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      };
    }
  }
  return null;
}

/**
 * Build the complete above-the-fold "Your Game Plan" decision brief.
 *
 * Pure and synchronous. Safe when any or all inputs are null/undefined.
 */
export function buildGamePlan({
  detail,
  editorial = null,
  detailExtra = null,
  verdict = null,
  openState = null,
  weather = null,
  insider = null,
  wayfindNotesList = null,
  primaryCta = null,
  websiteHref = null,
  nearbyPicks = null,
  nearbyPool = null,
  formatEventDate = null,
  eventWhenLabel = null,
} = {}) {
  if (!detail || typeof detail !== "object") {
    return { show: false, rows: [], primaryRows: [], secondaryRows: [], officialAction: null, weatherPivot: null };
  }

  const placeInsider = insider && detail.id && insider[detail.id] && !insider[detail.id].none
    ? insider[detail.id]
    : (insider && typeof insider.tip === "string" ? insider : null);

  const regime = Ranking.weatherRegime ? Ranking.weatherRegime(weather) : null;
  const leanInfo = Ranking.venueLean ? Ranking.venueLean(detail) : { lean: null, water: false };

  // 1. SHOULD I GO? (Live/contextual verdict)
  let shouldGoRow = null;
  if (openState === false) {
    shouldGoRow = {
      key: "should_go",
      label: "Should I go?",
      icon: "⏸️",
      tone: "wait",
      value: "Wait — closed now",
      sub: editorial && editorial.bestFor ? cleanText(editorial.bestFor) : "Save to your trip for when it opens",
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    };
  } else if (verdict && verdict.text) {
    // Hard guard: never allow "Go now" if openState is not explicitly true
    const safeVerdictText = openState === true
      ? verdict.text
      : String(verdict.text).replace(/\bGo now\s*[—:-]?\s*/i, "").trim() || "Check hours before heading out";
    const safeTone = openState === false ? "wait" : (verdict.tone || "go");
    const weatherSub = weather && typeof weather.temp === "number"
      ? `${Math.round(weather.temp)}°F${regime === "wet" ? " · Rain nearby" : ""}`
      : null;
    const fitSub = editorial && editorial.bestFor ? cleanText(editorial.bestFor) : null;
    shouldGoRow = {
      key: "should_go",
      label: "Should I go?",
      icon: safeTone === "go" ? "✅" : "⏳",
      tone: safeTone,
      value: safeVerdictText,
      sub: fitSub || weatherSub,
      confidence: openState === true ? GAME_PLAN_CONFIDENCE.CONFIRMED : GAME_PLAN_CONFIDENCE.LIKELY,
    };
  } else if (editorial && (editorial.bestFor || editorial.knownFor)) {
    shouldGoRow = {
      key: "should_go",
      label: "Should I go?",
      icon: "🧭",
      tone: "neutral",
      value: cleanText(editorial.bestFor || editorial.knownFor),
      sub: openState == null ? "Live hours not confirmed — check before heading out" : null,
      confidence: GAME_PLAN_CONFIDENCE.LIKELY,
    };
  }

  // 2. WHEN?
  const whenData = extractSupportedWhen({
    detail,
    editorial,
    insider: placeInsider,
    detailExtra,
    openState,
    formatEventDate,
    eventWhenLabel,
  });
  const whenRow = whenData
    ? {
        key: "when",
        label: "When to go",
        icon: "🕐",
        value: whenData.value,
        sub: whenData.sub,
        confidence: whenData.confidence,
      }
    : null;

  // 3. HOW LONG?
  const durationData = extractSupportedDuration({
    editorial,
    insider: placeInsider,
    wayfindNotesList,
  });
  const durationRow = durationData
    ? {
        key: "duration",
        label: "How long",
        icon: "⏱️",
        value: durationData.value,
        sub: durationData.sub,
        confidence: durationData.confidence,
      }
    : null;

  // 4. WHAT WILL IT COST?
  const costData = extractSupportedCost({
    detail,
    editorial,
    wayfindNotesList,
    primaryCta,
    websiteHref,
  });
  const costRow = costData
    ? {
        key: "cost",
        label: "Cost & tickets",
        icon: "🎟️",
        value: costData.value,
        sub: costData.sub,
        confidence: costData.confidence,
        action: costData.action || null,
      }
    : null;

  // 5. PARKING / ARRIVAL
  const parkingData = extractSupportedParking({
    editorial,
    insider: placeInsider,
  });
  const parkingRow = parkingData
    ? {
        key: "parking",
        label: "Parking & arrival",
        icon: "🅿️",
        value: parkingData.value,
        sub: parkingData.sub,
        confidence: parkingData.confidence,
      }
    : null;

  // Track sentences already used so Insider Move never repeats the exact same sentence
  const normSent = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const usedSentences = new Set(
    [whenRow && whenRow.value, costRow && costRow.value, parkingRow && parkingRow.value]
      .filter(Boolean)
      .flatMap((t) => splitSentences(t).map(normSent))
  );

  // 6. WHAT SHOULD I KNOW? (Insider move)
  const insiderData = extractSupportedInsiderMove({
    editorial,
    insider: placeInsider,
    usedSentences,
  });
  const insiderRow = insiderData
    ? {
        key: "insider_move",
        label: "Insider move",
        icon: "🔑",
        value: insiderData.value,
        sub: (!shouldGoRow || shouldGoRow.sub !== insiderData.sub) ? insiderData.sub : null,
        confidence: insiderData.confidence,
      }
    : null;

  // 7. WHAT NEXT? (Geographical pairing or wet-weather indoor pivot)
  let nextStopRow = null;
  let weatherPivot = null;
  const pool = Array.isArray(nearbyPool) ? nearbyPool : [];
  const picks = Array.isArray(nearbyPicks) ? nearbyPicks : [];

  if (regime === "wet" && leanInfo.lean === "outdoor") {
    const indoorCandidate =
      picks.map((x) => x && (x.p || x)).find((p) => p && Ranking.venueLean && Ranking.venueLean(p).lean === "indoor") ||
      pool.find((p) => p && p.id !== detail.id && Ranking.venueLean && Ranking.venueLean(p).lean === "indoor");
    if (indoorCandidate) {
      weatherPivot = indoorCandidate;
      nextStopRow = {
        key: "what_next",
        label: "Rain backup nearby",
        icon: "☔",
        value: indoorCandidate.name,
        sub: "Indoor option nearby while it's wet outside",
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        targetPlace: indoorCandidate,
      };
    }
  }

  if (!nextStopRow && picks.length > 0) {
    const topPick = picks[0];
    const p = topPick && (topPick.p || topPick);
    if (p && p.name) {
      nextStopRow = {
        key: "what_next",
        label: "Pairs well with",
        icon: "➡️",
        value: p.name,
        sub: topPick.reason || "Strong nearby stop to pair with this visit",
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        targetPlace: p,
      };
    }
  }

  const allRows = [
    shouldGoRow,
    whenRow,
    durationRow,
    costRow,
    insiderRow,
    parkingRow,
    nextStopRow,
  ].filter((r) => r && typeof r.value === "string" && r.value.trim().length > 0);

  // Only render the Game Plan brief when we have at least one substantive
  // decision signal beyond a bare open/closed status (e.g. editorial, insider,
  // cost/ticket action, hours/timing, parking, rain pivot, or pairing).
  const hasSubstantiveSignal = allRows.some((r) => r.key !== "should_go") ||
    !!(shouldGoRow && shouldGoRow.sub) ||
    (regime === "wet");

  if (!hasSubstantiveSignal || allRows.length === 0) {
    return { show: false, rows: [], primaryRows: [], secondaryRows: [], officialAction: null, weatherPivot: null };
  }

  const primaryRows = allRows.slice(0, 4);
  const secondaryRows = allRows.slice(4);
  const officialAction = costRow && costRow.action && costRow.action.kind === "official_admission"
    ? costRow.action
    : null;

  return {
    show: true,
    rows: allRows,
    primaryRows,
    secondaryRows,
    officialAction,
    weatherPivot,
  };
}
