"use client";
// Client islands for /beaches/[metro]: the live-conditions strip for the #1
// beach (compact — owner: richer data, fewer pixels) and the share button.
// Conditions come from /api/beach/conditions (NOAA marine + Open-Meteo + NWS
// alerts). Rip-current status is the NWS alert feed verbatim — when no
// statement is active we report the absence of advisories, never a promise of safety. Water QUALITY
// (bacteria testing) has no wired source yet, so it does not render at all.
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

const C = { card: "#0B0E15", border: "rgba(255,255,255,.08)", text: "#F1F5F9", muted: "#8b93a1", accent: "#F97316", teal: "#2DD4BF", red: "#EF6A5A", green: "#3ee08a" };

function Chip({ label, value, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, padding: "6px 11px", borderRadius: 999, background: "rgba(255,255,255,.04)", border: "1px solid " + C.border, fontSize: 12, whiteSpace: "nowrap" }}>
      <span style={{ color: C.muted, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</span>
      <span style={{ color: tone || C.text, fontWeight: 800 }}>{value}</span>
    </span>
  );
}

export default function BeachPageClient({ topBeach, metro, label }) {
  const [copied, setCopied] = useState(false);


  const share = async () => {
    const url = window.location.origin + "/best-beaches/" + metro;
    const data = { title: "The best beaches — " + label, text: "Every beach ranked by the Wayfind Score. One list, no ads.", url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };


  return (
    <div>
      {/* v6.54 (spec 2): the number-one-only strip is gone; every beach row
          renders its own live chips (BeachLiveChips); rip-current and UV
          chips removed entirely (product decision). */}
      <button onClick={share} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, minHeight: 42, padding: "9px 20px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
        {copied ? "Link copied" : "Share this ranking"}
      </button>
    </div>
  );
}


// Per-beach live chips (spec §2): OWN water temp + wind per entry, plus the
// FL Healthy Beaches result from wf_beach_water when a station is mapped.
// Freshness is always shown; stale (>7d water test) renders as "last known".
export function BeachLiveChips({ id, lat, lng }) {
  const [lite, setLite] = useState(null);
  const [water, setWater] = useState(null);
  useEffect(() => {
    if (!isFinite(lat)) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/beach/conditions?mode=lite&lat=" + lat + "&lng=" + lng);
        const j = r.ok ? await r.json() : null;
        if (!dead && j && !j.none) setLite(j);
      } catch (e) {}
      try {
        if (supabase && id) {
          const { data } = await supabase.from("wf_beach_water").select("result,advisory,sampled_at").eq("beach_place_id", id).maybeSingle();
          if (!dead && data) setWater(data);
        }
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, [id, lat, lng]);
  if (!lite && !water) return <div style={{ minHeight: 26, marginTop: 6 }} />;
  const fmtDay = (d) => { try { const x = new Date(d + "T12:00:00"); return x.toLocaleDateString([], { month: "short", day: "numeric" }); } catch { return d; } };
  const stale = water && (Date.now() - new Date(water.sampled_at).getTime() > 7 * 86400000);
  const wq = water ? (water.advisory ? { t: "Advisory — check before swimming", c: C.red } : water.result === "Good" ? { t: "Good", c: C.green } : water.result === "Moderate" ? { t: "Moderate", c: "#E8B84B" } : { t: "Poor", c: C.red }) : null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, minHeight: 26 }}>
      {lite && isFinite(lite.waterTempF) ? <Chip label="Water" value={Math.round(lite.waterTempF) + "°"} tone={C.teal} /> : null}
      {lite && isFinite(lite.windMph) ? <Chip label="Wind" value={lite.windMph + " mph " + (lite.windDir || "")} /> : null}
      {lite && isFinite(lite.waveHeightFt) ? <Chip label="Waves" value={lite.waveHeightFt + " ft"} /> : null}
      {wq ? <Chip label={"Water quality" + (stale ? " (last known)" : "")} value={wq.t + " · tested " + fmtDay(water.sampled_at)} tone={wq.c} /> : null}
      {/* FWC red tide (v6.55): FWC's own category, with sample date + distance.
          No sample within 10 mi → no chip. Never a guess. */}
      {lite && lite.redTide ? <Chip label="Red tide" value={lite.redTide.label + (lite.redTide.sampledAt ? " · tested " + fmtDay(lite.redTide.sampledAt) : "") + " · " + lite.redTide.mi + " mi"} tone={lite.redTide.tone === "bad" ? C.red : lite.redTide.tone === "warn" ? "#E8B84B" : C.green} /> : null}
    </div>
  );
}

// Back control (spec §3): history when it exists, parent fallback otherwise;
// sticky and quiet. Never ejects off-site — the fallback is always ours.
export function BackControl({ fallback }) {
  const go = () => {
    try {
      const sameOrigin = document.referrer && new URL(document.referrer).origin === window.location.origin;
      if (window.history.length > 1 && sameOrigin) { window.history.back(); return; }
    } catch (e) {}
    window.location.assign(fallback || "/");
  };
  return (
    <button onClick={go} aria-label="Back" style={{ position: "sticky", top: 10, zIndex: 40, marginLeft: 14, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", background: "rgba(4,8,16,.55)", color: "#F1F5F9", fontSize: 13, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(6px)" }}>← Back</button>
  );
}
