"use client";
// Live Picks (§1) — the user-facing section.
//
// INTELLIGENCE DOCTRINE: the qualifying signals ARE the content. Every claim on
// screen traces to something real:
//   • "chosen from N events near you"  -> the actual ranked count
//   • "on sale now"                    -> Ticketmaster status/price
//   • distance, date, venue, price     -> rendered ONLY when present
//   • "Popular on Wayfind"             -> our own event_open / tickets_out,
//                                         and only above a real threshold
//
// WHAT IS DELIBERATELY ABSENT: ticket demand, Google Trends, search volume,
// social engagement, artist/venue popularity, crowd levels. No wired source
// exists for any of them, so there is no "Selling Fast" and no "Everyone's
// Talking" here. Omitted, never fabricated.
import { useEffect, useMemo, useRef, useState } from "react";
import { rankLivePicks } from "../../../lib/livePicks.js";
import { siteTodayStr } from "../../../lib/siteTime.js";

// A first-party count only becomes a user-facing CLAIM above this bar. Measured
// 2026-07-21: the busiest event had 1 open from 1 device, so nothing qualifies
// today and the tag ships dark — correct. It lights up on its own as traffic
// grows. Calling one open "popular" would be the invented-popularity the brief
// forbids, even though the count is technically real.
const POPULAR_MIN_OPENS = 5;
const POPULAR_MIN_DEVICES = 3;
const isPopular = (d) => !!d && (d.opens || 0) >= POPULAR_MIN_OPENS && (d.devices || 0) >= POPULAR_MIN_DEVICES;

const C = { bg: "#0D1117", card: "#161B22", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316", purple: "#A78BFA" };

// Location is ALWAYS the user's: stored center -> URL -> geolocation.
// Nothing hardcoded (global guardrail).
function useCenter() {
  const [center, setCenter] = useState(null);
  const [label, setLabel] = useState("");
  const [state, setState] = useState("resolving");
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const qLat = parseFloat(sp.get("lat")), qLng = parseFloat(sp.get("lng"));
      if (isFinite(qLat) && isFinite(qLng)) { setCenter({ lat: qLat, lng: qLng }); setLabel(sp.get("loc") || ""); setState("url"); return; }
      const raw = localStorage.getItem("wf_center");
      if (raw) {
        const o = JSON.parse(raw);
        if (o && isFinite(o.lat) && isFinite(o.lng)) { setCenter({ lat: o.lat, lng: o.lng }); setLabel(o.loc || ""); setState("stored"); return; }
      }
    } catch (e) {}
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => { setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); setState("geo"); },
        () => setState("denied"),
        { timeout: 8000, maximumAge: 600000 }
      );
    } else setState("denied");
  }, []);
  return { center, label, state };
}

function Badge({ children, tone }) {
  const t = tone === "accent" ? { bg: "rgba(249,115,22,.12)", bd: "rgba(249,115,22,.5)", fg: C.accent } : { bg: "rgba(255,255,255,.06)", bd: C.border, fg: C.muted };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: t.bg, border: `1px solid ${t.bd}`, color: t.fg, fontSize: 11.5, fontWeight: 800, letterSpacing: .2 }}>{children}</span>;
}

// One card shape for hero AND rail (the vision: swiping reveals the same large
// card, never a different layout). `wide` only changes its width in the rail.
function PickCard({ ev, demand, wide }) {
  const [imgBad, setImgBad] = useState(false);
  const showImg = ev.image && !imgBad;
  const pop = isPopular(demand);
  const bits = [];
  if (ev.venue) bits.push(ev.venue);
  if (ev.distanceMi != null) bits.push(`${ev.distanceMi} mi away`);
  return (
    <article style={{ flex: wide ? "0 0 86%" : "1 1 auto", scrollSnapAlign: "start", background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
      <div style={{ position: "relative", height: 176, background: showImg ? "#0B0F14" : `linear-gradient(140deg, ${C.purple}33, ${C.bg} 70%)` }}>
        {showImg ? <img src={ev.image} alt="" onError={() => setImgBad(true)} decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.9) 100%)" }} />
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ev.category ? <Badge tone="accent">{ev.category === "broadway" ? "Broadway" : ev.category[0].toUpperCase() + ev.category.slice(1)}</Badge> : null}
          {pop ? <Badge>Popular on Wayfind</Badge> : null}
        </div>
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17, lineHeight: 1.25, fontWeight: 800, color: "#fff" }}>{ev.name}</h3>
          {bits.length ? <div style={{ marginTop: 4, fontSize: 12.5, color: "#C9D1D9" }}>{bits.join(" · ")}</div> : null}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 13px" }}>
        <div style={{ fontSize: 12.5, color: C.muted, minWidth: 0 }}>
          {/* only what exists — 87% of events carry no price, so it is conditional */}
          {ev.date ? <span style={{ color: C.text, fontWeight: 700 }}>{ev.date}</span> : null}
          {ev.time ? <span> · {ev.time}</span> : null}
          {ev.price ? <span> · {ev.price}</span> : null}
        </div>
        {ev.dest ? <a href={ev.dest} target="_blank" rel="noreferrer" style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 999, background: C.accent, color: "#0D1117", fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>Get tickets</a> : null}
      </div>
    </article>
  );
}

