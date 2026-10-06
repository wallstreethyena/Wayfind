"use client";

import GuideFigure, { GuideFigureCredit } from './GuideFigure';
import styles from './GuideDiscoveryCard.module.css';
import { PLACE_CARD_HEIGHT_PX } from '../../lib/placeCardStandard.js';

// One guide treatment for the library and contextual place-rail inserts.
// Credits are siblings of the story link: valid links, keyboard accessible,
// and never swallowed by navigation to the article.
export default function GuideDiscoveryCard({ guide, compact = false, onOpen }) {
  if (!guide?.slug) return null;
  const image = guide.image;
  return <article className={`${styles.card} ${compact ? styles.compact : ''}`} data-guide-discovery={guide.slug}
    style={compact ? { height: PLACE_CARD_HEIGHT_PX } : undefined}>
    <a className={styles.link} href={`/guides/${guide.slug}`} onClick={() => onOpen?.(guide)}>
      {image?.src ? <GuideFigure role="card" image={image} showCaption={false} priority={compact}
        sizes={compact ? '170px' : '(max-width:900px) 78vw, 330px'} className={styles.figure} /> : null}
      <div className={styles.body}>
        <div className={styles.meta}><span>{compact ? 'Go deeper · ' : ''}{guide.region}</span>{guide.mins ? <span>{guide.mins} min read</span> : null}</div>
        <h4 className={styles.title}>{guide.title}</h4>
        {!compact && guide.teaser ? <p className={styles.teaser}>{guide.teaser}</p> : null}
        <span className={styles.cta}>Read the guide <span aria-hidden="true">→</span></span>
      </div>
    </a>
    {image?.src ? <GuideFigureCredit image={image} className={styles.credit} /> : null}
  </article>;
}
