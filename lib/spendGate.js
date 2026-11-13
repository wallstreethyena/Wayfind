// lib/spendGate.js - the ONE switch + ledger for ALL metered Google Places spend.
import { AsyncLocalStorage } from "node:async_hooks";
//
// WAYFIND_GATE values (Vercel env, flip without code changes):
//   "shut" - ZERO paid Google calls anywhere. Cache / owned inventory / fallback art.
//   "free" - paid calls allowed ONLY inside Google's monthly free tier, enforced by
//            an atomic Supabase counter (wf_spend_take). FAIL-CLOSED: if the ledger
//            is unreachable or says no, the call does not happen.
//   "open" - rich provider fields may run, but only through a finite ledger.
//   unset/other - shut. A missing or mistyped safety switch cannot spend.
//
// Free-tier budgets (March-2025 pricing, verified against Google's pricing page
// 2026-08-25; caps sit ~5% under Google's line so drift can never bill):
//   text_pro 4800/5000 - details_enterprise 950/1000 - details_pro 4800/5000
//   photos 950/1000 - nearby_pro 4800/5000
// The ledger lives in public.wf_spend_ledger, one row per (month, sku).
// August 2026 seeded with what was already consumed (photos marked exhausted).
export function gateMode() {
  const v = String(process.env.WAYFIND_GATE || "").trim().toLowerCase();
  return v === "open" ? "open" : v === "free" ? "free" : "shut";
}
export function gateShut() { return gateMode() === "shut"; }
export function gateFree() { return gateMode() === "free"; }

// details_ids_only: the Essentials IDs-Only SKU (id/photos/name) carries no
// charge; metered anyway so every cron path to Google has a counter in front
// of it (check-promote-spend-gate). 9,500 sits under Essentials' 10,000 line.
// 2026-09-04 — `autocomplete` added after the guard-honesty audit found THREE
// live Places callers with no gate at all (see check-spend-guard's discovery
// rewrite). Autocomplete (New) bills per request and /api/places/autocomplete
// is wired to the home search box, so it fires on typing: the highest-frequency
// ungated path in the app, and the same shape as the $1,878 August bill.
//
// THE NUMBER HERE IS A STOP-LOSS, NOT A VERIFIED FREE TIER. Google does not
// publish the Autocomplete free allowance on the usage-and-billing page, and
// this lane refused to invent one. 10,000 is a FINITE ceiling replacing NO
// ceiling; the owner confirms the real figure in the Google console and sets
// AUTOCOMPLETE_MONTH_CAP. Every other entry here IS a verified free tier ~5%
// under Google's published line.
// 2026-10-25 — `details_essentials` 1,500 -> 9,500 for the free-tier inventory
// refresh (see REFRESH_SUBCAPS below). Google's Place Details Essentials line is
// 10,000 free calls a month (developers.google.com/maps/billing-and-pricing/pricing,
// read 2026-10-25); 9,500 keeps the usual 5% margin ($5 per 1,000 only past 10,000).
// The owned-hotel backfill still asks for its own 1,500 inside this one row.
// 2026-09-22 — `text_ids_only` and `details_essentials` added for the owned-
// hotel Google-identity backfill (lib/ownedHotelIdentity.js). Both ride SKUs
// Google's pricing pages list as free this month (Text Search Essentials IDs
// Only is unlimited free; Place Details Essentials carries a 10,000/month free
// allowance the project was not otherwise using) — the caps below are safety
// rails against a runaway loop, not verified paid-tier lines, so they sit
// under Google's own free ceilings rather than at Google's paid-tier ~5%
// margin the other rows use.
const CAPS = { text_pro: 4800, details_enterprise: 950, details_enterprise_atmosphere: 950, details_pro: 4800, photos: 950, nearby_pro: 4800, details_ids_only: 9500, autocomplete: 10000, text_ids_only: 9500, details_essentials: 9500 };

// Google Geocoding has no safe hardcoded allowance in this codebase. It may
// run only under an operator-provided finite ceiling, including free mode.
//
// 2026-09-30 — `nearby_enterprise` joins `text_enterprise` here. Google bills a
// Text/Nearby Search request at the HIGHEST tier any field in its X-Goog-FieldMask
// reaches (developers.google.com/maps/documentation/places/web-service/data-fields;
// "You are then billed at the highest SKU applicable to your request" —
// .../usage-and-billing). rating / userRatingCount / priceLevel / priceRange /
// regularOpeningHours / websiteUri are Enterprise on both endpoints, and the
// Enterprise free line is 1,000/month, not Pro's 5,000. Rich masks used to be
// counted against text_pro / nearby_pro (4,800), so the ledger could report
// "inside the free tier" while Google billed $35/1k. A rich mask now charges its
// real SKU, which has NO invented number: absent operator ceiling = off.
// scripts/test-search-sku-accounting.mjs derives the SKU from the header each
// caller actually sends and fails when the ledger row disagrees.
const CONFIGURED_CAP_SKUS = new Set(["geocoding", "text_enterprise", "nearby_enterprise"]);

