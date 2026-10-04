"use client";
import { Children, Fragment, useContext, useEffect, useState } from 'react';
import { GuideDiscoveryContext } from './GuideDiscoveryContext';
import GuideDiscoveryCard from './GuideDiscoveryCard';
import { guideRailCandidates, settleGuideRailSelection } from '../../lib/guideRailCollections.js';
import { PLACE_CARD_MAX_WIDTH_PX } from '../../lib/placeCardStandard.js';

// A single editorial pause BETWEEN actual subrails. The existing ranked
// children, their paging refs, event facts, and commerce controls stay intact.
export default function GuideRailCollection({ rails = [], collectionId, children }) {
  const guides = useContext(GuideDiscoveryContext);
  const [previous, setPrevious] = useState(null);
  const candidates = guideRailCandidates(guides, rails, collectionId);
  const selected = settleGuideRailSelection(candidates, previous);
  useEffect(() => {
    if (selected?.railId !== previous?.railId || selected?.guide.slug !== previous?.guide?.slug) setPrevious(selected);
  }, [selected, previous]);
  const rows = Children.toArray(children);
  // A mismatched wrapper is not permission to guess which rail a node is.
  if (rows.length !== rails.length) return <>{children}</>;
  return <>{rows.map((child, index) => <Fragment key={rails[index].id}>
    {child}
    {selected?.railId === rails[index].id ? <aside aria-label="Go deeper with a local guide"
      data-guide-rail={selected.railId} style={{ margin: '22px 0 4px', width: '100%', maxWidth: PLACE_CARD_MAX_WIDTH_PX }}>
      <GuideDiscoveryCard guide={selected.guide} compact />
    </aside> : null}
  </Fragment>)}</>;
}
