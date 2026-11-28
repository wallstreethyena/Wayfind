// lib/plannerRecommend.js — the site AI answers exactly what was asked
// (owner 2026-11-28: "I ask for recommendations for one recommendation. It
// gives me three. It builds an itinerary for me without me even asking ... the
// worst thing you can do is for someone asking for one thing and you provide
// them with completely something else").
//
// readAsk() reads WHAT the visitor wants: a plan, or picks (and how many). A
// plan is built only when they ask for one; picks come back in exactly the
// count asked, three when no count is given (owner 2026-10-24: people like
// options). rankRecommendations() picks them from real Wayfind places, knowing
// the local time, the weather and whether each place is open right now:
//   - a place closed right now is never offered for "now"
//   - a place with no verified hours is labeled "Hours not listed", never
//     called open
//   - rain or a storm favors indoor picks, evening favors dinner and
//     nightlife, morning favors breakfast and coffee
// PURE: no network, no clock reads. Every input is an argument.
import { openStatusAt } from "./plannerSameDay.js";

const NUM_WORDS = { one: 1, single: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const MAX_PICKS = 10;
export const DEFAULT_PICKS = 3;

// What a pick can be. Each subject: words that ask for it, words a matching
// place carries (type, tags, name), search phrases, and its plural noun.
export const SUBJECTS = [
  { key: "brunch", ask: /\bbrunch\b/, match: /\b(brunch|breakfast|cafe|diner|bakery)\b/, q: ["brunch", "breakfast"], noun: ["brunch spot", "brunch spots"], food: true },
  { key: "breakfast", ask: /\bbreakfast\b/, match: /\b(breakfast|brunch|cafe|diner|bakery)\b/, q: ["breakfast"], noun: ["breakfast spot", "breakfast spots"], food: true },
  { key: "coffee", ask: /\b(coffee|cafe|caf[eé]s?|espresso|latte)\b/, match: /\b(coffee|cafe|espresso|bakery)\b/, q: ["coffee"], noun: ["coffee shop", "coffee shops"], food: true },
  { key: "dessert", ask: /\b(dessert|ice\s*cream|gelato|bakery|donuts?|cupcakes?)\b/, match: /\b(dessert|ice cream|ice_cream|gelato|bakery|donut|creamery|sweets?)\b/, q: ["dessert ice cream"], noun: ["dessert spot", "dessert spots"], food: true },
  { key: "bars", ask: /\b(bars?|pubs?|drinks?|cocktails?|brewer(?:y|ies)|beer|wine\s+bars?|happy\s+hour|nightlife)\b/, match: /\b(bar|bars|pub|brewery|brewing|cocktail|lounge|nightlife|night_club|wine_bar|taproom|tavern|saloon|speakeasy)\b/, q: ["bars", "cocktail bar"], noun: ["bar", "bars"] },
  { key: "live_music", ask: /\blive\s+music\b/, match: /\b(live music|music venue|concert|jazz|bar|lounge)\b/, q: ["live music"], noun: ["live music spot", "live music spots"] },
  { key: "beach", ask: /\bbeach(es)?\b/, match: /\b(beach|beaches)\b/, q: ["beaches"], noun: ["beach", "beaches"], outdoor: true },
  { key: "parks", ask: /\b(parks?|trails?|hikes?|hiking|nature|gardens?)\b/, match: /\b(park|trail|garden|preserve|nature|springs?)\b/, q: ["parks", "nature"], noun: ["park", "parks"], outdoor: true },
  { key: "museums", ask: /\b(museums?|galler(?:y|ies)|art)\b/, match: /\b(museum|gallery|art)\b/, q: ["museums"], noun: ["museum", "museums"] },
  { key: "kids", ask: /\b(kids?|children|family|families|toddlers?)\b(?=[\s\S]*\b(?:things?|activit|fun|spots?|places?|ideas?)\b)/, match: /\b(kids?|family|zoo|aquarium|playground|museum|trampoline|arcade|bowling|park|amusement)\b/, q: ["things to do with kids", "family fun"], noun: ["family spot", "family spots"] },
  { key: "dinner", ask: /\b(dinner|supper)\b/, match: /\b(restaurant|steak|seafood|italian|sushi|grill|bistro|kitchen|food|dining|eatery|tavern|mexican|thai|cuban|pizza)\b/, q: ["dinner", "restaurants"], noun: ["dinner spot", "dinner spots"], food: true },
  { key: "lunch", ask: /\blunch\b/, match: /\b(restaurant|cafe|deli|sandwich|grill|kitchen|food|tacos?|pizza|burger|eatery)\b/, q: ["lunch", "restaurants"], noun: ["lunch spot", "lunch spots"], food: true },
  { key: "food", ask: /\b(restaurants?|food|eat|eats|dining|sushi|steak(?:house)?|seafood|pizza|tacos?|burgers?|italian|mexican|cuban|thai|bbq|barbecue)\b/, match: /\b(restaurant|steak|seafood|italian|sushi|grill|bistro|kitchen|food|dining|eatery|pizza|tacos?|burger|mexican|cuban|thai|bbq|barbecue|cafe)\b/, q: ["restaurants"], noun: ["restaurant", "restaurants"], food: true },
  { key: "fun", ask: /\b(fun|things?\s+to\s+do|activit(?:y|ies)|something\s+to\s+do|attractions?|entertainment|date\s+night)\b/, match: null, q: ["things to do", "fun activities"], noun: ["fun spot", "fun spots"] },
];

const PLAN_RX = /\b(?:plan|planning|itinerary|schedule|organi[sz]e|map\s+out|route\s+for|day\s+trip|day\s+by\s+day|build\s+(?:me\s+)?(?:a\s+)?(?:day|trip|weekend|plan))\b/i;
const ASK_RX = /\b(?:recommend|recommendations?|recs?|suggest(?:ions?)?|ideas?|options?|best|top|good|great|favorite|give\s+me|find(?:\s+me)?|show\s+me|any|where\s+(?:should|can|could|do|to)|what'?s\s+(?:good|open|fun)|somewhere|someplace|spots?|places?\s+(?:to|for)|worth|right\s+now|open\s+now|nearby|near\s+me|close\s+by|around\s+here)\b/i;
// A number that is not a count of picks: a party ("for 4", "4 people"), a time, money, distance, rating.
const NOT_A_PICK_COUNT = /^(?:\s*(?:people|persons?|adults?|kids?|children|of\s+us|guests?|pm|am|p\.m|a\.m|o'?clock|:|stars?|miles?|mi\b|minutes?|mins?|hours?|hrs?|percent|%|dollars?|bucks|year|yr|days?|nights?))/i;
const PICK_NOUN = /^(?:\s+(?:good|great|nice|cool|fun|cheap|cozy|quick|new|local|hidden|top|best|different|more|other|really|kid[\s-]friendly|family[\s-]friendly|dog[\s-]friendly|romantic|casual|fancy|outdoor|indoor|open|nearby|solid|quiet|lively)){0,3}\s+(?:\w+\s+)?(?:places?|spots?|restaurants?|bars?|pubs?|breweries|brewery|cafes?|coffee|shops?|options?|ideas?|picks?|recs?|recommendations?|things?|activities|activity|beaches|beach|parks?|museums?|brunch|breakfast|lunch|dinner|dessert|sushi|tacos?|pizza|steakhouses?|joints?|venues?|events?|suggestions?)\b/i;

/** How many picks the text asks for, or null when it gives no count. PURE. */
export function askedCount(text) {
  const t = " " + String(text || "").toLowerCase().replace(/[’']/g, "'") + " ";
  const top = t.match(/\btop\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (top) return clamp(toNum(top[1]));
  if (/\b(?:just|only)\s+(?:one|1)\b|\bsingle\b|\bone\s+(?:good|great|nice|place|spot|pick|rec|recommendation|suggestion|option|idea)\b/.test(t)) return 1;
  if (/\ba\s+couple(?:\s+of)?\b/.test(t)) return 2;
  if (/\ba\s+few\b/.test(t)) return 3;
  const rx = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/g;
  let m;
  while ((m = rx.exec(t))) {
    const after = t.slice(m.index + m[0].length);
    const before = t.slice(Math.max(0, m.index - 8), m.index);
    if (NOT_A_PICK_COUNT.test(after) || /\bfor\s+$|\$\s*$|\bat\s+$|\bunder\s+$|\bover\s+$/.test(before)) continue;
    if (PICK_NOUN.test(after)) return clamp(toNum(m[1]));
  }
  // "a restaurant", "an idea", "recommend a bar", "where's a good taco spot": one.
  if (/\b(?:give\s+me|recommend|suggest|find(?:\s+me)?|show\s+me|need|want|where'?s|where\s+is|know|name|pick|what'?s)\s+(?:a|an|one)\s+(?:(?:good|great|nice|cool|fun|cheap|cozy|quick|new|local|solid|quiet|romantic|casual|kid[\s-]friendly|family[\s-]friendly)\s+){0,2}(?:\w+\s+)?(?:place|spot|restaurant|bar|pub|brewery|cafe|coffee\s+shop|shop|idea|option|pick|beach|park|museum|thing|activity|brunch\s+spot|breakfast\s+spot|lunch\s+spot|dinner\s+spot|taco\s+spot|pizza\s+place|steakhouse|joint|venue|suggestion|recommendation)\b/.test(t)) return 1;
  return null;
}

function toNum(w) { const n = Number(w); return Number.isFinite(n) ? n : NUM_WORDS[w] || null; }
function clamp(n) { return n ? Math.max(1, Math.min(MAX_PICKS, n)) : null; }

/** The subject of a pick request, or null. PURE. */
export function askedSubject(text) {
  const t = String(text || "").toLowerCase();
  return SUBJECTS.find((s) => s.ask.test(t)) || null;
}

/**
 * What the visitor wants. PURE.
 * { kind: "plan" } only when they ask for a plan or itinerary; { kind: "picks", count, subject } when they ask for
 * places; { kind: "other" } for anything else (greetings, questions about Wayfind). `count` is what they asked for,
 * or DEFAULT_PICKS when they gave none.
 */
export function readAsk(text, { plannerIntent = false } = {}) {
  const t = String(text || "").trim();
  if (!t) return { kind: "other" };
  if (PLAN_RX.test(t) || plannerIntent) return { kind: "plan" };
  const subject = askedSubject(t);
  const count = askedCount(t);
  if (count != null || ASK_RX.test(t) || subject) {
    if (!subject && count == null && !/\b(?:place|spot|somewhere|someplace|things?\s+to\s+do|fun|open|eat|go)\b/i.test(t)) return { kind: "other" };
    return { kind: "picks", count: count || DEFAULT_PICKS, countGiven: count != null, subject: subject ? subject.key : "fun" };
  }
  return { kind: "other" };
}

// ── time ─────────────────────────────────────────────────────────────────

/** "morning" | "midday" | "evening" | "late" from a local hour. PURE. */
export function dayPart(hour) {
  if (!Number.isFinite(hour)) return "midday";
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "midday";
  if (hour >= 17 && hour < 23) return "evening";
  return "late";
}

/** When the visitor wants to go: now, tonight (from 7 PM), or later (another day). PURE. */
export function askedWhen(text, localHour) {
  const t = String(text || "").toLowerCase();
  if (/\b(?:tomorrow|this\s+weekend|next\s+week|on\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/.test(t)) return { when: "later" };
  if (/\btonight\b|\bthis\s+evening\b/.test(t) && Number.isFinite(localHour) && localHour < 19) return { when: "tonight", hour: 19 };
  return { when: "now" };
}

// ── ranking ──────────────────────────────────────────────────────────────

const OUTDOOR_RX = /\b(park|beach|trail|garden|preserve|nature|springs?|zoo|boat|kayak|paddle|cruise|tour|outdoor|golf|marina|pier|campground|farm|market)\b/;
const INDOOR_RX = /\b(museum|restaurant|bar|pub|cafe|coffee|aquarium|theater|theatre|cinema|movie|mall|bowling|arcade|escape|gallery|brewery|lounge|bakery|spa|indoor|kitchen|bistro|grill)\b/;
const EVENING_RX = /\b(restaurant|bar|pub|brewery|cocktail|lounge|nightlife|night_club|steak|seafood|italian|sushi|bistro|grill|live music|theater|theatre|comedy|wine)\b/;
const MORNING_RX = /\b(breakfast|brunch|coffee|cafe|bakery|diner|donut)\b/;
const FOOD_RX = /\b(restaurant|food|dining|eatery|cafe|bakery|steak|seafood|sushi|pizza|taco|grill|bistro|kitchen|diner|bbq|burger)\b/;

function bag(c) {
  return [c.type, c.category, c.primaryType, ...(Array.isArray(c.tags) ? c.tags : []), c.name].filter(Boolean).join(" ").toLowerCase().replace(/_/g, " ");
}

function kmBetween(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  const r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** A plain label for a place's type: "Coffee shop", not "coffee_shop". PURE. */
export function plainType(c) {
  const raw = String(c.primaryType || c.category || c.type || "").replace(/_/g, " ").trim();
  if (!raw || /^place$/i.test(raw)) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * Pick exactly `count` places from grounded candidates. PURE.
 * @returns {{ picks: Array<{id,name,href,city,type,status,statusLabel,take,isFood,distanceMi}>, closedSkipped: number, matched: number }}
 */
export function rankRecommendations(candidates, { count = DEFAULT_PICKS, subject = "fun", nowMs, localHour, weather = null, origin = null, when = { when: "now" }, maxKm = 40 } = {}) {
  const subj = SUBJECTS.find((s) => s.key === subject) || SUBJECTS.find((s) => s.key === "fun");
  const part = dayPart(localHour);
  const wet = Boolean(weather && weather.wet);
  const probeMs = when.when === "tonight" && Number.isFinite(nowMs) && Number.isFinite(localHour)
    ? nowMs + Math.max(0, (when.hour - localHour) * 3600 * 1000)
    : nowMs;
  const seen = new Set();
  let closedSkipped = 0, matched = 0;
  const scored = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    if (!c || !c.id || !c.name) continue;
    const nameKey = String(c.name).toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim();
    if (seen.has(nameKey)) continue;
    const text = bag(c);
    if (subj.match && !subj.match.test(text)) continue;
    if (subj.key === "fun" && c.itemType !== "event" && FOOD_RX.test(text) && !/\b(arcade|bowling|escape|amusement|attraction|museum|theater|zoo|aquarium|park|tour)\b/.test(text)) continue;
    const km = origin ? kmBetween(origin, c) : null;
    if (km != null && km > maxKm) continue;
    matched += 1;
    let status = when.when === "later" ? "later" : openStatusAt(c, probeMs);
    if (c.itemType === "event" && status !== "closed") status = "today";
    if (status === "closed") { closedSkipped += 1; continue; }
    seen.add(nameKey);
    const base = Number.isFinite(c.wfScore) ? c.wfScore : Number.isFinite(c.rating) ? c.rating * 2 : 6;
    let score = base;
    if (status === "open" || status === "today") score += 2;
    if (wet && OUTDOOR_RX.test(text) && !INDOOR_RX.test(text)) score -= 4;
    if (wet && INDOOR_RX.test(text)) score += 1;
    if ((part === "evening" || part === "late" || when.when === "tonight") && EVENING_RX.test(text)) score += 1.5;
    if (part === "morning" && when.when === "now" && MORNING_RX.test(text)) score += 1.5;
    if (km != null) score -= km / 15;
    scored.push({ c, score, status, km, text });
  }
  scored.sort((a, b) => b.score - a.score || String(a.c.name).localeCompare(String(b.c.name)));
  const picks = scored.slice(0, Math.max(1, Math.min(MAX_PICKS, count))).map(({ c, status, km, text }) => ({
    id: String(c.id),
    name: String(c.name),
    href: c.detailHref || null,
    city: c.city || null,
    type: plainType(c),
    status,
    statusLabel: STATUS_LABEL[status],
    take: c.take || null,
    isFood: Boolean(subj.food) || FOOD_RX.test(text),
    distanceMi: km != null ? Math.round(km * 0.621371 * 10) / 10 : null,
  }));
  return { picks, closedSkipped, matched };
}

export const STATUS_LABEL = Object.freeze({
  open: "Open now",
  today: "On today",
  unknown: "Hours not listed, check before you go",
  later: "Check hours for your day",
});

// ── the reply ────────────────────────────────────────────────────────────

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clockWords(hour) {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60);
  const hh = h % 12 || 12, mm = m >= 60 ? 59 : m;
  return `${hh}:${String(mm).padStart(2, "0")} ${h >= 12 && h < 24 ? "PM" : "AM"}`;
}

/** The one or two plain sentences above the picks. PURE. No dashes. */
export function recommendReply({ picks, count, countGiven, subject, areaLabel, localHour, dayIndex, weather, when = { when: "now" }, closedSkipped = 0 }) {
  const subj = SUBJECTS.find((s) => s.key === subject) || SUBJECTS.find((s) => s.key === "fun");
  const n = picks.length;
  const where = areaLabel ? ` near ${areaLabel}` : "";
  const timeWord = when.when === "tonight" ? " for tonight" : when.when === "later" ? "" : (picks.some((p) => p.status === "open") ? " that's open now" : "");
  const lines = [];
  if (!n) {
    lines.push(`I couldn't find ${count === 1 ? `a ${subj.noun[0]}` : subj.noun[1]}${where}${when.when === "now" ? " open right now" : ""} on Wayfind yet.`);
    if (closedSkipped) lines.push("The ones I know are closed at this hour. Try asking for later today or tomorrow.");
    return lines.join(" ");
  }
  if (n === 1) lines.push(`Here's one ${subj.noun[0]}${where}${n === 1 && timeWord ? timeWord : ""}.`);
  else lines.push(`Here are ${n} ${subj.noun[1]}${where}${timeWord ? timeWord.replace("that's", "that are") : ""}.`);
  if (countGiven && n < count) lines.push(`You asked for ${count}, and these are the ${n} I can stand behind right now.`);
  const ctx = [];
  if (Number.isFinite(dayIndex) && Number.isFinite(localHour)) ctx.push(`It's ${WEEKDAY[dayIndex]} ${clockWords(localHour)}`);
  if (weather && (weather.tempF != null || weather.words)) ctx.push(`${weather.tempF != null ? `${weather.tempF}°` : ""}${weather.tempF != null && weather.words ? " and " : ""}${weather.words || ""}`.trim());
  if (ctx.length) lines.push(ctx.join(", ") + (weather && weather.wet ? ", so I leaned indoors." : "."));
  if (picks.some((p) => p.status === "unknown")) lines.push(n === 1 ? "Its hours aren't listed, so check before you go." : "Where hours aren't listed I say so, so check those before you go.");
  return lines.join(" ").replace(/[—–]/g, ",");
}
