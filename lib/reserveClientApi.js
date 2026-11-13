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
import { addStopToStoredTrips } from "./itineraryAdd.js";
import { directionsUrl } from "./rowCta.js";
import { track } from "./track.js";

export { directionsUrl };

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
// Reserve v2 (guest app). Auth is the same Bearer token as every call above.
//   GET  /api/reserve/path?placeId=            -> { ok, path:"wayfind"|"opentable"|"none", restaurant:{placeId,name,phone}, maxParty? }
//   GET/PUT/DELETE /api/reserve/profile        -> { ok, profile } (phone and email are kept only with consent:true)
//   POST /api/reserve/find                     -> { ok, picks:[{placeId,name,locality,cuisines,score,path}] } (max 3)
//   GET  /api/reserve/history                  -> { ok, bookings:[...] }
//   GET  /api/reserve/go?placeId&date&time&party -> 302 to OpenTable's own form. Only ever used as a link.
export function reservePath(placeId) { return call("GET", "/api/reserve/path?placeId=" + encodeURIComponent(placeId)); }
export function getProfile() { return call("GET", "/api/reserve/profile"); }
export function saveProfile(p) { return call("PUT", "/api/reserve/profile", p); }
export function deleteProfile() { return call("DELETE", "/api/reserve/profile"); }
export function reserveFind(body) { return call("POST", "/api/reserve/find", body || {}); }
export function reserveHistory() { return call("GET", "/api/reserve/history"); }
/** The handoff link. The server verifies the restaurant and builds the OpenTable address: the client never does. */
export function reserveGoUrl({ placeId, date, time, party }) {
  const q = ["placeId=" + encodeURIComponent(placeId)];
  if (date) q.push("date=" + encodeURIComponent(date));
  if (time) q.push("time=" + encodeURIComponent(time));
  if (party) q.push("party=" + encodeURIComponent(party));
  return "/api/reserve/go?" + q.join("&");
}
/** OpenTable only has :00 and :30 times. Offered as "around" times, never as open tables. */
export function halfHourTimes() {
  const out = [];
  for (let h = 11; h <= 22; h++) { out.push(String(h).padStart(2, "0") + ":00"); if (h < 22) out.push(String(h).padStart(2, "0") + ":30"); }
  return out;
}
/** Nearest :00 or :30 for a HH:MM (what the guest asked for, shown as "around"). */
export function nearestHalfHour(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const total = Math.min(Math.round((Number(m[1]) * 60 + Number(m[2])) / 30) * 30, 23 * 60 + 30); // never rolls into the next day
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + (total % 60 === 0 ? "00" : "30");
}
/** The body of PUT /api/reserve/profile. The server replaces the whole row, so every kept field is sent back. Phone goes as E.164. */
export function profileBody(p, over) {
  const m = Object.assign({}, p || {}, over || {});
  const out = { consent: m.consent === true };
  if (m.firstName) out.firstName = m.firstName;
  if (m.lastName) out.lastName = m.lastName;
  if (m.preferredEmail) out.preferredEmail = m.preferredEmail;
  if (m.mobilePhone) { const c = cleanPhoneInput(m.mobilePhone); out.mobilePhone = c ? "+1" + c.replace(/\D/g, "") : m.mobilePhone; }
  if (Number.isInteger(m.defaultPartySize)) out.defaultPartySize = m.defaultPartySize;
  return out;
}
/** "Gabriel P." from a saved profile, or "". */
export function profileShortName(p) {
  if (!p || !p.firstName) return "";
  return p.firstName + (p.lastName ? " " + String(p.lastName).trim().slice(0, 1).toUpperCase() + "." : "");
}
/** "Friday" style day word plus time, for the handoff sentence: "Fri, Nov 14 around 7:30 PM". */
export function aroundLine(date, time) {
  return [dateLabel(date), time ? "around " + timeLabel(time) : ""].filter(Boolean).join(" ");
}

// Handoffs: a tap on "Open X on OpenTable" is remembered on this device only, so history can say "Started on OpenTable".
export const HANDOFF_KEY = "wf_reserve_handoffs";
export const HANDOFF_MAX = 20;
export function readHandoffs() {
  try { const v = JSON.parse(localStorage.getItem(HANDOFF_KEY) || "[]"); return Array.isArray(v) ? v.filter((h) => h && h.placeId).slice(0, HANDOFF_MAX) : []; } catch (e) { return []; }
}
export function addHandoff(h) {
  try {
    const row = { placeId: String(h.placeId), name: String(h.name || "").slice(0, 80), date: h.date || "", time: h.time || "", party: h.party || null, at: Date.now() };
    const next = [row].concat(readHandoffs().filter((x) => !(x.placeId === row.placeId && x.date === row.date && x.time === row.time))).slice(0, HANDOFF_MAX);
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(next));
    return next;
  } catch (e) { return []; }
}

// Add to itinerary: the same stored-trips path the event page uses (lib/itineraryAdd.js). Returns { ok, already }.
export function addToItinerary(place) {
  try {
    if (!place || !place.id) return { ok: false };
    const raw = localStorage.getItem("wf_trips_v1");
    let trips = {}; try { const p = raw ? JSON.parse(raw) : null; if (p && typeof p === "object") trips = p; } catch (e) {}
    const stop = { id: place.id, name: place.name || "Restaurant", address: place.address || "", lat: place.lat, lng: place.lng, city: place.city };
    const res = addStopToStoredTrips(trips, stop, Date.now(), { autoOrder: true, addedVia: "reserve_sheet" });
    if (!res.already) localStorage.setItem("wf_trips_v1", JSON.stringify(res.trips));
    for (const ev of res.events || []) { try { track(ev.name, ev.props); } catch (e) {} }
    return { ok: true, already: !!res.already };
  } catch (e) { return { ok: false }; }
}

/** One concierge turn: { messages, context:{placeId}, state } -> { ok, say, state, missing, card, profile } (docs/reserve-concierge-contract.md). */
export function conciergeTurn(body) { return call("POST", "/api/reserve/concierge", body || {}); }
/** The restaurant's answer to a request: action "accept" | "decline", optional reason. */
export function manageRespond(token, bookingId, action, reason) {
  const body = { token, bookingId, action };
  if (reason) body.reason = reason;
  return call("POST", "/api/reserve/manage", body);
}
/** "Friday" for a YYYY-MM-DD day. Calendar arithmetic only. */
export function weekdayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
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
export function validateDraft(d, now = new Date(), maxParty = RESERVE_LIMITS.maxParty, opts = {}) {
  if (!d) return "Fill in the details first.";
  const { min, max } = reserveDateRange(now);
  if (!Number.isInteger(d.partySize) || d.partySize < 1 || d.partySize > maxParty) return "Choose 1 to " + maxParty + " people.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "") || d.date < min || d.date > max) return "Choose a day from today to 60 days out.";
  if (!/^\d{2}:\d{2}$/.test(d.time || "") || Number(d.time.slice(3)) % RESERVE_LIMITS.stepMinutes !== 0) return "Pick one of the open times.";
  const name = String(d.guestName || "").trim();
  if (opts.needName === false) { if (name.length > RESERVE_LIMITS.nameMax) return "Add a name for the table, up to 40 letters."; }
  else if (name.length < 1 || name.length > RESERVE_LIMITS.nameMax) return "Add a name for the table, up to 40 letters.";
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
