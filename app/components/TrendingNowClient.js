"use client";
// TrendingNowClient — the page behind the "Trending near you" hero (owner:
// the card must open a RANKED page of the top picks, not one detail sheet).
// Real tier-2 popularity via wf_buzz_picks; each row's editorial line is
// written by the built-in LLM in the Wayfind voice (/api/buzz/why, shared
// 1-day pool). Same /best-beaches standard shell, same honest gating: it
// shows only places carrying real popularity signals.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage, { RankedRow } from "./RankedExperiencePage";
import { BackControl } from "../best-beaches/[metro]/parts";
import { supabase } from "../../lib/supabase";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";

const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export default function TrendingNowClient() {
  const sp = useSearchParams();
  const [rows, setRows] = useState(null); // null = loading
  const [copied, setCopied] = useState(false);

  const passedRef = useMemo(() => { const v = sp.get("img") || ""; return PHOTO_REF.test(v) ? v : null; /* eslint-disable-next-line */ }, []);
  const loc = useMemo(() => {
    let lat = parseFloat(sp.get("lat")), lng = parseFloat(sp.get("lng"));
    let city = (sp.get("city") || "").slice(0, 40);
    if (!isFinite(lat) || !isFinite(lng)) {
      try { const c = JSON.parse(localStorage.getItem("wf_center") || "null"); if (c && isFinite(c.lat)) { lat = c.lat; lng = c.lng; city = city || (c.loc || "").split(",")[0]; } } catch (e) {}
    }
    return { lat, lng, city: city || "your area" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!supabase || !isFinite(loc.lat)) { setRows([]); return; }
    let dead = false;
    (async () => {
      let picks = [];
      try {
        const { data } = await supabase.rpc("wf_buzz_picks", { p_lat: loc.lat, p_lng: loc.lng, p_radius_mi: 25, p_max: 12 });
        picks = (Array.isArray(data) ? data : []).filter((r) => (r.sources_count || 0) >= 1);
      } catch (e) {}
      // Editorial in the Wayfind voice — one cached call per pick. Fail-soft:
      // a pick with no honest line falls back to a data-templated one.
      const withWhy = await Promise.all(picks.map(async (p) => {
        let line = null;
        try {
          const r = await fetch("/api/buzz/why", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ place_id: p.place_id, name: p.name, category: p.category, city: loc.city, rating: p.rating, reviews: p.reviews, popularity: p.popularity, sources_count: p.sources_count, by_source: p.by_source, freshest: p.freshest }) });
          const j = r.ok ? await r.json() : null; line = j && j.line ? j.line : null;
        } catch (e) {}
        return { ...p, why: line };
      }));
      if (!dead) setRows(withWhy);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heroImg = passedRef ? "/api/photo?ref=" + encodeURIComponent(passedRef) + "&w=800"
    : (rows && rows[0] && rows[0].photo_ref ? "/api/photo?ref=" + encodeURIComponent(rows[0].photo_ref) + "&w=800" : null);

  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) { await navigator.share({ title: "Trending near " + loc.city, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" />}
      eyebrow="Trending near you"
      titleTop="What's drawing people"
      titleBottom={loc.city}
      subtitle={"The places near " + loc.city + " getting the most attention right now — measured by real signals, ranked by the Wayfind Score."}
      heroImg={heroImg}
      accent="#FF6B6B"
      footNote="Trending is measured from real popularity signals (search interest and cross-platform attention), never door counts or paid placement. The Wayfind Score stays the same for everyone."
    >
      <button onClick={share} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 42, padding: "9px 20px", borderRadius: 999, border: "none", background: "#FF6B6B", color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
        {copied ? "Link copied" : "Share what's trending"}
      </button>
      {rows === null ? (
        <div style={{ marginTop: 18 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="wf-skeleton" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}</div>
      ) : rows.length ? (
        <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
          {rows.map((r, i) => (
            <RankedRow key={r.place_id} i={i} href={"/p/" + encodeURIComponent(r.place_id)}
              img={r.photo_ref ? "/api/photo?ref=" + encodeURIComponent(r.photo_ref) + "&w=240" : null}
              title={r.name}
              score={r.rating > 0 ? toDisplayScore(wayfindScore(r.rating, r.reviews)) : null}
              why={(r.distance_mi != null ? (r.distance_mi < 10 ? r.distance_mi.toFixed(1) : Math.round(r.distance_mi)) + " mi" : "") + (r.reviews ? " · " + (r.reviews >= 1000 ? (Math.round(r.reviews / 100) / 10) + "k" : r.reviews) + " reviews" : "")}
              editorial={r.why || (r.sources_count > 1 ? "Drawing attention across " + r.sources_count + " signals this week." : "More people are looking this up than usual.")} />
          ))}
        </ol>
      ) : (
        <p style={{ marginTop: 18, fontSize: 13, color: "#8b93a1" }}>Nothing is trending near you yet — the signal builds as the popularity engine gathers data. Check back soon.</p>
      )}
    </RankedExperiencePage>
  );
}
