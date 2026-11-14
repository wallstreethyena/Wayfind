// lib/plannerParse.js — Deterministic constraint, date, city, preference, and
// conversational-edit parser for Wayfind Planner.
//
// Zero LLM spend: parses dates ("Nov 20 to 23", "this weekend", "Friday to Sunday",
// "3 days"), covered cities + Greater-metro landmarks, party size, budget,
// driving/pace preferences, and conversational edits on an active trip.

import { COVERED_CITIES, CITY_ALIASES, normalizeCityText } from "./landingCities.js";
import { addCalendarDays, normalizeStopDate, sortedItems } from "./tripDays.js";

const MONTH_INDEX = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAY_MAP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// Landmark & neighborhood aliases mapped to their canonical Wayfind city slug.
const NEIGHBORHOOD_TO_CITY = [
  ["disney springs", "orlando"],
  ["lake buena vista", "orlando"],
  ["winter park", "orlando"],
  ["international drive", "orlando"],
  ["i drive", "orlando"],
  ["leu gardens", "orlando"],
  ["gaylord palms", "kissimmee"],
  ["celebration", "kissimmee"],
  ["old town kissimmee", "kissimmee"],
  ["ybor city", "tampa"],
  ["ybor", "tampa"],
  ["hyde park", "tampa"],
  ["armature works", "tampa"],
  ["water street", "tampa"],
  ["busch gardens", "tampa"],
  ["st armands", "sarasota"],
  ["lido key", "sarasota"],
  ["utc sarasota", "sarasota"],
  ["wynwood", "miami"],
  ["brickell", "miami"],
  ["coconut grove", "miami"],
  ["little havana", "miami"],
  ["coral gables", "miami"],
  ["las olas", "fort-lauderdale"],
  ["waikiki", "honolulu"],
];

const CITY_LOOKUP = (() => {
  const entries = [];
  for (const [slug, city] of Object.entries(COVERED_CITIES)) {
    const norm = normalizeCityText(city.name);
    entries.push({ phrase: norm, slug, city });
    for (const alias of CITY_ALIASES[slug] || []) {
      entries.push({ phrase: normalizeCityText(alias), slug, city });
    }
  }
  for (const [phrase, slug] of NEIGHBORHOOD_TO_CITY) {
    if (COVERED_CITIES[slug]) {
      entries.push({ phrase, slug, city: COVERED_CITIES[slug], neighborhood: phrase });
    }
  }
  return entries.sort((a, b) => b.phrase.length - a.phrase.length);
})();

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function buildYmd(year, month, day) {
  return normalizeStopDate(`${year}-${pad2(month)}-${pad2(day)}`);
}

