// lib/reserve.js - PURE logic for "Reserve a table". No I/O, no network, no database.
//
// Wayfind holds availability for partner restaurants and books a table instantly. A guest
// sees "You're booked" only after the booking row is really saved (the server answers 201).
// The model in the chat is never a source of availability: open times come from the database.
//
// Everything here is callable from a test with no fakes: scripts/test-reserve-logic.mjs.
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { isDateString, addDays, weekdayName, formatReserveDate, formatReserveTime, easternToUtcMs, zonedToUtcMs, zonedToday, easternClock, reserveCalendar, leadWords } from "./reserveFormat.js";

export { isDateString, addDays, weekdayName, formatReserveDate, formatReserveTime, easternToUtcMs, zonedToUtcMs, zonedToday, easternClock, reserveCalendar, leadWords };

export const RESERVE_WINDOW_DAYS = 60;
export const RESERVE_DEFAULT_LEAD_MINUTES = 60;
export const RESERVE_MAX_UPCOMING_PER_USER = 3;
export const RESERVE_NOTE_MAX = 200;
export const RESERVE_NAME_MAX = 40;
export const RESERVE_REASON_MAX = 120;
export const RESERVE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const RESERVE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RESERVE_CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

// ---- field validators (each returns the clean value, or null when invalid) ---

