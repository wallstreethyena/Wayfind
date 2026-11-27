// CommunityTripPage — the one layout for a community guide (/community/<slug>)
// and an itinerary template (/itineraries/<slug>). Server component.
//
// Every stop links to its Wayfind page; event stops carry their ticket button
// through eventDetailTicketAction (registry deal through /api/commerce/go,
// Ticketmaster through /api/ticketmaster/go, else the organizer link) with the
// page's own surface name, so a ticket click is attributed to the guide or
// template by surface and page path only, never to a person. "Save this trip"
// uses the existing share codec (lib/itineraryShare.js) so the trip lands in
// the reader's own itinerary with the normal import flow.
import Link from "next/link";
import CommerceClickBeacon from "./CommerceClickBeacon";
import GuidePhoto from "./GuidePhoto";
import ShareButton from "../components/ShareButton";
import CommunityTripClient from "./CommunityTripClient";
import { SITE_URL } from "../../lib/site";
import { categoryLabel } from "../../lib/communityGuides";
import { SLOT_LABEL } from "../../lib/itineraryTemplates";
import { measureItineraryShare } from "../../lib/itineraryShare";
import { railPhotoSrc } from "../../lib/cardPhotoRequest";

const INK = "#0D1117", CARD = "#1C2230", HAIR = "#2D3748", TEXT = "#F1F5F9", MUTE = "#94A3B8", LIGHT = "#CBD5E1", GOLD = "#FBBF24";

const S = {
  page: { minHeight: "100vh", background: INK, color: TEXT, fontFamily: "var(--wf-sans, system-ui, -apple-system, sans-serif)" },
  wrap: { maxWidth: 760, margin: "0 auto", padding: "28px 16px 64px", boxSizing: "border-box" },
  crumb: { fontSize: 13, color: MUTE, textDecoration: "none" },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: GOLD, margin: "18px 0 6px" },
  h1: { fontSize: "clamp(26px, 6vw, 36px)", lineHeight: 1.15, fontWeight: 800, margin: "0 0 10px", overflowWrap: "anywhere" },
  intro: { fontSize: 16, lineHeight: 1.55, color: LIGHT, margin: "0 0 14px" },
  meta: { fontSize: 13, color: MUTE, margin: "0 0 18px" },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, margin: "0 0 24px" },
  save: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 48, padding: "0 18px", borderRadius: 12, background: GOLD, color: "#0D1117", fontWeight: 800, fontSize: 15, textDecoration: "none" },
  day: { fontSize: 18, fontWeight: 800, margin: "26px 0 10px" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 },
  card: { display: "flex", gap: 12, background: CARD, border: `1px solid ${HAIR}`, borderRadius: 16, padding: 12, minWidth: 0 },
  thumb: { width: 92, height: 92, flexShrink: 0, borderRadius: 12, objectFit: "cover", background: "#11161F" },
  thumbBox: { width: 92, height: 92, flexShrink: 0, borderRadius: 12, overflow: "hidden", background: "#11161F" },
  body: { minWidth: 0, flex: 1 },
  label: { fontSize: 12, fontWeight: 800, color: MUTE, letterSpacing: ".4px", textTransform: "uppercase" },
  name: { fontSize: 16, fontWeight: 800, color: TEXT, textDecoration: "none", overflowWrap: "anywhere", display: "block", margin: "2px 0 4px" },
  blurb: { fontSize: 14, lineHeight: 1.45, color: LIGHT, margin: 0, overflowWrap: "anywhere" },
  ticket: { display: "inline-flex", alignItems: "center", minHeight: 44, marginTop: 8, padding: "0 14px", borderRadius: 10, background: "#FACC15", color: "#111827", fontWeight: 800, fontSize: 14, textDecoration: "none" },
  credit: { fontSize: 11, color: MUTE, marginTop: 4 },
  note: { fontSize: 12.5, color: MUTE, marginTop: 28, lineHeight: 1.5 },
};

function stopHref(s) {
  if (s.kind === "event") return s.slug ? `/florida-events/${encodeURIComponent(s.slug)}` : null;
  return `/p/${encodeURIComponent(s.ref_id)}`;
}

function stopPhoto(s) {
  if (s.photo && s.photo.url) return { src: s.photo.url, credit: s.photo.credit || "" };
  if (s.kind === "place") {
    const src = railPhotoSrc({ id: s.ref_id });
    return src ? { src, credit: "" } : null;
  }
  return null;
}

function tripFor(stops, title, city) {
  return {
    title, city, state: "FL",
    items: stops.filter((s) => s.kind === "place").map((s, i) => ({ id: s.ref_id, order: i, place: { id: s.ref_id, name: s.name, type: categoryLabel(s.category) } })),
  };
}

