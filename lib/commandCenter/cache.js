// lib/commandCenter/cache.js — warm-lambda TTL cache with stale-on-error and
// in-flight dedupe. Same philosophy as lib/serverCache.js's memory layer, but
// scoped to Command Center reads (single owner; short TTLs; no Supabase tier —
// the aggregate RPCs are already cheap, this only absorbs refresh-storm and
// provider flap).
//
//   memTTL(key, ttlMs, loader) -> Promise<value>
//     • fresh hit  -> cached value
//     • miss       -> run loader (deduped across concurrent callers)
//     • loader err -> serve last-known value up to 10× TTL old (flagged stale)
//                     else rethrow

const MEM = globalThis.__wfCcMem || (globalThis.__wfCcMem = new Map());
const INFLIGHT = globalThis.__wfCcInflight || (globalThis.__wfCcInflight = new Map());

export async function memTTL(key, ttlMs, loader) {
  const now = Date.now();
  const hit = MEM.get(key);
  if (hit && hit.exp > now) return hit.value;

  if (INFLIGHT.has(key)) return INFLIGHT.get(key);
  const p = (async () => {
    try {
      const value = await loader();
      MEM.set(key, { value, exp: Date.now() + ttlMs, wrote: Date.now() });
      return value;
    } catch (e) {
      const stale = MEM.get(key);
      if (stale && Date.now() - stale.wrote < ttlMs * 10) {
        return typeof stale.value === "object" && stale.value !== null
          ? { ...stale.value, _stale: true }
          : stale.value;
      }
      throw e;
    } finally {
      INFLIGHT.delete(key);
      if (MEM.size > 500) {
        for (const [k, v] of MEM) { if (v.exp <= Date.now()) MEM.delete(k); }
      }
    }
  })();
  INFLIGHT.set(key, p);
  return p;
}
