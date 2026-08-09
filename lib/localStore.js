// lib/localStore.js — the one place that knows a CACHE from a PREFERENCE.
//
// THE BUG THIS EXISTS FOR (owner, 2026-08-09, on a phone): "I had collapsed
// all of the menus, then navigated to my favorites, and when I went back to
// the home screen the menus were not like I left them."
//
// The preference was written. localStorage refused it. Measured on production
// before this file existed: 5,242,875 characters stored against a 5,242,880
// quota — five characters under the ceiling — so every setItem in the app was
// throwing QuotaExceededError, and all 54 of them are wrapped in a silent
// try/catch. The write LOOKS like it worked (React state updates, the section
// closes, the attribute on <html> even changes) and is gone on the next
// navigation. A silent catch around a write is how a broken preference
// impersonates a working one.
//
// AND IT WAS NEVER ONLY THE RAILS. On a full store the app quietly stops
// remembering FAVORITES, likes, dislikes, the chosen location, clipped
// coupons — every key in that list of 54. A reader who saves a place, comes
// back, and finds it gone does not come back a third time.
//
// WHAT FILLED IT, measured in the same session:
//
//   wfq_v1            4,189,930   80% of the whole budget, in ONE key
//   wf_sug_*            665,935   7 keys, one per (lat3, lng3, daypart, intent, wet)
//   wf_todo_*           186,470   3 keys, one per (lat3, lng3)
//   wf_hooks_v1_*        44,000   9 keys whose NAME is 20 pipe-joined Place IDs
//   wf_lines_v2/v3, wf_insights_v2/v3   dead epochs, never removed
//   ------------------------------------------------------------------------
//   the reader's own data (favorites, likes, taste, centre): under 10 KB
//
// Every one of those is a CACHE: refetchable, worth nothing if lost. They were
// bounded by ENTRY COUNT (wfq_v1 caps at 80 entries — at the measured ~80KB an
// entry that cap is 6.4MB, larger than the entire quota, so it can never be
// reached) or not bounded at all (`wf_sug_` keys on lat/lng to 3 decimals mint
// a new ~95KB entry every 110 metres the reader travels).
//
// Entry count is not the resource being spent. BYTES are. So the budget here
// is in bytes, the disposable families are declared rather than guessed, and a
// preference that meets a full store evicts cache and retries instead of
// failing quietly.
//
// THE LAW: a cache may never cost the reader a preference.
//
// The planner is a PURE function over a list of {key, chars, ts} so a guard can
// execute the law instead of grepping for it — same shape as lib/railCollapse.js.

// The de-facto localStorage quota in every browser that matters (5MB of UTF-16
// code units). Not a limit we set; a limit we are measured against.
export const QUOTA_CHARS = 5 * 1024 * 1024;

// What all disposable cache together may hold. The rest of the quota is
// headroom for the reader's own data plus whatever a page needs mid-session —
// deliberately generous, because the failure mode on the other side of this
// line is silent and expensive and the thing being protected costs nothing to
// refetch.
export const CACHE_BUDGET_CHARS = 2_200_000;

// The single-key query cache in lib/google.js holds a MAP of query -> {t, v}.
// It gets its own budget because it is shrunk in place rather than dropped:
// deleting it re-bills every Text Search the reader has already paid for.
export const QCACHE_BUDGET_CHARS = 900_000;

// ─── THE DECLARED CACHES ────────────────────────────────────────────────────
// Anything NOT matched here is the reader's data and is never touched, no
// matter how full the store is. Adding a cache to the app means adding it
// here; a cache that is not declared is a cache that grows forever.
//
//   keep       max number of keys this family may hold
//   map        the key holds {k: {t, v}} — shrink it in place, never delete it
//   versioned  the key ends in a schema version; only the highest one is live
export const DISPOSABLE = [
  { id: "qcache", rx: /^wfq_v1$/, keep: 1, map: true, budget: QCACHE_BUDGET_CHARS },
  { id: "sug", rx: /^wf_sug_/, keep: 4 },
  { id: "todo", rx: /^wf_todo_/, keep: 3 },
  { id: "hooks", rx: /^wf_hooks_v1_/, keep: 8 },
  { id: "revgeo", rx: /^wf_revgeo\|/, keep: 24 },
  { id: "lines", rx: /^wf_lines_v(\d+)$/, keep: 1, versioned: true },
  { id: "insights", rx: /^wf_insights_v(\d+)$/, keep: 1, versioned: true },
  { id: "cultground", rx: /^wf_cultground_v(\d+)$/, keep: 1, versioned: true },
];

export function familyOf(key) {
  for (const f of DISPOSABLE) if (f.rx.test(key)) return f;
  return null;
}

export function isDisposable(key) {
  return !!familyOf(key);
}