function toIntegerOrNull(value) {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && /^\d{1,3}$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function cleanPartySize(value, maxParty = 40) {
  const n = toIntegerOrNull(value);
  const cap = Number.isInteger(maxParty) ? Math.min(40, Math.max(1, maxParty)) : 40;
  return n !== null && n >= 1 && n <= cap ? n : null;
}

export function cleanDate(value, today, windowDays = RESERVE_WINDOW_DAYS) {
  if (!isDateString(value) || !isDateString(today)) return null;
  return value >= today && value <= addDays(today, windowDays) ? value : null;
}

/** HH:MM on a 15 minute step. */
export function cleanTime(value) {
  const m = TIME_RE.exec(typeof value === "string" ? value.trim() : "");
  return m && Number(m[2]) % 15 === 0 ? `${m[1]}:${m[2]}` : null;
}

/**
 * Nearest 15 minute step as HH:MM for a loose HH:MM from the model (the strict
 * cleanTime is still what the request API and the form use). 53 to 59 minutes roll
 * to the next hour; 23:53 to 23:59 clamp to 23:45. Invalid input returns null.
 */
export function snapTimeToStep(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const total = Math.min(23 * 60 + 45, Math.round((Number(m[1]) * 60 + Number(m[2])) / 15) * 15);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function cleanGuestName(value) {
  if (typeof value !== "string") return null;
  let name = value.replace(/\s+/g, " ").trim();
  if (!(name.length >= 1 && name.length <= RESERVE_NAME_MAX && NAME_RE.test(name))) return null;
  // All lower case (or no capitals at all): capitalize each part. Any capital means the guest chose it.
  if (!/\p{Lu}/u.test(name)) name = name.replace(/(^|[ '\u2019-])(\p{L})/gu, (_m, pre, ch) => pre + ch.toUpperCase());
  return name;
}

const URL_RE = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|app|me|info|biz|ly|gl|xyz|site|online|link)\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+/;
const PHONE_RE = /(?:\+?\d[\s().-]*){7,}/;

/** True when free text carries a link, an email address or a phone number. */
export function hasContactDetails(text) {
  const t = String(text || "");
  return URL_RE.test(t) || EMAIL_RE.test(t) || PHONE_RE.test(t);
}

/** Optional note. Returns {ok:true,value:string|null} or {ok:false,error}. */
export function checkNote(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "INVALID_NOTE" };
  const note = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!note) return { ok: true, value: null };
  if (note.length > RESERVE_NOTE_MAX) return { ok: false, error: "INVALID_NOTE" };
  if (hasContactDetails(note)) return { ok: false, error: "NOTE_NOT_ALLOWED" };
  return { ok: true, value: note };
}

/** US phone number to "(941) 555-0100", or null. Accepts 10 digits, or 11 starting with 1. */
export function cleanPhone(value) {
  if (typeof value !== "string") return null;
  if (/[^\d\s().+-]/.test(value)) return null;
  let d = value.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d) || /^.{3}[01]/.test(d)) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function isIdempotencyKey(value) { return typeof value === "string" && RESERVE_UUID_RE.test(value); }
export function isBookingId(value) { return typeof value === "string" && RESERVE_UUID_RE.test(value); }

/** Short reason a restaurant gives when it cancels. Returns {ok:true,value} or {ok:false,error}. */
export function checkReason(value) {
  const reason = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";
  if (reason.length < 2 || reason.length > RESERVE_REASON_MAX) return { ok: false, error: "INVALID_REASON" };
  return { ok: true, value: reason };
}

const MESSAGES = {
  INVALID_PARTY_SIZE: "Tell us how many people are coming.",
  PARTY_TOO_LARGE: "That is more people than this restaurant takes on Wayfind. Please call them.",
  INVALID_DATE: "Pick a day for your table.",
  DATE_PAST: "Pick today or a day coming up.",
  DATE_TOO_FAR: "You can book a table up to 60 days ahead.",
  INVALID_TIME: "Pick a time on the quarter hour, like 6:30 PM.",
  TIME_PAST: "That time has already passed. Pick a later time.",
  TOO_SOON: "That is too soon to book here. Pick a later time, or call the restaurant.",
  INVALID_NAME: "Add the name for the table, using letters only.",
  INVALID_NOTE: "Keep the note under 200 characters.",
  NOTE_NOT_ALLOWED: "Please leave links, emails and phone numbers out of the note.",
  INVALID_PHONE: "Add a phone number with 10 digits, or turn off sharing your phone.",
  PHONE_NEEDS_CONSENT: "A phone number can only be shared when you say yes to sharing it.",
  INVALID_IDEMPOTENCY_KEY: "Something went wrong on our side. Please try again.",
  INVALID_REASON: "Add a short reason, up to 120 characters.",
  INVALID_BOOKING: "We could not find that booking.",
  SLOT_FULL: "That time just filled up.",
  CLOSED: "The restaurant is not seating guests at that time.",
  OUT_OF_WINDOW: "You can book a table from today up to 60 days ahead.",
  LIMIT: "You already have 3 upcoming tables. Cancel one to book another.",
  DUPLICATE: "You already have a table at this restaurant that day.",
  UNAVAILABLE: "This restaurant is not taking bookings on Wayfind right now.",
};
export function reserveErrorMessage(code) { return MESSAGES[code] || "Check your booking and try again."; }

/**
 * Validate and normalize a booking. Availability itself is decided by the database; this is
 * the shape check. ctx: { today (restaurant local day), maxParty, windowDays, now?, leadMinutes?, timeZone? }.
 * A phone number is accepted ONLY with phoneConsent === true.
 * Returns { ok:true, value } or { ok:false, error, message }.
 */
export function validateBookInput(input, { today, maxParty = 40, windowDays = RESERVE_WINDOW_DAYS, now, leadMinutes = RESERVE_DEFAULT_LEAD_MINUTES, timeZone } = {}) {
  const fail = (error) => ({ ok: false, error, message: reserveErrorMessage(error) });
  const src = input && typeof input === "object" ? input : {};
  if (!isDateString(today)) throw new TypeError("validateBookInput needs today as YYYY-MM-DD");
  const size = toIntegerOrNull(src.partySize);
  if (size === null || size < 1) return fail("INVALID_PARTY_SIZE");
  const cap = Number.isInteger(maxParty) ? Math.min(40, Math.max(1, maxParty)) : 40;
  if (size > cap) return fail("PARTY_TOO_LARGE");
  if (!isDateString(src.date)) return fail("INVALID_DATE");
  if (src.date < today) return fail("DATE_PAST");
  if (src.date > addDays(today, windowDays)) return fail("DATE_TOO_FAR");
  const time = cleanTime(src.time);
  if (!time) return fail("INVALID_TIME");
  if (Number.isFinite(now)) {
    const at = zonedToUtcMs(src.date, time, timeZone);
    if (at <= now) return fail("TIME_PAST");
    if (at < now + leadMinutes * 60000) return fail("TOO_SOON");
  }
  const guestName = cleanGuestName(src.guestName);
  if (!guestName) return fail("INVALID_NAME");
  const note = checkNote(src.note);
  if (!note.ok) return fail(note.error);
  const phoneGiven = src.phone !== undefined && src.phone !== null && String(src.phone).trim() !== "";
  if (phoneGiven && src.phoneConsent !== true) return fail("PHONE_NEEDS_CONSENT");
  let phone = null;
  if (src.phoneConsent === true) {
    phone = cleanPhone(src.phone);
    if (!phone) return fail("INVALID_PHONE");
  }
  if (!isIdempotencyKey(src.idempotencyKey)) return fail("INVALID_IDEMPOTENCY_KEY");
  return { ok: true, value: { partySize: size, date: src.date, time, guestName, note: note.value, phone, phoneConsent: phone !== null, idempotencyKey: src.idempotencyKey.toLowerCase() } };
}

// ---- restaurant dashboard tokens ------------------------------------------------

/** 32 random bytes, base64url (43 characters). Only its hash is stored. */
export function newManageToken() { return randomBytes(32).toString("base64url"); }
export function hashManageToken(token) { return createHash("sha256").update(String(token)).digest("hex"); }
export function isManageTokenShape(token) { return typeof token === "string" && RESERVE_TOKEN_RE.test(token); }
/** Constant time compare of two hex hashes. False for anything that is not two equal length strings. */
export function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---- rollout gates ------------------------------------------------------------

/**
 * Restaurant and guest EMAIL can only go out from production, with the feature switch on, a
 * Resend key, and the SAME verified sender condition the group plan email uses. Email no longer
 * decides whether a table can be booked; it only decides whether notices are sent.
 */
export function reserveEmailReady(env = {}) {
  return env.VERCEL_ENV === "production" && env.WF_RESERVE_EMAIL_ENABLED === "1"
    && Boolean(env.RESEND_API_KEY)
    && env.WF_GROUP_PLAN_EMAIL_VERIFIED === "1"
    && /^[^\r\n]+@[^\r\n]+\.[^\r\n]+$/.test(String(env.WF_ALERT_FROM || ""));
}

/** Emails go only for a LIVE partner, in production, when email is ready. Never for a demo partner. */
export function reserveEmailAllowed(partner, env = {}) {
  return Boolean(partner) && partner.stage === "live" && reserveEmailReady(env);
}

/**
 * Does this partner get a Reserve button in this environment?
 * Production: stage live AND active (demo is never visible in production).
 * Anywhere else: active, stage live or demo.
 */
export function partnerVisible(partner, env = {}) {
  if (!partner || partner.active !== true) return false;
  if (env.VERCEL_ENV === "production") return partner.stage === "live";
  return partner.stage === "live" || partner.stage === "demo";
}

// ---- open times ----------------------------------------------------------------

/** "18:00:00" or "18:00" to "18:00". Null when it is not a time. */
export function normSlot(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::\d{2})?$/.exec(String(value ?? ""));
  return m ? `${m[1]}:${m[2]}` : null;
}
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Up to `n` open times nearest to `wanted`, earlier one first on a tie, shown in clock order. */
export function nearestSlots(slots, wanted, n = 3) {
  const list = [...new Set((Array.isArray(slots) ? slots : []).map(normSlot).filter(Boolean))];
  const w = normSlot(wanted);
  if (!w) return list.slice(0, n);
  const target = minutesOf(w);
  return list.sort((a, b) => Math.abs(minutesOf(a) - target) - Math.abs(minutesOf(b) - target) || minutesOf(a) - minutesOf(b)).slice(0, n).sort();
}

