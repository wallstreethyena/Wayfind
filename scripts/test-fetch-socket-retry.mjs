#!/usr/bin/env node
/**
 * test-fetch-socket-retry - EXECUTES the global fetch retry for the idle
 * keep-alive socket race (lib/serverDispatcher.js).
 *
 * Production recorded "fetch failed" / SocketError "other side closed"
 * (UND_ERR_SOCKET, bytesRead 0). A Cloudflare address alone cannot identify the
 * upstream. This reproduces a compatible failure mechanism, not attribution:
 * a request written onto a pooled socket the peer then drops without answering.
 * Here a local server answers the first request on a connection and destroys any
 * LATER request that arrives on the same (reused) connection, which is exactly
 * what the client sees in the race.
 *
 * Proves, through the real built-in fetch and the real installer:
 *   0. negative control: without the interceptor the 2nd GET fails with UND_ERR_SOCKET
 *   1. with it, the same GET succeeds after exactly one retry
 *   2. a POST on the stale socket is NOT retried (fails, 1 arrival)
 *   3. 429 and 503 responses are NOT retried (1 arrival each)
 *   4. built-in fetch honours the global dispatcher symbol; wiring is server only
 */
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";
import { createClient } from "@supabase/supabase-js";
import { installResilientDispatcher, buildResilientDispatcher, isRetryableDatabaseRead, GLOBAL_DISPATCHER_SYMBOL, RETRY_OPTIONS } from "../lib/serverDispatcher.js";
import { fetchDeadline } from "../lib/fetchDeadline.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { failed++; console.error("FAIL " + m); } };

