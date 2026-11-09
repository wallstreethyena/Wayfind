// app/components/ThisWeekEvents.js - "This week in Florida" homepage strip.
//
// Data is built on the server (lib/thisWeekEvents.js, called from app/page.js) and passed
// down exactly like LocalEdit's guides, so this file is a plain presentational component,
// safe inside the client-rendered Home. Photos go through CardPhoto, the same
// rights-aware component the /florida-events hub cards use. Every card is a real <a href>.
// Event cards open /florida-events/<slug>. The Christmas hub card opens /christmas-in-florida.
// Statewide, no geolocation, no prices. Fewer than two events: renders nothing.
import CardPhoto from "./CardPhoto.js";
import { C, TYPE } from "./kit";

export default function ThisWeekEvents({ events, guide = null }) {
  const evs = Array.isArray(events) ? events : [];
  // The weekly trend guide (lib/thisWeekEvents.js weeklyTrendGuideCard) leads the strip.
  // The Christmas hub card, when the season is live, is the first dated card
  // behind it (built in app/page.js from lib/christmasHubCard.js).
  const cards = guide && guide.href ? [guide, ...evs] : evs;
  if (evs.length < 2 || cards.length < 2) return null;
  return (
    <section aria-label="This week in Florida" style={{ marginBottom: 12 }}>
      <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 4 }}>This week in Florida</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#8D9AAB" }}>Dated events with verified pages</span>
        <a href="/florida-events" style={{ fontSize: 12, fontWeight: 700, color: C.text, textDecoration: "none", whiteSpace: "nowrap" }}>See all events</a>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 4, scrollSnapType: "x proximity" }}>
        {cards.map((e) => (
          <a key={e.slug} href={e.href} data-hub={e.hub ? e.slug : undefined} style={{ flex: "0 0 168px", scrollSnapAlign: "start", textDecoration: "none", border: "1px solid " + C.border, borderRadius: 14, background: "#0B0E15", overflow: "hidden", fontFamily: "var(--wf-sans)" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 10", background: "#141A24" }}>
              {e.image ? <CardPhoto inLink src={e.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: e.position || undefined, display: "block" }} fallbackCategory="events" /> : null}
              {e.credit ? <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "2px 6px", fontSize: 9, lineHeight: 1.3, color: "rgba(255,255,255,.85)", background: "linear-gradient(transparent, rgba(0,0,0,.55))", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Photo: {e.credit}</span> : null}
            </div>
            <div style={{ padding: "8px 10px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: e.accent || "#FF8A3D", letterSpacing: 0.3 }}>{e.when}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.3, marginTop: 2 }}>{e.name}</div>
              {e.city ? <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{e.city}</div> : null}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
