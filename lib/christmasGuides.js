// lib/christmasGuides.js: SERVER ONLY. Attaches each Christmas rail's own guide.
//
// Built from the guide registry on the server so no guide data enters the
// client bundle (same rule as lib/guideDiscoveryIndex.js, which supplies the
// card shape GuideDiscoveryCard reads). A guide that is missing from the
// registry, archived (lib/guideLifecycle.js) or has no hero picture is omitted:
// a rail without a guide is honest, a guide card without a picture is not.
import { GUIDES } from "./guides.js";
import { currentGuides } from "./guideLifecycle.js";
import { guideDiscoveryIndex } from "./guideDiscoveryIndex.js";
import { CHRISTMAS_RAIL_GUIDE_SLUGS } from "./christmasIntentRails.js";

export function christmasRailGuide(railId, today, registry = GUIDES) {
  const slug = CHRISTMAS_RAIL_GUIDE_SLUGS[railId];
  if (!slug) return null;
  const live = currentGuides(registry, today);
  if (!live[slug]) return null;
  const [card] = guideDiscoveryIndex({ [slug]: live[slug] }, today);
  if (!card || !card.image || !card.image.src) return null;
  return { ...card, href: "/guides/" + slug };
}

// Returns the rails with `guide` attached where one exists.
export function withChristmasGuides(rails, today, registry = GUIDES) {
  return (rails || []).map((rail) => {
    const guide = christmasRailGuide(rail.id, today, registry);
    return guide ? { ...rail, guide } : rail;
  });
}
