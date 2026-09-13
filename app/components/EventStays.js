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
  return <section id="event-stays" data-event-section="Nearby stays" tabIndex={-1} className="wf-event-stays" aria-label="Stay near this event">
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + `
      .wf-event-stays{margin:18px 14px 12px;min-width:0}
    ` }} />
    <EventStayCards places={places} />
  </section>;
}
