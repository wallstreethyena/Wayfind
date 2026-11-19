// The verified deal for ONE business, wherever Wayfind mentions it by identity.
//
// Owner ask (2026-11-19): "i need clipp to be added to guide and places where
// the businesses are being mentioned". Place CARDS already resolve a coupon
// (couponForPlace -> the Deal pill) and the in-app detail sheet already shows
// it, but three surfaces that NAME a business never did:
//   · /places/<id>         the public, shareable place page (Google, shared links)
//   · a guide pick         the numbered recommendation inside /guides/<slug>
//   · a guide place rail   the photo list a guide inserts between picks
// A reader who landed on Toastique's own page, or read a guide that names a
// Clipp venue, saw the business and no way to buy its certificate.
//
// IDENTITY ONLY, NEVER A NAME. This takes a Google Place ID and nothing else.
// couponForPlace() has a name fallback for cards that carry nothing better, but
// a guide pick name like "Gecko's Grill & Pub" matches three different branch
// offers and the name map keeps whichever it saw first: wrong-branch monetized
// inventory, which check-coupon-place-match exists to stop. No id, no deal.
//
// ONE resolver. Liveness, quarantine, expiry and the Clipp health overlay are
// all decided by lib/coupons.js (couponForPlace + resolveLiveCoupon); this file
// only reshapes the row and re-labels the surface of OUR OWN tracked redirect,
// so a deal shown here can never disagree with the card pill or the sheet.
//
// Pure and node-importable (no React, no browser globals) so a guard can call
// it directly against the real registry.
import { couponForPlace, resolveLiveCoupon, couponEndsLabel } from "./coupons.js";
import { commerceHref } from "./commerce.js";
import { siteTodayStr } from "./siteTime.js";

export const PLACE_PAGE_DEAL_SURFACE = "place_page_deal";
export const GUIDE_PICK_DEAL_SURFACE = "guide_pick_deal";
const SURFACES = new Set([PLACE_PAGE_DEAL_SURFACE, GUIDE_PICK_DEAL_SURFACE]);

// A real Google Place ID shape. Anything else (a slug, a name, "undefined")
// resolves to nothing rather than being looked up.
const PLACE_ID_RX = /^[A-Za-z0-9_-]{10,}$/;

/**
 * @param {string} placeId   Google Place ID of the business being mentioned
 * @param {object} opts      { surface, contentId, today }
 * @returns serializable deal for a client island, or null (fail closed)
 */
export function placeDealFor(placeId, { surface, contentId, today } = {}) {
  const id = String(placeId == null ? "" : placeId).trim().replace(/^places\//, "");
  if (!PLACE_ID_RX.test(id)) return null;
  if (!SURFACES.has(surface)) return null;
  const day = today || siteTodayStr();
  // place_id ONLY: no `name` key, so couponForPlace cannot fall through to the
  // name map (its name fallback reads place.name, which is undefined here).
  const hit = couponForPlace({ place_id: id }, day);
  const c = hit ? resolveLiveCoupon(hit) : null;
  if (!c || !c.title) return null;

  const provider = c.commerce && c.commerce.provider ? String(c.commerce.provider) : null;
  const offerId = c.commerce && c.commerce.offerId ? String(c.commerce.offerId) : null;
  const content = String(contentId || id).slice(0, 120);
  let href = null;
  let commerce = null;
  if (provider && offerId) {
    // Our tracked redirect, surface named for WHERE it was shown.
    href = commerceHref({ provider, offerId, surface, contentId: content });
    commerce = { surface, provider, offer_id: offerId, content_id: content };
  } else if (/^https:\/\//.test(String(c.url || "")) || String(c.url || "").startsWith("/")) {
    // A free, non-affiliate venue offer (e.g. a museum's free day): the
    // registry's own link, untouched, and no commerce event.
    href = String(c.url);
  }
  if (!href) return null;

  return {
    id: c.id,
    placeId: id,
    business: c.business || null,
    title: c.title,
    details: c.details || null,
    code: c.code || null,
    cta: c.cta || (c.code ? "Show code" : "View deal"),
    // A Clipp row's `expires` is OUR audit recheck date (CLIPP_MERCHANT_AUDIT_EXPIRY),
    // not a date Clipp states for the offer, so it is never printed as "Ends …":
    // that would be a manufactured deadline. It still hides the deal on time.
    ends: provider === "clipp" ? null : (couponEndsLabel(c) || null),
    // Raw date so the client island can hide a deal that expired after a
    // cached (ISR) page was rendered. Null = open-ended.
    expires: c.expires ? String(c.expires).slice(0, 10) : null,
    href,
    external: !href.startsWith("/"),
    commerce,
  };
}
