// lib/searchConstraints.js — deterministic multi-constraint parser for
// "moment of decision" queries ("cheap date tonight near Sarasota",
// "kids are bored and it's raining", "Christmas stuff open now",
// "my 2 year old is losing it and it's pouring",
// "cheap indoor date after 9 tonight",
// "something free open for 90 minutes near me",
// "my parents can't walk much, what can we do tonight",
// "Christmas tonight with kids but no theme parks",
// "quiet date indoors near Sarasota",
// "something fun that isn't food or shopping",
// "outdoor thing before sunset",
// "free Christmas lights tonight",
// "museum open late").
//
// Pure, zero I/O, zero model calls. A compound query resolves ONLY when every
// non-city word belongs to the known constraint + intent vocabulary AND at
// least one concrete intent/moment anchor is present. That keeps venue names
// ("Rainforest Cafe", "Christmas Lane"), dish words ("best tacos", "free pizza"),
// and uncovered cities ("free things to do in gastonia") out of phrase mode.

const FILLER_WORDS = new Set([
  "a", "an", "and", "are", "around", "at", "be", "best", "bored", "but", "can",
  "cool", "cranky", "day", "do", "doing", "find", "for", "from", "fun", "fussy",
  "get", "go", "going", "good", "got", "great", "have", "here", "i", "im",
  "idea", "ideas", "in", "into", "is", "it", "its", "jiw", "just", "looking",
  "losing", "me", "meltdown", "mind", "my", "near", "nearby", "need", "nice",
  "of", "on", "options", "or", "our", "out", "place", "places", "plan", "plans",
  "please", "really", "see", "should", "so", "some", "something", "spot",
  "spots", "stuff", "take", "that", "the", "themed", "there", "thing", "things",
  "this", "to", "top", "try", "us", "visit", "want", "we", "what", "whats",
  "where", "with",
]);

const NOW_WORDS = new Set(["now", "right", "currently", "immediately", "jiw"]);
const TONIGHT_WORDS = new Set(["tonight", "evening", "night"]);
const TODAY_WORDS = new Set(["today", "afternoon", "morning"]);
const WEEKEND_WORDS = new Set(["weekend", "saturday", "sunday"]);
const OPEN_WORDS = new Set(["open", "opened", "operating"]);

const RAIN_WORDS = new Set([
  "rain", "raining", "rainy", "storm", "storming", "stormy", "wet", "downpour",
  "pouring", "soaked", "drenched", "thunderstorm", "thunderstorms",
]);
const INDOOR_WORDS = new Set(["indoor", "indoors", "inside", "ac"]);
const OUTDOOR_WORDS = new Set(["outdoor", "outdoors", "outside"]);
const QUIET_WORDS = new Set(["quiet", "calm", "intimate", "cozy", "peaceful", "lowkey"]);
const CHEAP_WORDS = new Set(["cheap", "budget", "inexpensive", "affordable", "lowcost"]);

const COUPLE_WORDS = new Set(["date", "datenight", "romantic", "anniversary", "couples", "couple", "two"]);
const TODDLER_WORDS = new Set(["toddler", "toddlers", "preschool", "stroller", "baby"]);
const FAMILY_WORDS = new Set(["kid", "kids", "child", "children", "family", "families"]);
const MOBILITY_PEOPLE_WORDS = new Set(["parents", "parent", "seniors", "elderly", "grandparents", "mom", "dad"]);
const MOBILITY_CONSTRAINT_WORDS = new Set(["wheelchair", "accessible", "seated", "mobility"]);

const CHRISTMAS_WORDS = new Set(["christmas", "chritmas", "xmas", "holiday", "holidays", "santa", "lights", "festive", "merry"]);
const HALLOWEEN_WORDS = new Set(["halloween", "spooky", "haunted"]);
const EVENT_WORDS = new Set(["event", "events", "happening", "festival", "festivals", "shows"]);
const ACTIVITY_ANCHORS = new Set(["fun", "things", "stuff", "activities", "activity", "attractions", "where", "what", "bored", "something", "thing"]);

