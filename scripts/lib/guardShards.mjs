// scripts/lib/guardShards.mjs — deterministic sharding of the guard manifest.
//
// PURE: no fs, no env, no clock, no network. scripts/run-guards.mjs feeds it the
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
