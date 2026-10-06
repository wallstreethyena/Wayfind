// Editorial discovery is an insert, never a scored place or a ranking input.
// Exact covered venue identity supplies both local and topic relevance. No
// guessed topic/city matching, random stock, clock reads, or per-render RNG.
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
  const eligible = (guides || []).filter((guide) => {
    if (!guide?.slug || !guide.image?.src || seen.has(guide.slug)) return false;
    seen.add(guide.slug);
    return (guide.placeIds || []).some((id) => ids.has(id));
  });
  eligible.sort((a, b) => guideDiscoveryHash(`${railId}:${a.slug}`) - guideDiscoveryHash(`${railId}:${b.slug}`) || a.slug.localeCompare(b.slug));
  const retained = eligible.find((item) => item.slug === previous?.guide?.slug);
  const guide = retained || eligible[0];
  if (!guide) return null;
  // Retain both the chosen guide and its organic slot while still relevant.
  // A short first page must not slide the guide when more rows arrive.
  const desiredSlot = retained && Number.isInteger(previous.organicSlot) ? previous.organicSlot
    : 3 + guideDiscoveryHash(`${guide.slug}:${railId}:slot`) % 4;
  const organicSlot = Math.min(Math.max(3, desiredSlot), leading.length - 1);
  return { guide, organicSlot, before: places.indexOf(leading[organicSlot]) };
}
