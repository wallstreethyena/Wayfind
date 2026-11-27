// Wayfind Live Trips — the IndexedDB store and the offline engine in a REAL
// browser (headless Chromium from @sparticuz/chromium; no network beyond a
// localhost file server). Proves:
//   * the schema mirrors the server tables and supports partial reads (one
//     day's stops through the [tripId, dayKey] index);
//   * the outbox keeps edits across a full page reload, in order;
//   * the engine starts offline from IndexedDB alone, queues edits, and on
//     reconnect drains them in order exactly once, then the cache equals the
//     server state;
//   * the service worker opens the identical schema (same stores, keys, indexes).
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let count = 0;
const ok = (v, label) => { assert.ok(v, label); count += 1; };

// The service worker must declare the same schema as lib/liveTripStore.js.
{
  const lib = await readFile(path.join(ROOT, "lib/liveTripStore.js"), "utf8");
  const sw = await readFile(path.join(ROOT, "public/trips-sw.js"), "utf8");
  const shape = (src) => [...src.matchAll(/createObjectStore\("(\w+)", (\{[^}]*\})\)|createIndex\("(\w+)", ([^)]+)\)/g)].map((m) => m[0].replace(/\s+/g, "")).sort();
  ok(shape(lib).length === 7 && JSON.stringify(shape(lib)) === JSON.stringify(shape(sw)), "service worker schema matches the store schema");
  ok(/DB_NAME = "wayfind-live"/.test(sw) && /DB_VERSION = 1/.test(sw) && /DB_VERSION = 1/.test(lib), "same database name and version");
  ok(/url\.pathname\.startsWith\("\/api\/"\)\) return/.test(sw), "the worker never caches API responses");
}

