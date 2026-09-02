// lib/inventoryReadCache.js — SERVER-ONLY. A per-request memo for wf_inventory
// geo reads.
//
// WO8 (2026-09-02) — PRODUCTION PERF REGRESSION. railMenuData's cold compute
// fans out to ~30 wf_inventory reads across loadPools (cats x cities),
// buildNearbyPool and buildIdentityPool. Today, with the app's current
// radii/type filters, no two of those reads share an exact box+category+field
// set — but the pool builders are independent code that will keep growing
// (a new identity rail, a new neighbour town), and the day two of them DO ask
// for the same box, this is what stops the second one from paying for it
// again. One cache instance is created ONCE per loadRailPlaces() call (never
// shared across requests — a stale-across-requests cache is a different, and
// much more dangerous, bug) and threaded down through opts.readCache.
//
// KEYED BY THE CALLER, NOT HERE. This module has no opinion about what makes
// two reads "the same" — each call site builds its own key from the fields
// that actually change its query (box, category, radius, type filter,
// editorial-or-not). That keeps this file trivial and keeps the cache-key
// logic sitting next to the query it describes, where a future edit to the
// query is most likely to also touch the key.
//
// CACHES THE PROMISE, NOT JUST THE RESULT. Two concurrent callers with the
// same key (the common case — everything in a Promise.all wave starts before
// anything resolves) must collapse into ONE network call, not just avoid a
// second SEQUENTIAL one. Storing the in-flight promise does that for free.
export function makeReadCache() {
  const map = new Map();
  return {
    /** Returns the cached promise for `key`, or runs `fetcher()` once and caches it. */
    get(key, fetcher) {
      if (map.has(key)) return map.get(key);
      const p = Promise.resolve().then(fetcher);
      map.set(key, p);
      return p;
    },
    size() { return map.size; },
    keys() { return [...map.keys()]; },
  };
}
