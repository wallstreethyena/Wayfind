// lib/reserve.js - PURE logic for "Reserve a table". No I/O, no network, no database.
//
// Wayfind asks a partner restaurant for a table. The restaurant answers Yes or No
// from one emailed link. Wayfind never takes payment and never says a table is
// booked or available before the restaurant has said yes.
//
// Everything here is callable from a test with no fakes: scripts/test-reserve-logic.mjs.
import { randomBytes, createHash } from "node:crypto";
import { dtf } from "./intlCache.js";
import { isDateString, addDays, weekdayName, formatReserveDate, formatReserveTime } from "./reserveFormat.js";

export { isDateString, addDays, weekdayName, formatReserveDate, formatReserveTime };

const SITE_TZ = "America/New_York";

export const RESERVE_WINDOW_DAYS = 60;
export const RESERVE_PENDING_HOURS = 24;
export const RESERVE_MAX_PENDING_PER_USER = 3;
export const RESERVE_NOTE_MAX = 200;
export const RESERVE_NAME_MAX = 40;
export const RESERVE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

// ---- dates and times (US Eastern, the venue timezone) -----------------------

function easternOffsetMinutes(utcMs) {
  const parts = dtf("en-US", { timeZone: SITE_TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(utcMs));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** The UTC instant (ms) of a US Eastern wall clock date and time. DST aware. */
export function easternToUtcMs(dateStr, timeStr) {
  const d = DATE_RE.exec(dateStr), t = TIME_RE.exec(String(timeStr).slice(0, 5));
  if (!d || !t) return NaN;
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let guess = naive - easternOffsetMinutes(naive) * 60000;
  guess = naive - easternOffsetMinutes(guess) * 60000;
  return guess;
}

/**
 * When a pending request stops being answerable: the earlier of the reservation
 * itself (Eastern) and 24 hours after it was made. Returns an ISO string.
 */
export function computeExpiresAt(dateStr, timeStr, createdAtMs) {
  const at = easternToUtcMs(dateStr, timeStr);
  const cap = createdAtMs + RESERVE_PENDING_HOURS * 3600 * 1000;
  return new Date(Number.isFinite(at) ? Math.min(at, cap) : cap).toISOString();
}

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

export function cleanDate(value, today) {
  if (!isDateString(value) || !isDateString(today)) return null;
  return value >= today && value <= addDays(today, RESERVE_WINDOW_DAYS) ? value : null;
}

/** HH:MM on a 15 minute step. */
export function cleanTime(value) {
  const m = TIME_RE.exec(typeof value === "string" ? value.trim() : "");
  return m && Number(m[2]) % 15 === 0 ? `${m[1]}:${m[2]}` : null;
}

export function cleanGuestName(value) {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= RESERVE_NAME_MAX && NAME_RE.test(name) ? name : null;
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

const MESSAGES = {
  INVALID_PARTY_SIZE: "Tell us how many people are coming.",
  PARTY_TOO_LARGE: "That is more people than this restaurant takes by request.",
  INVALID_DATE: "Pick a day for your table.",
  DATE_PAST: "Pick today or a day coming up.",
  DATE_TOO_FAR: "You can ask for a table up to 60 days ahead.",
  INVALID_TIME: "Pick a time on the quarter hour, like 6:30 PM.",
  TIME_PAST: "That time has already passed. Pick a later time.",
  INVALID_NAME: "Add the name for the table, using letters only.",
  INVALID_NOTE: "Keep the note under 200 characters.",
  NOTE_NOT_ALLOWED: "Please leave links, emails and phone numbers out of the note.",
};
export function reserveErrorMessage(code) { return MESSAGES[code] || "Check your request and try again."; }

/**
 * Validate and normalize a table request.
 * ctx: { today: "YYYY-MM-DD" (Eastern), maxParty, now?: ms }.
 * Returns { ok:true, value:{partySize,date,time,guestName,note} } or { ok:false, error, message }.
 */
export function validateReserveInput(input, { today, maxParty = 40, now } = {}) {
  const fail = (error) => ({ ok: false, error, message: reserveErrorMessage(error) });
  const src = input && typeof input === "object" ? input : {};
  if (!isDateString(today)) throw new TypeError("validateReserveInput needs today as YYYY-MM-DD");
  const size = toIntegerOrNull(src.partySize);
  if (size === null || size < 1) return fail("INVALID_PARTY_SIZE");
  const cap = Number.isInteger(maxParty) ? Math.min(40, Math.max(1, maxParty)) : 40;
  if (size > cap) return fail("PARTY_TOO_LARGE");
  if (!isDateString(src.date)) return fail("INVALID_DATE");
  if (src.date < today) return fail("DATE_PAST");
  if (src.date > addDays(today, RESERVE_WINDOW_DAYS)) return fail("DATE_TOO_FAR");
  const time = cleanTime(src.time);
  if (!time) return fail("INVALID_TIME");
  if (Number.isFinite(now) && easternToUtcMs(src.date, time) <= now) return fail("TIME_PAST");
  const guestName = cleanGuestName(src.guestName);
  if (!guestName) return fail("INVALID_NAME");
  const note = checkNote(src.note);
  if (!note.ok) return fail(note.error);
  return { ok: true, value: { partySize: size, date: src.date, time, guestName, note: note.value } };
}

// ---- respond tokens -----------------------------------------------------------

/** 32 random bytes, base64url (43 characters). Only its hash is stored. */
export function newRespondToken() { return randomBytes(32).toString("base64url"); }
export function hashRespondToken(token) { return createHash("sha256").update(String(token)).digest("hex"); }
export function isRespondTokenShape(token) { return typeof token === "string" && RESERVE_TOKEN_RE.test(token); }

// ---- status machine -----------------------------------------------------------

const ACTIONS = { confirm: "confirmed", decline: "declined" };
const STATUSES = ["pending", "confirmed", "declined", "cancelled", "expired"];

/**
 * Only a pending request can move, and only once. Repeats and late opposite
 * clicks are no-ops that report the current status.
 * Returns { ok:true, status, changed } or { ok:false, error }.
 */
export function nextReserveStatus(current, action) {
  if (!STATUSES.includes(current)) return { ok: false, error: "INVALID_STATUS" };
  const target = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!target) return { ok: false, error: "INVALID_ACTION" };
  if (current !== "pending") return { ok: true, status: current, changed: false };
  return { ok: true, status: target, changed: true };
}

/** True once the request's expires_at is at or before `now` (ms). */
export function isExpired(request, now) {
  const at = Date.parse(request && (request.expires_at ?? request.expiresAt));
  return Number.isFinite(at) && Number.isFinite(now) ? at <= now : false;
}

/** The status a person should see: a pending row past expiry reads "expired". */
export function effectiveStatus(request, now) {
  return request && request.status === "pending" && isExpired(request, now) ? "expired" : request ? request.status : null;
}

// ---- rollout gates ------------------------------------------------------------

/**
 * Restaurant email can only go out from production, with the feature switch on,
 * a Resend key, and the SAME verified sender condition the group plan email
 * uses (WF_GROUP_PLAN_EMAIL_VERIFIED + a valid WF_ALERT_FROM). Without email the
 * restaurant can never get the request, so there must be no Reserve button.
 */
export function reserveEmailReady(env = {}) {
  return env.VERCEL_ENV === "production" && env.WF_RESERVE_EMAIL_ENABLED === "1"
    && Boolean(env.RESEND_API_KEY)
    && env.WF_GROUP_PLAN_EMAIL_VERIFIED === "1"
    && /^[^\r\n]+@[^\r\n]+\.[^\r\n]+$/.test(String(env.WF_ALERT_FROM || ""));
}

/**
 * Does this partner get a Reserve button in this environment?
 * Production: stage live AND active AND email ready (fail closed).
 * Anywhere else: active, stage live or demo.
 */
export function partnerVisible(partner, env = {}) {
  if (!partner || partner.active !== true) return false;
  if (env.VERCEL_ENV === "production") return partner.stage === "live" && reserveEmailReady(env);
  return partner.stage === "live" || partner.stage === "demo";
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
export function normalizeDraft(modelOutput, { today, maxParty = 40 } = {}) {
  const src = modelOutput && typeof modelOutput === "object" ? modelOutput : {};
  const note = checkNote(src.note);
  return {
    partySize: cleanPartySize(src.partySize, maxParty),
    date: cleanDate(src.date, today),
    time: cleanTime(src.time),
    guestName: cleanGuestName(src.guestName),
    note: note.ok ? note.value : null,
  };
}

export function isDraftComplete(draft) {
  return Boolean(draft && draft.partySize && draft.date && draft.time && draft.guestName);
}

const CLAIM_RE = /\b(?:booked|confirmed|reserved|secured|available|you'?re all set|you are all set|guaranteed|see you)\b/i;

/** Plain next question, used when the model reply is empty or unsafe. */
export function nextQuestion(draft) {
  const d = draft || {};
  if (!d.partySize) return "How many people will be dining?";
  if (!d.date) return "Which day would you like?";
  if (!d.time) return "What time would you like?";
  if (!d.guestName) return "What name should the table be under?";
  return "Does that look right? The restaurant will answer you after you send it.";
}

/**
 * The reply is shown to the guest, so it is cleaned: no dashes used as
 * punctuation, no links or contact details, and never a claim that a table is
 * available or booked. Anything unsafe is replaced by the next plain question.
 */
export function cleanReply(reply, draft) {
  let text = String(reply || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s*[–—]\s*/g, ", ").replace(/\s+-\s+/g, ", ").replace(/\s+/g, " ").trim();
  if (text.length > 400) text = text.slice(0, 400).replace(/\s+\S*$/, "").trim();
  if (!text || CLAIM_RE.test(text) || hasContactDetails(text)) return nextQuestion(draft);
  return text;
}
