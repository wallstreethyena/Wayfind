"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). EventArt and
// EventCard move too (this screen is their only consumer); the event helpers
// they use stay in home.js — other surfaces share them — and arrive via ctx.
import { useEffect, useRef, useState } from "react";
import { C } from "../kit";
import { resolveMetro } from "../../../lib/culture";
import { eventPlaceholder } from "../../../lib/eventPlaceholder.js";
import { eventPriceFact } from "../../../lib/eventPriceFact.js";
import { fallSkinLive } from "../../../lib/fallSkin.js";
import { isSpookyCard, sayHalloween, withSpookyChip } from "../../../lib/spookySkin.js";
import { rankIntentEvents } from "../../../lib/eventPopularity.js";
import { useDeviceLocation } from "../PlaceDistance.js";
import { distanceMiles } from "../../../lib/deviceDistance.js";
import { spookySkinLive } from "../../../lib/spookySkin.js";
import { siteTodayStr } from "../../../lib/siteTime";
import { rankExperiences } from "../../../lib/experiencesData";
import { partnerTicketLabel } from "../../../lib/partnerCopy";
import RailCard, { RailDots, RailNav } from "../RailCard";
// Events pipeline integrity, Phase 2 (EVENTS_PIPELINE_DIAGNOSIS.md): the
// title, image, and body are ONE semantic link to the event's resolved
// primary destination (e.dest, computed server-side -- internal detail
// page preferred, validated external URL otherwise). The venue lookup and
// the external tickets link are separate controls OUTSIDE that link; no
// interactive element nests inside another. An event without a resolved
// destination never renders (the API already excludes it; the guard here
// is belt-and-braces for stale client state).
function EventCard({ e, onVenue, ctx }) {
  const { formatEventDate, eventCategory, recurrenceLabel, cleanVenueName, ticketUrl, logEvent, openExternal } = ctx;
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
  const actionLabel = e.ticketVia ? partnerTicketLabel(e.ticketVia, { product: e.ticketProduct, arrow: false, card: true }) : e.ticketed ? "Get tickets" : (internal ? "Explore event" : "Official details");
  // Fall events (flagged server-side by app/api/events) never wear generic
  // stock category art: their photo is the event's own or its venue's owned
  // photo. They also get the fall card skin and no "Official details" /
  // "Plan your visit" second button; affiliate/ticket CTAs stay.
  const fall = !!e.isFall;
  const fallSkin = fall && fallSkinLive(siteTodayStr());
  const spookyCard = { id: e.id, name: e.name, category: e.category, subcategory: e.subcategory, tags: e.tags };
  const spooky = fallSkin && isSpookyCard(spookyCard, siteTodayStr());
  const venueChips = venue && onVenue ? [{ key: "venue", icon: "📍", label: venue, onClick: onVenue }] : [];
  // No stock photography stands in for an event (owner, 2026-10-08): an event
  // shows its own image (organizer photo, or a labelled venue photo) or a
  // designed category tile from lib/eventPlaceholder.js.
  const image = ctx.eventUseImage(e) || fall ? (e.thumb || e.image || "") : "";
  const placeholder = eventPlaceholder(ctx.eventBucket(e), e, siteTodayStr());
  const hasCta = !fall || !!e.ticketVia || !!e.ticketed;
  return <RailCard
    photo={image}
    photoAttr={e.photoAttr}
    photoAttrHref={e.photoAttrHref}
    visitFacts={e.visitFacts || null}
    planningHref={internal && !fall ? e.dest : null}
    className={fallSkin ? "wf-fall-card" : undefined}
    spooky={spooky}
    placeholder={placeholder}
    title={e.name}
    eyebrow={spooky && sayHalloween(spookyCard) ? "Halloween event" : seg.short}
    when={{ label: (rec || f.wd || f.mo || "Event").toUpperCase(), value: f.time || `${f.mo} ${f.day}`, tone: "later" }}
    facts={[venue || null, eventPriceFact(e), e.source ? `via ${e.source}` : null].filter(Boolean)}
    chips={spooky ? withSpookyChip(venueChips) : venueChips}
    href={href}
    external={!internal}
    actionItem={{ id: e.id, type: "event", title: e.name, image, url: href, provider: e.source || null }}
    cta={hasCta ? { label: `${actionLabel} ↗`, href: actionHref, external: actionExternal, sponsored: !!e.ticketVia, onClick: () => { try { logEvent(e.ticketed ? "ticket" : "event_open", null, { id: e.id, kind: e.destKind, src: "events_grid_cta" }); } catch {} } } : undefined}
    ariaLabel={`Open ${e.name}`}
    onOpen={() => {
      try { logEvent("event_open", null, { id: e.id, kind: e.destKind, src: "events_grid" }); } catch {}
      if (typeof window !== "undefined") internal ? window.location.assign(href) : openExternal(href);
    }}
  />;
}

