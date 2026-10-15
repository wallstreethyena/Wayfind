import { eventStays } from "../../lib/eventStays.js";
import { guideStaysPlaces as selectGuideStays, acceptVerifiedHotel } from "../../lib/guideStays.js";
import { unstable_cache } from "next/cache";
import { WF_PLACE_CARD_CSS } from "./css";
import EventStayCards from "./EventStayCards";

// Same selection as event pages (eventStays) narrowed to verified hotels; own
// cache key so the two surfaces can be invalidated independently. Inventory
// reads stay inside a Data Cache boundary so the guide page keeps its ISR behaviour.
const cachedGuideStays = unstable_cache(
  async (lat, lng) => eventStays({ lat, lng }, { accept: acceptVerifiedHotel }),
  ["guide-stays-v1"],
  { revalidate: 3600 },
);

// Empty or unavailable rails never render (unlike the event page's notice).
export default async function GuideStays({ slug }) {
  const found = await selectGuideStays(slug, cachedGuideStays);
  if (!found) return null;
  const { cfg, places } = found;
  return <section id="guide-stays" data-guide-section="Stays" className="wf-guide-stays" aria-label={`Where to stay in ${cfg.label}`}>
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + `
      .wf-guide-stays{margin:28px 0 20px;min-width:0}
      .wf-guide-stays-note{font-size:12.5px;line-height:1.5;color:#94A3B8;margin:8px 2px 0}
    ` }} />
    <EventStayCards places={places} surface="guide_stays" title={`Where to stay in ${cfg.label}`} description={`Top-rated stays near ${cfg.label}.`} label={`Hotels in ${cfg.label}`} />
    <p className="wf-guide-stays-note">We may earn a commission when you book through partner links. It never changes our rankings.</p>
  </section>;
}
