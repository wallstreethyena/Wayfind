// lib/heroSource.js — WHICH photo a hero share card gets, for a kind+id.
//
// Imported ONLY by app/api/og/hero/route.js (the node-runtime OG route) and
// by scripts/check-hero-card.mjs. Never by lib/heroCard.js or app/api/og/
// card.jsx — those stay edge-safe, and findFreePhoto below does a real
// network round-trip that has no business running on every OG route.
//
// Every resolver here returns { url, position, alt } or null. NEVER THROWS —
// the caller (the hero route) treats a null exactly like a fetch failure: it
// falls back to the typographic card, never to a broken image already in
// someone's text thread.
import { guideHero } from "./guideHero.js";
import { eventPhotos, mayHostEventPhotos } from "./eventPhotos.js";
import { findFreePhoto } from "./freePhoto.js";
import { absoluteHeroUrl, isAllowedHeroSrc } from "./heroCard.js";

/** A guide's own reviewed hero (lib/guideHero.js), if one has been reviewed
 * for this exact slug. `unavailable` / no src means "nothing to show" —
 * never NEUTRAL_HERO's generic brand art, which would be exactly the
 * "everything looks the same" failure this system exists to end. */
export function resolveGuideHeroSource(origin, slug) {
  const art = guideHero(slug);
  if (!art || art.kind === "unavailable" || !art.src) return null;
  const url = absoluteHeroUrl(origin, art.src);
  if (!url) return null;
  return { url, position: art.position || "50% 50%", alt: art.alt || "" };
}

/** The FREE, PERMANENT, licensed photo for this place (wf_place_photo), if
 * one exists — never a metered Google Places photo (/api/photo), which
 * robots.txt already disallows and the photos ledger has exhausted anyway.
 * findFreePhoto() never throws; this wraps it in one more try/catch purely
 * so a resolver contract violation upstream can never reach the route. */
export async function resolvePlaceHeroSource(placeId) {
  try {
    const photo = await findFreePhoto({ placeId });
    if (!photo || !photo.url) return null;
    return { url: photo.url, position: "50% 42%", alt: "" };
  } catch {
    return null;
  }
}

/** An event's OWNED, consent-cleared photo (lib/eventPhotos.js). Fails
 * closed exactly like eventPhotos() itself: no consent record, no photo,
 * regardless of what hero_image a scraped feed carries — this route only
 * ever composites photography Wayfind actually has the right to reuse. */
export function resolveEventHeroSource(origin, eventId) {
  if (!mayHostEventPhotos(eventId)) return null;
  const set = eventPhotos(eventId);
  if (!set || !set.hero || !set.hero.src) return null;
  const url = absoluteHeroUrl(origin, set.hero.src);
  if (!url) return null;
  return { url, position: "50% 50%", alt: set.hero.alt || "" };
}

/**
 * One dispatcher for the route. `src` is the bounded escape hatch for a page
 * that carries its own credited photo outside any registry (e.g. the
 * florida-fall-festivals guide's inline Unsplash hero) — validated against
 * HERO_SRC_ALLOWED_HOSTS so this public route can never become an open image
 * proxy for an arbitrary https URL.
 *
 * `kind: "town"` always returns null today: no town carries a reviewed photo
 * yet (verified — no TOWN_HERO-shaped registry exists), so every /florida/
 * [town] card stays the typographic fallback until one is curated. The
 * branch exists so adding that registry later is a one-line change here,
 * not a new kind.
 */
export async function resolveHeroSource({ origin, kind, id, src, position }) {
  if (src && isAllowedHeroSrc(src, origin ? new URL(origin).hostname : "")) {
    return { url: src, position: position || "50% 50%", alt: "" };
  }
  try {
    if (kind === "guide") return resolveGuideHeroSource(origin, id);
    if (kind === "place") return await resolvePlaceHeroSource(id);
    if (kind === "event") return resolveEventHeroSource(origin, id);
    return null; // town, or an unknown kind
  } catch {
    return null;
  }
}
