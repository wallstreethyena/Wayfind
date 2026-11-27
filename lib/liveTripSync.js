// lib/liveTripSync.js — the client sync engine for Wayfind Live Trips.
//
// Framework-free and transport-agnostic, so scripts/test-live-trip-sync.mjs
// runs several replicas against an in-memory server and proves they converge
// through drops, reorders, offline edits and reconnects.
//
// What the screen shows = confirmed server state (+ revision) with every
// not-yet-acknowledged local op applied on top, through the same reducer the
// server uses (lib/liveTrip.js). The not-yet-acknowledged ops live in the
// store's outbox (IndexedDB), so closing the tab or losing signal never loses
// an edit. The outbox drains strictly in order, one batch in flight at a time;
// op ids make every retry idempotent, so the page and the service worker may
// both drain it without ever doubling an edit.
//
// Realtime messages carry { revision, ops, checksum }. A message is applied
// only when its revision is exactly the next one AND the resulting checksum
// matches the server's; anything else (a gap, a mismatch, a reconnect) costs
// one snapshot fetch. No path loops: a resync never re-sends acknowledged ops.

import { applyOps, checksum as checksumOf, createHlc, isValidClientId, isValidState, randomId, emptyState, MAX_OPS_PER_BATCH } from "./liveTrip.js";

export const FLUSH_DELAY_MS = 300;
export const POLL_MS = 4000;
export const SOCKET_GRACE_MS = 10000;
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];

/** Human copy for an op the server would not apply (null = say nothing). */
export function rejectionMessage(reason) {
  switch (reason) {
    case "full": return "This trip is full (60 stops). Remove one to add more.";
    case "duplicate": return "That place is already on that day.";
    case "out_of_range": return "That day is outside the trip dates.";
    case "date_order": return "The end date has to be after the start date.";
    case "too_big": return "That change made the trip too big to save.";
    default: return null;
  }
}

