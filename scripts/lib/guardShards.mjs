// scripts/lib/guardShards.mjs — deterministic sharding of the guard manifest.
//
// PURE: no fs, no env, no clock, no network (node:crypto only, for the digest). scripts/run-guards.mjs feeds it the
// already-parsed manifest and the serial set; scripts/test-guard-shards.mjs
// feeds it the real manifest and locks the contract below.
//
// WHY. CI splits the guard suite across N parallel jobs (GUARD_SHARD=i/n). The
// dangerous failure mode of any split is the same as the runner's own: silently
// running FEWER guards than the suite has. So the partition is a pure function
// of (manifest order, serial membership, n) and the test proves it is a true
// partition for n = 1..8: disjoint, and the union is the whole manifest once.
//
// THE FUNCTION. Pooled guards and serial guards are numbered SEPARATELY, each in
// manifest order, and the k-th of each kind (0-based) goes to shard (k % n) + 1.
// Numbering them separately spreads the serial guards (the slow, one-at-a-time
// tail) over every shard instead of letting them clump in one. A guard never
// changes kind: serial stays serial inside its shard.
//
// Adding or removing one guard shifts the guards after it by one shard. That is
// accepted: shards are balanced by count, not pinned, and nothing keys on them.

import { createHash } from "node:crypto";

export const MAX_SHARDS = 16;

/**
 * Parse a GUARD_SHARD value ("i/n", 1-based, 1 <= i <= n <= MAX_SHARDS).
 * Returns { index, count }. Throws an Error with a user-facing message on any
 * malformed value; the caller turns that into exit 1.
 */
export function parseShardSpec(raw) {
  if (typeof raw !== "string") {
    throw new Error(`GUARD_SHARD must be a string like "2/4", got ${JSON.stringify(raw)}.`);
  }
  const m = /^([0-9]+)\/([0-9]+)$/.exec(raw);
  if (!m) {
    throw new Error(`GUARD_SHARD must look like "i/n" (for example "2/4"), got ${JSON.stringify(raw)}.`);
  }
  const index = Number(m[1]);
  const count = Number(m[2]);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || count < 1 || count > MAX_SHARDS) {
    throw new Error(`GUARD_SHARD ${JSON.stringify(raw)}: n must be an integer from 1 to ${MAX_SHARDS}.`);
  }
  if (index < 1 || index > count) {
    throw new Error(`GUARD_SHARD ${JSON.stringify(raw)}: i must be an integer from 1 to n (${count}).`);
  }
  return { index, count };
}

/**
 * Shard number (1-based) of every guard, as an array parallel to `guards`.
 * `guards` is the de-duplicated manifest in order; `serialSet` a Set of exact
 * guard lines that must run alone.
 */
export function shardAssignments(guards, serialSet, count) {
  let pooled = 0;
  let serial = 0;
  return guards.map((g) => (serialSet.has(g) ? serial++ : pooled++) % count + 1);
}

/**
 * Manifest indices (ascending = manifest order) belonging to shard `index` of
 * `count`.
 */
export function selectShard(guards, serialSet, index, count) {
  const a = shardAssignments(guards, serialSet, count);
  const out = [];
  for (let i = 0; i < guards.length; i++) if (a[i] === index) out.push(i);
  return out;
}

// ── SHARD MULTIPLICITY (added 2026-11-14) ────────────────────────────────────
// Every shard job reports, through GITHUB_OUTPUT, how many guards it executed and
// a digest of exactly which ones (executed_<i>, digest_<i>, shards_<i>). The final
// "guards" job re-derives the partition from the checked-out manifest and accepts
// only a report in which every shard 1..n is present once, with exactly the count
// and the guard lines this function assigns it, so the counts sum to the manifest.
// A missing shard (cancelled, skipped, never scheduled), a duplicated one, a shard
// that ran another slice, or an extra shard index is red.


/** sha256 of the exact guard lines a shard executed, in execution order. */
export function shardDigest(lines) {
  return createHash("sha256").update(`wayfind-guard-shard/v1\n${lines.join("\n")}\n`).digest("hex");
}

/** The GITHUB_OUTPUT lines a successful shard run emits. */
export function shardOutputLines(index, count, lines) {
  return [`executed_${index}=${lines.length}`, `digest_${index}=${shardDigest(lines)}`, `shards_${index}=${count}`];
}

/**
 * Judge the merged job outputs of all shard jobs (`needs.shard.outputs`, a flat
 * object) against the manifest. Returns { ok, errors, total, expected }.
 */
export function verifyShardReport(guards, serialSet, count, report) {
  const errors = [];
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SHARDS) {
    return { ok: false, errors: [`shard count must be 1..${MAX_SHARDS}, got ${JSON.stringify(count)}`], total: 0, expected: guards.length };
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { ok: false, errors: ["no shard report (the shard jobs emitted no outputs)"], total: 0, expected: guards.length };
  }
  const allowed = new Set();
  let total = 0;
  for (let i = 1; i <= count; i++) {
    for (const k of ["executed", "digest", "shards"]) allowed.add(`${k}_${i}`);
    const lines = selectShard(guards, serialSet, i, count).map((j) => guards[j]);
    const raw = report[`executed_${i}`];
    if (raw === undefined || raw === null || raw === "") { errors.push(`shard ${i}/${count} reported no executed count (missing, cancelled or skipped)`); continue; }
    if (!/^(0|[1-9][0-9]*)$/.test(String(raw))) { errors.push(`shard ${i}/${count} reported a malformed count ${JSON.stringify(raw)}`); continue; }
    const executed = Number(raw);
    total += executed;
    if (executed !== lines.length) errors.push(`shard ${i}/${count} executed ${executed} guards, the manifest assigns it ${lines.length}`);
    if (String(report[`shards_${i}`]) !== String(count)) errors.push(`shard ${i} ran as part of ${JSON.stringify(report[`shards_${i}`])} shards, expected ${count}`);
    if (report[`digest_${i}`] !== shardDigest(lines)) errors.push(`shard ${i}/${count} executed a different set of guards than the manifest assigns it (digest mismatch)`);
  }
  for (const k of Object.keys(report)) {
    if (!allowed.has(k) && /^(executed|digest|shards)_/.test(k)) errors.push(`unexpected shard output "${k}" (a shard outside 1..${count} ran)`);
  }
  if (total !== guards.length) errors.push(`shards executed ${total} guards in total, the manifest has ${guards.length}`);
  return { ok: errors.length === 0, errors, total, expected: guards.length };
}
