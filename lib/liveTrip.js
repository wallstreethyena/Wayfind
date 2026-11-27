// lib/liveTrip.js — Wayfind Live Trips: the ONE reducer for shared itineraries.
//
// Pure functions only: no React, no network, no Date.now() inside the reducer.
// The browser (optimistic view), the IndexedDB replay queue and the server
// commit route all apply operations through applyOps() below, so every replica
// that applies the same ops to the same state gets byte-identical results.
// Design: https://claude.ai/artifact/EoyYytVrKH5BwTsvgZB9ib (Wayfind Live Trips).
//
// Consistency model
//   * The server is the single sequencer: wf_live_trip_commit() serializes
//     batches under a row lock and bumps `revision` (strict total order).
//   * Inside that order, every field is resolved by last-writer-wins on a
//     hybrid logical clock (HLC) stamp, tie-broken by client id (the stamp
//     string embeds it, so plain string comparison is a total order). An edit
//     made offline hours ago therefore loses to a newer edit that reached the
//     server first, instead of clobbering it on reconnect.
//   * Delete wins over every concurrent edit (tombstones).
//   * Stop order inside a day uses fractional index keys (`pos`), so two people
//     reordering at once never renumber each other's stops; equal keys fall
//     back to the stop id, which is deterministic.
//   * Adds are idempotent by stop id; replays of the same op id are no-ops.
//
// No CRDT library is used: the server sequencer plus per-field HLC LWW gives
// the same convergence for this data shape with a fraction of the bytes, and
// lets the server enforce limits and permissions (see the design doc).

import { normalizeStopDate } from "./tripDays.js";
import { slimPlace } from "./itineraryMigrate.js";

export const LIVE_TRIP_VERSION = 2;
export const MAX_STOPS = 60;
export const MAX_NOTE = 500;
export const MAX_TITLE = 140;
export const MAX_OPS_PER_BATCH = 50;
export const MAX_TOMBSTONES = 300;
export const MAX_STATE_BYTES = 64000;
export const MAX_POS_LEN = 64;
export const SEED_HLC = "000000000:000:seed";

const OP_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ITEM_ID_RE = /^[A-Za-z0-9_:.-]{1,120}$/;
const CLIENT_RE = /^[a-z0-9]{3,24}$/;
const HLC_RE = /^[0-9a-z]{9}:[0-9a-z]{3}:[a-z0-9]{3,24}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SET_FIELDS = new Set(["note", "visited", "locked", "time"]);
const META_FIELDS = new Set(["title", "startDate", "endDate"]);

// ── Fractional index keys ────────────────────────────────────────────────
// Base-62 digits in ASCII order, so JS string comparison sorts them. A key
// never ends in "0", which guarantees there is always room between two keys.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;
const POS_RE = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export function isValidPos(pos) {
  return typeof pos === "string" && pos.length >= 1 && pos.length <= MAX_POS_LEN && POS_RE.test(pos);
}

/** A key strictly between `a` and `b` (either may be null for open ends). */
export function posBetween(a, b) {
  const lo = a == null ? "" : String(a);
  let hi = b == null ? null : String(b);
  if (lo && !isValidPos(lo)) throw new Error("posBetween: bad lower key");
  if (hi != null && !isValidPos(hi)) throw new Error("posBetween: bad upper key");
  if (hi != null && !(lo < hi)) throw new Error("posBetween: lower must sort before upper");
  let out = "";
  for (let i = 0; ; i += 1) {
    const dLo = i < lo.length ? DIGITS.indexOf(lo[i]) : 0;
    const dHi = hi != null && i < hi.length ? DIGITS.indexOf(hi[i]) : BASE;
    if (dLo === dHi) { out += DIGITS[dLo]; continue; }
    const mid = Math.floor((dLo + dHi) / 2);
    if (mid > dLo) return out + DIGITS[mid];
    // Adjacent digits: keep the lower digit and look for room after it.
    out += DIGITS[dLo];
    hi = null;
  }
}

/** n keys in ascending order after `start` (exclusive). */
export function posSequence(n, start = null) {
  const keys = [];
  let prev = start;
  for (let i = 0; i < n; i += 1) { prev = posBetween(prev, null); keys.push(prev); }
  return keys;
}