// The stored shapes carry their own age as `ts` (wf_sug_, wf_todo_) or `t`
// (wf_hooks_, wf_revgeo|). Read it off the head of the string rather than
// JSON.parse-ing a four-megabyte value to learn one number.
export function stampOf(raw) {
  if (typeof raw !== "string") return 0;
  const m = /"ts?"\s*:\s*(\d{10,})/.exec(raw.slice(0, 400));
  return m ? Number(m[1]) : 0;
}

// Worst first: the oldest goes before the newest, and with nothing to choose
// between them the bigger one goes, because it buys back more room per
// eviction. Undated entries sort as oldest — an entry that cannot say when it
// was written cannot claim to be fresh.
function worstFirst(a, b) {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return b.chars - a.chars;
}

/**
 * PURE. Decide what to drop. Never returns a key that is not disposable.
 *
 * entries  [{ key, chars, ts }] — every key in the store, cache or not
 * budget   the ceiling for disposable cache, in characters
 *
 * Returns { drop, trim, before, after } where `trim` names map-shaped caches
 * that are over their own budget and must be shrunk in place instead.
 */
export function planSweep(entries, budget = CACHE_BUDGET_CHARS) {
  const rows = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e.key === "string")
    .map((e) => ({ key: e.key, chars: Math.max(0, Number(e.chars) || 0), ts: Math.max(0, Number(e.ts) || 0), fam: familyOf(e.key) }));

  const before = rows.reduce((n, r) => n + r.chars, 0);
  const drop = [];
  const trim = [];
  const dropped = new Set();
  const kill = (r) => { if (!dropped.has(r.key)) { dropped.add(r.key); drop.push(r.key); } };

  // 1. DEAD SCHEMA VERSIONS. wf_lines_v2 sat next to wf_lines_v4 for months:
  //    nothing reads it and nothing was ever going to delete it. Only the
  //    highest version present is live.
  for (const f of DISPOSABLE) {
    if (!f.versioned) continue;
    const mine = rows.filter((r) => r.fam === f);
    if (mine.length < 2) continue;
    let top = -1;
    for (const r of mine) { const m = f.rx.exec(r.key); const v = m ? Number(m[1]) : -1; if (v > top) top = v; }
    for (const r of mine) { const m = f.rx.exec(r.key); if (!m || Number(m[1]) !== top) kill(r); }
  }

  // 2. PER-FAMILY KEY CAP. This is the bound the per-location caches never
  //    had — a reader crossing town minted a new 95KB key every 110 metres.
  for (const f of DISPOSABLE) {
    if (f.map) continue;
    const mine = rows.filter((r) => r.fam === f && !dropped.has(r.key)).sort(worstFirst);
    const over = mine.length - Math.max(0, f.keep | 0);
    for (let i = 0; i < over; i++) kill(mine[i]);
  }

  // 3. MAP-SHAPED CACHES over their own budget get SHRUNK, not deleted.
  for (const f of DISPOSABLE) {
    if (!f.map) continue;
    for (const r of rows) if (r.fam === f && !dropped.has(r.key) && r.chars > f.budget) trim.push({ key: r.key, budget: f.budget });
  }

  // 4. STILL OVER THE TOTAL. Evict worst-first across every family until the
  //    disposable half of the store fits its budget. A map cache counts at its
  //    trimmed size, because that is what it will occupy after step 3.
  const trimmedTo = new Map(trim.map((t) => [t.key, t.budget]));
  const sizeOf = (r) => (dropped.has(r.key) ? 0 : Math.min(r.chars, trimmedTo.has(r.key) ? trimmedTo.get(r.key) : r.chars));
  let cacheChars = rows.filter((r) => r.fam).reduce((n, r) => n + sizeOf(r), 0);
  if (cacheChars > budget) {
    const pool = rows.filter((r) => r.fam && !r.fam.map && !dropped.has(r.key)).sort(worstFirst);
    for (const r of pool) {
      if (cacheChars <= budget) break;
      cacheChars -= sizeOf(r);
      kill(r);
    }
  }

  const after = rows.reduce((n, r) => n + sizeOf(r), 0);
  return { drop, trim, before, after };
}

/**
 * PURE (mutating). Drop oldest entries from a {k: {t, v}} map until its
 * serialized form fits `budget`, and return that serialized form.
 *
 * Exported and pure so a guard can EXECUTE the byte bound rather than grep for
 * it. A structural check on the call site alone is decoration: rewriting the
 * comparison to `if (false)` leaves every keyword in place and the grep still
 * passes. This is the thing that actually has to be true, so this is the thing
 * that gets run.
 */
