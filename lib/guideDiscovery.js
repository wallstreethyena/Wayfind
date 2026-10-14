// Editorial discovery is an insert, never a scored place or a ranking input.
// A guide must (1) be on the rail's accepted-topic list (lib/guideRailTopics.js,
// explicit table, owner 2026-10-13) AND (2) cover an exact place in the rail's
// leading window. A shared restaurant alone never qualifies a guide. No random
// stock, clock reads, or per-render RNG.
import { guideSlotIndex } from './railGuideSlot.js';
import { guideRailFit } from './guideRailTopics.js';

export function guideDiscoveryHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function guideForPlaceRail(guides, places, railId, previous = null) {
  // A fixed leading window makes selection and position stable as pagination
  // appends. Leave the top three earned places uninterrupted and never use ads
  // as evidence. A small rail needs its places, not an editorial interruption.
  if (!railId || !Array.isArray(places) || places.length < 4) return null;
  const leading = places.filter((place) => !place?._sponsored).slice(0, 8);
  if (leading.length < 4) return null;
  const ids = new Set(leading
    .map((place) => place?.placeId || place?.id).filter(Boolean));
  const seen = new Set();
  const eligible = [];
  for (const guide of guides || []) {
    if (!guide?.slug || !guide.image?.src || seen.has(guide.slug)) continue;
    seen.add(guide.slug);
    const fit = guideRailFit(guide, railId);
    if (!fit) continue; // off-topic for this rail: a shared venue is not enough
    const coverage = (guide.placeIds || []).filter((id) => ids.has(id)).length;
    if (coverage) eligible.push({ guide, fit, coverage });
  }
  // Topical fit, then how many of the rail's places the guide covers, then a
  // stable hash so ties never flicker between renders.
  eligible.sort((a, b) => b.fit - a.fit || b.coverage - a.coverage
    || guideDiscoveryHash(`${railId}:${a.guide.slug}`) - guideDiscoveryHash(`${railId}:${b.guide.slug}`)
    || a.guide.slug.localeCompare(b.guide.slug));
  const retained = eligible.find((item) => item.guide.slug === previous?.guide?.slug);
  const guide = (retained || eligible[0])?.guide;
  if (!guide) return null; // no relevant guide: the slot stays empty, no filler
  // OWNER RULE 2026-10-08 (lib/railGuideSlot.js): the guide is the rail's
  // THIRD card, always, through the one shared slot helper.
  const organicSlot = guideSlotIndex(leading.length);
  // `before` is the index in the RENDERED track (sponsored row included), so
  // the guide is the third card the reader sees.
  return { guide, organicSlot, before: guideSlotIndex(places.length), matched: matchedGuidePlace(guide, leading) };
}

// The exact place that made this guide relevant: the first row, in rail order,
// whose id the guide covers. Pure data, so the card can say why it is shown.
export function matchedGuidePlace(guide, places) {
  const covered = new Set(guide?.placeIds || []);
  for (const place of places || []) {
    if (!place || place._sponsored) continue;
    const id = place.placeId || place.id;
    if (id && covered.has(id)) return { id, name: place.name || place.title || '' };
  }
  return null;
}