/**
 * kind: "guide" | "template"; doc: the stored row (public view);
 * stops: live stops; tickets: Map ref_id -> ticket action (or null);
 * path: this page's path.
 */
export default function CommunityTripPage({ kind, doc, stops, tickets, path }) {
  const surface = kind === "guide" ? "community_guide" : "itinerary_template";
  const shareUrl = SITE_URL + path;
  const days = [...new Set(stops.map((s) => s.day || 1))].sort((a, b) => a - b);
  const share = measureItineraryShare(tripFor(stops, doc.title, doc.city), SITE_URL);
  const saveHref = share && share.ok ? share.queryUrl.replace(SITE_URL, "") : null;
  const videoStops = stops.slice(0, 8).map((s) => ({ name: s.name, category: categoryLabel(s.category), dayNumber: s.day || 1, photo: s.photo && s.photo.url ? { url: s.photo.url, credit: s.photo.credit || "" } : null }));
  const ld = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: doc.title,
    description: doc.intro || undefined,
    url: shareUrl,
    touristType: kind === "guide" ? "Community trip guide" : "Wayfind itinerary",
    itinerary: {
      "@type": "ItemList",
      numberOfItems: stops.length,
      itemListElement: stops.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, ...(stopHref(s) ? { url: SITE_URL + stopHref(s) } : {}) })),
    },
  };
  return (
    <main style={S.page} data-community-trip={kind}>
      <CommerceClickBeacon surface={surface} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <div style={S.wrap}>
        <Link href={kind === "guide" ? "/community" : "/itineraries"} style={S.crumb}>{kind === "guide" ? "‹ Community guides" : "‹ Itineraries"}</Link>
        <div style={S.kicker}>{kind === "guide" ? `Community guide · ${doc.city}` : `Wayfind itinerary · ${doc.city}`}</div>
        <h1 style={S.h1}>{doc.title}</h1>
        {doc.intro ? <p style={S.intro}>{doc.intro}</p> : null}
        <p style={S.meta}>
          {kind === "guide" ? `By ${doc.author || "A Wayfind local"} · ` : ""}
          {stops.length} stops · {days.length > 1 ? `${days.length} days` : "1 day"}
        </p>
        <div style={S.actions}>
          {saveHref ? <a href={saveHref} style={S.save} data-save-trip="1">Save this trip</a> : null}
          <ShareButton url={shareUrl} title={doc.title} text={`${doc.title} on Wayfind`} label="Share" event={kind === "guide" ? "community_guide_share" : "itinerary_template_share"} />
        </div>
        <CommunityTripClient kind={kind} slug={doc.slug} video={{ title: doc.title, city: doc.city, days: days.length, stops: videoStops }} />
        {days.map((d) => (
          <section key={d} aria-labelledby={`day-${d}`}>
            {days.length > 1 ? <h2 id={`day-${d}`} style={S.day}>Day {d}</h2> : <h2 id={`day-${d}`} style={{ ...S.day, position: "absolute", left: -9999 }}>Stops</h2>}
            <ol style={S.list}>
              {stops.filter((s) => (s.day || 1) === d).map((s) => {
                const href = stopHref(s);
                const photo = stopPhoto(s);
                const t = tickets && tickets.get(s.ref_id);
                return (
                  <li key={s.kind + s.ref_id} style={S.card} data-stop-kind={s.kind}>
                    {photo ? (
                      <div style={S.thumbBox}><GuidePhoto src={photo.src} alt={s.name} width={92} height={92} loading="lazy" style={S.thumb} fallbackText={s.name} /></div>
                    ) : null}
                    <div style={S.body}>
                      <div style={S.label}>{s.slot ? `${SLOT_LABEL[s.slot] || ""} · ` : ""}{categoryLabel(s.category)}{s.time ? ` · ${s.time}` : ""}{s.area ? ` · ${s.area}` : ""}</div>
                      {href ? <a href={href} style={S.name} data-guide-stop={s.ref_id}>{s.name}</a> : <span style={S.name}>{s.name}</span>}
                      {s.blurb ? <p style={S.blurb}>{s.blurb}</p> : null}
                      {photo && photo.credit ? <div style={S.credit}>Photo: {photo.credit}</div> : null}
                      {t ? <a href={t.href} rel={t.rel || "sponsored noopener"} style={S.ticket}>{t.label}</a> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        <p style={S.note}>
          {kind === "guide"
            ? "Shared by a Wayfind member who chose to publish their trip. Places and their order only: no personal notes or dates. Check hours before you go."
            : "Built by Wayfind from places and events we track. Times appear only where the event lists one. Check hours before you go."}
        </p>
      </div>
    </main>
  );
}
