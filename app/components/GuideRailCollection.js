"use client";
import { useContext, useEffect, useMemo, useState } from 'react';
import { GuideDiscoveryContext } from './GuideDiscoveryContext';
import { RailGuideContext } from './RailGuideContext';
import { guideRailCandidates, settleGuideRailSelection } from '../../lib/guideRailCollections.js';

// The collection's ONE matched guide (same matching as before: exact place
// evidence, stable selection). It is no longer an aside between rails (owner
// rule 2026-10-08, lib/railGuideSlot.js): this component only says WHICH rail
// owns the guide, and that rail's RailGuideSlot puts it third in its track.
export default function GuideRailCollection({ rails = [], collectionId, children }) {
  const guides = useContext(GuideDiscoveryContext);
  const [previous, setPrevious] = useState(null);
  const candidates = guideRailCandidates(guides, rails, collectionId);
  const selected = settleGuideRailSelection(candidates, previous);
  useEffect(() => {
    if (selected?.railId !== previous?.railId || selected?.guide.slug !== previous?.guide?.slug) setPrevious(selected);
  }, [selected, previous]);
  const value = useMemo(() => (selected ? { [selected.railId]: { guide: selected.guide, matched: selected.matched } } : null),
    [selected?.railId, selected?.guide, selected?.matched]); // eslint-disable-line react-hooks/exhaustive-deps
  return <RailGuideContext.Provider value={value}>{children}</RailGuideContext.Provider>;
}
