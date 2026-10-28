#!/usr/bin/env node
/**
 * scripts/run-guards.mjs — runs every guard in scripts/guards.txt.
 *
 * This replaces the ~8KB single-line "prebuild" chain in package.json. It is
 * the safety net for the whole repo, so it is written to FAIL CLOSED: the
 * dangerous failure mode is not "crashes loudly", it is "silently runs fewer
 * guards than you think and prints OK". Every guard below exists to prevent
 * that.
 *
 *   - manifest missing / unreadable        -> exit 1
 *   - manifest parses to fewer than FLOOR  -> exit 1 (someone truncated it,
 *                                             or a bad merge ate the list)
 *   - any guard exits non-zero             -> exit with that code
 *   - a guard line that isn't runnable     -> exit 1
 *   - scripts/guards-serial.txt names a line that is not in the manifest
 *                                          -> exit 1 (a rename must not silently
 *                                             demote a guard into the parallel pool)
 *   - GUARD_JOBS is not a positive integer -> exit 1
 *
 * FLOOR is a ratchet, not a target. It is deliberately below the current count
 * so ordinary removals don't trip it, but far above zero so a truncated or
 * half-merged manifest can never pass. Raise it as the suite grows.
 *
 * ── PARALLEL EXECUTION (added 2026-10-27) ────────────────────────────────────
 * The serial suite took 18 to 20 minutes on a 4 vCPU runner against a 20 minute
 * job limit, so roughly every second PR was a coin flip and main itself was
 * cancelled once. The runner now executes guards through a small worker pool.
 *
 *   GUARD_JOBS=<n>   pool size. Default min(4, os.availableParallelism()), at
 *                    least 1. GUARD_JOBS=1 is the documented ESCAPE HATCH: it
 *                    restores the exact pre-parallel behaviour (one guard at a
 *                    time, in manifest order, output streamed live, stop at the
 *                    first failure). Use it to debug a guard that only fails in
 *                    the pool, or whenever output interleaving would confuse.
 *
 *   Launch order     is still manifest order. Each guard's stdout+stderr is
 *                    buffered and printed as ONE block when that guard finishes,
 *                    under a "[i/N] command (seconds)" header, so logs stay
 *                    readable per guard.
 *
 *   SERIAL GUARDS    scripts/guards-serial.txt lists, one exact guard line per
 *                    entry (same text as in guards.txt, "#" comments carry the
 *                    reason), the guards that MUST NOT overlap anything: they
 *                    write tracked files, use fixed /tmp paths or fixed ports,
 *                    mutate repo source for red-proofs, or launch a browser.
 *                    They run AFTER the parallel phase, alone, one at a time,
 *                    in manifest order. Be conservative: a guard that writes to
 *                    a path it did not mint uniquely belongs in that file.
 *
 *   Failure          the first non-zero exit stops NEW launches; guards already
 *                    in flight are allowed to finish (they are short, and the
 *                    extra output can show a second independent failure). The
 *                    runner then prints "run-guards: FAIL — guard i/N exited c"
 *                    for the LOWEST-indexed failing guard (deterministic when
 *                    two fail together), lists any others, and exits with that
 *                    guard's code. The serial phase and the credentialed pass do
 *                    not run after a failure.
 *
 *   Timing           after the run, the 15 slowest guards and the effective
 *                    speedup (sum of per-guard time / wall time) are printed.
 *                    Nothing is written to the tree.
 *
 * TEST OVERRIDES (used only by scripts/test-run-guards.mjs):
 *   GUARD_MANIFEST=<file>  run that manifest instead of scripts/guards.txt and
 *                          bypass FLOOR (a 10 line fake manifest is the point).
 *   GUARD_SERIAL=<file>    serial list for that manifest (default: none). Only
 *                          honoured together with GUARD_MANIFEST; setting it
 *                          alone is an error, so it can never switch the real
 *                          suite's serial gate off.
 *
 * DEPLOY-TIME GOTCHA (found 2026-08-02, map fallback bug): npm only runs the
 * "prebuild" script automatically when the build is invoked as `npm run
 * build`. vercel.json's buildCommand had drifted to `npx next build`, which
 * calls the next binary directly and skips npm's pre/post script lifecycle
 * entirely — so this whole guard suite, including test-map-worker.mjs (the
 * byte-identity check that stops a maplibre-gl upgrade from silently
 * shipping a stale/renamed worker file and reproducing the "map could not
 * load" incident), never ran on a real deploy. There is no other CI in this
 * repo (no .github/workflows), so Vercel's build was the only place these
 * guards could run. Keep vercel.json's buildCommand as `npm run build` (or
 * anything else that goes through npm's script lifecycle) — never point it
 * at `next build` / `npx next build` directly.
 */
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { CREDENTIALED_GUARDS, credentialedEnv } from "./lib/guardEnv.mjs";

const OVERRIDE = process.env.GUARD_MANIFEST || "";
const MANIFEST = OVERRIDE ? path.resolve(OVERRIDE) : path.resolve("scripts/guards.txt");
const FLOOR = 140;

