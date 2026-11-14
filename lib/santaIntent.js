// lib/santaIntent.js: one reader for every message typed to Santa (owner 2026-11-14: "this is the whole reason we
// created this chat: use the information inside Wayfind without going anywhere else, and book reservations too").
// Pure, no network. Used by the iMessage chat (WayfindPlannerSheet) to route each turn and by /api/planner as a
// server-side guard, so the client and the server never disagree about what a message is.
//
//   reserve   the visitor is asking us to get them a table ("book me a table for 4 tonight at 7",
//             "reserve dinner for four tomorrow", "book Ulele Friday at 7 for 4", "Book it again next Friday")
//   find_food the visitor wants restaurant ideas, not a booking yet ("find a redtaurant near me")
//   plan      trip planning or editing a saved trip (isPlannerIntent)
//   none      everything else (greetings, questions, statements)
//
// Negative controls stay `none`: "bookstore", "I read a book", "don't book anything", "we already have a
// reservation at Bern's". Dates come from the caller's `today` (America/New_York via siteTodayStr()).
import {
  normalizeGenericTypos, resolveReserveDate, resolveReserveTime, resolveReserveParty, parseReserveIntent, GENERIC_VENUE_RX,
} from "./guestReserveIntent.js";
import { isPlannerIntent } from "./plannerParse.js";

const NEGATED = /\b(?:don'?t|do\s+not|dont|never|no\s+need\s+to|stop|cancel\s+the\s+idea|not\s+going\s+to|won'?t)\s+(?:\w+\s+){0,2}(?:book|reserve|make\s+a\s+reservation)/i;
const ALREADY = /\b(?:already|we've|we\s+have|i\s+have|i've|got)\s+(?:\w+\s+){0,3}(?:booked|reserved|a\s+reservation|a\s+table|reservations)\b|\b(?:reservation|table)\s+(?:is|was)\s+(?:already\s+)?(?:set|made|booked|confirmed|arranged)\b/i;
// "book" as a verb: followed by who/what gets booked, or after a request opener. "a book", "my book", "bookstore" are nouns.
const BOOK_VERB = /\b(?:book|reserve)\s+(?:me|us|a|an|the|it|that|this|them|dinner|lunch|brunch|breakfast|table|tables|reservation|reservations|again|for|at)\b/i;
const BOOK_NAMED = /\b[Bb]ook\s+[A-Z][\w'&.]*|\b[Rr]eserve\s+[A-Z][\w'&.]*/; // "book Ulele", "reserve Bern's"
const BOOK_AFTER_ASK = /\b(?:can\s+(?:you|u)|could\s+(?:you|u)|please|pls|want\s+to|wanna|i'?d\s+like\s+to|help\s+me|let'?s|go\s+ahead\s+and|need\s+to|can\s+i|i\s+want\s+to)\s+(?:\w+\s+)?(?:book|reserve)\b/i;
const BOOK_NOUN = /\b(?:a|the|my|his|her|our|their|this|that|good|great|new|old|favorite)\s+book\b/i;
const MAKE_RES = /\b(?:make|get|grab|need|want|snag|find\s+me)\s+(?:me\s+|us\s+)?(?:a\s+)?(?:dinner\s+|lunch\s+|brunch\s+)?(?:reservation|table|res)\b|\btable\s+for\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
const FIND_FOOD = /\b(?:find|show|suggest|recommend|recommendations?|where|what'?s|any|good|best|hungry|places?\s+to\s+eat|somewhere\s+to\s+eat)\b[\s\S]{0,60}\b(?:restaurants?|dinner|lunch|brunch|breakfast|food|eat|dining|sushi|steak|seafood|pizza|tacos|italian|mexican|cuban)\b/i;
const TRIP_WORDS = /\b(?:plan|planning|trip|itinerary|organi[sz]e|weekend|getaway|days?\s+in|stops|route)\b/i;
const AGAIN = /\b(?:again|same\s+place|same\s+spot|book\s+it|reserve\s+it)\b/i;

/** Pull the venue name out of a reserve request; "" when none was named (never "table", "restaurant", a typo of them). */
export function reserveVenue(text) {
  const t = normalizeGenericTypos(text);
  const intent = parseReserveIntent(t, "2000-01-01");
  const q = intent && intent.query ? intent.query.trim() : "";
  return q && !GENERIC_VENUE_RX.test(q) ? q : "";
}

/**
 * @param {string} message
 * @param {{ today: string, reserveActive?: boolean, hasActiveTrip?: boolean }} ctx
 * @returns {{ kind: "reserve"|"find_food"|"plan"|"none", text: string, details: { venue: string, date: string|null, time: string|null, partySize: number|null, again: boolean } }}
 */
export function classifySantaMessage(message, ctx = {}) {
  const raw = String(message || "").slice(0, 500);
  const text = normalizeGenericTypos(raw).trim();
  const today = ctx.today;
  const details = {
    venue: "",
    date: today ? resolveReserveDate(text, today) : null,
    time: resolveReserveTime(text),
    partySize: resolveReserveParty(text),
    again: AGAIN.test(text),
  };
  if (!text) return { kind: "none", text, details };
  if (NEGATED.test(text) || ALREADY.test(text)) return { kind: "none", text, details };

  const asksToBook = (BOOK_VERB.test(text) || BOOK_NAMED.test(text) || BOOK_AFTER_ASK.test(text) || MAKE_RES.test(text)) && !(BOOK_NOUN.test(text) && !BOOK_AFTER_ASK.test(text) && !MAKE_RES.test(text));
  // Trip words win: "book a weekend in Tampa" is a plan, "book Ulele" is a table.
  const tripish = isPlannerIntent(text, { hasActiveTrip: Boolean(ctx.hasActiveTrip) }) && !/\b(?:table|reservation|restaurant|dinner|lunch|brunch)\b/i.test(text);
  if (asksToBook && !tripish) {
    details.venue = reserveVenue(text);
    return { kind: "reserve", text, details };
  }
  if (tripish) return { kind: "plan", text, details };
  if (FIND_FOOD.test(text)) return { kind: "find_food", text, details };
  // While a booking is in progress, a bare "7pm", "for 4", "Saturday" or "yes" belongs to the booking; trip words
  // ("plan my weekend", "organize my stops", "itinerary") go back to planning in the same thread.
  if (ctx.reserveActive && !TRIP_WORDS.test(text)) return { kind: "reserve", text, details };
  if (ctx.reserveActive) return { kind: "plan", text, details };
  return { kind: "none", text, details };
}