/** ["18:30","19:30","20:00"] -> "6:30 PM, 7:30 PM or 8:00 PM". */
export function joinTimes(times) {
  const t = times.map(formatReserveTime);
  return t.length <= 1 ? t.join("") : `${t.slice(0, -1).join(", ")} or ${t[t.length - 1]}`;
}

// ---- the chat: model output is never trusted ------------------------------------

/** Pull {reply, draft} out of the model text. Null when it is not usable JSON. */
export function parseChatOutput(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || typeof obj.reply !== "string") return null;
  return { reply: obj.reply, draft: obj.draft && typeof obj.draft === "object" && !Array.isArray(obj.draft) ? obj.draft : {} };
}

/** Validate each draft field on its own and null anything invalid. */
export function normalizeDraft(modelOutput, { today, maxParty = 40, windowDays = RESERVE_WINDOW_DAYS } = {}) {
  const src = modelOutput && typeof modelOutput === "object" ? modelOutput : {};
  const note = checkNote(src.note);
  return {
    partySize: cleanPartySize(src.partySize, maxParty),
    date: cleanDate(src.date, today, windowDays),
    time: cleanTime(src.time),
    guestName: cleanGuestName(src.guestName),
    note: note.ok ? note.value : null,
  };
}

export function isDraftComplete(draft) {
  return Boolean(draft && draft.partySize && draft.date && draft.time && draft.guestName);
}

