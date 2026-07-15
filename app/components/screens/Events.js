"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). EventArt and
// EventCard move too (this screen is their only consumer); the event helpers
// they use stay in home.js — other surfaces share them — and arrive via ctx.
import { useState } from "react";
import { C, Icon, TARGET } from "../kit";
import * as Culture from "../../../lib/culture";

function EventArt({ e, seg, height, ctx }) {
  const { eventUseImage } = ctx;
  const [bad, setBad] = useState(false);
  const acc = (seg && seg.color) || C.accent;
  if (eventUseImage(e) && !bad) {
    return <img src={e.image} alt="" loading="lazy" draggable={false} onError={() => setBad(true)} onLoad={(ev) => { try { if (ev.target && ev.target.naturalWidth && ev.target.naturalWidth < 320) setBad(true); } catch {} }} style={{ width: "100%", height, objectFit: "cover", display: "block" }} />;
  }
  return (
    <div style={{ width: "100%", height, position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${acc}30 0%, #131A24 56%, #0D1117 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: -24, right: -24, width: 110, height: 110, borderRadius: "50%", background: `radial-gradient(circle, ${acc}33 0%, transparent 70%)`, pointerEvents: "none" }} />
      <Icon name={(seg && seg.iconName) || "ticket"} size={38} color={acc} strokeWidth={1.6} style={{ opacity: 0.92 }} />
      <div style={{ position: "absolute", bottom: 7, left: 10, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase", color: acc, opacity: 0.92 }}>{seg ? seg.short : "Event"}</div>
    </div>
  );
}
// Events pipeline integrity, Phase 2 (EVENTS_PIPELINE_DIAGNOSIS.md): the
// title, image, and body are ONE semantic link to the event's resolved
// primary destination (e.dest, computed server-side -- internal detail
// page preferred, validated external URL otherwise). The venue lookup and
// the external tickets link are separate controls OUTSIDE that link; no
// interactive element nests inside another. An event without a resolved
// destination never renders (the API already excludes it; the guard here
// is belt-and-braces for stale client state).
function EventCard({ e, onVenue, ctx }) {
  const { formatEventDate, eventCategory, recurrenceLabel, cleanVenueName, ticketUrl, logEvent } = ctx;
  if (!e || !e.dest) return null;
  const f = formatEventDate(e.date, e.time);
  const seg = eventCategory(e);
  const rec = recurrenceLabel(e);
  const venue = cleanVenueName(e.venue);
  const internal = e.destKind === "internal";
  const href = internal ? e.dest : ticketUrl(e.dest);
  const externalTickets = internal && e.url ? ticketUrl(e.url) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <a
        href={href}
        {...(internal ? {} : { target: "_blank", rel: "noreferrer" })}
        onClick={() => { try { logEvent("event_open", null, { id: e.id, kind: e.destKind, src: "events_grid" }); } catch (er) {} }}
        style={{ display: "flex", flexDirection: "column", textDecoration: "none", color: "inherit" }}
      >
        <div style={{ position: "relative" }}>
          <EventArt ctx={ctx} e={e} seg={seg} height={120} />
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(13,17,23,.85)", borderRadius: 8, padding: "3px 7px", textAlign: "center", minWidth: 36, backdropFilter: "blur(3px)" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.mo}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{f.day}</div>
          </div>
          {(e.segment || e.genre) && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(13,17,23,.85)", color: seg.color, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, backdropFilter: "blur(3px)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name={seg.iconName || "ticket"} size={11} color={seg.color} />{seg.short}</div>}
        </div>
        <div style={{ padding: "9px 10px 0", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
            {rec
              ? <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, background: C.adim, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>↻ {rec}</span>
              : (f.wd && <span style={{ fontSize: 11, color: C.muted }}>{f.wd}</span>)}
            {f.time && <span style={{ fontSize: 11, color: C.muted }}>{rec ? "" : "· "}{f.time}</span>}
          </div>
          {e.price && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.green, marginTop: 4 }}>{e.price}</div>}
        </div>
      </a>
      <div style={{ padding: "0 10px 11px", display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {venue && (
          <button onClick={() => onVenue && onVenue()} style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, marginTop: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>📍 {venue} ›</button>
        )}
        <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          {externalTickets
            ? <a href={externalTickets} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("ticket", null, { id: e.id, src: "events_grid" }); } catch (er) {} }} style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, textDecoration: "none" }}>{e.ticketed ? "Get tickets ↗" : "Official site ↗"}</a>
            : <span />}
          {e.source && <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>{e.source}</span>}
        </div>
      </div>
    </div>
  );
}

