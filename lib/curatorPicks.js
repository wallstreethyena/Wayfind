"use client";
// lib/curatorPicks.js — ONE client truth for "which places carry the owner's
// curator pick", applied BEFORE any surface ranks or slices its rows.
//
// WHY (owner, 2026-09-30/10-01: "a higher number on a card that remains in the
// wrong position is not a fix"). The god bump (lib/ownerBump.js) used to reach
// a card only through /api/signals/likes, which is fetched per exact id-set,
// at most 50 ids, AFTER a surface had already ordered and capped its rows —
// and about a dozen surfaces (Lunch, Night Out, Date Night, Birthday, Today,
// Fall, Family, theme parks, intent pages, trending, cuisine/top-10 sheets)
// never called it at all. The owner's pick set is small, public and the same
// for every visitor, so it is fetched ONCE per page
// (/api/signals/curator-picks) and every surface applies it synchronously.
//
// THE CONTRACT
//   • applyCuratorPicks(rows) is the only client door to the bump: it calls
//     stampOwnerPick (the one bump function, which restamps the sort key) on
//     exactly the rows whose pick state differs, and returns the SAME array
//     when nothing changed so memoised surfaces do not churn.
//   • Unknown is not "not picked". Until the set has loaded, rows keep
//     whatever pick the server already stamped on them.
//   • A like's outcome is sequenced per place. Only the latest tap may settle;
//     a confirmed verdict beats any CACHED read (route caches are 60s+SWR) until
//     a later read agrees with it or it ages out.
//   • A failed / unanswerable verdict read never reverts a write that landed.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { stampOwnerPick } from "./ownerBump.js";
import { settleRescored, rescoredIds } from "./lawfulOrder.js";

export const CURATOR_PICKS_URL = "/api/signals/curator-picks";
/** How long a confirmed local verdict outranks a disagreeing cached read. */
export const CONFIRMED_HOLD_MS = 10 * 60 * 1000; // > route s-maxage 60 + SWR 300

const EMPTY = Object.freeze({ ready: false, v: 0, has: () => false, known: () => false });

let serverSet = new Set();
let readIds = new Set();  // ids a per-place read has answered (known before the page set lands)
const readAt = new Map(); // id -> when that per-place read landed
let ready = false;
let version = 0;
let snap = EMPTY;
let sessionOwner = false;
let loading = null;
const local = new Map();     // id -> { pick, pending, at }
const latestSeq = new Map(); // id -> seq
const listeners = new Set();

function effective(id) {
  const l = local.get(id);
  if (l && (l.pending || Date.now() - l.at < CONFIRMED_HOLD_MS)) return l.pick;
  return serverSet.has(id);
}
function knownFor(id) {
  const l = local.get(id);
  return ready || readIds.has(id) || !!(l && (l.pending || Date.now() - l.at < CONFIRMED_HOLD_MS));
}
function rebuild() {
  version += 1;
  snap = Object.freeze({ ready, v: version, has: (id) => id != null && effective(String(id)), known: (id) => id != null && knownFor(String(id)) });
}
function emit() {
  rebuild();
  for (const l of [...listeners]) { try { l(); } catch (e) {} }
}

export function getCuratorPicks() { return snap; }
export function subscribeCuratorPicks(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** The server told this session it is the owner (likes route / verdict read). */
export function noteSessionOwner(isOwner) {
  if (typeof isOwner === "boolean") sessionOwner = isOwner;
}
export function isSessionOwner() { return sessionOwner; }

/**
 * Merge a server pick set. A cached read cannot flip a place whose local
 * verdict is pending or recently confirmed; once the server AGREES with the
 * local verdict the override is dropped, because the server now carries it.
 */
export function mergeServerSet(ids, requestedAt) {
  const incoming = new Set((Array.isArray(ids) ? ids : []).filter((x) => x != null).map(String));
  // A per-place read that landed AFTER this set was requested is newer for
  // that id: keep its answer rather than the older whole-set copy.
  if (Number.isFinite(requestedAt)) {
    for (const [id, at] of readAt) {
      if (at > requestedAt) { if (serverSet.has(id)) incoming.add(id); else incoming.delete(id); }
    }
  }
  serverSet = incoming;
  ready = true;
  for (const [id, l] of local) {
    if (!l.pending && (serverSet.has(id) === l.pick || Date.now() - l.at >= CONFIRMED_HOLD_MS)) local.delete(id);
  }
  emit();
}

/**
 * A per-place read (/api/signals/likes `owner` map for exactly `ids`) is newer
 * than the page-load set for those ids: fold it in, latest read wins per id.
 * A pending or held local verdict still outranks it (the likes route caches
 * per id-set for 60s, so a read issued after a tap can predate the tap).
 */
export function noteOwnerReads(ids, ownerMap) {
  if (!Array.isArray(ids) || !ids.length) return;
  let changed = false;
  const next = new Set(serverSet);
  for (const raw of ids) {
    if (raw == null) continue;
    const id = String(raw);
    if (!readIds.has(id)) { readIds = new Set(readIds).add(id); changed = true; }
    readAt.set(id, Date.now());
    const l = local.get(id);
    if (l && (l.pending || Date.now() - l.at < CONFIRMED_HOLD_MS)) continue;
    const on = !!(ownerMap && ownerMap[raw]);
    if (next.has(id) !== on) { changed = true; if (on) next.add(id); else next.delete(id); }
  }
  if (!changed) return;
  serverSet = next;
  emit();
}

/** Fetch the pick set once per page (idempotent; a failure leaves ready=false). */
export function ensureCuratorPicksLoaded(getHeaders) {
  if (ready || loading || typeof window === "undefined" || typeof fetch !== "function") return loading;
  loading = (async () => {
    const requestedAt = Date.now();
    try {
      const headers = typeof getHeaders === "function" ? await getHeaders() : undefined;
      const r = await fetch(CURATOR_PICKS_URL, headers ? { headers } : undefined);
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !Array.isArray(j.ids)) return;
      if (j.sessionOwner === true) sessionOwner = true;
      mergeServerSet(j.ids, requestedAt);
    } catch (e) {} finally { loading = null; }
  })();
  return loading;
}