const DURATION_UNITS = new Set(["hour", "hours", "hr", "hrs", "minute", "minutes", "min", "mins", "half"]);

export const EMPTY_CONSTRAINTS = Object.freeze({
  when: null,
  openNow: false,
  indoor: false,
  outdoor: false,
  weather: null,
  audience: null,
  ageGroup: null,
  budget: null,
  durationMaxMin: null,
  seasonal: null,
  quiet: false,
  lowWalking: false,
  afterHour: null,
  lateNight: false,
  beforeSunset: false,
  excludeThemeParks: false,
  excludeFood: false,
  excludeShopping: false,
  venueFocus: null,
});

function parseDurationMinutes(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1] || "";
    if (t === "half" && next === "day") return 240;
    if (/^\d{1,3}$/.test(t) && DURATION_UNITS.has(next)) {
      const n = Number(t);
      if (next.startsWith("min")) return n > 0 && n <= 480 ? n : null;
      return n > 0 && n <= 12 ? n * 60 : null;
    }
  }
  return null;
}

function isDurationNumber(tokens, index) {
  return /^\d{1,3}$/.test(tokens[index]) && DURATION_UNITS.has(tokens[index + 1] || "");
}

/**
 * Inspect normalized city-stripped query text and return structured moment
 * constraints + a resolved intent id (or null when unrecognized).
 */
