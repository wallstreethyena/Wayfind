"use client";
// Personalization (§7) — the page that rebuilds itself.
//
// THE HONESTY HINGE is `available`. orderSections() will happily order anything
// it is handed, so the integrity of this whole section rests on one rule:
// a section is available ONLY if its real data actually produced content. Not
// "the section exists", not "we intend to show it" — its assembler returned
// something. So this orchestrator runs the SAME modules the sections run, on
// the SAME endpoints, and derives availability from the result:
//
//   live-picks    rankLivePicks(events).all.length > 0
//   sports        rankSports(events).cards.length > 0
//   beach         /api/beach/conditions -> show
//   morning-picks isMorning(now, location tz)          (pure, no fetch)
//   things-to-do  buildCollections(places).length > 0
//   food          buildFoodCollections(places).length > 0
//   shopping      pickShoppingHero(places).show
//
// Nothing is stubbed true. If a probe fails, that section is unavailable and
// drops out — which is the correct outcome, not a bug.
//
// Ordering signals are real context only: location-local hour (same Open-Meteo
// tz source as §3), weekend, season, and the live weather condition. Trends,
// social, crowds and traffic are unsourced and play no part.
import { useEffect, useMemo, useState } from "react";
import { orderSections, SECTIONS } from "../../../lib/personalization.js";
import { rankLivePicks } from "../../../lib/livePicks.js";
import { rankSports } from "../../../lib/sportsRail.js";
import { buildCollections } from "../../../lib/thingsToDo.js";
import { buildFoodCollections } from "../../../lib/foodCollections.js";
import { pickShoppingHero } from "../../../lib/shopping.js";
import { isMorning } from "../../../lib/morningPicks.js";
import { siteTodayStr } from "../../../lib/siteTime.js";

import LivePicks from "../live-picks/ui";
import SportsRail from "../sports/ui";
import MorningPicks from "../morning-picks/ui";
import Beach from "../beach/ui";
import ThingsToDo from "../things-to-do/ui";
import Food from "../food/ui";
import Shopping from "../shopping/ui";

