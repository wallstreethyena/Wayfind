// lib/hotelImage.js — ONE image resolver for every hotel card (2026-09-17).
//
// Owner rule: resolve the exact property first, then pick the best image the
// law allows. Never a generic hotel picture, never another property's photo,
// never a scraped booking page, never an image whose provider terms forbid
// independent display.
//
// Ladder (first hit wins):
//   0. Identity. A card must name its property by a Google place id (or carry
//      a photo ref / owned URL already bound to that place). No identity means
//      no photo: the card shows the branded fallback, never a guess by name.
//   1. Affiliate property images, from HOTEL_IMAGE_PROVIDERS only. A provider
//      is eligible only when its media terms explicitly allow independent use
//      (termsAllowIndependentUse) and it supplies attribution. A candidate must
//      name the SAME Google place id. The widest valid image wins, whichever
//      provider receives the booking click. It may be vaulted only when the
//      provider's terms say so (vaultAllowed).
//      TODAY THE REGISTRY IS EMPTY, on purpose: the configured hotel partners
//      (Stay22 LinkSwap, Vrbo search template, the retired Booking.com CJ
//      link) are search redirects that return no property media at all, and
//      Travelpayouts retired its Hotellook API. A provider is added here only
//      with a written terms reference.
//      VERIFIED 2026-09-22: Booking.com's Demand API DOES return property
//      photos (/accommodations/details, extras: ["photos"]), and its
//      permitted-use terms allow storing/hotlinking the photo URL — but only
//      for an approved Managed Affiliate Partner under a signed contract, and
//      never by downloading, re-hosting or altering the image, or caching
//      price/availability. lib/hotelImageProviders/bookingDemand.js ships an
//      adapter of this exact shape with termsAllowIndependentUse: false and
//      vaultAllowed: false, but it is deliberately NOT imported below.
//
//      THE SWITCH-ON PROCEDURE, when a provider becomes legally usable
//      (e.g. the Booking contract above is signed):
//        1. Register the adapter: import it here and add it to the array
//           HOTEL_IMAGE_PROVIDERS is frozen around, e.g.
//           `Object.freeze([bookingDemandProvider])`. Do not reorder or
//           touch the ladder above — the registry only ever feeds rung 1.
//        2. Supply attribution: every image the adapter's images() returns
//           must carry non-empty `attribution` text — validProviderImage()
//           below refuses any image without it, and
//           scripts/check-hotel-image-provider-terms.mjs enforces the same
//           rule against the live registry.
//        3. Flip termsAllowIndependentUse to true ONLY with a written terms
//           reference: the owner records, in the same commit, the signed
//           contract's own reference (a dated doc id/URL to the executed
//           agreement) — never a sales email or a ticket, and never the
//           public termsRef alone, which only documents what the terms say,
//           not that Wayfind has accepted them.
//        4. vaultAllowed stays false unless that same written terms
//           reference says Wayfind may keep a copy of the image bytes; for
//           Booking specifically it can never turn true, because Booking's
//           terms forbid downloading or re-hosting the image under any
//           contract. No provider image may EVER be copied into Wayfind's
//           vault (lib/photoVault.js) unless the provider's own
//           vaultAllowed is true — bestProviderImage() below only ever
//           returns a src for hotlinking, and callers must not vault it
//           themselves on the side.
//   2. Wayfind licensed storage / an owned URL on the row (vault copy,
//      owned upload), via lib/placePhoto's isPlaceOwnedPhotoUrl.
//   3. The same-property Google photo path: the row's own photo ref (only if
//      the ref belongs to this place), else /api/photo?place=<id>. The route
//      serves the licensed vault copy first when one exists and takes a
//      ledger-gated Google grant otherwise.
//   4. null: the card renders the branded fallback (monogram).
import { isPlaceOwnedPhotoUrl, photoRefOwnedByPlace, ownedPlacePhotoSrc, isGooglePlaceId } from "./placePhoto.js";
import { isHotlinkRefusedImage, isFreeSourceHotlink } from "./imageHostPolicy.js";

