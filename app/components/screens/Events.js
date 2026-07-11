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

export default function EventsScreen({ ctx }) {
  const { events, eventCat, setEventCat, eventDate, setEventDate, locName, center, submitSearch, eventsLoading, eventsUnavailable, eventsError, loadEvents, openVenue, eventSegmentMeta, dedupeEvents, AreaInsight, Loader } = ctx;
          const all = events || [];
          const segs = [];
          all.forEach((e) => { const m = eventSegmentMeta(e.segment, e.genre); if ((e.segment || e.genre) && !segs.find((s) => s.short === m.short)) segs.push(m); });
          // Phase 2 count integrity (EVENTS_PIPELINE_DIAGNOSIS.md): every
          // number a chip shows is computed on the SAME collapsed list the
          // grid renders for that selection -- the old code counted the
          // pre-collapse list, so the chip number never had to match the
          // cards. catBase applies the active category filter first so the
          // date counts stay honest while a category is selected too.
          const catBase = eventCat === "all" ? all : all.filter((e) => eventSegmentMeta(e.segment, e.genre).short === eventCat);
          const countFor = (dateVal) => dedupeEvents(catBase.filter((e) => e.date === dateVal), false).length;
          const allCount = dedupeEvents(catBase, true).length;
          let shown = catBase;
          if (eventDate !== "all") shown = shown.filter((e) => e.date === eventDate);
          shown = dedupeEvents(shown, eventDate === "all");
          const eventDateChips = [];
          const enow = new Date();
          for (let i = 0; i < 28; i++) {
            const d = new Date(enow.getFullYear(), enow.getMonth(), enow.getDate() + i);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            eventDateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
          }
          // Selected chip text is dark-on-orange (#0D1117 on C.accent), the same
          // pairing the app's primary CTAs use — white-on-orange fails WCAG AA
          // (2.8:1) and axe rightly flags it now that events render in CI.
          const dchip = (on) => ({ flexShrink: 0, minWidth: 46, padding: "6px 9px", borderRadius: 12, border: `1px solid ${on ? C.accent : C.border}`, cursor: "pointer", textAlign: "center", background: on ? C.accent : C.panel, color: on ? "#0D1117" : C.light, fontWeight: 700 });
          return (
            <div>
              <div style={{ paddingTop: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Events near you</div>
                {(() => { const _cm = Culture.resolveMetro(locName); return _cm ? <div style={{ marginTop: 10 }}><AreaInsight metro={_cm} cat={"events"} town={locName ? locName.split(",")[0] : null} center={center} onFind={(q) => submitSearch(q, { miles: 45 })} /></div> : null; })()}
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Concerts, sports, and shows worth building a night around</div>
              </div>
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {(eventCat !== "all" || eventDate !== "all") && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                      <button onClick={() => { setEventCat("all"); setEventDate("all"); }} style={{ fontSize: 11, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>Show all ✕</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                    <button onClick={() => setEventDate("all")} style={dchip(eventDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 14 }}>All</div><div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{allCount}</div></button>
                    {eventDateChips.map((d) => {
                      const count = countFor(d.value);
                      return (
                        <button key={d.value} onClick={() => setEventDate(d.value)} style={dchip(eventDate === d.value)}>
                          <div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div>
                          <div style={{ fontSize: 14 }}>{d.day}</div>
                          <div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{count > 0 ? count : ""}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && segs.length > 1 && (
                <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
                  <button onClick={() => setEventCat("all")} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: eventCat === "all" ? C.adim : C.panel, color: eventCat === "all" ? C.accent : C.light, border: `1px solid ${eventCat === "all" ? C.accent : C.border}` }}>All</button>
                  {segs.map((m) => (
                    <button key={m.short} onClick={() => setEventCat(m.short)} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: eventCat === m.short ? C.adim : C.panel, color: eventCat === m.short ? C.accent : C.light, border: `1px solid ${eventCat === m.short ? C.accent : C.border}` }}>{m.icon} {m.short}</button>
                  ))}
                </div>
              )}
              {eventsLoading && <Loader label="Finding plans" pad="8px 2px" />}
              {!eventsLoading && eventsUnavailable && <div style={{ color: C.muted, fontSize: 13, padding: "8px 2px" }}>Events are not turned on yet. Add a Ticketmaster key in Vercel to switch them on.</div>}
              {!eventsLoading && !eventsUnavailable && eventsError && (
                <div style={{ textAlign: "center", padding: "40px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No events to show right now</strong>
                  <span style={{ fontSize: 13 }}>Check back in a little while.</span>
                  <div onClick={loadEvents} style={{ marginTop: 12, color: C.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Refresh ↻</div>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No events in your area yet</strong>
                  <span style={{ fontSize: 13 }}>We're still expanding Wayfind events to your area. Check back soon.</span>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length > 0 && shown.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 24px", color: C.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing on this day</strong>
                  <span style={{ fontSize: 13 }}>Try another date or tap All.</span>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && shown.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
                  {shown.map((e) => <EventCard key={e.id} e={e} onVenue={() => openVenue(e)} ctx={ctx} />)}
                </div>
              )}
            </div>
          );
}
