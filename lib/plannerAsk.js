// lib/plannerAsk.js — what the visitor asked for, read from their words
// (owner 2026-11-28: one recommendation means one, a plan only when asked).
// Client safe: no imports, no network, no clock reads, so the chat sheet can
// use it in the browser and the server can use the same rules.
const NUM_WORDS = { one: 1, single: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export const MAX_PICKS = 10;
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

/**
 * True when the words change the plan that is open, not ask for places on their own. PURE.
 * Live check 2026-11-28: with a Saturday plan open, "give me one restaurant" swapped the plan's evening
 * stop for a restaurant. Asking for places is not asking to change the plan, so only edit words
 * ("add", "swap", "instead", "move", "to my plan") send a pick request to the plan editor.
 */
export function asksToEditPlan(text) {
  const t = String(text || "").toLowerCase();
  return /\b(?:add|adding|swap|replace|switch|change|instead|move|remove|drop|delete|undo|put|include|insert|skip|cut|fit\s+in|squeeze|earlier|later|before|after|another\s+stop|stops?|day\s+\d|in\s+the\s+plan|to\s+(?:my|the)\s+(?:plan|itinerary|trip|day)|(?:my|the|this)\s+(?:plan|itinerary|trip))\b/.test(t);
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
