// lib/placeCardRoute.js — the one route contract for interactive place cards.
//
// Wayfind deliberately has TWO place URLs with different jobs:
//   /places/{id}  durable, crawlable SEO document
//   /p/{id}       full in-app place detail experience
//
// A place card is an app interaction, so it must never strand a reader on the
// thin SEO document. The shared card renderers call normalizePlaceCardHref()
// defensively so even a future caller that accidentally passes /places/{id}
// is corrected at the component boundary. Non-place destinations are left
// untouched because IconicPlaceCard/RailCard are also reused by a few landing,
// sponsor, event, and commerce surfaces.

export function placeCardDetailHref(placeId) {
  const id = String(placeId || "").trim();
  return id ? "/p/" + encodeURIComponent(id) : null;
}

export function normalizePlaceCardHref(href, placeId) {
  const raw = typeof href === "string" ? href.trim() : "";
  const detail = placeCardDetailHref(placeId);
  if (!raw || !detail) return raw || null;

  // Only rewrite Wayfind's two internal place-detail route families. Search
  // handoffs, sponsor pages, commerce hops and external URLs keep their own
  // destination. Preserve query/hash metadata when a /p share link carries it.
  const match = raw.match(/^\/(?:places|p)\/[^?#]+([?#][\s\S]*)?$/);
  if (!match) return raw;
  return detail + (match[1] || "");
}
