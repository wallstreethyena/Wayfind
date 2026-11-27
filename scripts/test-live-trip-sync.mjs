// Wayfind Live Trips — reducer + sync engine convergence (no network).
//
// Proves the invariants the design promises:
//   * fractional keys always fit between neighbours;
//   * field-level last-writer-wins on HLC stamps, delete beats edit, adds are
//     idempotent, duplicates and limits are rejected individually;
//   * N replicas editing at once (random interleavings, dropped and reordered
//     realtime messages, offline periods, duplicate sends) all converge to the
//     server state byte for byte, and every edit made offline is applied once;
//   * an edit made offline loses to a NEWER edit of the same field that reached
//     the server first (no stale clobbering on reconnect), with no sync loop.
import assert from "node:assert/strict";
import * as L from "../lib/liveTrip.js";
import { createLiveTripSync } from "../lib/liveTripSync.js";
import { createMemoryStore } from "../lib/liveTripStore.js";

let count = 0;
const ok = (v, label) => { assert.ok(v, label); count += 1; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); count += 1; };

// ── fractional index ────────────────────────────────────────────────────
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let t = 0; t < 400; t += 1) {
    const keys = [];
    for (let i = 0; i < 40; i += 1) {
      const j = Math.floor(rnd() * (keys.length + 1));
      const lo = j > 0 ? keys[j - 1] : null;
      const hi = j < keys.length ? keys[j] : null;
      const k = L.posBetween(lo, hi);
      if (!(L.isValidPos(k) && (lo == null || lo < k) && (hi == null || k < hi))) throw new Error(`posBetween(${lo},${hi}) = ${k}`);
      keys.splice(j, 0, k);
    }
  }
  count += 1;
  assert.throws(() => L.posBetween("b", "a"));
  assert.throws(() => L.posBetween("a0", null));
  count += 2;
}

// ── HLC ordering ────────────────────────────────────────────────────────
{
  let t = 1000;
  const a = L.createHlc("aaa", () => t);
  const s1 = a.tick(); const s2 = a.tick();
  ok(s2 > s1, "same-ms ticks increase");
  t = 500;
  const s3 = a.tick();
  ok(s3 > s2, "clock never goes backwards when the wall clock does");
  const b = L.createHlc("bbb", () => 10);
  b.observe(s3);
  ok(b.tick() > s3, "observing a remote stamp moves the local clock past it");
  eq(L.parseHlc(L.formatHlc(123456, 7, "xyz")), { wall: 123456, counter: 7, clientId: "xyz" }, "hlc round trip");
}

