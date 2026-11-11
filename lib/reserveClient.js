// lib/reserveClient.js — CLIENT side of "Reserve a table".
//
// Client only. It never touches the server files (app/api/reserve*, lib/reserve*.js
// owned by the API lane); it talks to them through the fixed HTTP contract:
//
//   GET  /api/reserve/partners          -> { ok, placeIds: string[] }
//   POST /api/reserve-chat              -> { ok, reply, draft, complete } | { ok, fallback:"form", reason }
//   POST /api/reserve/request           -> 201 { ok, request, emailSent, demoRespondUrl? }
//   GET  /api/reserve/mine?placeId=...  -> { ok, requests: [...] }
//   errors                              -> { ok:false, error:"NAMED_CODE", message }   (401 when signed out)
//
// What lives here, and why it is this small: the place card imports this file,
// and the card is eager on "/". Everything heavy (the sheet) is a dynamic import
// behind openReserveSheet(), so the only cost on a card is one tiny store.
import { useSyncExternalStore } from "react";
import { siteTodayStr } from "./siteTime.js";
import { track } from "./track.js";

const CACHE_KEY = "wf_reserve_partners_v1";
const CACHE_MS = 5 * 60 * 1000;
export const RESERVE_LIMITS = Object.freeze({ maxParty: 12, maxDays: 60, nameMax: 40, noteMax: 200, stepMinutes: 15 });

// ── PARTNER SET ──────────────────────────────────────────────────────────────
// One GET per session. Memory first, then sessionStorage (5 minutes), then the
// network. A failure is an EMPTY set plus one console.warn, never a throw, and
// never a retry storm: the empty answer is remembered for the same 5 minutes.
let partnerIds = new Set();
let partnerExpires = 0;
let inflight = null;
let warned = false;
const listeners = new Set();
const notify = () => { for (const l of listeners) { try { l(); } catch (e) {} } };

function readSessionCache() {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(CACHE_KEY) : null;
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.t !== "number" || !Array.isArray(v.ids) || Date.now() - v.t > CACHE_MS) return null;
    return v;
  } catch (e) { return null; }
}

export function loadReservePartners() {
  if (typeof window === "undefined") return Promise.resolve(new Set());
  const now = Date.now();
  if (partnerExpires > now) return Promise.resolve(partnerIds);
  if (inflight) return inflight;
  const cached = readSessionCache();
  if (cached) {
    partnerIds = new Set(cached.ids.filter((x) => typeof x === "string"));
    partnerExpires = cached.t + CACHE_MS;
    notify();
    return Promise.resolve(partnerIds);
  }
  inflight = fetch("/api/reserve/partners", { headers: { Accept: "application/json" } })
    .then((r) => r.json().then((j) => ({ r, j })))
    .then(({ r, j }) => {
      if (!r.ok || !j || j.ok !== true || !Array.isArray(j.placeIds)) throw new Error("bad partners response " + r.status);
      const ids = j.placeIds.filter((x) => typeof x === "string");
      partnerIds = new Set(ids);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), ids })); } catch (e) {}
    })
    .catch((e) => {
      partnerIds = new Set();
      if (!warned) { warned = true; try { console.warn("[reserve] partner list unavailable:", e && e.message); } catch (er) {} }
    })
    .then(() => {
      partnerExpires = Date.now() + CACHE_MS;
      inflight = null;
      notify();
      return partnerIds;
    });
  return inflight;
}

function subscribe(cb) {
  listeners.add(cb);
  // First subscriber on the client starts the one fetch. After hydration, never during render.
  loadReservePartners();
  return () => { listeners.delete(cb); };
}
const noSubscribe = () => () => {};

/**
 * true only for a place that is a Wayfind reservation partner.
 * False on the server and on the hydrating render (getServerSnapshot), so server
 * HTML and the first client render agree; the update arrives right after.
 * Pass a falsy id to opt out entirely: no subscription, no fetch (a card whose
 * caller filled the CTA slot itself).
 */
export function useReservePartner(placeId) {
  const on = !!placeId;
  return useSyncExternalStore(
    on ? subscribe : noSubscribe,
    () => (on && partnerIds.has(placeId) && partnerExpires > 0),
    () => false,
  );
}

// test seam, never called by product code
export function __resetReserveClientForTests() { partnerIds = new Set(); partnerExpires = 0; inflight = null; warned = false; listeners.clear(); }

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

// ── ANALYTICS (no names, no notes, ever) ─────────────────────────────────────
export function trackReserve(event, params) {
  try { track(event, params); } catch (e) {}
}

// ── THE ONE OPENER ───────────────────────────────────────────────────────────
// Any surface calls openReserveSheet(place). The sheet is a separate chunk,
// fetched on first tap, so none of its code is in the card's bundle.
export function openReserveSheet(place, opts) {
  if (typeof window === "undefined" || !place || !place.id) return;
  const surface = (opts && opts.surface) || "place_card";
  trackReserve("reserve_cta_clicked", { surface, place_id: place.id });
  import("../app/components/ReserveSheet.js")
    .then((m) => m.showReserveSheet({ id: place.id, name: place.name || "this restaurant" }, { surface }))
    .catch((e) => { try { console.warn("[reserve] sheet failed to load:", e && e.message); } catch (er) {} });
}
