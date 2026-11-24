// lib/googlePhotoBackfill.js: SERVER ONLY. The one off, owner approved Google
// cover photo backfill for cards that show no photo at all.
//
// OWNER DECISION (Gabe, 2026-11-23 2:19 PM ET): "Build the code change that turns
// Google photos on only for the empty cards, capped at $45, as a PR for my
// approval." Turning it ON is a separate owner OK after merge.
//
// WHAT IT IS. A second, separate allowance for Google Place Photos (New) media
// requests, used ONLY when the main `photos` allowance (lib/spendGate.js) has
// already said no, ONLY for a place on lib/googlePhotoBackfillAllowlist.js, and
// ONLY for the cover photo a card asks for by place id (`/api/photo?place=`).
// It never raises, refunds into or otherwise touches the main `photos` row, and
// it never runs for any other place.
//
// SWITCHES (Vercel env). Every one must be present and sane or nothing is bought:
//   WAYFIND_PHOTOS_BACKFILL=1             the explicit enable.
//   GOOGLE_PHOTOS_BACKFILL_CAP=6400       photos this month, plain positive integer.
//                                         Clamped to BACKFILL_HARD_MAX (6,400) in
//                                         code, so a typo can never buy more.
//   GOOGLE_PHOTOS_BACKFILL_MONTH=2026-12  the ONE UTC month it may run (YYYY-MM).
//                                         Any other month answers "month". This is
//                                         what makes the cap a $45 total instead of
//                                         $45 a month: a new month needs a new OK.
//   GOOGLE_PHOTOS_BACKFILL_PER_HOUR=4     optional; default 4 (96 a day, under a
//                                         possible 100 a day Google console quota on
//                                         GetPhotoMediaRequest). 1 to 400.
// WAYFIND_GATE=shut still means zero, and preview or dev deployments never buy
// (same rule as spendAllowPhotos).
//
// COST. Places API Place Details Photos (SKU DCD1-FE97-8C71): $7.00 per 1,000
// after a 1,000 a month free line, per Google's pricing page read 2026-11-23.
// November's free line is already used, so 6,400 x $7 / 1,000 = $44.80. The
// Place Details lookup that finds the photo name asks only for `photos`, which
// Google bills as Place Details Essentials (IDs Only): free and unlimited.
//
// NO PREFETCH. lib/googlePhotoPolicy.js prohibits background pre fetching of
// Google photos (Google Maps Platform Terms 3.2.3(a)(i)), so this backfill buys a
// photo only when a real visitor's card asks for it. The per hour line is what
// paces it; no cron warms the list.
import {
  gateMode,
  spendAllowPhotosNonprodBlocked,
  takeFromLedgerDetailed,
  refundToLedger,
  utcLedgerMonth,
} from "./spendGate.js";
import { isGooglePhotoBackfillPlace } from "./googlePhotoBackfillAllowlist.js";
import { BACKFILL_CHRISTMAS_VENUE_PLACE_IDS } from "./googlePhotoBackfillChristmas.js";
import { ownedPlacePhotoSrc } from "./placePhoto.js";

export const BACKFILL_SKU = "photos_backfill_1123";
export const BACKFILL_HOUR_SKU_PREFIX = "photos_backfill_1123_h";
/** The $45 line: 6,400 photos x $7.00 per 1,000 = $44.80. Never exceeded, whatever the env says. */
export const BACKFILL_HARD_MAX = 6400;
export const BACKFILL_DEFAULT_CAP = 6400;
export const BACKFILL_DEFAULT_PER_HOUR = 4;
export const BACKFILL_MAX_PER_HOUR = 400;
export const BACKFILL_ENV = Object.freeze({
  enable: "WAYFIND_PHOTOS_BACKFILL",
  cap: "GOOGLE_PHOTOS_BACKFILL_CAP",
  month: "GOOGLE_PHOTOS_BACKFILL_MONTH",
  perHour: "GOOGLE_PHOTOS_BACKFILL_PER_HOUR",
});

