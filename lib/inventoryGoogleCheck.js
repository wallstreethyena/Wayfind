// lib/inventoryGoogleCheck.js — the free-tier "is this place still in Google?"
// check for wf_inventory, as PURE planning code plus one small fetcher.
//
// OWNER DECISION 2026-10-25: "refresh, but I don't want to pay and don't want to
// lose anything." Three tiers, each billed at the highest SKU of any field it
// asks for (developers.google.com/maps/documentation/places/web-service/data-fields,
// read 2026-10-25):
//
//   essentials  id, location, movedPlaceId    Essentials (10,000 free / month)
//   pro         + businessStatus              Pro        ( 5,000 free / month)
//   enterprise  lib/placeDetails FIELDS       Enterprise ( 1,000 free / month)
//
// (movedPlaceId is Essentials IDs-Only; location is Essentials; businessStatus
// is Pro; rating / hours / priceLevel are Enterprise.)
//
// WHAT EACH TIER MAY DATE. `refreshed_at` is the age of Google CONTENT
// (rating, hours...). Only the enterprise tier returns that content, so only it
// moves refreshed_at (through lib/inventoryRefreshPatch.js, unchanged contract).
// The essentials and pro tiers move NOTHING that means "content is fresh". They
// stamp signals.google_checked_at / google_check_tier, and record the fresh
// Google coordinate as its own dated independent_coords entry (method
// CHECK_METHOD, source google_places) so the map's 30-day coordinate clock
// (lib/coordProvenance.js) runs from the moment Google returned it.
//
// NEVER LOSE ANYTHING. Pure plan, no deletes: a field is patched only from a
// real Google value; NOT_FOUND only adds a flag; a locked row never has its
// coordinates or status touched; nothing here sets excluded.
import { FLORIDA_BBOX, CONSISTENCY_MAX_M, haversineM } from "./sightingRenewal.js";
import { gateShut } from "./spendGate.js";
import { INVENTORY_CHECK_METHOD } from "./coordProvenance.js";

export const CHECK_METHOD = INVENTORY_CHECK_METHOD;
export const TIERS = Object.freeze(["essentials", "pro", "enterprise"]);
export const TIER_SKU = Object.freeze({ essentials: "details_essentials", pro: "details_pro", enterprise: "details_enterprise" });
export const ESSENTIALS_MASK = "id,location,movedPlaceId";
export const PRO_MASK = "id,location,movedPlaceId,businessStatus";
const STATUSES = new Set(["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY", "FUTURE_OPENING"]);

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
function inFl(lat, lng) {
  const b = FLORIDA_BBOX;
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
}

/** Is this row one the check may touch coordinates/status of? Locked rows are flag-only. */
export function rowIsFlagOnly(row) { return !row || row.locked === true; }

/**
 * Pure plan for a cheap (essentials | pro) check.
 * outcome: { kind: "ok", place } | { kind: "not_found" }
 * Returns { update, expect } or null. `update` holds ONLY columns to write;
 * `expect` holds the exact signals / independent_coords the plan was judged on
 * (the caller makes the write a compare-and-swap on them).
 */
export function planCheck(row, tier, outcome, now = Date.now()) {
  if (!row || !row.place_id || tier === "enterprise" || !TIERS.includes(tier) || !outcome) return null;
  const at = new Date(now).toISOString();
  const base = isObj(row.signals) ? row.signals : {};
  const sig = { ...base, google_checked_at: at, google_check_tier: tier };
  if (tier === "essentials") sig.essentials_checked_at = at;
  if (tier === "pro") sig.pro_checked_at = at;
  const update = { signals: sig };
  const expect = { signals: row.signals ?? null, independent_coords: row.independent_coords ?? null };

  if (outcome.kind === "not_found") {
    // A flag for owner review. Never excluded, never removed, never re-dated.
    if (!base.google_not_found_at) sig.google_not_found_at = at;
    sig.google_not_found_last_at = at;
    return { update, expect };
  }
  if (outcome.kind !== "ok" || !isObj(outcome.place)) return null;
  const place = outcome.place;
  if (base.google_not_found_at && !sig.google_found_again_at) sig.google_found_again_at = at;
  if (typeof place.movedPlaceId === "string" && place.movedPlaceId) sig.google_moved_place_id = place.movedPlaceId;
  // Google answered with a different id than we asked for: record it, trust nothing else.
  if (place.id && place.id !== row.place_id) { sig.google_returned_id = place.id; return { update, expect }; }
  if (rowIsFlagOnly(row)) return { update, expect };

  // Status only from the Pro tier, only when Google gave a recognised value.
  if (tier === "pro" && typeof place.businessStatus === "string" && STATUSES.has(place.businessStatus)) {
    if (place.businessStatus !== row.status) update.status = place.businessStatus;
  }

  // Coordinate: a dated entry, never an overwrite of lat/lng.
  const loc = isObj(place.location) ? place.location : {};
  const lat = num(loc.latitude), lng = num(loc.longitude);
  if (lat != null && lng != null && inFl(lat, lng) && !(lat === 0 && lng === 0)) {
    const rl = num(row.lat), rg = num(row.lng);
    const d = rl != null && rg != null ? haversineM(rl, rg, lat, lng) : null;
    if (d != null && d > CONSISTENCY_MAX_M) {
      // Too far from the stored pin to draw blindly: flag it, keep both.
      sig.google_coord_shift_m = Math.round(d);
      sig.google_coord_shift_at = at;
    } else {
      const entry = { source: "google_places", lat, lng, observed_at: at, method: CHECK_METHOD, attribution: null, verified: false };
      const coords = Array.isArray(row.independent_coords) ? row.independent_coords : [];
      const others = coords.filter((e) => !(isObj(e) && e.method === CHECK_METHOD));
      update.independent_coords = [...others, entry];
    }
  }
  return { update, expect };
}