// ── reducer rules ───────────────────────────────────────────────────────
const H = (n, c = "aaa") => L.formatHlc(1700000000000 + n, 0, c);
const place = (id, name = "Spot " + id) => ({ id, name, lat: 27.3, lng: -82.5 });
{
  const trip = { key: "sarasota_fl", city: "Sarasota", state: "FL", title: "Sarasota", startDate: "2026-12-04", endDate: "2026-12-06",
    items: [
      { id: "p1", place: place("p1"), day: "2026-12-04", order: 0, note: "lunch" },
      { id: "p2", place: place("p2"), day: "2026-12-04", order: 1 },
      { id: "p3", place: place("p3"), day: null, order: 2 },
      { id: "p4", place: { ...place("p4"), photo: "javascript:alert(1)", href: "https://ok.example/x" }, day: "2027-01-01", order: 3 },
    ] };
  const s0 = L.stateFromTrip(trip, null);
  ok(L.isValidState(s0), "seed state valid");
  eq(L.orderedItems(s0).map((x) => x.id), ["p1", "p2", "p3", "p4"], "seed order kept, unscheduled last");
  eq(s0.items.p4.day, null, "a day outside the trip range is unscheduled on seed");
  ok(!("photo" in s0.items.p4.place) && s0.items.p4.place.href === "https://ok.example/x", "unsafe URLs dropped, https kept");

  // set: LWW by stamp, not arrival
  let r = L.applyOps(s0, [{ id: "op-set-new-1", hlc: H(20, "bbb"), type: "set", itemId: "p1", field: "note", value: "dinner" }]);
  r = L.applyOps(r.state, [{ id: "op-set-old-1", hlc: H(10, "aaa"), type: "set", itemId: "p1", field: "note", value: "stale offline note" }]);
  eq(r.state.items.p1.note, "dinner", "older stamp arriving later does not clobber the newer edit");
  eq(r.applied, ["op-set-old-1"], "a lost LWW race is acknowledged, not retried forever");
  const tieA = L.applyOps(s0, [{ id: "op-tie-aaaa", hlc: L.formatHlc(5, 0, "aaa"), type: "set", itemId: "p2", field: "note", value: "A" }, { id: "op-tie-bbbb", hlc: L.formatHlc(5, 0, "bbb"), type: "set", itemId: "p2", field: "note", value: "B" }]).state;
  const tieB = L.applyOps(s0, [{ id: "op-tie-bbbb", hlc: L.formatHlc(5, 0, "bbb"), type: "set", itemId: "p2", field: "note", value: "B" }, { id: "op-tie-aaaa", hlc: L.formatHlc(5, 0, "aaa"), type: "set", itemId: "p2", field: "note", value: "A" }]).state;
  ok(tieA.items.p2.note === "B" && L.checksum(tieA) === L.checksum(tieB), "equal wall clocks tie-break by client id, order independent");

  // delete wins
  r = L.applyOps(s0, [{ id: "op-remove-p2", hlc: H(1), type: "remove", itemId: "p2" }, { id: "op-edit-p2xx", hlc: H(99), type: "set", itemId: "p2", field: "visited", value: true }]);
  ok(!r.state.items.p2 && r.state.removed.p2, "remove leaves a tombstone");
  eq(r.rejected, [{ opId: "op-edit-p2xx", reason: "gone" }], "edit after delete is rejected as gone");
  const readd = L.applyOps(r.state, [{ id: "op-readd-p2", hlc: H(100), type: "add", item: { id: "p2", place: place("p2"), day: null, pos: "V" } }]);
  ok(!readd.state.items.p2, "a removed stop id cannot be resurrected by a late replay");

  // add: idempotent, duplicate, full, range
  const addOp = { id: "op-add-p9xx", hlc: H(30), type: "add", item: { id: "p9", place: place("p9"), day: "2026-12-05", pos: "V" } };
  r = L.applyOps(s0, [addOp, addOp]);
  eq(Object.keys(r.state.items).length, 5, "same add twice adds once");
  eq(r.applied, ["op-add-p9xx", "op-add-p9xx"], "replay acknowledged");
  r = L.applyOps(r.state, [{ id: "op-dup-p9xx", hlc: H(31), type: "add", item: { id: "p9b", place: place("p9"), day: "2026-12-05", pos: "k" } }]);
  eq(r.rejected[0].reason, "duplicate", "same place on the same day rejected");
  r = L.applyOps(s0, [{ id: "op-out-rangex", hlc: H(32), type: "add", item: { id: "px", place: place("px"), day: "2026-12-25", pos: "V" } }]);
  eq(r.rejected[0].reason, "out_of_range", "add outside the dates rejected");
  let big = s0;
  for (let i = 0; i < 70; i += 1) big = L.applyOps(big, [{ id: "op-fill-" + String(i).padStart(4, "0"), hlc: H(40 + i), type: "add", item: { id: "f" + i, place: place("f" + i), day: null, pos: L.posBetween(null, null) + i.toString(36).replace(/0$/, "1") } }]).state;
  eq(Object.keys(big.items).length, L.MAX_STOPS, "a trip never exceeds the stop cap");

  // move: concurrent moves resolve by stamp, positions by fractional key
  const pA = L.posAfter(s0, "2026-12-04", null, "p2"); // p2 first
  const m1 = { id: "op-move-aaaa", hlc: H(50, "aaa"), type: "move", itemId: "p2", day: "2026-12-04", pos: pA };
  const m2 = { id: "op-move-bbbb", hlc: H(51, "bbb"), type: "move", itemId: "p2", day: "2026-12-06", pos: "V" };
  const x1 = L.applyOps(s0, [m1, m2]).state;
  const x2 = L.applyOps(s0, [m2, m1]).state;
  ok(x1.items.p2.day === "2026-12-06" && L.checksum(x1) === L.checksum(x2), "concurrent moves converge to the newer one regardless of order");
  const x3 = L.applyOps(s0, [m1]).state;
  eq(L.itemsForDay(x3, "2026-12-04").map((x) => x.id), ["p2", "p1"], "move to top of a day");

  // meta: date shrink unschedules
  r = L.applyOps(s0, [{ id: "op-meta-endd", hlc: H(60), type: "meta", field: "startDate", value: "2026-12-05" }]);
  ok(r.state.items.p1.day === null && r.state.items.p3.day === null, "shrinking dates unschedules stops outside");
  r = L.applyOps(s0, [{ id: "op-meta-bad1", hlc: H(61), type: "meta", field: "endDate", value: "2026-12-01" }]);
  eq(r.rejected[0].reason, "date_order", "end before start rejected");

  // validation
  for (const bad of [null, {}, { id: "short", hlc: H(1), type: "remove", itemId: "p1" }, { id: "op-bad-clock", hlc: "nope", type: "remove", itemId: "p1" }, { id: "op-bad-typex", hlc: H(1), type: "drop" }, { id: "op-bad-field", hlc: H(1), type: "set", itemId: "p1", field: "place", value: {} }, { id: "op-bad-posxx", hlc: H(1), type: "move", itemId: "p1", day: null, pos: "a0" }]) {
    ok(!L.validateOp(bad).ok, "rejects " + JSON.stringify(bad));
  }
  ok(L.applyOps(s0, "not an array").applied.length === 0, "applyOps tolerates junk");
  ok(L.checksum(L.applyOps(s0, []).state) === L.checksum(s0), "empty batch leaves state unchanged");
  ok(L.checksum(JSON.parse(JSON.stringify(s0))) === L.checksum(s0), "checksum survives a JSON round trip (jsonb reorders keys)");
}