// Categories are always-visible rails. The only dropdown decision is ordering.
const EVENT_FILTERS = [
  { key: "christmas", label: "Christmas and holiday events", match: (e) => e.christmas === true },
  { key: "concerts", label: "Concerts", bucket: "concerts" },
  { key: "comedy", label: "Comedy", bucket: "comedy" },
  { key: "theater", label: "Theater", bucket: "theater" },
  { key: "sports", label: "Sports", bucket: "sports" },
  { key: "local", label: "Local events", bucket: "community" },
  { key: "business", label: "Business events", bucket: "business" },
];
const FALL_FILTER = { key: "fall", label: "Fall events", match: (e) => e.fallTheme === true };
export function eventFiltersFor(seasonLive) { return seasonLive ? [FALL_FILTER, ...EVENT_FILTERS] : EVENT_FILTERS; }
export function filterMatches(f, e, eventBucket) { return f.match ? f.match(e) : eventBucket(e) === f.bucket; }
export function halloweenChipFor(chips, todayStr, seasonLive) {
  if (!seasonLive || typeof todayStr !== "string" || todayStr.length !== 10) return null;
  const value = todayStr.slice(0, 4) + "-10-31";
  if (todayStr > value || (chips || []).some((c) => c.value === value)) return null;
  return { value, top: "Halloween", day: 31, label: "Halloween, Oct 31" };
}