// v6.20 — the ONE events filter (owner direction, image 3 style): a single
// dropdown pill, not a chip row. Categories only — Concerts is the marquee
// default; "Local events" merges the old Near me + Community civic feed;
// "Business events" is a new source (venues that publish an RSS/iCal/API feed),
// shown with an honest empty state until those feeds are configured.
const EVENT_FILTERS = [
  { key: "concerts", label: "Concerts", icon: "🎵", bucket: "concerts" },
  { key: "comedy", label: "Comedy", icon: "😂", bucket: "comedy" },
  { key: "theater", label: "Theater", icon: "🎭", bucket: "theater" },
  { key: "sports", label: "Sports", icon: "⚾", bucket: "sports" },
  { key: "local", label: "Local events", icon: "🏘️", bucket: "community" },
  { key: "business", label: "Business events", icon: "💼", bucket: "business" },
];
// The category we land on when the user hasn't picked one: the best-paying
// category that actually has events (ticketed first), then the local feed.
const DEFAULT_PRIORITY = ["concerts", "sports", "comedy", "theater", "local"];

export default function EventsScreen({ ctx }) {
  const { events, eventCat, setEventCat, eventDate, setEventDate, locName, center, submitSearch, eventsLoading, eventsUnavailable, eventsError, loadEvents, openVenue, dedupeEvents, AreaInsight, Loader, eventsTours, eventBucket, ViatorRail } = ctx;
  const all = events || [];
  const [filterOpen, setFilterOpen] = useState(false);
  // v6.20 — geo distance so ties break by proximity.
  const distMi = (e) => { if (!center || e == null || e.lat == null || e.lng == null) return Infinity; const R = 3958.8, t = (d) => (d * Math.PI) / 180; const s = Math.sin(t(e.lat - center.lat) / 2) ** 2 + Math.cos(t(center.lat)) * Math.cos(t(e.lat)) * Math.sin(t(e.lng - center.lng) / 2) ** 2; return R * 2 * Math.asin(Math.sqrt(s)); };
  const countForFilter = (f) => all.filter((e) => eventBucket(e) === f.bucket).length;
  // Resolve the active filter. A real category the user picked is respected even
  // when empty; the "auto" default (and any legacy tours/all/community value)
  // resolves to the best populated category so the page never lands empty.
  const isRealKey = EVENT_FILTERS.some((f) => f.key === eventCat);
  let activeKey = eventCat;
  if (!isRealKey) {
    activeKey = DEFAULT_PRIORITY.find((k) => { const f = EVENT_FILTERS.find((x) => x.key === k); return f && countForFilter(f) > 0; }) || "local";
  }
  const activeFilter = EVENT_FILTERS.find((f) => f.key === activeKey) || EVENT_FILTERS[0];
  const isBusiness = activeFilter.key === "business";
  const catBase = all.filter((e) => eventBucket(e) === activeFilter.bucket);
  const countFor = (dateVal) => dedupeEvents(catBase.filter((e) => e.date === dateVal), false).length;
  const allCount = dedupeEvents(catBase, true).length;
  let shown = catBase;
  if (eventDate !== "all") shown = shown.filter((e) => e.date === eventDate);
  shown = dedupeEvents(shown, eventDate === "all");
  // What's coming up, nearest-when first; proximity breaks ties.
  shown = shown.slice().sort((a, b) => (String(a.date || "9999").localeCompare(String(b.date || "9999"))) || (String(a.time || "99").localeCompare(String(b.time || "99"))) || (distMi(a) - distMi(b)));
  const tours = Array.isArray(eventsTours) ? eventsTours : [];
  const eventDateChips = [];
  const enow = new Date();
  for (let i = 0; i < 28; i++) {
    const d = new Date(enow.getFullYear(), enow.getMonth(), enow.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    eventDateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
  }
  const dchip = (on) => ({ flexShrink: 0, minWidth: 46, padding: "6px 9px", borderRadius: 12, border: `1px solid ${on ? C.accent : C.border}`, cursor: "pointer", textAlign: "center", background: on ? C.accent : C.panel, color: on ? "#0D1117" : C.light, fontWeight: 700 });
  const businessEmpty = (
    <div style={{ textAlign: "center", padding: "40px 24px", color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💼</div>
      <strong style={{ display: "block", color: C.light }}>No business events yet</strong>
      <span style={{ fontSize: 13, lineHeight: 1.5 }}>We&apos;re onboarding local businesses that publish a public calendar (RSS, iCal, or API). When they do, their events show up here — never invented.</span>
    </div>
  );
  return (
    <div>
      <div style={{ paddingTop: 4, marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Events near you</div>
        {(() => { const _cm = Culture.resolveMetro(locName); return _cm ? <div style={{ marginTop: 10 }}><AreaInsight metro={_cm} cat={"events"} town={locName ? locName.split(",")[0] : null} center={center} onFind={(q) => submitSearch(q, { miles: 45 })} /></div> : null; })()}
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Bookable tours, concerts, comedy, theater, sports, and local happenings near you</div>
      </div>

      {/* v6.20 — TOURS RAIL is PERMANENTLY pinned to the top of every filter
          view (owner direction: revenue stays up top, no toggle). */}
      {eventsTours === null ? (
        <Loader label="Finding bookable experiences" pad="6px 2px" />
      ) : tours.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <ViatorRail title="Bookable experiences near you" items={tours} theme="events-tours" />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Tours &amp; activities are affiliate links; Wayfind may earn a commission at no cost to you. It never changes what we recommend.</div>
        </div>
      ) : null}

      {/* v6.20 — the ONE events filter: a dropdown pill (image-3 style), not a
          chip row. Categories only; this control is events-page-only. */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <button onClick={() => setFilterOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={filterOpen} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 15px", borderRadius: 999, background: C.panel, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          <span style={{ fontSize: 15 }}>{activeFilter.icon}</span>
          <span>{activeFilter.label}</span>
          <span style={{ color: C.accent, transform: filterOpen ? "rotate(180deg)" : "none", transition: "transform .18s ease" }}>▾</span>
        </button>
        {filterOpen && (
          <>
            <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, minWidth: 220, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 34px rgba(0,0,0,.5)", overflow: "hidden" }}>
              {EVENT_FILTERS.map((f) => { const on = f.key === activeFilter.key; const n = countForFilter(f); return (
                <button key={f.key} role="option" aria-selected={on} onClick={() => { setEventCat(f.key); setFilterOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "12px 15px", background: on ? C.adim : "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: on ? C.accent : C.text, fontSize: 14.5, fontWeight: on ? 800 : 600, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 16 }}>{f.icon}</span>
                  <span style={{ flex: 1 }}>{f.label}</span>
                  {f.bucket !== "__business__" && n > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: on ? C.accent : C.muted }}>{n}</span>}
                  {on && <span style={{ color: C.accent }}>✓</span>}
                </button>
              ); })}
            </div>
          </>
        )}
      </div>

      {/* Date chips (kept — events-page-only). Hidden for the Business feed. */}
      {!isBusiness && !eventsLoading && !eventsUnavailable && !eventsError && all.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            <button onClick={() => setEventDate("all")} style={dchip(eventDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 14 }}>All</div><div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{allCount}</div></button>
            {eventDateChips.map((d) => { const count = countFor(d.value); return (
              <button key={d.value} onClick={() => setEventDate(d.value)} style={dchip(eventDate === d.value)}>
                <div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div>
                <div style={{ fontSize: 14 }}>{d.day}</div>
                <div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{count > 0 ? count : ""}</div>
              </button>
            ); })}
          </div>
        </div>
      )}

      {/* Event grid for the selected category (Business events flow through the
          same path — a distinct source, shown only when its feeds return real
          events; otherwise the honest empty state below). */}
      {eventsLoading && <Loader label="Finding plans" pad="8px 2px" />}
      {!eventsLoading && eventsUnavailable && !isBusiness && <div style={{ color: C.muted, fontSize: 13, padding: "8px 2px" }}>Local events aren&apos;t turned on for your area yet — but the bookable experiences above always work.</div>}
      {!eventsLoading && (eventsUnavailable ? isBusiness : true) && !eventsError && shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
          {shown.map((e) => <EventCard key={e.id} e={e} onVenue={() => openVenue(e)} ctx={ctx} />)}
        </div>
      )}
      {!eventsLoading && !eventsError && shown.length === 0 && (
        isBusiness
          ? businessEmpty
          : eventsUnavailable
            ? null
            : all.length === 0
              ? <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No events in your area yet</strong>
                  <span style={{ fontSize: 13 }}>We&apos;re still expanding Wayfind events to your area. Check back soon.</span>
                </div>
              : <div style={{ textAlign: "center", padding: "32px 24px", color: C.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing in {activeFilter.label.toLowerCase()} {eventDate === "all" ? "right now" : "on this day"}</strong>
                  <span style={{ fontSize: 13 }}>Try another category or date — the bookable experiences above are always live.</span>
                </div>
      )}
      {!eventsLoading && eventsError && !isBusiness && (
        <div style={{ textAlign: "center", padding: "40px 24px", color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
          <strong style={{ display: "block", color: C.light }}>No events to show right now</strong>
          <span style={{ fontSize: 13 }}>Check back in a little while.</span>
          <div onClick={loadEvents} style={{ marginTop: 12, color: C.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Refresh ↻</div>
        </div>
      )}
    </div>
  );
}