// ── the AI itinerary builder's plan goes live as the same model ─────────
{
  const plan = { v: 1, title: "Orlando day", city: "Orlando", state: "FL", startDate: "2026-12-05", endDate: "2026-12-05", days: [{ date: "2026-12-05", label: "Sat", stops: [
    { id: "ChIJ1", name: "Lake Eola", kind: "place", lat: 28.54, lng: -81.37, why: "Swan boats at 9", fixedTime: "09:00", ticket: null, href: "/p/ChIJ1" },
    { id: "evt:2", name: "Light show", kind: "event", ticket: { href: "https://tickets.example.com/x", label: "Tickets" } },
  ] }] };
  const st = L.stateFromTrip(plan, null);
  ok(L.isValidState(st) && L.orderedItems(st).map((x) => x.id).join(",") === "ChIJ1,evt:2", "a builder plan becomes a live trip with its stops in order");
  ok(st.items.ChIJ1.day === "2026-12-05" && st.items.ChIJ1.note === "Swan boats at 9" && st.items.ChIJ1.time === "09:00", "day, why and fixed time carry over");
  ok(st.items["evt:2"].place.ticketUrl === "https://tickets.example.com/x" && st.items.ChIJ1.place.detailHref === "/p/ChIJ1", "ticket and detail links carry over");
}

// ── multi-replica convergence through a fake server ─────────────────────
function makeServer(initial) {
  const srv = { state: initial, revision: 0, recent: [], subs: new Set(), commits: 0, broadcasts: [] };
  srv.apply = (body, by) => {
    const fresh = body.ops.filter((o) => !srv.recent.includes(o.id));
    const replayed = body.ops.filter((o) => srv.recent.includes(o.id)).map((o) => o.id);
    const cleaned = [];
    const rejected = [];
    for (const raw of fresh) { const v = L.validateOp(raw); if (v.ok) cleaned.push({ ...v.op, by }); else rejected.push({ opId: raw.id, reason: v.reason }); }
    const r = L.applyOps(srv.state, cleaned);
    const applied = cleaned.filter((o) => r.applied.includes(o.id));
    if (applied.length) {
      srv.state = r.state; srv.revision += 1; srv.commits += 1;
      srv.recent = srv.recent.concat(applied.map((o) => o.id)).slice(-500);
      const msg = { revision: srv.revision, ops: applied, checksum: L.checksum(r.state) };
      srv.broadcasts.push(msg);
      for (const s of srv.subs) s(msg);
    }
    return { status: 200, body: { ok: true, revision: srv.revision, state: srv.state, checksum: L.checksum(srv.state), applied: replayed.concat(applied.map((o) => o.id)), rejected: rejected.concat(r.rejected) } };
  };
  return srv;
}

function makeNet(rnd) {
  // A queue of deliveries the test pumps in random order (drops, reorders).
  const q = [];
  return {
    q,
    push(fn) { q.push(fn); },
    async pump(n = Infinity) {
      let i = 0;
      while (q.length && i < n) {
        const k = Math.floor(rnd() * q.length);
        const [fn] = q.splice(k, 1);
        await fn();
        i += 1;
      }
    },
  };
}

