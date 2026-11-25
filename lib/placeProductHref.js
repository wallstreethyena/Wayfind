// lib/placeProductHref.js — the ONE href builder for a place's VERIFIED booking
// product (wf_place_products rn = 1, surfaced by /api/place-products).
//
// WHY (partner deep-link audit, 2026-11-25). Two surfaces held a verified
// product for a place and still sent the click to a Viator SEARCH page:
//
//   1. The place card's "Book a tour" button passed the PLACE (no product code,
//      no exactProductUrl) to ViatorCommerceLink, which then fell to its search
//      mode: /api/viator/go?q=<place name>&intent=search. The button promised a
//      product and opened searchResults — the owner's "Search-as-Book" failure.
//   2. The Detail sheet's tour list read only viaTours (/api/viator/tours). When
//      that resolver found nothing it painted "Search Viator — No verified
//      product for this place" even when wf_place_products held one (Tampa Bay
//      History Center, Orlando Science Center: 6 search clicks in 30 days).
//
// This builder sends both to the exact product through /api/viator/go's strict
// ?product= passthrough (host + shape re-validated server-side, attribution
// re-applied there). It fails CLOSED: anything that is not a viator.com PRODUCT
// path (/d<dest>-<CODE>) returns null, so a poisoned or non-product row becomes
// no button rather than a search page or a homepage.
//
// Pure and server-safe (no React, no browser globals) so guards can CALL it.
import { viatorProductGoUrl } from "./affiliates.js";

const VIATOR_PRODUCT_PATH = /^https:\/\/(?:www\.)?viator\.com\/tours\/[^/?#\s]+\/[^/?#\s]+\/d\d+-([A-Za-z0-9]+)\/?(?:[?#].*)?$/i;

/** The Viator product code in a product URL, or null when it is not a product page. */
export function placeProductCode(url) {
  const m = String(url || "").trim().match(VIATOR_PRODUCT_PATH);
  return m ? m[1] : null;
}

/**
 * @param {{provider?: string, url?: string}|null} product  /api/place-products row
 * @param {{city?: string, kind?: string, surface: string, contentId?: string}} ctx
 * @returns {string|null} an /api/viator/go?product= href, or null (no button)
 */
export function placeProductHref(product, ctx = {}) {
  if (!product || typeof product !== "object") return null;
  if (String(product.provider || "viator").toLowerCase() !== "viator") return null;
  const raw = String(product.url || "").trim();
  if (!placeProductCode(raw)) return null;
  // The stored query (Partner API pid/mcid/medium=api) rides along on purpose:
  // /api/viator/go re-stamps pid/mcid through withViatorTracking and keeps
  // medium=api, exactly as every other ?product= caller does. Only a fragment
  // is dropped.
  const clean = raw.replace(/#.*$/, "");
  const href = viatorProductGoUrl(clean, ctx.city || "", ctx.kind || "", ctx.surface || "place_product");
  if (!href) return null;
  return ctx.contentId ? href + "&content=" + encodeURIComponent(String(ctx.contentId)) : href;
}