export function weekdayOfYmd(ymd) {
  const norm = normalizeStopDate(ymd);
  if (!norm) return null;
  const [y, m, d] = norm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function enumerateDateSpan(startDate, endDate, maxDays = 10) {
  const s = normalizeStopDate(startDate);
  const e = normalizeStopDate(endDate) || s;
  if (!s) return [];
  const out = [];
  let cur = s;
  while (cur && cur <= e && out.length < maxDays) {
    out.push(cur);
    if (cur === e) break;
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

function resolveYearForMonthDay(month, day, todayYmd) {
  const base = normalizeStopDate(todayYmd) || "2026-11-12";
  const [ty] = base.split("-").map(Number);
  const candidate = buildYmd(ty, month, day);
  if (!candidate) return buildYmd(ty + 1, month, day);
  // If more than 60 days in the past relative to today, roll into next year.
  const sixtyAgo = addCalendarDays(base, -60);
  if (sixtyAgo && candidate < sixtyAgo) {
    return buildYmd(ty + 1, month, day) || candidate;
  }
  return candidate;
}

/**
 * Deterministically parses date spans and day counts from natural language.
 */
export function parsePlannerDates(text, todayYmd = "2026-11-12") {
  const raw = String(text || "");
  const base = normalizeStopDate(todayYmd) || "2026-11-12";

  // 1. Explicit ISO range: 2026-11-20 to 2026-11-23
  const isoRange = raw.match(/\b(\d{4}-\d{2}-\d{2})\s*(?:to|through|thru|until|[-–—])\s*(\d{4}-\d{2}-\d{2})\b/i);
  if (isoRange) {
    const startDate = normalizeStopDate(isoRange[1]);
    const endDate = normalizeStopDate(isoRange[2]);
    if (startDate && endDate && endDate >= startDate) {
      const days = enumerateDateSpan(startDate, endDate);
      return { startDate, endDate: days[days.length - 1], days, dayCount: days.length, explicit: true };
    }
  }

  // 2. Month Day to [Month] Day: "Nov 20 to 23", "Nov 20–23", "November 20 to Dec 1"
  const monthPattern = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const mdRangeRx = new RegExp(
    `\\b${monthPattern}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|through|thru|until|[-–—])\\s*(?:${monthPattern}\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
    "i"
  );
  const mdRange = raw.match(mdRangeRx);
  if (mdRange) {
    const m1 = MONTH_INDEX[mdRange[1].toLowerCase().replace(/\.$/, "")];
    const d1 = Number(mdRange[2]);
    const m2 = mdRange[3] ? MONTH_INDEX[mdRange[3].toLowerCase().replace(/\.$/, "")] : m1;
    const d2 = Number(mdRange[4]);
    const explicitYear = mdRange[5] ? Number(mdRange[5]) : null;
    const startDate = explicitYear ? buildYmd(explicitYear, m1, d1) : resolveYearForMonthDay(m1, d1, base);
    let endDate = explicitYear
      ? buildYmd(m2 < m1 ? explicitYear + 1 : explicitYear, m2, d2)
      : resolveYearForMonthDay(m2, d2, startDate || base);
    if (startDate && endDate && endDate < startDate && !mdRange[3]) {
      endDate = startDate;
    }
    if (startDate && endDate && endDate >= startDate) {
      const days = enumerateDateSpan(startDate, endDate);
      return { startDate, endDate: days[days.length - 1], days, dayCount: days.length, explicit: true };
    }
  }

  // 3. Numeric slash range: "11/20 to 11/23" or "11/20-11/23"
  const slashRange = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\s*(?:to|through|thru|[-–—])\s*(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/i);
  if (slashRange) {
    const m1 = Number(slashRange[1]);
    const d1 = Number(slashRange[2]);
    const y1 = slashRange[3] ? Number(slashRange[3]) : null;
    const m2 = Number(slashRange[4]);
    const d2 = Number(slashRange[5]);
    const y2 = slashRange[6] ? Number(slashRange[6]) : y1;
    const startDate = y1 ? buildYmd(y1, m1, d1) : resolveYearForMonthDay(m1, d1, base);
    const endDate = y2 ? buildYmd(y2, m2, d2) : resolveYearForMonthDay(m2, d2, startDate || base);
    if (startDate && endDate && endDate >= startDate) {
      const days = enumerateDateSpan(startDate, endDate);
      return { startDate, endDate: days[days.length - 1], days, dayCount: days.length, explicit: true };
    }
  }

  // 4. Single Month Day ("Nov 20", "December 12")
  const singleMdRx = new RegExp(`\\b${monthPattern}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, "i");
  const singleMd = raw.match(singleMdRx);
  if (singleMd) {
    const m1 = MONTH_INDEX[singleMd[1].toLowerCase().replace(/\.$/, "")];
    const d1 = Number(singleMd[2]);
    const y1 = singleMd[3] ? Number(singleMd[3]) : null;
    const startDate = y1 ? buildYmd(y1, m1, d1) : resolveYearForMonthDay(m1, d1, base);
    if (startDate) {
      const countMatch = raw.match(/\b(\d)\s*(?:-\s*)?(?:day|days|night|nights)\b/i);
      const count = countMatch ? Math.min(7, Math.max(1, Number(countMatch[1]))) : 1;
      const endDate = addCalendarDays(startDate, count - 1);
      const days = enumerateDateSpan(startDate, endDate);
      return { startDate, endDate: days[days.length - 1], days, dayCount: days.length, explicit: true };
    }
  }

  // 5. Relative phrases: "this weekend", "next weekend", "tonight", "tomorrow", "Friday to Sunday"
  const lower = raw.toLowerCase();
  const baseDow = weekdayOfYmd(base) ?? 4;

  const wdSpan = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\s*(?:to|through|thru|[-–—])\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/);
  if (wdSpan) {
    const d1 = WEEKDAY_MAP[wdSpan[1]];
    const d2 = WEEKDAY_MAP[wdSpan[2]];
    if (d1 != null && d2 != null) {
      const offset1 = (d1 - baseDow + 7) % 7;
      const spanLen = ((d2 - d1 + 7) % 7) + 1;
      const startDate = addCalendarDays(base, offset1);
      const endDate = addCalendarDays(startDate, Math.min(6, spanLen - 1));
      const days = enumerateDateSpan(startDate, endDate);
      return { startDate, endDate: days[days.length - 1], days, dayCount: days.length, explicit: true };
    }
  }

  if (/\bnext\s+weekend\b/.test(lower)) {
    const daysUntilFri = ((5 - baseDow + 7) % 7) + 7;
    const startDate = addCalendarDays(base, daysUntilFri);
    const endDate = addCalendarDays(startDate, 2);
    const days = enumerateDateSpan(startDate, endDate);
    return { startDate, endDate, days, dayCount: days.length, explicit: true };
  }

  if (/\b(?:this\s+weekend|for\s+the\s+weekend|a\s+weekend)\b/.test(lower)) {
    const daysUntilFri = baseDow === 6 ? 0 : baseDow === 0 ? 0 : (5 - baseDow + 7) % 7;
    const startDate = addCalendarDays(base, daysUntilFri);
    const endDate = baseDow === 0 ? startDate : baseDow === 6 ? addCalendarDays(startDate, 1) : addCalendarDays(startDate, 2);
    const days = enumerateDateSpan(startDate, endDate);
    return { startDate, endDate, days, dayCount: days.length, explicit: false, inferredWeekend: true };
  }

  if (/\btomorrow\b/.test(lower)) {
    const d = addCalendarDays(base, 1);
    return { startDate: d, endDate: d, days: [d], dayCount: 1, explicit: true };
  }

  if (/\b(?:tonight|today)\b/.test(lower)) {
    return { startDate: base, endDate: base, days: [base], dayCount: 1, explicit: true };
  }

  // 6. Explicit day count without calendar dates: "3 days", "4-day trip", "a day around"
  const wordNums = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const numDayMatch = lower.match(/\b(\d|one|two|three|four|five|six|seven)\s*(?:-\s*)?(?:day|days|night|nights)\b/);
  if (numDayMatch) {
    const rawN = numDayMatch[1];
    const n = Math.min(7, Math.max(1, Number(rawN) || wordNums[rawN] || 2));
    return { startDate: null, endDate: null, days: [], dayCount: n, explicit: false };
  }
  if (/\bbuild\s+a\s+day\b|\bday\s+trip\b|\bfull\s+day\b/.test(lower)) {
    return { startDate: base, endDate: base, days: [base], dayCount: 1, explicit: false };
  }

  return { startDate: null, endDate: null, days: [], dayCount: null, explicit: false };
}

/**
 * Resolves a covered Wayfind city from free text (exact word-boundary match).
 */
export function parsePlannerCity(text) {
  const norm = ` ${normalizeCityText(text)} `;
  if (!norm.trim()) return null;
  for (const entry of CITY_LOOKUP) {
    if (!entry.phrase) continue;
    if (norm.includes(` ${entry.phrase} `)) {
      return {
        slug: entry.slug,
        name: entry.city.name,
        state: entry.city.state,
        lat: entry.city.lat,
        lng: entry.city.lng,
        neighborhood: entry.neighborhood || null,
      };
    }
  }
  return null;
}

/**
 * Extracts party, interests, budget, pace/driving, and avoidances.
 */
export function parsePlannerPreferences(text) {
  const lower = String(text || "").toLowerCase();

  // Party
  let adults = null;
  let kids = 0;
  let partyType = null;
  const adultMatch = lower.match(/\b(\d+|two|three|four)\s+adults?\b/);
  if (adultMatch) {
    const map = { two: 2, three: 3, four: 4 };
    adults = Number(adultMatch[1]) || map[adultMatch[1]] || 2;
  } else if (/\b(?:my\s+wife|my\s+husband|my\s+partner|girlfriend|boyfriend|couple|date\s+weekend|anniversary|two\s+of\s+us)\b/.test(lower)) {
    adults = 2;
    partyType = "couple";
  } else if (/\bsolo\b|\bjust\s+me\b/.test(lower)) {
    adults = 1;
    partyType = "solo";
  }
  if (/\b(?:kid|kids|child|children|toddler|toddlers|family)\b/.test(lower)) {
    const km = lower.match(/\b(\d+|one|two|three)\s+(?:kids?|children)\b/);
    const map = { one: 1, two: 2, three: 3 };
    kids = km ? (Number(km[1]) || map[km[1]] || 1) : 1;
    partyType = "family";
  } else if (adults === 2 && !partyType) {
    partyType = "adults";
  }

  // Interests
  const interests = [];
  const checks = [
    ["christmas", /\b(?:christmas|holiday|lights|santa|festive|tree\s+stroll|dazzling|gaylord|jingle|nutcracker)\b/],
    ["lights", /\b(?:lights|light\s+show|lantern|illumination|tree\s+lighting)\b/],
    ["food", /\b(?:food|eat|eating|restaurants?|dining|foodie|culinary|bites|meals?)\b/],
    ["breakfast", /\b(?:breakfast|coffee|bakery|cafe|morning\s+bite)\b/],
    ["brunch", /\b(?:brunch|mimosa)\b/],
    ["dinner", /\b(?:dinner|steakhouse|date\s+night|supper)\b/],
    ["bars", /\b(?:bars?|cocktails?|drinks?|speakeasy|nightlife|holiday\s+bar|rooftop)\b/],
    ["indoors", /\b(?:indoors?|inside|air\s+conditioned|rainy|museum|aquarium|art)\b/],
    ["beach", /\b(?:beach|beaches|sunset|coast|waterfront|island)\b/],
    ["outdoors", /\b(?:outdoors?|parks?|gardens?|nature|walk|stroll|botanical)\b/],
    ["shows", /\b(?:shows?|theater|ballet|concert|live\s+music)\b/],
    ["markets", /\b(?:markets?|shopping|stroll|village|boutiques?)\b/],
    ["theme_parks", /\b(?:theme\s+parks?|disney\s+world|universal|epcot|magic\s+kingdom|seaworld|busch\s+gardens)\b/],
  ];
  for (const [key, rx] of checks) {
    if (rx.test(lower)) interests.push(key);
  }

  // Budget
  let budget = null;
  if (/\bfree\s+only\b|\bonly\s+free\b/.test(lower)) budget = "free";
  else if (/\b(?:cheap|cheaper|budget|affordable|low\s+cost|inexpensive|save\s+money|under\s+\$)\b/.test(lower)) budget = "cheap";
  else if (/\b(?:splurge|luxury|upscale|fine\s+dining|high\s+end)\b/.test(lower)) budget = "splurge";

  // Driving / pace
  const minimizeDriving = /\b(?:don'?t\s+want\s+to\s+(?:drive|spend.*driving)|not\s+too\s+much\s+driving|minimal\s+driving|(?:minimize|reduce|cut|less)\s+(?:the\s+|our\s+|my\s+)?driving|not\s+drive\s+all\s+over|walkable|close\s+together|nearby|stay\s+close)\b/.test(lower);
  let pace = "balanced";
  if (/\b(?:relaxed|slow|chill|easygoing|unhurried|light\s+schedule)\b/.test(lower)) pace = "relaxed";
  else if (/\b(?:packed|full|see\s+everything|max\s+out)\b/.test(lower)) pace = "packed";

  // Avoidances
  const avoid = [];
  if (/\b(?:no\s+theme\s+parks?|avoid\s+theme\s+parks?|skip\s+disney|not\s+theme\s+parks?)\b/.test(lower)) avoid.push("theme_parks");
  if (/\b(?:avoid\s+crowds?|no\s+crowds?|quiet|less\s+crowded)\b/.test(lower)) avoid.push("crowds");
  if (minimizeDriving) avoid.push("cross_city_driving");

  return {
    adults,
    kids,
    partyType,
    interests,
    budget,
    minimizeDriving,
    pace,
    avoid,
  };
}

function normalizeMatchTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolves a weekday word ("Friday", "Saturday") or ISO date against a trip's planned days.
 */
export function resolveTargetDayInTrip(text, trip, todayYmd = "2026-11-12") {
  if (!text) return null;
  const iso = String(text).match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && normalizeStopDate(iso[1])) return normalizeStopDate(iso[1]);

  const parsed = parsePlannerDates(text, todayYmd);
  if (parsed.explicit && parsed.startDate && parsed.dayCount === 1) {
    return parsed.startDate;
  }

  const lower = String(text).toLowerCase();
  let targetDow = null;
  for (const [word, dow] of Object.entries(WEEKDAY_MAP)) {
    const rx = new RegExp(`\\b${word}\\b`, "i");
    if (rx.test(lower)) {
      targetDow = dow;
      break;
    }
  }
  if (targetDow == null) return null;

  // Search within the trip's start..end span or existing item days first!
  const candidateDays = new Set();
  if (trip && trip.startDate) {
    for (const d of enumerateDateSpan(trip.startDate, trip.endDate || trip.startDate, 14)) {
      candidateDays.add(d);
    }
  }
  for (const it of (trip && trip.items) || []) {
    const d = normalizeStopDate(it && it.day);
    if (d) candidateDays.add(d);
  }
  const sorted = [...candidateDays].sort();
  for (const d of sorted) {
    if (weekdayOfYmd(d) === targetDow) return d;
  }
  if (sorted.length > 0) {
    // Allow extending 1–3 days past existing trip dates if user moves to an adjacent weekday
    const first = sorted[0];
    for (let offset = -2; offset <= 7; offset += 1) {
      const d = addCalendarDays(first, offset);
      if (d && weekdayOfYmd(d) === targetDow) return d;
    }
  }
  const base = normalizeStopDate(todayYmd) || "2026-11-12";
  const baseDow = weekdayOfYmd(base) ?? 4;
  return addCalendarDays(base, (targetDow - baseDow + 7) % 7);
}

/**
 * Finds the best matching stop inside `trip.items` by fuzzy name or by (day + meal/role).
 */
export function matchStopInTrip(queryFragment, trip, { targetDay = null, roleHint = null, seedPlace = null } = {}) {
  const items = sortedItems(trip, { today: null });
  if (!items.length) return null;

  const rawNorm = normalizeMatchTokens(queryFragment).trim();
  if (/^(?:this|it|that|this\s+stop|this\s+place)$/.test(rawNorm)) {
    if (seedPlace && seedPlace.id) {
      const seeded = items.find((it) => String(it.id) === String(seedPlace.id));
      if (seeded) return seeded;
    }
    if (targetDay) {
      return items.find((it) => normalizeStopDate(it.day) !== targetDay) || items[0];
    }
    return items[0];
  }

  const frag = rawNorm
    .replace(/\b(?:the|my|our|this|stop|on|to|from|at|in|for|friday|saturday|sunday|monday|tuesday|wednesday|thursday|fri|sat|sun|mon|tue|wed|thu)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (frag && !/^(?:dinner|lunch|breakfast|brunch|meal|food|restaurant|it|that)$/.test(frag)) {
    let best = null;
    let bestScore = 0;
    const fragWords = frag.split(" ").filter((w) => w.length >= 2);
    for (const item of items) {
      const name = normalizeMatchTokens((item.place && item.place.name) || item.id);
      if (!name) continue;
      if (name === frag || name.includes(frag) || frag.includes(name)) {
        const score = 100 + Math.min(name.length, frag.length);
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
        continue;
      }
      const matched = fragWords.filter((w) => name.split(" ").some((nw) => nw === w || (w.length >= 4 && nw.startsWith(w))));
      if (matched.length > 0) {
        const score = (matched.length / fragWords.length) * 80 + matched.length * 5;
        if (score > bestScore && score >= 40) {
          bestScore = score;
          best = item;
        }
      }
    }
    if (best) return best;
  }

  // Match by day + role ("Friday dinner", "Saturday breakfast", "Friday stop")
  const dayPool = targetDay ? items.filter((it) => normalizeStopDate(it.day) === targetDay) : items;
  if (!dayPool.length) return null;

  const role = (roleHint || frag || "").toLowerCase();
  const isFoodItem = (it) => {
    const p = (it && it.place) || {};
    const blob = `${p.type || ""} ${p.category || ""} ${p.name || ""} ${it.note || ""}`.toLowerCase();
    return /\b(?:restaurant|food|dining|bar|grill|bistro|kitchen|cafe|bakery|steak|seafood|tavern|pizzeria|diner|brunch|dinner|breakfast|lunch)\b/.test(blob);
  };

  if (/\b(?:dinner|supper|evening\s+meal)\b/.test(role)) {
    const foodOnDay = dayPool.filter(isFoodItem);
    if (foodOnDay.length) return foodOnDay[foodOnDay.length - 1];
    return dayPool[dayPool.length - 1];
  }
  if (/\b(?:breakfast|brunch|coffee|morning)\b/.test(role)) {
    const foodOnDay = dayPool.filter(isFoodItem);
    if (foodOnDay.length) return foodOnDay[0];
    return dayPool[0];
  }
  if (/\b(?:lunch|midday)\b/.test(role)) {
    const foodOnDay = dayPool.filter(isFoodItem);
    if (foodOnDay.length) return foodOnDay[Math.floor(foodOnDay.length / 2)];
  }

  return null;
}

/**
 * Parses conversational edit commands against an existing `activeTrip`.
 */
export function parseConversationalEdit(message, activeTrip, todayYmd = "2026-11-12", seedPlace = null) {
  if (!activeTrip || !Array.isArray(activeTrip.items) || activeTrip.items.length === 0) {
    return null;
  }
  const raw = String(message || "").trim();
  const lower = raw.toLowerCase();

  // 1. Move <stop> to <day>: "Move Dazzling Nights to Saturday", "Move this to Saturday"
  const moveMatch = raw.match(/^\s*(?:please\s+)?(?:can\s+you\s+)?(?:move|shift|reschedule|put|switch)\s+(.+?)\s+(?:to|onto|for)\s+(.+?)[.?!]*$/i);
  if (moveMatch) {
    const stopPhrase = moveMatch[1].trim();
    const dayPhrase = moveMatch[2].trim();
    const targetDay = resolveTargetDayInTrip(dayPhrase, activeTrip, todayYmd);
    const matchedItem = matchStopInTrip(stopPhrase, activeTrip, { targetDay, seedPlace });
    if (matchedItem && targetDay) {
      return {
        kind: "move_stop",
        stopId: matchedItem.id,
        stopName: (matchedItem.place && matchedItem.place.name) || matchedItem.id,
        fromDay: matchedItem.day || null,
        targetDay,
      };
    }
  }

  // 2. Remove / drop / delete <stop>
  const removeMatch = raw.match(/^\s*(?:please\s+)?(?:remove|delete|drop|skip|take\s+off|cut)\s+(.+?)(?:\s+from\s+(?:my|the|our)\s+(?:trip|itinerary|plan|day))?[.?!]*$/i);
  if (removeMatch && !/\bdriving\b/i.test(removeMatch[1])) {
    const targetDay = resolveTargetDayInTrip(raw, activeTrip, todayYmd);
    const matchedItem = matchStopInTrip(removeMatch[1], activeTrip, { targetDay, seedPlace });
    if (matchedItem) {
      return {
        kind: "remove_stop",
        stopId: matchedItem.id,
        stopName: (matchedItem.place && matchedItem.place.name) || matchedItem.id,
      };
    }
  }

  // 3. Replace / swap <stop or day+meal> with <criteria>: "Replace Friday dinner with something nearby"
  const replaceMatch = raw.match(/^\s*(?:please\s+)?(?:can\s+you\s+)?(?:replace|swap|change|switch\s+out|sub\s+out)\s+(.+?)(?:\s+(?:with|for)\s+(.+?))?[.?!]*$/i);
  if (replaceMatch) {
    const targetPhrase = replaceMatch[1].trim();
    const criteriaPhrase = (replaceMatch[2] || "").trim();
    const targetDay = resolveTargetDayInTrip(targetPhrase, activeTrip, todayYmd) || resolveTargetDayInTrip(raw, activeTrip, todayYmd);
    const matchedItem = matchStopInTrip(targetPhrase, activeTrip, { targetDay, roleHint: targetPhrase, seedPlace });
    if (matchedItem) {
      const prefs = parsePlannerPreferences(`${targetPhrase} ${criteriaPhrase}`);
      return {
        kind: "replace_stop",
        stopId: matchedItem.id,
        stopName: (matchedItem.place && matchedItem.place.name) || matchedItem.id,
        targetDay: matchedItem.day || targetDay || null,
        nearby: /\b(?:nearby|close|closer|walking|walkable|around\s+there|next\s+door)\b/i.test(raw),
        cheaper: prefs.budget === "cheap" || prefs.budget === "free",
        indoors: prefs.interests.includes("indoors"),
        criteria: criteriaPhrase || "a great Wayfind option",
        preferences: prefs,
      };
    }
  }

  // 4. Budget / vibe day revision: "Make Saturday cheaper", "Make this cheaper", "Make Sunday mostly indoors"
  if (/\bmake\s+(?:this|it|the\s+trip|the\s+day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(lower) || /\bcheaper\b/.test(lower) || /\bmostly\s+indoors?\b/.test(lower)) {
    const targetDay = resolveTargetDayInTrip(raw, activeTrip, todayYmd);
    const prefs = parsePlannerPreferences(raw);
    if (prefs.budget === "cheap" || prefs.budget === "free") {
      return {
        kind: "revise_budget",
        targetDay,
        budget: prefs.budget,
        preferences: prefs,
      };
    }
    if (prefs.interests.includes("indoors")) {
      return {
        kind: "revise_indoors",
        targetDay,
        preferences: prefs,
      };
    }
  }

  // 5. Add stop: "Add breakfast near Disney Springs", "Add breakfast", "Find dinner nearby", "Add something indoors"
  if (/^\s*(?:please\s+)?(?:add|include|put\s+in|find|squeeze\s+in)\b/i.test(lower)) {
    const targetDay = resolveTargetDayInTrip(raw, activeTrip, todayYmd);
    const prefs = parsePlannerPreferences(raw);
    const cityHint = parsePlannerCity(raw);
    let slotRole = "activity";
    if (/\b(?:breakfast|coffee|bakery|morning)\b/.test(lower)) slotRole = "breakfast";
    else if (/\bbrunch\b/.test(lower)) slotRole = "brunch";
    else if (/\blunch\b/.test(lower)) slotRole = "lunch";
    else if (/\b(?:dinner|supper)\b/.test(lower)) slotRole = "dinner";
    else if (/\b(?:bar|drinks?|cocktails?|nightcap)\b/.test(lower)) slotRole = "drinks";
    else if (/\bindoors?\b/.test(lower)) slotRole = "indoors";

    return {
      kind: "add_stop",
      targetDay,
      slotRole,
      nearby: /\b(?:nearby|near|close|around)\b/.test(lower),
      anchorNeighborhood: cityHint && cityHint.neighborhood ? cityHint.neighborhood : null,
      preferences: prefs,
      queryHint: raw,
    };
  }

  // 6. Optimize route / reduce driving / organize unscheduled stops
  if (/\b(?:optimize|reorder|(?:reduce|less|cut|minimize)\s+(?:the\s+|our\s+|my\s+)?driving|organize\s+(?:these|my)|group\s+by\s+area|route\s+order)\b/.test(lower)) {
    const targetDay = resolveTargetDayInTrip(raw, activeTrip, todayYmd);
    return {
      kind: "optimize_trip",
      targetDay,
    };
  }

  return null;
}

/**
 * High-precision classifier: true when a user message is asking to plan, build,
 * schedule, or edit a multi-stop day or trip (as opposed to a simple Q&A lookup).
 */
export function isPlannerIntent(message, { hasActiveTrip = false } = {}) {
  const raw = String(message || "").trim();
  if (!raw || raw.length < 4) return false;
  const lower = raw.toLowerCase();

  if (hasActiveTrip && parseConversationalEdit(raw, { items: [{ id: "probe", place: { name: "probe" } }] })) {
    return true;
  }

  // Multi-day date range ("Nov 20 to 23", "Friday to Sunday", "3 days") + city or interests
  const dates = parsePlannerDates(raw);
  if (dates.dayCount && dates.dayCount >= 2) return true;
  if (dates.explicit && /\b(?:going\s+to|visiting|trip|weekend|itinerary|plan|days?|adults?|kids?|wife|husband|family)\b/i.test(raw)) {
    return true;
  }

  if (/\b(?:build\s+(?:me\s+)?(?:a\s+)?(?:trip|itinerary|day|weekend|plan)|plan\s+(?:my|our|a)\s+(?:trip|weekend|itinerary|day|visit|christmas)|create\s+(?:an?\s+)?itinerary|day\s+by\s+day|multi\s*day|organize\s+these\s+into\s+days)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Full deterministic parse of a planning turn.
 */
export function parsePlannerRequest(message, {
  todayYmd = "2026-11-12",
  activeTrip = null,
  contextCity = null,
  seedPlace = null,
} = {}) {
  const raw = String(message || "").trim().slice(0, 600);
  const edit = activeTrip ? parseConversationalEdit(raw, activeTrip, todayYmd, seedPlace) : null;
  const cityFromText = parsePlannerCity(raw);
  const cityFromContext = contextCity ? parsePlannerCity(contextCity) : null;
  const cityFromTrip = activeTrip && activeTrip.city ? parsePlannerCity(activeTrip.city) : null;
  const cityFromSeed = seedPlace && (seedPlace.city || seedPlace.address)
    ? parsePlannerCity(`${seedPlace.city || ""} ${seedPlace.address || ""}`)
    : null;

  const destination = cityFromText || (edit ? cityFromTrip : null) || cityFromSeed || cityFromContext || cityFromTrip || null;
  const dates = parsePlannerDates(raw, todayYmd);
  const preferences = parsePlannerPreferences(raw);

  // Determine if ONE high-value clarification question is needed:
  // Only ask when we have neither an edit intent nor a destination!
  let clarificationQuestion = null;
  if (!edit && !destination) {
    clarificationQuestion = "Which Florida city are you heading to, and what dates (or how many days) are you planning?";
  } else if (!edit && destination && !dates.startDate && !dates.dayCount && /\b(?:tell\s+me\s+your\s+dates|help\s+me\s+pick\s+dates|plan\s+a\s+florida\s+christmas\s+trip)\b/i.test(raw)) {
    clarificationQuestion = `What dates are you visiting ${destination.name} (or how many days should I plan)?`;
  }

  // Default dates when destination is known and user gave e.g. "Orlando weekend" or "build a trip to Orlando" without specific dates:
  let resolvedDays = dates.days;
  let startDate = dates.startDate;
  let endDate = dates.endDate;
  if (!edit && !clarificationQuestion && (!resolvedDays || resolvedDays.length === 0)) {
    const count = dates.dayCount || 3;
    const base = normalizeStopDate(todayYmd) || "2026-11-12";
    const baseDow = weekdayOfYmd(base) ?? 4;
    const daysUntilFri = (5 - baseDow + 7) % 7;
    startDate = count === 1 ? base : addCalendarDays(base, daysUntilFri || 1);
    endDate = addCalendarDays(startDate, count - 1);
    resolvedDays = enumerateDateSpan(startDate, endDate);
  }

  return {
    raw,
    edit,
    destination,
    dates: {
      ...dates,
      startDate,
      endDate,
      days: resolvedDays,
      dayCount: resolvedDays.length || dates.dayCount || 0,
    },
    preferences,
    clarificationQuestion,
  };
}
