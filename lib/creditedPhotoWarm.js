// lib/creditedPhotoWarm.js — give chosen venues a Google photo that is cached
// AND credited, under the SAME photo name, so blog.gowayfind.com and the
// guides can show it with the photographer credit Google requires.
//
// WHY (2026-10-07). The blog/guide readers show a Google photo only when a live
// wf_photo_credit row exists for the EXACT photo name that the free cache holds
// (`photo|<name>|640` in wf_places_cache). Google photo names are not stable,
// so a venue whose cached photo has no credit for that name can never be
// credited later for free. This module makes the pair on purpose:
//
//   Place Details, fields=photos   Essentials (IDs Only): $0, unlimited; metered
//                                  here as `details_ids_only` (cap 9,500)
//   -> first photo's name + authorAttributions + googleMapsUri
//   Place Photos media, 640px      "Place Details Photos": $7 / 1,000, first
//                                  1,000 per month free; ledger SKU `photos`
//   -> cache write photo|<name>|640 AND wf_photo_credit row for that name.
//
// Both Google requests are made by lib/placePhotoServe.js defaultFetchOwnedUri,
// the same helper /api/photo uses: one grant before every outbound request,
// refunds for unbilled outcomes, bounded retry. THIS FILE HAS NO GOOGLE URL.
//
// BUDGET (all three must pass, fail closed):
//   1. CREDITED_PHOTO_WARM_MONTH_CAP  own ledger row `credited_photo_warm`, one
//      unit per venue attempted. Unset/invalid = the warm does not run.
//   2. the shared `photos` ledger (spendAllowPhotos: WAYFIND_PHOTOS_PAID +
//      GOOGLE_PHOTOS_MONTH_CAP; shut gate and non-production are refused).
//   3. HARD_MAX_PER_RUN venues per invocation.
//
// IDEMPOTENT: a venue that already has a live credit whose exact photo name is
// live in the photo cache, with at least MIN_REMAINING_MS left on BOTH, is
// skipped without any Google request. A venue whose pair is within
// MIN_REMAINING_MS of its 30-day end is refreshed (Google's cache limit), so
// credits are renewed ~9 days before they would vanish.
//
// ORDER OF WRITES: credit row first, then cache row. A fetched photo whose
// credit could not be stored is NOT cached (we would only create a new
// uncredited cached photo); it is counted as `creditFailed`.

import { googlePhotoPrefetchAllowed, PREFETCH_PAUSED } from "./googlePhotoPolicy.js";
import {
  takeFromLedger,
  refundToLedger,
  spendAllow,
  spendAllowPhotos,
  spendAllowPhotosNonprodBlocked,
  gateMode,
  creditedPhotoWarmCap,
} from "./spendGate.js";
import {
  defaultFetchOwnedUri,
  placeDiscoveryRef,
  photoCacheKey,
  isOwnedPhotoUrl,
  PHOTO_REF_RX,
  GOOGLE_PHOTOS_QUOTA_PROVIDER,
  quotaBreakerCooldownMs,
} from "./placePhotoServe.js";
import { isGoogleHostedPhotoUri } from "./photoUriLiveness.js";
import { extractPhotoCredits, recordPhotoCredits } from "./photoCredits.js";
import { breakerOpen, tripBreaker } from "./providerHealth.js";
import { PLACE_ID_RX } from "./creditedPhotoTargets.js";

export const WARM_LEDGER_SKU = "credited_photo_warm";
export const WARM_WIDTH = 640;
export const HARD_MAX_PER_RUN = 150;
export const DAY_MS = 86400000;
// Cache rows and credits are written with 29 days, not 30: the Details answer
// can come from a Next data cache up to 24 h old, and Google's 30-day clock
// starts when Google answered.
export const WARM_TTL_MS = 29 * DAY_MS;
// A pair with less than this left is renewed.
export const MIN_REMAINING_MS = 10 * DAY_MS;
// Estimated price of one refresh: one Place Photos media request.
export const PHOTO_PRICE_USD = 0.007;

function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// ── idempotency: which venues already hold a live cached+credited pair ──────
const PLACE_BATCH = 10;
export async function readLivePairs(_placeIds, _opts = {}) {
  // COMPLIANCE (2026-10-08): the photo| cache rows and wf_photo_credit rows this
  // used to join are no longer read or written. Nothing is ever "paired".
  return { paired: new Set(), error: null };
}

