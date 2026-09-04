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

// EXPORTED. The #486 extraction lifted this out of BookingCTA.js but left the
// component's own call site behind, and the component imported only
// bookingTargets/hasBookingCTA — so the default export threw
// "ReferenceError: Can't find variable: hasVerifiedTours" on EVERY place-detail
// render. Site-down class on the core surface.
export function hasVerifiedTours(viaTours, placeId) {
  const vt = viaTours && viaTours[placeId];
  return !!(vt && !vt.loading && Array.isArray(vt.items) && vt.items.length > 0);
}

// The bookable-place kinds that always warrant a booking action. Module-scope
// so the primary CTA and the commission disclosure derive from ONE source and
// can never drift — they did once, and an earning "Search Viator" rendered with
// NO disclosure (an FTC gap). scripts/test-sheet-booking.mjs keeps this list
// byte-identical to the card-chip + sheet tour-fetch gates.
// THE RELEVANCE GATE'S INPUT (2026-07-30, owner's confirming tap on The Ringling).
// The generic tracked-search fallback rendered "Search Viator" as the PRIMARY CTA
// on any bookable-kind, tickety place with no verified product — and for a place
// Viator does not actually cover, that search opens irrelevant inventory. The
// owner hit it on our flagship museum. Same class as the Tiqets-Vienna failure:
// an earning link that disappoints costs more than no link, because it spends
// trust we need for the NEXT click.
//
// The evidence is already in hand at zero extra cost: the sheet fetches
// /api/viator/tours per opened place (app/home.js) into viaTours, and that route
// is default-deny — a product only appears after clearing lib/verifiedOffers'
// hard invariant. So `verifiedCount > 0` is exactly "Viator has inventory that
// provably belongs to THIS place".
//
// `resolved:false` while the fetch is in flight, so a pending fetch suppresses
// rather than flashing a CTA we may be about to retract.
export function placeEvidence(viaTours, placeId) {
  const vt = viaTours && viaTours[placeId];
  if (!vt || vt.loading) return { resolved: false, verifiedCount: 0 };
  return { resolved: true, verifiedCount: Array.isArray(vt.items) ? vt.items.length : 0 };
}

export const BOOKABLE_KINDS = ["museum", "wildlife", "entertainment", "scenic", "beach", "nature", "landmark", "waterfront"];