// Words that would state availability or a booking. The model may never say them: only the server knows.
const CLAIM_RE = /\b(?:booked|confirmed|reserved|secured|available|availability|open|opening|openings|free|vacant|vacancy|you'?re all set|you are all set|guaranteed|see you)\b/i;

/** Plain next question, used when the model reply is empty or unsafe. */
export function nextQuestion(draft) {
  const d = draft || {};
  if (!d.partySize) return "How many people will be dining?";
  if (!d.date) return "Which day would you like?";
  if (!d.time) return "What time would you like?";
  if (!d.guestName) return "What name should the table be under?";
  return "Does that look right? Tap Book table when you are ready.";
}

/**
 * The reply is shown to the guest, so it is cleaned: no dashes used as
 * punctuation, no links or contact details, and never a claim that a table is
 * open, available or booked. Anything unsafe is replaced by the next plain question.
 */
export function cleanReply(reply, draft) {
  let text = String(reply || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s*[–—]\s*/g, ", ").replace(/\s+-\s+/g, ", ").replace(/\s+/g, " ").trim();
  if (text.length > 400) text = text.slice(0, 400).replace(/\s+\S*$/, "").trim();
  if (!text || CLAIM_RE.test(text) || hasContactDetails(text)) return nextQuestion(draft);
  return text;
}

const supplied = (v) => v !== null && v !== undefined && v !== "";

/**
 * The ONE function the chat handler calls after parseChatOutput (and the scoring
 * script runs the same code). It builds the draft from the model's fields, then
 * makes sure the reply the guest reads can never disagree with the draft: when the
 * server rejects or adjusts a field the model supplied, the model reply is
 * DISCARDED and replaced by one plain server line that says what to fix.
 * parsed: { reply, draft } from parseChatOutput. Returns { reply, draft, complete }.
 * `complete` here means the draft is filled in; the handler still checks real openings.
 */
export function finishChatTurn({ parsed, today, nowMs, maxParty = 40, restaurantName = "", leadMinutes = RESERVE_DEFAULT_LEAD_MINUTES, windowDays = RESERVE_WINDOW_DAYS, timeZone } = {}) {
  const src = parsed && parsed.draft && typeof parsed.draft === "object" ? parsed.draft : {};
  const note = checkNote(src.note);
  const strictTime = cleanTime(src.time);
  const snapped = strictTime ? null : snapTimeToStep(src.time);
  const draft = {
    partySize: cleanPartySize(src.partySize, maxParty),
    date: cleanDate(src.date, today, windowDays),
    time: strictTime || snapped,
    guestName: cleanGuestName(src.guestName),
    note: note.ok ? note.value : null,
  };
  let tooSoon = false;
  if (draft.date && draft.time && Number.isFinite(nowMs) && zonedToUtcMs(draft.date, draft.time, timeZone) < nowMs + leadMinutes * 60000) { draft.time = null; tooSoon = true; }
  const rejected = {
    party: supplied(src.partySize) && draft.partySize === null,
    date: supplied(src.date) && draft.date === null,
    time: supplied(src.time) && draft.time === null && !tooSoon,
    name: supplied(src.guestName) && draft.guestName === null,
  };
  const adjusted = Boolean(snapped) && draft.time === snapped;
  const complete = isDraftComplete(draft);
  const place = String(restaurantName || "").trim() || "the restaurant";
  let reply;
  if (rejected.party) reply = `How many people? The most ${place} takes here is ${maxParty}.`;
  else if (rejected.date) reply = `Which day would you like? I can take today through ${formatReserveDate(addDays(today, windowDays)).split(", ")[1]}.`;
  else if (tooSoon) reply = `That time is too soon. Pick a time at least ${leadWords(leadMinutes)} from now, or call the restaurant.`;
  else if (rejected.time) reply = "What time would you like? For example 7:00 PM or 7:15 PM.";
  else if (rejected.name) reply = "What name should the table be under? Letters only, please.";
  else if (adjusted) reply = `Tables go on quarter hours, so I set ${formatReserveTime(draft.time)}. ${nextQuestion(draft)}`;
  else reply = cleanReply(parsed && parsed.reply, draft);
  return { reply, draft, complete };
}

/**
 * Check a finished chat turn against the REAL open times for the draft's day (from the database,
 * never from the model). Returns { reply, draft, verified, complete }.
 * - day known but no open times: the date is dropped and ONE server line says so.
 * - time not among the open times: the time is dropped and ONE server line offers up to 3 nearest.
 * - time among the open times: verified.
 * `slots` is null when the day or party is not known yet (nothing to check).
 */
export function applyAvailability({ turn, slots, restaurantName = "" } = {}) {
  const draft = { ...turn.draft };
  if (!Array.isArray(slots) || !draft.date || !draft.partySize) return { reply: turn.reply, draft, verified: false, complete: false };
  const open = [...new Set(slots.map(normSlot).filter(Boolean))].sort();
  const place = String(restaurantName || "").trim() || "the restaurant";
  if (!open.length) {
    draft.date = null; draft.time = null;
    return { reply: `${place} has no open tables on ${formatReserveDate(turn.draft.date)}. Which other day works?`, draft, verified: false, complete: false };
  }
  if (draft.time && !open.includes(draft.time)) {
    const wanted = draft.time;
    draft.time = null;
    return { reply: `${formatReserveTime(wanted)} is taken. I can do ${joinTimes(nearestSlots(open, wanted, 3))}. Which works?`, draft, verified: false, complete: false };
  }
  const verified = Boolean(draft.time);
  return { reply: turn.reply, draft, verified, complete: verified && isDraftComplete(draft) };
}
