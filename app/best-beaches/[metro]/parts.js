"use client";
// Client islands for /beaches/[metro]: the live-conditions strip for the #1
// beach (compact — owner: richer data, fewer pixels) and the share button.
// Conditions come from /api/beach/conditions (NOAA marine + Open-Meteo + NWS
// alerts). Rip-current status is the NWS alert feed verbatim — when no
// statement is active we report the absence of advisories, never a promise of safety. Water QUALITY
// (bacteria testing) has no wired source yet, so it does not render at all.
import { useEffect, useState } from "react";

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
  const [cond, setCond] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!topBeach || !isFinite(topBeach.lat)) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/beach/conditions?lat=" + topBeach.lat + "&lng=" + topBeach.lng + "&dist=0");
        const j = r.ok ? await r.json() : null;
        if (!dead && j) setCond(j);
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, [topBeach && topBeach.id]);

  const share = async () => {
    const url = window.location.origin + "/best-beaches/" + metro;
    const data = { title: "The best beaches — " + label, text: "Every beach ranked by the Wayfind Score. One list, no ads.", url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const cc = cond && cond.conditions ? cond.conditions : {};
  const rip = cond && Array.isArray(cc.alerts) ? cc.alerts.find((a) => /rip current|beach hazard/i.test(a.event || "")) : null;
  const hasAny = cond && (isFinite(cc.waterTempF) || isFinite(cc.waveHeightFt) || isFinite(cc.uvIndexMax) || cc.alerts);

  return (
    <div>
      {topBeach && hasAny ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 14px", background: C.card, border: "1px solid " + C.border, borderRadius: 14 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: C.teal, textTransform: "uppercase", letterSpacing: ".5px", marginRight: 2 }}>{topBeach.name} · live</span>
          {isFinite(cc.waterTempF) ? <Chip label="Water" value={Math.round(cc.waterTempF) + "°"} tone={C.teal} /> : null}
          {isFinite(cc.waveHeightFt) ? <Chip label="Waves" value={cc.waveHeightFt + " ft"} /> : null}
          {isFinite(cc.uvIndexMax) ? <Chip label="UV" value={cc.uvIndexMax} tone={cc.uvIndexMax >= 8 ? C.red : undefined} /> : null}
          {rip
            ? <Chip label="Rip current" value={rip.event.replace(/ Statement$/i, "") + " active"} tone={C.red} />
            : cond && Array.isArray(cc.alerts) ? <Chip label="Rip current" value="no advisories" tone={C.green} /> : null}
        </div>
      ) : null}
      <button onClick={share} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, minHeight: 42, padding: "9px 20px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
        {copied ? "Link copied" : "Share this ranking"}
      </button>
    </div>
  );
}
