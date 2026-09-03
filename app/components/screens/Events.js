"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). EventArt and
// EventCard move too (this screen is their only consumer); the event helpers
// they use stay in home.js — other surfaces share them — and arrive via ctx.
import { useState } from "react";
import { C, Icon, PlaceScoreChip, TARGET } from "../kit";
import * as Culture from "../../../lib/culture";
import { eventCategoryArt } from "../../../lib/eventCategoryArt";
import { rankExperiences } from "../../../lib/experiencesData";
import ViatorCommerceLink from "../ViatorCommerceLink";

function EventArt({ e, seg, height, ctx }) {
  const { eventUseImage, eventBucket } = ctx;
  const [failedImage, setFailedImage] = useState("");
  const acc = (seg && seg.color) || C.accent;
  const categoryImage = eventCategoryArt(eventBucket(e), e);
  const providerImage = eventUseImage(e) ? e.image : "";
  const image = providerImage && failedImage !== providerImage
    ? providerImage
    : (categoryImage && failedImage !== categoryImage ? categoryImage : "");
  const usingCategoryImage = image === categoryImage;
  if (image) {
    return <div style={{ position: "relative", width: "100%", height, overflow: "hidden" }}>
      <img src={image} alt="" loading="lazy" draggable={false} onError={() => setFailedImage(image)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: usingCategoryImage ? "saturate(.82) contrast(.96)" : "none" }} />
      {usingCategoryImage ? <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(5,9,15,.08),rgba(5,9,15,.52))" }} /> : null}
    </div>;
  }
  return (
    <div style={{ width: "100%", height, position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${acc}30 0%, #131A24 56%, #0D1117 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: -24, right: -24, width: 110, height: 110, borderRadius: "50%", background: `radial-gradient(circle, ${acc}33 0%, transparent 70%)`, pointerEvents: "none" }} />
      <Icon name={(seg && seg.iconName) || "ticket"} size={38} color={acc} strokeWidth={1.6} style={{ opacity: 0.92 }} />
      <div style={{ position: "absolute", bottom: 7, left: 10, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase", color: acc, opacity: 0.92 }}>{seg ? seg.short : "Event"}</div>
    </div>
  );
}

function TourArt({ src, height = 96 }) {
  const fallback = eventCategoryArt("tours");
  const [providerFailed, setProviderFailed] = useState(false);
  const image = src && !providerFailed ? src : fallback;
  const usingFallback = image === fallback;
  return (
    <div style={{ position: "relative", height, overflow: "hidden" }}>
      <img
        src={image}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => { if (!usingFallback) setProviderFailed(true); }}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: usingFallback ? "saturate(.82) contrast(.96)" : "none" }}
      />
      {usingFallback ? <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(5,9,15,.08),rgba(5,9,15,.5))" }} /> : null}
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
  const href = internal ? e.dest : ticketUrl(e.dest, { surface: "events_grid_card", offerId: e.id });
  const externalTickets = internal && e.url ? ticketUrl(e.url, { surface: "events_grid_tickets", offerId: e.id }) : null;
  const actionHref = externalTickets || href;
  const actionExternal = Boolean(externalTickets || !internal);
  const actionLabel = e.ticketVia ? "Tickets · " + e.ticketVia : e.ticketed ? "Get tickets" : (internal ? "Explore event" : "Official details");
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
            <div style={{ fontSize: 9, fontWeight: 800, color: C.light, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.mo}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{f.day}</div>
          </div>
          {(e.segment || e.genre) && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(13,17,23,.85)", color: seg.color, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, backdropFilter: "blur(3px)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name={seg.iconName || "ticket"} size={11} color={seg.color} />{seg.short}</div>}
        </div>
        <div style={{ padding: "10px 11px 0", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
            {rec
              ? <span style={{ fontSize: 10, fontWeight: 800, color: C.light, background: C.adim, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>↻ {rec}</span>
              : (f.wd && <span style={{ fontSize: 11, color: C.muted }}>{f.wd}</span>)}
            {f.time && <span style={{ fontSize: 11, color: C.muted }}>{rec ? "" : "· "}{f.time}</span>}
          </div>
          {e.price && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.green, marginTop: 4 }}>{e.price}</div>}
        </div>
      </a>
      <div style={{ padding: "0 11px 11px", display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {venue && (
          <button onClick={() => onVenue && onVenue()} style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, marginTop: 4, fontSize: 11.5, fontWeight: 700, color: C.light, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>📍 {venue} ›</button>
        )}
        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          <a
            href={actionHref}
            {...(actionExternal ? { target: "_blank", rel: e.ticketVia ? "sponsored nofollow noopener" : "noreferrer" } : {})}
            onClick={() => { try { logEvent(e.ticketed ? "ticket" : "event_open", null, { id: e.id, kind: e.destKind, src: "events_grid_cta" }); } catch (er) {} }}
            style={{ minHeight: 38, borderRadius: 10, background: e.ticketed ? C.accent : C.panel, border: `1px solid ${e.ticketed ? C.accent : C.border}`, color: e.ticketed ? "#0D1117" : C.light, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 850 }}
          >
            {actionLabel} <span aria-hidden="true">↗</span>
          </a>
          {e.source && <div style={{ marginTop: 6, textAlign: "center", fontSize: 9, color: C.muted, fontWeight: 600 }}>Availability from {e.source}</div>}
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
  // v6.34 — owner ask: the affiliate inventory gets its own category so
  // EVERYTHING bookable shows as the main list, not only the pinned rail.
  // bucket:null — tours are not events; the count/render special-case on key.
  { key: "tours", label: "Local tours", icon: "🎟️", bucket: null },
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
  const { events, eventCat, setEventCat, eventDate, setEventDate, locName, center, submitSearch, eventsLoading, eventsUnavailable, eventsError, loadEvents, openVenue, dedupeEvents, AreaInsight, Loader, eventsTours, eventBucket, ViatorRail, eventSegmentMeta } = ctx;
  const all = events || [];
  // ── WORTH PLANNING FOR (v8.29.16) ─────────────────────────────────────────
  //
  // The curated schedule (wf_events, joined to the feed in app/api/events)
  // is DATED MONTHS OUT — Halloween Horror Nights, both Gasparillas, the
  // Strawberry Festival. This screen is built around an eight-day strip and a
  // category dropdown, which is right for "what is on tonight" and is exactly
  // why eighteen hand-verified events could be sitting in the payload and still
  // be invisible: the reader would have to guess a category AND widen the date.
  //
  // So they get their own shelf, above the controls, outside both filters. It
  // is the one place on this screen where the answer is "here is the thing you
  // should put in your calendar", and every card opens OUR event page — the one
  // carrying the why-go, the parking and the insider tip a calendar cannot have.
  const plannable = all
    .filter((e) => e && e.curated && e.dest)
    .slice()
    .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")))
    .slice(0, 8);
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
  const isTours = activeFilter.key === "tours"; // v6.34 — affiliate list view
  const catBase = all.filter((e) => eventBucket(e) === activeFilter.bucket);
  const countFor = (dateVal) => dedupeEvents(catBase.filter((e) => e.date === dateVal), false).length;
  const allCount = dedupeEvents(catBase, true).length;
  let shown = catBase;
  if (eventDate !== "all") shown = shown.filter((e) => e.date === eventDate);
  shown = dedupeEvents(shown, eventDate === "all");
  // What's coming up, nearest-when first; proximity breaks ties.
  shown = shown.slice().sort((a, b) => (String(a.date || "9999").localeCompare(String(b.date || "9999"))) || (String(a.time || "99").localeCompare(String(b.time || "99"))) || (distMi(a) - distMi(b)));
  // Defensive at the render boundary: the source normally arrives ranked,
  // but this screen owns both the compact rail and the full Local tours grid.
  // Sorting here keeps both views honest even if a caller/API changes order.
  const tours = rankExperiences(eventsTours);
  const eventDateChips = [];
  const enow = new Date();
  // Keep the first decision compact. A four-week strip made the most useful
  // dates feel buried; eight days covers the immediate planning window while
  // "Any" still exposes the complete inventory.
  for (let i = 0; i < 8; i++) {
    const d = new Date(enow.getFullYear(), enow.getMonth(), enow.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    eventDateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
  }
  const dchip = (on) => ({ flexShrink: 0, minWidth: 46, padding: "6px 9px", borderRadius: 12, border: `1px solid ${on ? C.light : C.border}`, cursor: "pointer", textAlign: "center", background: on ? C.light : C.panel, color: on ? "#0D1117" : C.light, fontWeight: 700 });
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
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>Events near you</h1>
        {(() => { const _cm = Culture.resolveMetro(locName); return _cm ? <div style={{ marginTop: 10 }}><AreaInsight metro={_cm} cat={"events"} town={locName ? locName.split(",")[0] : null} center={center} onFind={(q) => submitSearch(q, { miles: 45 })} /></div> : null; })()}
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Bookable tours, concerts, comedy, theater, sports, and local happenings near you</div>
      </div>

      {plannable.length > 0 && (
        <section aria-label="Worth planning for" style={{ marginBottom: 18 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>Worth planning for</div>
            <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: C.muted }}>Dates we checked ourselves — the ones worth putting in the calendar now.</div>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
            {plannable.map((e) => {
              const d = ctx.formatEventDate(e.date, e.time);
              const when = [d.mo, d.day].filter(Boolean).join(" ");
              const facts = [ctx.cleanVenueName(e.venue) || e.city, e.price].filter(Boolean).join(" · ");
              return (
                <a
                  key={e.id}
                  href={e.dest}
                  onClick={() => { try { ctx.logEvent("event_open", null, { id: e.id, kind: "internal", src: "planahead_shelf" }); } catch (err) {} }}
                  style={{ flexShrink: 0, width: 232, borderRadius: 16, overflow: "hidden", background: C.card, border: `1px solid ${C.border}`, textDecoration: "none", display: "block" }}
                >
                  <EventArt e={e} seg={ctx.eventSegmentMeta(e.segment, e.genre, e.name)} height={104} ctx={ctx} />
                  <div style={{ padding: "9px 11px 11px" }}>
                    {when ? <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".7px", textTransform: "uppercase", color: C.accent }}>{when}</div> : null}
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, marginTop: 2, lineHeight: 1.25 }}>{e.name}</div>
                    {facts ? <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{facts}</div> : null}
                    {e.hook ? <div style={{ fontSize: 12, color: C.light, marginTop: 5, lineHeight: 1.4 }}>{e.hook}</div> : null}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* v6.26 — the events category filter, ABOVE the bookable-experiences
          rail (owner direction) and styled to match the app's SortControl
          ("≡ Top rated ▾"): outlined orange pill + sliders icon + chevron. */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <button onClick={() => setFilterOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={filterOpen} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 999, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
          <span>{activeFilter.label}</span>
          <span style={{ fontSize: 10, color: C.muted, transform: filterOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>{"▼"}</span>
        </button>
        {filterOpen && (
          <>
            <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div role="listbox" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 41, width: 292, background: "#161B22", border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 16px 44px rgba(0,0,0,.55)", padding: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: C.muted, textTransform: "uppercase", padding: "4px 8px 6px" }}>Category</div>
              {EVENT_FILTERS.map((f) => { const on = f.key === activeFilter.key; const n = f.key === "tours" ? tours.length : countForFilter(f); return (
                <button key={f.key} role="option" aria-selected={on} onClick={() => { setEventCat(f.key); setFilterOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 8px", borderRadius: 10, border: "none", background: on ? "rgba(249,115,22,.12)" : "transparent", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 17, height: 17, borderRadius: "50%", border: `2px solid ${on ? C.light : C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent }} /> : null}</span>
                  <span style={{ fontSize: 16 }}>{f.icon}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: on ? 800 : 600, color: on ? C.text : C.light }}>{f.label}</span>
                  {n > 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? C.light : C.muted }}>{n}</span>}
                </button>
              ); })}
            </div>
          </>
        )}
      </div>

      {/* Dates are a navigation decision, so they belong before inventory. */}
      {!isBusiness && !isTours && !eventsLoading && !eventsUnavailable && !eventsError && allCount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".8px", textTransform: "uppercase", color: C.muted }}>Choose a day</span>
            <span style={{ fontSize: 10.5, color: C.muted }}>{allCount} upcoming</span>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            <button aria-label="Show events on any date" onClick={() => setEventDate("all")} style={dchip(eventDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 14 }}>All</div><div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{allCount}</div></button>
            {eventDateChips.map((d) => { const count = countFor(d.value); return (
              <button key={d.value} aria-label={`Show events ${d.top} ${d.day}`} onClick={() => setEventDate(d.value)} style={dchip(eventDate === d.value)}>
                <div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div>
                <div style={{ fontSize: 14 }}>{d.day}</div>
                <div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{count > 0 ? count : ""}</div>
              </button>
            ); })}
          </div>
        </div>
      )}

      {/* v6.20 — the bookable-experiences (Viator) rail; pinned on every
          event-category view, after the controls so it never blocks browsing. */}
      {/* v6.34: when the Local-tours CATEGORY is selected, the main area below
          owns the full affiliate list — don't double-render the pinned rail. */}
      {!isTours && (eventsTours === null ? (
        <Loader label="Finding bookable experiences" pad="6px 2px" />
      ) : tours.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>Make more of the day</div>
            <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: C.muted }}>Highly rated tours and activities near {String(locName || "you").split(",")[0]} when the event is only one part of the plan.</div>
          </div>
          <ViatorRail title="Bookable experiences near you" items={tours} theme="events-tours" />
        </div>
      ) : null)}
      {isTours && (
        eventsTours === null ? <Loader label="Finding bookable experiences" pad="8px 2px" /> :
        tours.length > 0 ? (
          <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
            {/* v6.42 (owner): the Local-tours category owns the page — the FULL
                bookable list, every card a paid affiliate link. The old render
                repainted the same 3-card rail and zeroed the date chips, which
                read as "nothing appears" (reproduced live). */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>Everything bookable near you · {tours.length}</span>
              <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {tours.map((t, i) => (
                <ViatorCommerceLink
                  key={t.code || t.url}
                  t={t}
                  surface="events_tours_grid"
                  rank={i + 1}
                  style={{ display: "block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", textDecoration: "none", position: "relative" }}
                >
                  {/* v6.44: badge rides ONLY on Viator's own demand flag as passed
                      through by the API route (t.sellingFast) — never a computed guess. */}
                  {t.sellingFast ? <span style={{ position: "absolute", top: 6, left: 6, zIndex: 1, background: "#B33A2B", color: "#fff", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "3px 8px" }}>Selling fast</span> : null}
                  <TourArt src={t.image} />
                  <div style={{ padding: "9px 11px" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, lineHeight: 1.3, minHeight: 33, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
                      {t.rating > 0 && t.reviews > 0 ? <PlaceScoreChip p={{ rating: t.rating, reviews: t.reviews }} size={11} /> : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>New</span>}
                      {t.duration ? <span style={{ fontSize: 11, color: C.muted }}>{t.duration}</span> : null}
                    </div>
                    <div style={{ marginTop: 8, display: "inline-block", background: C.accent, color: "#0D1117", borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 800 }}>{t.fromPrice ? `Book from $${t.fromPrice}` : "Book now"} ↗</div>
                  </div>
                </ViatorCommerceLink>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Tours &amp; activities are affiliate links; Wayfind may earn a commission at no cost to you. It never changes what we recommend.</div>
          </div>
        ) : <div style={{ color: C.muted, fontSize: 13, padding: "8px 2px" }}>No bookable tours are loading right now — check back shortly.</div>
      )}

      {/* Event grid for the selected category (Business events flow through the
          same path — a distinct source, shown only when its feeds return real
          events; otherwise the honest empty state below). */}
      {!isTours && eventsLoading && <Loader label="Finding plans" pad="8px 2px" />}
      {!isTours && !eventsLoading && eventsUnavailable && !isBusiness && <div style={{ color: C.muted, fontSize: 13, padding: "8px 2px" }}>Local events aren&apos;t turned on for your area yet — but the bookable experiences above always work.</div>}
      {!eventsLoading && (eventsUnavailable ? isBusiness : true) && !eventsError && shown.length > 0 && (
        <section aria-label={`${activeFilter.label} events`} style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>{activeFilter.label} worth planning around</div>
              <div style={{ marginTop: 2, fontSize: 10.5, color: C.muted }}>Soonest first · tap a card for the full story</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 750, color: C.muted }}>{shown.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {shown.map((e) => <EventCard key={e.id} e={e} onVenue={() => openVenue(e)} ctx={ctx} />)}
          </div>
        </section>
      )}
      {!isTours && !eventsLoading && !eventsError && shown.length === 0 && (
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
                  <span style={{ fontSize: 13 }}>Try another category or choose Local tours for bookable plans nearby.</span>
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