const C = { bg: "#0D1117", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316" };
const VIEW = { "live-picks": LivePicks, sports: SportsRail, "morning-picks": MorningPicks, beach: Beach, "things-to-do": ThingsToDo, food: Food, shopping: Shopping };

function seasonOf(d) { const m = d.getMonth(); return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 8 ? "summer" : "fall"; }

// The line that names WHY the page is arranged this way. Derived from the same
// context that did the arranging — never decorative copy.
function arrangementLine({ hour, isWeekend, bad }) {
  if (bad) return "Rearranged for today’s weather";
  if (hour < 11) return "Arranged for your morning";
  if (isWeekend) return "Your weekend, arranged";
  if (hour >= 17) return "Arranged for tonight";
  return "Arranged for your afternoon";
}

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

function normalizePlaces(rows) {
  return (rows || []).map((p) => ({
    place_id: p.place_id || p.id || null,
    name: (p.displayName && p.displayName.text) || p.name || "",
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: p.reviewCount ?? p.userRatingCount ?? p.reviews ?? null,
    priceLevel: p.priceLevel ?? p.price_level ?? null,
    lat: p.lat ?? (p.location && p.location.latitude) ?? null,
    lng: p.lng ?? (p.location && p.location.longitude) ?? null,
    types: Array.isArray(p.types) ? p.types : [],
    openNow: p.openNow ?? null,
  })).filter((p) => p.place_id && p.name);
}

export default function HomeV2() {
  const { center, label, state } = useCenter();
  const [probe, setProbe] = useState(null); // { tz, weather, events, places, beachShow }

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      const get = async (fn) => { try { return await fn(); } catch (e) { return null; } };
      const [wx, events, places, beach] = await Promise.all([
        get(async () => { const r = await fetch(`/api/weather?lat=${center.lat}&lng=${center.lng}`); return r.ok ? r.json() : null; }),
        get(async () => { const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: center.lat, lng: center.lng, radius: 75, city: label || "" }) }); return r.ok ? r.json() : null; }),
        get(async () => { const r = await fetch("/api/places/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "things to do restaurants shopping", lat: center.lat, lng: center.lng, radius: 50000, n: 20 }) }); return r.ok ? r.json() : null; }),
        get(async () => { const r = await fetch(`/api/beach/conditions?lat=${center.lat}&lng=${center.lng}`); return r.ok ? r.json() : null; }),
      ]);
      if (off) return;
      const cur = (wx && wx.current) || {};
      setProbe({
        tz: wx && typeof wx.timezone === "string" ? wx.timezone : null,
        condition: cur.weather_code != null ? String(cur.weather_code) : "",
        // Open-Meteo WMO codes >= 51 are drizzle/rain/snow/storm territory.
        isBad: cur.weather_code != null ? Number(cur.weather_code) >= 51 : false,
        events: (events && Array.isArray(events.events)) ? events.events : [],
        places: normalizePlaces(places && (places.places || places.results) ? (places.places || places.results) : []),
        beachShow: !!(beach && beach.show),
      });
    })();
    return () => { off = true; };
  }, [center, label]);

  const { order, ctx } = useMemo(() => {
    if (!probe || !center) return { order: null, ctx: null };
    const now = new Date();
    const tz = probe.tz || undefined;
    let hour = now.getHours();
    try { if (tz) hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).formatToParts(now).find((x) => x.type === "hour").value); } catch (e) {}
    const dow = now.getDay();
    const weather = { condition: probe.condition, isBad: probe.isBad };
    const todayStr = siteTodayStr();

    // AVAILABILITY FROM REAL DATA — never stubbed true.
    const available = {
      "live-picks": rankLivePicks(probe.events, { center, todayStr }).all.length > 0,
      sports: rankSports(probe.events, { center, todayStr }).cards.length > 0,
      beach: probe.beachShow,
      "morning-picks": isMorning(now, tz),
      "things-to-do": buildCollections(probe.places, { center }).length > 0,
      food: buildFoodCollections(probe.places, { center }).length > 0,
      shopping: pickShoppingHero(probe.places, { center }).show === true,
    };
    const c = { hour, isWeekend: dow === 0 || dow === 6, season: seasonOf(now), weather, available };
    return { order: orderSections(c), ctx: c };
  }, [probe, center]);

  const wrap = { background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };
  const head = { maxWidth: 480, margin: "0 auto", padding: "16px 14px 4px" };

  if (state === "denied" && !center) {
    return <main style={wrap}><div style={head}><p style={{ fontSize: 13.5, color: C.muted }}>Wayfind needs a location to arrange your day.</p></div></main>;
  }
  if (!order) {
    return <main style={wrap}><div style={head}><p style={{ fontSize: 13, color: C.muted }}>Arranging your day…</p></div></main>;
  }

  return (
    <main style={wrap}>
      <div style={head}>
        {/* names WHY this arrangement, from the same context that produced it */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, background: "rgba(249,115,22,.10)", border: "1px solid rgba(249,115,22,.4)" }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: C.accent }}>{arrangementLine({ hour: ctx.hour, isWeekend: ctx.isWeekend, bad: ctx.weather.isBad })}</span>
        </div>
        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: "8px 0 0" }}>
          Wayfind arranged this page around the time where you are, today’s weather and what’s actually on nearby.
          Sections with nothing real to show aren’t here at all.
        </p>
      </div>

      {order.map((id) => {
        const View = VIEW[id];
        return View ? <section key={id} data-section={id}><View /></section> : null;
      })}

      {!order.length ? (
        <div style={head}><p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55 }}>Nothing near you has enough real data to show right now. Try a different location.</p></div>
      ) : null}

      <div style={{ ...head, paddingTop: 18, paddingBottom: 28 }}>
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, opacity: .85 }}>
          Order is decided by the local time, the day, the season and live weather — plus whether each section’s own
          data returned anything. Wayfind has no trending, social, crowd or traffic data, so none of it influences
          this page. {SECTIONS.length - order.length} section{SECTIONS.length - order.length === 1 ? "" : "s"} hidden today.
        </p>
      </div>
    </main>
  );
}