async function startServer(mode) {
  const state = { arrivals: 0, headers: [] };
  const server = http.createServer((req, res) => {
    state.arrivals++;
    state.headers.push(req.headers);
    const served = req.socket.__served || 0;
    req.socket.__served = served + 1;
    req.resume();
    if (mode === "503-then-drop") {
      if (state.arrivals > 1) { req.socket.destroy(); return; }
      res.writeHead(503, { "content-type": "application/json" }); res.end('{"code":"57014"}'); return;
    }
    if (mode === "drop" || (mode === "drop-then-stall" && state.arrivals === 1)) { req.socket.destroy(); return; }
    if (mode === "drop-then-stall" || mode === "stall") return;
    if (mode === "stale" && served >= 1) { req.socket.destroy(); return; }
    if (/^\d{3}$/.test(mode)) { res.writeHead(Number(mode), { "content-type": "application/json" }); res.end('{"e":"refused"}'); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  state.url = `http://127.0.0.1:${server.address().port}/rest/v1/x`;
  state.close = () => { server.closeAllConnections(); server.close(); };
  return state;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
async function attempt(fn) { try { return { res: await fn() }; } catch (err) { return { err }; } }
const codeOf = (err) => err && err.cause && err.cause.code;
const dispatchers = [];
function installFor(s) {
  const d = installResilientDispatcher({}, new URL(s.url).origin);
  dispatchers.push(d);
  return d;
}

// 0. negative control (plain agent, no interceptor)
{
  setGlobalDispatcher(new Agent());
  const s = await startServer("stale");
  const a = await fetch(s.url); await a.text();
  await tick(100);
  const b = await attempt(() => fetch(s.url));
  ok(b.err && b.err.message === "fetch failed" && codeOf(b.err) === "UND_ERR_SOCKET", `negative control reproduces "fetch failed" UND_ERR_SOCKET without the interceptor (got ${b.err && codeOf(b.err)})`);
  ok(/other side closed/.test(String(b.err && b.err.cause && b.err.cause.message)), "negative control message is 'other side closed'");
  s.close();
}

// 1. retry succeeds
{
  const s = await startServer("stale");
  const dispatcher = installFor(s);
  ok(dispatcher != null, "installResilientDispatcher returns a dispatcher");
  ok(globalThis[GLOBAL_DISPATCHER_SYMBOL] != null, "Symbol.for('undici.globalDispatcher.1') is set (built-in fetch reads it)");
  ok(typeof process.versions.undici === "string", `Node bundles undici ${process.versions.undici}`);
  const a = await fetch(s.url); await a.text();
  await tick(100);
  const b = await attempt(async () => { const r = await fetch(s.url); return { status: r.status, body: await r.json() }; });
  ok(b.res && b.res.status === 200 && b.res.body.ok === true, `GET on a dropped pooled socket succeeds (err: ${b.err && codeOf(b.err)})`);
  ok(s.arrivals === 3, `exactly one retry: server saw 3 arrivals (first, dropped, retry), got ${s.arrivals}`);
  s.close();
}

// 2. POST never retried
{
  const s = await startServer("stale");
  installFor(s);
  const a = await fetch(s.url); await a.text();
  await tick(100);
  const b = await attempt(() => fetch(s.url, { method: "POST", body: "{}" }));
  ok(b.err && codeOf(b.err) === "UND_ERR_SOCKET", `POST on a dropped socket is not retried (got ${b.err ? codeOf(b.err) : "success"})`);
  ok(s.arrivals === 2, `POST produced exactly one arrival after the first GET, total ${s.arrivals}`);
  s.close();
}

// 3. deterministic status codes never retried
for (const code of ["400", "401", "403", "404", "422", "429", "500", "503"]) {
  const s = await startServer(code);
  installFor(s);
  const r = await fetch(s.url); await r.text();
  ok(Number(code) === r.status && s.arrivals === 1, `${code} is returned as is with 1 arrival (got status ${r.status}, arrivals ${s.arrivals})`);
  s.close();
}

// 4. Failure of BOTH attempts remains a failure, bounded to two arrivals.
{
  const s = await startServer("drop"); installFor(s);
  const b = await attempt(() => fetch(s.url));
  ok(codeOf(b.err) === "UND_ERR_SOCKET" && s.arrivals === 2, "a failed retry rejects cleanly after exactly two raw-read attempts");
  s.close();
}

// Caller cancellation and an overall deadline survive retry/backoff unchanged.
for (const mode of ["stall", "drop-then-stall"]) {
  const s = await startServer(mode); installFor(s);
  const started = Date.now();
  const b = await attempt(() => fetch(s.url, { signal: AbortSignal.timeout(160) }));
  ok(b.err?.name === "TimeoutError" && Date.now() - started < 650, `${mode}: original 160ms deadline is not reset by the retry`);
  const arrivals = s.arrivals; await tick(100);
  ok(arrivals === (mode === "stall" ? 1 : 2) && s.arrivals === arrivals, `${mode}: no attempts continue after timeout`);
  s.close();
}
{
  const s = await startServer("drop"); installFor(s);
  const c = new AbortController();
  const p = attempt(() => fetch(s.url, { signal: c.signal }));
  setTimeout(() => c.abort(), 10);
  const b = await p; await tick(100);
  ok(b.err?.name === "AbortError" && s.arrivals === 1, "cancellation during retry backoff prevents a second network arrival");
  s.close();
}

// Mutating verbs, RPC/auth/storage, SDK calls and unconfigured origins bypass it.
for (const suffix of ["/rest/v1/rpc/write_something", "/auth/v1/token", "/storage/v1/object/example"]) {
  const s = await startServer("drop"); installFor(s);
  const b = await attempt(() => fetch(new URL(suffix, s.url)));
  ok(b.err && s.arrivals === 1, `${suffix}: no dispatcher retry`); s.close();
}
for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
  const s = await startServer("drop"); installFor(s);
  const b = await attempt(() => fetch(s.url, { method }));
  ok(b.err && s.arrivals === 1, `${method}: no dispatcher retry`); s.close();
}
for (const headers of [{ "X-Client-Info": "supabase-js/test" }, { "X-Retry-Count": "0" }, { "X-Wf-Retry-Owner": "inventory-page" }]) {
  const s = await startServer("drop"); installFor(s);
  const b = await attempt(() => fetch(s.url, { headers }));
  ok(b.err && s.arrivals === 1, `${Object.keys(headers)[0]}: existing retry owner is preserved`); s.close();
}
{
  const s = await startServer("drop");
  const d = buildResilientDispatcher({ connect: (_, cb) => {
    const socket = net.connect(new URL(s.url).port, "127.0.0.1");
    socket.once("connect", () => cb(null, socket)); socket.once("error", cb);
  } }, "https://database.supabase.co");
  dispatchers.push(d); setGlobalDispatcher(d);
  let grants = 0;
  for (let i = 0; i < 3; i++) {
    grants++;
    await attempt(() => fetch("https://places.googleapis.com/v1/places/example"));
  }
  ok(s.arrivals === 3 && grants === 3, "Google's existing three-attempt loop has three arrivals and three grants, never six");
  s.close();
}
{
  const s = await startServer("drop"); installFor(s);
  const db = createClient(new URL(s.url).origin, "test-anon-key", { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await db.from("example").select("id");
  ok(result.error && s.arrivals === 4, "installed SDK retains its own four attempts without a dispatcher multiplier");
  s.close();
}

// Raw database readers also own retries. Execute their actual helpers over a
// real local socket; a marker removed only in memory reproduces the multiplier.
function inventoryReader(withoutMarker = false) {
  const source = fs.readFileSync(path.join(root, "lib/inventoryServe.js"), "utf8");
  const start = source.indexOf("async function fetchPageWithRetry(");
  const end = source.indexOf("\n/**", start);
  if (start < 0 || end <= start) throw new Error("inventory retry helper not found");
  let body = source.slice(start, end);
  if (withoutMarker) {
    const marker = 'headers["x-wf-retry-owner"] = "inventory-page";';
    if (body.split(marker).length !== 2) throw new Error("inventory marker mutation did not match exactly once");
    body = body.replace(marker, "");
  }
  return new Function(body + "\nreturn fetchPageWithRetry;")();
}
function photoWorklistReader(withoutMarker = false) {
  const source = fs.readFileSync(path.join(root, "lib/placePhotoBackfill.js"), "utf8");
  const start = source.indexOf("async function readAtRiskOnce(");
  const end = source.indexOf("async function fetchRepairQueueWorklist(", start);
  const headerStart = source.indexOf("function headers(s)");
  const headerEnd = source.indexOf("\n}", headerStart) + 2;
  const view = /const AT_RISK_CANDIDATE_VIEW = ([^;]+);/.exec(source);
  if (start < 0 || end <= start || headerStart < 0 || headerEnd <= headerStart || !view) throw new Error("photo worklist retry helpers not found");
  let body = source.slice(start, end);
  if (withoutMarker) {
    const marker = ', "x-wf-retry-owner": "photo-at-risk"';
    if (body.split(marker).length !== 2) throw new Error("photo marker mutation did not match exactly once");
    body = body.replace(marker, "");
  }
  return new Function(`const AT_RISK_CANDIDATE_VIEW = ${view[1]};\n` + source.slice(headerStart, headerEnd) + "\n" + body + "\nreturn fetchAtRiskWorklist;")();
}
for (const withoutMarker of [false, true]) {
  const s = await startServer("drop"); installFor(s);
  const original = { headers: { apikey: "test-key", Authorization: "Bearer test-key", Range: "0-999", "Range-Unit": "items" }, cache: "no-store" };
  const before = JSON.stringify(original);
  const b = await attempt(() => inventoryReader(withoutMarker)(fetchDeadline, s.url, original, 1500, Date.now() + 4000));
  ok(codeOf(b.err) === "UND_ERR_SOCKET" && s.arrivals === (withoutMarker ? 4 : 2), `${withoutMarker ? "mutation control" : "inventory reader"}: ${s.arrivals} wire attempts; application and dispatcher retries must not stack`);
  ok(JSON.stringify(original) === before && s.headers.every((h) => h.apikey === "test-key" && h.authorization === "Bearer test-key" && h.range === "0-999" && h["range-unit"] === "items"), "inventory retry preserves caller headers without mutating the init");
  s.close();
}
for (const withoutMarker of [false, true]) {
  const s = await startServer("503-then-drop"); installFor(s);
  const b = await attempt(() => photoWorklistReader(withoutMarker)({ url: new URL(s.url).origin, key: "test-key" }, 10, Date.now() + 4000));
  ok(codeOf(b.err) === "UND_ERR_SOCKET" && b.err.retried === true && s.arrivals === (withoutMarker ? 3 : 2), `${withoutMarker ? "mutation control" : "photo worklist"}: ${s.arrivals} wire attempts for mixed HTTP/transport failure, bounded by its existing owner`);
  ok(s.headers.every((h) => h.apikey === "test-key" && h.authorization === "Bearer test-key" && h["content-type"] === "application/json"), "photo worklist preserves database request headers");
  s.close();
}
for (const headers of [new Headers({ Authorization: "Bearer test-key", Range: "0-9" }), [["Authorization", "Bearer test-key"], ["Range", "0-9"]]]) {
  const s = await startServer("200"); installFor(s);
  const r = await inventoryReader()(fetchDeadline, s.url, { headers, cache: "no-store" }, 1000, Date.now() + 2000);
  await r.text();
  ok(r.ok && s.arrivals === 1 && s.headers[0].authorization === "Bearer test-key" && s.headers[0].range === "0-9", "healthy owned read preserves Headers/tuple input and needs no retry");
  ok(!new Headers(headers).has("x-wf-retry-owner"), "adding retry ownership does not mutate caller Headers/tuple input");
  s.close();
}

const read = { origin: "https://database.supabase.co", path: "/rest/v1/wf_inventory?select=id", method: "GET" };
for (const headers of [new Headers({ "X-Client-Info": "supabase-js/test" }), ["X-Retry-Count", "0"], { "x-CLIENT-info": "postgrest-js/test" }, new Headers({ "X-Wf-Retry-Owner": "inventory-page" }), ["X-WF-Retry-Owner", "photo-at-risk"], { "x-WF-retry-OWNER": "inventory-page" }]) {
  ok(!isRetryableDatabaseRead({ ...read, headers }, read.origin), "SDK/retry header exclusion accepts Headers, flat arrays and objects case-insensitively");
}
ok(!isRetryableDatabaseRead(read, null), "missing database configuration fails closed");
ok(!isRetryableDatabaseRead({ ...read, origin: "https://database.supabase.co.evil.example" }, read.origin), "database origin comparison is exact");

// 4. static wiring
ok(RETRY_OPTIONS.statusCodes.length === 0, "statusCodes is empty (CLAUDE.md rule 2: no retry on 429/quota)");
ok(RETRY_OPTIONS.maxRetries === 1 && RETRY_OPTIONS.methods.join() === "GET,HEAD", "one retry, GET/HEAD table reads only");
ok(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "UND_ERR_CONNECT_TIMEOUT"].every((c) => RETRY_OPTIONS.errorCodes.includes(c)), "error codes cover the socket-drop class");
const instr = fs.readFileSync(path.join(root, "instrumentation.js"), "utf8");
const nodeBranch = instr.slice(instr.indexOf('NEXT_RUNTIME === "nodejs"'), instr.indexOf('NEXT_RUNTIME === "edge"'));
ok(/lib\/serverDispatcher/.test(nodeBranch) && /installResilientDispatcher\(\)/.test(nodeBranch) && /catch/.test(nodeBranch), "instrumentation.js installs it in the nodejs branch inside try/catch");
ok(!/serverDispatcher|undici/.test(instr.slice(instr.indexOf('NEXT_RUNTIME === "edge"'))) , "edge branch does not touch it");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
ok(/^7\.\d+\.\d+$/.test(pkg.dependencies && pkg.dependencies.undici || ""), `undici is an exact-pinned dependency (${pkg.dependencies && pkg.dependencies.undici})`);
const offenders = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p); continue; }
    if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name) && p !== path.join(root, "lib", "serverDispatcher.js") && /serverDispatcher|from\s+["']undici["']/.test(fs.readFileSync(p, "utf8"))) offenders.push(path.relative(root, p));
  }
}
for (const d of ["app", "lib", "components"]) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
ok(offenders.length === 0, `nothing in app/ or lib/ imports undici or serverDispatcher (client bundle safe): ${offenders.join(", ") || "none"}`);

await Promise.all(dispatchers.map((dispatcher) => dispatcher.close().catch(() => {})));
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall fetch socket retry checks passed");
process.exit(0);
