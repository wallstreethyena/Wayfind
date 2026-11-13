#!/usr/bin/env node
/**
 * test-chunk-warmup — the homepage warms its lazily split screen/sheet chunks
 * ONE AT A TIME, after a start delay, and never in the same idle slice as the
 * first screen's own data fetches.
 *
 * Measured 2026-11-13 (local production build, 390x844, 4x CPU, 1.6Mbps): the
 * old effect called all 17 loaders inside one requestIdleCallback, which fired
 * ~0.7s after hydration, so 33 lazy chunks (391.8KB gz, up to 30 at once) were
 * downloading during the first screen's data burst. After: 9 chunks (88.7KB
 * gz, at most 7 at once) in that window. Numbers in lib/chunkWarmup.js.
 *
 * What this locks (asserted on the CALL, with a fake window, not on strings):
 *   1. nothing loads before the start delay;
 *   2. at most ONE warm-up chunk is in flight at any moment (a burst control
 *      proves the probe catches the old behaviour);
 *   3. every loader runs exactly once, in order, even when one rejects/throws;
 *   4. the returned cancel stops the chain before and during the sequence;
 *   5. Save-Data and 2g skip the warm-up; 3g/4g/unknown keep it;
 *   6. app/home.js wires SCREEN_LOADERS through warmChunksInSequence and every
 *      lazily imported screen/sheet loader is still in the warm list (so moving
 *      to a sequence never silently drops a chunk from warm-up).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const mod = await import(pathToFileURL(path.resolve("lib/chunkWarmup.js")).href);
const { warmChunksInSequence, warmupAllowed, WARM_START_DELAY_MS } = mod;

// ---- fake window: manual clock, idle callbacks run when the test says so ----
function fakeWindow({ ric = true, connection } = {}) {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const idles = new Map();
  const w = {
    navigator: connection === undefined ? {} : { connection },
    setTimeout(f, ms) { const id = ++seq; timers.set(id, { f, at: now + (ms || 0) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, t] = due[0];
        timers.delete(id);
        t.f();
      }
    },
    runIdle() { const all = [...idles.entries()]; idles.clear(); for (const [, f] of all) f({ didTimeout: false, timeRemaining: () => 10 }); return all.length; },
    pendingIdle: () => idles.size,
  };
  if (ric) {
    w.requestIdleCallback = (f) => { const id = ++seq; idles.set(id, f); return id; };
    w.cancelIdleCallback = (id) => { idles.delete(id); };
  }
  return w;
}
const flush = () => new Promise((r) => setImmediate(r));

// Loaders whose promises the test resolves by hand, recording max concurrency.
function makeLoaders(n, behaviour = {}) {
  const calls = [];
  const pending = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const loaders = Array.from({ length: n }, (_, i) => () => {
    calls.push(i);
    if (behaviour[i] === "throw") throw new Error("boom " + i);
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise((res, rej) => {
      pending.push(() => { inFlight--; if (behaviour[i] === "reject") rej(new Error("chunk " + i)); else res({}); });
    });
  });
  return { loaders, calls, settleAll: () => { const p = pending.splice(0); p.forEach((f) => f()); }, maxInFlight: () => maxInFlight };
}

// Drive a warm-up to completion: each round runs the idle slice, then settles
// whatever is in flight. Returns rounds used.
async function drive(w, h, limit = 50) {
  let rounds = 0;
  while (rounds < limit) {
    await flush();
    const ran = w.runIdle ? w.runIdle() : 0;
    if (!ran && !w.requestIdleCallback) w.advance(200);
    h.settleAll();
    await flush(); await flush();
    rounds++;
    if (!w.pendingIdle || (w.pendingIdle() === 0 && ran === 0 && w.requestIdleCallback)) break;
  }
  return rounds;
}

/* 1 + 2 + 3: delay, one at a time, every loader once, in order */
{
  const w = fakeWindow();
  const h = makeLoaders(17);
  warmChunksInSequence(h.loaders, { win: w });
  w.advance(WARM_START_DELAY_MS - 1);
  ok(w.pendingIdle() === 0 && h.calls.length === 0, "nothing may be scheduled or loaded before the start delay");
  w.advance(1);
  ok(w.pendingIdle() === 1, "after the delay exactly one idle slice is queued (got " + w.pendingIdle() + ")");
  w.runIdle();
  ok(h.calls.length === 1, "one idle slice loads exactly one chunk (got " + h.calls.length + ")");
  ok(w.pendingIdle() === 0, "the next chunk is not scheduled while the first is still in flight");
  await drive(w, h);
  ok(h.calls.length === 17, "every loader runs (got " + h.calls.length + " of 17)");
  ok(h.calls.every((c, i) => c === i), "loaders run in the given order: " + h.calls.join(","));
  ok(h.maxInFlight() === 1, "at most one warm-up chunk in flight (saw " + h.maxInFlight() + ")");
}

/* 2 (negative control): the old burst shape must trip the in-flight probe */
{
  const h = makeLoaders(17);
  h.loaders.forEach((l) => { try { l().catch(() => {}); } catch (e) {} });
  ok(h.maxInFlight() === 17, "control: the old forEach burst shows 17 in flight, so the probe can see a burst (saw " + h.maxInFlight() + ")");
}