function relabel(plan, tier) {
  const sig = plan.update.signals;
  sig.google_check_tier = tier;
  if (tier !== "essentials") delete sig.essentials_checked_at;
  if (tier !== "pro") delete sig.pro_checked_at;
  return plan;
}

/**
 * Enterprise tier. `patch` is lib/inventoryRefreshPatch.inventoryRefreshPatch's
 * dated patch for the content Google just returned (or null when it could not be
 * dated / had no usable coordinate). With a patch the row is re-dated exactly as
 * before (never blanking: that patch only carries real Google values). Without
 * one, or for a locked row, only the cheap flag/coordinate plan applies.
 */
export function planEnterprise(row, outcome, patch, now = Date.now()) {
  if (!row || !outcome) return null;
  if (outcome.kind === "ok" && patch && !rowIsFlagOnly(row)) {
    const at = new Date(now).toISOString();
    const base = isObj(row.signals) ? row.signals : {};
    const sig = { ...base, google_checked_at: at, google_check_tier: "enterprise" };
    if (base.google_not_found_at && !sig.google_found_again_at) sig.google_found_again_at = at;
    return { update: { ...patch, signals: sig }, expect: { signals: row.signals ?? null, independent_coords: null } };
  }
  const p = planCheck(row, outcome.kind === "ok" ? "pro" : "essentials", outcome, now);
  return p ? relabel(p, "enterprise") : null;
}

/**
 * Which tier does this run try for this row, given which grants it can still
 * get? Highest-value first; flag-only (locked) rows only ever use essentials.
 * allow: { enterprise: bool, pro: bool, essentials: bool } (already granted-or-not
 * is decided by the caller, one ledger grant per call, so this just orders).
 */
export function tierOrder(row) {
  if (rowIsFlagOnly(row)) return ["essentials"];
  return ["enterprise", "pro", "essentials"];
}

/**
 * One live Place Details call. Returns { kind: "ok", place } | { kind: "not_found" }
 * | { kind: "denied", status, body } (403/429: stop the run) | { kind: "error", status }.
 * `billed` is true only for the statuses Google bills (OK, NOT_FOUND, invalid
 * argument), so the caller can refund the grant of an unbilled failure.
 */
export async function fetchGoogleCheck(placeId, mask, { key, fetchFn = fetch, signal } = {}) {
  // Kill switch inside the only function that reaches Google: shut = zero calls.
  if (gateShut()) return { kind: "error", status: 0, billed: false };
  let r;
  try {
    r = await fetchFn(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      cache: "no-store", signal,
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask },
    });
  } catch { return { kind: "error", status: 0, billed: false }; }
  if (r.ok) {
    try { return { kind: "ok", place: await r.json(), billed: true }; } catch { return { kind: "error", status: 200, billed: true }; }
  }
  if (r.status === 404) return { kind: "not_found", billed: true };
  if (r.status === 403 || r.status === 429) {
    let body = ""; try { body = (await r.text()).slice(0, 200); } catch {}
    return { kind: "denied", status: r.status, body, billed: false };
  }
  return { kind: "error", status: r.status, billed: r.status === 400 };
}