// Pure: how many of `targets` need a refresh and what it costs.
export function estimate(targetIds, paired) {
  const todo = targetIds.filter((id) => !paired.has(id));
  return { targets: targetIds.length, alreadyPaired: targetIds.length - todo.length, toWarm: todo.length, costUsdUpperBound: Math.round(todo.length * PHOTO_PRICE_USD * 1000) / 1000, todo };
}

async function defaultCacheSet(key, value, ttlMs) {
  const { cset, lastWrite } = await import("./serverCache.js");
  await cset(key, value, ttlMs);
  const w = lastWrite();
  return !!(w && w.ok);
}

// Why a real run may not start. null = may run.
export const PREFETCH_PROHIBITED = "prefetch-prohibited";
export function blockedReason(opts = {}) {
  // 2026-10-08: pre-fetching Google photos is prohibited outright (Google Maps
  // Platform Terms 3.2.3(a)(i)); no env switch re-enables it.
  return PREFETCH_PROHIBITED;
  // eslint-disable-next-line no-unreachable
  // 2026-10-08: background pre-fetch of Google photos is paused by default (lib/googlePhotoPolicy.js).
  if (!googlePhotoPrefetchAllowed()) return PREFETCH_PAUSED;
  if (gateMode() === "shut") return "gate-shut";
  if (spendAllowPhotosNonprodBlocked()) return "non-production";
  if (creditedPhotoWarmCap() == null) return "cap-unset";
  if (!(opts.serverKey || process.env.GOOGLE_MAPS_SERVER_KEY)) return "no-google-key";
  if (!(opts.env || sbEnv())) return "no-supabase";
  return null;
}

/**
 * Warm up to `max` venues. Never throws. Returns a plain stats object.
 * deps (all injectable for hermetic tests): readPairs, takeWarm, refundWarm,
 * takePhotos, takeDetails, fetchOwned, saveCredits, cacheSet, breakerOpen,
 * tripBreaker, now.
 */