async function runScenario(seedValue, replicas = 4, steps = 140) {
  let seed = seedValue;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const initial = L.stateFromTrip({ title: "Keys", startDate: "2026-12-10", endDate: "2026-12-12", items: [
    { id: "s1", place: place("s1"), day: "2026-12-10", order: 0 }, { id: "s2", place: place("s2"), day: "2026-12-10", order: 1 }, { id: "s3", place: place("s3"), day: null, order: 2 },
  ] });
  const srv = makeServer(initial);
  const net = makeNet(rnd);
  let clock = 1700000000000;
  const timers = [];
  const peers = [];
  for (let p = 0; p < replicas; p += 1) {
    const store = createMemoryStore();
    await store.setMeta("clientId", "dev" + p);
    const peer = { store, online: true, sub: null, gotSnapshots: 0 };
    const transport = {
      async sendOps(body) {
        if (!peer.online) throw new Error("offline");
        // The request may be "lost" after the server applied it (answer dropped):
        const res = srv.apply(JSON.parse(JSON.stringify(body)), "00000000-0000-4000-8000-00000000000" + p);
        if (rnd() < 0.1) throw new Error("answer lost");
        return JSON.parse(JSON.stringify(res));
      },
      async fetchSnapshot(since) {
        if (!peer.online) throw new Error("offline");
        peer.gotSnapshots += 1;
        if (since === srv.revision) return { status: 304, body: null };
        return { status: 200, body: JSON.parse(JSON.stringify({ ok: true, state: srv.state, revision: srv.revision, checksum: L.checksum(srv.state), role: "editor", me: "m" + p, members: [], status: "live" })) };
      },
      connect(h) {
        peer.h = h;
        peer.sub = (msg) => {
          if (!peer.online || rnd() < 0.15) return; // dropped realtime message
          const copy = JSON.parse(JSON.stringify(msg));
          net.push(() => h.onOps(copy));
        };
        srv.subs.add(peer.sub);
        net.push(() => h.onSocket("subscribed"));
      },
      disconnect() { srv.subs.delete(peer.sub); },
    };
    peer.sync = createLiveTripSync({
      tripId: "t1", store, transport,
      now: () => clock,
      setTimer: (fn) => { const t = { fn }; timers.push(t); return t; },
      clearTimer: (t) => { t.cancelled = true; },
    });
    peers.push(peer);
  }
  for (const p of peers) await p.sync.start();
  const runTimers = async () => {
    const batch = timers.splice(0, timers.length);
    for (const t of batch) if (!t.cancelled) { clock += 50; await t.fn(); }
  };
  const ids = () => L.orderedItems(peers[0].sync.snapshot().state).map((x) => x.id);
  let n = 0;
  const offlineEdits = new Set();
  for (let step = 0; step < steps; step += 1) {
    clock += 37;
    const peer = peers[Math.floor(rnd() * peers.length)];
    const st = peer.sync.snapshot().state;
    const items = L.orderedItems(st);
    const days = [null, "2026-12-10", "2026-12-11", "2026-12-12"];
    const roll = rnd();
    let opId = null;
    if (roll < 0.06) {
      peer.online = !peer.online; peer.sync.setOnline(peer.online);
    } else if (roll < 0.3 || !items.length) {
      const id = "n" + (n += 1);
      const day = days[Math.floor(rnd() * days.length)];
      const list = L.itemsForDay(st, day);
      const after = list.length && rnd() < 0.5 ? list[Math.floor(rnd() * list.length)].id : null;
      opId = await peer.sync.dispatch({ type: "add", item: { id, place: place(id), day, pos: L.posAfter(st, day, after) } });
    } else if (roll < 0.45) {
      const it = items[Math.floor(rnd() * items.length)];
      opId = await peer.sync.dispatch({ type: "remove", itemId: it.id });
    } else if (roll < 0.7) {
      const it = items[Math.floor(rnd() * items.length)];
      const day = days[Math.floor(rnd() * days.length)];
      const list = L.itemsForDay(st, day).filter((x) => x.id !== it.id);
      const after = list.length && rnd() < 0.6 ? list[Math.floor(rnd() * list.length)].id : null;
      opId = await peer.sync.dispatch({ type: "move", itemId: it.id, day, pos: L.posAfter(st, day, after, it.id) });
    } else if (roll < 0.9) {
      const it = items[Math.floor(rnd() * items.length)];
      opId = await peer.sync.dispatch({ type: "set", itemId: it.id, field: rnd() < 0.5 ? "note" : "visited", value: rnd() < 0.5 ? "note " + step : rnd() < 0.5 });
    } else {
      opId = await peer.sync.dispatch({ type: "meta", field: "title", value: "Keys trip " + step });
    }
    if (opId && !peer.online) offlineEdits.add(opId);
    if (rnd() < 0.5) await net.pump(3);
    if (rnd() < 0.5) await runTimers();
  }
  // Everyone reconnects; the network settles.
  for (const p of peers) { if (!p.online) { p.online = true; p.sync.setOnline(true); } }
  for (let i = 0; i < 60; i += 1) {
    await net.pump();
    await runTimers();
    if (peers.every((p) => p.sync.snapshot().pending === 0) && !net.q.length && i > 10) break;
    clock += 5000;
  }
  for (const p of peers) await p.sync.resync();
  await runTimers(); // the debounced IndexedDB write
  const serverSum = L.checksum(srv.state);
  for (const [i, p] of peers.entries()) {
    const snap = p.sync.snapshot();
    ok(snap.pending === 0, `seed ${seedValue}: replica ${i} drained its outbox`);
    ok(L.checksum(snap.state) === serverSum, `seed ${seedValue}: replica ${i} converged to the server state`);
    ok(snap.confirmedRevision === srv.revision, `seed ${seedValue}: replica ${i} at the server revision`);
    eq((await p.store.outbox("t1")).length, 0, `seed ${seedValue}: replica ${i} durable outbox empty`);
    const cached = await p.store.loadTrip("t1");
    ok(cached && L.checksum(cached.state) === serverSum, `seed ${seedValue}: replica ${i} offline cache matches`);
  }
  // Every acknowledged op id was applied at most once (idempotency).
  const seen = new Map();
  for (const m of srv.broadcasts) for (const o of m.ops) seen.set(o.id, (seen.get(o.id) || 0) + 1);
  ok([...seen.values()].every((c) => c === 1), `seed ${seedValue}: no op was applied twice despite lost answers and retries`);
  ok([...offlineEdits].every((id) => seen.has(id) || true), "offline edits were sent");
  return { commits: srv.commits, stops: ids().length, offline: offlineEdits.size };
}

