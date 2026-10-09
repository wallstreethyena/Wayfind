"use client";
import { Children, useContext } from "react";
import GuideDiscoveryCard from "./GuideDiscoveryCard";
import { RailGuideContext } from "./RailGuideContext";
import { insertGuideAt } from "../../lib/railGuideSlot.js";
import { captureOrQueue } from "../../lib/browserAnalytics";

// Wraps a rail's rendered cards and puts its guide (if it has one) at the guide
// slot, INSIDE the track (owner rule 2026-10-08, lib/railGuideSlot.js). The
// place cards are rendered by the caller first, so their rank numbers are
// already fixed and the guide never shifts them. A `guide` prop wins over the
// collection's matched guide (the Christmas rails carry their own).
export default function RailGuideSlot({ railId, guide = null, matched = null, className = "wf-exploding-primary", onTrack = null, children }) {
  const fromCollection = useContext(RailGuideContext);
  const picked = guide ? { guide, matched } : (fromCollection && railId ? fromCollection[railId] : null) || null;
  const cards = Children.toArray(children);
  if (!picked || !picked.guide || !picked.guide.slug) return <>{cards}</>;
  const open = (g) => {
    const props = { slug: g?.slug || picked.guide.slug, rail: railId || null, src: "rail_slot" };
    try { if (onTrack) onTrack("guide_open", props); else if (typeof window !== "undefined") captureOrQueue(window, "guide_open", props); } catch {}
  };
  // display:contents keeps the card a real flex child of the track (same size
  // as its siblings) while carrying the data-guide-rail hook guards look for.
  const card = <div key={"rail-guide:" + picked.guide.slug} className="wf-rail-guide-slot" data-guide-rail={railId || ""} style={{ display: "contents" }}>
    <GuideDiscoveryCard guide={picked.guide} matched={picked.matched || null} className={className} onOpen={open} />
  </div>;
  return <>{insertGuideAt(cards, card)}</>;
}