/* 3: a rejecting and a throwing loader do not stop the chain */
{
  const w = fakeWindow();
  const h = makeLoaders(5, { 1: "reject", 3: "throw" });
  warmChunksInSequence(h.loaders, { win: w, delayMs: 0 });
  w.advance(0);
  await drive(w, h);
  ok(h.calls.join(",") === "0,1,2,3,4", "rejected/thrown chunks are skipped, the rest still warm: " + h.calls.join(","));
}

/* 4: cancel before the delay, and mid-sequence */
{
  const w = fakeWindow();
  const h = makeLoaders(4);
  const cancel = warmChunksInSequence(h.loaders, { win: w });
  cancel();
  w.advance(WARM_START_DELAY_MS * 2);
  w.runIdle();
  ok(h.calls.length === 0, "cancel before the delay loads nothing");

  const w2 = fakeWindow();
  const h2 = makeLoaders(4);
  const cancel2 = warmChunksInSequence(h2.loaders, { win: w2, delayMs: 0 });
  w2.advance(0); w2.runIdle();
  ok(h2.calls.length === 1, "mid-sequence setup: first chunk loaded");
  cancel2();
  await drive(w2, h2);
  ok(h2.calls.length === 1, "cancel mid-sequence stops further chunks (loaded " + h2.calls.length + ")");
}

/* 5: Save-Data / 2g skip, others keep */
{
  for (const [conn, want, label] of [
    [{ saveData: true, effectiveType: "4g" }, false, "Save-Data"],
    [{ effectiveType: "2g" }, false, "2g"],
    [{ effectiveType: "slow-2g" }, false, "slow-2g"],
    [{ effectiveType: "3g" }, true, "3g"],
    [{ effectiveType: "4g", saveData: false }, true, "4g"],
    [undefined, true, "no Network Information API (Safari)"],
  ]) {
    ok(warmupAllowed(conn === undefined ? {} : { connection: conn }) === want, "warmupAllowed for " + label + " should be " + want);
    const w = fakeWindow({ connection: conn });
    const h = makeLoaders(2);
    warmChunksInSequence(h.loaders, { win: w, delayMs: 0 });
    w.advance(0);
    await drive(w, h);
    ok((h.calls.length === 2) === want, label + ": warm-up " + (want ? "runs" : "is skipped") + " (loaded " + h.calls.length + ")");
  }
}

/* setTimeout fallback (iOS Safari < 17 has no requestIdleCallback) */
{
  const w = fakeWindow({ ric: false });
  const h = makeLoaders(3);
  warmChunksInSequence(h.loaders, { win: w, delayMs: 0 });
  w.advance(0);
  for (let i = 0; i < 6; i++) { w.advance(200); h.settleAll(); await flush(); await flush(); }
  ok(h.calls.length === 3 && h.maxInFlight() === 1, "setTimeout fallback still warms all, one at a time (" + h.calls.length + ", max " + h.maxInFlight() + ")");
}

/* 6: app/home.js wiring */
{
  const raw = readFileSync(path.resolve("app/home.js"), "utf8");
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");
  ok(/import\s*\{\s*warmChunksInSequence\s*\}\s*from\s*"\.\.\/lib\/chunkWarmup"/.test(code), "home.js imports warmChunksInSequence from lib/chunkWarmup");
  ok(/useEffect\(\s*\(\)\s*=>\s*warmChunksInSequence\(\s*SCREEN_LOADERS\s*\)\s*,\s*\[\s*\]\s*\)/.test(code), "home.js runs warmChunksInSequence(SCREEN_LOADERS) in a mount effect and returns its cancel");
  ok(!/SCREEN_LOADERS\s*\.\s*forEach/.test(code), "home.js must not burst-load SCREEN_LOADERS with forEach");
  const decl = code.match(/const\s+SCREEN_LOADERS\s*=\s*\[([^\]]*)\]/);
  ok(!!decl, "SCREEN_LOADERS declaration found");
  const members = decl ? decl[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  ok(members.length === new Set(members).size, "SCREEN_LOADERS has no duplicates");
  // Every lazily imported screen/sheet loader (+ ThingsToDo, trips) must be warmed.
  const lazy = [...code.matchAll(/const\s+(load\w+)\s*=\s*\(\)\s*=>\s*import\(\s*"(\.\/components\/(?:screens|sheets)\/[^"]+|\.\/components\/ThingsToDoList|\.\.\/lib\/trips)"\s*\)/g)].map((m) => m[1]);
  ok(lazy.length >= 17, "probe finds the lazily imported loaders (found " + lazy.length + ", expected >= 17)");
  const missing = lazy.filter((n) => !members.includes(n));
  ok(missing.length === 0, "every lazy screen/sheet loader is in SCREEN_LOADERS; missing: " + missing.join(", "));
  ok(members[0] === "loadDetail", "the place-detail sheet (most common first tap) warms first, got " + members[0]);
}

if (fail.length) {
  console.error("test-chunk-warmup: FAIL (" + fail.length + ")\n  - " + fail.join("\n  - "));
  process.exit(1);
}
console.log("test-chunk-warmup: OK — " + pass + " assertions (sequenced warm-up, Save-Data/2g skip, cancel, home.js wiring incl. a burst negative control)");