function positiveInt(raw) {
  const s = String(raw ?? "").trim();
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * The backfill configuration in force, or { on: false, reason } when it is off.
 * Pure over (env, now). Never echoes a value back in its reason.
 */
export function googlePhotoBackfillConfig(env = process.env, now = new Date()) {
  const e = env || {};
  if (String(e[BACKFILL_ENV.enable] ?? "").trim() !== "1") return { on: false, reason: "off" };
  const cap = positiveInt(e[BACKFILL_ENV.cap]);
  if (cap == null) return { on: false, reason: "cap-invalid" };
  const month = String(e[BACKFILL_ENV.month] ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { on: false, reason: "month-invalid" };
  if (month !== utcLedgerMonth(now)) return { on: false, reason: "month" };
  const rawHour = String(e[BACKFILL_ENV.perHour] ?? "").trim();
  let perHour = BACKFILL_DEFAULT_PER_HOUR;
  if (rawHour) {
    const h = positiveInt(rawHour);
    if (h == null || h > BACKFILL_MAX_PER_HOUR) return { on: false, reason: "per-hour-invalid" };
    perHour = h;
  }
  return { on: true, reason: "on", cap: Math.min(cap, BACKFILL_HARD_MAX), perHour, month };
}

/** True when the switches are set for this month. Says nothing about remaining headroom. */
export function googlePhotoBackfillEnabled(env = process.env, now = new Date()) {
  return googlePhotoBackfillConfig(env, now).on;
}

/** UTC hour counter row, e.g. photos_backfill_1123_h2026120114. */
export function backfillHourSku(now = new Date()) {
  const iso = new Date(now).toISOString();
  return BACKFILL_HOUR_SKU_PREFIX + iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13);
}

/** A place this backfill may ever buy for: on the allowlist, and asked for by place id (cover), not by a photo name. */
export function googlePhotoBackfillEligible({ placeId, ref } = {}) {
  if (ref) return false;
  return isGooglePhotoBackfillPlace(placeId);
}

/**
 * ONE atomic grant for ONE Place Photo media request for an allowlisted place.
 * Order: allowlist, switches, gate, production, hour line, month cap. The hour
 * tick is given back when the month cap refuses. Fail closed everywhere: a
 * ledger that cannot answer is a refusal.
 * deps (test seam): env, now, take(sku, cap), refund(sku, n), nonprodBlocked(), mode().
 */
export async function takeGoogleBackfillPhotoGrant(placeId, deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || new Date();
  const take = deps.take || takeFromLedgerDetailed;
  const refund = deps.refund || refundToLedger;
  const nonprodBlocked = deps.nonprodBlocked || spendAllowPhotosNonprodBlocked;
  const mode = deps.mode || gateMode;
  if (!isGooglePhotoBackfillPlace(placeId)) return { ok: false, reason: "not-allowlisted" };
  const cfg = googlePhotoBackfillConfig(env, now);
  if (!cfg.on) return { ok: false, reason: cfg.reason };
  if (mode() === "shut") return { ok: false, reason: "shut" };
  if (nonprodBlocked()) return { ok: false, reason: "nonprod" };
  const hourSku = backfillHourSku(now);
  let hour;
  try { hour = await take(hourSku, cfg.perHour); } catch { hour = { ok: false, reason: "http" }; }
  if (!hour || !hour.ok) return { ok: false, reason: hour && hour.reason === "cap" ? "hour-cap" : (hour && hour.reason) || "http" };
  let month;
  try { month = await take(BACKFILL_SKU, cfg.cap); } catch { month = { ok: false, reason: "http" }; }
  if (!month || !month.ok) {
    try { await refund(hourSku, 1); } catch { /* best effort: a lost refund only makes the hour read busier */ }
    return { ok: false, reason: (month && month.reason) || "http" };
  }
  return { ok: true, reason: "granted-backfill", sku: BACKFILL_SKU, hourSku };
}

/** Give back one backfill grant whose media call Google never billed. Never touches `photos`. */
export async function refundGoogleBackfillPhotoGrant(grant, deps = {}) {
  if (!grant || !grant.ok || grant.sku !== BACKFILL_SKU) return false;
  const refund = deps.refund || refundToLedger;
  let ok = false;
  try { ok = !!(await refund(BACKFILL_SKU, 1)); } catch { ok = false; }
  if (grant.hourSku) { try { await refund(grant.hourSku, 1); } catch { /* best effort */ } }
  return ok;
}

// ── Christmas event cards (owner, 2026-11-23) ─────────────────────────────────
// An empty Christmas EVENT card whose venue is one of the 38 backfill venues asks
// for that venue's cover photo while the backfill is switched on, instead of
// painting eventPlaceholder(). The card keeps its designed tile as the fallback
// if the photo cannot be served (cap reached, quota, no Google photo).
// Off (any switch missing, wrong month): "" and the card is exactly as before.
const CHRISTMAS_VENUES = new Set(BACKFILL_CHRISTMAS_VENUE_PLACE_IDS);
export function isChristmasBackfillVenue(placeId) {
  return typeof placeId === "string" && CHRISTMAS_VENUES.has(placeId);
}
export function christmasBackfillVenuePhotoSrc(placeId, env = process.env, now = new Date(), w = 640) {
  if (!isChristmasBackfillVenue(placeId)) return "";
  if (!googlePhotoBackfillEnabled(env, now)) return "";
  return ownedPlacePhotoSrc(placeId, w);
}
