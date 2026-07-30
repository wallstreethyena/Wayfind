// lib/bookingResolve.js — THE single booking-CTA resolver, server-safe.
//
// WHY THIS FILE EXISTS. bookingTargets() and hasBookingCTA() were defined inside
// app/components/BookingCTA.js, a "use client" component. The guide pages are
// SERVER components, so they could not reach the predicate — and were instead
// calling Aff.experienceGoUrl()/hotelSearchUrl() directly, per pick. That is
// exactly the parallel resolution path the booking-integrity contract forbids:
// two ways to turn a place into a booking href, which is how an earning link
// once rendered with NO FTC disclosure.
//
// Importing the client component into a server page was not an option either —
// that is what 500'd /eat/[metro]/[cuisine] on 2026-07-29 with
// "TypeError: m is not a function". So the resolver moves DOWN into lib/, and
// both callers import it:
//     app/components/BookingCTA.js   (client — the Detail sheet)
//     app/guides/[slug]/page.js      (server — the guide primary CTA)
// ONE predicate, TWO callers. Not a second path.
//
// The logic below is lifted VERBATIM from BookingCTA.js. scripts/test-booking-
// resolve-extraction.mjs proves the client component's rendered output is
// byte-identical before and after, and check-booking-cta.mjs still enforces that
// nothing else constructs a booking URL.
//
// Server-safe means: no "use client", no React, no browser globals. It imports
// only lib/affiliates, which is already server-safe (lib/landing.js uses it).
import * as Aff from "./affiliates.js";

function hasVerifiedTours(viaTours, placeId) {
  const vt = viaTours && viaTours[placeId];
  return !!(vt && !vt.loading && Array.isArray(vt.items) && vt.items.length > 0);
}

// The bookable-place kinds that always warrant a booking action. Module-scope
// so the primary CTA and the commission disclosure derive from ONE source and
// can never drift — they did once, and an earning "Search Viator" rendered with
// NO disclosure (an FTC gap). scripts/test-sheet-booking.mjs keeps this list
// byte-identical to the card-chip + sheet tour-fetch gates.
export const BOOKABLE_KINDS = ["museum", "wildlife", "entertainment", "scenic", "beach", "nature", "landmark", "waterfront"];

// The single predicate for "this place shows a monetized booking CTA." Returns
// the resolved hrefs; `tu` is truthy exactly when SOME earning link renders (a
// verified Viator product, the honest tracked Viator search for a bookable
// kind, or a Stay22 hotel link). The primary button AND the disclosure line
// both read this, so a commission link can never appear without its disclosure.
export function bookingTargets(detail, kind, topItem, locName) {
  const bcity = (() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : (locName ? locName.split(",")[0] : ""); } catch (e) { return ""; } })();
  const verifiedUrl = (topItem && Aff.ticketsUrl(detail)) ? (Aff.viatorDirectUrl(topItem.url) || topItem.url) : null;
  // v6.60 (owner, Coquina->Mumbai bug): the fallback must ALSO clear
  // isTicketyPlace. BOOKABLE_KINDS includes beach/nature/scenic/waterfront for
  // legit tours, but a BEACH or natural feature is never bookable — without
  // this gate its geo-less "Search Viator" defaulted to Viator's featured
  // cities (Mumbai/Dubai). isTicketyPlace already knows this; now the CTA asks.
  const goFallback = (!verifiedUrl && BOOKABLE_KINDS.includes(kind) && Aff.isTicketyPlace(detail)) ? Aff.experienceGoUrl(detail.name, bcity, kind, detail.id) : null;
  const tk = verifiedUrl || goFallback;
  const tu = tk || Aff.hotelUrl(detail);
  return { verifiedUrl, goFallback, tk, tu };
}

// v6.44 (owner-reported, with a photo). The Detail sheet's action dock is a
// two-column grid whose second cell is <BookingCTA variant="primary">. When
// that variant returns null the cell stayed empty and "Directions" was
// stranded at half width beside a hole. The dock needs to know whether the
// CTA will render BEFORE it chooses its grid template, so it asks here.
// This derives from the SAME bookingTargets() the primary variant gates on —
// one predicate, so the layout and the button can never disagree — and it
// returns a BOOLEAN ONLY, never a URL, so it cannot become a second path for
// constructing a booking href (the invariant check-booking-cta.mjs enforces).
export function hasBookingCTA(detail, kind, viaTours, locName) {
  if (!detail) return false;
  const hasTours = hasVerifiedTours(viaTours, detail.id);
  const topItem = hasTours ? viaTours[detail.id].items[0] : null;
  return !!bookingTargets(detail, kind, topItem, locName).tu;
}
