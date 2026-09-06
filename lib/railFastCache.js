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
 */
export function completeAnswersOnly(inner) {
  const test = typeof inner === "function" ? inner : Boolean;
  return (value) => {
    if (!value || value.degraded === true) return false;
    return !!test(value);
  };
}

export async function fastCachedRail(key, loader, { name = "rail-answer", usable = Boolean } = {}) {
  let held;
  try { held = await within(cache.get(key), CACHE_READ_DEADLINE_MS, null); } catch (_) { held = null; }
  const good = held && usable(held.value);
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
  const value = await loadOnce(key, loader);
  if (usable(value)) {
    // Cache persistence is not part of the reader's answer. Awaiting this on a
    // cold miss put a successful 9s rail build behind an unbounded cache write
    // and pushed /api/rails into Vercel's 12s kill. The response can leave as
    // soon as the data exists; waitUntil finishes the accelerator afterward.
    scheduleWrite(key, value, name);
  }
  return { value, state: "miss" };
}
