// lib/liveTripServer.js — server side of Wayfind Live Trips. Server only:
// never import this module from a client component.
//
// Every handler takes an injected `fetchImpl` and clock so
// scripts/test-live-trip-route.mjs drives the whole flow with no network.
// All database access uses the service role through PostgREST; membership and
// roles are checked HERE before any read or write, and every write of trip
// state goes through public.wf_live_trip_commit (compare-and-swap + broadcast
// in one transaction). Design: https://claude.ai/artifact/EoyYytVrKH5BwTsvgZB9ib
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  applyOps, validateOp, stateFromTrip, checksum, stateBytes, isValidState, parseHlc, formatHlc,
  MAX_OPS_PER_BATCH, MAX_STATE_BYTES,
} from "./liveTrip.js";

export const LIVE_TRIP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_MEMBERS = 12;
export const MAX_OWNED_LIVE_TRIPS = 25;
export const OPS_PER_MINUTE = 240;
const CODE_RE = /^[A-Za-z0-9_-]{22}$/;
const COLORS = ["#F97316", "#22C55E", "#3B82F6", "#E11D48", "#A855F7", "#14B8A6", "#EAB308", "#EC4899", "#0EA5E9", "#84CC16", "#F43F5E", "#8B5CF6"];
const FUTURE_SKEW_MS = 120000;

function cleanUrl(raw) {
  const s = String(raw || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  if (!s) return "";
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  return /^https:\/\//i.test(s) ? s : "https://" + s;
}

/** null when configuration is missing: routes answer 503, never a fake empty state. */
export function liveTripEnv(env = process.env) {
  const url = cleanUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const service = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anon = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(url) || service.length < 20 || anon.length < 20) return null;
  if (env.LIVE_TRIPS_OFF === "1" || env.NEXT_PUBLIC_LIVE_TRIPS_OFF === "1") return null;
  return { url, service, anon };
}

export function bearerFrom(req) {
  const m = String((req && req.headers && req.headers.get("authorization")) || "").match(/^Bearer\s+(\S{20,})$/i);
  return m ? m[1] : null;
}

