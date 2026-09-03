// lib/ownedLibrary.js — THE NO-RE-BUY LAW, stated once, in code.
//
// Owner, 2026-09-03: "The whole point was not to re-buy. It was to keep it at
// no cost, because we created our own enriched library."
//
// This module is the single place that law lives, so a future session cannot
// mistake the older refresh-ahead machinery for something that should be
// switched back on. scripts/check-owned-library-no-rebuy.mjs asserts every
// clause below — by call where the thing can be executed, structurally where
// it cannot — and goes red the moment any of them stops being true.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LAW
//
//  1. wf_inventory is the OWNED LIBRARY and it is PERMANENT. A card that was
//     promoted into it is never expired, aged out, or re-purchased. The rails
//     serve it with NO freshness check (lib/inventoryServe.rankInventory has
//     no refreshed_at predicate — asserted by call with a 400-day-old row).
//
//  2. Google is paid ONCE, at discovery. Text search finds ids; the promotion
//     drain buys each place's details a single time (metered, per place,
//     lib/spendGate + wf_spend_ledger); the row lands in wf_inventory with
//     OUR editorial, OUR photo reference, OUR category and the signals we
//     captured. From then on the card is ours.
//
//  3. Scheduled RE-BUYS are OFF in free mode, ON PURPOSE. Three jobs exist
//     that would re-fetch Google content to reset a 30-day clock —
//     /api/places/refresh (the v6.35 refresh-ahead worker that the jittered
//     `due` flag pokes), /api/cron/inventory-refresh (v8.12), and
//     /api/cron/atlas-build's Places reads. Each one short-circuits on
//     gateFree() before it can spend. The jitter itself (serverCache
//     refreshAgeFor / refreshDue) still runs — it is pure math and costs
//     nothing — but the poke it fires lands on a worker that says "skipped".
//     That is the intended state, not a bug. Do not "fix" it by letting the
//     worker take a ledger grant: that is re-buying with extra steps.
//
//  4. OWNED SIGNALS FILL WHAT THE FREE TIER LEAVES OUT. Free mode buys text
//     search with the Pro mask (no rating, no review count). Before those
//     lean results are cached or served, mergeOwnedSignals() lays our
//     library's rating / review count / status onto every place we already
//     own (app/api/places/search enrichFromInventory). Google discovers,
//     Wayfind supplies quality. Measured 2026-09-03: 1,293 free-mode search
//     answers since 2026-08-25, 16,111 place slots, 96.9% carrying an owned
//     rating; September to date 100%.
//
//  5. THE RICH CACHE IS READ BEFORE ANY GATE. A warm v1 row (fresh or stale
//     inside STALE_MAX_MS) answers a free-mode search before the ledger is
//     even consulted. Zero spend, instant.
//
//  6. WHAT "NEVER GOES OLD" DOES NOT MEAN. The card, the editorial, the photo
//     reference, the category and the place id are ours forever. The rating
//     and review count in `signals` were captured from Google at promotion
//     time and are not renewed for free (the no-charge IDs-only SKU does not
//     return them). Whether an owned library may keep deriving a Wayfind
//     Score from numbers older than Google's 30-day content window is a
//     terms-of-service question for the owner and counsel — not an
//     engineering decision, and not a reason to re-buy.
//
// ─────────────────────────────────────────────────────────────────────────────

/** The three metered re-buy paths that free mode keeps switched off. */
export const REBUY_PATHS_OFF_IN_FREE_MODE = Object.freeze([
  "app/api/places/refresh/route.js",
  "app/api/cron/inventory-refresh/route.js",
  "app/api/cron/atlas-build/route.js",
]);

/**
 * Lay OWNED quality signals from wf_inventory rows onto lean Google results.
 * Pure: mutates `places` in place and returns how many were enriched. A place
 * we do not own is left lean (lib/score.hasScoreSignal then hides its chip —
 * an honest blank, never an invented number). Owned values never overwrite a
 * value Google supplied on this call.
 *
 * @param {Array<{id:string, rating?:number, userRatingCount?:number, businessStatus?:string}>} places
 * @param {Array<{place_id:string, status?:string, signals?:{rating?:number, reviews?:number}}>} rows
 * @returns {number} count of places that received at least one owned value
 */
export function mergeOwnedSignals(places, rows) {
  if (!Array.isArray(places) || !places.length) return 0;
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) if (row && typeof row.place_id === "string") byId.set(row.place_id, row);
  let enriched = 0;
  for (const p of places) {
    const row = p && byId.get(p.id);
    if (!row) continue;
    const sig = row.signals || {};
    let touched = false;
    if (p.rating == null && typeof sig.rating === "number") { p.rating = sig.rating; touched = true; }
    if (p.userRatingCount == null && typeof sig.reviews === "number") { p.userRatingCount = sig.reviews; touched = true; }
    if (!p.businessStatus && row.status) { p.businessStatus = row.status; touched = true; }
    if (touched) enriched++;
  }
  return enriched;
}

/** Ids safe to place in a PostgREST in.() list — Google place ids only. */
export function ownedLookupIds(places) {
  return (Array.isArray(places) ? places : [])
    .map((p) => p && p.id)
    .filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(id));
}
