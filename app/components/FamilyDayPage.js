"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "./RankedExperiencePage";
import IconicPlaceCard from "./IconicPlaceCard";
import { BackControl } from "../best-beaches/[metro]/parts";
import { ScoreDisclosure } from "./ExperienceBlocks";
import { FAMILY_DAY_RAILS, matchesFamilyFilters } from "../../lib/familyDayTaxonomy";
import { familyFilterFacts } from "../../lib/familyDayEvidence";
import { resolveLocationContext, milesBetween } from "../../lib/locationHonesty";
import { nowContext } from "../../lib/nowContext";
import { canonicalShareUrl } from "../../lib/site";
import { track } from "../../lib/track";

const COLORS = { text: "#F1F5F9", muted: "#9AA6B6", border: "rgba(255,255,255,.11)", panel: "#0B111B", accent: "#22C55E" };
const DISTANCES = [10, 25, 50];

const FILTERS = [
  { key: "ages", label: "Published ages", options: [
    ["baby", "Babies"], ["toddler", "Toddlers"], ["kid", "Kids"], ["tween", "Tweens"], ["teen", "Teens"], ["all-ages", "All ages"],
  ] },
  { key: "weather", label: "Weather fit", options: [
    ["indoor", "Indoors"], ["outdoor", "Outdoors"], ["shaded", "Shade available"], ["heat-friendly", "Heat friendly"],
  ] },
  { key: "cost", label: "Cost", options: [
    ["free", "Free"], ["ticketed", "Ticketed"],
  ] },
  { key: "duration", label: "Time", options: [
    ["quick", "Quick stop"], ["half-day", "Half day"], ["full-day", "Full day"],
  ] },
  { key: "logistics", label: "Planning", options: [
    ["parking", "Parking info"], ["reservation", "Reservations"], ["walk-up", "Walk-up"], ["stroller", "Strollers"], ["stroller-parking", "Stroller parking"], ["changing", "Changing facilities"], ["height", "Height rules"],
  ] },
  { key: "style", label: "Style", options: [
    ["hands-on", "Hands-on"], ["educational", "Educational"], ["animal-focused", "Animals"], ["nature", "Nature"], ["show", "Show"], ["active", "Active"],
  ] },
  { key: "composition", label: "Group", options: [
    ["mixed-ages", "Mixed ages"], ["young-children", "Young children"], ["older-kids", "Older kids"],
  ] },
];

function familyLocation({ urlCity = "", urlLat = NaN, urlLng = NaN, stored = null } = {}) {
  const point = { lat: Number(urlLat), lng: Number(urlLng) };
  const hasUrlPoint = Number.isFinite(point.lat) && Number.isFinite(point.lng);
  let city = String(urlCity || "").slice(0, 40);
  if (!city && hasUrlPoint && stored) {
    const distance = milesBetween(point, stored);
    if (Number.isFinite(distance) && distance <= 25) city = stored.loc || "";
  }
  const ctx = resolveLocationContext({ urlCity: city, urlLat, urlLng, stored: hasUrlPoint ? null : stored });
  return { lat: ctx.lat, lng: ctx.lng, city: ctx.city || "" };
}

function RailLoading({ title }) {
  return (
    <div className="wf-family-loading" role="status" aria-busy="true" aria-label={`Loading ${title}`}>
      <span className="wf-family-critter"><img src="/pin.png" alt="" width="30" height="30" /></span>
      <span>Finding verified family picks…</span>
    </div>
  );
}

const FACT_LABELS = {
  indoor: "Indoors", outdoor: "Outdoors", shaded: "Shade", "heat-friendly": "Heat friendly",
  free: "Free", ticketed: "Ticketed", quick: "Quick stop", "half-day": "Half day", "full-day": "Full day",
  "hands-on": "Hands-on", educational: "Educational", "animal-focused": "Animal-focused", nature: "Nature", show: "Show", active: "Active",
  "mixed-ages": "Mixed ages", "young-children": "Young children", "older-kids": "Older kids",
};

