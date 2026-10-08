// Server-only projection. Never ship the guide corpus or image review notes to
// the home bundle. Lifecycle eligibility remains the caller's responsibility.
import { guideHero } from './guideHero.js';
import { readMinutes } from './localEdit.js';
import { guideTopics } from './guideTopics.js';
import { guidePrimaryCta, pickVenueLabel } from './guideCta.js';

// The guide card's "Top pick" line (owner, 2026-10-07). It names a pick only
// when the pick's heading is venue-shaped (pickVenueLabel, the same test the
// guide CTA uses), so an editorial heading like "What the hour actually
// covers" never becomes a "Top pick". The first venue-shaped pick in the
// guide's own editorial order wins; nothing is ever ranked by commission.
export function guideCardTopPick(guide) {
  const picks = Array.isArray(guide?.picks) ? guide.picks : [];
  for (let i = 0; i < picks.length; i++) {
    const name = pickVenueLabel(picks[i] && picks[i].name);
    if (name) return { name, first: i === 0 };
  }
  return null;
}

// The ONE money link a guide card may carry: the guide's own primary CTA,
// resolved by the same predicate as the guide page (guidePrimaryCta), so the
// card can never sell something the guide does not. Fail closed: only an
// exact, monetized hop through OUR redirect (/api/.../go) qualifies; a raw
// partner URL, a search-as-book dest or a non-earning CTA renders nothing.
// The redirect's `surface` is rewritten to guide_card so a sale made from the
// card is attributable separately from the guide page.
export function guideCardCta(guide, todayIso) {
  let c = null;
  try { c = guidePrimaryCta(guide, todayIso); } catch { c = null; }
  if (!c || !c.monetized || !c.href || !c.label || !c.exact) return null;
  const href = String(c.href);
  if (!/^\/api\/[a-z-]+\/go\?/.test(href)) return null;
  const [path, query] = href.split('?');
  const q = new URLSearchParams(query);
  q.set('surface', 'guide_card');
  return {
    label: String(c.label),
    href: `${path}?${q.toString()}`,
    provider: c.provider || q.get('provider') || (path.includes('/viator/') ? 'viator' : null),
    offerId: c.offerId || q.get('offer') || null,
  };
}

export function guideDiscoveryIndex(guides, todayIso) {
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
      topPick: guideCardTopPick(guide),
      cta: guideCardCta(guide, todayIso),
    };
  }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}
