"use client";

import RailCard from './RailCard';
import { ownedPlacePhotoSrc } from '../../lib/placePhoto.js';

const clean = (text) => String(text || '').replace(/\s*[–—]\s*/g, ', ').replace(/\s+/g, ' ').trim();

// A guide, drawn as the standard place card (RailCard). The photo is the exact
// pick that matched this rail, read from our own no-spend photo route, so a
// guide never triggers a paid lookup and never borrows stock art.
export default function GuideDiscoveryCard({ guide, matched = null, onOpen }) {
  if (!guide?.slug) return null;
  const href = `/guides/${guide.slug}`;
  const placeId = matched?.id || (guide.placeIds || [])[0] || '';
  const photo = ownedPlacePhotoSrc(placeId, 640, true) || undefined;
  const picks = guide.pickCount || (guide.placeIds || []).length;
  const chips = [
    guide.region ? { key: 'region', icon: '📍', label: guide.region } : null,
    picks ? { key: 'picks', icon: '✓', label: `${picks} picks` } : null,
    ...(guide.topics || []).slice(0, 2).map((label) => ({ key: `t-${label}`, icon: '#', label })),
  ].filter(Boolean);
  const name = clean(matched?.name);
  const why = name
    ? (picks > 1 ? `Covers ${name} and ${picks - 1} more picks near you` : `Covers ${name}, a pick near you`)
    : clean(guide.teaser);
  return <RailCard
    photo={photo}
    title={clean(guide.title)}
    eyebrow="Local guide"
    when={guide.mins ? { label: 'GUIDE', value: `${guide.mins} min read` } : undefined}
    chips={chips}
    take={why || undefined}
    cta={{ label: 'Read the guide', href, onClick: () => onOpen?.(guide) }}
    href={href}
    onOpen={() => { onOpen?.(guide); if (typeof window !== 'undefined') window.location.assign(href); }}
    actionItem={{ id: `guide:${guide.slug}`, type: 'guide', title: clean(guide.title), image: photo, url: href }}
  />;
}