export function capMapToBudget(all, budget) {
  if (!all || typeof all !== "object" || Array.isArray(all)) return "{}";
  let out = JSON.stringify(all);
  if (out.length <= budget) return out;
  // Size each entry ONCE. Re-serialising the whole map after every delete is
  // O(n^2) in bytes: on the measured 52-entry, 4.19MB cache that is ~200MB of
  // string building, on the main thread, during mount. One sizing pass, one
  // batch delete, one final stringify.
  const keys = Object.keys(all);
  const size = {};
  for (const k of keys) { try { size[k] = JSON.stringify(all[k]).length + k.length + 4; } catch (e) { size[k] = 0; } }
  keys.sort((a, b) => (Number(all[a] && all[a].t) || 0) - (Number(all[b] && all[b].t) || 0));
  let total = out.length;
  let i = 0;
  while (total > budget && i < keys.length) { total -= size[keys[i]]; delete all[keys[i]]; i++; }
  out = JSON.stringify(all);
  // The per-entry estimate can only ever leave it slightly over. Finish exactly.
  while (out.length > budget && i < keys.length) { delete all[keys[i++]]; out = JSON.stringify(all); }
  return out;
}

// ─── THE BROWSER SIDE ───────────────────────────────────────────────────────
// Everything below is guarded and fails soft. app/components is server-rendered
// first and mounted by the render-smoke guards in plain node, where `window`
// does not exist at all.

function readAll() {
  const out = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key == null) continue;
      let raw = "";
      try { raw = window.localStorage.getItem(key) || ""; } catch (e) { raw = ""; }
      out.push({ key, chars: key.length + raw.length, ts: stampOf(raw) });
    }
  } catch (e) {}
  return out;
}

// Shrink a {k: {t, v}} cache to fit, oldest entry out first. Used instead of
// deleting, so the reader keeps the searches Google has already been paid for.
export function trimMapCache(key, budget) {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length <= budget) return false;
    const all = JSON.parse(raw);
    if (!all || typeof all !== "object" || Array.isArray(all)) { window.localStorage.removeItem(key); return true; }
    window.localStorage.setItem(key, capMapToBudget(all, budget));
    return true;
  } catch (e) {
    // A map cache we cannot parse or cannot rewrite is still occupying the
    // budget the reader's data needs. Drop it — it is a cache.
    try { window.localStorage.removeItem(key); } catch (e2) {}
    return true;
  }
}

/**
 * Bring the store back under budget. Cheap when there is nothing to do, and
 * safe to call on every page load — which is the point: the four-megabyte
 * wfq_v1 already sitting on every phone in the field cannot be fixed by a rule
 * that only applies to future writes, because on a full store there ARE no
 * future writes.
 */
export function sweepLocal(budget = CACHE_BUDGET_CHARS) {
  if (typeof window === "undefined") return { dropped: 0, before: 0, after: 0 };
  const entries = readAll();
  const plan = planSweep(entries, budget);
  for (const key of plan.drop) { try { window.localStorage.removeItem(key); } catch (e) {} }
  for (const t of plan.trim) trimMapCache(t.key, t.budget);
  return { dropped: plan.drop.length, trimmed: plan.trim.length, before: plan.before, after: plan.after };
}

function isQuotaError(e) {
  if (!e) return false;
  // Safari throws QUOTA_EXCEEDED_ERR (code 22) and, in private mode, a plain
  // QuotaExceededError with a zero quota; Firefox uses NS_ERROR_DOM_QUOTA_REACHED.
  return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014;
}

/**
 * Write a value the reader would notice losing. Returns true only if the value
 * is actually in the store afterwards — the whole point is that this cannot
 * lie the way a bare try/catch does.
 *
 * On a full store it evicts CACHE and retries. It never evicts anything that
 * is not a declared disposable family, so a preference can never cost another
 * preference.
 */
export function setLocal(key, value) {
  if (typeof window === "undefined" || !key) return false;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  try {
    window.localStorage.setItem(key, str);
    return true;
  } catch (e) {
    if (!isQuotaError(e)) return false;
  }
  sweepLocal();
  try {
    window.localStorage.setItem(key, str);
    return true;
  } catch (e) {
    if (!isQuotaError(e)) return false;
  }
  // Still no room, so the caches are already gone and something the reader
  // owns is what is left. Drop every declared cache outright — including the
  // map ones this normally protects — and take the last shot.
  try {
    for (const row of readAll()) if (isDisposable(row.key) && row.key !== key) window.localStorage.removeItem(row.key);
  } catch (e) {}
  try {
    window.localStorage.setItem(key, str);
    return true;
  } catch (e) {
    return false;
  }
}

export function getLocal(key, fallback = null) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : raw;
  } catch (e) {
    return fallback;
  }
}

// For diagnostics and for the guard: what the store currently costs.
export function usageChars() {
  return readAll().reduce((n, r) => n + r.chars, 0);
}
