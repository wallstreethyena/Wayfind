// lib/placeData.js — SERVER-ONLY, JSX-FREE data + metadata layer for durable place
// pages. Split from the JSX renderer (lib/placePage.js) so this logic — the
// allowlist gate, the details merge, and the content-gated indexability — is unit
// testable without a React runtime.
import { cache } from "react";
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { getSkeleton } from "./placeIndex";
import { getPlaceDetails, peekPlaceDetails } from "./placeDetails";
import { getInventoryIdentity } from "./inventoryIdentity";
import { atlasPlaceFor, mergePlacePage, preferInventorySkeleton, shouldCallGooglePlaceDetails } from "./atlasPlaceAllowlist";
import { isNeverBookable } from "./affiliates";
import { placePartnerPick } from "./placePartnerPicks";
import { venueOfferFor } from "./venueOffers";
import { TP_PROGRAMS } from "./travelpayouts";

// Allowlist-gate + details merge, deduped per request (generateMetadata + the page
// both call it). Returns the merged place, or null when the id isn't indexed
// AND has no publish-ready Atlas card. getSkeleton() still runs first.
// Atlas-card ids never call getPlaceDetails (no Google). Identity prefers a
// wf_inventory row we already hold (name / lat / lng / signals) over Places.
// Indexed ids peek the pd1| cache and only spend Places when that cache is
// cold AND there is no Atlas copy to prefer.
export const loadPlace = cache(async (id) => {
  if (!id) return null;
  const atlas = atlasPlaceFor(id);
  const indexed = await getSkeleton(id);
  const inv = atlas ? await getInventoryIdentity(id) : null;
  const skel = preferInventorySkeleton(inv, indexed);
  if (!skel && !atlas) return null;
  const cached = (skel || atlas) ? await peekPlaceDetails(id) : null;
  let details = cached;
  if (shouldCallGooglePlaceDetails({ skel: indexed, cached, atlas })) {
    details = await getPlaceDetails(id);
  }
  return mergePlacePage(id, { skel, details, atlas });
});

export function cityOf(address) {
  if (!address) return null;
  const parts = String(address).split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || null);
}

/**
 * The bookable partner for a durable /places/[id] page, or null.
 *
 * LANE C. Before this, lib/placePage.js called placePartnerPick() alone, so a
 * VENUE_OFFERS row (lib/venueOffers.js — geo-gated, e.g. nyc-budget-911-memorial)
 * had no path onto the durable place page even when the Detail sheet could
 * already reach it through bookItTarget(). This is the same two-rung order the
 * sheet's own ladder now uses (lib/detailCta.js): the hand-verified, ungated
 * exact-name registry first, then the geo-gated venue map second.
 *
 * The venueOfferFor rung is refused for a beach / natural_feature identity —
 * VENUE_OFFERS names ticketed admission, never free ground, and this keeps
 * that rung from ever being asked to sell one (isNeverBookable is the SAME
 * predicate lib/affiliates.js already enforces for isTicketyPlace; it is
 * reused here, not re-implemented, so the two surfaces cannot drift). The
 * exact-name registry rung is untouched by this gate — an existing
 * PLACE_PARTNER_PICKS row for a beach-adjacent tour (e.g. the Turtle Beach
 * kayak product) is a founder-verified exception, exactly like step 1 of
 * resolveDetailCta, and this function must not re-litigate that call.
 *
 * @param {{name?:string, id?:string, address?:string, category?:string, types?:string[]}} p
 * @returns {{provider:string, offerId:string, merchant:string}|null}
 */
export function placePagePartner(p) {
  if (!p || !p.name) return null;
  const exact = placePartnerPick({ name: p.name, id: p.id });
  if (exact) return exact;
  if (isNeverBookable(p)) return null;
  const city = cityOf(p.address);
  if (!city) return null;
  const venue = venueOfferFor(p.name, city);
  if (!venue) return null;
  // VENUE_OFFERS rows carry no display merchant (they exist to resolve a
  // provider + offerId, nothing rendered reads them directly) — the exact
  // registry rows do. Same lookup lib/detailCta.js's "Tickets · {merchant}"
  // label would use for a Travelpayouts-family provider.
  return { ...venue, merchant: (TP_PROGRAMS[venue.provider] && TP_PROGRAMS[venue.provider].brand) || venue.provider };
}

// A page is INDEXABLE only when it carries real detail content — otherwise a
// name+rating skeleton is thin/doorway, so it renders for users but stays noindex.
export function isIndexable(p) {
  return !!(p && p.hasDetails && (p.address || p.description));
}

export async function placePageMetadata({ params }) {
  const p = await loadPlace(params.id);
  if (!p || !p.name) return { title: "Place not found — Wayfind", robots: { index: false, follow: true } };
  const url = `${SITE_URL}/places/${params.id}`;
  const city = cityOf(p.address);
  const title = `${p.name}${city ? " — " + city : ""} | Wayfind`;
  const bits = [p.category, p.rating != null ? p.rating + "★" : null, p.reviews ? `${p.reviews.toLocaleString()} reviews` : null].filter(Boolean);
  const description = (p.description || `${bits.join(" · ")}${p.address ? " · " + p.address : ""}. See it on Wayfind, then open for hours, directions, and what's nearby.`).slice(0, 300);
  // v9 (owner, 2026-09-23): "the share cards for all … everything on wayfind
  // that is sharable looks premium." /places/[id] used to fall through to
  // socialMeta()'s generic branded fallback (no image argument at all) — the
  // durable place page never got its own preview. The hero route resolves
  // this exact place's FREE, PERMANENT, licensed photo (wf_place_photo via
  // lib/freePhoto.js — never a metered Google Places photo) when one exists,
  // and falls back to the typographic card carrying this place's own name,
  // category, city and rating (never a generic line) when it does not.
  const heroImage = {
    url: `${SITE_URL}/api/og/hero?kind=place&id=${encodeURIComponent(params.id)}&t=${encodeURIComponent(p.name)}`
      + (p.category ? `&cat=${encodeURIComponent(p.category)}` : "")
      + (city ? `&loc=${encodeURIComponent(city)}` : "")
      + (p.rating != null ? `&r=${encodeURIComponent(p.rating)}` : "")
      + (p.reviews ? `&rev=${encodeURIComponent(p.reviews)}` : ""),
    width: 1200, height: 630, type: "image/jpeg", alt: `${p.name} on Wayfind`,
  };
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: isIndexable(p) ? undefined : { index: false, follow: true },
    ...socialMeta({ title, description, url, image: heroImage }),
  };
}

export function placesIndexMetadata() {
  const url = `${SITE_URL}/places`;
  const title = "Places on Wayfind — a merit-ranked local guide";
  const description = "Browse real places Wayfind covers, ranked on real reviews, not ads. Open any one for hours, directions, and what's worth your time nearby.";
  return { title, description, alternates: { canonical: url }, ...socialMeta({ title, description, url }) };
}
