// lib/placeData.js — SERVER-ONLY, JSX-FREE data + metadata layer for durable place
// pages. Split from the JSX renderer (lib/placePage.js) so this logic — the
// allowlist gate, the details merge, and the content-gated indexability — is unit
// testable without a React runtime.
import { cache } from "react";
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { getSkeleton, getVerifiedEditorial } from "./placeIndex";
import { getPlaceDetails, peekPlaceDetails } from "./placeDetails";
import { getInventoryIdentity } from "./inventoryIdentity";
import { atlasPlaceFor, mergePlacePage, preferInventorySkeleton, shouldCallGooglePlaceDetails } from "./atlasPlaceAllowlist";
import { guidePlaceFor } from "./guidePlaceIndex";
import { isNeverBookable } from "./affiliates";
import { placePartnerPick } from "./placePartnerPicks";
import { venueOfferFor } from "./venueOffers";
import { TP_PROGRAMS } from "./travelpayouts";

// Allowlist-gate + details merge, deduped per request (generateMetadata + the page
// both call it). Returns the merged place, or null when the id isn't indexed,
// has no publish-ready Atlas card, AND no GUIDES pick names it. getSkeleton()
// still runs first. Atlas-card ids never call getPlaceDetails (no Google).
// Identity prefers a wf_inventory row we already hold (name / lat / lng /
// signals) over Places. Indexed ids peek the pd1| cache and only spend Places
// when that cache is cold AND there is no Atlas copy to prefer.
// guide is the third allowlist (lib/guidePlaceIndex.js): a curated GUIDES pick
// with a real placeId, checked purely in-memory — no fetch, no Google spend,
// and it never widens shouldCallGooglePlaceDetails's gate below.
export const loadPlace = cache(async (id) => {
  if (!id) return null;
  const atlas = atlasPlaceFor(id);
  const guide = guidePlaceFor(id);
  const indexed = await getSkeleton(id);
  const inv = atlas ? await getInventoryIdentity(id) : null;
  const skel = preferInventorySkeleton(inv, indexed);
  if (!skel && !atlas && !guide) return null;
  const cached = (skel || atlas) ? await peekPlaceDetails(id) : null;
  let details = cached;
  if (shouldCallGooglePlaceDetails({ skel: indexed, cached, atlas })) {
    details = await getPlaceDetails(id);
  }
  // Verified wf_editorial_servable row (NO Google) — Wayfind's own strongest
  // voice, both for durableEligible and for the meta-description priority
  // order (lib/atlasPlaceAllowlist.js mergePlacePage / lib/placeEligibility.js).
  // getVerifiedEditorial() is fail-soft (never throws, returns null on any
  // problem), so this extra read can never turn an otherwise-eligible
  // Atlas/guide page into a 500 or a lost render.
  const editorial = await getVerifiedEditorial(id);
  return mergePlacePage(id, { skel, details, atlas, guide, editorial });
});

// The CITY a formatted address names — never a street line, never a ZIP.
//
// THE BUG THIS FIXES. The old parser always took parts[length - 2]: for the
// common 4-segment US shape "123 Main St, Bradenton, FL 34205, USA" that is
// index 2 — "FL 34205" — so every title built from a full street address
// carried a ZIP code ("Name — FL 34205 | Wayfind") instead of a city.
//
// PURE ON PURPOSE — no import. This MIRRORS lib/locationHonesty.js's
// localityFromFormattedAddress() (same "US shape" scan: find the "ST[
// ZIP]" segment, take the segment before it) rather than importing it,
// because scripts/check-hero-card.mjs extracts this function's SOURCE TEXT
// with a regex and runs it in isolation (`new Function(...)`), asserting it
// has zero external references, so it can be tested without dragging in
// lib/placeData.js's other Next-only imports. Importing locationHonesty.js
// here would break that isolated eval. Keep the two algorithms in sync by
// hand if either one changes.
export function cityOf(address) {
  if (!address) return null;
  const parts = String(address).split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (!m) continue;
    const city = parts[i - 1];
    if (city && !/\d/.test(city) && city.length <= 40) return city;
    break; // a matched-but-invalid "city" segment: fall through, don't keep scanning
  }
  // Non-US / unrecognized shape: fall back to the nearest comma-separated
  // segment that doesn't look like a street line or a ZIP (no digits), so a
  // ZIP/street can never win even when the "ST[ ZIP]" shape above found
  // nothing usable.
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] && !/\d/.test(parts[i]) && parts[i].length <= 40) return parts[i];
  }
  // A lone segment is only a city when it reads like one. Atlas-590 carries
  // street-only addresses ("6100 N LOCKWOOD RIDGE RD"); returning that put a
  // street in the <title>. No city beats a wrong one.
  const only = parts[0] || null;
  return only && !/\d/.test(only) && only.length <= 40 ? only : null;
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

// A page is INDEXABLE only when it is DURABLY ELIGIBLE — see
// lib/placeEligibility.js placeDurableEligibility(), computed once in
// mergePlacePage() (lib/atlasPlaceAllowlist.js) and carried here as
// p.durableEligible. Deliberately NOT p.hasDetails: hasDetails goes true the
// moment a Google Place Details call has ever landed (a 30-day cache), which
// is exactly the churn this predicate exists to remove — a page must never
// index just because Google's cache happened to be warm today.
export function isIndexable(p) {
  return !!(p && p.durableEligible);
}

// Trims free text to at most `max` characters for a <meta name="description">,
// breaking at a sentence boundary when one exists inside the budget, else at
// a word boundary — never mid-word, and never a bare hard cut that could
// land inside an entity/HTML-unsafe sequence in the raw string.
export function trimDescriptionToLimit(text, max = 155) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastSentence >= max * 0.4) return cut.slice(0, lastSentence + 1).trim();
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace >= max * 0.4 ? cut.slice(0, lastSpace) : cut).trim().replace(/[.,;:\-–—]+$/, "");
  return base + "…";
}

export async function placePageMetadata({ params }) {
  const p = await loadPlace(params.id);
  if (!p || !p.name) return { title: "Place not found — Wayfind", robots: { index: false, follow: true } };
  const url = `${SITE_URL}/places/${params.id}`;
  // cityOf() parses a full address string; a guide-only page (no Google/Atlas
  // address) still has a real city from its GUIDES pick — see mergePlacePage's
  // `guideCity` in lib/atlasPlaceAllowlist.js. Never overrides a real address.
  const city = cityOf(p.address) || p.guideCity || null;
  const title = `${p.name}${city ? " — " + city : ""} | Wayfind`;
  const bits = [p.category, p.rating != null ? p.rating + "★" : null, p.reviews ? `${p.reviews.toLocaleString()} reviews` : null].filter(Boolean);
  // p.description already carries mergePlacePage's own priority order —
  // verified editorial why_here, then a substantive guide blurb, then a
  // publish-ready Atlas card's description (Google's editorialSummary is
  // last resort there, never first). When real copy exists it is used AS
  // IS, never appended to the generic "See it on Wayfind…" sentence; that
  // sentence is the FACTS-LINE fallback, used only when nothing else is
  // held for this place, and only then does Google's raw editorialSummary
  // ever appear here through p.description's own last-resort rung.
  const factsLine = `${bits.join(" · ")}${p.address ? " · " + p.address : ""}. See it on Wayfind, then open for hours, directions, and what's nearby.`;
  const description = trimDescriptionToLimit(p.description || factsLine, 155);
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