// RUNNING EVENTS AND THE DAY STRIP (2026-10-08). A season-long event that
// opened before today is still on: it belongs under Today and every later day
// of its run, but only when it is open every day. A select-nights run (haunts,
// ghost tours) is never claimed for a specific day it may be dark; it stays
// under All with its own schedule on the card.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// A run with a verified day list (Armature Fall Fest: Oct 10, 11, 24, 25)
// belongs under exactly those days: never the days between its weekends.
function occurrenceList(e) {
  return e && Array.isArray(e.occurrences) && e.occurrences.length ? e.occurrences : null;
}
export function eventLastDay(e) {
  const occ = occurrenceList(e);
  if (occ) return occ[occ.length - 1];
  const start = String((e && e.date) || "");
  const end = String((e && e.endDate) || "");
  return ISO_DAY.test(end) && end > start ? end : start;
}
// A curated row carries its note's day rule (lib/scheduleNoteDays.js compactDayRule, read
// on the server): weekdays it runs, dates it is closed, or "restricted" when the note says
// it is not open every day without naming the days. Inlined here so the client never ships
// the note parser. Keep in step with compactRuleAllows in that module.
function dayRuleAllows(e, day) {
  const r = e && e.dayRule;
  if (!r) return true;
  if (r.k === "l") return Array.isArray(r.days) && r.days.includes(day);
  if (Array.isArray(r.x) && r.x.includes(day)) return false;
  if (r.k === "r") return day === e.date;
  if (r.k === "w") {
    const [y, m, d] = day.split("-").map(Number);
    return Array.isArray(r.d) && r.d.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
  }
  return true;
}
export function eventRunsOn(e, day) {
  if (!e || !day) return false;
  const occ = occurrenceList(e);
  if (occ) return occ.includes(day);
  if (e.dayRule) return !!e.date && e.date <= day && eventLastDay(e) >= day && dayRuleAllows(e, day);
  if (e.date === day) return true;
  if (e.selectNights) return false;
  return !!e.date && e.date < day && eventLastDay(e) >= day;
}
// The day an event belongs to in "soonest first": its start, or today while a
// run that began earlier is still going.
export function effectiveEventDate(e, today) {
  if (!e || !e.date) return "9999-12-31";
  const occ = occurrenceList(e);
  if (occ) return occ.find((d) => d >= today) || occ[occ.length - 1];
  if (e.date < today && eventLastDay(e) >= today) {
    if (!e.dayRule) return today;
    // A running event with a day rule sorts to its next real day (two weeks ahead at most).
    const [y, m, d] = today.split("-").map(Number);
    for (let i = 0; i < 14; i++) {
      const t = new Date(Date.UTC(y, m - 1, d + i));
      const day = t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
      if (day > eventLastDay(e)) break;
      if (dayRuleAllows(e, day)) return day;
    }
    return eventLastDay(e);
  }
  return e.date;
}
// One ordering for every event list on this screen: soonest day first; within
// a day, events inside the feed's own radius before the wider curated reach,
// one-off dates before runs that are merely still open, then start time, then
// distance. Nothing is dropped here; this only orders.
export const EVENTS_NEAR_MI = 25;
export function sortEventsForList(list, { today, distMi = () => Infinity, nearMi = EVENTS_NEAR_MI } = {}) {
  const key = (e) => {
    const d = distMi(e);
    return [effectiveEventDate(e, today), Number.isFinite(d) && d <= nearMi ? 0 : 1, e.date < today ? 1 : 0, String(e.time || "99"), Number.isFinite(d) ? d : 1e9];
  };
  return (list || []).map((e) => [key(e), e]).sort((a, b) => {
    for (let i = 0; i < a[0].length; i++) {
      if (a[0][i] < b[0][i]) return -1;
      if (a[0][i] > b[0][i]) return 1;
    }
    return 0;
  }).map((x) => x[1]);
}

// RENDER THE LIST IN PAGES (2026-10-08). With the whole fall season in the
// feed, the Fall and Halloween rail held ~180 cards, every one mounted at once
// (each with its own live clock): measured on a 4x throttled 390px phone, the
// first event card took 10.5 to 11.8 s and the main thread spent ~6.5 s in long
// tasks. The rail now mounts EVENTS_PAGE cards and adds the next page when its
// "More" tile scrolls into view (or is tapped). Nothing is filtered out: the
// counts, the day strip and the order all come from the full list, and every
// event is one swipe further along.
export const EVENTS_PAGE = 24;
export function pageOfEvents(list, visible) {
  const all = Array.isArray(list) ? list : [];
  const n = Math.max(EVENTS_PAGE, Math.min(all.length, Number(visible) || EVENTS_PAGE));
  return { items: all.slice(0, n), remaining: Math.max(0, all.length - n), total: all.length };
}
function RailMore({ remaining, onMore }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) onMore(); }, { rootMargin: "0px 400px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onMore]);
  return (
    <button ref={ref} type="button" onClick={onMore} className="wf-events-more" aria-label={`Show ${Math.min(remaining, EVENTS_PAGE)} more events`} style={{ flex: "0 0 auto", alignSelf: "stretch", minWidth: 120, borderRadius: 18, border: `1px dashed ${C.border}`, background: "transparent", color: C.light, fontSize: 13, fontWeight: 800, cursor: "pointer", padding: "0 16px" }}>
      {`+${remaining} more`}
    </button>
  );
}