export function parseMomentConstraints(normalizedText) {
  const clean = String(normalizedText || "").trim().toLowerCase();
  if (!clean) return { intentId: null, phrase: null, free: false, constraints: EMPTY_CONSTRAINTS };
  const tokens = clean.split(/\s+/).filter(Boolean);
  const consumed = new Set();

  let hasNow = false;
  let hasTonight = false;
  let hasToday = false;
  let hasWeekend = false;
  let hasOpen = false;
  let hasRain = false;
  let hasIndoor = false;
  let hasOutdoor = false;
  let hasQuiet = false;
  let hasCheap = false;
  let hasFree = false;
  let hasCouple = false;
  let hasToddler = false;
  let hasFamily = false;
  let hasChristmas = false;
  let hasHalloween = false;
  let hasEvents = false;
  let hasActivityAnchor = false;
  let hasLowWalking = false;
  let afterHour = null;
  let lateNight = false;
  let beforeSunset = false;
  let excludeThemeParks = false;
  let excludeFood = false;
  let excludeShopping = false;
  let venueFocus = null;

  // ── Multi-token phrase patterns (consumed before single-token scan) ──
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const n1 = tokens[i + 1] || "";
    const n2 = tokens[i + 2] || "";

    // Age phrases: "1 year old", "2 year old", "3 yrs old", "4 years old"
    if (/^[1-4]$/.test(w) && /^(?:year|yr)s?$/.test(n1) && n2 === "old") {
      consumed.add(i); consumed.add(i + 1); consumed.add(i + 2);
      hasToddler = true;
      hasFamily = true;
      continue;
    }
    if (/^[5-9]|1[0-2]$/.test(w) && /^(?:year|yr)s?$/.test(n1) && n2 === "old") {
      consumed.add(i); consumed.add(i + 1); consumed.add(i + 2);
      hasFamily = true;
      continue;
    }

    // "after 9", "after 9pm", "after 10 pm", "past 9"
    if ((w === "after" || w === "past") && /^(\d{1,2})(?:pm)?$/.test(n1)) {
      const m = n1.match(/^(\d{1,2})(pm)?$/);
      const rawHr = Number(m[1]);
      if (rawHr >= 1 && rawHr <= 23) {
        consumed.add(i); consumed.add(i + 1);
        if (n2 === "pm") consumed.add(i + 2);
        afterHour = rawHr <= 11 ? rawHr + 12 : rawHr;
        lateNight = afterHour >= 20;
        continue;
      }
    }

    // "before sunset", "before dark"
    if (w === "before" && (n1 === "sunset" || n1 === "dark" || n1 === "sundown")) {
      consumed.add(i); consumed.add(i + 1);
      beforeSunset = true;
      hasToday = true;
      continue;
    }

    // "no theme parks", "without theme parks", "not theme parks"
    if ((w === "no" || w === "not" || w === "without") && n1 === "theme" && (n2 === "park" || n2 === "parks")) {
      consumed.add(i); consumed.add(i + 1); consumed.add(i + 2);
      excludeThemeParks = true;
      continue;
    }

    // "can't walk much" / "cant walk" / "no walking" / "not much walking" / "hard to walk"
    if ((w === "cant" || w === "cannot" || w === "dont" || w === "no" || w === "minimal" || w === "little") && (n1 === "walk" || n1 === "walking")) {
      consumed.add(i); consumed.add(i + 1);
      if (n2 === "much" || n2 === "far" || n2 === "well") consumed.add(i + 2);
      hasLowWalking = true;
      continue;
    }

    // Negation of food / shopping: "isn't food or shopping", "not food or shopping", "no food", "no shopping"
    if (w === "isnt" || w === "not" || w === "no" || w === "without" || w === "besides" || w === "except") {
      const isFoodWord = (t) => t === "food" || t === "eating" || t === "dining" || t === "restaurant" || t === "restaurants";
      const isShopWord = (t) => t === "shopping" || t === "shop" || t === "shops" || t === "mall" || t === "malls" || t === "stores";
      if (isFoodWord(n1) || isShopWord(n1)) {
        consumed.add(i); consumed.add(i + 1);
        if (isFoodWord(n1)) excludeFood = true;
        if (isShopWord(n1)) excludeShopping = true;
        const n3 = tokens[i + 3] || "";
        if ((n2 === "or" || n2 === "and" || n2 === "nor") && (isFoodWord(n3) || isShopWord(n3))) {
          consumed.add(i + 2); consumed.add(i + 3);
          if (isFoodWord(n3)) excludeFood = true;
          if (isShopWord(n3)) excludeShopping = true;
        }
        continue;
      }
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const w = tokens[i];
    if (isDurationNumber(tokens, i) || DURATION_UNITS.has(w)) continue;
    let known = FILLER_WORDS.has(w);
    if (w === "free") { hasFree = true; known = true; }
    if (NOW_WORDS.has(w)) { hasNow = true; known = true; }
    if (w === "night" && tokens[i - 1] === "date") { hasCouple = true; known = true; }
    else if (TONIGHT_WORDS.has(w)) { hasTonight = true; known = true; }
    if (TODAY_WORDS.has(w)) { hasToday = true; known = true; }
    if (WEEKEND_WORDS.has(w)) { hasWeekend = true; known = true; }
    if (OPEN_WORDS.has(w)) { hasOpen = true; known = true; }
    if (w === "late") { lateNight = true; if (afterHour == null) afterHour = 20; known = true; }
    if (RAIN_WORDS.has(w)) { hasRain = true; hasIndoor = true; known = true; }
    if (INDOOR_WORDS.has(w)) { hasIndoor = true; known = true; }
    if (OUTDOOR_WORDS.has(w)) { hasOutdoor = true; known = true; }
    if (QUIET_WORDS.has(w)) { hasQuiet = true; known = true; }
    if (CHEAP_WORDS.has(w)) { hasCheap = true; known = true; }
    if (COUPLE_WORDS.has(w)) { hasCouple = true; known = true; }
    if (TODDLER_WORDS.has(w)) { hasToddler = true; hasFamily = true; known = true; }
    if (FAMILY_WORDS.has(w)) { hasFamily = true; known = true; }
    if (MOBILITY_PEOPLE_WORDS.has(w)) { known = true; }
    if (MOBILITY_CONSTRAINT_WORDS.has(w)) { hasLowWalking = true; known = true; }
    if (CHRISTMAS_WORDS.has(w)) { hasChristmas = true; known = true; }
    if (HALLOWEEN_WORDS.has(w)) { hasHalloween = true; known = true; }
    if (EVENT_WORDS.has(w)) { hasEvents = true; known = true; }
    if (ACTIVITY_ANCHORS.has(w)) { hasActivityAnchor = true; known = true; }
    if (w === "museum" || w === "museums") { venueFocus = "museum"; known = true; }
    if (!known) {
      return { intentId: null, phrase: null, free: false, constraints: EMPTY_CONSTRAINTS };
    }
  }

  const durationMaxMin = parseDurationMinutes(tokens);

  // Strict "free" honesty boundary (locked by test-search-free-modifier.mjs &
  // test-frontier-moment-decisions.mjs):
  // - Never allow "free date night" (hasCouple).
  // - Never allow bare "free" without a concrete moment/seasonal constraint
  //   (Christmas, open-with-duration, or open-now/tonight moment).
  if (hasFree) {
    const validFreeMoment =
      !hasCouple &&
      (hasChristmas || (hasOpen && durationMaxMin != null) || (hasOpen && (hasNow || hasTonight)));
    if (!validFreeMoment) {
      return { intentId: null, phrase: null, free: false, constraints: EMPTY_CONSTRAINTS };
    }
  }

  // Venue focus ("museum") only resolves as a moment query when paired with a
  // temporal or weather/audience constraint ("museum open late", "museum tonight"),
  // so plain "museum" / "museums" keeps its normal catalog/text path.
  if (venueFocus === "museum" && !(hasOpen || lateNight || afterHour != null || hasTonight || hasNow || hasRain)) {
    return { intentId: null, phrase: null, free: false, constraints: EMPTY_CONSTRAINTS };
  }

  const when = hasNow
    ? "now"
    : hasTonight || lateNight || afterHour != null
      ? "tonight"
      : hasToday || beforeSunset
        ? "today"
        : hasWeekend
          ? "weekend"
          : null;
  const openNow = hasOpen || hasNow;
  const audience = hasCouple ? "couple" : hasFamily ? "family" : null;
  const ageGroup = hasToddler ? "toddlers" : hasFamily ? "kids" : null;
  const budget = hasFree ? "free" : hasCheap ? "cheap" : null;
  const seasonal = hasChristmas ? "christmas" : hasHalloween ? "halloween" : null;

  let intentId = null;
  let phrase = null;

  if (hasChristmas) {
    intentId = "christmas";
    phrase = "christmas";
  } else if (hasHalloween) {
    intentId = "halloween";
    phrase = "halloween";
  } else if (hasCouple) {
    intentId = "date-night";
    phrase = "date night";
  } else if (venueFocus === "museum") {
    intentId = "things-to-do";
    phrase = "things to do";
  } else if (hasIndoor && !hasOutdoor) {
    intentId = "rainy";
    phrase = "indoor activities";
  } else if (hasFamily && (when || openNow || hasCheap || hasFree || durationMaxMin || hasActivityAnchor)) {
    intentId = "family";
    phrase = "things to do with kids";
  } else if (hasEvents && (when || openNow || hasCheap || hasFree)) {
    intentId = "events";
    phrase = "events";
  } else if (
    ((when || openNow || durationMaxMin) && (hasActivityAnchor || hasOpen || hasNow || hasOutdoor || hasLowWalking)) ||
    (hasActivityAnchor && (excludeFood || excludeShopping || hasOutdoor || hasLowWalking))
  ) {
    intentId = "things-to-do";
    phrase = "things to do";
  }

  if (!intentId) {
    return { intentId: null, phrase: null, free: false, constraints: EMPTY_CONSTRAINTS };
  }

  return {
    intentId,
    phrase,
    free: hasFree,
    constraints: Object.freeze({
      when,
      openNow,
      indoor: hasIndoor,
      outdoor: hasOutdoor,
      weather: hasRain ? "rain" : null,
      audience,
      ageGroup,
      budget,
      durationMaxMin,
      seasonal,
      quiet: hasQuiet,
      lowWalking: hasLowWalking,
      afterHour,
      lateNight,
      beforeSunset,
      excludeThemeParks,
      excludeFood,
      excludeShopping,
      venueFocus,
    }),
  };
}