// ── Hybrid logical clock ─────────────────────────────────────────────────
// "<wall ms base36, 9 chars>:<counter base36, 3 chars>:<client id>". Plain
// string comparison orders stamps by time, then counter, then client id.

export function formatHlc(wall, counter, clientId) {
  const w = Math.max(0, Math.floor(Number(wall) || 0));
  const c = Math.max(0, Math.min(46655, Math.floor(Number(counter) || 0)));
  return w.toString(36).padStart(9, "0").slice(-9) + ":" + c.toString(36).padStart(3, "0") + ":" + clientId;
}

export function parseHlc(stamp) {
  if (!isValidHlc(stamp)) return null;
  const [w, c, id] = stamp.split(":");
  return { wall: parseInt(w, 36), counter: parseInt(c, 36), clientId: id };
}

export function isValidHlc(stamp) {
  return typeof stamp === "string" && HLC_RE.test(stamp);
}

export function isValidClientId(id) {
  return typeof id === "string" && CLIENT_RE.test(id);
}

/** A per-device clock. `now` is injectable for tests. */
export function createHlc(clientId, now = () => Date.now()) {
  if (!isValidClientId(clientId)) throw new Error("createHlc: bad client id");
  let wall = 0;
  let counter = 0;
  return {
    clientId,
    tick() {
      const t = Math.floor(now());
      if (t > wall) { wall = t; counter = 0; } else { counter += 1; if (counter > 46655) { wall += 1; counter = 0; } }
      return formatHlc(wall, counter, clientId);
    },
    observe(stamp) {
      const p = parseHlc(stamp);
      if (!p) return;
      if (p.wall > wall) { wall = p.wall; counter = p.counter; } else if (p.wall === wall && p.counter > counter) { counter = p.counter; }
    },
  };
}

// ── Sanitizers ───────────────────────────────────────────────────────────

function cleanText(v, max) {
  if (v == null) return "";
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(CTRL_RE, "").trim().slice(0, max);
}

function safeUrl(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 500) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
}

const URL_KEYS = new Set(["photo", "href", "url", "mapsUrl", "detailHref", "ticketUrl"]);

/** The place payload a live stop may carry: whitelisted keys, safe URLs, size cap. */
export function cleanPlace(raw) {
  const slim = slimPlace(raw);
  const out = {};
  for (const [k, v] of Object.entries(slim)) {
    if (URL_KEYS.has(k)) { const u = safeUrl(v); if (u) out[k] = u; continue; }
    if (k === "lat" || k === "lng" || k === "rating" || k === "reviews" || k === "priceNum" || k === "wfScore") {
      const n = Number(v);
      if (v !== null && v !== "" && Number.isFinite(n)) out[k] = n;
      continue;
    }
    if (k === "reservable") { out[k] = !!v; continue; }
    if (k === "_event") continue;
    if (typeof v === "string" || typeof v === "number") out[k] = cleanText(v, k === "address" ? 200 : 120);
  }
  if (out.lat != null && (out.lat < -90 || out.lat > 90)) { delete out.lat; delete out.lng; }
  if (out.lng != null && (out.lng < -180 || out.lng > 180)) { delete out.lat; delete out.lng; }
  if (!out.name) out.name = "Saved stop";
  return out;
}

function cleanDay(v) {
  if (v == null || v === "") return null;
  return normalizeStopDate(v);
}

// ── State ────────────────────────────────────────────────────────────────

export function emptyState(meta = {}) {
  return {
    v: LIVE_TRIP_VERSION,
    title: cleanText(meta.title, MAX_TITLE) || "Our trip",
    city: cleanText(meta.city, 80) || "",
    region: cleanText(meta.region, 8) || "",
    startDate: cleanDay(meta.startDate),
    endDate: cleanDay(meta.endDate),
    metaTs: { title: SEED_HLC, startDate: SEED_HLC, endDate: SEED_HLC },
    items: {},
    removed: {},
  };
}