/**
 * A tap starts here. Returns the tap's sequence number. The optimistic pick is
 * shown only when the server has already told this session it is the owner —
 * the client never decides ownership.
 */
export function beginCuratorToggle(id, on) {
  const key = String(id);
  const seq = (latestSeq.get(key) || 0) + 1;
  latestSeq.set(key, seq);
  if (sessionOwner) { local.set(key, { pick: !!on, pending: true, at: Date.now() }); emit(); }
  return seq;
}

/**
 * Settle a tap. `verdict` is "on" | "off" (the server's fresh answer) or
 * "unknown" (we could not ask). Ignored unless `seq` is the latest tap for
 * this place. On "unknown" the fallback is the optimistic pick when the write
 * landed and the prior pick when it failed — never a guess.
 */
export function settleCuratorToggle(id, seq, verdict, fallback) {
  const key = String(id);
  if (latestSeq.get(key) !== seq) return false;
  if (verdict === "on" || verdict === "off") {
    // A confirmed verdict IS the server's current answer: fold it into the
    // server set too, so it does not lapse when the hold expires (the page
    // loads the set once) and later reads start from it.
    const on = verdict === "on";
    local.set(key, { pick: on, pending: false, at: Date.now() });
    serverSet = new Set(serverSet);
    if (on) serverSet.add(key); else serverSet.delete(key);
  }
  else if (typeof fallback === "boolean" && sessionOwner) local.set(key, { pick: fallback, pending: false, at: Date.now() });
  else { const l = local.get(key); if (l) local.set(key, { ...l, pending: false, at: Date.now() }); }
  emit();
  return true;
}

/**
 * Apply the pick set to rows. Stamps ONLY rows whose state differs from the
 * set, through stampOwnerPick. Returns the same array when nothing changed.
 */
export function applyCuratorPicks(rows, s) {
  const st = s || snap;
  if (!Array.isArray(rows) || !rows.length) return rows;
  let changed = false;
  const out = rows.map((p) => {
    if (!p || typeof p !== "object" || p.id == null || !st.known(p.id)) return p;
    const want = st.has(p.id);
    if (!!(p._members && p._members.ownerPick === true) === want) return p;
    changed = true;
    return stampOwnerPick(p, want);
  });
  return changed ? out : rows;
}

/**
 * Apply, then move only the re-scored rows to where their number now belongs
 * (lib/lawfulOrder settleRescored) — for surfaces that render a list the
 * server already ordered by score. Non-score lists use applyCuratorPicks.
 */
export function applyCuratorPicksRanked(rows, s) {
  const next = applyCuratorPicks(rows, s);
  if (next === rows) return rows;
  return settleRescored(next, rescoredIds(rows, next));
}

const getEmpty = () => EMPTY;

/** Subscribe a component to the pick set (server snapshot: not ready). */
export function useCuratorPicks(getHeaders) {
  useEffect(() => { ensureCuratorPicksLoaded(getHeaders); }, [getHeaders]);
  return useSyncExternalStore(subscribeCuratorPicks, getCuratorPicks, getEmpty);
}

/**
 * The hook every rail uses: rows with the pick set applied. `ranked: true`
 * settles re-scored rows into score order; omit it for non-score orders.
 */
export function useCuratedRows(rows, opts) {
  const s = useCuratorPicks();
  const ranked = !!(opts && opts.ranked);
  return useMemo(() => (ranked ? applyCuratorPicksRanked(rows, s) : applyCuratorPicks(rows, s)), [rows, s, ranked]);
}

/** Test-only: reset module state between cases. */
export function __resetCuratorPicksForTest() {
  serverSet = new Set(); readIds = new Set(); ready = false; version = 0; snap = EMPTY; sessionOwner = false; loading = null;
  local.clear(); latestSeq.clear(); listeners.clear(); readAt.clear();
}
