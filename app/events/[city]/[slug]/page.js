// Events pipeline integrity, Phases 2-3 (EVENTS_PIPELINE_DIAGNOSIS.md) —
// the internal event detail page, and the preferred primary destination
// for every event from a resolvable provider. Server-rendered from a fresh
// by-id provider lookup (lib/eventResolve.js) so a shared or reloaded URL
// shows real, current data; an id that no longer resolves 404s via
// notFound() — never a silent redirect to the homepage. This implements
// the /events/[city]/[event-slug] leg of the audit prompt's URL scheme.
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { resolveEventById, idFromSlug } from "../../../../lib/eventResolve.js";
import { ticketOutUrl } from "../../../../lib/affiliates.js";
import { isEventWindow, EVENT_WINDOWS, windowRange, filterByWindow } from "../../../../lib/eventsList.js";
import { LANDING_CITIES } from "../../../../lib/landing.js";
import TicketButton from "./TicketButton.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANON = "https://www.gowayfind.com";

// v5.62 (audit Phase 5): the [slug] segment is shared — a known time-window
// slug (this-weekend/tonight/this-month) renders the server-side event LIST
// for the city; anything else is an event-detail id (below). Two dynamic
// params can't share a route position in Next, so they branch here.

async function fetchCityEvents(citySlug) {
  const city = LANDING_CITIES[citySlug];
  if (!city) return null;
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || (host && host.startsWith("localhost") ? "http" : "https");
    const base = host ? `${proto}://${host}` : CANON;
    const r = await fetch(`${base}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: city.lat, lng: city.lng, city: `${city.name}, ${city.state}`, radius: 60 }),
      cache: "no-store",
    });
    if (!r.ok) return { city, events: [] };
    const data = await r.json();
    return { city, events: (data && Array.isArray(data.events) ? data.events : []).filter((e) => e && e.dest) };
  } catch (e) {
    return { city, events: [] };
  }
}

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
  if (isEventWindow(params.slug)) {
    const city = LANDING_CITIES[params.city];
    if (!city) return { title: "Events · Wayfind", robots: { index: false, follow: true } };
    const win = EVENT_WINDOWS[params.slug];
    const title = `Events ${win.title} in ${city.name}, ${city.state} · Wayfind`;
    const description = `Concerts, games, festivals and things to do ${win.label.toLowerCase()} in ${city.name}, ${city.state} — real, bookable events ranked by Wayfind.`;
    return {
      title, description,
      alternates: { canonical: `${CANON}/events/${params.city}/${params.slug}` },
      openGraph: { title, description, url: `${CANON}/events/${params.city}/${params.slug}`, type: "website" },
      robots: { index: false, follow: true }, // noindex until the owner opens event pages to the crawl budget (dated inventory); the URLs are durable + shareable now
    };
  }
  const e = await getEvent(params);
  if (!e) return { title: "Event not found · Wayfind", robots: { index: false, follow: true } };
  const where = [e.venue, e.city].filter(Boolean).join(", ");
  return {
    title: `${e.name}${where ? " at " + where : ""} · Wayfind Events`,
    description: `${e.name} on ${fmtDate(e.date, e.time)}${where ? " at " + where : ""}. Times, venue, and tickets on Wayfind.`,
    alternates: { canonical: `${CANON}/events/${params.city}/${params.slug}` },
    openGraph: { title: `${e.name} · Wayfind Events`, description: `${e.name} on ${fmtDate(e.date, e.time)}`, ...(e.image ? { images: [e.image] } : {}) },
    robots: { index: false, follow: true }, // noindex until the owner decides event pages should enter the crawl budget (infinite, dated inventory)
  };
}

function fmtDay(dateStr) {
  try { return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch { return dateStr; }
}

async function EventListPage({ params }) {
  const win = EVENT_WINDOWS[params.slug];
  const res = await fetchCityEvents(params.city);
  if (!res) notFound();
  const { city } = res;
  const range = windowRange(params.slug);
  const events = filterByWindow(res.events, params.slug).slice(0, 60);
  const A = "#2EC9A6";
  const canonBase = `${CANON}/events/${params.city}/${params.slug}`;
  // ItemList + per-item Event schema (Phase 5). Only real, validated events.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Events ${win.title} in ${city.name}`,
    itemListElement: events.map((e, i) => ({
      "@type": "ListItem", position: i + 1,
      item: {
        "@type": "Event", name: e.name,
        startDate: e.time ? `${e.date}T${e.time.slice(0, 5)}` : e.date,
        eventStatus: "https://schema.org/EventScheduled",
        url: e.destKind === "internal" ? `${CANON}${e.dest}` : e.dest,
        ...(e.venue ? { location: { "@type": "Place", name: e.venue, ...(e.city ? { address: e.city } : {}) } } : {}),
        ...(e.image ? { image: [e.image] } : {}),
      },
    })),
  };
  return (
    <div style={{ background: "#0D1117", minHeight: "100dvh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 48px" }}>
        <a href="/events" style={{ color: A, fontWeight: 800, textDecoration: "none", fontSize: 13.5 }}>‹ All events</a>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9", lineHeight: 1.2, margin: "16px 0 4px" }}>Events {win.title} in {city.name}, {city.state}</h1>
        <p style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.6, marginBottom: 8 }}>Concerts, games, festivals and things to do {win.label.toLowerCase()} near {city.name} — real, bookable events ranked by Wayfind.</p>
        {/* Time-window nav (durable, shareable URLs). */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 18px" }}>
          {Object.keys(EVENT_WINDOWS).map((w) => (
            <a key={w} href={`/events/${params.city}/${w}`} style={{ padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none", border: `1px solid ${w === params.slug ? A : "#263041"}`, color: w === params.slug ? "#0D1117" : "#CBD5E1", background: w === params.slug ? A : "transparent" }}>{EVENT_WINDOWS[w].label}</a>
          ))}
        </div>
        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "#94A3B8" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#CBD5E1" }}>No events {win.label.toLowerCase()} in {city.name} yet</div>
            <p style={{ fontSize: 13.5, margin: "8px auto 16px", maxWidth: 360, lineHeight: 1.55 }}>We searched {range.start === range.end ? "today" : `${fmtDay(range.start)} – ${fmtDay(range.end)}`}. Try another window or browse everything nearby.</p>
            <a href="/events" style={{ display: "inline-block", background: A, color: "#0D1117", fontWeight: 800, fontSize: 14, borderRadius: 12, padding: "11px 20px", textDecoration: "none" }}>Browse all events</a>
          </div>
        ) : (
          <div>
            {events.map((e) => {
              const internal = e.destKind === "internal";
              return (
                <a key={e.id} href={internal ? e.dest : e.dest} {...(internal ? {} : { target: "_blank", rel: "noreferrer" })} style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", background: "#131A24", border: "1px solid #263041", borderRadius: 12, padding: "12px 14px", marginBottom: 9 }}>
                  <div style={{ flexShrink: 0, width: 46, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: A, textTransform: "uppercase" }}>{fmtDay(e.date).split(" ")[1]}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9", lineHeight: 1 }}>{fmtDay(e.date).split(" ")[2]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                    <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDay(e.date)}{e.time ? " · " + e.time.slice(0, 5) : ""}{e.venue ? " · " + e.venue : ""}</div>
                  </div>
                  <span style={{ color: A, fontSize: 15, fontWeight: 800 }}>›</span>
                </a>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: 11.5, color: "#64748B" }}>Every listing is a real, validated event — no dead links, no past dates. Times can change; confirm before you go.</div>
      </div>
    </div>
  );
}

export default async function EventPage({ params }) {
  if (isEventWindow(params.slug)) return EventListPage({ params });
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
    <div style={{ background: "#0D1117", minHeight: "100dvh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
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