// The single predicate for "this place shows a monetized booking CTA." Returns
// the resolved hrefs; `tu` is truthy exactly when SOME earning link renders (a
// verified Viator product, the honest tracked Viator search for a bookable
// kind, or a Stay22 hotel link). The primary button AND the disclosure line
// both read this, so a commission link can never appear without its disclosure.
export function bookingTargets(detail, kind, topItem, locName, opts) {
  const bcity = (() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : (locName ? locName.split(",")[0] : ""); } catch (e) { return ""; } })();
  // Founder P0 (dead money handoffs, 2026-08-19): verifiedUrl / tk is the
  // earning href. viatorDirectUrl writes www.viator.com?pid= into the DOM and
  // GuideConversion then skipped the page.js viatorProductGoUrl upgrade
  // because exact=!!t.verifiedUrl was already true. Hop through our go route
  // so the click is joinable and no raw partner URL sits on a Book button.
  // Gate on isTicketyPlace (type + beach exclusion), not ticketsUrl. ticketsUrl
  // is also a PID probe: without NEXT_PUBLIC_VIATOR_PID it returns null and
  // dropped a real product URL onto the search fallback. The go route applies
  // tracking server-side, so a curated/top-item URL must hop even when the
  // client module loaded without a PID.
  // v8.56.6 — A VERIFIED PRODUCT OUTRANKS A GOOGLE TYPE. This gated on
  // isTicketyPlace, which is a guess about whether anyone sells admission.
  // topItem is not a guess: it is a Viator product that resolved FOR THIS
  // PLACE. When the two disagree, the product is the better evidence, and the
  // type gate was costing real money — Myakka River State Park types as
  // [park, hiking_area] and its airboat tour is genuine Viator inventory.
  //
  // isNeverBookable still applies. That is the v6.53 owner call about beaches
  // and natural features, made with a screenshot, and it is not reopened by a
  // resolver result. The unverified SEARCH fallback below still requires the
  // full isTicketyPlace, because a search link with no product behind it is
  // exactly the Coquina->Mumbai failure.
  const verifiedUrl = (topItem && topItem.url && !Aff.isNeverBookable(detail))
    ? Aff.viatorProductGoUrl(topItem.url, bcity, kind, "detail")
    : null;
  // v6.60 (owner, Coquina->Mumbai bug): the fallback must ALSO clear
  // isTicketyPlace. BOOKABLE_KINDS includes beach/nature/scenic/waterfront for
  // legit tours, but a BEACH or natural feature is never bookable — without
  // this gate its geo-less "Search Viator" defaulted to Viator's featured
  // cities (Mumbai/Dubai). isTicketyPlace already knows this; now the CTA asks.
  //
  // v6.76 THE RELEVANCE GATE. The three conditions above (no verified product,
  // bookable kind, tickety place) say the fallback is PERMITTED. They never said
  // it was USEFUL. It now also requires evidence that Viator holds inventory for
  // this specific place — see placeEvidence() above.
  //
  // SCOPE: the gate applies to callers that PARTICIPATE in the evidence protocol
  // by passing placeEvidence — today that is the detail sheet, which already
  // fetches per-place Viator products and is the surface that disappointed the
  // owner. A caller that passes nothing is unchanged.
  //
  // That is default-ALLOW for non-participants, which is the less safe direction,
  // and it is deliberate: default-deny was tried first and check-guide-conversion
  // caught it cutting the GUIDE pages' monetized CTAs from 5+ to 1. Guides render
  // on the server with no per-place Viator fetch, so they have no evidence to
  // supply — denying them would have been an unrequested revenue cut on a
  // different surface to fix a detail-sheet bug.
  //
  // The drift risk (a future sheet-like caller silently getting the old
  // disappointing behaviour) is closed by assertion instead: scripts/
  // test-booking-resolve-extraction.mjs requires BookingCTA to pass evidence, so
  // the sheet cannot quietly opt out.
  const permitted = !verifiedUrl && BOOKABLE_KINDS.includes(kind) && Aff.isTicketyPlace(detail);
  const ev = (opts && opts.placeEvidence) || null;
  const gated = !!ev;
  const hasEvidence = !!(ev && ev.resolved && ev.verifiedCount > 0);
  const goFallback = (permitted && (!gated || hasEvidence)) ? Aff.experienceGoUrl(detail.name, bcity, kind, detail.id) : null;
  // Why it was withheld, for the fallback_suppressed event. Null when nothing
  // was withheld, so the caller cannot mistake "not applicable" for "suppressed".
  const fallbackSuppressed = (permitted && gated && !hasEvidence)
    ? (!ev.resolved ? "evidence_pending" : "no_verified_products")
    : null;
  const tk = verifiedUrl || goFallback;
  // Founder P0: Aff.hotelUrl is a raw booking.com search that Stay22 LinkSwap
  // rewrites in the page. That is not a tracked leave — no click_id, and the
  // rendered href is a partner URL. There is no durable Stay22 server hop in
  // this repo (do not invent a partner PID). Fail-closed: do not render an
  // earning "Check rates" that points at booking.com. Maps/Directions stay
  // the honest non-earn fallback on hotel-only places.
  const tu = tk;
  return { verifiedUrl, goFallback, tk, tu, fallbackSuppressed };
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
  // Passes the SAME evidence the primary variant uses. If it did not, the dock
  // would size a two-column grid for a button the relevance gate then withheld —
  // the exact "Directions stranded at half width beside a hole" bug from v6.44.
  return !!bookingTargets(detail, kind, topItem, locName, { placeEvidence: placeEvidence(viaTours, detail.id) }).tu;
}
