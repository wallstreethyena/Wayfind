// Events pipeline integrity, Phases 2-3 (EVENTS_PIPELINE_DIAGNOSIS.md) —
// the internal event detail page, and the preferred primary destination
// for every event from a resolvable provider. Server-rendered from a fresh
// by-id provider lookup (lib/eventResolve.js) so a shared or reloaded URL
// shows real, current data; an id that no longer resolves 404s via
// notFound() — never a silent redirect to the homepage. This implements
// the /events/[city]/[event-slug] leg of the audit prompt's URL scheme.
import { notFound } from "next/navigation";
import { resolveEventById, idFromSlug } from "../../../../lib/eventResolve.js";
import { ticketOutUrl } from "../../../../lib/affiliates.js";
import TicketButton from "./TicketButton.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANON = "https://www.gowayfind.com";

function fmtDate(dateStr, timeStr) {
  try {
    const d = new Date(dateStr + "T" + (timeStr ? timeStr.slice(0, 5) : "12:00") + ":00");
    const date = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (!timeStr) return date;
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${date} · ${time}`;
  } catch { return dateStr; }
}

async function getEvent(params) {
  const id = idFromSlug(params.slug);
  if (!id) return null;
  return resolveEventById(id);
}

export async function generateMetadata({ params }) {
  const e = await getEvent(params);
  if (!e) return { title: "Event not found · Wayfind", robots: { index: false, follow: true } };
  const where = [e.venue, e.city].filter(Boolean).join(", ");
  return {
    title: `${e.name}${where ? " at " + where : ""} · Wayfind Events`,
    description: `${e.name} on ${fmtDate(e.date, e.time)}${where ? " at " + where : ""}. Times, venue, and tickets on Wayfind.`,
    alternates: { canonical: `${CANON}/events/${params.city}/${params.slug}` },
    robots: { index: false, follow: true }, // noindex until the owner decides event pages should enter the crawl budget (infinite, dated inventory)
  };
}

export default async function EventPage({ params }) {
  const e = await getEvent(params);
  if (!e) notFound();
  const cancelled = /cancelled|canceled|postponed/i.test(e.status || "");
  const where = [e.venue, e.city].filter(Boolean).join(", ");
  const mapsUrl = where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((e.venue || "") + " " + (e.city || ""))}` : null;
  const external = e.url ? ticketOutUrl(e.url) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.name,
    startDate: e.time ? `${e.date}T${e.time.slice(0, 5)}` : e.date,
    eventStatus: cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    ...(e.venue ? { location: { "@type": "Place", name: e.venue, ...(e.city ? { address: e.city } : {}) } } : {}),
    ...(e.image ? { image: [e.image] } : {}),
    ...(e.url ? { url: e.url } : {}),
  };
  const A = "#2EC9A6";
  return (
    <div style={{ background: "#0D1117", minHeight: "100vh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 20px 48px" }}>
        <a href="/events" style={{ color: A, fontWeight: 800, textDecoration: "none", fontSize: 13.5 }}>‹ All events</a>
        {e.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.image} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 16, marginTop: 14, display: "block" }} />
        )}
        {cancelled && (
          <div style={{ marginTop: 14, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.5)", borderRadius: 12, padding: "11px 14px", color: "#FCA5A5", fontWeight: 800, fontSize: 13.5 }}>
            This event has been {/postponed/i.test(e.status) ? "postponed" : "cancelled"} by the organizer. Check the official listing before making plans.
          </div>
        )}
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9", lineHeight: 1.2, margin: "16px 0 6px" }}>{e.name}</h1>
        <div style={{ fontSize: 15, fontWeight: 700, color: A }}>{fmtDate(e.date, e.time)}</div>
        {where && (
          <div style={{ marginTop: 14, background: "#131A24", border: "1px solid #263041", borderRadius: 14, padding: "13px 15px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", color: "#94A3B8" }}>Venue</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", marginTop: 3 }}>{e.venue || e.city}</div>
            {e.city && e.venue && <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 1 }}>{e.city}</div>}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 9, color: A, fontWeight: 800, fontSize: 13, textDecoration: "none" }}>Directions ↗</a>}
          </div>
        )}
        {e.description && <p style={{ fontSize: 14, lineHeight: 1.65, color: "#CBD5E1", marginTop: 14 }}>{String(e.description).slice(0, 600)}</p>}
        {e.price && <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: "#22C55E" }}>{e.price}</div>}
        {!cancelled && external && (
          <TicketButton url={external} label={e.ticketed ? "Get tickets ↗" : "Official site ↗"} />
        )}
        <div style={{ marginTop: 16, fontSize: 11.5, color: "#64748B" }}>
          Listing from {e.source}. Times and availability can change — confirm on the {e.ticketed ? "ticket page" : "official site"} before you go.
        </div>
        <a href="/events" style={{ display: "inline-block", marginTop: 20, color: A, fontWeight: 800, fontSize: 13.5, textDecoration: "none" }}>‹ Back to all events</a>
      </div>
    </div>
  );
}
