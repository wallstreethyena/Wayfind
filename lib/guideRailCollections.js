import { guideDiscoveryHash } from './guideDiscovery.js';

// Actual place rows are the only evidence. Event venue IDs and tour products
// do NOT establish that a guide covers the event/date or the purchasable tour.
export function guideRailCandidates(guides, rails, collectionId) {
  const candidates = [];
  for (const rail of rails || []) {
    if (!rail?.id) continue;
    const rows = Array.isArray(rail.places) ? rail.places : Array.isArray(rail.cards) ? rail.cards : [];
    const places = rows.filter((row) => row && !row._sponsored && (!row.kind || row.kind === 'place')).slice(0, 8);
    const ids = new Set(places.map((row) => row.placeId || row.id).filter(Boolean));
    const seen = new Set();
    for (const guide of guides || []) {
      if (!guide?.slug || !guide.image?.src || seen.has(guide.slug)) continue;
      seen.add(guide.slug);
      if ((guide.placeIds || []).some((id) => ids.has(id))) candidates.push({ railId: rail.id, guide });
    }
  }
  return candidates.sort((a, b) => guideDiscoveryHash(`${collectionId}:${a.railId}:${a.guide.slug}`) - guideDiscoveryHash(`${collectionId}:${b.railId}:${b.guide.slug}`) || a.railId.localeCompare(b.railId) || a.guide.slug.localeCompare(b.guide.slug));
}

// Keep a still-relevant selection in place as more cards/rails arrive. A city,
// filter or lifecycle change that removes its exact match releases the slot.
export function settleGuideRailSelection(candidates, previous) {
  return candidates.find((item) => item.railId === previous?.railId && item.guide.slug === previous?.guide?.slug) || candidates[0] || null;
}