export default function LivePicksScreen() {
  const { center, label, state } = useCenter();
  const [events, setEvents] = useState(null);
  const [demandMap, setDemandMap] = useState(null);
  const [err, setErr] = useState(false);
  const railRef = useRef(null);

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: center.lat, lng: center.lng, radius: 60, city: label || "" }) });
        if (!r.ok) { if (!off) { setErr(true); setEvents([]); } return; }
        const d = await r.json();
        if (!off) setEvents(Array.isArray(d.events) ? d.events : []);
      } catch (e) { if (!off) { setErr(true); setEvents([]); } }
    })();
    // Demand is optional: any failure leaves demandMap null and the scorer's
    // boost is simply 0. Live Picks never depends on it.
    (async () => {
      try { const r = await fetch("/api/events/demand"); if (r.ok) { const d = await r.json(); if (!off) setDemandMap(d.demand || {}); } } catch (e) {}
    })();
    return () => { off = true; };
  }, [center, label]);

  const ranked = useMemo(() => {
    if (!events) return null;
    return rankLivePicks(events, { center, todayStr: siteTodayStr(), demandMap: demandMap || undefined });
  }, [events, center, demandMap]);

  const where = label ? label.split(",")[0] : "you";
  const wrap = { maxWidth: 480, margin: "0 auto", padding: "18px 14px 28px", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };

  if (state === "resolving" || (!ranked && !err)) {
    return (
      <main style={wrap}>
        <Badge>Curated by Wayfind AI</Badge>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "10px 0 6px" }}>Live Picks</h2>
        <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Finding what’s on near you…</p>
        <div style={{ height: 176, borderRadius: 18, background: C.card, marginTop: 14 }} />
      </main>
    );
  }

  if (state === "denied" && !center) {
    return (
      <main style={wrap}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Live Picks</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>Wayfind needs a location to find what’s on near you. Turn on location, or search a place.</p>
      </main>
    );
  }

  const all = (ranked && ranked.all) || [];
  // Honest empty state — a real outcome in a thin market, never an error.
  if (!all.length) {
    return (
      <main style={wrap}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Live Picks</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
          Wayfind checked live events within 60 miles of {where} and found nothing on sale worth leading with right now. Try a wider search or check back tomorrow.
        </p>
      </main>
    );
  }

  const hero = ranked.hero;
  const heroDemand = demandMap && hero ? demandMap[hero.id] : null;
  // Headline is driven ONLY by signals we actually have (category + date +
  // proximity). A demand-flavoured headline is used solely when the event
  // clears the real first-party threshold.
  const headline = isPopular(heroDemand)
    ? "What Wayfind users are opening most"
    : hero.date === siteTodayStr()
      ? "Tonight’s biggest event near you"
      : "Wayfind’s #1 live pick near you";

  return (
    <main style={wrap}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Badge tone="accent">Curated by Wayfind AI</Badge>
        <Badge>Chosen from {all.length} events near {where}</Badge>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px", lineHeight: 1.2 }}>{headline}</h2>
      {/* Reasoning names the REAL signals analysed — nothing implied that isn't wired. */}
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "0 0 14px" }}>
        Wayfind checked what’s on within 60 miles, what’s still on sale, how soon it starts, and how far you’d travel
        {demandMap && Object.keys(demandMap).length ? ", plus what Wayfind users are opening" : ""}.
      </p>

      <PickCard ev={hero} demand={heroDemand} />

      {ranked.rail.length ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "20px 0 8px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>More worth your night</h3>
            <span style={{ fontSize: 11.5, color: C.muted }}>Swipe →</span>
          </div>
          <div ref={railRef} tabIndex={0} role="region" aria-label="More live picks near you"
            style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {ranked.rail.slice(0, 12).map((e) => (
              <PickCard key={e.id} ev={e} demand={demandMap ? demandMap[e.id] : null} wide />
            ))}
          </div>
        </>
      ) : null}

      {/* §2 Sports rail mounts here — separate branch, deliberately left empty. */}
      <div data-slot="sports-rail" />

      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 22, opacity: .85 }}>
        Ranked on live event data, on-sale status, start date and distance from {where}. Ticket demand and trending
        data aren’t available from any source Wayfind trusts yet, so they’re not part of this ranking.
      </p>
    </main>
  );
}
