"use client";
import { useEffect, useRef, useState } from "react";
import { C } from "../kit";
import RailCard from "../RailCard.js";
import RailHeading from "../RailHeading.js";
import ViatorCommerceLink, { viatorExactProductHref } from "../ViatorCommerceLink.js";
import { WF_PLACE_CARD_CSS } from "../css.js";
import { styleHtml } from "../../../lib/styleHtml.js";
import { AFFILIATE_DISCLOSURE_TEXT } from "../../../lib/affiliateDisclosure.js";
import { commerceHref } from "../../../lib/commerce.js";
import { experienceWayfindScore } from "../../../lib/experiencesData.js";
import { toDisplayScore } from "../../../lib/score.js";
import { eventPlaceholder } from "../../../lib/eventPlaceholder.js";
import { eventPriceFact } from "../../../lib/eventPriceFact.js";
import { useSiteToday } from "../../../lib/siteDayClock.js";
import { thanksgivingWindow, thanksgivingYearForDate } from "../../../lib/thanksgivingDates.js";
import { createThanksgivingRequestManager, openThanksgivingMap, thanksgivingLocationKey, thanksgivingLocationReady, thanksgivingExperienceExpiry, thanksgivingOpenOptions,
  thanksgivingSharePath, thanksgivingVisibleGroups, thanksgivingVisibleMapPlaces } from "../../../lib/thanksgivingClient.js";

const categories = [["all", "All picks"], ["experiences", "Viator experiences"], ["events", "Holiday events"], ["places", "Easy local outings"]];
const distances = [[25, "Nearby · 25 mi"], [60, "Wider area · 60 mi"], [120, "Day trips · 120 mi"]];
const button = { border: `1px solid ${C.border}`, borderRadius: 999, background: C.card, color: C.light, padding: "9px 14px", fontSize: 13, fontWeight: 750, cursor: "pointer" };
const filterButton = { ...button, padding: "8px 11px", fontSize: 12, whiteSpace: "nowrap" };
const row = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
const dateLabel = (day, options) => new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...options });

export function HolidayEventCard({ event, today }) {
  const href = event.eventHref || event.dest;
  if (!href) return null;
  const start = event.planningDays?.[0] || event.startDate || event.date || event.start;
  const label = typeof start === "string" && /^\d{4}-\d{2}-\d{2}/.test(start) ? dateLabel(start.slice(0, 10), { month: "short", day: "numeric" }) : "See dates";
  const ticket = event.visitFacts?.ticket?.href || event.ticketHref;
  return <RailCard title={event.name || event.title} photo={event.image || event.thumb || ""}
    photoAttr={event.photoAttr} photoAttrHref={event.photoAttrHref}
    placeholder={eventPlaceholder(event.category || "community", event, today)}
    eyebrow="Thanksgiving weekend event" when={{ label: "EVENT", value: label, tone: "later" }}
    visitFacts={event.visitFacts || null} facts={[event.venueName || event.venue, event.city || event.locationLabel, event.priceLabel || eventPriceFact(event)].filter((x) => typeof x === "string" && x)}
    take={event.hook || event.reason || event.scheduleNote || event.description || null} href={href} external={!href.startsWith("/")}
    actionItem={{ id: event.id, type: "event", title: event.name || event.title, image: event.image, url: href, provider: event.source || null }}
    cta={{ label: ticket ? event.ticketLabel || "Check tickets ↗" : "Event details →", href: ticket || href, external: !(ticket || href).startsWith("/"), sponsored: !!event.ticketVia }} />;
}

function HolidayExperienceCard({ experience, rank, contentId, page }) {
  const code = experience.code || experience.productCode || experience.product_code;
  const href = experience.productUrl
    ? viatorExactProductHref({ productUrl: experience.productUrl, offerId: code, city: experience.city, kind: "tours", surface: "thanksgiving_picks", contentId, page })
    : commerceHref({ provider: "viator", offerId: code, surface: "thanksgiving_picks", contentId });
  if (!href) return null;
  return <RailCard title={experience.title} photo={experience.image || ""} eyebrow="Viator experience" rank={rank}
    score={toDisplayScore(experienceWayfindScore(experience))}
    facts={[experience.locationLabel || experience.city, experience.duration, experience.fromPrice ? `from $${experience.fromPrice}` : null,
      experience.reviews > 0 ? `${Number(experience.reviews).toLocaleString()} reviews` : null].filter(Boolean)}
    take={experience.availabilityNote || "Check available dates and the operator’s meeting point."}
    href={href} external actionItem={{ id: code, type: "experience", title: experience.title, image: experience.image, url: href, provider: "viator" }}
    ctaNode={<ViatorCommerceLink t={experience} exactProductUrl={experience.productUrl} city={experience.city} kind="tours" surface="thanksgiving_picks" contentId={contentId} page={page} rank={rank}
      className="wf-place-card-book wf-rail-card-cta">Check availability ↗</ViatorCommerceLink>} />;
}

