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
import { DEFAULT_PICKS, MAX_PICKS, SUBJECTS, askedCount, askedSubject, readAsk, dayPart, askedWhen, asksToEditPlan } from "./plannerAsk.js";

export { DEFAULT_PICKS, SUBJECTS, askedCount, askedSubject, readAsk, dayPart, askedWhen, asksToEditPlan };

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