/**
 * Registered hotel image providers. Each entry:
 * { id, termsRef, termsAllowIndependentUse: boolean, vaultAllowed: boolean,
 *   images(identity) -> Array<{ url, width, height, placeId, attribution }> }
 * `images` must be synchronous and read already-fetched data; this resolver
 * runs inside card mappers and never makes network calls.
 *
 * SHIPS EMPTY AND FROZEN, ON PURPOSE (see the ladder comment above for the
 * full switch-on procedure). An adapter existing in
 * lib/hotelImageProviders/ (e.g. bookingDemand.js) is not the same as it
 * being legally usable: it is added to this array only once its terms are
 * written down here and its termsAllowIndependentUse is true for a real,
 * signed reason. Keep this array frozen even after adding an entry, so a
 * caller cannot push onto it at runtime.
 */
export const HOTEL_IMAGE_PROVIDERS = Object.freeze([]);

/** The exact property identity of a hotel card row, or null. */
export function hotelIdentity(row) {
  if (!row || typeof row !== "object") return null;
  const candidates = [row.googlePlaceId, row.gpid, row.place_id, row.placeId, row.id];
  for (const c of candidates) {
    const id = String(c || "").trim();
    if (isGooglePlaceId(id)) return { placeId: id, name: row.name || null };
  }
  return null;
}

function validProviderImage(img, identity) {
  if (!img || typeof img !== "object") return false;
  if (img.placeId !== identity.placeId) return false; // exact property only
  const url = String(img.url || "");
  if (!/^https:\/\//i.test(url)) return false;
  if (!isPlaceOwnedPhotoUrl(url) || isHotlinkRefusedImage(url) || isFreeSourceHotlink(url)) return false;
  if (!String(img.attribution || "").trim()) return false;
  return Number(img.width) > 0;
}

/** Best eligible affiliate image for this exact property, or null. */
export function bestProviderImage(identity, providers = HOTEL_IMAGE_PROVIDERS) {
  if (!identity) return null;
  let best = null;
  for (const p of providers || []) {
    if (!p || p.termsAllowIndependentUse !== true || !String(p.termsRef || "").trim()) continue;
    let list = [];
    try { list = p.images(identity) || []; } catch { list = []; }
    for (const img of list) {
      if (!validProviderImage(img, identity)) continue;
      if (!best || Number(img.width) > Number(best.width)) {
        best = { url: String(img.url), width: Number(img.width), provider: p.id, attribution: String(img.attribution), vaultAllowed: p.vaultAllowed === true };
      }
    }
  }
  return best;
}

/**
 * The card image for a hotel row. Returns { src, source, attribution? } or
 * { src: null, source: "fallback" }.
 */
export function resolveHotelCardImage(row, { w = 640, providers = HOTEL_IMAGE_PROVIDERS } = {}) {
  const identity = hotelIdentity(row);
  const signals = (row && row.signals && typeof row.signals === "object") ? row.signals : {};
  const owned = [row?.photo_url, row?.photoUrl, signals.photo_url, signals.photoUrl, row?.photos?.[0]?._directUri].find((u) => isPlaceOwnedPhotoUrl(u));

  if (identity) {
    const aff = bestProviderImage(identity, providers);
    if (aff) return { src: aff.url, source: "affiliate:" + aff.provider, attribution: aff.attribution };
  }
  if (owned) return { src: String(owned), source: "owned" };
  if (!identity) return { src: null, source: "fallback" };

  const refs = [row?.photo_ref, row?.photoRef, row?.photos?.[0]?.name];
  const ref = refs.find((r) => photoRefOwnedByPlace(r, identity.placeId));
  if (ref) return { src: "/api/photo?ref=" + encodeURIComponent(ref) + "&g=2&w=" + (Number(w) || 640), source: "google-ref" };
  const byPlace = ownedPlacePhotoSrc(identity.placeId, w);
  return byPlace ? { src: byPlace, source: "same-place" } : { src: null, source: "fallback" };
}

/** Convenience: just the src (or null). */
export function hotelCardImageSrc(row, opts) {
  return resolveHotelCardImage(row, opts).src;
}
