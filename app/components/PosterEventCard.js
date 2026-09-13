"use client";

// Portable event card for poster collections that also have standalone pages.
// The homepage may supply its richer, stateful EventRailCard nodes through
// eventsSlot; standalone pages receive the same selected raw events from the
// bounded /api/events feed and render this truthful read-only form.
import RailCard from "./RailCard";
import { eventWhenLabel } from "../../lib/eventTime.js";

function dateLabel(event) {
  if (!event?.date) return "";
  try {
    const date = new Date(`${event.date}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function segmentLabel(event) {
  const genre = String(event?.genre || "").split(",")[0].trim();
  if (genre && !/^(miscellaneous|other|unknown)$/i.test(genre) && genre.length <= 24) return genre;
  const segment = String(event?.segment || "").trim();
  return segment && !/^(miscellaneous|other|unknown)$/i.test(segment) ? segment : "Event";
}

export default function PosterEventCard({ event, rank = null, surface = "poster_event" }) {
  if (!event?.dest || !event?.name) return null;
  const relative = eventWhenLabel(event);
  const date = dateLabel(event);
  const when = relative || date
    ? { tone: /today|tonight|this morning|this afternoon/i.test(relative || "") ? "now" : relative === "Tomorrow" ? "soon" : "later", label: (relative || date).toUpperCase(), value: event.time || "" }
    : null;
  const internal = event.destKind === "internal" || String(event.dest).startsWith("/");
  const image = event.thumb || event.image || null;
  const facts = [event.venue || event.city || null, event.price || (event.ticketed === false ? "Free" : null)].filter(Boolean);
  return <RailCard
    photo={image}
    title={event.name}
    eyebrow={segmentLabel(event)}
    rank={rank}
    when={when}
    facts={facts}
    href={event.dest}
    external={!internal}
    ariaLabel={`Open ${event.name}`}
    cta={{ label: "Event details ↗", href: event.dest, external: !internal }}
    actionItem={{ id: event.id, type: "event", title: event.name, image, url: event.dest, provider: event.source || null }}
    surface={surface}
  />;
}
