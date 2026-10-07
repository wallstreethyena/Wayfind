// Server-only projection. Never ship the guide corpus or image review notes to
// the home bundle. Lifecycle eligibility remains the caller's responsibility.
import { guideHero } from './guideHero.js';
import { readMinutes } from './localEdit.js';
import { guideTopics } from './guideTopics.js';

export function guideDiscoveryIndex(guides) {
  return Object.entries(guides || {}).map(([slug, guide]) => {
    const art = guideHero(slug);
    const image = art?.src ? Object.fromEntries([
      'src', 'alt', 'width', 'height', 'position', 'credit', 'source',
      'license', 'licenseUrl', 'modificationNotice',
    ].filter((key) => art[key] != null).map((key) => [key, art[key]])) : null;
    if (image) image.caption = art.cardCaption || art.caption || '';
    return {
      slug, title: guide.title, teaser: guide.teaser || guide.description || '',
      region: guide.region || 'Florida', updated: guide.updated || '',
      mins: readMinutes(guide), image,
      pickCount: (guide.picks || []).length, topics: guideTopics(guide),
      placeIds: [...new Set((guide.picks || []).map((pick) => pick.placeId).filter(Boolean))],
    };
  }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}
