"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "../components/RankedExperiencePage";
import SummerPicksRails from "../components/SummerPicksRails";
import { RailDevError, RailMascotBusy } from "../components/kit.js";
import { emitRailDegraded, fetchRailJson, isRailCancelled, railDeveloperFailure } from "../../lib/railFailure.js";
import { originForCity } from "../../lib/locationHonesty.js";
import { homeAffiliateActivities } from "../../lib/homeAffiliateActivities.js";
import { composeSummerPickRails } from "../../lib/summerPicks.js";

const LOAD_TIMEOUT_MS = 10000;

export default function SummerPicksClient() {
  const sp = useSearchParams();
  const city = String(sp.get("city") || "").slice(0, 48);
  const queryLat = Number.parseFloat(sp.get("lat") || "");
  const queryLng = Number.parseFloat(sp.get("lng") || "");
  const cityOrigin = originForCity(city);
  const initial = Number.isFinite(queryLat) && Number.isFinite(queryLng) ? { lat: queryLat, lng: queryLng } : cityOrigin;
  const [center, setCenter] = useState(initial || null);
  const [rails, setRails] = useState(null);
  const [failure, setFailure] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (center) return;
    try {
      const stored = JSON.parse(localStorage.getItem("wf_center") || "null");
      if (stored && Number.isFinite(stored.lat) && Number.isFinite(stored.lng)) setCenter({ lat: stored.lat, lng: stored.lng });
    } catch {}
  }, [center]);

  const key = useMemo(() => center ? `${center.lat.toFixed(2)}|${center.lng.toFixed(2)}|${retry}` : "", [center, retry]);
  useEffect(() => {
    if (!key || !center) return;
    let cancelled = false;
    const controller = new AbortController();
    setFailure(null);
    setRails(null);
    const location = { lat: center.lat.toFixed(2), lng: center.lng.toFixed(2) };
    const summerQ = new URLSearchParams(location);
    const tourQ = new URLSearchParams({ ...location, mi: "120", cat: "all", limit: "100", page: "0" });
    Promise.allSettled([
      fetchRailJson("/api/summer/places?" + summerQ.toString(), { timeoutMs: LOAD_TIMEOUT_MS, signal: controller.signal }),
      fetchRailJson("/api/experiences?" + tourQ.toString(), { timeoutMs: LOAD_TIMEOUT_MS, signal: controller.signal }),
    ]).then((results) => {
      if (cancelled) return;
      const summer = results[0].status === "fulfilled" ? results[0].value : null;
      const experiences = results[1].status === "fulfilled" ? results[1].value : null;
      const problems = [];
      if (results[0].status === "rejected" && !isRailCancelled(results[0].reason)) problems.push(results[0].reason);
      if (results[1].status === "rejected" && !isRailCancelled(results[1].reason)) problems.push(results[1].reason);
      if (results[0].status === "fulfilled" && !Array.isArray(summer?.places)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/summer/places" }));
      if (results[1].status === "fulfilled" && !Array.isArray(experiences?.items)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/experiences" }));
      for (const problem of problems) if (problem?.kind === "developer") console.error("[SummerPicksClient] request contract failure", problem);
      const placeMap = new Map();
      for (const place of Array.isArray(summer?.places) ? summer.places : []) placeMap.set(place.id, place);
      const tours = homeAffiliateActivities(Array.isArray(experiences?.items) ? experiences.items : [], 100);
      const composed = composeSummerPickRails([...placeMap.values()], tours);
      if (composed.some((rail) => rail.cards.length > 0)) { setRails(composed); return; }
      if (!problems.length) { setRails([]); return; }
      setFailure(problems.find((problem) => problem?.kind === "developer") || problems[0]);
    }).catch((error) => {
      if (cancelled || isRailCancelled(error)) return;
      console.error("[SummerPicksClient] aggregation failure", error);
      setFailure(railDeveloperFailure("aggregation_failure", { route: "/summer-picks", cause: error }));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [key]);

  const headingCity = city || "Florida";
  return <RankedExperiencePage
    eyebrow="WAYFIND SUMMER PICKS"
    titleTop="Your best"
    titleBottom="Florida summer"
    subtitle={`Ten ranked ways to handle heat, rain, school break and vacation mode around ${headingCity}. Real place photos, current Wayfind inventory and verified bookable activities only.`}
    heroImg="/cards/best-summer-ever.jpg"
    location={headingCity}
    imageKicker="BEST SUMMER EVER"
    imageTitle="Water first. Rain plan ready. Every card earns the stop."
    dekLead="Pick the summer need."
    trustLines={["Places rank on evidence, not payment.", "Viator links are affiliate links; Wayfind may earn a commission at no extra cost to you."]}
    topLeft={<a href="/" style={{ color: "#F97316", textDecoration: "none", fontWeight: 800 }}>← Wayfind</a>}
  >
    {!center ? <div style={{ padding: "18px", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, color: "#A8B0BE" }}>Open Summer Picks from the Wayfind homepage so your location can rank the rails.</div> : null}
    {center && !rails && !failure ? <div role="status" aria-busy="true" aria-label="Ranking Florida summer picks">{[0, 1, 2].map((n) => <div key={n} className="wf-sk" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />)}</div> : null}
    {failure ? (failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="summer-picks" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "summer-picks" }); }} />) : null}
    {Array.isArray(rails) && rails.length === 0 ? <div style={{ color: "#A8B0BE" }}>No summer picks are available yet for this area. Try another location or come back soon.</div> : null}
    {Array.isArray(rails) && rails.length > 0 ? <SummerPicksRails rails={rails} city={headingCity} /> : null}
  </RankedExperiencePage>;
}