function explicitCap(name) {
  const raw = String(process.env[name] || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** Explicit operator ceiling for paid Google Geocoding; absent/invalid is off. */
export function geocodingCap() {
  return explicitCap("GOOGLE_GEOCODING_MONTH_CAP");
}

/** Explicit ceiling for the rich Text Search field mask. */
export function textEnterpriseCap() {
  return explicitCap("GOOGLE_TEXT_ENTERPRISE_MONTH_CAP");
}

/** Explicit ceiling for the rich Nearby Search field mask; absent/invalid is off. */
export function nearbyEnterpriseCap() {
  return explicitCap("GOOGLE_NEARBY_ENTERPRISE_MONTH_CAP");
}

/**
 * Monthly ceiling for the credited-photo warm (lib/creditedPhotoWarm.js): the
 * number of venues it may refresh per calendar month, counted by its own
 * `credited_photo_warm` ledger row on top of the shared `photos` row. Absent or
 * unparseable = the warm cannot run at all (fail closed, no invented default).
 */
export function creditedPhotoWarmCap() {
  return explicitCap("CREDITED_PHOTO_WARM_MONTH_CAP");
}

/** The Autocomplete ceiling actually in force. Owner-settable; finite always. */
export function autocompleteCap() {
  return explicitCap("AUTOCOMPLETE_MONTH_CAP");
}

function cfg() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// ── HUMAN TRAFFIC RESERVE (2026-11-11) ───────────────────────────────────
//
// Background jobs and live visitors draw from the SAME monthly free lines. On
// 2026-11-01 the promotion cron (5 -> 50 places per 5 minute run from midnight)
// and the hourly refresh used the whole details_enterprise line in the first
// hours of the month, so the detail sheet, which a person is waiting on, got
// "no" for the rest of November. This is the one place that says who may draw
// what is left.
//
// WHO IS ASKING is declared once per job, at its entry point, with
// runWithTraffic(TRAFFIC.X, fn) (AsyncLocalStorage, so every grant the job
// makes, however deep in lib/, inherits it) or declareProcessTraffic() in a
// standalone script. The grant call sites themselves are unchanged. Nothing
// declared = VISITOR: a request handler (detail sheet, search, autocomplete,
// map, photo) never sets a scope. scripts/test-human-traffic-reserve.mjs (section D)
// FAILS THE BUILD if a cron route (or the promote worker) can reach a grant
// without declaring, which is what makes "undeclared = visitor" provable.
//
//   VISITOR     a person is waiting. Unaffected by the reserve; limited only by
//               the ceiling its own grant function already uses.
//   BACKGROUND  cron/batch. Refused once a visitor-shared SKU has used
//               (1 - HUMAN_RESERVE_SHARE) of what visitors can draw; the last
//               HUMAN_RESERVE_SHARE of that ceiling is for visitors only.
//   REFRESH     the inventory refresh. It has its OWN counters (refresh_*) and
//               the owner's half-and-half split (REFRESH_SUBCAPS), so the
//               reserve does not apply to it: the split stays exactly as is.
//
// "What visitors can draw" is visitorCeiling(sku), the ceiling the visitor
// grant functions really use (siteReservedCap for the Details rows, which is
// 475 for details_enterprise after the refresh reserve), NOT the free line:
// 80% of 950 would be 760, a number no visitor can ever reach.
//
// ATOMICITY. The line is enforced by a read of the ledger row just before the
// take, not by passing a lower p_cap: wf_spend_take writes p_cap into the row's
// `cap` column on every grant, and lib/spendPacing.js reads that column, so a
// lowered cap would make a healthy row read CAPPED and page. Cost: two
// background grants can race past the line by the number in flight (cron runs
// are single-flight, so at most one run's worth). Visitors are never blocked
// by the race. A ledger read that fails refuses the background grant (fail
// closed, the same direction as the take itself).
//
// NOT CHANGED: no cap, no sub-cap, no env var, no refund. PROMOTE_PAID: when the
// owner has enabled paid promotion for details_pro the line is not applied to
// that one SKU (see humanReserveLine), because the paid ceiling is an explicit
// owner decision that sits above the free line visitors are capped at.
export const TRAFFIC = Object.freeze({ VISITOR: "visitor", BACKGROUND: "background", REFRESH: "refresh" });
export const HUMAN_RESERVE_SHARE = 0.2;
export const VISITOR_SHARED_SKUS = Object.freeze([
  "details_enterprise", "details_pro", "photos", "text_pro", "text_enterprise",
  "nearby_pro", "nearby_enterprise", "autocomplete", "geocoding", "details_ids_only",
]);
const trafficStore = new AsyncLocalStorage();
const TRAFFIC_VALUES = new Set(Object.values(TRAFFIC));
/** Run fn with every grant inside it (however deep, however async) declared as `traffic`. */
export function runWithTraffic(traffic, fn) {
  if (!TRAFFIC_VALUES.has(traffic)) throw new Error("runWithTraffic: unknown traffic class " + String(traffic));
  return trafficStore.run({ traffic, priority: null }, fn);
}
/** Standalone scripts only (one job per process): declare the class for the rest of the process. */
export function declareProcessTraffic(traffic) {
  if (!TRAFFIC_VALUES.has(traffic)) throw new Error("declareProcessTraffic: unknown traffic class " + String(traffic));
  trafficStore.enterWith({ traffic, priority: null });
}
/** The declared class, VISITOR when nothing was declared (request handlers never declare). */
export function currentTraffic() {
  const st = trafficStore.getStore();
  return st && TRAFFIC_VALUES.has(st.traffic) ? st.traffic : TRAFFIC.VISITOR;
}
/** The ceiling visitor grants of this SKU actually use this month, or null when visitors cannot draw it. */
export function visitorCeiling(sku) {
  if (gateMode() === "shut") return null;
  if (!VISITOR_SHARED_SKUS.includes(sku)) return null;
  let n;
  if (sku === "photos") n = photosCeiling();
  else if (sku === "autocomplete") n = autocompleteCap();
  else if (sku === "text_enterprise") n = textEnterpriseCap();
  else if (sku === "nearby_enterprise") n = nearbyEnterpriseCap();
  else if (sku === "geocoding") n = geocodingCap();
  else n = siteReservedCap(sku);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
/** Used count at/above which BACKGROUND callers are refused for this SKU, or null when no reserve applies. */
export function humanReserveLine(sku) {
  // Paid promotion is the owner's explicit decision (WAYFIND_PROMOTE_PAID):
  // its ceiling sits above the free line visitors are capped at, so the line
  // would stop it at 80% of 4,800. Left exactly as the owner configured it.
  if (sku === PROMOTE_PAID_SKU && promotePaidEnabled()) return null;
  const ceiling = visitorCeiling(sku);
  return ceiling == null ? null : Math.floor(ceiling * (1 - HUMAN_RESERVE_SHARE));
}
/** Current-month `used` for one SKU (0 when the row does not exist yet), or null when unreadable. */
export async function readLedgerUsed(sku, now = new Date()) {
  const s = cfg();
  if (!s || !/^[a-z0-9_:-]{1,64}$/.test(String(sku || ""))) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_spend_ledger?select=used&month=eq.${utcLedgerMonth(now)}&sku=eq.${encodeURIComponent(sku)}`, {
      headers: { apikey: s.key, Authorization: "Bearer " + s.key },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return 0;
    const used = Number(rows[0] && rows[0].used);
    return Number.isFinite(used) && used >= 0 ? used : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}
/**
 * Would a BACKGROUND grant of this SKU be refused by the reserve right now?
 * { applies:false } no reserve for this SKU; { applies:true, blocked, used, line, unreadable }.
 * Jobs call it BEFORE claiming work so a paused run costs nothing and pulses cleanly.
 */
export async function backgroundReserveStatus(sku) {
  const line = humanReserveLine(sku);
  if (line == null) return { applies: false, blocked: false, used: null, line: null, unreadable: false };
  const used = await readLedgerUsed(sku);
  if (used == null) return { applies: true, blocked: false, used: null, line, unreadable: true };
  return { applies: true, blocked: used >= line, used, line, unreadable: false };
}

// ── BACKGROUND DAILY LINE (2026-11-12) ───────────────────────────────────
//
// Google meters Place Details per DAY as well as per month ("GetPlaceRequest per
// day", reset at midnight Pacific = 08:00 UTC in winter). Every evening the
// background jobs used that day's quota, and from then until the reset a visitor's
// Place Details lookup (the photo route's `?place=` discovery, `details_ids_only`)
// answered 429 and the card showed its placeholder (Sentry WAYFIND-1Q).
//
// EVIDENCE for the one constant below (wf_job_pulse, Pacific days 2026-11-04 to
// 2026-11-11): background Place Details calls made BEFORE the day's first Google
// 429 were refresh + promote-index = 912, 925, 887, 804, 840, 855, 831, 708 (first
// 429 at 04:10, 06:10, 05:10, 04:10, 04:10, 04:10, 03:10, 02:10 UTC the next
// morning, drifting earlier). So Google's per-day quota is exhausted at roughly
// 700-925 background calls plus whatever visitors drew. 500 is
// 70% of the lowest observed background total, which leaves the rest of that day
// for visitors. Visitors are never counted here and never refused by it.
//
// ONE counter row per Pacific day in the existing wf_spend_ledger (sku
// google_details_bg_dYYYYMMDD, the same per-day-row pattern as
// events_ticketmaster_dYYYYMMDD): no schema change. The grant is the existing
// atomic wf_spend_take, so the line is exact and a ledger that cannot answer
// refuses the background call (fail closed). A Pacific day that straddles the UTC
// month boundary gets a second row (the ledger keys rows on the UTC month), i.e.
// the counter restarts once at 00:00 UTC on the 1st: a one-off leak of at most one
// allowance, never a block.
//
// PRIORITY ORDER (owner 2026-11-12: A visitors, B new or changed inventory, C
// scheduled refresh, D promotion and enrichment). A is not in this table at all:
// VISITOR grants never touch the counter. B, C, D are three lines on the SAME
// counter: the lower the priority, the earlier it is refused, so D stops first,
// then C, and B keeps the last 20% of the allowance.
export const BACKGROUND_DAILY_ALLOWANCE = 500;
export const BACKGROUND_PRIORITY = Object.freeze({ NEW_OR_CHANGED: "new-or-changed", SCHEDULED: "scheduled-refresh", PROMOTION: "promotion" });
export const BACKGROUND_DAILY_LINES = Object.freeze({
  [BACKGROUND_PRIORITY.NEW_OR_CHANGED]: BACKGROUND_DAILY_ALLOWANCE,
  [BACKGROUND_PRIORITY.SCHEDULED]: Math.floor(BACKGROUND_DAILY_ALLOWANCE * 0.8),
  [BACKGROUND_PRIORITY.PROMOTION]: Math.floor(BACKGROUND_DAILY_ALLOWANCE * 0.68),
});
// Every Place Details SKU a background job can spend. One Google call debits exactly
// one of these, so one grant of any of them is one tick of the day's counter.
export const GOOGLE_DETAILS_DAILY_SKUS = Object.freeze(["details_essentials", "details_pro", "details_enterprise", "details_ids_only"]);
const DEFAULT_PRIORITY = Object.freeze({ [TRAFFIC.REFRESH]: BACKGROUND_PRIORITY.SCHEDULED, [TRAFFIC.BACKGROUND]: BACKGROUND_PRIORITY.PROMOTION });
const PRIORITY_VALUES = new Set(Object.values(BACKGROUND_PRIORITY));
/** Run fn with the grants inside it ranked at `priority` (a background job only; a visitor stays a visitor). */
export function runWithBackgroundPriority(priority, fn) {
  if (!PRIORITY_VALUES.has(priority)) throw new Error("runWithBackgroundPriority: unknown priority " + String(priority));
  const st = trafficStore.getStore() || { traffic: TRAFFIC.VISITOR, priority: null };
  return trafficStore.run({ ...st, priority }, fn);
}
/** The priority the current grant is ranked at: declared, else the class default, null for a visitor. */
export function currentBackgroundPriority() {
  const st = trafficStore.getStore();
  const traffic = st && TRAFFIC_VALUES.has(st.traffic) ? st.traffic : TRAFFIC.VISITOR;
  if (traffic === TRAFFIC.VISITOR) return null;
  return st.priority && PRIORITY_VALUES.has(st.priority) ? st.priority : DEFAULT_PRIORITY[traffic];
}
/** Pacific calendar day of `now` as YYYYMMDD (Google's quota day). DST-aware. */
export function googleQuotaDayYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now)).replace(/-/g, "");
}
export function backgroundDailySku(now = new Date()) { return "google_details_bg_d" + googleQuotaDayYmd(now); }
export function backgroundDailyLine(priority) {
  const n = BACKGROUND_DAILY_LINES[priority];
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
/** True for the per-day counter rows (they are not monthly budgets; spend pacing must skip them). */
export function isBackgroundDailySku(sku) { return /^google_details_bg_d\d{8}$/.test(String(sku || "")); }
/**
 * Would a background grant of this priority be refused by the daily line right now?
 * Jobs call it BEFORE claiming work so a paused run costs nothing and pulses as an
 * expected pause. An unreadable counter is blocked (fail closed), flagged `unreadable`.
 */
export async function backgroundDailyStatus(priority, now = new Date()) {
  const line = backgroundDailyLine(priority);
  if (line == null) return { applies: false, blocked: true, used: null, line: null, unreadable: true, priority };
  if (gateMode() === "shut") return { applies: true, blocked: true, used: null, line, unreadable: false, priority };
  const used = await readLedgerUsed(backgroundDailySku(now), now);
  if (used == null) return { applies: true, blocked: true, used: null, line, unreadable: true, priority };
  return { applies: true, blocked: used >= line, used, line, unreadable: false, priority };
}

// ── REFRESH RESERVE (owner decision 2026-11-03, option b) ────────────────
//
// The inventory-refresh cron may re-date content only through the rich
// tiers, and its grants draw on the SAME free lines as discretionary site
// reads (REFRESH_SUBCAPS below). In November 2026 the site's own detail
// reads consumed the whole shared enterprise free line (988 of 950) and
// the pro line (5,687 of 4,800) in three days, so refresh got "no" all
// month and 5,716 stale rows (Bern's Steak House, #1893) could never
// re-date. The reserve gives refresh first claim on its sub-cap slice:
// discretionary site reads stop at (free line − refresh sub-cap), refresh
// keeps taking up to the free line through its own counter, and the
// combined total can never pass the free line. $0: no cap is raised, no
// paid ceiling is created; site reads simply stop earlier in the month.
// freeTierLine — Google's monthly free line for a SKU as this codebase meters it
// (CAPS, ~5% under Google's number), independent of the gate MODE. A share of a
// shared line must be computed from this, never from effectiveCap(): in "open"
// mode effectiveCap returns the caller's month_cap (7,500 for promotion), so
// "half of it" would be 3,750 Enterprise calls, past the 1,000 free line.
export function freeTierLine(sku) {
  const n = CAPS[sku];
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function siteReservedCap(sku) {
  const free = CAPS[sku];
  if (!free) return null;
  const sub = REFRESH_SUBCAPS[sku];
  if (!sub) return free;
  return Math.max(0, free - sub);
}

// May a paid call of this SKU family happen right now?
// Every enabled mode takes one atomic ledger grant. "open" selects richer
// behavior at call sites; it never means unmetered.
export async function spendAllow(sku) {
  const mode = gateMode();
  if (mode === "shut") return false;
  const cap = siteReservedCap(sku);
  if (!cap) return false;
  return takeFromLedger(sku, cap);
}

// October 2026 seasonal venue add (scripts/add-seasonal-venues-2026-10-19.mjs
// only). On 2026-10-20 the UTC ledger rows this script needs were already
// full, and the run was refused on its first text_pro call:
//   text_pro              4,800 / 4,800   (Google free line 5,000)
//   details_enterprise      950 / 950     (Google free line 1,000, $20/1k after)
//   details_pro           6,650 / 6,650   (promote-paid ceiling, already past
//                                          the 5,000 free line, $17/1k)
// spendAllow() and effectiveCap() stay on those ceilings for every other
// caller. This script asks for a higher absolute ceiling, and only while the
// ledger month is 2026-10. November is the old grant again.
//
// Extras, and the bill if each one is used up from the rows above:
//   text_pro +130 → 4,930. Still under 5,000, so $0.
//   details_enterprise +62 → 1,012. 50 calls finish the free line, then
//     12 × $0.020 = $0.24. 62 is one Place Details call for each venue.
//   details_pro +62 → 6,712. All 62 are past the free line: 62 × $0.017
//     = $1.054. A venue buys Enterprise or Pro, not both; 62 on each mask
//     means either path can finish one pass.
// Max extra if every extra grant is taken: $1.294. The script's BILL_CAP
// of 130 still limits each run.
export const SEASONAL_VENUE_OCTOBER_2026_MONTH = "2026-10";
export const SEASONAL_VENUE_OCTOBER_2026_EXTRA = Object.freeze({
  text_pro: 130,
  details_enterprise: 62,
  details_pro: 62,
});
// Not CAPS.details_pro. The October row was spent to the promote-paid
// ceiling; 4,800 + 62 is still below 6,650, so the ledger would keep saying no.
export const SEASONAL_VENUE_DETAILS_PRO_REACHED = 6650;

// Same UTC "YYYY-MM" key as lib/photoCoverage.js ledgerMonth and wf_spend_take
// (to_char(now() at time zone 'utc','YYYY-MM')). Not a user-facing day.
export function utcLedgerMonth(now = new Date()) {
  return new Date(now).toISOString().slice(0, 7);
}

/** Absolute October 2026 ceiling for the seasonal script, or null when this SKU gets no extra. */
export function seasonalVenueOctoberCap(sku, now = new Date()) {
  if (utcLedgerMonth(now) !== SEASONAL_VENUE_OCTOBER_2026_MONTH) return null;
  const extra = SEASONAL_VENUE_OCTOBER_2026_EXTRA[sku];
  if (!Number.isSafeInteger(extra) || extra <= 0) return null;
  const base = sku === "details_pro" ? SEASONAL_VENUE_DETAILS_PRO_REACHED : CAPS[sku];
  if (!Number.isSafeInteger(base) || base <= 0) return null;
  return base + extra;
}

// The seasonal script's grant. Shut is still zero. Outside October, or for
// any other SKU, this returns false and the caller uses spendAllow /
// spendAllowCapped. free and open ask for the same finite ceiling.
export async function spendAllowSeasonalVenue(sku, now = new Date()) {
  if (gateMode() === "shut") return false;
  const cap = seasonalVenueOctoberCap(sku, now);
  if (!cap) return false;
  return takeFromLedger(sku, cap);
}

// Atmosphere masks and Autocomplete terminal Details have historically debited
// a lower-tier row. Keep that debit too so a new corrected row cannot create
// fresh monthly headroom. This narrow path never reads promotion-paid settings:
// both counters are capped at the existing 950 Enterprise safety allowance,
// even in open mode. Ledger reconciliation can only lower this stop-loss.
export async function spendAllowDetailsAtmosphere(legacySku) {
  if (gateMode() === "shut" || !["details_pro", "details_enterprise"].includes(legacySku)) return false;
  const cap = CAPS.details_enterprise_atmosphere;
  if (!(await takeFromLedger(legacySku, Math.min(siteReservedCap(legacySku), cap)))) return false;
  return takeFromLedger("details_enterprise_atmosphere", cap);
}

// ── PHOTOS ONLY: the one SKU that may be bought past its free tier ────────
//
// Owner decision 2026-09-09 (after the Lane E photo audit): readers were
// seeing blank cards because the 950 free photo events vanish in the first
// two days of the month, and 15,199 catalogued photos sat cold. The fix the
// owner approved is NOT flipping WAYFIND_GATE to "open" (that re-enables
// every scheduled Google refresh path). It is an independent, photo-only
// paid switch with its own finite ceiling:
//
//   WAYFIND_PHOTOS_PAID=1          the explicit enable. Absent → nothing changes.
//   GOOGLE_PHOTOS_MONTH_CAP=2000   TOTAL photo events per month, free + paid,
//                                  counted by the same `photos` ledger row.
//                                  First 1,000 are Google's free allowance;
//                                  each further 1,000 bills $7. 2,000 ⇒ ≤ $7/mo.
//
// Both must be present and sane, and the gate must not be "shut", or the
// photos SKU behaves exactly as before (free tier 950). No other SKU reads
// these variables: effectiveCap/spendAllow/spendAllowCapped are untouched, and
// scripts/test-photos-paid-cap.mjs proves the switch cannot enable any other
// Google spend. The ceiling is a stop-loss counted down atomically by
// wf_spend_take; it is never "unlimited".
export function photosPaidCap() {
  return explicitCap("GOOGLE_PHOTOS_MONTH_CAP");
}
export function photosPaidEnabled() {
  if (gateMode() === "shut") return false;
  if (String(process.env.WAYFIND_PHOTOS_PAID || "").trim() !== "1") return false;
  return photosPaidCap() != null;
}

// ── A PRESENT-BUT-UNPARSEABLE CEILING IS THE MOST EXPENSIVE TYPO HERE ──────
//
// 2026-09-23 → 2026-09-28 incident. The photo cap was edited and for five days
// EVERY uncached photo request on gowayfind.com ended `ledger-denied` — 617,
// 804, 1,315 and 815 in a day, with ZERO served. Cards went blank site-wide.
//
// The mechanism is this file's own fail-closed design working exactly as
// written, and that is the problem: explicitCap() requires ^[1-9]\d*$, so a
// value a human would read as correct — "7,000" with the thousands comma,
// "7000 " with a stray space, "7k" — parses to null, photosPaidEnabled() goes
// false, and photosCeiling() quietly returns the 950 free tier. Mid-month,
// with 6,024 already counted, 950 means a total blackout. Nothing said so.
// Silently spending LESS is a safe failure for the budget and a catastrophic
// one for the product.
//
// This is the loud half. `photosPaidCapMisconfigured()` is true only in the
// one genuinely broken state — the variable is PRESENT and non-empty but does
// not parse — and is deliberately NOT true when the variable is simply absent,
// which is the legitimate "run on the free tier" configuration.
//
// scripts/check-photo-cap-parses.mjs runs it against the real build
// environment, so a value like "7,000" fails the BUILD and never reaches
// production. Vercel's build env carries these switches (see #1555), which is
// what makes a build-time check possible at all.
export function photosPaidCapRaw() {
  return String(process.env.GOOGLE_PHOTOS_MONTH_CAP ?? "");
}
export function photosPaidCapMisconfigured() {
  const raw = photosPaidCapRaw().trim();
  if (!raw) return false;          // absent is a choice, not a mistake
  return photosPaidCap() == null;  // present but unparseable is always a mistake
}
/** One operator-facing sentence, or null when the ceiling is fine. Never echoes the value. */
export function photosPaidCapProblem() {
  if (!photosPaidCapMisconfigured()) return null;
  return "GOOGLE_PHOTOS_MONTH_CAP is set but is not a plain positive integer (no commas, no spaces, no units), "
    + `so the photo ceiling has fallen back to the ${CAPS.photos} free-tier allowance. `
    + "Mid-month that serves no photos at all.";
}
/** The photo ceiling actually in force this month, or null when photos cannot be bought at all. */
export function photosCeiling() {
  if (gateMode() === "shut") return null;
  return photosPaidEnabled() ? photosPaidCap() : CAPS.photos;
}
// NON-PRODUCTION SPEND BLOCK (2026-09-16). A Preview deployment and a local
// `next dev` both run against the SAME production Supabase ledger and the
// SAME production GOOGLE_MAPS_SERVER_KEY as gowayfind.com — there is no
// separate "preview" or "dev" Google budget. Every photo request a reviewer's
// Preview URL or a developer's laptop happened to make was quietly spending
// the production photo ledger (and, past the free tier, real Google dollars)
// on traffic the owner never saw and could not attribute. Read at CALL TIME,
// never cached at module load: Vercel sets VERCEL_ENV per-request-context in
// some setups and this must never latch a stale value from whichever
// environment happened to import this module first.
export function spendAllowPhotosNonprodBlocked() {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.WAYFIND_ALLOW_NONPROD_PHOTO_SPEND !== "1";
}
/** One atomic grant for ONE outbound Place Photo media request. */
export async function spendAllowPhotos() {
  if (spendAllowPhotosNonprodBlocked()) return false;
  const cap = photosCeiling();
  if (!cap) return false;
  return takeFromLedger("photos", cap);
}
/** Same grant as spendAllowPhotos, but says WHY a refusal happened (photo path only). */
export async function spendAllowPhotosDetailed() {
  if (spendAllowPhotosNonprodBlocked()) return { ok: false, reason: "invalid" };
  const cap = photosCeiling();
  if (!cap) return { ok: false, reason: "invalid" };
  return takeFromLedgerDetailed("photos", cap);
}

// ── PROMOTION ONLY: the index→inventory drain may buy past its free tier ──
//
// Owner decision 2026-09-28 ("spend ten dollars if needed ... I need everything
// up there today"): 147 legitimate 9.0+ places sat queued because the promoter
// is clamped to details_pro's free tier in "free" mode. Same shape as the
// photo switch above, and just as narrow:
//
//   WAYFIND_PROMOTE_PAID=1            the explicit enable. Absent → nothing changes.
//   PROMOTE_DETAILS_MONTH_CAP=6650    TOTAL details_pro grants this month for the
//                                     promotion drain, free + paid, counted by the
//                                     same ledger row. ~$0.017 per grant past 5,000.
//
// It changes effectiveCap("details_pro", …) and nothing else. The only
// spendAllowCapped("details_pro") caller is app/api/cron/promote-index; the
// user-facing /api/places/details path uses spendAllow(), which reads the
// fixed CAPS table and is untouched. "shut" still means zero.
// scripts/test-promote-paid-cap.mjs proves every other SKU is unchanged.
export const PROMOTE_PAID_SKU = "details_pro";
export function promotePaidCap() {
  return explicitCap("PROMOTE_DETAILS_MONTH_CAP");
}
export function promotePaidEnabled() {
  if (gateMode() === "shut") return false;
  if (String(process.env.WAYFIND_PROMOTE_PAID || "").trim() !== "1") return false;
  return promotePaidCap() != null;
}

// spendAllowCapped — the SAME atomic ledger grant, but ALWAYS metered, in every
// gate mode. For a scheduled job that runs unattended (the promotion drain,
// 12x/hour) "open" must not mean "unbounded": the operator sets a monthly
// ceiling and this is what enforces it.
//
//   shut  -> false, always.
//   free  -> min(cap, Google's free tier for the SKU). The free tier is the
//            hard line; a bigger cap cannot buy past it in free mode.
//   open  -> cap, exactly. A finite number the ledger counts down atomically.
//
// A missing/invalid cap is FAIL-CLOSED (false), never "unlimited": the whole
// point is that no path to Google exists without a number in front of it.
export async function spendAllowCapped(sku, cap) {
  const mode = gateMode();
  if (mode === "shut") return false;
  const n = effectiveCap(sku, cap);
  if (!isFinite(n) || n <= 0) return false; // effectiveCap already fails closed; stated here too so the invariant reads in one place
  return takeFromLedger(sku, n);
}

/**
 * The number the ledger will actually be asked to honour for (sku, cap) in
 * the CURRENT gate mode — or null when the call cannot happen at all.
 * Exported so an operator-facing note can print the ceiling that applied,
 * not the one that was configured. 2026-09-02: the promotion drain sat idle
 * for 23 hours on Vercel (WAYFIND_GATE=free) while every release note read
 * "month_cap 7500 reached" — the ledger stood at 6,426/7,500. The line it
 * had hit was the free-tier 4,800, which this function makes visible.
 */
export function effectiveCap(sku, cap) {
  const mode = gateMode();
  if (mode === "shut") return null;
  const n = Math.floor(Number(cap));
  if (!isFinite(n) || n <= 0) return null;
  // Promotion-only paid ceiling (see promotePaidEnabled). Replaces the free-tier
  // clamp for details_pro ONLY; still a finite number the ledger counts down.
  if (sku === PROMOTE_PAID_SKU && promotePaidEnabled()) return promotePaidCap();
  const free = CAPS[sku];
  // A configured-only SKU has no invented free-tier number. Its explicit
  // finite operator ceiling remains the ledger limit in free mode; all other
  // unknown SKUs remain denied there.
  if (mode === "free") return free ? Math.min(n, free) : (CONFIGURED_CAP_SKUS.has(sku) ? n : null);
  return n;
}

/**
 * takeFromLedger with the REASON. Same single RPC, same 3s timeout, NO retry (a
 * timed-out take may already have counted; retrying could double-grant).
 * reason: granted | cap (the ledger itself said no) | reserve (a BACKGROUND job
 * asked inside the last HUMAN_RESERVE_SHARE of a visitor-shared SKU, see above;
 * a deliberate pause, not a failure) | daily (a background grant past its priority's
 * line of the Pacific day's counter, BACKGROUND DAILY LINE above; also a pause) | timeout (3s abort) |
 * http (non-ok status, fetch throw, or a non-boolean body) | unconfigured (no
 * Supabase env) | invalid (bad sku/cap). Only "cap" is a budget refusal; the
 * rest are operational failures that used to be counted as budget.
 */
// One atomic wf_spend_take RPC, 3s timeout, no retry. { ok, reason } as documented above.
async function callSpendTake(s, safeSku, safeCap) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const r = await fetch(s.url + "/rest/v1/rpc/wf_spend_take", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: s.key, Authorization: "Bearer " + s.key },
      body: JSON.stringify({ p_sku: safeSku, p_cap: safeCap }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!r.ok) return { ok: false, reason: "http" };
    const v = await r.json();
    if (v === true) return { ok: true, reason: "granted" };
    if (v === false) return { ok: false, reason: "cap" };
    return { ok: false, reason: "http" };
  } catch (e) {
    return { ok: false, reason: e && e.name === "AbortError" ? "timeout" : "http" };
  }
  finally { clearTimeout(timer); }
}

export async function takeFromLedgerDetailed(sku, cap) {
  const safeSku = String(sku || "").trim();
  const safeCap = Math.floor(Number(cap));
  if (!/^[a-z0-9_:-]{1,64}$/.test(safeSku) || !Number.isSafeInteger(safeCap) || safeCap <= 0) return { ok: false, reason: "invalid" };
  const s = cfg();
  if (!s) return { ok: false, reason: "unconfigured" };
  // HUMAN TRAFFIC RESERVE: only a job that declared itself BACKGROUND is checked.
  if (currentTraffic() === TRAFFIC.BACKGROUND) {
    const st = await backgroundReserveStatus(safeSku);
    if (st.applies && st.unreadable) return { ok: false, reason: "http" };
    if (st.applies && st.blocked) return { ok: false, reason: "reserve" };
  }
  // BACKGROUND DAILY LINE: a background/refresh grant of a Place Details SKU first
  // ticks the Pacific day's counter at its priority's line (see above). Visitors
  // never reach this branch. A counter that cannot answer refuses (fail closed).
  let dailySku = null;
  const priority = currentBackgroundPriority();
  if (priority && GOOGLE_DETAILS_DAILY_SKUS.includes(safeSku)) {
    dailySku = backgroundDailySku();
    const d = await callSpendTake(s, dailySku, backgroundDailyLine(priority));
    if (!d.ok) return { ok: false, reason: d.reason === "cap" ? "daily" : d.reason };
  }
  const g = await callSpendTake(s, safeSku, safeCap);
  // A day tick for a call that was never allowed is given back (best effort; a lost
  // refund only makes the day read busier, which is the safe direction).
  if (!g.ok && dailySku) { try { await refundToLedger(dailySku, 1); } catch { /* best-effort */ } }
  return g;
}

export async function takeFromLedger(sku, cap) {
  return (await takeFromLedgerDetailed(sku, cap)).ok;
}

// REFUND (2026-09-16). Google's Places API (New) quota console can carry a
// MANUAL OVERRIDE far under the published default — verified 2026-09-16:
// `GetPhotoMediaRequest per day` overridden to 32 (Google's own default is
// 175,000), with the day's usage already at 34/32. Every refused request past
// that line answers RESOURCE_EXHAUSTED / PERMISSION_DENIED / UNAVAILABLE /
// INTERNAL, and per Google's own billing table
// (developers.google.com/maps/reporting-and-monitoring/reporting) NONE of
// those are billed — only OK, NOT_FOUND, and an INVALID_REQUEST "invalid
// parameter value" are. takeFromLedger() has no way to un-spend a grant once
// classification later reveals the attempt was free; this is that return
// path. Same atomic-RPC shape as takeFromLedger, same (month, sku) key
// (public.wf_spend_refund uses the identical
// to_char(now() at time zone 'utc','YYYY-MM') month), same fail-closed
// posture — an unreachable ledger or a missing RPC (the owner has not yet
// applied 20260916120000_wf_spend_refund_and_photo_outcomes.sql) returns
// false and changes nothing else; a lost refund only means the ledger reads
// a little more "spent" than the true Google bill, never the reverse, and
// never blocks a real request.
export async function refundToLedger(sku, n = 1) {
  const safeSku = String(sku || "").trim();
  const safeN = Math.floor(Number(n));
  if (!/^[a-z0-9_:-]{1,64}$/.test(safeSku) || !Number.isSafeInteger(safeN) || safeN <= 0) return false;
  const s = cfg();
  if (!s) return false;
  const refunded = await callSpendRefund(s, safeSku, safeN);
  // A background job's unbilled Place Details call gives back its tick of the day's
  // counter too (the grant that was taken is the grant being returned).
  if (currentBackgroundPriority() && GOOGLE_DETAILS_DAILY_SKUS.includes(safeSku)) {
    try { await callSpendRefund(s, backgroundDailySku(), safeN); } catch { /* best-effort */ }
  }
  return refunded;
}
async function callSpendRefund(s, safeSku, safeN) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const r = await fetch(s.url + "/rest/v1/rpc/wf_spend_refund", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: s.key, Authorization: "Bearer " + s.key },
      body: JSON.stringify({ p_sku: safeSku, p_n: safeN }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch { return false; }
  finally { clearTimeout(timer); }
}


// ── INVENTORY REFRESH: free-tier only, sub-capped, never a paid grant ──────
//
// Owner decision 2026-10-25 ("refresh, but I don't want to pay and don't want
// to lose anything"). The inventory-refresh cron may spend ONLY inside Google's
// free monthly lines, and only up to a sub-cap that leaves the rest of each line
// to the users that already exist (the site's own Details reads and the
// promoter).
//
// Free lines (Google pricing page, read 2026-10-25) and the maths:
//   Place Details Pro         5,000 free  CAPS 4,800  refresh half = 2,400
//   Place Details Enterprise  1,000 free  CAPS   950  refresh half =   475
//   Place Details Essentials 10,000 free  CAPS 9,500  refresh      = 8,000
//                                          (hotel identity keeps its 1,500)
// Every refresh grant is taken from the SAME ledger row as everybody else (so
// the total Google spend can never exceed what the owner already approved) AND
// from its own counter `refresh_<sku>` (so refresh cannot exceed its half).
// The shared-row ceiling used here is CAPS[sku], the free line, NEVER the
// promotion paid ceiling: when the promoter has pushed the row past the free
// line, refresh simply gets "no". Since 2026-11-03 (owner option b),
// discretionary site reads stop at siteReservedCap() above, so the refresh
// sub-cap slice of each free line is still there when refresh asks.
export const REFRESH_SUBCAPS = Object.freeze({ details_pro: 2400, details_enterprise: 475, details_essentials: 8000 });
// Pro and Enterprise refresh start with the November 2026 ledger month. The
// Essentials pass may run as soon as this ships.
export const REFRESH_RICH_TIERS_FROM_MONTH = "2026-11";
export function refreshCounterSku(sku) { return "refresh_" + sku; }
export function refreshTierAllowed(sku, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(REFRESH_SUBCAPS, sku)) return false;
  if (sku === "details_essentials") return true;
  return utcLedgerMonth(now) >= REFRESH_RICH_TIERS_FROM_MONTH;
}
/**
 * One grant for ONE inventory-refresh Place Details call. shut -> false.
 * Order matters: the refresh counter is taken FIRST, so a lost refund can only
 * ever shrink refresh itself; the shared row is taken second with the FREE line.
 */
export async function spendAllowRefresh(sku, now = new Date()) {
  if (gateMode() === "shut") return false;
  if (!refreshTierAllowed(sku, now)) return false;
  const free = CAPS[sku];
  const sub = REFRESH_SUBCAPS[sku];
  if (!free || !sub || sub > free) return false;
  if (!(await takeFromLedger(refreshCounterSku(sku), sub))) return false;
  if (await takeFromLedger(sku, free)) return true;
  await refundToLedger(refreshCounterSku(sku), 1);
  return false;
}

/**
 * Which RICH refresh tiers can still be granted this month? A cheap check (essentials,
 * pro) does not re-date content, so a row that was just cheap-checked is only worth
 * another call when a richer tier is affordable. Reads the same two rows spendAllowRefresh
 * takes from (the refresh sub-counter and the shared free line). An unreadable row
 * counts as NOT affordable (fail closed: no speculative call).
 */
export async function refreshRichAffordable(now = new Date()) {
  const out = { enterprise: false, pro: false };
  if (gateMode() === "shut") return out;
  for (const [tier, sku] of [["enterprise", "details_enterprise"], ["pro", "details_pro"]]) {
    if (!refreshTierAllowed(sku, now)) continue;
    const [sub, shared] = await Promise.all([readLedgerUsed(refreshCounterSku(sku), now), readLedgerUsed(sku, now)]);
    if (sub == null || shared == null) continue;
    out[tier] = sub < REFRESH_SUBCAPS[sku] && shared < CAPS[sku];
  }
  return out;
}
