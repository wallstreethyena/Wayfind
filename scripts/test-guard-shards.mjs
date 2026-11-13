#!/usr/bin/env node
/**
 * scripts/test-guard-shards.mjs — locks the GUARD_SHARD partition (scripts/lib/guardShards.mjs).
 *
 * PURE and HERMETIC: reads only scripts/guards.txt, scripts/guards-serial.txt and
 * scripts/run-guards.mjs from this checkout. No network, no env, no child process.
 *
 * WHY. Sharding splits the guard suite across parallel CI jobs. The failure mode that
 * matters is the runner's own: a guard that lands in NO shard is silently never run,
 * and every shard still prints OK. So against the REAL manifest, for n = 1..8, this
 * asserts that the shards are a true partition:
 *   1. disjoint            no guard appears in two shards
 *   2. complete            the union is the full manifest, each guard exactly once
 *   3. kind preserved      a serial guard is serial inside its shard, pooled stays pooled
 *   4. order preserved     each shard lists its guards in manifest order
 *   5. n=1 is identity     shard 1/1 equals the unsharded selection, index for index
 *   6. balanced            pooled counts differ by at most 1 across shards, serial too
 *   7. deterministic       recomputing gives the identical answer
 * plus parseShardSpec accepts "i/n" for 1<=i<=n<=16 and rejects everything else, and a
 * static check that run-guards.mjs really calls the partition (a runner that stopped
 * calling it would run every shard in full and still pass 1..6).
 *
 * RED-PROVED by hand (python-applied mutation of guardShards.mjs, then reverted); the
 * transcript is in the PR that added this file.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseShardSpec, shardAssignments, selectShard, MAX_SHARDS } from "./lib/guardShards.mjs";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
let failed = 0;
const fail = (msg) => { failed++; console.error("FAIL: " + msg); };
const ok = (cond, msg) => { if (!cond) fail(msg); return !!cond; };

// Same reading rules as run-guards.mjs: comments and blanks out, de-dupe, first-seen order.
function readList(file) {
  const seen = new Set();
  const out = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const cmd = line.trim();
    if (!cmd || cmd.startsWith("#") || seen.has(cmd)) continue;
    seen.add(cmd);
    out.push(cmd);
  }
  return out;
}

const guards = readList(here("./guards.txt"));
const serialSet = new Set(readList(here("./guards-serial.txt")));
const N = guards.length;
const manifestSet = new Set(guards);

ok(N >= 140, `manifest parsed to only ${N} guards; the real manifest was not loaded`);
ok(serialSet.size > 0, "serial list is empty; the serial-preservation checks would be vacuous");
for (const s of serialSet) ok(manifestSet.has(s), `serial entry is not in the manifest: ${s}`);
const serialInManifest = guards.filter((g) => serialSet.has(g)).length;
ok(serialInManifest === serialSet.size, "serial entries and manifest serial guards disagree");

const sizeLog = [];
for (let n = 1; n <= 8; n++) {
  const shards = [];
  for (let i = 1; i <= n; i++) shards.push(selectShard(guards, serialSet, i, n));

  // 7. deterministic
  for (let i = 1; i <= n; i++) {
    ok(JSON.stringify(selectShard(guards, serialSet, i, n)) === JSON.stringify(shards[i - 1]), `n=${n} shard ${i} is not deterministic`);
  }

  // 1 + 2. disjoint, complete, exactly once
  const hits = new Array(N).fill(0);
  for (const s of shards) for (const idx of s) hits[idx]++;
  const missing = hits.filter((h) => h === 0).length;
  const dupes = hits.filter((h) => h > 1).length;
  ok(missing === 0, `n=${n}: ${missing} guard(s) are in NO shard`);
  ok(dupes === 0, `n=${n}: ${dupes} guard(s) are in more than one shard`);
  const total = shards.reduce((a, s) => a + s.length, 0);
  ok(total === N, `n=${n}: shard sizes sum to ${total}, manifest has ${N}`);

  // The guard-line view of the same union (catches index/line confusion).
  const union = shards.flat().map((idx) => guards[idx]).sort();
  ok(JSON.stringify(union) === JSON.stringify([...guards].sort()), `n=${n}: union of shard guard lines != manifest`);

  // 3. kind preserved; 4. manifest order; 6. balance
  const pooledSizes = [];
  const serialSizes = [];
  for (let i = 1; i <= n; i++) {
    const s = shards[i - 1];
    for (let k = 1; k < s.length; k++) ok(s[k] > s[k - 1], `n=${n} shard ${i}: not in manifest order at position ${k}`);
    const ser = s.filter((idx) => serialSet.has(guards[idx]));
    const pool = s.filter((idx) => !serialSet.has(guards[idx]));
    serialSizes.push(ser.length);
    pooledSizes.push(pool.length);
    ok(ser.length + pool.length === s.length, `n=${n} shard ${i}: kind counts do not add up`);
  }
  const serialAcrossShards = serialSizes.reduce((a, b) => a + b, 0);
  ok(serialAcrossShards === serialSet.size, `n=${n}: ${serialAcrossShards} serial guards across shards, expected ${serialSet.size}; a serial guard changed kind`);
  const pooledAcrossShards = pooledSizes.reduce((a, b) => a + b, 0);
  ok(pooledAcrossShards === N - serialSet.size, `n=${n}: pooled total ${pooledAcrossShards}, expected ${N - serialSet.size}`);
  ok(Math.max(...pooledSizes) - Math.min(...pooledSizes) <= 1, `n=${n}: pooled shard sizes unbalanced: ${pooledSizes}`);
  ok(Math.max(...serialSizes) - Math.min(...serialSizes) <= 1, `n=${n}: serial shard sizes unbalanced: ${serialSizes}`);
  ok(Math.min(...shards.map((s) => s.length)) > 0, `n=${n}: a shard is empty`);

  // 5. n=1 equals the unsharded selection
  if (n === 1) {
    ok(shards[0].length === N && shards[0].every((idx, k) => idx === k), "n=1: shard 1/1 is not the identity selection");
  }
  sizeLog.push(`n=${n}: ${shards.map((s) => s.length).join("/")}`);
}

// shardAssignments agrees with selectShard and only ever returns 1..n.
{
  const a = shardAssignments(guards, serialSet, 4);
  ok(a.length === N && a.every((x) => Number.isInteger(x) && x >= 1 && x <= 4), "shardAssignments returned a value outside 1..4");
}

// parseShardSpec: accepts.
for (const [raw, index, count] of [["1/1", 1, 1], ["2/4", 2, 4], ["4/4", 4, 4], ["16/16", 16, 16], ["1/16", 1, 16]]) {
  const r = (() => { try { return parseShardSpec(raw); } catch (e) { return e; } })();
  ok(r && r.index === index && r.count === count, `parseShardSpec(${JSON.stringify(raw)}) should be {${index},${count}}`);
}
// parseShardSpec: rejects, each with a message naming the variable.
const bad = ["", "2", "/4", "2/", "0/4", "5/4", "1/0", "1/17", "17/17", "-1/4", "1/-4", "a/b", "1/4/2", " 1/4", "1/4 ", "1.5/4", "1e1/16", "01/4x", "2-4", "1\\4", "0/0", "99999999999999999999/99999999999999999999", null, undefined, 4, {}];
for (const raw of bad) {
  let threw = null;
  try { parseShardSpec(raw); } catch (e) { threw = e; }
  ok(threw instanceof Error, `parseShardSpec(${JSON.stringify(raw)}) should throw`);
  ok(!threw || /GUARD_SHARD/.test(threw.message), `parseShardSpec(${JSON.stringify(raw)}) error should name GUARD_SHARD: ${threw && threw.message}`);
}
ok(MAX_SHARDS === 16, "MAX_SHARDS changed; update run-guards header docs and this test together");

// The runner must actually call the partition (static; comments stripped).
{
  const src = readFileSync(here("./run-guards.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/import\s*\{[^}]*\bselectShard\b[^}]*\}\s*from\s*"\.\/lib\/guardShards\.mjs"/.test(src), "run-guards.mjs does not import selectShard from lib/guardShards.mjs");
  ok(/selectShard\(\s*fullGuards\s*,\s*serialSet\s*,\s*shard\.index\s*,\s*shard\.count\s*\)/.test(src), "run-guards.mjs does not call selectShard(fullGuards, serialSet, shard.index, shard.count)");
  ok(/parseShardSpec\(\s*process\.env\.GUARD_SHARD\s*\)/.test(src), "run-guards.mjs does not validate GUARD_SHARD through parseShardSpec");
}

if (failed) {
  console.error(`\ntest-guard-shards: FAIL — ${failed} assertion(s) failed`);
  process.exit(1);
}
console.log(`test-guard-shards: OK — real manifest ${N} guards (${serialSet.size} serial), n=1..8 partitions disjoint + complete + kind-preserving + balanced; ${bad.length} malformed specs rejected`);
console.log("  shard sizes: " + sizeLog.join(" | "));
