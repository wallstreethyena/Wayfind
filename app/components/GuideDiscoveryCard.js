"use client";

import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import RailCard from './RailCard';
import TrackedOfferLink from './TrackedOfferLink';
import { guideCardPhoto } from '../../lib/guideCardPhoto.js';

const clean = (text) => String(text || '').replace(/\s*[–—]\s*/g, ', ').replace(/\s+/g, ' ').trim();

// How many teaser lines a card can afford (owner, 2026-10-07: the TITLE is
// never compressed or cut off, so the teaser is what gives way). The card is a
// fixed height and the title wraps differently per width and font, so this is
// only the first guess (used for the server render and the first paint); the
// card then measures itself in the browser (useTeaserFit below) and drops a
// teaser line only when the action row would lose its bottom padding.
export function guideTeaserLines(title, hasLead) {
  const n = String(title || '').length;
  if (n > 72) return hasLead ? 0 : 1;
  if (n > 56 && hasLead) return 1;
  return 2;
}

// The card fits when the Save / Like / Share row keeps the content box's own
// bottom padding. Every guide-card child is flex-shrink:0 (css.js), so an
// overflow shows up as the action row being pushed down, never as a squashed
// button. Tries 2, then 1, then 0 teaser lines, and re-checks on resize.
const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;
function fits(card) {
  const content = card && card.querySelector('.wf-place-card-content');
  const acts = content && content.querySelector('.wf-place-card-actions');
  if (!acts) return true;
  const pad = parseFloat(getComputedStyle(content).paddingBottom) || 0;
  // The content box can grow past the fixed-height card (which clips it), so
  // the limit is whichever bottom edge comes first.
  const edge = Math.min(content.getBoundingClientRect().bottom, card.getBoundingClientRect().bottom);
  return acts.getBoundingClientRect().bottom <= edge - pad + 0.5;
}
function useTeaserFit(ref, initial, hasTeaser) {
  const [lines, setLines] = useState(initial);
  useIsoLayout(() => {
    const card = ref.current;
    if (!card || !hasTeaser) return undefined;
    const run = () => {
      let pick = 0;
      for (const n of [2, 1, 0]) {
        card.classList.remove('wf-guide-teaser-0', 'wf-guide-teaser-1', 'wf-guide-teaser-2');
        card.classList.add(`wf-guide-teaser-${n}`);
        if (n === 0 || fits(card)) { pick = n; break; }
      }
      setLines(pick);
    };
    run();
    if (typeof ResizeObserver === 'undefined') return undefined;
    let w = card.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const nw = card.getBoundingClientRect().width;
      if (Math.abs(nw - w) > 1) { w = nw; run(); }
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, [hasTeaser]);
  return lines;
}

// A guide, drawn as a RailCard in its own "guide" variant (owner, 2026-10-07):
// no chip bubbles, the TITLE is the centre of attention and is never clamped or
// cut off, and the look differs from a place card (filled "Local guide" tag,
// orange top rule; see .wf-guide-card in css.js). The READ time rides in the
// tag so the title keeps the full height of the card.
//
// Under the title (2026-10-07): the guide's own teaser, a plain-text "what's
// inside" line (pick count and topics, never chip bubbles), and ONE lead line:
// the guide's booking link when it has an exact, monetized one through our
// redirect (same CTA the guide page sells, tracked as surface guide_card),
// otherwise its first venue-shaped pick as "Top pick". "Read the guide" sits
// at the bottom, directly above Save / Like / Share.
//
// The picture is never a blank monogram while we own one: guide hero, then the
// guide's first curated licensed pick photo (both credited), then the matched /
// first pick's own no-spend place photo. See lib/guideCardPhoto.js.
export default function GuideDiscoveryCard({ guide, matched = null, onOpen, className = "" }) {
  const href = `/guides/${guide?.slug || ''}`;
  const art = guide?.slug ? guideCardPhoto(guide, matched) : {};
  const title = clean(guide?.title);
  const tag = guide?.mins ? `Local guide · ${guide.mins} min read` : 'Local guide';

  const inside = [
    guide?.pickCount > 1 ? `${guide.pickCount} picks` : null,
    ...(Array.isArray(guide?.topics) ? guide.topics : []),
  ].filter(Boolean);
  const cta = guide?.cta && guide.cta.href && guide.cta.label ? guide.cta : null;
  const top = guide?.topPick && guide.topPick.name ? guide.topPick : null;
  const teaser = clean(guide?.teaser);
  const cardRef = useRef(null);
  const lines = useTeaserFit(cardRef, teaser ? guideTeaserLines(title, !!(cta || top)) : 0, !!teaser);
  if (!guide?.slug) return null;
  // The link must not trigger the card body (which opens the guide): stop the
  // click and the Enter key (KB_CLICK on the article) at this wrapper.
  const stop = (e) => e.stopPropagation();
  const lead = cta ? (
    <span className="wf-guide-card-book" onClick={stop} onKeyDown={stop}>
      <TrackedOfferLink href={cta.href} label={`${cta.label} ↗`} surface="guide_card"
        slugKey="guide_slug" slug={guide.slug} city={guide.region || null}
        provider={cta.provider || null} offerId={cta.offerId || null} variant="guide_card_lead" position={1} />
    </span>
  ) : top ? (
    <span className="wf-guide-card-pick">
      <span className="wf-guide-card-pick-label">{top.first ? '★ Top pick' : '★ Featured'}</span> {top.name}
    </span>
  ) : null;
  return <RailCard
    variant="guide"
    className={`wf-guide-teaser-${lines}${className ? " " + className : ""}`}
    photo={art.src}
    photoAttr={art.credit}
    photoAttrHref={art.creditHref}
    photoPosition={art.position}
    title={title}
    eyebrow={tag}
    take={teaser || undefined}
    domRef={cardRef}
    facts={inside.length ? inside : undefined}
    lead={lead}
    cta={{ label: 'Read the guide', href, onClick: () => onOpen?.(guide) }}
    href={href}
    onOpen={() => { onOpen?.(guide); if (typeof window !== 'undefined') window.location.assign(href); }}
    actionItem={{ id: `guide:${guide.slug}`, type: 'guide', title: clean(guide.title), image: art.src, url: href }}
  />;
}
