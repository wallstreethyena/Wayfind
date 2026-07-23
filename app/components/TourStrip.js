"use client";
// TourStrip — bookable Viator experiences, rendered CLIENT-SIDE (owner build
// order #4). The SSR/build-time read of wf_experiences returned empty (the
// service key is absent at prerender; even the anon read failed to bake in),
// so these revenue strips were silently dark. /api/experiences works at
// runtime (proven by the homepage card), so we fetch there. product_url is
// rendered VERBATIM (its mcid+pid intact); a link without pid= never ships.
import { useEffect, useState } from "react";
import { wayfindScore } from "../../lib/google";
import { toDisplayScore } from "../../lib/score";

const WATER = /beach|dolphin|kayak|snorkel|boat|sail|paddle|jet ski|parasail|cruise|water|manatee|sunset/i;

export default function TourStrip({ lat, lng, title, subtitle, waterOnly }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!isFinite(lat)) { setItems([]); return; }
    let dead = false;
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), mi: "60", cat: "all", limit: "12", page: "0" });
    fetch("/api/experiences?" + q.toString()).then((r) => (r.ok ? r.json() : null), () => null).then((res) => {
      if (dead) return;
      let arr = (res && Array.isArray(res.items) ? res.items : []).filter((t) => t && t.url && /pid=/.test(t.url) && t.image);
      if (waterOnly) arr = arr.filter((t) => WATER.test(t.title || ""));
      const seen = new Set();
      arr = arr.filter((t) => { const k = (t.title || "").toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (Number(!!b.sellingOut) - Number(!!a.sellingOut)) || ((b.reviews || 0) - (a.reviews || 0))).slice(0, 4);
      setItems(arr);
    });
    return () => { dead = true; };
  }, [lat, lng, waterOnly]);
  if (items === null || items.length < 2) return null;
  return (
    <section style={{ background: "#0B0E15", border: "1px solid #1F2937", borderRadius: 16, padding: "16px 18px", margin: "24px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 10, color: "#8B93A1" }}>via Viator</span>
      </div>
      {subtitle ? <p style={{ fontSize: 12.5, color: "#8B93A1", margin: "0 0 12px" }}>{subtitle}</p> : <div style={{ height: 8 }} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {items.map((t) => (
          <a key={t.code || t.url} href={t.url} target="_blank" rel="noopener sponsored nofollow" style={{ background: "#10141d", border: "1px solid #1F2937", borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
            <img src={t.image} alt="" loading="lazy" style={{ width: "100%", height: 92, objectFit: "cover", display: "block" }} />
            <div style={{ padding: "9px 11px 11px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: "#F1F5F9", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 4 }}>
                {t.rating > 0 && t.reviews > 0 ? <span style={{ fontSize: 13, fontWeight: 800, color: "#3ee08a" }}>{toDisplayScore(wayfindScore(t.rating, t.reviews))}</span> : <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8B93A1" }}>New</span>}
                <span style={{ fontSize: 11, color: "#8B93A1" }}>{t.fromPrice != null ? "from $" + t.fromPrice : ""}</span>
              </div>
              <div style={{ marginTop: 8, display: "inline-block", background: "#C9A961", color: "#0D1117", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 800 }}>Book ↗</div>
            </div>
          </a>
        ))}
      </div>
      <p style={{ fontSize: 10, color: "#8B93A1", marginTop: 8 }}>Wayfind may earn a commission when you book through these links, at no extra cost to you. It never changes our rankings.</p>
    </section>
  );
}