function PlanningFacts({ place }) {
  const facts = familyFilterFacts(place && (place.place_id || place.id));
  if (!facts) return null;
  const labels = [];
  if (FACT_LABELS[facts.duration_recommendation]) labels.push(FACT_LABELS[facts.duration_recommendation]);
  if (facts.stroller === true) labels.push("Strollers");
  if (facts.stroller_parking === true) labels.push("Stroller parking");
  if (facts.changing_facilities === true) labels.push("Changing facilities");
  else if (facts.changing_facilities === false) labels.push("No changing facilities listed");
  if (facts.height_restrictions === true) labels.push("Height rules");
  if (facts.reservation_required === true) labels.push("Reservation needed");
  else if (facts.reservation_required === false) labels.push("Walk-up possible");
  if (facts.parking === true) labels.push("Parking info");
  for (const value of facts.weather_fit || []) if (FACT_LABELS[value]) labels.push(FACT_LABELS[value]);
  if (FACT_LABELS[facts.cost]) labels.push(FACT_LABELS[facts.cost]);
  for (const value of facts.style || []) if (FACT_LABELS[value]) labels.push(FACT_LABELS[value]);
  for (const value of facts.composition || []) if (FACT_LABELS[value]) labels.push(FACT_LABELS[value]);
  const unique = [...new Set(labels)].slice(0, 4);
  const source = Array.isArray(facts.sources) ? facts.sources[0] : null;
  if (!unique.length && !source) return null;
  return (
    <span className="wf-family-fact" title={unique.join(" · ") || "Verified family planning information"}>
      {unique.length ? unique.join(" · ") : "Verified info"}
      {source ? <a href={source} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Open verified planning source for ${place.name}`}>Source ↗</a> : null}
    </span>
  );
}

async function fetchFamilyRail({ lat, lng, radiusMi, railId, filters, signal }) {
  const query = new URLSearchParams({
    lat: String(lat), lng: String(lng), radiusMi: String(radiusMi), rail: railId,
  });
  if (Object.keys(filters).length) query.set("filters", JSON.stringify(filters));
  const response = await fetch("/api/family-day?" + query.toString(), { signal });
  let body = null;
  try { body = await response.json(); } catch (error) {}
  if (!response.ok || !body || !Array.isArray(body.places)) {
    throw new Error((body && body.error) || `Request returned ${response.status}`);
  }
  return body;
}

function FamilyEventCard({ event }) {
  const href = event.href || event.dest;
  const distance = Number.isFinite(Number(event.distMi ?? event.distanceMi))
    ? `${Number(event.distMi ?? event.distanceMi) < 10 ? Number(event.distMi ?? event.distanceMi).toFixed(1) : Math.round(Number(event.distMi ?? event.distanceMi))} mi`
    : null;
  const facts = [event.whenFact, event.venue, distance].filter(Boolean);
  return (
    <li className="wf-family-event-card">
      {event.image ? <img src={event.image} alt="" loading="lazy" /> : <span className="wf-family-event-monogram" aria-hidden="true">{String(event.name || "Event").slice(0, 1)}</span>}
      <div>
        <span className="wf-family-event-kicker">Family event</span>
        <h3>{href ? <a href={href}>{event.name}</a> : event.name}</h3>
        {facts.length ? <p>{facts.join(" · ")}</p> : null}
        {href ? <a className="wf-family-event-link" href={href}>Event details <span aria-hidden="true">›</span></a> : null}
      </div>
    </li>
  );
}

function FamilyRail({ rail, loc, radiusMi, filters, weatherSettled, weatherPaused, retryAll }) {
  const sectionRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState({ status: "idle", places: [], truncated: false, more: false, matched: 0 });
  const [retry, setRetry] = useState(0);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || visible) return undefined;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || weatherPaused || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("family rail deadline")), 12000);
    let live = true;
    setState({ status: "loading", places: [], truncated: false, more: false, matched: 0 });
    fetchFamilyRail({ lat: loc.lat, lng: loc.lng, radiusMi, railId: rail.id, filters, signal: controller.signal })
      .then((payload) => {
        if (!live) return;
        const places = payload.places.filter((place) => matchesFamilyFilters(place, filters));
        const eventsAvailable = rail.id !== "culture" ? null : payload.eventsFailed === true || !Array.isArray(payload.events) ? false : true;
        // Culture events are filtered against their reviewed event evidence in
        // the server adapter. They are not place IDs, so the place-evidence
        // helper below deliberately cannot re-classify them in the browser.
        const events = eventsAvailable ? payload.events : [];
        setState({ status: "ready", places, truncated: payload.truncated === true, more: payload.more === true, matched: Number(payload.matched) || places.length,
          events, eventsAvailable, eventsTruncated: payload.eventsTruncated === true, eventMatched: Number(payload.eventMatched) || events.length });
        try { track("family_day_rail_loaded", { rail: rail.id, places: places.length, radius_mi: radiusMi }); } catch (error) {}
      })
      .catch((error) => {
        if (live) setState({ status: "failed", places: [], truncated: false, more: false, matched: 0, error: error && error.message });
      })
      .finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [visible, weatherPaused, loc.lat, loc.lng, radiusMi, rail.id, filterKey, retry, retryAll]);

  const cards = state.places || [];
  const ready = !weatherPaused && weatherSettled && state.status === "ready";
  return (
    <section ref={sectionRef} className="wf-family-section" aria-labelledby={`family-${rail.id}-title`}>
      <div className="wf-family-rail-heading">
        <div>
          <h2 id={`family-${rail.id}-title`}>{rail.title}</h2>
          <p>{rail.description}</p>
        </div>
        {ready && cards.length ? <span>{state.more && !state.truncated ? `${cards.length} of ${state.matched}` : `${cards.length} ${cards.length === 1 ? "pick" : "picks"}`}</span> : null}
      </div>
      {weatherPaused ? <p className="wf-family-empty">Outdoor matches are paused because current weather is not a safe fit. Choose Indoors or clear the weather filter to see verified indoor options.</p> : null}
      {!weatherPaused && (!visible || !weatherSettled || state.status === "idle" || state.status === "loading") ? <RailLoading title={rail.title} /> : null}
      {!weatherPaused && state.status === "failed" ? (
        <div className="wf-family-message" role="alert">
          <p>These picks are taking longer than usual. Try again or come back shortly.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Try this rail again</button>
        </div>
      ) : null}
      {ready && !cards.length ? (
        <p className="wf-family-empty">{state.truncated ? "This search reached its limit before finding a match. Try a smaller distance." : "No nearby place has enough explicit evidence for this rail and these filters. Unknown age, cost, access, or planning details are left unknown."}</p>
      ) : null}
      {ready && cards.length ? (
        <>
          <ol className="wf-family-card-rail" tabIndex="0" aria-label={`${rail.title}, horizontal list`}>
            {cards.map((place, index) => (
              <IconicPlaceCard
                key={place.id}
                place={place}
                rank={index + 1}
                href={`/p/${encodeURIComponent(place.id)}`}
                editorial={place.editorial || null}
                rankingNote={place.rankingNote || place.ranking_note || null}
                badge={<PlanningFacts place={place} />}
                surface={`family_day_${rail.id}`}
                eagerMedia={rail.id === "beach" && index < 2}
              />
            ))}
          </ol>
          {state.truncated ? <p className="wf-family-note">Some places have not been checked in this area yet. Try a smaller distance.</p> : null}
        </>
      ) : null}
      {rail.id === "culture" && ready ? (
        <div className="wf-family-events">
          <h3>Family events happening nearby</h3>
          {state.eventsAvailable === false ? <p className="wf-family-empty">These event picks are taking longer than usual. Try again or come back shortly.</p> : null}
          {state.eventsAvailable === true && !state.events.length ? <p className="wf-family-empty">No verified family events match this location and these filters right now.</p> : null}
          {state.eventsAvailable === true && state.events.length ? (
            <>
              <ol className="wf-family-event-rail" tabIndex="0" aria-label="Family events, horizontal list">
                {state.events.map((event) => <FamilyEventCard key={event.id} event={event} />)}
              </ol>
              {state.eventsTruncated ? <p className="wf-family-note">More matching family events are available.</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FamilyFilters({ filters, onChange, radiusMi, onRadius }) {
  return (
    <section className="wf-family-filters" aria-label="Family day filters">
      <div className="wf-family-distance">
        <strong>Distance</strong>
        <div>{DISTANCES.map((miles) => <button key={miles} type="button" aria-pressed={radiusMi === miles} className={radiusMi === miles ? "is-on" : ""} onClick={() => onRadius(miles)}>{miles} mi</button>)}</div>
      </div>
      <div className="wf-family-filter-grid">
        {FILTERS.map((facet) => (
          <label key={facet.key}>
            <span>{facet.label}</span>
            <select value={filters[facet.key] || ""} onChange={(event) => onChange(facet.key, event.target.value)}>
              <option value="">Any verified fit</option>
              {facet.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ))}
      </div>
      {Object.keys(filters).length ? <button className="wf-family-clear" type="button" onClick={() => onChange("", "")}>Clear family filters</button> : null}
      <p>Filters use explicit family evidence only. Published age tags describe venue guidance, not suitability for every child. Missing details never count as a match.</p>
    </section>
  );
}

export default function FamilyDayPage() {
  const searchParams = useSearchParams();
  const urlCity = (searchParams.get("city") || "").slice(0, 40);
  const urlLat = parseFloat(searchParams.get("lat"));
  const urlLng = parseFloat(searchParams.get("lng"));
  const requestedRadius = Number(searchParams.get("radiusMi"));
  const [loc, setLoc] = useState(() => familyLocation({ urlCity, urlLat, urlLng }));
  const [radiusMi, setRadiusMi] = useState(DISTANCES.includes(requestedRadius) ? requestedRadius : 25);
  const [filters, setFilters] = useState({});
  const [weather, setWeather] = useState(null);
  const [weatherSettled, setWeatherSettled] = useState(false);
  const [moment, setMoment] = useState(null);
  const [retryAll, setRetryAll] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stored = null;
    try {
      const value = JSON.parse(localStorage.getItem("wf_center") || "null");
      if (value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) {
        stored = { lat: Number(value.lat), lng: Number(value.lng), loc: value.loc || "" };
      }
    } catch (error) {}
    setLoc(familyLocation({ urlCity, urlLat, urlLng, stored }));
  }, [urlCity, urlLat, urlLng]);

  useEffect(() => {
    if (DISTANCES.includes(requestedRadius)) setRadiusMi(requestedRadius);
  }, [requestedRadius]);

  useEffect(() => {
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) { setWeatherSettled(true); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    let live = true;
    setWeather(null);
    setMoment(null);
    setWeatherSettled(false);
    fetch(`/api/weather?lat=${loc.lat.toFixed(2)}&lng=${loc.lng.toFixed(2)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (live) setWeather(payload); })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); if (live) setWeatherSettled(true); });
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [loc.lat, loc.lng]);

  useEffect(() => {
    if (!weatherSettled) return;
    setMoment(nowContext({ lat: loc.lat, lng: loc.lng, city: loc.city, weather }));
  }, [loc.lat, loc.lng, loc.city, weather, weatherSettled]);

  const outdoorGateClosed = !!(weatherSettled && moment && !moment.outdoorOK);
  const weatherPaused = outdoorGateClosed && !!filters.weather && filters.weather !== "indoor";
  const effectiveFilters = useMemo(() => {
    if (!outdoorGateClosed || weatherPaused) return filters;
    return { ...filters, weather: "indoor" };
  }, [filters, outdoorGateClosed, weatherPaused]);

  const changeFilter = useCallback((key, value) => {
    if (!key) { setFilters({}); return; }
    setFilters((current) => {
      const next = { ...current };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
  }, []);

  const share = async () => {
    const url = canonicalShareUrl(typeof window !== "undefined" ? window.location.href : "/family");
    try { if (navigator.share) { await navigator.share({ title: "Family day, solved", url }); return; } } catch (error) { if (error && error.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (error) {}
  };

  const hasPoint = Number.isFinite(loc.lat) && Number.isFinite(loc.lng);
  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" variant="editorial" />}
      eyebrow="Memories for life"
      titleTop="Family day, solved"
      subtitle={loc.city ? `Ten ways to plan a family day around ${loc.city}, ranked from real place evidence.` : "Ten ways to plan a family day, ranked from real place evidence."}
      heroImg="/cards/family-day-solved-v2.webp"
      location={loc.city || undefined}
      imageKicker="THE WAYFIND FAMILY EDITION"
      imageTitle="A day everyone wants to repeat."
      dekLead="Start with what works for your family."
      actionSlot={<button type="button" onClick={share} className="wf-family-share">{copied ? "Link copied" : "Share this list"} <span aria-hidden="true">↗</span></button>}
      footerSlot={<ScoreDisclosure />}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .wf-intent-editorial-hero .wf-intent-editorial-media>img{object-fit:contain}
        .wf-intent-editorial-hero .wf-intent-editorial-media{background:#075cb4}
        .wf-intent-editorial-hero .wf-intent-editorial-media:after,.wf-intent-editorial-hero .wf-intent-editorial-image-copy{display:none}
        .wf-family-share{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 20px;border-radius:14px;border:1px solid rgba(17,24,36,.12);background:#22C55E;color:#07130B;font-size:12.5px;font-weight:850;cursor:pointer;white-space:nowrap}
        .wf-family-filters{padding:17px;border:1px solid ${COLORS.border};border-radius:18px;background:${COLORS.panel};box-shadow:0 14px 36px rgba(0,0,0,.2)}
        .wf-family-distance{display:flex;align-items:center;justify-content:space-between;gap:12px}.wf-family-distance strong{font-size:13px}.wf-family-distance div{display:flex;gap:6px}.wf-family-distance button,.wf-family-message button,.wf-family-clear{border:1px solid rgba(255,255,255,.16);border-radius:999px;background:#131D2B;color:${COLORS.text};padding:7px 11px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.wf-family-distance button.is-on{background:${COLORS.accent};border-color:${COLORS.accent};color:#07130B}
        .wf-family-filter-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-top:14px}.wf-family-filter-grid label span{display:block;margin:0 0 5px;color:#BEC8D6;font-size:10px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}.wf-family-filter-grid select{width:100%;min-height:39px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#111A27;color:${COLORS.text};padding:7px;font:inherit;font-size:12px}.wf-family-filters>p,.wf-family-note{margin:10px 0 0;color:${COLORS.muted};font-size:11.5px;line-height:1.45}.wf-family-clear{margin-top:11px;color:#BBF7D0}
        .wf-family-weather{margin:16px 0 0;padding:12px 14px;border-left:3px solid #F59E0B;border-radius:8px;background:rgba(245,158,11,.09);color:#FDE68A;font-size:12.5px;line-height:1.5}
        .wf-family-section{min-height:170px;margin-top:30px;scroll-margin-top:20px}.wf-family-rail-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:11px}.wf-family-rail-heading h2{margin:0;color:${COLORS.text};font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:500;letter-spacing:-.025em}.wf-family-rail-heading p{max-width:620px;margin:5px 0 0;color:#AEB8C6;font-size:13px;line-height:1.45}.wf-family-rail-heading>span{flex:none;color:#86EFAC;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}
        .wf-family-card-rail,.wf-family-event-rail{display:grid;grid-auto-flow:column;grid-auto-columns:min(82vw,360px);gap:13px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0;padding:2px 2px 9px;list-style:none}.wf-family-card-rail::-webkit-scrollbar,.wf-family-event-rail::-webkit-scrollbar{display:none}.wf-family-card-rail>.wf-place-card,.wf-family-event-card{scroll-snap-align:start;margin:0!important}.wf-family-fact{display:inline-flex!important;align-items:center;gap:7px;max-width:100%;overflow:hidden;color:#D1FAE5!important;background:rgba(34,197,94,.1)!important;border:1px solid rgba(74,222,128,.25)!important}.wf-family-fact>a{flex:none;color:#86EFAC;text-decoration:none;font-weight:850}.wf-family-loading{display:flex;min-height:116px;align-items:center;justify-content:center;gap:11px;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:#0A0F18;color:${COLORS.muted};font-size:13px}.wf-family-critter{display:flex;animation:wfbob 1.1s ease-in-out infinite}.wf-family-critter img{display:block;object-fit:contain}.wf-family-message,.wf-family-empty{margin:0;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#0A0F18;color:${COLORS.muted};font-size:13px;line-height:1.55}.wf-family-message p{margin:0 0 11px}
        .wf-family-events{margin-top:18px}.wf-family-events>h3{margin:0 0 10px;color:${COLORS.text};font-size:15px}.wf-family-event-card{display:grid;grid-template-columns:104px minmax(0,1fr);min-height:150px;overflow:hidden;border:1px solid rgba(159,177,203,.25);border-radius:17px;background:#111824}.wf-family-event-card>img,.wf-family-event-monogram{width:104px;height:100%;min-height:150px;object-fit:cover}.wf-family-event-monogram{display:grid;place-items:center;color:#FFC08F;background:linear-gradient(155deg,#192230,#0D131E);font-size:24px;font-weight:900}.wf-family-event-card>div{padding:15px}.wf-family-event-kicker{color:#86EFAC;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.wf-family-event-card h3{margin:6px 0 0;font-size:16px;line-height:1.2}.wf-family-event-card h3 a{color:${COLORS.text};text-decoration:none}.wf-family-event-card p{margin:7px 0;color:${COLORS.muted};font-size:11.5px;line-height:1.4}.wf-family-event-link{color:#86EFAC;font-size:11.5px;font-weight:800;text-decoration:none}
        @media(max-width:720px){.wf-family-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wf-family-distance{align-items:flex-start;flex-direction:column}.wf-family-section{margin-top:26px}.wf-family-rail-heading h2{font-size:22px}}
        @keyframes wfbob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.06)}}
        @media(prefers-reduced-motion:reduce){.wf-family-critter{animation:none}}
      ` }} />
      <FamilyFilters filters={filters} onChange={changeFilter} radiusMi={radiusMi} onRadius={setRadiusMi} />
      {outdoorGateClosed ? <p className="wf-family-weather">Outdoor picks are paused because {moment.gateWhy || "current weather is not a safe fit"}. {weatherPaused ? "Your weather choice is preserved; choose Indoors or clear it to continue." : "The rails are using verified indoor evidence."}</p> : null}
      {!hasPoint ? <div className="wf-family-message"><p>This page needs a location before it can rank nearby family picks. Open the Family Day poster after choosing a location.</p></div> : (
        <>
          {FAMILY_DAY_RAILS.map((rail) => <FamilyRail key={rail.id} rail={rail} loc={loc} radiusMi={radiusMi} filters={effectiveFilters} weatherSettled={weatherSettled && !!moment} weatherPaused={weatherPaused} retryAll={retryAll} />)}
          <button type="button" className="wf-family-clear" onClick={() => setRetryAll((value) => value + 1)}>Refresh loaded rails</button>
        </>
      )}
    </RankedExperiencePage>
  );
}
