"use client";

import { useId } from "react";
import RailHeading from "./RailHeading";
import { RailNav, RailDots } from "./RailCard";

// Event pages use the same heading, paging controls and dots as home posters.
// Each instance owns its target, so Nearby and Stays cannot scroll each other.
export default function EventPlaceRail({ title, description, label, count, railClassName = "", headingAction = null, children }) {
  const railId = "event-places-" + useId().replace(/:/g, "");
  if (!count) return null;
  return <div className="wf-event-place-rail">
    <style dangerouslySetInnerHTML={{ __html: `
      .wf-event-place-rail{min-width:0}
      .wf-event-place-rail>.wf-rail{list-style:none;margin:0;padding:4px 0 8px}
      .wf-event-stay-card{list-style:none;margin:0;padding:0}
    ` }} />
    <RailHeading title={title} description={description}>
      {headingAction}
      <RailNav railId={railId} count={count} total={count} loaded={count} unit="places" />
    </RailHeading>
    <ol className={`wf-rail${railClassName ? " " + railClassName : ""}`} data-rail={railId} aria-label={label} tabIndex={0}>{children}</ol>
    <RailDots railId={railId} count={count} />
  </div>;
}
