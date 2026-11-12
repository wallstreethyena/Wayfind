// lib/reserveClientApi.js — the LAZY half of "Reserve a table" (loaded only with the sheet).
//
// API wrappers and the form rules. They live apart from lib/reserveClient.js on
// purpose: the place card imports reserveClient, and the card is eager on "/", so
// anything the card does not need on first paint stays out of that file (the
// homepage JS budget is a ratchet with about a kilobyte of headroom).
//
// Contract (implemented by lib/reserveApi.js):
//   POST /api/reserve-chat               -> { ok, reply, draft, complete, verified } | { ok, fallback:"form", reason }
//   GET  /api/reserve/slots?placeId&date&party -> { ok, slots:["18:00"], phone, maxParty }   (no sign in)
//   POST /api/reserve/book               -> 201 { ok, booking } | 409 { ok:false, error:"SLOT_FULL", alternatives:[] }
//   GET  /api/reserve/mine?placeId=...   -> { ok, bookings: [...] }
//   POST /api/reserve/cancel             -> { ok, booking }
//   POST /api/reserve/proposal           -> { ok, booking } | 409 { ok:false, error:"SLOT_FULL" }
//   errors                               -> { ok:false, error:"NAMED_CODE", message }   (401 when signed out)
import { siteTodayStr } from "./siteTime.js";

export const RESERVE_LIMITS = Object.freeze({ maxParty: 12, maxDays: 60, nameMax: 40, noteMax: 200, stepMinutes: 15, seatingMinutes: 90 });

// ── API WRAPPERS ─────────────────────────────────────────────────────────────
// Thin. They never throw: a dead network is { ok:false, error:"NETWORK" }.
async function authHeaders() {
  try {
    const m = await import("./supabase");
    const { data } = await m.supabase.auth.getSession();
    const t = data && data.session && data.session.access_token;
    return t ? { Authorization: "Bearer " + t } : {};
  } catch (e) { return {}; }
}

async function call(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: Object.assign({ Accept: "application/json" }, body ? { "Content-Type": "application/json" } : {}, await authHeaders()),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    if (!json || typeof json !== "object") return { ok: false, error: "BAD_RESPONSE", message: "Something went wrong. Please try again.", status: res.status };
    return Object.assign({}, json, { status: res.status });
  } catch (e) {
    return { ok: false, error: "NETWORK", message: "We could not reach Wayfind. Check your connection and try again.", status: 0 };
  }
}

export function reserveChat(placeId, messages, draft) {
  // The server caps at 12 messages of 500 characters. Trim here so a long chat never 400s.
  const trimmed = (messages || []).slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 500) }));
  const body = { placeId, messages: trimmed };
  if (draft && draft.date && draft.partySize) body.draft = { date: draft.date, partySize: draft.partySize };
  return call("POST", "/api/reserve-chat", body);
}
export function reserveSlots(placeId, date, party) {
  return call("GET", "/api/reserve/slots?placeId=" + encodeURIComponent(placeId) + "&date=" + encodeURIComponent(date) + "&party=" + encodeURIComponent(party));
}
export function bookTable(req) { return call("POST", "/api/reserve/book", req); }
export function myBookings(placeId) { return call("GET", "/api/reserve/mine?placeId=" + encodeURIComponent(placeId)); }
export function cancelBooking(bookingId) { return call("POST", "/api/reserve/cancel", { bookingId }); }
export function answerProposal(bookingId, accept) { return call("POST", "/api/reserve/proposal", { bookingId, accept: accept === true }); }

