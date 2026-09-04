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
export async function fastCachedRail(key, loader, { name = "rail-answer", usable = Boolean } = {}) {
  let held;
  try { held = await within(cache.get(key), CACHE_READ_DEADLINE_MS, null); } catch (_) { held = null; }
  const good = held && usable(held.value);
  if (good && Date.now() - Number(held.savedAt || 0) < FRESH_MS) {
    return { value: held.value, state: "hit" };
  }
  if (good) {
    const refresh = Promise.resolve()
      .then(loader)
      .then((value) => usable(value) ? within(writeGood(key, value, name), 1500, undefined) : undefined)
      .catch(() => undefined);
    try { waitUntil(refresh); } catch (_) { /* local/non-Vercel: stale is enough */ }
    return { value: held.value, state: "stale" };
  }
  const value = await loader();
  if (usable(value)) {
    // Cache persistence is not part of the reader's answer. Awaiting this on a
    // cold miss put a successful 9s rail build behind an unbounded cache write
    // and pushed /api/rails into Vercel's 12s kill. The response can leave as
    // soon as the data exists; waitUntil finishes the accelerator afterward.
    scheduleWrite(key, value, name);
  }
  return { value, state: "miss" };
}
