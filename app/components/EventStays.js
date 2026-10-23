import { cachedEventStays } from "../../lib/eventStaysCached.js";
import { WF_PLACE_CARD_CSS } from "./css";
import EventStayCards from "./EventStayCards";

// The inventory's no-store reads stay inside a Data Cache boundary so they
// cannot switch the parent ISR event page to dynamic rendering at runtime. The
// wrapper lives in lib/eventStaysCached.js so the browser re-anchor route
// (app/api/events/venue-nearby) reads the same cache entry for the same point.

export default async function EventStays({ lat, lng, venue }) {
  const { places, unavailable } = await cachedEventStays(lat, lng);
  if (unavailable) return <p style={{ color: "#aab4c2", margin: "28px 0", lineHeight: 1.6 }}>Nearby stays are temporarily unavailable.</p>;
  if (!places.length) return null;
  return <section id="event-stays" data-event-section="Nearby stays" tabIndex={-1} className="wf-event-stays" aria-label="Stay near this event">
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + `
      .wf-event-stays{margin:18px 14px 12px;min-width:0}
      .wf-event-stays:not(:has(.wf-event-place-rail)){display:none}
    ` }} />
    <EventStayCards places={places} />
  </section>;
}