// Chromium: Playwright's own (CI installs it) first, else the bundled
// @sparticuz/chromium binary. No download is ever attempted here.
async function launchBrowser() {
  try {
    const { resolvePlaywright, resolveLaunchOptions } = await import("./lib/synthetic/chromium.mjs");
    const pw = await resolvePlaywright();
    const opts = resolveLaunchOptions(pw);
    if (pw && opts) return await pw.launch({ headless: true, ...opts });
  } catch {}
  try {
    const { chromium } = await import("playwright-core");
    const spx = (await import("@sparticuz/chromium")).default;
    return await chromium.launch({ executablePath: await spx.executablePath(), args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"], headless: true });
  } catch { return null; }
}
const browser = await launchBrowser();
if (!browser) {
  console.log("test-live-trip-idb: SKIP browser half — no Chromium available. Static checks: " + count);
  process.exit(0);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>idb</title><body>ok</body>");
    return;
  }
  if (!/^\/lib\/[A-Za-z0-9_.-]+\.js$/.test(url.pathname)) { res.writeHead(404); res.end(); return; }
  try {
    const body = await readFile(path.join(ROOT, url.pathname));
    res.writeHead(200, { "content-type": "application/javascript" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;

try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(origin + "/");

  const r1 = await page.evaluate(async () => {
    const L = await import("/lib/liveTrip.js");
    const { createIdbStore } = await import("/lib/liveTripStore.js");
    const store = await createIdbStore();
    const state = L.stateFromTrip({ title: "Keys", startDate: "2026-12-10", endDate: "2026-12-12", items: [
      { id: "a", place: { id: "a", name: "Mallory Square" }, day: "2026-12-10", order: 0 },
      { id: "b", place: { id: "b", name: "Blue Heaven" }, day: "2026-12-10", order: 1 },
      { id: "c", place: { id: "c", name: "Fort Zachary" }, day: "2026-12-11", order: 2 },
      { id: "d", place: { id: "d", name: "Sunset sail" }, day: null, order: 3 },
    ] });
    await store.saveTrip("t1", { state, revision: 7, checksum: L.checksum(state), role: "editor", me: "m1", members: [{ id: "m1", name: "Gabe" }] });
    const back = await store.loadTrip("t1");
    const day10 = (await store.loadDay("t1", "2026-12-10")).map((x) => x.id).sort();
    const unscheduled = (await store.loadDay("t1", null)).map((x) => x.id);
    await store.enqueue("t1", { id: "op-1-aaaaaaaa", type: "x" });
    await store.enqueue("t2", { id: "op-other-trip", type: "x" });
    await store.enqueue("t1", { id: "op-2-aaaaaaaa", type: "x" });
    // Shrink: saving a state without "d" removes its row.
    const smaller = L.applyOps(state, [{ id: "op-remove-ddddd", hlc: L.formatHlc(1, 0, "aaa"), type: "remove", itemId: "d" }]).state;
    await store.saveTrip("t1", { state: smaller, revision: 8 });
    const afterShrink = (await store.loadDay("t1", null)).length;
    return { same: L.checksum(back.state) === L.checksum(state) && back.revision === 7 && back.members[0].name === "Gabe", day10, unscheduled, afterShrink, kind: store.kind };
  });
  ok(r1.kind === "indexeddb", "real IndexedDB in the browser");
  ok(r1.same, "a saved trip reads back byte-identical (checksum) with revision and roster");
  ok(JSON.stringify(r1.day10) === '["a","b"]' && JSON.stringify(r1.unscheduled) === '["d"]', "partial read: one day's stops via the day index");
  ok(r1.afterShrink === 0, "saving a newer state deletes rows for removed stops");

  // Survives a full reload: outbox order kept, per trip.
  await page.reload();
  const r2 = await page.evaluate(async () => {
    const { createIdbStore } = await import("/lib/liveTripStore.js");
    const store = await createIdbStore();
    const out = await store.outbox("t1");
    await store.dequeue([out[0].seq]);
    const left = (await store.outbox("t1")).map((r) => r.op.id);
    const trip = await store.loadTrip("t1");
    return { ids: out.map((r) => r.op.id), left, rev: trip.revision };
  });
  ok(JSON.stringify(r2.ids) === '["op-1-aaaaaaaa","op-2-aaaaaaaa"]', "the outbox survives a reload, in order, scoped to its trip");
  ok(JSON.stringify(r2.left) === '["op-2-aaaaaaaa"]' && r2.rev === 8, "dequeue removes exactly the acknowledged entries");

  // Offline start + reconnect drain, with a fake server living in the page.
  const r3 = await page.evaluate(async () => {
    const L = await import("/lib/liveTrip.js");
    const { createIdbStore } = await import("/lib/liveTripStore.js");
    const { createLiveTripSync } = await import("/lib/liveTripSync.js");
    const store = await createIdbStore();
    await store.forgetTrip("t1");
    const srv = { state: L.stateFromTrip({ title: "Keys", items: [{ id: "a", place: { id: "a", name: "Mallory Square" }, order: 0 }] }), revision: 3, seen: new Set(), received: [] };
    await store.saveTrip("t1", { state: srv.state, revision: 3, role: "editor", me: "m1", members: [] });
    let online = false;
    const transport = {
      async sendOps(body) {
        if (!online) throw new Error("offline");
        srv.received.push(...body.ops.map((o) => o.id));
        const fresh = body.ops.filter((o) => !srv.seen.has(o.id));
        const r = L.applyOps(srv.state, fresh);
        fresh.forEach((o) => srv.seen.add(o.id));
        if (r.applied.length) { srv.state = r.state; srv.revision += 1; }
        return { status: 200, body: { ok: true, revision: srv.revision, state: srv.state, checksum: L.checksum(srv.state), applied: body.ops.map((o) => o.id), rejected: [] } };
      },
      async fetchSnapshot() { if (!online) throw new Error("offline"); return { status: 200, body: { ok: true, state: srv.state, revision: srv.revision, role: "editor", members: [] } }; },
      connect(h) { h.onSocket("down"); },
      disconnect() {},
    };
    const sync = createLiveTripSync({ tripId: "t1", store, transport });
    sync.setOnline(false);
    await sync.start();
    const startedOffline = sync.snapshot().state.items.a && sync.snapshot().status === "offline";
    const st = sync.snapshot().state;
    await sync.dispatch({ type: "add", item: { id: "n1", place: { id: "n1", name: "Key lime pie" }, day: null, pos: L.posAfter(st, null, "a") } });
    await sync.dispatch({ type: "set", itemId: "n1", field: "note", value: "get two" });
    await sync.dispatch({ type: "move", itemId: "n1", day: null, pos: L.posAfter(sync.snapshot().state, null, null, "n1") });
    const queued = (await store.outbox("t1")).length;
    const offlineView = L.orderedItems(sync.snapshot().state).map((x) => x.id).join(",");
    online = true;
    sync.setOnline(true);
    for (let i = 0; i < 40 && sync.snapshot().pending; i += 1) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 400)); // debounced IndexedDB write
    const cached = await store.loadTrip("t1");
    sync.stop();
    return {
      startedOffline, queued, offlineView,
      pending: sync.snapshot().pending,
      durable: (await store.outbox("t1")).length,
      serverNote: srv.state.items.n1 && srv.state.items.n1.note,
      serverOrder: L.orderedItems(srv.state).map((x) => x.id).join(","),
      sent: srv.received.length,
      cacheMatches: cached && L.checksum(cached.state) === L.checksum(srv.state) && cached.revision === srv.revision,
    };
  });
  ok(r3.startedOffline, "the trip opens offline from IndexedDB alone");
  ok(r3.queued === 3 && r3.offlineView === "n1,a", "offline edits are queued durably and shown right away");
  ok(r3.pending === 0 && r3.durable === 0, "on reconnect the queue drains completely");
  ok(r3.sent === 3 && r3.serverNote === "get two" && r3.serverOrder === "n1,a", "each offline edit reached the server once, in order");
  ok(r3.cacheMatches, "the offline cache equals the server state after sync");
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`test-live-trip-idb: OK — ${count} assertions (real Chromium IndexedDB).`);
