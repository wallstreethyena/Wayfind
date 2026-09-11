import { eventStays } from "../../lib/eventStays.js";
import { unstable_cache } from "next/cache";
import { WF_PLACE_CARD_CSS } from "./css";
import EventStayCards from "./EventStayCards";

// Keep the inventory's no-store reads inside a Data Cache boundary so they
// cannot switch the parent ISR event page to dynamic rendering at runtime.
const cachedEventStays = unstable_cache(
  async (lat, lng) => eventStays({ lat, lng }),
  ["event-stays-v2"],
  { revalidate: 3600 },
);

export default async function EventStays({ lat, lng, venue }) {
  const { places, unavailable } = await cachedEventStays(lat, lng);
  if (unavailable) return <p style={{ color: "#aab4c2", margin: "28px 0", lineHeight: 1.6 }}>Nearby stays are temporarily unavailable.</p>;
  if (!places.length) return null;
  return <section className="wf-event-stays" aria-label="Stay near this event">
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + `
      .wf-event-stays{margin:36px 0 12px;min-width:0}
      .wf-event-stays h3{font-size:28px;line-height:1.2;margin:0 0 10px;color:#f5f4ef}
      .wf-event-stays>p{color:#aab4c2;line-height:1.6;margin:0 0 20px}
      .wf-event-stays-rail{display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x proximity;padding:4px 4px 20px;min-width:0}
      .wf-event-stay{flex:0 0 380px;max-width:100%;min-width:0;scroll-snap-align:start}
      .wf-event-stay>.wf-place-card{width:100%}
      @media(max-width:560px){.wf-event-stay{flex-basis:92%}.wf-event-stays h3{font-size:24px}}
    ` }} />
    <h3>Stay near this event</h3>
    <p>Places to stay within 12 miles of {venue || "the venue"}, ranked by Wayfind Score. Distance is measured from the event.</p>
    <EventStayCards places={places} />
  </section>;
}
