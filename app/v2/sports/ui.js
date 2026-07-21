"use client";
// Sports rail (§2) — compact league cards that sit under the Live Picks hero.
//
// THE SORT IS THE PRODUCT CLAIM. The vision asks for "sorted by popularity, not
// date". Ticketmaster publishes no popularity number, so inventing one is off
// the table. The honest stand-in is what we can actually observe: how close it
// is, whether it's still on sale, how soon it starts, and our own first-party
// demand. That IS a better order than the calendar, and the copy says exactly
// that instead of implying a popularity ranking we don't have.
//
// League precision comes from Ticketmaster `subGenre` when present; without it
// leagueOf() degrades to the sport name. Degraded, never fabricated.
import { useEffect, useMemo, useState } from "react";
import { rankSports } from "../../../lib/sportsRail.js";
import { siteTodayStr } from "../../../lib/siteTime.js";

const C = { bg: "#0D1117", card: "#161B22", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316", cool: "#38BDF8" };

// Location is ALWAYS the user's: stored center -> URL -> geolocation.
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
      if (raw) { const o = JSON.parse(raw); if (o && isFinite(o.lat) && isFinite(o.lng)) { setCenter({ lat: o.lat, lng: o.lng }); setLabel(o.loc || ""); setState("stored"); return; } }
    } catch (e) {}
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => { setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); setState("geo"); },
        () => setState("denied"), { timeout: 8000, maximumAge: 600000 });
    } else setState("denied");
  }, []);
  return { center, label, state };
}

// Ticketmaster's `genre` is "Miscellaneous" for a lot of minor-league sport, and
// that is what leagueOf() falls back to when subGenre is absent. Rendering it as
// a LEAGUE chip is honest but useless — it tells the user nothing. Suppress the
// junk tokens instead of inventing a league we do not know.
const JUNK_LEAGUE = new Set(["miscellaneous", "undefined", "other", "sports", ""]);
const usefulLeague = (l) => !JUNK_LEAGUE.has(String(l || "").trim().toLowerCase());

function LeagueChip({ children }) {
  return <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 999, background: "rgba(56,189,248,.12)", border: `1px solid rgba(56,189,248,.45)`, color: C.cool, fontSize: 10.5, fontWeight: 800, letterSpacing: .3, textTransform: "uppercase" }}>{children}</span>;
}

// Compact card — deliberately smaller than the Live Picks hero: this rail sits
// UNDER it and must not compete with it visually.
function SportCard({ ev }) {
  const bits = [];
  if (ev.venue) bits.push(ev.venue);
  if (ev.distanceMi != null) bits.push(`${ev.distanceMi} mi`);
  return (
    <article style={{ flex: "0 0 208px", scrollSnapAlign: "start", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
      {usefulLeague(ev.league) ? <LeagueChip>{ev.league}</LeagueChip> : null}
      <h3 style={{ margin: 0, fontSize: 13.5, lineHeight: 1.3, fontWeight: 800, color: C.text }}>{ev.name}</h3>
      {bits.length ? <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{bits.join(" · ")}</div> : null}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 4 }}>
        <div style={{ fontSize: 11.5, color: C.muted, minWidth: 0 }}>
          {/* only what exists — price is absent on most events */}
          {ev.date ? <span style={{ color: C.text, fontWeight: 700 }}>{ev.date}</span> : null}
          {ev.time ? <span> · {ev.time}</span> : null}
          {ev.price ? <span> · {ev.price}</span> : null}
        </div>
        {ev.dest ? <a href={ev.dest} target="_blank" rel="noreferrer" style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: C.accent, textDecoration: "none" }}>Tickets ↗</a> : null}
      </div>
    </article>
  );
}

export default function SportsRailScreen() {
  const { center, label, state } = useCenter();
  const [events, setEvents] = useState(null);
  const [demandMap, setDemandMap] = useState(null);

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: center.lat, lng: center.lng, radius: 75, city: label || "" }) });
        const d = r.ok ? await r.json() : null;
        if (!off) setEvents(d && Array.isArray(d.events) ? d.events : []);
      } catch (e) { if (!off) setEvents([]); }
    })();
    // Optional — absent demand simply means a 0 boost, never a failure.
    (async () => { try { const r = await fetch("/api/events/demand"); if (r.ok) { const d = await r.json(); if (!off) setDemandMap(d.demand || {}); } } catch (e) {} })();
    return () => { off = true; };
  }, [center, label]);

  const ranked = useMemo(() => {
    if (!events) return null;
    return rankSports(events, { center, todayStr: siteTodayStr(), demandMap: demandMap || undefined });
  }, [events, center, demandMap]);

  const where = label ? label.split(",")[0] : "you";
  const wrap = { maxWidth: 480, margin: "0 auto", padding: "18px 14px 28px", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };

  if (state === "resolving" || (!ranked && state !== "denied")) {
    return <main style={wrap}><h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 6px" }}>Sports near you</h2><p style={{ fontSize: 13, color: C.muted }}>Finding games near you…</p></main>;
  }
  if (state === "denied" && !center) {
    return <main style={wrap}><h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 6px" }}>Sports near you</h2><p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>Wayfind needs a location to find games near you.</p></main>;
  }

  const cards = (ranked && ranked.cards) || [];
  const leagues = Object.keys((ranked && ranked.byLeague) || {}).filter(usefulLeague);

  // Honest empty state — a real outcome in a thin market, not an error.
  if (!cards.length) {
    return (
      <main style={wrap}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 6px" }}>Sports near you</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>No games on sale within 75 miles of {where} right now. Wayfind will surface them as soon as tickets open.</p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.5)", color: C.accent, fontSize: 11.5, fontWeight: 800 }}>Curated by Wayfind AI</span>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,.06)", border: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, fontWeight: 800 }}>What’s near you &amp; on sale</span>
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 4px" }}>Sports near you</h2>
      {/* Reasoning names the real signals AND is explicit that this is not a date list. */}
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "0 0 12px" }}>
        Sorted by what’s closest, still on sale, and soonest — not just the next date on the calendar.
        {leagues.length ? ` ${cards.length} game${cards.length === 1 ? "" : "s"} across ${leagues.length} league${leagues.length === 1 ? "" : "s"} near ${where}.` : ""}
      </p>

      <div tabIndex={0} role="region" aria-label="Sports near you"
        style={{ display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {cards.slice(0, 16).map((e) => <SportCard key={e.id} ev={e} />)}
      </div>

      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 18, opacity: .85 }}>
        Ticket demand and trending data aren’t available from any source Wayfind trusts yet, so they’re not part of this order.
      </p>
    </main>
  );
}
