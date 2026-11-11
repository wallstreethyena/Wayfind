// lib/reserveApi.js — the LAZY half of "Reserve a table" (loaded only with the sheet).
//
// API wrappers and the form rules. They live apart from lib/reserveClient.js on
// purpose: the place card imports reserveClient, and the card is eager on "/", so
// anything the card does not need on first paint stays out of that file (the
// homepage JS budget is a ratchet with about a kilobyte of headroom).
//
// Contract (fixed, implemented by the API lane):
//   POST /api/reserve-chat              -> { ok, reply, draft, complete } | { ok, fallback:"form", reason }
//   POST /api/reserve/request           -> 201 { ok, request, emailSent, demoRespondUrl? }
//   GET  /api/reserve/mine?placeId=...  -> { ok, requests: [...] }
//   errors                              -> { ok:false, error:"NAMED_CODE", message }   (401 when signed out)
import { siteTodayStr } from "./siteTime.js";

export const RESERVE_LIMITS = Object.freeze({ maxParty: 12, maxDays: 60, nameMax: 40, noteMax: 200, stepMinutes: 15 });

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

export function reserveChat(placeId, messages) {
  // The server caps at 12 messages of 500 characters. Trim here so a long chat never 400s.
  const trimmed = (messages || []).slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 500) }));
  return call("POST", "/api/reserve-chat", { placeId, messages: trimmed });
}
export function sendReserveRequest(req) { return call("POST", "/api/reserve/request", req); }
export function myReserveRequests(placeId) { return call("GET", "/api/reserve/mine?placeId=" + encodeURIComponent(placeId)); }

// ── FORM RULES (mirror of what the server enforces) ──────────────────────────
export function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
/** Today through today + 60 days, US Eastern. */
export function reserveDateRange(now = new Date()) {
  const min = siteTodayStr(now);
  return { min, max: addDaysIso(min, RESERVE_LIMITS.maxDays) };
}
/** "11:00" through "21:45" is a restaurant day; 15 minute steps. Values are 24h "HH:MM". */
export function reserveTimeSlots() {
  const out = [];
  for (let m = 11 * 60; m <= 22 * 60; m += RESERVE_LIMITS.stepMinutes) out.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
  return out;
}
export function timeLabel(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
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
/** null when valid, else a plain words message. Same limits the server enforces. */
export function validateDraft(d, now = new Date()) {
  if (!d) return "Fill in the details first.";
  const { min, max } = reserveDateRange(now);
  if (!Number.isInteger(d.partySize) || d.partySize < 1 || d.partySize > RESERVE_LIMITS.maxParty) return "Choose 1 to 12 people.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "") || d.date < min || d.date > max) return "Choose a day from today to 60 days out.";
  if (!/^\d{2}:\d{2}$/.test(d.time || "") || Number(d.time.slice(3)) % RESERVE_LIMITS.stepMinutes !== 0) return "Choose a time on the quarter hour.";
  const name = String(d.guestName || "").trim();
  if (name.length < 1 || name.length > RESERVE_LIMITS.nameMax) return "Add a name for the table, up to 40 letters.";
  if (d.note && String(d.note).length > RESERVE_LIMITS.noteMax) return "Keep the note under 200 letters.";
  return null;
}
/** A chat draft is only trusted when it passes the same rules as the form. */
export function draftIsSendable(d, now = new Date()) { return !!d && validateDraft(d, now) === null; }