/** Build the first live state from a personal trip (lib/trips.js shape). */
export function stateFromTrip(trip, by = null) {
  const t = trip && typeof trip === "object" ? trip : {};
  const st = emptyState({
    title: t.title || [t.city, t.state].filter(Boolean).join(", "),
    city: t.city,
    region: t.state,
    startDate: t.startDate,
    endDate: t.endDate,
  });
  if (st.startDate && st.endDate && st.startDate > st.endDate) st.endDate = null;
  const raw = Array.isArray(t.items) ? t.items.slice() : [];
  raw.sort((a, b) => (Number(a && a.order) || 0) - (Number(b && b.order) || 0));
  const lastPosByDay = new Map();
  const seen = new Set();
  for (const it of raw) {
    if (!it || Object.keys(st.items).length >= MAX_STOPS) continue;
    const id = cleanText(it.id, 120).replace(/[^A-Za-z0-9_:.-]/g, "_");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let day = cleanDay(it.day);
    if (day && st.startDate && st.endDate && (day < st.startDate || day > st.endDate)) day = null;
    const dk = day || "";
    const pos = posBetween(lastPosByDay.get(dk) || null, null);
    lastPosByDay.set(dk, pos);
    st.items[id] = {
      id,
      place: cleanPlace(it.place || {}),
      day,
      pos,
      note: cleanText(it.note, MAX_NOTE),
      visited: !!it.visited,
      locked: !!it.locked,
      time: TIME_RE.test(String(it.time || "")) ? it.time : null,
      by: by || null,
      ts: { slot: SEED_HLC, note: SEED_HLC, visited: SEED_HLC, locked: SEED_HLC, time: SEED_HLC },
    };
  }
  return st;
}

