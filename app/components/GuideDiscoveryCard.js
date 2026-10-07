"use client";

import RailCard from './RailCard';
import { guideCardPhoto } from '../../lib/guideCardPhoto.js';

const clean = (text) => String(text || '').replace(/\s*[–—]\s*/g, ', ').replace(/\s+/g, ' ').trim();

// A guide, drawn as a RailCard in its own "guide" variant (owner, 2026-10-07):
// no chip bubbles, the TITLE is the centre of attention and is never clamped or
// cut off, and the look differs from a place card (filled "Local guide" tag,
// orange top rule; see .wf-guide-card in css.js). The READ time rides in the
// tag so the title keeps the full height of the card.
//
// The picture is never a blank monogram while we own one: guide hero, then the
// guide's first curated licensed pick photo (both credited), then the matched /
// first pick's own no-spend place photo. See lib/guideCardPhoto.js.
export default function GuideDiscoveryCard({ guide, matched = null, onOpen }) {
  if (!guide?.slug) return null;
  const href = `/guides/${guide.slug}`;
  const art = guideCardPhoto(guide, matched);
  const title = clean(guide.title);
  const tag = guide.mins ? `Local guide · ${guide.mins} min read` : 'Local guide';
  return <RailCard
    variant="guide"
    photo={art.src}
    photoAttr={art.credit}
    photoAttrHref={art.creditHref}
    photoPosition={art.position}
    title={title}
    eyebrow={tag}
    cta={{ label: 'Read the guide', href, onClick: () => onOpen?.(guide) }}
    href={href}
    onOpen={() => { onOpen?.(guide); if (typeof window !== 'undefined') window.location.assign(href); }}
    actionItem={{ id: `guide:${guide.slug}`, type: 'guide', title: clean(guide.title), image: art.src, url: href }}
  />;
}
