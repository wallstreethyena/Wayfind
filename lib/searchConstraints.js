// lib/searchConstraints.js — deterministic multi-constraint parser for
// "moment of decision" queries ("cheap date tonight near Sarasota",
// "kids are bored and it's raining", "Christmas stuff open now",
// "something fun tonight near me", "3 hours with toddlers indoor").
//
// Pure, zero I/O, zero model calls. A compound query resolves ONLY when every
// non-city word belongs to the known constraint + intent vocabulary AND at
// least one concrete intent/moment anchor is present. That keeps venue names
// ("Rainforest Cafe", "Christmas Lane"), dish words ("best tacos", "free pizza"),
// and uncovered cities ("free things to do in gastonia") out of phrase mode.

const FILLER_WORDS = new Set([
  "a", "an", "and", "are", "around", "at", "be", "best", "bored", "can", "cool",
  "day", "do", "doing", "find", "for", "from", "fun", "get", "go", "going",
  "good", "got", "great", "have", "here", "i", "im", "idea", "ideas", "in",
  "into", "is", "it", "its", "jiw", "just", "looking", "me", "my", "near",
  "nearby", "need", "nice", "of", "on", "options", "or", "our", "out", "place",
  "places", "plan", "plans", "please", "really", "see", "should", "so", "some",
  "something", "spot", "spots", "stuff", "take", "that", "the", "themed",
  "there", "thing", "things", "this", "to", "top", "try", "us", "visit", "want",
  "we", "what", "whats", "where", "with",
]);

const NOW_WORDS = new Set(["now", "right", "currently", "immediately", "jiw"]);
const TONIGHT_WORDS = new Set(["tonight", "evening", "night"]);
const TODAY_WORDS = new Set(["today", "afternoon", "morning"]);
const WEEKEND_WORDS = new Set(["weekend", "saturday", "sunday"]);
const OPEN_WORDS = new Set(["open", "opened", "operating"]);

const RAIN_WORDS = new Set(["rain", "raining", "rainy", "storm", "storming", "stormy", "wet", "downpour"]);
const INDOOR_WORDS = new Set(["indoor", "indoors", "inside", "ac"]);
const CHEAP_WORDS = new Set(["cheap", "budget", "inexpensive", "affordable", "lowcost"]);

const COUPLE_WORDS = new Set(["date", "datenight", "romantic", "anniversary", "couples", "couple", "two"]);
const TODDLER_WORDS = new Set(["toddler", "toddlers", "preschool", "stroller"]);
const FAMILY_WORDS = new Set(["kid", "kids", "child", "children", "family", "families"]);
const CHRISTMAS_WORDS = new Set(["christmas", "chritmas", "xmas", "holiday", "holidays", "santa", "lights", "festive", "merry"]);
const HALLOWEEN_WORDS = new Set(["halloween", "spooky", "haunted"]);
const EVENT_WORDS = new Set(["event", "events", "happening", "festival", "festivals", "shows"]);
const ACTIVITY_ANCHORS = new Set(["fun", "things", "stuff", "activities", "activity", "attractions", "where", "what", "bored"]);

const DURATION_UNITS = new Set(["hour", "hours", "hr", "hrs", "minute", "minutes", "min", "mins", "half"]);

const EMPTY_CONSTRAINTS = Object.freeze({
  when: null,
  openNow: false,
  indoor: false,
  weather: null,
  audience: null,
  ageGroup: null,
  budget: null,
  durationMaxMin: null,
  seasonal: null,
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
  if (!clean) return { intentId: null, phrase: null, constraints: EMPTY_CONSTRAINTS };
  const tokens = clean.split(/\s+/).filter(Boolean);
  // "free" has strict honesty rules enforced in searchIntent.js (FREE_INTENTS);
  // never widen "free" via compound constraint matching.
  if (tokens.includes("free")) {
    return { intentId: null, phrase: null, constraints: EMPTY_CONSTRAINTS };
  }

  let hasNow = false;
  let hasTonight = false;
  let hasToday = false;
  let hasWeekend = false;
  let hasOpen = false;
  let hasRain = false;
  let hasIndoor = false;
  let hasCheap = false;
  let hasCouple = false;
  let hasToddler = false;
  let hasFamily = false;
  let hasChristmas = false;
  let hasHalloween = false;
  let hasEvents = false;
  let hasActivityAnchor = false;

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (isDurationNumber(tokens, i) || DURATION_UNITS.has(w)) continue;
    let known = FILLER_WORDS.has(w);
    if (NOW_WORDS.has(w)) { hasNow = true; known = true; }
    if (w === "night" && tokens[i - 1] === "date") { hasCouple = true; known = true; }
    else if (TONIGHT_WORDS.has(w)) { hasTonight = true; known = true; }
    if (TODAY_WORDS.has(w)) { hasToday = true; known = true; }
    if (WEEKEND_WORDS.has(w)) { hasWeekend = true; known = true; }
    if (OPEN_WORDS.has(w)) { hasOpen = true; known = true; }
    if (RAIN_WORDS.has(w)) { hasRain = true; hasIndoor = true; known = true; }
    if (INDOOR_WORDS.has(w)) { hasIndoor = true; known = true; }
    if (CHEAP_WORDS.has(w)) { hasCheap = true; known = true; }
    if (COUPLE_WORDS.has(w)) { hasCouple = true; known = true; }
    if (TODDLER_WORDS.has(w)) { hasToddler = true; hasFamily = true; known = true; }
    if (FAMILY_WORDS.has(w)) { hasFamily = true; known = true; }
    if (CHRISTMAS_WORDS.has(w)) { hasChristmas = true; known = true; }
    if (HALLOWEEN_WORDS.has(w)) { hasHalloween = true; known = true; }
    if (EVENT_WORDS.has(w)) { hasEvents = true; known = true; }
    if (ACTIVITY_ANCHORS.has(w)) { hasActivityAnchor = true; known = true; }
    if (!known) {
      return { intentId: null, phrase: null, constraints: EMPTY_CONSTRAINTS };
    }
  }

  const durationMaxMin = parseDurationMinutes(tokens);
  const when = hasNow ? "now" : hasTonight ? "tonight" : hasToday ? "today" : hasWeekend ? "weekend" : null;
  const openNow = hasOpen || hasNow;
  const audience = hasCouple ? "couple" : hasFamily ? "family" : null;
  const ageGroup = hasToddler ? "toddlers" : hasFamily ? "kids" : null;
  const budget = hasCheap ? "cheap" : null;
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
  } else if (hasIndoor) {
    intentId = "rainy";
    phrase = "indoor activities";
  } else if (hasFamily && (when || openNow || hasCheap || durationMaxMin || hasActivityAnchor)) {
    intentId = "family";
    phrase = "things to do with kids";
  } else if (hasEvents && (when || openNow || hasCheap)) {
    intentId = "events";
    phrase = "events";
  } else if ((when || openNow || durationMaxMin) && (hasActivityAnchor || hasOpen || hasNow)) {
    intentId = "things-to-do";
    phrase = "things to do";
  }

  if (!intentId) {
    return { intentId: null, phrase: null, constraints: EMPTY_CONSTRAINTS };
  }

  return {
    intentId,
    phrase,
    constraints: Object.freeze({
      when,
      openNow,
      indoor: hasIndoor,
      weather: hasRain ? "rain" : null,
      audience,
      ageGroup,
      budget,
      durationMaxMin,
      seasonal,
    }),
  };
}