function displayNameOf(u) {
  const md = (u && u.user_metadata) || {};
  const raw = String(md.given_name || md.full_name || md.name || "").replace(/<[^>]*>/g, " ").replace(/[^\p{L}\p{N} .'-]/gu, " ").trim();
  let name = raw ? raw.split(/\s+/)[0] : "";
  if (!name) {
    const local = String((u && u.email) || "").split("@")[0].replace(/[^A-Za-z0-9._-]/g, "");
    name = local ? local.split(/[._-]/)[0] : "";
    if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  name = name.replace(/[^\p{L}\p{N}.'-]/gu, "").slice(0, 20);
  return name || "Friend";
}

function colorFor(userId, taken) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < COLORS.length; i += 1) {
    const c = COLORS[(h + i) % COLORS.length];
    if (!taken.has(c)) return c;
  }
  return COLORS[h % COLORS.length];
}

/** The verified signed-in user, or null. Anonymous sessions do not count. */
export async function verifiedUser(cfg, token, fetchImpl = fetch) {
  if (!token) return null;
  try {
    const r = await fetchImpl(cfg.url + "/auth/v1/user", {
      headers: { apikey: cfg.anon, Authorization: "Bearer " + token },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || !LIVE_TRIP_ID.test(String(u.id || "")) || u.is_anonymous === true) return null;
    return { id: String(u.id), name: displayNameOf(u) };
  } catch {
    return null;
  }
}

const svc = (cfg, extra = {}) => ({ apikey: cfg.service, Authorization: "Bearer " + cfg.service, "Content-Type": "application/json", ...extra });

async function rest(cfg, fetchImpl, path, init = {}) {
  const r = await fetchImpl(cfg.url + "/rest/v1/" + path, { cache: "no-store", ...init, headers: svc(cfg, init.headers || {}), signal: AbortSignal.timeout(8000) });
  let body = null;
  const text = await r.text();
  if (text) { try { body = JSON.parse(text); } catch { body = null; } }
  return { ok: r.ok, status: r.status, body };
}

// ── Invite capability ────────────────────────────────────────────────────

export function newInviteSecret() { return randomBytes(32).toString("hex"); }

export function inviteCode(trip) {
  if (!/^[0-9a-f]{64}$/.test(String(trip && trip.invite_secret || ""))) return null;
  return createHmac("sha256", Buffer.from(trip.invite_secret, "hex"))
    .update(`live-trip/v1/invite/${trip.id}/${trip.invite_version}`)
    .digest("base64url").slice(0, 22);
}

export function verifyInviteCode(trip, code) {
  if (!CODE_RE.test(String(code || ""))) return false;
  const want = inviteCode(trip);
  if (!want) return false;
  return timingSafeEqual(Buffer.from(String(code)), Buffer.from(want));
}

// ── Reads ────────────────────────────────────────────────────────────────

async function loadTrip(cfg, fetchImpl, id) {
  const r = await rest(cfg, fetchImpl, `wf_live_trips?id=eq.${id}&select=id,owner_id,status,state,revision,recent_op_ids,invite_secret,invite_version,created_at,updated_at&limit=1`);
  if (!r.ok) return { error: 502 };
  const row = Array.isArray(r.body) ? r.body[0] : null;
  return row ? { row } : { error: 404 };
}

async function loadMembers(cfg, fetchImpl, id) {
  const r = await rest(cfg, fetchImpl, `wf_live_trip_members?trip_id=eq.${id}&select=user_id,role,display_name,color,joined_at&order=joined_at.asc`);
  if (!r.ok || !Array.isArray(r.body)) return null;
  return r.body;
}

function publicMembers(rows) {
  return (rows || []).map((m) => ({ id: m.user_id, role: m.role, name: m.display_name, color: m.color }));
}

function snapshot(row, members, me, siteUrl) {
  const mine = members.find((m) => m.user_id === me.id);
  const out = {
    ok: true,
    id: row.id,
    status: row.status,
    revision: row.revision,
    state: row.state,
    checksum: checksum(row.state),
    role: mine ? mine.role : null,
    me: me.id,
    members: publicMembers(members),
  };
  if (mine && mine.role === "owner" && row.status === "live") {
    const code = inviteCode(row);
    if (code) out.inviteUrl = `${siteUrl}/trips/${row.id}#j=${code}`;
  }
  return out;
}

async function broadcast(cfg, fetchImpl, id, event, payload) {
  // Best effort: members also refresh the roster from presence and snapshots.
  try {
    await fetchImpl(cfg.url + "/realtime/v1/api/broadcast", {
      method: "POST",
      headers: svc(cfg),
      body: JSON.stringify({ messages: [{ topic: "live-trip:" + id, event, payload, private: true }] }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {}
}

// ── Handlers ─────────────────────────────────────────────────────────────

const fail = (status, code, message) => ({ status, body: { ok: false, code, message } });

/** POST /api/trips/live  { trip } → make a live copy of a personal trip. */
export async function handleCreate({ cfg, token, body, fetchImpl = fetch, siteUrl }) {
  if (!cfg) return fail(503, "unavailable", "Live trips are not available right now.");
  const user = await verifiedUser(cfg, token, fetchImpl);
  if (!user) return fail(401, "auth", "Sign in to plan together.");
  const trip = body && body.trip;
  if (!trip || typeof trip !== "object") return fail(400, "invalid", "Pick a trip to share.");
  const sourceKey = typeof trip.key === "string" ? trip.key.slice(0, 80) : null;
  const state = stateFromTrip(trip, user.id);
  if (stateBytes(state) > MAX_STATE_BYTES) return fail(413, "too_big", "This trip is too big to share live. Remove a few stops and try again.");

  if (sourceKey) {
    const existing = await rest(cfg, fetchImpl, `wf_live_trips?owner_id=eq.${user.id}&source_key=eq.${encodeURIComponent(sourceKey)}&status=eq.live&select=id&limit=1`);
    if (existing.ok && Array.isArray(existing.body) && existing.body[0]) {
      return handleGet({ cfg, token, id: existing.body[0].id, fetchImpl, siteUrl, user });
    }
  }
  const count = await rest(cfg, fetchImpl, `wf_live_trips?owner_id=eq.${user.id}&status=eq.live&select=id`);
  if (count.ok && Array.isArray(count.body) && count.body.length >= MAX_OWNED_LIVE_TRIPS) {
    return fail(429, "limit", "You already have " + MAX_OWNED_LIVE_TRIPS + " live trips. End one to start another.");
  }
  const ins = await rest(cfg, fetchImpl, "wf_live_trips?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_id: user.id, state, revision: 0, invite_secret: newInviteSecret(), invite_version: 1, source_key: sourceKey }),
  });
  const id = ins.ok && Array.isArray(ins.body) && ins.body[0] && ins.body[0].id;
  if (!id) return fail(502, "write_failed", "We couldn't start the live trip. Please try again.");
  const mem = await rest(cfg, fetchImpl, "wf_live_trip_members", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ trip_id: id, user_id: user.id, role: "owner", display_name: user.name, color: colorFor(user.id, new Set()) }),
  });
  if (!mem.ok) {
    await rest(cfg, fetchImpl, `wf_live_trips?id=eq.${id}`, { method: "DELETE" });
    return fail(502, "write_failed", "We couldn't start the live trip. Please try again.");
  }
  return handleGet({ cfg, token, id, fetchImpl, siteUrl, user, status: 201 });
}

/** GET /api/trips/live/:id?since=<rev> → snapshot for members (304 when unchanged). */
export async function handleGet({ cfg, token, id, since = null, fetchImpl = fetch, siteUrl, user = null, status = 200 }) {
  if (!cfg) return fail(503, "unavailable", "Live trips are not available right now.");
  if (!LIVE_TRIP_ID.test(String(id || ""))) return fail(404, "not_found", "This trip link doesn't work.");
  const me = user || await verifiedUser(cfg, token, fetchImpl);
  if (!me) return fail(401, "auth", "Sign in to see this trip.");
  const members = await loadMembers(cfg, fetchImpl, id);
  if (!members) return fail(502, "read_failed", "We couldn't load the trip. Retrying.");
  if (!members.some((m) => m.user_id === me.id)) return fail(403, "not_member", "Ask the trip owner for the invite link.");
  const t = await loadTrip(cfg, fetchImpl, id);
  if (t.error) return fail(t.error, t.error === 404 ? "not_found" : "read_failed", "We couldn't load the trip.");
  if (since != null && Number(since) === t.row.revision && t.row.status === "live") return { status: 304, body: null };
  return { status, body: snapshot(t.row, members, me, siteUrl) };
}

/** POST /api/trips/live/:id  { action: "preview", code } → what a link leads to, before sign-in. */
export async function handlePreview({ cfg, id, code, fetchImpl = fetch }) {
  if (!cfg) return fail(503, "unavailable", "Live trips are not available right now.");
  if (!LIVE_TRIP_ID.test(String(id || ""))) return fail(404, "not_found", "This trip link doesn't work.");
  const t = await loadTrip(cfg, fetchImpl, id);
  if (t.error || !verifyInviteCode(t.row, code) || t.row.status !== "live") return fail(404, "not_found", "This invite link doesn't work anymore. Ask for a new one.");
  const members = (await loadMembers(cfg, fetchImpl, id)) || [];
  const owner = members.find((m) => m.role === "owner");
  const st = t.row.state || {};
  return { status: 200, body: {
    ok: true, title: st.title || "A trip", city: st.city || "", startDate: st.startDate || null, endDate: st.endDate || null,
    stops: Object.keys(st.items || {}).length, ownerName: owner ? owner.display_name : "A friend", people: members.length,
  } };
}

/** POST /api/trips/live/:id  { action: "join", code } */
export async function handleJoin({ cfg, token, id, code, fetchImpl = fetch, siteUrl }) {
  if (!cfg) return fail(503, "unavailable", "Live trips are not available right now.");
  if (!LIVE_TRIP_ID.test(String(id || ""))) return fail(404, "not_found", "This trip link doesn't work.");
  const me = await verifiedUser(cfg, token, fetchImpl);
  if (!me) return fail(401, "auth", "Sign in to join this trip.");
  const t = await loadTrip(cfg, fetchImpl, id);
  if (t.error) return fail(404, "not_found", "This invite link doesn't work anymore. Ask for a new one.");
  const members = await loadMembers(cfg, fetchImpl, id);
  if (!members) return fail(502, "read_failed", "We couldn't load the trip.");
  if (members.some((m) => m.user_id === me.id)) return handleGet({ cfg, token, id, fetchImpl, siteUrl, user: me });
  if (t.row.status !== "live" || !verifyInviteCode(t.row, code)) return fail(404, "not_found", "This invite link doesn't work anymore. Ask for a new one.");
  if (members.length >= MAX_MEMBERS) return fail(409, "full", "This trip already has " + MAX_MEMBERS + " people.");
  const ins = await rest(cfg, fetchImpl, "wf_live_trip_members", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify({ trip_id: id, user_id: me.id, role: "editor", display_name: me.name, color: colorFor(me.id, new Set(members.map((m) => m.color))) }),
  });
  if (!ins.ok) return fail(502, "write_failed", "We couldn't add you. Please try again.");
  const fresh = (await loadMembers(cfg, fetchImpl, id)) || members;
  await broadcast(cfg, fetchImpl, id, "members", { members: publicMembers(fresh) });
  return { status: 200, body: snapshot(t.row, fresh, me, siteUrl) };
}

/** POST /api/trips/live/:id  { action: remove_member | rotate_link | leave | end } */
export async function handleAdmin({ cfg, token, id, body, fetchImpl = fetch, siteUrl }) {
  if (!cfg) return fail(503, "unavailable", "Live trips are not available right now.");
  if (!LIVE_TRIP_ID.test(String(id || ""))) return fail(404, "not_found", "This trip link doesn't work.");
  const me = await verifiedUser(cfg, token, fetchImpl);
  if (!me) return fail(401, "auth", "Sign in first.");
  const members = await loadMembers(cfg, fetchImpl, id);
  if (!members) return fail(502, "read_failed", "We couldn't load the trip.");
  const mine = members.find((m) => m.user_id === me.id);
  if (!mine) return fail(403, "not_member", "You're not on this trip.");
  const action = body && body.action;
  if (action === "leave") {
    if (mine.role === "owner") return fail(400, "owner", "You own this trip. End sharing instead.");
    const del = await rest(cfg, fetchImpl, `wf_live_trip_members?trip_id=eq.${id}&user_id=eq.${me.id}`, { method: "DELETE" });
    if (!del.ok) return fail(502, "write_failed", "Please try again.");
    await broadcast(cfg, fetchImpl, id, "members", { members: publicMembers(members.filter((m) => m.user_id !== me.id)) });
    return { status: 200, body: { ok: true, left: true } };
  }
  if (mine.role !== "owner") return fail(403, "owner_only", "Only the trip owner can do that.");
  if (action === "remove_member") {
    const target = String((body && body.memberId) || "");
    if (!LIVE_TRIP_ID.test(target) || target === me.id) return fail(400, "invalid", "Pick someone to remove.");
    const del = await rest(cfg, fetchImpl, `wf_live_trip_members?trip_id=eq.${id}&user_id=eq.${target}&role=neq.owner`, { method: "DELETE" });
    if (!del.ok) return fail(502, "write_failed", "Please try again.");
    const left = members.filter((m) => m.user_id !== target);
    await broadcast(cfg, fetchImpl, id, "members", { members: publicMembers(left), removed: target });
    return handleGet({ cfg, token, id, fetchImpl, siteUrl, user: me });
  }
  if (action === "rotate_link") {
    const t = await loadTrip(cfg, fetchImpl, id);
    if (t.error) return fail(t.error, "read_failed", "Please try again.");
    const up = await rest(cfg, fetchImpl, `wf_live_trips?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ invite_version: Number(t.row.invite_version || 1) + 1 }) });
    if (!up.ok) return fail(502, "write_failed", "Please try again.");
    return handleGet({ cfg, token, id, fetchImpl, siteUrl, user: me });
  }
  if (action === "end") {
    const up = await rest(cfg, fetchImpl, `wf_live_trips?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ended" }) });
    if (!up.ok) return fail(502, "write_failed", "Please try again.");
    await broadcast(cfg, fetchImpl, id, "ended", { by: me.id });
    return { status: 200, body: { ok: true, ended: true } };
  }
  return fail(400, "invalid", "Unknown action.");
}

/** GET /api/trips/live → the live trips I belong to. */
export async function handleList({ cfg, token, fetchImpl = fetch }) {
  if (!cfg) return fail(503, "unavailable", "Live trips are not available right now.");
  const me = await verifiedUser(cfg, token, fetchImpl);
  if (!me) return fail(401, "auth", "Sign in first.");
  const mem = await rest(cfg, fetchImpl, `wf_live_trip_members?user_id=eq.${me.id}&select=trip_id,role&limit=50`);
  if (!mem.ok || !Array.isArray(mem.body)) return fail(502, "read_failed", "We couldn't load your live trips.");
  if (!mem.body.length) return { status: 200, body: { ok: true, trips: [] } };
  const ids = mem.body.map((m) => m.trip_id).filter((x) => LIVE_TRIP_ID.test(String(x)));
  const t = await rest(cfg, fetchImpl, `wf_live_trips?id=in.(${ids.join(",")})&status=eq.live&select=id,state,revision,source_key,owner_id,updated_at&order=updated_at.desc`);
  if (!t.ok || !Array.isArray(t.body)) return fail(502, "read_failed", "We couldn't load your live trips.");
  const roleOf = new Map(mem.body.map((m) => [m.trip_id, m.role]));
  return { status: 200, body: { ok: true, trips: t.body.map((r) => ({
    id: r.id, title: (r.state && r.state.title) || "Trip", city: (r.state && r.state.city) || "",
    stops: Object.keys((r.state && r.state.items) || {}).length, role: roleOf.get(r.id) || null,
    sourceKey: r.owner_id === me.id ? r.source_key : null, updatedAt: r.updated_at,
  })) } };
}

// Best-effort per-member op budget (per lambda instance; the commit function's
// row lock and the per-request cap are the hard limits).
const opBudget = new Map();
function takeOps(userId, n, now) {
  const minute = Math.floor(now / 60000);
  const cur = opBudget.get(userId);
  const used = cur && cur.minute === minute ? cur.used : 0;
  if (used + n > OPS_PER_MINUTE) return false;
  opBudget.set(userId, { minute, used: used + n });
  if (opBudget.size > 5000) opBudget.clear();
  return true;
}

/** A client stamp from the future (bad clock or abuse) is replaced by the server clock. */
function clampClock(op, now) {
  const p = parseHlc(op.hlc);
  if (p && p.wall <= now + FUTURE_SKEW_MS) return op;
  return { ...op, hlc: formatHlc(now, 0, "srv") };
}

/**
 * POST /api/trips/live/:id/ops  { baseRevision, ops }
 * Validates, stamps `by`, applies on the CURRENT server state and commits with
 * compare-and-swap; on a lost race re-reads and re-applies (ops carry intent).
 */
export async function handleOps({ cfg, token, id, body, fetchImpl = fetch, now = Date.now, maxAttempts = 5 }) {
  if (!cfg) return fail(503, "unavailable", "Live trips are not available right now.");
  if (!LIVE_TRIP_ID.test(String(id || ""))) return fail(404, "not_found", "This trip link doesn't work.");
  const me = await verifiedUser(cfg, token, fetchImpl);
  if (!me) return fail(401, "auth", "Sign in again to keep editing.");
  const rawOps = body && Array.isArray(body.ops) ? body.ops : null;
  if (!rawOps || rawOps.length < 1 || rawOps.length > MAX_OPS_PER_BATCH) return fail(400, "invalid", "Nothing to save.");
  const members = await loadMembers(cfg, fetchImpl, id);
  if (!members) return fail(502, "read_failed", "Saving paused. Retrying.");
  const mine = members.find((m) => m.user_id === me.id);
  if (!mine) return fail(403, "not_member", "You're no longer on this trip.");
  if (mine.role === "viewer") return fail(403, "viewer", "You can view this trip but not edit it.");
  const t0 = now();
  if (!takeOps(me.id, rawOps.length, t0)) return fail(429, "rate", "Slow down a little. Your changes will keep saving.");

  const cleaned = [];
  const rejected = [];
  for (const raw of rawOps) {
    const v = validateOp(raw);
    if (!v.ok) { rejected.push({ opId: raw && typeof raw.id === "string" ? raw.id.slice(0, 64) : null, reason: v.reason }); continue; }
    cleaned.push(clampClock({ ...v.op, by: me.id }, t0));
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const t = await loadTrip(cfg, fetchImpl, id);
    if (t.error) return fail(t.error === 404 ? 404 : 502, t.error === 404 ? "not_found" : "read_failed", "Saving paused. Retrying.");
    const row = t.row;
    if (row.status !== "live") return fail(410, "ended", "The owner stopped sharing this trip.");
    if (!isValidState(row.state)) return fail(500, "corrupt", "This trip needs a repair. We've been notified.");
    const seen = new Set(row.recent_op_ids || []);
    const replayed = cleaned.filter((op) => seen.has(op.id)).map((op) => op.id);
    const fresh = cleaned.filter((op) => !seen.has(op.id));
    const r = applyOps(row.state, fresh);
    const applied = fresh.filter((op) => r.applied.includes(op.id));
    const allRejected = rejected.concat(r.rejected);
    if (!applied.length) {
      return { status: 200, body: { ok: true, revision: row.revision, state: row.state, checksum: checksum(row.state), applied: replayed, rejected: allRejected } };
    }
    if (stateBytes(r.state) > MAX_STATE_BYTES) {
      return { status: 200, body: { ok: true, revision: row.revision, state: row.state, checksum: checksum(row.state), applied: replayed, rejected: allRejected.concat(applied.map((op) => ({ opId: op.id, reason: "too_big" }))) } };
    }
    const sum = checksum(r.state);
    const payload = { v: 1, by: me.id, ops: applied, checksum: sum, at: new Date(t0).toISOString() };
    const c = await rest(cfg, fetchImpl, "rpc/wf_live_trip_commit", {
      method: "POST",
      body: JSON.stringify({ p_id: id, p_expected_revision: row.revision, p_state: r.state, p_op_ids: applied.map((op) => op.id), p_payload: payload }),
    });
    if (!c.ok || !c.body) return fail(502, "write_failed", "Saving paused. Retrying.");
    if (c.body.error === "conflict") continue;
    if (c.body.error === "ended") return fail(410, "ended", "The owner stopped sharing this trip.");
    if (c.body.error) return fail(502, "write_failed", "Saving paused. Retrying.");
    return { status: 200, body: { ok: true, revision: c.body.revision, state: r.state, checksum: sum, applied: replayed.concat(applied.map((op) => op.id)), rejected: allRejected } };
  }
  return fail(503, "busy", "Lots of edits at once. Retrying.");
}