/** Stops in display order: by day (scheduled days first, ascending), then pos, then id. */
export function orderedItems(state) {
  const items = Object.values((state && state.items) || {});
  return items.sort((a, b) => {
    const da = a.day || "~";
    const db = b.day || "~";
    if (da !== db) return da < db ? -1 : 1;
    if (a.pos !== b.pos) return a.pos < b.pos ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Stops of one day (null = unscheduled) in order. */
export function itemsForDay(state, day) {
  const key = day || null;
  return orderedItems(state).filter((it) => (it.day || null) === key);
}

/** The fractional key that places a stop right after `afterId` on `day` (null = first). */
export function posAfter(state, day, afterId, movingId = null) {
  const list = itemsForDay(state, day).filter((it) => it.id !== movingId);
  if (!afterId) return posBetween(null, list.length ? list[0].pos : null);
  const i = list.findIndex((it) => it.id === afterId);
  if (i < 0) return posBetween(list.length ? list[list.length - 1].pos : null, null);
  const next = list[i + 1];
  if (next && next.pos === list[i].pos) return posBetween(list[i].pos, null); // tie: append after
  return posBetween(list[i].pos, next ? next.pos : null);
}

/** Back to the personal trip shape, for the owner's Itinerary screen. */
export function tripFromState(state, key) {
  const items = orderedItems(state).map((it, i) => ({
    id: it.id, place: it.place, day: it.day, order: i, note: it.note, visited: it.visited, locked: it.locked,
  }));
  return {
    key, city: state.city || "Unsorted", state: state.region || null, title: state.title,
    startDate: state.startDate, endDate: state.endDate, items,
  };
}

// ── Stable serialization and checksum ────────────────────────────────────

export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

/** FNV-1a 32-bit over the stable serialization: replicas compare it to prove convergence. */
export function checksum(state) {
  const s = stableStringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function stateBytes(state) {
  return new TextEncoder().encode(stableStringify(state)).length;
}

// ── Operations ───────────────────────────────────────────────────────────

/**
 * Shape-check one op. Returns { ok: true, op } with a cleaned copy, or
 * { ok: false, reason }. `by` (member id) is stamped by the server only.
 */
export function validateOp(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "shape" };
  const id = raw.id;
  if (typeof id !== "string" || !OP_ID_RE.test(id)) return { ok: false, reason: "op_id" };
  if (!isValidHlc(raw.hlc)) return { ok: false, reason: "clock" };
  const base = { id, hlc: raw.hlc, type: raw.type };
  if (typeof raw.by === "string" && /^[0-9a-f-]{36}$/i.test(raw.by)) base.by = raw.by;
  switch (raw.type) {
    case "add": {
      const it = raw.item;
      if (!it || typeof it !== "object" || typeof it.id !== "string" || !ITEM_ID_RE.test(it.id)) return { ok: false, reason: "item" };
      if (!isValidPos(it.pos)) return { ok: false, reason: "pos" };
      const day = it.day == null || it.day === "" ? null : cleanDay(it.day);
      if (it.day != null && it.day !== "" && !day) return { ok: false, reason: "day" };
      return { ok: true, op: { ...base, item: { id: it.id, place: cleanPlace(it.place || {}), day, pos: it.pos, note: cleanText(it.note, MAX_NOTE) } } };
    }
    case "remove":
      if (typeof raw.itemId !== "string" || !ITEM_ID_RE.test(raw.itemId)) return { ok: false, reason: "item" };
      return { ok: true, op: { ...base, itemId: raw.itemId } };
    case "move": {
      if (typeof raw.itemId !== "string" || !ITEM_ID_RE.test(raw.itemId)) return { ok: false, reason: "item" };
      if (!isValidPos(raw.pos)) return { ok: false, reason: "pos" };
      const day = raw.day == null || raw.day === "" ? null : cleanDay(raw.day);
      if (raw.day != null && raw.day !== "" && !day) return { ok: false, reason: "day" };
      return { ok: true, op: { ...base, itemId: raw.itemId, day, pos: raw.pos } };
    }
    case "set": {
      if (typeof raw.itemId !== "string" || !ITEM_ID_RE.test(raw.itemId)) return { ok: false, reason: "item" };
      if (!SET_FIELDS.has(raw.field)) return { ok: false, reason: "field" };
      let value;
      if (raw.field === "note") value = cleanText(raw.value, MAX_NOTE);
      else if (raw.field === "time") {
        if (raw.value == null || raw.value === "") value = null;
        else if (TIME_RE.test(String(raw.value))) value = String(raw.value);
        else return { ok: false, reason: "value" };
      } else value = !!raw.value;
      return { ok: true, op: { ...base, itemId: raw.itemId, field: raw.field, value } };
    }
    case "meta": {
      if (!META_FIELDS.has(raw.field)) return { ok: false, reason: "field" };
      let value;
      if (raw.field === "title") {
        value = cleanText(raw.value, MAX_TITLE);
        if (!value) return { ok: false, reason: "value" };
      } else {
        value = raw.value == null || raw.value === "" ? null : cleanDay(raw.value);
        if (raw.value != null && raw.value !== "" && !value) return { ok: false, reason: "value" };
      }
      return { ok: true, op: { ...base, field: raw.field, value } };
    }
    default:
      return { ok: false, reason: "type" };
  }
}

function cloneState(state) {
  const items = {};
  for (const [k, it] of Object.entries(state.items || {})) items[k] = { ...it, place: it.place, ts: { ...it.ts } };
  return { ...state, metaTs: { ...state.metaTs }, items, removed: { ...state.removed } };
}

function dayInRange(state, day) {
  if (!day) return true;
  if (state.startDate && day < state.startDate) return false;
  if (state.endDate && day > state.endDate) return false;
  return true;
}

function newer(a, b) {
  return String(a) > String(b || "");
}

function trimTombstones(removed) {
  const keys = Object.keys(removed);
  if (keys.length <= MAX_TOMBSTONES) return removed;
  keys.sort((a, b) => (removed[a] < removed[b] ? -1 : removed[a] > removed[b] ? 1 : a < b ? -1 : 1));
  const out = {};
  for (const k of keys.slice(keys.length - MAX_TOMBSTONES)) out[k] = removed[k];
  return out;
}

function placeKey(place) {
  const id = place && place.id != null ? String(place.id) : "";
  return id ? id.replace(/__day_\d{4}-\d{2}-\d{2}$/, "") : "";
}

/**
 * Apply one validated op to a cloned state (mutates `s`). Returns
 * "applied" (state changed or the op is a harmless replay / lost a LWW race)
 * or a rejection reason string.
 */
function applyOne(s, op) {
  switch (op.type) {
    case "add": {
      const it = op.item;
      if (s.items[it.id] || s.removed[it.id]) return "applied"; // idempotent replay
      if (Object.keys(s.items).length >= MAX_STOPS) return "full";
      if (!dayInRange(s, it.day)) return "out_of_range";
      const pk = placeKey(it.place);
      if (pk && Object.values(s.items).some((x) => placeKey(x.place) === pk && (x.day || null) === (it.day || null))) return "duplicate";
      s.items[it.id] = {
        id: it.id, place: it.place, day: it.day, pos: it.pos, note: it.note || "",
        visited: false, locked: false, time: null, by: op.by || null,
        ts: { slot: op.hlc, note: op.hlc, visited: op.hlc, locked: op.hlc, time: op.hlc },
      };
      return "applied";
    }
    case "remove": {
      if (!s.items[op.itemId]) return s.removed[op.itemId] ? "applied" : "gone";
      delete s.items[op.itemId];
      s.removed[op.itemId] = op.hlc;
      s.removed = trimTombstones(s.removed);
      return "applied";
    }
    case "move": {
      const it = s.items[op.itemId];
      if (!it) return "gone";
      if (!dayInRange(s, op.day)) return "out_of_range";
      if (!newer(op.hlc, it.ts.slot)) return "applied"; // a newer move already won
      it.day = op.day;
      it.pos = op.pos;
      it.ts.slot = op.hlc;
      return "applied";
    }
    case "set": {
      const it = s.items[op.itemId];
      if (!it) return "gone";
      if (!newer(op.hlc, it.ts[op.field])) return "applied";
      it[op.field] = op.value;
      it.ts[op.field] = op.hlc;
      return "applied";
    }
    case "meta": {
      if (!newer(op.hlc, s.metaTs[op.field])) return "applied";
      const next = { start: s.startDate, end: s.endDate };
      if (op.field === "startDate") next.start = op.value;
      if (op.field === "endDate") next.end = op.value;
      if (next.start && next.end && next.start > next.end) return "date_order";
      if (op.field === "title") s.title = op.value;
      else {
        s.startDate = next.start;
        s.endDate = next.end;
        // Shrinking the range unschedules stops outside it (same rule as
        // reflowTripDates in lib/itineraryMigrate.js). The stop itself stays.
        for (const x of Object.values(s.items)) {
          if (x.day && !dayInRange(s, x.day)) { x.day = null; x.ts.slot = op.hlc; }
        }
      }
      s.metaTs[op.field] = op.hlc;
      return "applied";
    }
    default:
      return "type";
  }
}

/**
 * Apply ops in order. Never throws on bad input: invalid ops are rejected
 * individually. Returns { state, applied: [opId], rejected: [{ opId, reason }] }.
 */
export function applyOps(state, ops) {
  const s = cloneState(state || emptyState());
  const applied = [];
  const rejected = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    const v = validateOp(raw);
    if (!v.ok) { rejected.push({ opId: raw && typeof raw.id === "string" ? raw.id.slice(0, 64) : null, reason: v.reason }); continue; }
    const r = applyOne(s, v.op);
    if (r === "applied") applied.push(v.op.id); else rejected.push({ opId: v.op.id, reason: r });
  }
  return { state: s, applied, rejected };
}

/** Structural check of a whole state (e.g. read back from IndexedDB or the DB). */
export function isValidState(state) {
  if (!state || typeof state !== "object" || state.v !== LIVE_TRIP_VERSION) return false;
  if (!state.items || typeof state.items !== "object" || !state.removed || typeof state.removed !== "object") return false;
  if (!state.metaTs || typeof state.metaTs !== "object") return false;
  const items = Object.values(state.items);
  if (items.length > MAX_STOPS) return false;
  return items.every((it) => it && typeof it.id === "string" && state.items[it.id] === it && isValidPos(it.pos) && it.ts && typeof it.ts === "object");
}

/** A random id for ops, stops and devices (crypto when available). */
export function randomId(len = 16, alphabet = "abcdefghijklmnopqrstuvwxyz0123456789") {
  let bytes;
  try { bytes = globalThis.crypto.getRandomValues(new Uint8Array(len)); } catch { bytes = Array.from({ length: len }, () => Math.floor(Math.random() * 256)); }
  let out = "";
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
