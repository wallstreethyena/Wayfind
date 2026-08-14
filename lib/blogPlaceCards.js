// lib/blogPlaceCards.js — real Wayfind place cards inside editorial pages.
//
// A guide pick may carry `placeId`. When it does, the guide renders a real card
// (photo, hours, and the "Right now" line from wf_inventory.editorial_card)
// instead of a bare "Open in Wayfind" link. Picks without a placeId keep the
// existing behaviour, so nothing regresses.
//
// Three rules this file exists to enforce:
//   1. SSR-first. Cards must be in the server HTML — AI crawlers do not run JS.
//      Live "open now" and distance belong to hydration ON TOP of this, never
//      instead of it.
//   2. Never build a partner URL here (check-direct-affiliate-urls). We emit
//      internal hrefs; the commerce routes mint tracked links server-side.
//   3. Never name a place in a CTA that resolves to a search
//      (check-guide-cta-honesty). A search CTA names the REGION.
//
// A place with no verified affiliate carriage still gets a card. Parks and free
// beaches are the trust budget that makes the commercial cards convert.

import { supabase } from "./supabase.js";
import { venueLean, coarseCat } from "./ranking.js";

const CARD_COLUMNS =
  "place_id,name,lat,lng,category,primary_type,google_types,photo_ref,editorial,editorial_card,signals";

/** Fetch every place a page needs in ONE round trip. Fails soft to {}. */
export async function fetchPlaceCards(placeIds) {
  const ids = Array.from(new Set((placeIds || []).filter(Boolean))).filter((id) =>
    /^ChIJ/.test(id)
  );
  if (!ids.length || !supabase) return {};
  try {
    const { data, error } = await supabase.from("wf_inventory").select(CARD_COLUMNS).in("place_id", ids);
    if (error || !data) return {};
    const out = {};
    for (const row of data) out[row.place_id] = shapeCard(row);
    return out;
  } catch {
    return {};
  }
}

/** Collect the placeIds a guide needs, in pick order. */
export function placeIdsForGuide(guide) {
  if (!guide || !Array.isArray(guide.picks)) return [];
  return guide.picks.map((p) => p && p.placeId).filter(Boolean);
}

/** Shape a wf_inventory row into exactly what the card renders. Server-side. */
export function shapeCard(row) {
  if (!row) return null;
  const card = row.editorial_card || {};

  // typeList() prefers `types` and returns early on it. google_types is the
  // richest signal we hold and is populated on every attractions row — hand it
  // over under the name the ranker already reads, so a place with a null
  // primary_type still classifies correctly.
  const forRanker = { ...row, types: row.google_types || undefined };

  const sig = row.signals || {};

  return {
    // `id`, `photoRef`, `rating`, `reviews` are the names IconicPlaceCard reads.
    // This object IS the canonical card's `place` prop — not a parallel shape.
    id: row.place_id,
    placeId: row.place_id,
    name: card.name || row.name,
    category: row.category,
    section: coarseCat(forRanker),
    lat: row.lat,
    lng: row.lng,
    photoRef: row.photo_ref || null,
    rating: sig.rating != null ? Number(sig.rating) : null,
    reviews: sig.reviews != null ? Number(sig.reviews) : null,
    priceLevel: sig.price_level != null ? sig.price_level : null,
    types: row.google_types || null,
    address: card.address || null,
    hours: card.hours || null,
    phone: card.phone || null,
    website: card.officialWebsite || null,
    blurb: card.vibeCheck || row.editorial || null,
    whyGo: card.whyGo || null,
    insiderMove: card.insiderMove || null,
    watchOut: card.watchOut || null,
    // The field that makes a card beat a listicle: what is true THIS WEEK.
    currentDetail: stripVerificationNote(card.currentUsefulDetail),
    weather: weatherBadge(venueLean(forRanker)),
    hasEditorial: Boolean(row.editorial_card),
  };
}

/**
 * Static, SSR-safe weather guidance from the venue lean. Deliberately NOT live
 * weather: the server HTML has to stay cacheable and crawlable.
 */
export function weatherBadge(lean) {
  if (!lean) return null;
  if (lean.water) return { key: "water", label: "Clear skies", hint: "On the water — check the forecast" };
  if (lean.lean === "outdoor") return { key: "outdoor", label: "Go early", hint: "Outdoors — best before the afternoon heat" };
  if (lean.lean === "indoor") return { key: "indoor", label: "Good in rain", hint: "Indoors — works in any weather" };
  return null;
}

/**
 * editorial_card.currentUsefulDetail carries an internal freshness stamp
 * ("Verified 2026-08-13; refresh before display."). Useful in the database,
 * noise on the page.
 */
export function stripVerificationNote(text) {
  if (!text) return null;
  return String(text).replace(/\s*Verified \d{4}-\d{2}-\d{2};\s*refresh before display\.?\s*$/i, "").trim() || null;
}

/** Photo through the existing cached proxy. Never hot-link a partner CDN. */
export function photoUrl(photoRef, width = 960) {
  if (!photoRef) return null;
  return `/api/photo?ref=${encodeURIComponent(photoRef)}&w=${width}`;
}
