// lib/liveTripStore.js — offline-first local storage for Wayfind Live Trips.
//
// IndexedDB database "wayfind-live" (version 1) mirrors the Supabase tables:
//
//   trips   keyPath "id"            one row per live trip: revision, checksum,
//                                   trip details (title, city, dates, their
//                                   clocks), tombstones, my role, the roster.
//                                   Mirrors public.wf_live_trips + members.
//   items   keyPath ["tripId","id"] one row per stop, so a day can be read on
//           index byTrip    tripId     its own without loading the whole trip
//           index byTripDay [tripId, dayKey]   (dayKey "" = unscheduled).
//   outbox  keyPath "seq" (auto)    the background sync queue: every edit the
//           index byTrip    tripId     person made that the server has not
//                                   acknowledged yet, in the order they made
//                                   it. Drained strictly in seq order.
//   meta    keyPath "key"           device id, last clock stamp, and the
//                                   current session token the service worker
//                                   uses to drain the outbox with no tab open.
//
// When IndexedDB is missing or blocked (private mode on some browsers, tests),
// createMemoryStore() gives the same API in memory so the feature still works
// for the session. Nothing here talks to the network.

export const DB_NAME = "wayfind-live";
export const DB_VERSION = 1;

function dayKeyOf(day) { return day || ""; }

function splitState(tripId, snap) {
  const st = snap.state;
  const trip = {
    id: tripId,
    revision: snap.revision,
    checksum: snap.checksum || null,
    role: snap.role || null,
    me: snap.me || null,
    members: Array.isArray(snap.members) ? snap.members : [],
    status: snap.status || "live",
    savedAt: snap.savedAt || 0,
    meta: { v: st.v, title: st.title, city: st.city, region: st.region, startDate: st.startDate, endDate: st.endDate, metaTs: st.metaTs },
    removed: st.removed || {},
  };
  const items = Object.values(st.items || {}).map((it) => ({ ...it, tripId, dayKey: dayKeyOf(it.day) }));
  return { trip, items };
}

function joinState(trip, items) {
  const state = { ...trip.meta, items: {}, removed: trip.removed || {} };
  for (const row of items) {
    const { tripId, dayKey, ...it } = row;
    state.items[it.id] = it;
  }
  return {
    state, revision: trip.revision, checksum: trip.checksum, role: trip.role, me: trip.me,
    members: trip.members || [], status: trip.status || "live", savedAt: trip.savedAt || 0,
  };
}

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

/** Create the object stores. Exported so the service worker opens the same schema. */
export function upgradeLiveTripDb(db) {
  if (!db.objectStoreNames.contains("trips")) db.createObjectStore("trips", { keyPath: "id" });
  if (!db.objectStoreNames.contains("items")) {
    const s = db.createObjectStore("items", { keyPath: ["tripId", "id"] });
    s.createIndex("byTrip", "tripId");
    s.createIndex("byTripDay", ["tripId", "dayKey"]);
  }
  if (!db.objectStoreNames.contains("outbox")) {
    const s = db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
    s.createIndex("byTrip", "tripId");
  }
  if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
}

