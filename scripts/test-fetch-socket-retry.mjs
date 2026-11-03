#!/usr/bin/env node
/**
 * test-fetch-socket-retry - EXECUTES the global fetch retry for the idle
 * keep-alive socket race (lib/serverDispatcher.js).
 *
 * Incident: 583 production "fetch failed" / SocketError "other side closed"
 * (UND_ERR_SOCKET, bytesRead 0) against Supabase behind Cloudflare. The mechanism
 * is a request written onto a pooled socket the peer then drops without answering.
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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";
import { installResilientDispatcher, GLOBAL_DISPATCHER_SYMBOL, RETRY_OPTIONS } from "../lib/serverDispatcher.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { failed++; console.error("FAIL " + m); } };

async function startServer(mode) {
  const state = { arrivals: 0 };
  const server = http.createServer((req, res) => {
    state.arrivals++;
    const served = req.socket.__served || 0;
    req.socket.__served = served + 1;
    req.resume();
    if (mode === "stale" && served >= 1) { req.socket.destroy(); return; }
    if (mode === "429") { res.writeHead(429, { "content-type": "application/json" }); res.end('{"e":"quota"}'); return; }
    if (mode === "503") { res.writeHead(503); res.end("down"); return; }
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
const dispatcher = installResilientDispatcher();
ok(dispatcher != null, "installResilientDispatcher returns a dispatcher");
ok(globalThis[GLOBAL_DISPATCHER_SYMBOL] != null, "Symbol.for('undici.globalDispatcher.1') is set (built-in fetch reads it)");
ok(typeof process.versions.undici === "string", `Node bundles undici ${process.versions.undici}`);
{
  const s = await startServer("stale");
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
  const a = await fetch(s.url); await a.text();
  await tick(100);
  const b = await attempt(() => fetch(s.url, { method: "POST", body: "{}" }));
  ok(b.err && codeOf(b.err) === "UND_ERR_SOCKET", `POST on a dropped socket is not retried (got ${b.err ? codeOf(b.err) : "success"})`);
  ok(s.arrivals === 2, `POST produced exactly one arrival after the first GET, total ${s.arrivals}`);
  s.close();
}

// 3. deterministic status codes never retried
for (const code of ["429", "503"]) {
  const s = await startServer(code);
  const r = await fetch(s.url); await r.text();
  ok(Number(code) === r.status && s.arrivals === 1, `${code} is returned as is with 1 arrival (got status ${r.status}, arrivals ${s.arrivals})`);
  s.close();
}

// 4. static wiring
ok(RETRY_OPTIONS.statusCodes.length === 0, "statusCodes is empty (CLAUDE.md rule 2: no retry on 429/quota)");
ok(RETRY_OPTIONS.maxRetries === 1 && RETRY_OPTIONS.methods.join() === "GET,HEAD,OPTIONS", "one retry, GET/HEAD/OPTIONS only");
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

dispatcher && (await dispatcher.close().catch(() => {}));
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall fetch socket retry checks passed");
process.exit(0);
