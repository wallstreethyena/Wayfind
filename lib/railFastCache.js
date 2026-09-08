// Shared, stale-safe cache for public location-shaped rail answers.
//
// CDN caching is still the first layer. This second layer matters when a new
// URL, deployment or function instance misses the CDN: a first-time visitor
// should receive the most recent good answer while inventory refreshes, not
// watch a database timeout. Nothing user-specific belongs in this cache.
import { getCache, waitUntil } from "@vercel/functions";

const cache = getCache({ namespace: "wayfind-rail-answers-v1" });
const FRESH_MS = 60 * 60 * 1000;
const KEEP_SECONDS = 7 * 24 * 60 * 60;
const CACHE_READ_DEADLINE_MS = 500;
// Concurrent cold visitors to the same cell share its inventory work. A
// failed build is removed too, allowing the next request to recover.
const inFlight = new Map();
const SHARE_LOAD_MS = 20000;

function loadOnce(key, loader) {
  // A stalled loader must not become a permanent in-memory failure for this
  // cell. Expire references even when the upstream promise never settles.
  const now = Date.now();
  for (const [heldKey, held] of inFlight) {
    if (now - held.started >= SHARE_LOAD_MS) inFlight.delete(heldKey);
  }
  if (inFlight.has(key)) return inFlight.get(key).pending;
  const pending = Promise.resolve().then(loader).finally(() => {
    if (inFlight.get(key)?.pending === pending) inFlight.delete(key);
  });
  inFlight.set(key, { pending, started: now });
  return pending;
}

function within(promise, timeoutMs, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), timeoutMs);
    Promise.resolve(promise).then(finish, () => finish(fallback));
  });
}

function scheduleWrite(key, value, name) {
  const write = within(writeGood(key, value, name), 1500, undefined);
  try { waitUntil(write); } catch (_) { /* local/non-Vercel: best effort */ }
}

export const geoCell = (value, digits = 2) => Number(value).toFixed(digits);

async function writeGood(key, value, name) {
  if (value == null) return;
  await cache.set(key, { savedAt: Date.now(), value }, {
    ttl: KEEP_SECONDS,
    tags: ["rail-answers"],
    name,
  });
}

/**
 * Return a fresh shared answer, or a stale good answer while it refreshes.
 * On a true cold miss the loader remains authoritative and its error bubbles.
 */
/**
 * A `usable` combinator: an INCOMPLETE answer is never cached as the truth.
 *
 * v8.98j (owner review, 2026-09-06). lib/ownedPool.js sets `degraded` when a
 * pool is partial — one category's read failed, or the row cap was hit with the
 * caller's consent. Serving the surviving categories is deliberate: one stalled
 * category must not blank every shelf, and test-night-out-intent locks that. But
 * a partial answer is a fact about the DATABASE, not about the reader's town, and
 * fastCachedRail's contract is that an unusable value is returned to this caller
 * and NOT written to the cache. So a degraded answer reaches the person who
 * asked and expires with their request, instead of being pinned on every reader
 * in the cell for an hour.
 *
 * This is the same rule /api/rails carries as v8.74 and that date-night's route
 * documents in prose. It exists as a function so a guard can assert that every
 * route goes through it rather than each restating the check.
 *
 *   usable: completeAnswersOnly((v) => v.rails.some((r) => r.places.length))
 *
 * The route must ALSO send `cache-control: no-store` for a degraded answer —
 * this only governs Wayfind's own accelerator, not the CDN.
 *
 * IT REQUIRES AN EXPLICIT `degraded: false`, AND THAT IS THE WHOLE POINT
 * (owner review, 2026-09-06). The first version rejected `degraded === true`
 * and ACCEPTED an answer with no such field — which is every entry written
 * before this shipped. The namespace and every key are unchanged, and entries
 * live for KEEP_SECONDS (seven days), so a partial answer cached minutes before
 * the deploy would have been read back, passed the check by omission, and served
 * as healthy for the rest of its life. New copies correct, old copies still in
 * the drawer.
 *
 * Requiring the field is stricter than a key bump and needs no coordination: an
 * entry from the old code cannot assert something the old code never wrote, so
 * it is rebuilt on first read. It also fails in the safe direction — a route
 * that forgets to set the field caches NOTHING and stays correct while getting
 * slower, rather than caching something it cannot vouch for. check-identity-
 * before-cap asserts every one of the five surfaces sets it.
 */
export function completeAnswersOnly(inner) {
  const test = typeof inner === "function" ? inner : Boolean;
  return (value) => {
    if (!value || value.degraded !== false) return false;
    return !!test(value);
  };
}

export async function fastCachedRail(key, loader, { name = "rail-answer", usable = Boolean } = {}) {
  // Keep the original read alive after the quick-hit budget. A slow cache is
  // not an empty cache: its exact-key good answer can still beat a cold build.
  const read = Promise.resolve().then(() => cache.get(key)).catch(() => null);
  const valid = (entry) => entry && usable(entry.value)
    && Number.isFinite(entry.savedAt) && Date.now() >= entry.savedAt
    && Date.now() - entry.savedAt < KEEP_SECONDS * 1000;
  const held = await within(read, CACHE_READ_DEADLINE_MS, null);
  const good = valid(held);
  if (good && Date.now() - Number(held.savedAt || 0) < FRESH_MS) {
    return { value: held.value, state: "hit" };
  }
  if (good) {
    const refresh = loadOnce(key, loader)
      .then((value) => usable(value) ? within(writeGood(key, value, name), 1500, undefined) : undefined)
      .catch(() => undefined);
    try { waitUntil(refresh); } catch (_) { /* local/non-Vercel: stale is enough */ }
    return { value: held.value, state: "stale" };
  }
  const build = loadOnce(key, loader).then((value) => {
    if (usable(value)) scheduleWrite(key, value, name);
    return { value, state: "miss" };
  });
  // Register the build even if the delayed cache wins. Failed output is never
  // written over the last good answer; a failed cache read cannot win the race.
  try { waitUntil(build.catch(() => undefined)); } catch (_) { /* local */ }
  const delayedHit = read.then((entry) => valid(entry)
    ? { value: entry.value, state: "late-hit" }
    : new Promise(() => {}));
  return Promise.race([build, delayedHit]);
}