export function openLiveTripDb(idb = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!idb) { reject(new Error("no indexedDB")); return; }
    let r;
    try { r = idb.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    r.onupgradeneeded = () => upgradeLiveTripDb(r.result);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

/** IndexedDB-backed store. Rejects when IndexedDB cannot be opened. */
export async function createIdbStore(idb = globalThis.indexedDB) {
  const db = await openLiveTripDb(idb);
  return {
    kind: "indexeddb",
    async loadTrip(tripId) {
      const tx = db.transaction(["trips", "items"], "readonly");
      const trip = await req(tx.objectStore("trips").get(tripId));
      if (!trip) return null;
      const items = await req(tx.objectStore("items").index("byTrip").getAll(tripId));
      return joinState(trip, items);
    },
    async loadDay(tripId, day) {
      const tx = db.transaction("items", "readonly");
      return req(tx.objectStore("items").index("byTripDay").getAll([tripId, dayKeyOf(day)]));
    },
    async saveTrip(tripId, snap) {
      const { trip, items } = splitState(tripId, snap);
      const tx = db.transaction(["trips", "items"], "readwrite");
      const itemsStore = tx.objectStore("items");
      const keep = new Set(items.map((it) => it.id));
      const existing = await req(itemsStore.index("byTrip").getAllKeys(tripId));
      for (const key of existing) if (!keep.has(key[1])) itemsStore.delete(key);
      for (const it of items) itemsStore.put(it);
      tx.objectStore("trips").put(trip);
      await done(tx);
    },
    async markStale(tripId) {
      const tx = db.transaction("trips", "readwrite");
      const s = tx.objectStore("trips");
      const trip = await req(s.get(tripId));
      if (trip) { trip.stale = true; s.put(trip); }
      await done(tx);
    },
    async enqueue(tripId, op) {
      const tx = db.transaction("outbox", "readwrite");
      const seq = await req(tx.objectStore("outbox").add({ tripId, op, at: Date.now() }));
      await done(tx);
      return seq;
    },
    async outbox(tripId) {
      const tx = db.transaction("outbox", "readonly");
      const rows = await req(tx.objectStore("outbox").index("byTrip").getAll(tripId));
      return rows.sort((a, b) => a.seq - b.seq);
    },
    async dequeue(seqs) {
      if (!seqs.length) return;
      const tx = db.transaction("outbox", "readwrite");
      const s = tx.objectStore("outbox");
      for (const seq of seqs) s.delete(seq);
      await done(tx);
    },
    async getMeta(key) {
      const tx = db.transaction("meta", "readonly");
      const row = await req(tx.objectStore("meta").get(key));
      return row ? row.value : null;
    },
    async setMeta(key, value) {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key, value });
      await done(tx);
    },
    async forgetTrip(tripId) {
      const tx = db.transaction(["trips", "items", "outbox"], "readwrite");
      tx.objectStore("trips").delete(tripId);
      const items = tx.objectStore("items");
      for (const key of await req(items.index("byTrip").getAllKeys(tripId))) items.delete(key);
      const out = tx.objectStore("outbox");
      for (const key of await req(out.index("byTrip").getAllKeys(tripId))) out.delete(key);
      await done(tx);
    },
    close() { try { db.close(); } catch {} },
  };
}

/** Same API, in memory. Used when IndexedDB is unavailable, and by tests. */
export function createMemoryStore() {
  const trips = new Map();
  const items = new Map(); // tripId -> Map(id -> row)
  const outbox = [];
  const meta = new Map();
  let seq = 0;
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  return {
    kind: "memory",
    async loadTrip(tripId) {
      const t = trips.get(tripId);
      if (!t) return null;
      return clone(joinState(t, [...(items.get(tripId) || new Map()).values()]));
    },
    async loadDay(tripId, day) {
      return clone([...(items.get(tripId) || new Map()).values()].filter((r) => r.dayKey === dayKeyOf(day)));
    },
    async saveTrip(tripId, snap) {
      const { trip, items: rows } = splitState(tripId, clone(snap));
      trips.set(tripId, trip);
      items.set(tripId, new Map(rows.map((r) => [r.id, r])));
    },
    async markStale(tripId) { const t = trips.get(tripId); if (t) t.stale = true; },
    async enqueue(tripId, op) { seq += 1; outbox.push({ seq, tripId, op: clone(op), at: Date.now() }); return seq; },
    async outbox(tripId) { return clone(outbox.filter((r) => r.tripId === tripId)); },
    async dequeue(seqs) {
      const drop = new Set(seqs);
      for (let i = outbox.length - 1; i >= 0; i -= 1) if (drop.has(outbox[i].seq)) outbox.splice(i, 1);
    },
    async getMeta(key) { return meta.has(key) ? clone(meta.get(key)) : null; },
    async setMeta(key, value) { meta.set(key, clone(value)); },
    async forgetTrip(tripId) {
      trips.delete(tripId); items.delete(tripId);
      for (let i = outbox.length - 1; i >= 0; i -= 1) if (outbox[i].tripId === tripId) outbox.splice(i, 1);
    },
    close() {},
  };
}

/** IndexedDB when it works, memory otherwise. Never rejects. */
export async function createLiveTripStore(idb = globalThis.indexedDB) {
  try { return await createIdbStore(idb); } catch { return createMemoryStore(); }
}
