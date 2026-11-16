#!/usr/bin/env node
/**
 * scripts/test-run-guards.mjs — locks the behaviour of scripts/run-guards.mjs.
 *
 * WHY. The runner is the safety net for the whole repo and it now runs guards in
 * a worker pool. Parallelism is only acceptable if it did not cost the runner
 * its fail-closed semantics, so this drives the REAL runner (as a child process)
 * against a throwaway manifest of fake guards (GUARD_MANIFEST / GUARD_SERIAL
 * overrides, which bypass FLOOR) and asserts on the observable contract:
 *
 *   1. PARALLELISM IS REAL: 6 guards that sleep 300ms overlap (timestamps the
 *      fake guards write themselves), and the span is shorter than their sum.
 *   2. GUARD_JOBS=1 IS EXACTLY SERIAL: no two guards overlap, manifest order.
 *   3. EXIT CODE PROPAGATES: a guard exiting 3 makes the runner exit 3 and print
 *      "run-guards: FAIL — guard i/N exited 3" with the right index and command;
 *      no OK line; guards behind it are never launched; a guard already in
 *      flight is allowed to finish; with two failures the LOWEST index wins.
 *   4. UNRUNNABLE LINE -> exit 1 (a command too large to exec: E2BIG), in the
 *      pool and in GUARD_JOBS=1 mode; command-not-found propagates 127.
 *   5. SERIAL GATE: guards named in the serial list never overlap anything: they
 *      start after every parallel guard has ended and not one overlaps another,
 *      while the parallel group did overlap. A serial entry that is not in the
 *      manifest fails the run (exit 1), GUARD_SERIAL without GUARD_MANIFEST fails,
 *      and a bad GUARD_JOBS fails.
 *   6. OUTPUT IS PER GUARD: each guard's lines are contiguous in the log under a
 *      "[i/N] command" header, the OK line keeps its exact format and the
 *      credentialed pass still ran, and the timing summary is printed.
 *   7. The committed scripts/guards-serial.txt names only lines that exist in
 *      scripts/guards.txt (the runner enforces this too; this fails earlier and
 *      with a better message).
 *   8. SHARD REPORT: a sharded run emits executed_<i>/digest_<i>/shards_<i> to
 *      GITHUB_OUTPUT only on success, a guard cannot write into it, and
 *      --verify-shards accepts the complete report and rejects a missing,
 *      duplicated, extra or inflated shard, no report, and a wrong shard count.
 *
 * RED-PROVED (--red-prove, wired in guards.txt): the same scenarios are run against
 * copies of the runner with the protected thing broken, and each mutant must turn
 * the matching scenario red: exit code propagation dropped, the serial gate
 * removed, "stop launching on failure" removed, lowest-index selection removed,
 * shard verification always passing, shard report not emitted, guards allowed to
 * write GITHUB_OUTPUT.
 * A mutant that does NOT apply (pattern not found) fails the guard, so the
 * red-prove cannot go stale silently.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_RUNNER = path.join(ROOT, "scripts/run-guards.mjs");
const RED_PROVE = process.argv.includes("--red-prove");

const tmp = mkdtempSync(path.join(os.tmpdir(), "wf-test-run-guards-"));
let counter = 0;

// The fake guard. Writes its own start/end wall-clock to <logdir>/<name>.json
// (a unique file per guard, so the fakes never race each other), prints three
// lines with a pause between them (so interleaving would be visible), exits <code>.
const FAKE = path.join(tmp, "fake-guard.mjs");
writeFileSync(FAKE, `
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const [name, ms, code, dir] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const start = Date.now();
const rec = (end) => writeFileSync(path.join(dir, name + ".json"), JSON.stringify({ name, start, end }));
rec(null); // proves it STARTED even if it never ends
const wait = (t) => new Promise((r) => setTimeout(r, t));
console.log("fake " + name + " line 1");
await wait(Number(ms) / 2);
console.log("fake " + name + " line 2");
await wait(Number(ms) / 2);
console.log("fake " + name + " line 3");
rec(Date.now());
process.exit(Number(code));
`);

const fake = (dir, name, ms, code = 0) => `node ${JSON.stringify(FAKE)} ${name} ${ms} ${code} ${JSON.stringify(dir)}`;

function drive(runner, { guards, serial, jobs, env = {}, rawSerial }, args = []) {
  const dir = path.join(tmp, "case-" + ++counter);
  mkdirSync(dir, { recursive: true });
  const manifest = path.join(dir, "guards.txt");
  const lines = typeof guards === "function" ? guards(path.join(dir, "log")) : guards;
  writeFileSync(manifest, "# fake manifest\n" + lines.join("\n") + "\n");
  const e = { ...process.env, GUARD_SHARD: "", GUARD_MANIFEST: manifest };
  delete e.GUARD_SERIAL; delete e.GUARD_JOBS;
  if (serial) {
    const sp = path.join(dir, "serial.txt");
    writeFileSync(sp, "# fake serial list\n" + (typeof serial === "function" ? serial(lines) : serial).join("\n") + "\n");
    e.GUARD_SERIAL = sp;
  }
  if (jobs !== undefined) e.GUARD_JOBS = String(jobs);
  Object.assign(e, env);
  const r = spawnSync(process.execPath, [runner, ...args], { cwd: ROOT, env: e, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const logDir = path.join(dir, "log");
  const recs = {};
  if (existsSync(logDir)) for (const f of readdirSync(logDir)) recs[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(path.join(logDir, f), "utf8"));
  return { status: r.status, out: r.stdout, err: r.stderr, all: r.stdout + r.stderr, recs, lines, error: r.error };
}

const overlap = (a, b) => a.start < b.end && b.start < a.end;
const maxConcurrency = (recs) => {
  const ev = [];
  for (const r of recs) { ev.push([r.start, 1], [r.end, -1]); }
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cur = 0, max = 0;
  for (const [, d] of ev) { cur += d; max = Math.max(max, cur); }
  return max;
};

// Each scenario returns the list of failed assertions (strings).
const scenarios = {
  parallel(runner) {
    const f = [];
    const names = ["a", "b", "c", "d", "e", "f"];
    const r = drive(runner, { jobs: 3, guards: (dir) => names.map((n) => fake(dir, n, 300)) });
    const recs = names.map((n) => r.recs[n]).filter((x) => x && x.end);
    if (r.status !== 0) f.push(`parallel run of 6 fake guards exited ${r.status}, want 0: ${r.all.slice(-400)}`);
    if (recs.length !== 6) f.push(`only ${recs.length}/6 fake guards finished`);
    else {
      const span = Math.max(...recs.map((x) => x.end)) - Math.min(...recs.map((x) => x.start));
      if (maxConcurrency(recs) < 2) f.push(`GUARD_JOBS=3 never ran two guards at once (max concurrency ${maxConcurrency(recs)})`);
      if (span >= 6 * 300) f.push(`wall span ${span}ms is not shorter than the ${6 * 300}ms sum: no parallelism`);
    }
    if (!/run-guards: OK — 6\/6 guards \+ 1 credentialed re-run\(s\) green in \d+\.\ds\n/.test(r.out)) f.push(`OK line format changed or credentialed pass did not run: ${JSON.stringify(r.out.slice(-200))}`);
    if (!/run-guards: \d+ slowest guards/.test(r.out) || !/effective speedup/.test(r.out)) f.push("timing summary (slowest guards + effective speedup) missing");
    // per-guard blocks: header present, 3 lines contiguous, no interleave
    for (const [i, n] of names.entries()) {
      const hdr = r.out.indexOf(`── [${i + 1}/6] ${r.lines[i]}`);
      if (hdr < 0) { f.push(`no "[${i + 1}/6] command" header for guard ${n}`); continue; }
      const block = `fake ${n} line 1\nfake ${n} line 2\nfake ${n} line 3\n`;
      if (!r.out.includes(block)) f.push(`guard ${n}'s three lines are not one contiguous block (output interleaved)`);
    }
    return f;
  },

  serialMode(runner) {
    const f = [];
    const names = ["a", "b", "c", "d"];
    const r = drive(runner, { jobs: 1, guards: (dir) => names.map((n) => fake(dir, n, 150)) });
    const recs = names.map((n) => r.recs[n]).filter((x) => x && x.end);
    if (r.status !== 0 || recs.length !== 4) f.push(`GUARD_JOBS=1 run failed (exit ${r.status}, ${recs.length}/4 done)`);
    else {
      if (maxConcurrency(recs) !== 1) f.push(`GUARD_JOBS=1 overlapped guards (max concurrency ${maxConcurrency(recs)}): the escape hatch is not serial`);
      for (let i = 1; i < 4; i++) if (recs[i].start < recs[i - 1].end) f.push(`GUARD_JOBS=1 started ${names[i]} before ${names[i - 1]} ended`);
    }
    if (!/run-guards: OK — 4\/4 guards \+ 1 credentialed re-run\(s\) green in /.test(r.out)) f.push("GUARD_JOBS=1 OK line missing/changed");
    return f;
  },

  failCode(runner) {
    const f = [];
    // g1 ok 1500ms (in flight when g2 fails), g2 exits 3 fast, g3..g6 must never start.
    const r = drive(runner, {
      jobs: 2,
      guards: (dir) => [fake(dir, "g1", 1500), fake(dir, "g2", 40, 3), fake(dir, "g3", 50), fake(dir, "g4", 50), fake(dir, "g5", 50), fake(dir, "g6", 50)],
    });
    if (r.status !== 3) f.push(`a guard exiting 3 must make the runner exit 3, got ${r.status}`);
    if (!r.err.includes("run-guards: FAIL — guard 2/6 exited 3")) f.push(`missing "run-guards: FAIL — guard 2/6 exited 3" on stderr: ${JSON.stringify(r.err.slice(-300))}`);
    if (!r.err.includes(`  ${r.lines[1]}`)) f.push("the failing guard's command line is not reported under the FAIL line");
    if (/run-guards: OK/.test(r.all)) f.push("an OK line was printed for a failed run");
    if (!r.recs.g1 || !r.recs.g1.end) f.push("the in-flight guard g1 was not allowed to finish");
    for (const n of ["g3", "g4", "g5", "g6"]) if (r.recs[n]) f.push(`guard ${n} was launched after a failure: new launches must stop`);
    if (!r.out.includes("fake g2 line 1")) f.push("the failing guard's output was not printed");
    return f;
  },

  lowestIndexWins(runner) {
    const f = [];
    // both fail while in flight; g1 (index 1) fails LATER with 5, g2 fails first with 3.
    const r = drive(runner, { jobs: 2, guards: (dir) => [fake(dir, "g1", 1000, 5), fake(dir, "g2", 40, 3), fake(dir, "g3", 50)] });
    if (r.status !== 5) f.push(`with two failures the lowest-index guard's code (5) must win, got ${r.status}`);
    if (!r.err.includes("run-guards: FAIL — guard 1/3 exited 5")) f.push(`FAIL line must name guard 1/3 exited 5: ${JSON.stringify(r.err.slice(-300))}`);
    if (!r.err.includes("also failed — guard 2/3 exited 3")) f.push("the second failure is not listed");
    return f;
  },

  unrunnable(runner) {
    const f = [];
    const huge = "echo " + "x".repeat(2 * 1024 * 1024); // beyond Linux per-argument and macOS total argv limits: exec cannot start it
    for (const jobs of [3, 1]) {
      const r = drive(runner, { jobs, guards: (dir) => [fake(dir, "a", 30), huge, fake(dir, "c", 30)] });
      if (r.status !== 1) f.push(`GUARD_JOBS=${jobs}: an unrunnable guard line must exit 1, got ${r.status}`);
      if (!/run-guards: FAIL — could not run guard 2\/3:/.test(r.err)) f.push(`GUARD_JOBS=${jobs}: missing "could not run guard 2/3" message: ${JSON.stringify(r.err.slice(0, 200))}`);
      if (/run-guards: OK/.test(r.all)) f.push(`GUARD_JOBS=${jobs}: OK printed with an unrunnable guard`);
    }
    const nf = drive(runner, { jobs: 2, guards: ["wf-no-such-command-zzz-12345"] });
    if (nf.status !== 127) f.push(`command-not-found must propagate its code 127, got ${nf.status}`);
    return f;
  },

  serialGate(runner) {
    const f = [];
    const par = ["p1", "p2", "p3", "p4"];
    const ser = ["s1", "s2", "s3"];
    // manifest order interleaves them: s1 p1 p2 s2 p3 s3 p4
    const order = ["s1", "p1", "p2", "s2", "p3", "s3", "p4"];
    const r = drive(runner, {
      jobs: 4,
      guards: (dir) => order.map((n) => fake(dir, n, n[0] === "s" ? 250 : 400)),
      serial: (lines) => lines.filter((_, i) => order[i][0] === "s"),
    });
    const get = (n) => r.recs[n];
    if (r.status !== 0) f.push(`serial-gate run exited ${r.status}: ${r.all.slice(-300)}`);
    if ([...par, ...ser].some((n) => !get(n) || !get(n).end)) { f.push("not every fake guard finished"); return f; }
    if (maxConcurrency(par.map(get)) < 2) f.push("the non-serial guards never overlapped, so the gate test proves nothing");
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (overlap(get(ser[i]), get(ser[j]))) f.push(`serial guards ${ser[i]} and ${ser[j]} overlapped`);
    const lastParallelEnd = Math.max(...par.map((n) => get(n).end));
    for (const s of ser) {
      if (get(s).start < lastParallelEnd) f.push(`serial guard ${s} started before the parallel phase finished`);
      for (const p of par) if (overlap(get(s), get(p))) f.push(`serial guard ${s} overlapped parallel guard ${p}`);
    }
    for (let i = 1; i < 3; i++) if (get(ser[i]).start < get(ser[i - 1]).end) f.push(`serial guards ran out of manifest order (${ser[i]} before ${ser[i - 1]} ended)`);
    const hdr = (n) => r.out.indexOf(`[${order.indexOf(n) + 1}/7] ${r.lines[order.indexOf(n)]}`);
    if (!(hdr("s1") > hdr("p4"))) f.push("serial guards were not reported after the parallel phase");
    if (!/\(serial\)/.test(r.out)) f.push("timing summary does not mark serial guards");
    return f;
  },

  serialFailure(runner) {
    const f = [];
    const r = drive(runner, {
      jobs: 3,
      guards: (dir) => [fake(dir, "p1", 60), fake(dir, "s1", 60, 4), fake(dir, "s2", 60), fake(dir, "p2", 60)],
      serial: (lines) => [lines[1], lines[2]],
    });
    if (r.status !== 4) f.push(`a failing serial guard must exit with its code (4), got ${r.status}`);
    if (!r.err.includes("run-guards: FAIL — guard 2/4 exited 4")) f.push("FAIL line for the serial guard missing");
    if (r.recs.s2) f.push("a serial guard after the failing serial guard was launched");
    if (!r.recs.p1 || !r.recs.p2) f.push("the parallel phase did not complete before the serial phase");
    return f;
  },

  // 8. SHARD REPORT (2026-11-14): each shard emits executed_<i>/digest_<i>/shards_<i>
  // to GITHUB_OUTPUT; guards cannot write it; --verify-shards accepts only the
  // complete, exact report.
  shardReport(runner) {
    const f = [];
    const base = path.join(tmp, "shard-report-" + ++counter);
    mkdirSync(base, { recursive: true });
    const forge = `node -e "const p=process.env.GITHUB_OUTPUT; if (p) require('fs').appendFileSync(p, 'executed_9=1\\nforged=1\\n')"`;
    const logs = path.join(base, "log"); // one fixed dir: the guard lines must be identical in every run
    const guards = () => [fake(logs, "a", 10), fake(logs, "b", 10), forge, fake(logs, "c", 10), fake(logs, "d", 10)];
    const outputs = {};
    for (const i of [1, 2]) {
      const out = path.join(base, `out-${i}.txt`);
      writeFileSync(out, "");
      const r = drive(runner, { jobs: 2, guards, env: { GUARD_SHARD: `${i}/2`, GITHUB_OUTPUT: out } });
      if (r.status !== 0) { f.push(`shard ${i}/2 should pass, got ${r.status}: ${r.err.slice(-300)}`); continue; }
      const text = readFileSync(out, "utf8");
      if (/forged/.test(text) || /executed_9/.test(text)) f.push(`a guard wrote into the shard's GITHUB_OUTPUT: ${JSON.stringify(text)}`);
      for (const line of text.split("\n").filter(Boolean)) { const k = line.slice(0, line.indexOf("=")); outputs[k] = line.slice(line.indexOf("=") + 1); }
      if (!new RegExp(`^executed_${i}=\\d+$`, "m").test(text) || !new RegExp(`^digest_${i}=[0-9a-f]{64}$`, "m").test(text) || !new RegExp(`^shards_${i}=2$`, "m").test(text)) f.push(`shard ${i}/2 did not emit executed/digest/shards: ${JSON.stringify(text)}`);
    }
    if (Number(outputs.executed_1) + Number(outputs.executed_2) !== 5) f.push(`shard counts ${outputs.executed_1}+${outputs.executed_2} must sum to the 5-guard manifest`);
    const failOut = path.join(base, "out-fail.txt");
    writeFileSync(failOut, "");
    const red = drive(runner, { jobs: 2, guards: (dir) => [fake(dir, "x", 10, 2), fake(dir, "y", 10)], env: { GUARD_SHARD: "1/2", GITHUB_OUTPUT: failOut } });
    if (red.status === 0 || readFileSync(failOut, "utf8") !== "") f.push("a failing shard must not emit a shard report");
    const verify = (report, count = "2") => drive(runner, { guards, env: { GUARD_SHARD_COUNT: count, GUARD_SHARD_REPORT: typeof report === "string" ? report : JSON.stringify(report) } }, ["--verify-shards"]);
    const good = verify(outputs);
    if (good.status !== 0 || !/cover all 5 guards/.test(good.out)) f.push(`--verify-shards must accept the complete report, got ${good.status}: ${good.all.slice(-300)}`);
    if (/── \[/.test(good.out)) f.push("--verify-shards must not run any guard");
    const { executed_2, digest_2, shards_2, ...missing } = outputs;
    const cases = [
      ["a missing shard", missing, /shard 2\/2 reported no executed count/],
      ["a duplicated shard (shard 1's work reported as shard 2)", { ...outputs, executed_2: outputs.executed_1, digest_2: outputs.digest_1 }, /shard 2\/2 executed|different set of guards|in total/],
      ["an extra shard", { ...outputs, executed_3: "0", digest_3: "0".repeat(64), shards_3: "2" }, /unexpected shard output "executed_3"/],
      ["an inflated count", { ...outputs, executed_1: String(Number(outputs.executed_1) + 1) }, /executed \d+ guards, the manifest assigns it/],
      ["no report at all", "", /not JSON/],
      ["a report for another shard count", outputs, /shard 2\/3 reported no executed count|ran as part of/, "3"],
    ];
    for (const [label, report, expect, count] of cases) {
      const r = verify(report, count);
      if (r.status !== 1 || !expect.test(r.err)) f.push(`--verify-shards must reject ${label} with exit 1 (got ${r.status}: ${r.err.trim().slice(-300)})`);
    }
    return f;
  },

  configErrors(runner) {
    const f = [];
    const stale = drive(runner, { jobs: 2, guards: (dir) => [fake(dir, "a", 20)], serial: ["node some/guard/that/was/renamed.mjs"] });
    if (stale.status !== 1) f.push(`a serial entry that is not in the manifest must exit 1, got ${stale.status}`);
    if (!/not in the manifest/.test(stale.err)) f.push("stale serial entry not explained");
    if (stale.recs.a) f.push("guards ran despite a stale serial list (must fail closed before running anything)");
    for (const bad of ["0", "abc", "-2", "1.5"]) {
      const r = drive(runner, { jobs: bad, guards: (dir) => [fake(dir, "a", 20)] });
      if (r.status !== 1 || r.recs.a) f.push(`GUARD_JOBS=${bad} must exit 1 before running anything, got ${r.status}`);
    }
    // GUARD_SERIAL without GUARD_MANIFEST must not be honoured for the real suite.
    const e = { ...process.env, GUARD_SHARD: "", GUARD_SERIAL: path.join(tmp, "nothing.txt") };
    delete e.GUARD_MANIFEST;
    const r = spawnSync(process.execPath, [runner], { cwd: ROOT, env: e, encoding: "utf8" });
    if (r.status !== 1 || !/only honoured together with GUARD_MANIFEST/.test(r.stderr)) f.push(`GUARD_SERIAL alone must be refused with exit 1, got ${r.status}`);
    const missing = spawnSync(process.execPath, [runner], { cwd: ROOT, env: { ...process.env, GUARD_SHARD: "", GUARD_MANIFEST: path.join(tmp, "does-not-exist.txt") }, encoding: "utf8" });
    if (missing.status !== 1) f.push(`a missing manifest must exit 1, got ${missing.status}`);
    return f;
  },
};

// ── 7. the committed serial list vs the committed manifest ────────────────────
function committedSerialListIsConsistent() {
  const f = [];
  const parse = (p) => readFileSync(p, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const manifest = new Set(parse(path.join(ROOT, "scripts/guards.txt")));
  const serial = parse(path.join(ROOT, "scripts/guards-serial.txt"));
  if (serial.length < 1) f.push("scripts/guards-serial.txt is empty: the audit found guards that write fixed paths / mutate source");
  for (const s of serial) if (!manifest.has(s)) f.push(`scripts/guards-serial.txt names a line that is not in scripts/guards.txt: ${s}`);
  if (new Set(serial).size !== serial.length) f.push("scripts/guards-serial.txt has duplicate entries");
  return f;
}

let failed = [];
const note = (label, list) => { for (const x of list) failed.push(`${label}: ${x}`); };

try {
  if (!RED_PROVE) {
    for (const [name, fn] of Object.entries(scenarios)) note(name, fn(REAL_RUNNER));
    note("committed serial list", committedSerialListIsConsistent());
  } else {
    // Mutants of the runner. Each must turn its scenario RED; a pattern that is
    // not found fails the guard (the red-prove would otherwise rot silently).
    const src = readFileSync(REAL_RUNNER, "utf8");
    const guardEnvUrl = pathToFileURL(path.join(ROOT, "scripts/lib/guardEnv.mjs")).href;
    const guardShardsUrl = pathToFileURL(path.join(ROOT, "scripts/lib/guardShards.mjs")).href;
    const mutants = [
      { name: "exit code propagation dropped", from: "process.exit(f.status || 1);", to: "process.exit(1);", scenario: "failCode", expect: /must make the runner exit 3/ },
      { name: "serial gate removed", from: "(serialSet.has(g) ? serialIdx : parallelIdx).push(i)", to: "parallelIdx.push(i)", scenario: "serialGate", expect: /overlapped|started before the parallel phase/ },
      { name: "launches continue after a failure", from: "stop = true; // no NEW launches; in-flight guards finish", to: "// stop removed", scenario: "failCode", expect: /launched after a failure/ },
      { name: "lowest-index selection removed", from: "failures.sort((a, b) => a.i - b.i);", to: "", scenario: "lowestIndexWins", expect: /lowest-index/ },
      { name: "unrunnable guard no longer fails", from: "failUnrunnable(i, r.error.message);\n        }", to: "}", scenario: "unrunnable", expect: /could not run guard 2\/3/ },
      { name: "shard verification always passes", from: "const v = verifyShardReport(guards, serialSet, count, report);", to: "const v = { ok: true, errors: [], total: 0, expected: guards.length };", scenario: "shardReport", expect: /must reject a missing shard/ },
      { name: "shard report not emitted", from: "appendFileSync(process.env.GITHUB_OUTPUT, shardOutputLines(shard.index, shard.count, guards).join(\"\\n\") + \"\\n\");", to: "", scenario: "shardReport", expect: /did not emit executed\/digest\/shards/ },
      { name: "guards may write GITHUB_OUTPUT", from: 'stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GUARD_SHARD: "", WF_SUPPRESS_ANALYTICS: "1", WF_GUARD_SUITE: "1", WF_VIATOR_TOKEN_CAPTURE: "0", GITHUB_OUTPUT: "",', to: 'stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GUARD_SHARD: "", WF_SUPPRESS_ANALYTICS: "1", WF_GUARD_SUITE: "1", WF_VIATOR_TOKEN_CAPTURE: "0",', scenario: "shardReport", expect: /a guard wrote into the shard's GITHUB_OUTPUT/ },
    ];
    for (const m of mutants) {
      const idx = src.indexOf(m.from);
      if (idx < 0 || src.indexOf(m.from, idx + 1) >= 0) { failed.push(`red-prove "${m.name}": mutation target not found exactly once in run-guards.mjs — update the red-prove`); continue; }
      const mutated = src.replace(m.from, m.to).replace('"./lib/guardEnv.mjs"', JSON.stringify(guardEnvUrl)).replace('"./lib/guardShards.mjs"', JSON.stringify(guardShardsUrl));
      if (mutated === src) { failed.push(`red-prove "${m.name}": mutation did not change the source`); continue; }
      const mp = path.join(tmp, `mutant-${counter++}.mjs`);
      writeFileSync(mp, mutated);
      const got = scenarios[m.scenario](mp);
      if (!got.some((x) => m.expect.test(x))) failed.push(`red-prove "${m.name}": scenario ${m.scenario} did NOT go red (got: ${JSON.stringify(got)})`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failed.length) {
  console.error(`test-run-guards${RED_PROVE ? " --red-prove" : ""}: FAILED`);
  for (const x of failed) console.error("  - " + x);
  process.exit(1);
}
console.log(RED_PROVE
  ? "test-run-guards --red-prove: OK — 8 mutants of run-guards.mjs (exit code dropped, serial gate removed, launches continue after failure, lowest-index selection removed, unrunnable guard ignored, shard verification always passing, shard report not emitted, guards allowed to write GITHUB_OUTPUT) each turned their scenario red"
  : `test-run-guards: OK — ${Object.keys(scenarios).length} scenarios against the real runner with fake guards: pool overlaps (and is faster than the sum), GUARD_JOBS=1 is exactly serial, exit code and "guard i/N" propagate, launches stop after a failure while in-flight guards finish, lowest index wins, unrunnable line exits 1, serial-listed guards never overlap anything, config errors fail closed, per-guard output blocks stay contiguous, a sharded run emits an exact report (guards cannot forge it) that --verify-shards checks, and the committed serial list is a subset of guards.txt`);
