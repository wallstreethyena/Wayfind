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
import { absoluteHeroUrl } from "./heroCard.js";

// Audit (2026-09-23): a bounded, id-keyed registry for a guide hero that
// lives OUTSIDE lib/guideHero.js's own reviewed-art registry — e.g. a
// dedicated guide page (app/guides/florida-fall-festivals-2026) that carries
// its own credited stock photo rather than a locally-hosted reviewed asset.
// This REPLACES the old caller-controlled ?src=/?pos= query override: the
// only way a guide gets a hero the route didn't already know how to find is
// an entry here, keyed by the guide's own id, never anything a requester can
// hand the route directly. Adding a guide here is a one-line, reviewed change
// — the same trust boundary lib/guideHero.js's GUIDE_HERO_ART already is.
const DEDICATED_GUIDE_HEROES = Object.freeze({
  "florida-fall-festivals-2026": {
    url: "https://images.unsplash.com/photo-1537991458814-f9f068c1fd52?auto=format&fit=crop&fm=jpg&q=82&w=1600&h=1067",
    position: "50% 58%",
    alt: "Orange pumpkins arranged at a nursery in Davie, Florida",
  },
});

/** A guide's own reviewed hero (lib/guideHero.js), if one has been reviewed
 * for this exact slug — or this file's own DEDICATED_GUIDE_HEROES entry for
 * a guide that carries a credited photo outside that registry. `unavailable`
 * / no src means "nothing to show" — never NEUTRAL_HERO's generic brand art,
 * which would be exactly the "everything looks the same" failure this system
 * exists to end. */
export function resolveGuideHeroSource(origin, slug) {
  const dedicated = DEDICATED_GUIDE_HEROES[slug];
  if (dedicated) return { url: dedicated.url, position: dedicated.position || "50% 50%", alt: dedicated.alt || "" };
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
 * One dispatcher for the route. Resolves ONLY from server-side registries
 * keyed by `kind` + `id` — DEDICATED_GUIDE_HEROES / lib/guideHero.js for a
 * guide, wf_place_photo for a place, lib/eventPhotos.js for an event. There
 * is deliberately no caller-supplied source parameter: a public route that
 * fetches and re-serves whatever https URL (or same-origin path — including
 * the metered /api/photo) a requester hands it is an open image proxy. An
 * extra `src`/`position` key on the argument object (from an older caller,
 * or an attacker probing the query string) is simply not read by this
 * destructure — see scripts/check-hero-card.mjs's src-is-inert assertion.
 *
 * `kind: "town"` always returns null today: no town carries a reviewed photo
 * yet (verified — no TOWN_HERO-shaped registry exists), so every /florida/
 * [town] card stays the typographic fallback until one is curated. The
 * branch exists so adding that registry later is a one-line change here,
 * not a new kind.
 */
export async function resolveHeroSource({ origin, kind, id }) {
  try {
    if (kind === "guide") return resolveGuideHeroSource(origin, id);
    if (kind === "place") return await resolvePlaceHeroSource(id);
    if (kind === "event") return resolveEventHeroSource(origin, id);
    return null; // town, or an unknown kind
  } catch {
    return null;
  }
}