export default function ThanksgivingDetail({ ctx }) {
  const today = useSiteToday();
  const detail = ctx.hookDetail || {};
  const initial = useRef(null);
  if (!initial.current) initial.current = thanksgivingOpenOptions(new URLSearchParams({ holidayYear: String(detail.holidayYear || thanksgivingYearForDate(today)),
    holidayDate: detail.holidayDate || "all", holidayMi: String(detail.holidayMi || 60) }), thanksgivingYearForDate(today));
  const [year, setYear] = useState(initial.current.year);
  const [date, setDate] = useState(initial.current.date);
  const [mi, setMi] = useState(initial.current.mi);
  const [category, setCategory] = useState("all");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ key: "", status: "waiting", data: null });
  const manager = useRef(null);
  if (!manager.current) manager.current = createThanksgivingRequestManager();
  const closeRef = useRef(ctx.setHookDetail);
  closeRef.current = ctx.setHookDetail;
  const backRef = useRef(null);
  const window = thanksgivingWindow(year);
  const locationKey = thanksgivingLocationReady(ctx) ? thanksgivingLocationKey(ctx.center) : "";
  const requestKey = locationKey ? [locationKey, year, date, mi, retry].join("|") : "";
  // The render gate matters as much as abort: changing city hides the old
  // city's cards immediately, before React runs the next request effect.
  const candidate = result.key === requestKey && result.status === "ready" ? result.data : null;
  const expiresAt = thanksgivingExperienceExpiry(candidate);
  const expired = !!expiresAt && Date.now() >= expiresAt;
  const data = expired ? null : candidate;
  const loading = !!requestKey && (!data && (result.key !== requestKey || result.status === "loading" || expired));
  const failed = !!requestKey && result.key === requestKey && result.status === "error";
  const groups = thanksgivingVisibleGroups(data, category);
  const visibleCount = groups.experiences.length + groups.events.length + groups.places.length;
  const mapPlaces = thanksgivingVisibleMapPlaces(data, category);
  const currentYear = thanksgivingYearForDate(today);
  const years = [...new Set([year, currentYear, currentYear + 1])].sort((a, b) => a - b);
  const location = locationKey ? (ctx.locName || "your selected location") : "you";
  const contentId = `thanksgiving-${year}-${date}-${mi}`;
  const unavailableSources = data && Object.values(data.sourceStatus || {}).some((source) => source?.status === "unavailable" || source?.failures?.length > 0);
  const searchedMarkets = (data?.sourceStatus?.experiences?.markets || []).filter((market) => typeof market === "string");
  const warnings = (data?.warnings || []).filter((warning) => typeof warning === "string" && warning);
  const dateWarnings = warnings.filter((warning) => /dates have passed|choose an upcoming/i.test(warning));

  useEffect(() => {
    if (!locationKey) { manager.current.cancel(); setResult({ key: "", status: "waiting", data: null }); return; }
    let active = true;
    setResult({ key: requestKey, status: "loading", data: null });
    manager.current.load({ origin: { lat: ctx.center.lat, lng: ctx.center.lng }, year, date, mi }).then((next) => {
      if (active && next.status !== "superseded") setResult({ key: requestKey, status: next.status, data: next.data || null });
    });
    return () => { active = false; manager.current.cancel(); };
  }, [requestKey]);

  useEffect(() => {
    const previous = document.activeElement;
    backRef.current?.focus();
    const escape = (event) => { if (event.key === "Escape") { manager.current.cancel(); closeRef.current(null); } };
    document.addEventListener("keydown", escape);
    return () => { manager.current.cancel(); document.removeEventListener("keydown", escape); previous?.focus?.(); };
  }, []);

  useEffect(() => {
    if (data && category === "places" && !data.places.length) setCategory("all");
  }, [data, category]);

  useEffect(() => {
    if (!candidate || !expiresAt) return;
    let refreshed = false;
    const refreshExpired = () => {
      if (!refreshed && Date.now() >= expiresAt) {
        refreshed = true;
        manager.current.cancel();
        setRetry((value) => value + 1);
      }
    };
    const timer = setTimeout(refreshExpired, Math.max(0, expiresAt - Date.now() + 5));
    const wake = () => { if (document.visibilityState !== "hidden") refreshExpired(); };
    document.addEventListener("visibilitychange", wake);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, [candidate, expiresAt]);

  const close = () => { manager.current.cancel(); ctx.setHookDetail(null); };
  const chooseLocation = () => {
    manager.current.cancel();
    if (ctx.chooseThanksgivingLocation) ctx.chooseThanksgivingLocation({ year, date, mi });
    else { close(); ctx.setScopeOpen?.(true); }
  };
  const share = () => {
    const path = thanksgivingSharePath({ year, date, mi });
    const title = `Thanksgiving weekend ${year} with Wayfind`;
    ctx.shareLink?.(title, new URL(path, globalThis.window.location.origin).href, () => ctx.showToast?.("Link copied"), "Find Thanksgiving picks near you.");
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="thanksgiving-title" data-thanksgiving-detail
    style={{ position: "fixed", inset: 0, zIndex: 950, background: C.bg, color: C.text, overflowY: "auto", overscrollBehavior: "contain" }}>
    <style dangerouslySetInnerHTML={styleHtml(WF_PLACE_CARD_CSS)} />
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "max(16px, calc(env(safe-area-inset-top) + 12px)) 16px 14px", boxSizing: "border-box", background: `linear-gradient(155deg, ${C.accent}22, ${C.bg} 70%)` }}>
      <div style={{ ...row, justifyContent: "space-between", marginBottom: 12 }}>
        <button ref={backRef} style={{ ...button, color: C.accent }} onClick={close}>‹ Back</button>
        <button style={button} onClick={share} aria-label="Share Thanksgiving picks">Share ↗</button>
      </div>
      <div style={{ color: C.accent, fontSize: 10, letterSpacing: "1.4px", fontWeight: 900, textTransform: "uppercase", marginBottom: 6 }}>🦃 Thanksgiving picks</div>
      <h1 id="thanksgiving-title" style={{ fontSize: ctx.isDesktop ? 30 : 24, lineHeight: 1.15, margin: "0 0 6px", letterSpacing: "-.4px" }}>Thanksgiving near {location}</h1>
      <p style={{ color: C.light, fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>{window.label}</p>
      <div style={{ ...row, marginBottom: 10 }}>
        <label style={{ ...row, color: C.muted, fontSize: 12 }}>Year <select aria-label="Thanksgiving year" value={year} onChange={(event) => { setYear(Number(event.target.value)); setDate("all"); }} style={button}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <button onClick={chooseLocation} style={button}>📍 {locationKey ? "Change location" : "Choose location"}</button>
      </div>
      <div role="group" aria-label="Thanksgiving dates" style={{ ...row, flexWrap: "nowrap", gap: 5, overflowX: "auto", overscrollBehaviorX: "contain", marginBottom: 10 }}>{[["all", "All weekend"], ...window.days.map((day) => [day, dateLabel(day, { weekday: "short", month: "short", day: "numeric" })])].map(([value, label]) => <button key={value} aria-label={label} aria-pressed={date === value} onClick={() => setDate(value)} style={{ ...filterButton, padding: "8px 9px", color: date === value ? C.accent : C.light, borderColor: date === value ? C.accent : C.border }}>{value === "all" ? label : dateLabel(value, { weekday: "short", day: "numeric" })}</button>)}</div>
      <div role="group" aria-label="Distance" style={{ ...row, gap: 6, marginBottom: 10 }}>{distances.map(([value, label]) => <button key={value} aria-label={label} aria-pressed={mi === value} onClick={() => setMi(value)} style={{ ...filterButton, color: mi === value ? C.accent : C.light, borderColor: mi === value ? C.accent : C.border }}>{value} mi</button>)}</div>
      <div role="group" aria-label="Types of Thanksgiving picks" style={{ ...row, gap: 6, marginBottom: 10 }}>{categories.filter(([value]) => value !== "places" || data?.places?.length).map(([value, label]) => <button key={value} aria-label={label} aria-pressed={category === value} onClick={() => setCategory(value)} style={{ ...filterButton, background: category === value ? C.accent + "20" : C.card, color: category === value ? C.accent : C.light }}>{{ all: "All", experiences: "Experiences", events: "Events", places: "Outings" }[value]}</button>)}</div>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "0 0 10px" }}>Relevant Viator experiences first. Check dates and meeting points.</p>
      <div style={row}><button disabled={!mapPlaces.length} onClick={() => openThanksgivingMap(ctx, data, category)} style={{ ...button, color: mapPlaces.length ? C.accent : C.muted, opacity: mapPlaces.length ? 1 : .6, cursor: mapPlaces.length ? "pointer" : "default" }}>Map verified stops{mapPlaces.length ? ` · ${mapPlaces.length} ${mapPlaces.length === 1 ? "venue" : "venues"}` : ""}</button>
        {data ? <span style={{ color: C.muted, fontSize: 12 }}>{visibleCount} picks in this view</span> : null}</div>
      {data ? <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: "6px 0" }}>Matched venues only; some picks have no map point.</p> : null}
      {data ? <details style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginTop: 6 }}><summary style={{ cursor: "pointer", color: C.light, fontWeight: 750 }}>About these picks</summary>
        <p>Picks keep their quality order within each group. Only matched venues from this view go to the map; pins appear only when a venue location is available. Check available dates and the operator’s meeting point.</p>
        {data.counts ? <p>Library considered: {Number(data.counts.libraryEvents || 0).toLocaleString()} event records · {Number(data.counts.libraryExperiences || 0).toLocaleString()} experience records. {Number(data.counts.localEvents || 0).toLocaleString()} events and {Number(data.counts.localExperiences || 0).toLocaleString()} experiences match this area and weekend. Viator results are a bounded nearby selection.</p> : null}
        {searchedMarkets.length ? <p>Viator search areas: {searchedMarkets.join(", ")}. More experiences may be available.</p> : null}
        {data.sourceStatus?.experiences?.reason === "no-nearby-market" ? <p>Viator search has no supported nearby market for this location.</p> : null}
        {warnings.length ? <ul style={{ paddingLeft: 18 }}>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
      </details> : null}
    </div>
    <div style={{ maxWidth: 920, width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "0 16px 48px" }} aria-live="polite" aria-busy={loading}>
      {!locationKey ? <div role="status" style={{ padding: "24px 0", color: C.light }}><h2 style={{ fontSize: 19 }}>Choose where to spend the holiday</h2><p style={{ lineHeight: 1.6 }}>Use your current location or select a city to find Thanksgiving picks nearby.</p><button style={button} onClick={chooseLocation}>Choose location</button></div> : null}
      {loading ? <p role="status" style={{ padding: "24px 0", color: C.muted }}>Finding Thanksgiving picks near {location}…</p> : null}
      {failed ? <div role="alert" style={{ padding: "24px 0" }}><p>We couldn’t load Thanksgiving picks for this area. Please try again.</p><button style={button} onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : null}
      {data?.status === "partial" ? <p role="status" style={{ color: C.gold, fontSize: 12, lineHeight: 1.5, margin: "0 0 10px" }}>{unavailableSources ? (data.sourceStatus?.experiences?.status === "unavailable" ? "Viator is temporarily unavailable. Showing verified picks." : "Some sources are temporarily unavailable. Showing verified picks.") : "The Viator search is limited; more options may exist."}</p> : null}
      {data?.sourceStatus?.experiences?.reason === "no-nearby-market" ? <p role="status" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "0 0 10px" }}>Viator has no supported nearby search area for this location.</p> : null}
      {dateWarnings.map((warning, index) => <p role="status" key={index} style={{ color: C.gold, fontSize: 12, lineHeight: 1.5 }}>{warning}</p>)}
      {data && !visibleCount ? <div role="status" style={{ padding: "24px 0", color: C.light }}><h2 style={{ fontSize: 19 }}>No matching picks in this view yet</h2><p style={{ lineHeight: 1.6 }}>Try all weekend, another type of pick, or a wider distance. Holiday schedules are still being announced in some areas.</p></div> : null}
      {!!groups.experiences.length && <section aria-labelledby="thanksgiving-experiences"><RailHeading id="thanksgiving-experiences" title="Viator experiences near you" description="Bookable ideas for the long weekend. Check availability and current prices on Viator." /><p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{AFFILIATE_DISCLOSURE_TEXT}</p><div className="wf-place-card-list">{groups.experiences.map((experience, index) => <HolidayExperienceCard key={experience.id || experience.code} experience={experience} rank={index + 1} contentId={contentId} page={`thanksgiving-${year}`} />)}</div></section>}
      {!!groups.events.length && <section aria-labelledby="thanksgiving-events"><RailHeading id="thanksgiving-events" title="Holiday events" description="Dated events that overlap your Thanksgiving plans. Open the listing for hours and tickets." /><div className="wf-place-card-list">{groups.events.map((event) => <HolidayEventCard key={event.id} event={event} today={today} />)}</div></section>}
      {!!groups.places.length && <section aria-labelledby="thanksgiving-places"><RailHeading id="thanksgiving-places" title="Easy local outings" description="Nearby places for time between holiday plans. Check holiday opening hours before going." /><div className="wf-place-card-list">{groups.places.map((place, index) => <RailCard key={place.id} place={place} title={place.name} photo={place.image || place.photo || place.thumb} photoFallbackCategory={place.category} eyebrow="Local outing" rank={index + 1} score={toDisplayScore(place.wfScore)} facts={[place.city].filter(Boolean)} take={place.thanksgivingReason || place.editorial || null} href={`/p/${encodeURIComponent(place.id)}`} onOpen={ctx.openDetail ? () => ctx.openDetail(place) : undefined} />)}</div></section>}
    </div>
  </div>;
}
