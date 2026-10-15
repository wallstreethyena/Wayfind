// lib/partnerPathInventory.js — SERVER-ONLY. Reads the REAL offer sources into the
// flat shape lib/partnerPathHealth.js evaluates. Imported by the partner-path cron
// and by guards; never by app/ client code (check-bundle ratchet).
//
// Sources (all code, plus one DB read the caller supplies):
//   clipp               lib/coupons.js COUPONS (dated: CLIPP_AUDIT_EXPIRY / CLIPP_MERCHANT_AUDIT_EXPIRY)
//   tiqets/klook/gocity lib/partnerOfferRegistry.js (a mapped, resolvable product; no expiry, so evergreen)
//                       + their dated coupons in lib/coupons.js
//   stay22              lib/hotelBookingVerification.js allow-list (the fail-closed booking gate)
//   undercover_tourist  wf_deals rows passed in by the cron (active, link_ok !== false, not past ends_at)
//
// Absent configuration fails loudly (AGENTS.md §5): when `dbDeals` is not an array the
// UT provider is reported UNMEASURED, never as "0 offers" or as healthy.
import { COUPONS } from "./coupons.js";
import { siteTodayStr } from "./siteTime.js";
import { CLIPP_MARKETS } from "./clippOffers.js";
import { PARTNER_OFFER_REGISTRY } from "./partnerOfferRegistry.js";
import { hotelBookingRecords } from "./hotelBookingVerification.js";

/**
 * wf_deals.ends_at is a timestamptz in UTC. An offer ending Oct 31 at 23:59 ET is
 * stored 2026-11-01T03:59Z, and slicing that as text reads Nov 1 - a day LATE,
 * which hides a lapsing offer from the renewal window for a day and keeps it
 * "live" a day too long. The path's `expires` is the last LIVE DAY (same meaning
 * as COUPONS.expires), so convert the instant to its America/New_York date.
 * A bare YYYY-MM-DD is already a calendar date and passes through.
 */
export function etDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return s.slice(0, 10);
  return siteTodayStr(t);
}

const REGISTRY_PROVIDERS = ["tiqets", "klook", "gocity"];

export const REQUIRED_CITIES = Object.freeze({
  clipp: Object.freeze(CLIPP_MARKETS.map((m) => m.city)),
});

export function collectPartnerOffers({ dbDeals, coupons = COUPONS, registry = PARTNER_OFFER_REGISTRY, hotels = hotelBookingRecords() } = {}) {
  const offers = [];
  for (const c of coupons) {
    const provider = c && c.commerce && c.commerce.provider;
    if (!provider) continue;
    offers.push({ provider, offerId: c.id, city: c.area || null, expires: c.expires ? String(c.expires).slice(0, 10) : null, eligible: Boolean(c.id && c.title) });
  }
  for (const [offerId, o] of Object.entries(registry)) {
    if (!REGISTRY_PROVIDERS.includes(o.provider)) continue;
    offers.push({ provider: o.provider, offerId, city: null, expires: null, eligible: Boolean(o.destination) });
  }
  for (const h of hotels) {
    if (h && h.placeId) offers.push({ provider: "stay22", offerId: h.key || h.placeId, city: null, expires: null, eligible: true });
  }
  const unmeasured = [];
  if (Array.isArray(dbDeals)) {
    for (const d of dbDeals) {
      if (!d || d.provider !== "undercover_tourist") continue;
      const eligible = d.active !== false && d.link_ok !== false; // null (unknown) serves; only a proven-dead row refuses
      offers.push({ provider: "undercover_tourist", offerId: String(d.id), city: null, expires: etDate(d.ends_at), eligible });
    }
  } else {
    unmeasured.push("undercover_tourist");
  }
  return { offers, unmeasured };
}