// Apply the chosen order before paging. Both modes preserve every row.
export function orderEventRail(rows, { sort = "best", today, distMi = () => Infinity, eventBucket } = {}) {
  if (sort !== "distance") return rankIntentEvents(rows, eventBucket);
  const chronological = sortEventsForList(rows, { today, distMi });
  return chronological.sort((a, b) => {
    const da = distMi(a), db = distMi(b);
    return (Number.isFinite(da) ? da : Infinity) - (Number.isFinite(db) ? db : Infinity) || 0;
  });
}
export function expandedEventRails(rows, { today, eventDate = "all", eventBucket, dedupeEvents, sort = "best", distMi } = {}) {
  const all = (rows || []).filter((e) => e && e.dest);
  const dated = eventDate === "all" ? all : all.filter((e) => eventRunsOn(e, eventDate));
  const remaining = new Set(dated);
  const defs = eventFiltersFor(fallSkinLive(today));
  // Seasonal rails lead, but do not duplicate those events in Local events.
  defs.sort((a, b) => (a.key === "christmas" ? -1 : b.key === "christmas" ? 1 : 0));
  return defs.map((f) => {
    const matching = dated.filter((e) => remaining.has(e) && filterMatches(f, e, eventBucket));
    matching.forEach((e) => remaining.delete(e));
    return { ...f, items: orderEventRail(dedupeEvents(matching, eventDate === "all"), { sort, today, distMi, eventBucket }) };
  }).filter((rail) => rail.items.length > 0);
}
function EventRail({ id, title, description, items, ctx }) {
  const [visible, setVisible] = useState(EVENTS_PAGE);
  const page = pageOfEvents(items, visible);
  const showMore = () => setVisible((n) => n + EVENTS_PAGE);
  return <section aria-label={title} style={{ marginBottom: 22 }}>
    <div style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>{title}</h2>
      {description ? <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.45, color: C.muted }}>{description}</div> : null}
    </div>
    <RailNav railId={id} count={items.length} total={items.length} loaded={page.items.length} unit="events" />
    <div className="wf-rail" data-rail={id} role="region" tabIndex={0} aria-label={title}>
      {page.items.map((e) => <EventCard key={e.id} e={e} onVenue={() => ctx.openVenue(e)} ctx={ctx} />)}
      {page.remaining > 0 ? <RailMore remaining={page.remaining} onMore={showMore} /> : null}
    </div>
    <RailDots railId={id} count={page.items.length} />
  </section>;
}
export default function EventsScreen({ ctx }) {
  const { events, eventDate, setEventDate, locName, center, submitSearch, eventsLoading, eventsUnavailable, eventsError, loadEvents, dedupeEvents, AreaInsight, Loader, eventsTours, eventBucket, ViatorRail } = ctx;
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState("best");
  const device = useDeviceLocation();
  const origin = device || center;
  const distMi = (e) => distanceMiles(origin, e) ?? Infinity;
  const todayStr = siteTodayStr();
  const all = (events || []).filter((e) => e && e.dest);
  const rails = expandedEventRails(all, { today: todayStr, eventDate, eventBucket, dedupeEvents, sort, distMi });
  const curated = all.filter((e) => e.curated && e.dest && (eventDate === "all" || eventRunsOn(e, eventDate)));
  const plannable = orderEventRail(dedupeEvents(curated, eventDate === "all"), { sort, today: todayStr, distMi, eventBucket });
  const countFor = (dateVal) => dedupeEvents(all.filter((e) => eventRunsOn(e, dateVal)), false).length;
  const allCount = dedupeEvents(all, true).length;
  const tours = rankExperiences(eventsTours);
  const orderedTours = sort === "distance" ? [...tours].sort((a, b) => distMi(a) - distMi(b) || 0) : tours;
  const eventDateChips = [];
  const [year, month, day] = todayStr.split("-").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(year, month - 1, day + i));
    eventDateChips.push({ value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()], day: d.getUTCDate() });
  }
  const seasonLive = spookySkinLive(todayStr);
  const halloweenChip = halloweenChipFor(eventDateChips, siteTodayStr(), seasonLive);
  if (halloweenChip) eventDateChips.push(halloweenChip);
  const dchip = (on) => ({ flexShrink: 0, minWidth: 46, padding: "6px 9px", borderRadius: 12, border: `1px solid ${on ? C.light : C.border}`, cursor: "pointer", textAlign: "center", background: on ? C.light : C.panel, color: on ? "#0D1117" : C.light, fontWeight: 700 });
  const orderDescription = sort === "distance" ? (device ? "Closest to your current location first" : "Closest to your selected area first") : "Ranked by verified demand and event quality";
  return <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
    <div style={{ paddingTop: 4, marginBottom: 12 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>Events near you</h1>
      {(() => { const metro = resolveMetro(locName); return metro ? <div style={{ marginTop: 10 }}><AreaInsight metro={metro} cat="events" town={locName ? locName.split(",")[0] : null} center={center} onFind={(q) => submitSearch(q, { miles: 45 })} /></div> : null; })()}
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Holiday plans, concerts, comedy, theater, sports and local discoveries. Every category, ready to browse.</div>
    </div>
    <div style={{ position: "relative", marginBottom: 14 }}>
      <button type="button" aria-label="Sort events" onClick={() => setFilterOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={filterOpen} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 999, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
        {sort === "best" ? "Best" : "Distance"}<span style={{ fontSize: 10, color: C.muted }}>{filterOpen ? "▲" : "▼"}</span>
      </button>
      {filterOpen && <>
        <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div role="listbox" aria-label="Event order" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 41, width: 220, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 8 }}>
          {[{ key: "best", label: "Best" }, { key: "distance", label: "Distance" }].map((option) => <button type="button" key={option.key} role="option" aria-selected={sort === option.key} onClick={() => { setSort(option.key); setFilterOpen(false); }} style={{ display: "block", width: "100%", padding: "12px", borderRadius: 10, border: 0, background: sort === option.key ? "rgba(249,115,22,.12)" : "transparent", color: C.text, textAlign: "left", fontWeight: 700, cursor: "pointer" }}>{option.label}</button>)}
        </div>
      </>}
    </div>
    {allCount > 0 && <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7, fontSize: 11, color: C.muted }}><span>Choose a day</span><span>{allCount} upcoming</span></div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
        <button type="button" aria-label="Show events on any date" onClick={() => setEventDate("all")} style={dchip(eventDate === "all")}><div>Any</div><div>All</div><div style={{ fontSize: 10 }}>{allCount}</div></button>
        {eventDateChips.map((d) => <button type="button" key={d.value} aria-label={`Show events ${d.top} ${d.day}`} onClick={() => setEventDate(d.value)} style={dchip(eventDate === d.value)}><div style={{ fontSize: 10 }}>{d.top}</div><div>{d.day}</div><div style={{ fontSize: 10 }}>{countFor(d.value) || " "}</div></button>)}
      </div>
    </div>}
    {eventsLoading && <Loader label="Finding plans" pad="8px 2px" />}
    {plannable.length > 0 && <EventRail key={`planning|${sort}|${eventDate}`} id="events-worth-planning" title="Worth planning for" description={`${orderDescription}. Verified dates worth putting in your calendar.`} items={plannable} ctx={ctx} />}
    {rails.map((rail) => <EventRail key={`${rail.key}|${sort}|${eventDate}`} id={`events-${rail.key}`} title={rail.label} description={`${orderDescription}. Includes dated events up to 60 mi away.`} items={rail.items} ctx={ctx} />)}
    {!eventsLoading && eventsError && <div role="status" style={{ padding: "20px 2px", color: C.muted }}>Some events couldn&apos;t load. <button type="button" onClick={loadEvents}>Refresh events</button></div>}
    {!eventsLoading && !eventsError && rails.length === 0 && <div style={{ padding: "24px 2px", color: C.muted }}>{eventDate !== "all" ? "No events on this day. Choose Any to browse upcoming plans." : eventsUnavailable ? "Local events are unavailable right now. Try refreshing events." : "No upcoming events in this area yet."}</div>}
    {eventsTours === null ? <Loader label="Finding bookable experiences" pad="6px 2px" /> : orderedTours.length > 0 ? <section aria-label="Local tours" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, color: C.text }}>Local tours</h2>
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>Everything bookable near you · {tours.length}. Available dates shown when booking.</div>
      <ViatorRail title="Bookable experiences near you" items={orderedTours} theme="events-tours" preserveOrder={sort === "distance"} />
    </section> : null}
  </div>;
}