if (!OVERRIDE && process.env.GUARD_SERIAL) {
  console.error("run-guards: FAIL — GUARD_SERIAL is only honoured together with GUARD_MANIFEST (test override).");
  console.error("run-guards: refusing to let an env var switch the serial gate off for the real suite.");
  process.exit(1);
}
const SERIAL_LIST = OVERRIDE
  ? (process.env.GUARD_SERIAL ? path.resolve(process.env.GUARD_SERIAL) : "")
  : path.resolve("scripts/guards-serial.txt");

let jobs;
{
  const rawJobs = process.env.GUARD_JOBS;
  if (rawJobs === undefined || rawJobs === "") {
    jobs = Math.max(1, Math.min(4, os.availableParallelism()));
  } else if (/^[1-9][0-9]*$/.test(rawJobs)) {
    jobs = Number(rawJobs);
  } else {
    console.error(`run-guards: FAIL — GUARD_JOBS must be a positive integer, got ${JSON.stringify(rawJobs)}.`);
    process.exit(1);
  }
}

let raw;
try {
  raw = readFileSync(MANIFEST, "utf8");
} catch (e) {
  console.error(`run-guards: FAIL — cannot read ${MANIFEST}: ${e.message}`);
  console.error("run-guards: refusing to report success without the manifest.");
  process.exit(1);
}

// Comments and blanks out; de-dupe (a union merge legitimately creates dupes
// when two branches add the same guard) while preserving first-seen order.
const seen = new Set();
const guards = [];
for (const line of raw.split(/\r?\n/)) {
  const cmd = line.trim();
  if (!cmd || cmd.startsWith("#")) continue;
  if (seen.has(cmd)) continue;
  seen.add(cmd);
  guards.push(cmd);
}

if (!OVERRIDE && guards.length < FLOOR) {
  console.error(`run-guards: FAIL — manifest has ${guards.length} guards, floor is ${FLOOR}.`);
  console.error("run-guards: this looks like a truncated or badly-merged manifest. Refusing to pass.");
  process.exit(1);
}

// The serial list. Every entry must be an exact manifest line: a stale entry
// (guard renamed or removed) would otherwise quietly turn "runs alone" into
// "runs in the pool" for its replacement.
const serialSet = new Set();
if (SERIAL_LIST) {
  let sraw;
  try {
    sraw = readFileSync(SERIAL_LIST, "utf8");
  } catch (e) {
    console.error(`run-guards: FAIL — cannot read ${SERIAL_LIST}: ${e.message}`);
    console.error("run-guards: refusing to run guards in parallel without knowing which must run alone.");
    process.exit(1);
  }
  for (const line of sraw.split(/\r?\n/)) {
    const cmd = line.trim();
    if (!cmd || cmd.startsWith("#")) continue;
    if (!seen.has(cmd)) {
      console.error(`run-guards: FAIL — ${path.basename(SERIAL_LIST)} lists a guard that is not in the manifest:`);
      console.error(`  ${cmd}`);
      console.error("run-guards: a renamed guard would silently lose its serial protection. Update the serial list.");
      process.exit(1);
    }
    serialSet.add(cmd);
  }
}

// WF_SUPPRESS_ANALYTICS: guards invoke real redirect handlers, and those end in
// captureServer(). This suite runs inside `npm run prebuild` DURING THE VERCEL
// BUILD, where the PostHog key is set — so without this every build fired the
// guards' deliberately-broken fixtures into the production project as real
// events, and minted a new "person" for each one. See lib/serverEvents.js.
// Set here rather than per-guard so a future guard cannot forget it.
// (Spelled out inline at each spawn below: scripts/check-guards-emit-no-analytics.mjs
// reads this file and wants the literal env object next to the spawn call.)

const t0 = Date.now();
const N = guards.length;
const durations = new Array(N).fill(0); // seconds per guard, for the timing summary
console.log(`run-guards: ${N} guards from ${OVERRIDE ? path.relative(process.cwd(), MANIFEST) || MANIFEST : "scripts/guards.txt"} (jobs=${jobs}, ${serialSet.size} serial)`);

const fmt = (s) => s.toFixed(1) + "s";

function failUnrunnable(i, message) {
  console.error(`\nrun-guards: FAIL — could not run guard ${i + 1}/${N}: ${guards[i]}`);
  console.error(`  ${message}`);
  process.exit(1);
}

