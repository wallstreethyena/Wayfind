/* Wayfind Live Trips service worker. Scope: /trips/ only, so it never touches
 * the rest of gowayfind.com.
 *
 *  1. Asset cache. Hashed Next.js build files (/_next/static/) are cache-first
 *     (their names change with every build); trip pages are network-first with
 *     a cached copy as the offline fallback. API calls are never cached: trip
 *     data lives in IndexedDB (lib/liveTripStore.js) and comes from the sync
 *     engine (lib/liveTripSync.js).
 *  2. Background sync. When an edit could not be sent, the page registers the
 *     "wf-live-trips" sync. When the connection returns, the browser wakes this
 *     worker: if a trip tab is open it is told to flush; if none is open the
 *     worker drains the IndexedDB outbox itself, in order, with the session
 *     token the page left in the meta store. Op ids make it safe for the page
 *     and the worker to both send the same edit: the server applies it once.
 *
 * Keep the IndexedDB schema below identical to upgradeLiveTripDb() in
 * lib/liveTripStore.js (scripts/test-live-trip-sw.mjs checks it).
 */
"use strict";

const SW_VERSION = "live-trips-1";
const STATIC_CACHE = "wf-trips-static-" + SW_VERSION;
const PAGE_CACHE = "wf-trips-pages-" + SW_VERSION;
const SYNC_TAG = "wf-live-trips";
const DB_NAME = "wayfind-live";
const DB_VERSION = 1;
const NAV_TIMEOUT_MS = 4000;
const MAX_STATIC_ENTRIES = 120;
const MAX_PAGE_ENTRIES = 12;

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("wf-trips-") && k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

function isTripPage(url) { return url.origin === self.location.origin && /^\/trips\/[0-9a-f-]{36}\/?$/i.test(url.pathname); }

async function pageNetworkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
    ]);
    if (res && res.ok && res.type === "basic") {
      cache.put(new URL(request.url).pathname, res.clone()).then(() => trim(PAGE_CACHE, MAX_PAGE_ENTRIES)).catch(() => {});
    }
    return res;
  } catch (e) {
    const path = new URL(request.url).pathname;
    const exact = await cache.match(path);
    if (exact) return exact;
    // Any cached trip page works as the app shell: the page reads the trip id
    // from the address bar and the trip itself from IndexedDB.
    const keys = await cache.keys();
    if (keys.length) { const any = await cache.match(keys[keys.length - 1]); if (any) return any; }
    return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline · Wayfind</title><body style='font-family:system-ui;background:#0D1117;color:#E2E8F0;padding:32px;text-align:center'><h1 style='font-size:20px'>You're offline</h1><p>Open this trip once while online and it will work offline next time.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function staticCacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
    cache.put(request, res.clone()).then(() => trim(STATIC_CACHE, MAX_STATIC_ENTRIES)).catch(() => {});
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data: never cached here
  if (req.mode === "navigate" && isTripPage(url)) { event.respondWith(pageNetworkFirst(req)); return; }
  if (url.pathname.startsWith("/_next/static/") || /^\/fonts\//.test(url.pathname)) { event.respondWith(staticCacheFirst(req)); }
});

// ── IndexedDB (same schema as lib/liveTripStore.js) ──────────────────────
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
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
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

async function drainOutbox() {
  const db = await openDb();
  try {
    const auth = (await reqP(db.transaction("meta").objectStore("meta").get("auth"))) || null;
    const token = auth && auth.value && auth.value.token;
    const exp = auth && auth.value && Number(auth.value.exp);
    if (!token || !(exp > Date.now() / 1000 + 30)) return; // the open page will send it after sign-in refresh
    const rows = (await reqP(db.transaction("outbox").objectStore("outbox").getAll())).sort((a, b) => a.seq - b.seq);
    const byTrip = new Map();
    for (const row of rows) { if (!byTrip.has(row.tripId)) byTrip.set(row.tripId, []); byTrip.get(row.tripId).push(row); }
    for (const [tripId, list] of byTrip) {
      if (!/^[0-9a-f-]{36}$/i.test(tripId)) continue;
      for (let i = 0; i < list.length; i += 50) {
        const batch = list.slice(i, i + 50);
        const trip = await reqP(db.transaction("trips").objectStore("trips").get(tripId));
        const res = await fetch("/api/trips/live/" + tripId + "/ops", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ baseRevision: trip ? trip.revision : null, ops: batch.map((r) => r.op) }),
          cache: "no-store",
        });
        if (res.status === 401) return;
        if (res.status === 403 || res.status === 404 || res.status === 410) break; // the page shows why
        if (!res.ok) throw new Error("ops " + res.status); // the browser retries the sync later
        const body = await res.json();
        const acked = new Set((body.applied || []).concat((body.rejected || []).map((x) => x.opId)));
        const tx = db.transaction(["outbox", "trips"], "readwrite");
        for (const row of batch) if (acked.has(row.op.id)) tx.objectStore("outbox").delete(row.seq);
        if (trip) { trip.stale = true; tx.objectStore("trips").put(trip); }
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      }
    }
  } finally {
    db.close();
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
    if (windows.length) { for (const w of windows) w.postMessage({ type: "wf-live-flush" }); return; }
    await drainOutbox();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "wf-live-drain") event.waitUntil(drainOutbox().catch(() => {}));
  // The first visit loads the app before this worker controls the page, so the
  // page hands over the build files it already loaded; they get cached too and
  // the trip opens offline from the very next visit.
  if (data.type === "wf-cache-urls" && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(STATIC_CACHE);
      for (const raw of data.urls.slice(0, 80)) {
        try {
          const url = new URL(raw, self.location.origin);
          if (url.origin !== self.location.origin || !url.pathname.startsWith("/_next/static/")) continue;
          if (await cache.match(url.href)) continue;
          const res = await fetch(url.href);
          if (res.ok) await cache.put(url.href, res);
        } catch (e) {}
      }
      await trim(STATIC_CACHE, MAX_STATIC_ENTRIES);
      // ...and the trip page itself, so an offline reload has a shell.
      try {
        const page = new URL(String(data.page || ""), self.location.origin);
        if (page.origin === self.location.origin && isTripPage(page)) {
          const pages = await caches.open(PAGE_CACHE);
          const res = await fetch(page.pathname, { credentials: "same-origin" });
          if (res.ok && res.type === "basic") await pages.put(page.pathname, res);
          await trim(PAGE_CACHE, MAX_PAGE_ENTRIES);
        }
      } catch (e) {}
    })());
  }
});