// ── FORM RULES (shape checks; the database decides what is open) ─────────────
export function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days)); // pure calendar arithmetic on a YYYY-MM-DD string, not a "today" read
  const p2 = (n) => String(n).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate());
}
/** Today through today + 60 days, US Eastern. Open times for each day come from /api/reserve/slots. */
export function reserveDateRange(now = new Date()) {
  const today = siteTodayStr(now);
  return { min: today, max: addDaysIso(today, RESERVE_LIMITS.maxDays) };
}
export function timeLabel(hhmm) {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm || "");
  if (!m) return "";
  const h = Number(m[1]);
  return ((h + 11) % 12 + 1) + ":" + m[2] + " " + (h >= 12 ? "PM" : "AM");
}
export function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return day + ", " + mon + " " + d.getUTCDate();
}
/** "4 people · Sat, Nov 14 · 7:00 PM · under Gabe" */
export function summaryLine(d) {
  return [
    d.partySize + (d.partySize === 1 ? " person" : " people"),
    dateLabel(d.date),
    timeLabel(d.time),
    d.guestName ? "under " + d.guestName : "",
  ].filter(Boolean).join(" \u00b7 ");
}
/** US phone as "(941) 555-0100", or null. Mirrors the server (lib/reserve.js cleanPhone). */
export function cleanPhoneInput(value) {
  if (typeof value !== "string" || /[^\d\s().+-]/.test(value)) return null;
  let d = value.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d) || /^.{3}[01]/.test(d)) return null;
  return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
}
/** null when valid, else a plain words message. Same shape rules the server enforces. */
export function validateDraft(d, now = new Date(), maxParty = RESERVE_LIMITS.maxParty) {
  if (!d) return "Fill in the details first.";
  const { min, max } = reserveDateRange(now);
  if (!Number.isInteger(d.partySize) || d.partySize < 1 || d.partySize > maxParty) return "Choose 1 to " + maxParty + " people.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "") || d.date < min || d.date > max) return "Choose a day from today to 60 days out.";
  if (!/^\d{2}:\d{2}$/.test(d.time || "") || Number(d.time.slice(3)) % RESERVE_LIMITS.stepMinutes !== 0) return "Pick one of the open times.";
  const name = String(d.guestName || "").trim();
  if (name.length < 1 || name.length > RESERVE_LIMITS.nameMax) return "Add a name for the table, up to 40 letters.";
  if (d.note && String(d.note).length > RESERVE_LIMITS.noteMax) return "Keep the note under 200 letters.";
  return null;
}

/** One idempotency key per summary. The same key on a retry can never book twice. */
export function newIdempotencyKey() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

// ── ADD TO CALENDAR (.ics, built in the browser, no network) ─────────────────
const icsText = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// ISO text, not field reads: DTSTAMP is "when this file was made" and the start is calendar arithmetic on the booking's own wall time.
const icsStamp = (t) => t.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
/** The calendar file for a saved booking. The start is the restaurant's local clock time. */
export function buildIcs(booking, now = new Date()) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(booking.date || ""), t = /^(\d{2}):(\d{2})/.exec(booking.time || "");
  if (!d || !t) return "";
  const start = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]));
  const end = new Date(start.getTime() + RESERVE_LIMITS.seatingMinutes * 60000);
  const local = (x) => x.toISOString().slice(0, 16).replace(/[-:]/g, "") + "00";
  const name = booking.restaurantName || "the restaurant";
  const desc = "Table for " + booking.partySize + ". Confirmation code " + booking.confirmationCode + "." + (booking.restaurantPhone ? " Running late? Call " + booking.restaurantPhone + "." : "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wayfind//Reserve a table//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + icsText(booking.id || booking.confirmationCode) + "@gowayfind.com",
    "DTSTAMP:" + icsStamp(now),
    "DTSTART:" + local(start), "DTEND:" + local(end),
    "SUMMARY:" + icsText("Table at " + name), "LOCATION:" + icsText(name), "DESCRIPTION:" + icsText(desc),
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
/** Start a download of the .ics file. Returns false when the browser cannot. */
export function downloadIcs(booking) {
  try {
    const text = buildIcs(booking);
    if (!text) return false;
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "table-" + booking.confirmationCode + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
    return true;
  } catch (e) { return false; }
}