if (jobs === 1) {
  // ── EXACT SERIAL BEHAVIOUR (the escape hatch) ──────────────────────────────
  for (let i = 0; i < N; i++) {
    const cmd = guards[i];
    const gs = Date.now();
    const r = spawnSync(cmd, { shell: true, stdio: "inherit", env: { ...process.env, WF_SUPPRESS_ANALYTICS: "1" } });
    durations[i] = (Date.now() - gs) / 1000;
    if (r.error) failUnrunnable(i, r.error.message);
    if (r.status !== 0) {
      console.error(`\nrun-guards: FAIL — guard ${i + 1}/${N} exited ${r.status}`);
      console.error(`  ${cmd}`);
      process.exit(r.status || 1);
    }
  }
} else {
  // ── WORKER POOL ────────────────────────────────────────────────────────────
  // Runs one guard to completion. stdout+stderr are merged in arrival order and
  // returned, never streamed, so concurrent guards cannot interleave lines.
  const runBuffered = (cmd) => new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve({ ...r, secs: (Date.now() - started) / 1000, out: Buffer.concat(chunks) }); } };
    let child;
    try {
      child = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WF_SUPPRESS_ANALYTICS: "1" } });
    } catch (e) {
      done({ error: e, status: null, signal: null });
      return;
    }
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    child.on("error", (e) => done({ error: e, status: null, signal: null }));
    child.on("close", (status, signal) => done({ error: null, status, signal }));
  });

  const failures = []; // { i, status, signal }
  // Pool of `size` workers over `indices` (manifest order = launch order).
  const runPool = async (indices, size) => {
    let next = 0;
    let stop = false;
    const worker = async () => {
      while (!stop) {
        const k = next++;
        if (k >= indices.length) return;
        const i = indices[k];
        const r = await runBuffered(guards[i]);
        durations[i] = r.secs;
        process.stdout.write(`\n── [${i + 1}/${N}] ${guards[i]} (${fmt(r.secs)})\n`);
        process.stdout.write(r.out);
        if (r.error) {
          // Unrunnable is a hard fail-closed stop: exit 1 immediately, as before.
          failUnrunnable(i, r.error.message);
        }
        if (r.status !== 0) {
          failures.push({ i, status: r.status, signal: r.signal });
          stop = true; // no NEW launches; in-flight guards finish
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(size, indices.length || 1)) }, worker));
  };

  const parallelIdx = [];
  const serialIdx = [];
  guards.forEach((g, i) => (serialSet.has(g) ? serialIdx : parallelIdx).push(i));

  await runPool(parallelIdx, jobs);
  if (!failures.length) await runPool(serialIdx, 1);

  if (failures.length) {
    failures.sort((a, b) => a.i - b.i);
    const f = failures[0];
    const code = f.status === null ? (f.signal ? `via signal ${f.signal}` : "abnormally") : f.status;
    console.error(`\nrun-guards: FAIL — guard ${f.i + 1}/${N} exited ${code}`);
    console.error(`  ${guards[f.i]}`);
    for (const o of failures.slice(1)) {
      console.error(`run-guards: also failed — guard ${o.i + 1}/${N} exited ${o.status ?? o.signal}: ${guards[o.i]}`);
    }
    process.exit(f.status || 1);
  }
}

// ── THE CREDENTIALED PASS ────────────────────────────────────────────────────
// Some assertions cannot execute without a public partner credential, so bare
// they pass VACUOUSLY. That is how the guide exact-CTA rule went stale through
// four PRs while every local run was green — see scripts/lib/guardEnv.mjs.
// These guards therefore run a second time with stubbed credentials, so both
// the credentialed and the degraded path are actually exercised. It runs after
// the parallel and serial phases, one at a time, exactly as before.
const guardsWallSecs = (Date.now() - t0) / 1000;
let credOk = 0;
for (const g of CREDENTIALED_GUARDS) {
  console.log(`\nrun-guards: credentialed pass — ${g.cmd}`);
  const r = spawnSync(g.cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...credentialedEnv(), WF_SUPPRESS_ANALYTICS: "1" },
  });
  if (r.error) {
    console.error(`\nrun-guards: FAIL — credentialed pass could not run: ${g.cmd}`);
    console.error(`  ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\nrun-guards: FAIL — credentialed pass exited ${r.status}: ${g.cmd}`);
    console.error(`  reason this guard is in the credentialed set: ${g.why}`);
    console.error("  This pass exists because the assertion above cannot run without the credential.");
    process.exit(r.status || 1);
  }
  credOk++;
}

// ── TIMING SUMMARY (stdout only; nothing is written into the tree) ───────────
{
  const sum = durations.reduce((a, b) => a + b, 0);
  const slow = durations.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).slice(0, 15);
  console.log(`\nrun-guards: ${slow.length} slowest guards`);
  for (const { s, i } of slow) {
    console.log(`  ${s.toFixed(1).padStart(7)}s  [${String(i + 1).padStart(String(N).length)}/${N}] ${guards[i]}${serialSet.has(guards[i]) && jobs > 1 ? "  (serial)" : ""}`);
  }
  const speedup = guardsWallSecs > 0 ? sum / guardsWallSecs : 1;
  console.log(`run-guards: guard wall time ${fmt(guardsWallSecs)} vs ${fmt(sum)} summed guard time = ${speedup.toFixed(2)}x effective speedup (jobs=${jobs}${jobs > 1 ? `, ${N - serialSet.size} pooled + ${serialSet.size} serial` : ", all serial"})`);
}

console.log(`\nrun-guards: OK — ${N}/${N} guards + ${credOk} credentialed re-run(s) green in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