export async function warmCreditedPhotos({ placeIds, max = HARD_MAX_PER_RUN, deadlineAt = Infinity, dryRun = false, serverKey = process.env.GOOGLE_MAPS_SERVER_KEY || "", deps = {} } = {}) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const out = { dryRun: !!dryRun, blocked: null, targets: 0, alreadyPaired: 0, toWarm: 0, attempted: 0, warmed: 0, noPhoto: 0, noCredit: 0, creditFailed: 0, cacheFailed: 0, mediaFailed: 0, stopped: null, readError: null, costUsdUpperBound: 0, failures: [] };
  // Constant guard, ahead of any read, injected dep or env: this function can never
  // call Google or write the cache (2026-10-08, see blockedReason).
  out.blocked = PREFETCH_PROHIBITED;
  out.targets = Array.isArray(placeIds) ? placeIds.length : 0;
  return out;
  // eslint-disable-next-line no-unreachable
  const ids = [...new Set((placeIds || []).filter((id) => PLACE_ID_RX.test(String(id || ""))))];
  out.targets = ids.length;
  const readPairs = deps.readPairs || ((list) => readLivePairs(list, { now: now() }));
  const pairs = await readPairs(ids);
  out.readError = pairs.error || null;
  const todo = ids.filter((id) => !pairs.paired.has(id));
  out.alreadyPaired = ids.length - todo.length;
  out.toWarm = todo.length;
  out.costUsdUpperBound = Math.round(todo.length * PHOTO_PRICE_USD * 1000) / 1000;
  if (dryRun) { out.blocked = (deps.blockedReason || blockedReason)({ serverKey }); return out; }
  // A real run needs a trustworthy "already paired" answer.
  if (out.readError) { out.blocked = "pairs-unreadable"; return out; }
  const block = (deps.blockedReason || blockedReason)({ serverKey });
  if (block) { out.blocked = block; return out; }

  const cap = creditedPhotoWarmCap();
  const limit = Math.max(0, Math.min(HARD_MAX_PER_RUN, Math.floor(Number(max)) || 0));
  const isBreakerOpen = deps.breakerOpen || breakerOpen;
  const tripTheBreaker = deps.tripBreaker || tripBreaker;
  try { if (await isBreakerOpen(GOOGLE_PHOTOS_QUOTA_PROVIDER)) { out.blocked = "quota-open"; return out; } } catch { /* a read failure is not a reason to stop; the ledger still caps */ }

  const takeWarm = deps.takeWarm || (() => takeFromLedger(WARM_LEDGER_SKU, cap));
  const refundWarm = deps.refundWarm || (() => refundToLedger(WARM_LEDGER_SKU, 1));
  const takePhotos = deps.takePhotos || (() => spendAllowPhotos());
  const takeDetails = deps.takeDetails || (() => spendAllow("details_ids_only"));
  const fetchOwned = deps.fetchOwned || defaultFetchOwnedUri;
  const saveCredits = deps.saveCredits || ((places) => recordPhotoCredits(places, WARM_TTL_MS));
  const cacheSet = deps.cacheSet || defaultCacheSet;

  for (const placeId of todo) {
    if (out.attempted >= limit) { out.stopped = "max-per-run"; break; }
    if (now() >= deadlineAt) { out.stopped = "deadline"; break; }
    // 1. own monthly budget (one unit per venue).
    if (!(await takeWarm())) { out.stopped = "warm-cap"; break; }
    // 2. the first media request is pre-paid here, like the /api/photo route.
    if (!(await takePhotos())) { await refundWarm(); out.stopped = "photos-ledger"; break; }
    out.attempted++;
    // Every FURTHER outbound request asks again, per SKU. A second media
    // request (rare "unowned" follow) also consumes a unit of the warm budget.
    const authorize = async (sku) => {
      if (sku === "details_ids_only") return takeDetails();
      if (sku === "photos") return (await takeWarm()) ? ((await takePhotos()) ? true : (await refundWarm(), false)) : false;
      return false;
    };
    let captured = null;
    let res;
    try {
      res = await fetchOwned(
        placeDiscoveryRef(placeId), WARM_WIDTH, serverKey, authorize, undefined, undefined, undefined,
        { freshFirst: true, placeOnly: true, keepCredits: (pid, photos) => { if (pid === placeId) captured = photos; } }
      );
    } catch { res = null; }
    const r = res && typeof res === "object" ? res : { uri: null, upstream: "threw" };
    const name = typeof r.name === "string" ? r.name : "";
    if (!(isOwnedPhotoUrl(r.uri) && isGoogleHostedPhotoUri(r.uri) && PHOTO_REF_RX.test(name) && name.split("/")[1] === placeId)) {
      const up = String(r.upstream || "");
      if (up === "fresh-nophoto") out.noPhoto++; else out.mediaFailed++;
      if (up.endsWith("quota") || up === "quota") { try { await tripTheBreaker(GOOGLE_PHOTOS_QUOTA_PROVIDER, "quota", "google photos daily quota exhausted (credited warm)", quotaBreakerCooldownMs(now())); } catch { /* best-effort */ } out.stopped = "quota"; }
      // Nothing was billed for this venue: give its warm unit back.
      if (r.refunded > 0 || up === "fresh-nophoto") { try { await refundWarm(); } catch { /* best-effort */ } }
      if (out.failures.length < 10) out.failures.push({ placeId, upstream: up || "none" });
      // A ledger refusal mid-venue ends the run: every later venue would only
      // take and give back a grant to hear the same "no".
      if (up === "denied" || up === "place-lookup-denied" || up === "fresh-failed:denied") out.stopped = out.stopped || "ledger-denied";
      if (out.stopped === "quota" || out.stopped === "ledger-denied") break;
      continue;
    }
    // 3. the credit for THIS photo name, from the very response that named it.
    const photo = Array.isArray(captured) ? captured.find((p) => p && p.name === name) : null;
    const rows = photo ? extractPhotoCredits([{ id: placeId, photos: [photo] }], WARM_TTL_MS, now()) : [];
    if (!rows.length) { out.noCredit++; if (out.failures.length < 10) out.failures.push({ placeId, upstream: "no-author-credit" }); continue; }
    let saved = false;
    try { saved = !!(await saveCredits([{ id: placeId, photos: [photo] }])) || !!(await saveCredits([{ id: placeId, photos: [photo] }])); } catch { saved = false; }
    if (!saved) { out.creditFailed++; if (out.failures.length < 10) out.failures.push({ placeId, upstream: "credit-write-failed" }); continue; }
    let cached = false;
    try { cached = !!(await cacheSet(photoCacheKey(name, WARM_WIDTH), { uri: String(r.uri), vok: now() }, WARM_TTL_MS)); } catch { cached = false; }
    if (!cached) { out.cacheFailed++; if (out.failures.length < 10) out.failures.push({ placeId, upstream: "cache-write-failed" }); continue; }
    out.warmed++;
  }
  return out;
}