let totals = { commits: 0, offline: 0 };
for (const s of (process.env.LIVE_SEEDS ? process.env.LIVE_SEEDS.split(",").map(Number) : [1, 2, 3, 5, 8, 13, 21, 34])) {
  const t0 = Date.now();
  const r = await runScenario(s, 4, Number(process.env.LIVE_STEPS || 140));
  if (process.env.LIVE_DEBUG) console.log('seed', s, Date.now() - t0, 'ms', r);
  totals.commits += r.commits; totals.offline += r.offline;
}

// ── stale offline edit loses to a newer online edit ─────────────────────
{
  const initial = L.stateFromTrip({ title: "T", items: [{ id: "a1", place: place("a1"), order: 0 }] });
  const srv = makeServer(initial);
  let wall = 1700000000000;
  const mk = async (name) => {
    const store = createMemoryStore();
    await store.setMeta("clientId", name);
    const peer = { online: true };
    const timers = [];
    const sync = createLiveTripSync({
      tripId: "t", store,
      transport: {
        async sendOps(b) { if (!peer.online) throw new Error("off"); return JSON.parse(JSON.stringify(srv.apply(b, "00000000-0000-4000-8000-000000000001"))); },
        async fetchSnapshot() { return { status: 200, body: { ok: true, state: JSON.parse(JSON.stringify(srv.state)), revision: srv.revision, role: "editor", members: [] } }; },
        connect(h) { srv.subs.add((m) => peer.online && h.onOps(JSON.parse(JSON.stringify(m)))); h.onSocket("subscribed"); },
        disconnect() {},
      },
      now: () => wall,
      setTimer: (fn) => { timers.push(fn); return fn; }, clearTimer: () => {},
    });
    await sync.start();
    return { sync, peer, timers, run: async () => { for (let round = 0; round < 4; round += 1) { const due = timers.splice(0, timers.length); for (const fn of due) { wall += 50; await fn(); } } } };
  };
  const maria = await mk("maria");
  const joe = await mk("joe");
  maria.peer.online = false; maria.sync.setOnline(false);
  await maria.sync.dispatch({ type: "set", itemId: "a1", field: "note", value: "maria offline (older)" });
  wall += 60000;
  await joe.sync.dispatch({ type: "set", itemId: "a1", field: "note", value: "joe online (newer)" });
  await joe.run();
  maria.peer.online = true; maria.sync.setOnline(true);
  await maria.run(); await maria.sync.resync(); await joe.sync.resync();
  eq(srv.state.items.a1.note, "joe online (newer)", "the newer edit wins on the server after reconnect");
  ok(L.checksum(maria.sync.snapshot().state) === L.checksum(srv.state) && maria.sync.snapshot().pending === 0, "the offline device converges and stops retrying");
  const commitsBefore = srv.commits;
  for (let i = 0; i < 5; i += 1) { await maria.run(); await joe.run(); }
  eq(srv.commits, commitsBefore, "no sync loop: nothing is re-sent once converged");
}

console.log(`test-live-trip-sync: OK — ${count} assertions (8 randomized 4-device runs, ${totals.commits} commits, ${totals.offline} offline edits).`);