export function createLiveTripSync({
  tripId,
  store,
  transport,
  onChange = () => {},
  onNotice = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  isVisible = () => true,
  requestBackgroundSync = () => {},
}) {
  let confirmed = { state: emptyState(), revision: -1, checksum: null };
  let outbox = []; // [{ seq, op }]
  let inflight = null; // seqs in the request being sent
  let role = null;
  let me = null;
  let members = [];
  let status = "connecting"; // connecting | live | polling | offline | auth | ended | removed | error
  let online = true;
  let socket = "connecting"; // connecting | subscribed | down
  let socketDownSince = now();
  let clock = null;
  let flushTimer = null;
  let pollTimer = null;
  let retryTimer = null;
  let retryStep = 0;
  let viewCache = null;
  let started = false;
  let stopped = false;
  let saveTimer = null;
  let resyncing = null;

  const emit = () => {
    viewCache = null;
    try { onChange(api.snapshot()); } catch {}
  };

  function view() {
    if (!viewCache) viewCache = applyOps(confirmed.state, outbox.map((r) => r.op)).state;
    return viewCache;
  }

  function setStatus(next) {
    if (status === "ended" || status === "removed") return;
    if (status !== next) { status = next; emit(); }
  }

  function deriveStatus() {
    if (status === "ended" || status === "removed" || status === "auth") return;
    if (!online) setStatus("offline");
    else if (socket === "subscribed") setStatus("live");
    else if (now() - socketDownSince >= SOCKET_GRACE_MS) setStatus("polling");
    else setStatus("connecting");
  }

  function persistSoon() {
    if (saveTimer) return;
    saveTimer = setTimer(() => {
      saveTimer = null;
      store.saveTrip(tripId, { ...confirmed, role, me, members, status, savedAt: now() }).catch(() => {});
    }, 200);
  }

  function adoptSnapshot(snap) {
    if (!snap || !isValidState(snap.state)) return false;
    if (typeof snap.revision !== "number" || snap.revision < confirmed.revision) return false;
    confirmed = { state: snap.state, revision: snap.revision, checksum: snap.checksum || checksumOf(snap.state) };
    if (snap.role !== undefined) role = snap.role;
    if (snap.me) me = snap.me;
    if (Array.isArray(snap.members)) members = snap.members;
    observeClocks(snap.state);
    persistSoon();
    return true;
  }

  function observeClocks(state) {
    if (!clock || !state) return;
    for (const it of Object.values(state.items || {})) for (const s of Object.values(it.ts || {})) clock.observe(s);
    for (const s of Object.values(state.metaTs || {})) clock.observe(s);
  }

  async function ensureClock() {
    if (clock) return clock;
    let id = await store.getMeta("clientId").catch(() => null);
    if (!isValidClientId(id)) {
      id = randomId(10);
      await store.setMeta("clientId", id).catch(() => {});
    }
    clock = createHlc(id, now);
    const last = await store.getMeta("hlc").catch(() => null);
    if (last) clock.observe(last);
    return clock;
  }

  function scheduleFlush(ms = FLUSH_DELAY_MS) {
    if (flushTimer || stopped) return;
    flushTimer = setTimer(() => { flushTimer = null; flush(); }, ms);
  }

  function scheduleRetry() {
    if (retryTimer || stopped) return;
    const ms = BACKOFF[Math.min(retryStep, BACKOFF.length - 1)];
    retryStep += 1;
    retryTimer = setTimer(() => { retryTimer = null; flush(); }, ms);
  }

  async function dropAcked(ids) {
    if (!ids.length) return;
    const set = new Set(ids);
    const seqs = outbox.filter((r) => set.has(r.op.id)).map((r) => r.seq);
    outbox = outbox.filter((r) => !set.has(r.op.id));
    viewCache = null;
    await store.dequeue(seqs).catch(() => {});
  }

  async function flush() {
    if (stopped || inflight || !outbox.length || !online) return;
    if (status === "ended" || status === "removed" || status === "auth") return;
    if (role === "viewer") return;
    const batch = outbox.slice(0, MAX_OPS_PER_BATCH);
    inflight = batch.map((r) => r.seq);
    let res;
    try {
      res = await transport.sendOps({ baseRevision: confirmed.revision, ops: batch.map((r) => r.op) });
    } catch {
      res = { status: 0 };
    }
    inflight = null;
    if (stopped) return;
    const body = res && res.body;
    if (res && res.status === 200 && body && body.ok) {
      retryStep = 0;
      const ack = (body.applied || []).concat((body.rejected || []).map((r) => r.opId).filter(Boolean));
      for (const r of body.rejected || []) { const m = rejectionMessage(r.reason); if (m) onNotice(m); }
      await dropAcked(ack);
      if (typeof body.revision === "number" && body.revision > confirmed.revision) adoptSnapshot({ state: body.state, revision: body.revision, checksum: body.checksum });
      emit();
      if (outbox.length) scheduleFlush(0);
      return;
    }
    const code = res ? res.status : 0;
    if (code === 401) { status = "auth"; emit(); return; }
    if (code === 410) { status = "ended"; emit(); return; }
    if (code === 403 || code === 404) {
      if (body && body.code === "viewer") role = "viewer";
      else status = "removed";
      emit();
      return;
    }
    if (code === 400 && body && body.code === "invalid") {
      // A malformed batch never succeeds; drop it rather than loop forever.
      await dropAcked(batch.map((r) => r.op.id));
      emit();
      return;
    }
    // Network drop, 429, 5xx: keep everything queued and retry with backoff.
    requestBackgroundSync();
    scheduleRetry();
  }

  async function resync() {
    if (resyncing) return resyncing;
    resyncing = (async () => {
      let res;
      try { res = await transport.fetchSnapshot(confirmed.revision >= 0 ? confirmed.revision : null); } catch { res = { status: 0 }; }
      if (stopped) return;
      if (res && res.status === 200 && res.body && res.body.ok) {
        if (res.body.status === "ended") status = "ended";
        adoptSnapshot(res.body);
        emit();
      } else if (res && res.status === 401) { status = "auth"; emit(); }
      else if (res && (res.status === 403 || res.status === 404)) { status = "removed"; emit(); }
      else if (res && res.status === 410) { status = "ended"; emit(); }
      flush();
    })().finally(() => { resyncing = null; });
    return resyncing;
  }

  function startPolling() {
    if (pollTimer || stopped) return;
    const tick = () => {
      pollTimer = setTimer(tick, POLL_MS);
      deriveStatus();
      if (socket !== "subscribed" && online && isVisible() && now() - socketDownSince >= SOCKET_GRACE_MS) resync();
    };
    pollTimer = setTimer(tick, POLL_MS);
  }

  // ── Transport callbacks ───────────────────────────────────────────────

  function onOps(msg) {
    if (!msg || typeof msg.revision !== "number" || !Array.isArray(msg.ops)) return;
    if (msg.revision <= confirmed.revision) return; // already have it (e.g. our own POST answer came first)
    if (msg.revision !== confirmed.revision + 1) { resync(); return; }
    const next = applyOps(confirmed.state, msg.ops).state;
    const sum = checksumOf(next);
    if (msg.checksum && sum !== msg.checksum) { resync(); return; }
    confirmed = { state: next, revision: msg.revision, checksum: sum };
    observeClocks(next);
    dropAcked(msg.ops.map((o) => o && o.id).filter(Boolean)).then(emit);
    persistSoon();
    emit();
  }

  function onMembers(msg) {
    if (!msg || !Array.isArray(msg.members)) return;
    members = msg.members;
    if (msg.removed && msg.removed === me) status = "removed";
    persistSoon();
    emit();
  }

  function onEnded() { status = "ended"; emit(); }

  function onSocket(state) {
    const was = socket;
    socket = state === "subscribed" ? "subscribed" : state === "connecting" ? "connecting" : "down";
    if (socket !== "subscribed" && was === "subscribed") socketDownSince = now();
    deriveStatus();
    // Every (re)subscribe can have missed messages: catch up once.
    if (socket === "subscribed" && was !== "subscribed") resync();
  }

  // ── Public API ────────────────────────────────────────────────────────

  const api = {
    async start() {
      if (started) return;
      started = true;
      await ensureClock();
      const cached = await store.loadTrip(tripId).catch(() => null);
      if (cached && isValidState(cached.state)) {
        confirmed = { state: cached.state, revision: cached.revision, checksum: cached.checksum };
        role = cached.role; me = cached.me; members = cached.members || [];
        observeClocks(cached.state);
      }
      outbox = (await store.outbox(tripId).catch(() => [])).map((r) => ({ seq: r.seq, op: r.op }));
      emit();
      transport.connect({ onOps, onMembers, onEnded, onSocket });
      startPolling();
      await resync();
    },
    stop() {
      stopped = true;
      for (const t of [flushTimer, pollTimer, retryTimer, saveTimer]) if (t) clearTimer(t);
      try { transport.disconnect(); } catch {}
    },
    /** Queue one edit: { type, ...fields }. Returns the op id. */
    async dispatch(partial) {
      if (role === "viewer" || status === "ended" || status === "removed") return null;
      const c = await ensureClock();
      const op = { ...partial, id: randomId(20), hlc: c.tick() };
      const seq = await store.enqueue(tripId, op).catch(() => null);
      store.setMeta("hlc", op.hlc).catch(() => {});
      outbox.push({ seq: seq == null ? -Date.now() : seq, op });
      emit();
      scheduleFlush();
      return op.id;
    },
    setOnline(value) {
      const was = online;
      online = !!value;
      deriveStatus();
      if (online && !was) { retryStep = 0; resync(); }
    },
    /** The page came back to the foreground (or the service worker asked). */
    wake() { if (online) { retryStep = 0; resync(); } },
    resync,
    flush,
    snapshot() {
      return {
        state: view(),
        confirmedRevision: confirmed.revision,
        pending: outbox.length,
        pendingItemIds: outbox.map((r) => r.op.itemId || (r.op.item && r.op.item.id)).filter(Boolean),
        status, role, me, members, online,
      };
    },
  };
  return api;
}
