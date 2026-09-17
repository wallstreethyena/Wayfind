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
