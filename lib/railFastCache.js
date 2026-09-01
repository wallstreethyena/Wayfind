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
  try { held = await cache.get(key); } catch (_) { held = null; }
  const good = held && usable(held.value);
  if (good && Date.now() - Number(held.savedAt || 0) < FRESH_MS) {
    return { value: held.value, state: "hit" };
  }
  if (good) {
    const refresh = Promise.resolve()
      .then(loader)
      .then((value) => usable(value) ? writeGood(key, value, name) : undefined)
      .catch(() => undefined);
    try { waitUntil(refresh); } catch (_) { /* local/non-Vercel: stale is enough */ }
    return { value: held.value, state: "stale" };
  }
  const value = await loader();
  if (usable(value)) {
    try { await writeGood(key, value, name); } catch (_) { /* cache is an accelerator */ }
  }
  return { value, state: "miss" };
}
