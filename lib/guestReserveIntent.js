// lib/guestReserveIntent.js: reads a reservation request out of a chat message ("book Ulele Friday at 7 for 4",
// "Italian tonight around 7 for four"). Pure, no network. Shared by Santa's server route (lib/santaChat.js) and the
// companion on the client, so there is one reader. It returns only what a table search needs:
// { query, cuisine, date, time, partySize }. Never a name, a phone number or an email.
// Dates use the same calendar idea as the reserve chat prompt (reserveCalendar): today is given, weekdays are
// resolved by plain calendar arithmetic from it, never from the device clock.
import { addDays, isDateString, weekdayName } from "./reserveFormat.js";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
// Words the reader spots in a message so a table search can lean on them. A plain string, not a chip list: the real cuisine chips come from wf_cuisine_chips().
const CUISINES = "italian mexican cuban seafood steak steakhouse sushi japanese thai chinese indian greek french spanish pizza bbq barbecue southern mediterranean vegan brunch burger burgers tapas american korean vietnamese".split(" ");
const RESERVE_WORD = /\b(?:book|reserve|reservation|reservations|table)\b/i;
const NOT_A_TABLE = /\b(?:tickets?|tour|tours|hotel|room|rooms|flight|ride|boat|cruise)\b/i;
const CUISINE_RX = new RegExp("\\b(" + CUISINES.join("|") + ")\\b", "i");

export const RESERVE_INTENT_MAX_DAYS = 60;

export function resolveReserveDate(text, today) {
  if (!isDateString(today)) return null;
  const t = String(text || "").toLowerCase();
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso && isDateString(iso[1]) && iso[1] >= today && iso[1] <= addDays(today, RESERVE_INTENT_MAX_DAYS)) return iso[1];
  if (/\b(?:tonight|today|this evening)\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  const wd = new RegExp("\\b(next\\s+|this\\s+)?(" + DAYS.join("|") + ")\\b").exec(t);
  if (wd) {
    const want = DAYS.indexOf(wd[2]);
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      if (DAYS.indexOf(weekdayName(d).toLowerCase()) === want) {
        if (wd[1] && /^next/.test(wd[1]) && i < 7) continue;
        return d;
      }
    }
  }
  return null;
}

export function resolveReserveTime(text) {
  const t = String(text || "").toLowerCase();
  const m = /(?:\bat|\baround|\babout|@)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/.exec(t) || /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/.exec(t);
  if (!m) return null;
  let h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0;
  if (h < 1 || h > 24 || min > 59) return null;
  const mer = m[3] ? m[3][0] : "";
  if (mer === "p" && h < 12) h += 12;
  else if (mer === "a" && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 10) h += 12; // "at 7" for a table means evening
  if (h > 23) return null;
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

export function resolveReserveParty(text) {
  const t = String(text || "").toLowerCase();
  const m = /\bfor\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s*(?:pm|am|:))/.exec(t) || /\bparty\s+of\s+(\d{1,2}|[a-z]+)\b/.exec(t) || /\b(\d{1,2})\s+(?:people|ppl|guests|of us|adults)\b/.exec(t);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]];
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function resolveQuery(text) {
  const m = /\b(?:book|reserve|reservations?\s+(?:at|for)|table\s+(?:at|for))\s+(?:me\s+)?(?:a\s+)?(?:table\s+(?:at|for)\s+)?(.+)$/i.exec(String(text || ""));
  if (!m) return "";
  let rest = m[1];
  const cut = rest.search(new RegExp("\\b(?:on|for|at|around|about|tonight|today|tomorrow|this|next|" + DAYS.join("|") + ")\\b|\\d", "i"));
  if (cut >= 0) rest = rest.slice(0, cut);
  rest = rest.replace(/[^A-Za-z0-9'&. ]/g, " ").replace(/\s+/g, " ").trim();
  if (!rest || CUISINE_RX.test(rest) && rest.split(" ").length <= 2 || /^(?:a|the|me|us|dinner|lunch|brunch|something|somewhere)$/i.test(rest)) return "";
  return rest.slice(0, 60);
}

export function parseReserveIntent(message, today) {
  const text = String(message || "").slice(0, 300);
  if (!text.trim() || NOT_A_TABLE.test(text)) return null;
  const cuisine = (CUISINE_RX.exec(text) || [])[1] || "";
  const date = resolveReserveDate(text, today);
  const time = resolveReserveTime(text);
  const partySize = resolveReserveParty(text);
  const wantsTable = RESERVE_WORD.test(text) || (!!(cuisine || /\b(?:dinner|lunch)\b/i.test(text)) && !!(time || partySize) && !!(date || time));
  if (!wantsTable) return null;
  const query = resolveQuery(text);
  if (!query && !cuisine && !/\b(?:dinner|lunch|brunch)\b/i.test(text)) return null;
  return cleanReserveIntent({ query, cuisine: cuisine.toLowerCase(), date, time, partySize }, today);
}

// Shapes any intent (from the parser or from a model) to the allowed fields only.
export function cleanReserveIntent(r, today) {
  if (!r || typeof r !== "object") return null;
  const out = {};
  const q = String(r.query == null ? "" : r.query).replace(/[^A-Za-z0-9'&. ]/g, " ").replace(/\d{5,}/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q) out.query = q;
  const c = String(r.cuisine == null ? "" : r.cuisine).toLowerCase().replace(/[^a-z ]/g, "").trim().slice(0, 30);
  if (c) out.cuisine = c;
  if (isDateString(r.date) && isDateString(today) && r.date >= today && r.date <= addDays(today, RESERVE_INTENT_MAX_DAYS)) out.date = r.date;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.time || ""))) out.time = r.time;
  if (Number.isInteger(r.partySize) && r.partySize >= 1 && r.partySize <= 12) out.partySize = r.partySize;
  return out.query || out.cuisine ? out : null;
}
