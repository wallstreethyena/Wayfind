"use client";
// TourStrip — bookable Viator experiences, rendered CLIENT-SIDE (owner build
// order #4). The SSR/build-time read of wf_experiences returned empty (the
// service key is absent at prerender; even the anon read failed to bake in),
// so these revenue strips were silently dark. /api/experiences works at
// runtime (proven by the homepage card), so we fetch there.
//
// 2026-08-04 — THE HREF NO LONGER CARRIES THE PARTNER URL. This rendered
// `href={t.url}`: the raw viator.com product link with `pid=P00308545` readable
// in view-source, on three live surfaces — /things-to-do/[city] and
// /beaches/[city] (both via lib/landing.js) and /best-beaches/[metro]. Four
// were sitting in the DOM of /things-to-do/parrish when this was found.
//
// Same shape that produced ~144 CJ clicks/day against ~50 human visitors on the
// deals rail before that rail moved behind /api/commerce/go: a crawler that
// renders JS and follows the link IS a billable partner click, and sustained 0%
// conversion on automated clicks is account risk, not noise.
//
// WHY THE EXISTING GUARD MISSED IT. check-direct-affiliate-urls DOES walk
// app/components — but it matches LITERAL partner URLs in source, and this URL
// arrives at runtime in a variable. The guard was structurally blind to this
// class; only a DOM check finds it. check-tour-strip-redirect now asserts, by
// rendering the component, that no partner host can reach the markup.
//
// The pid is not lost: /api/commerce/go re-applies withViatorTracking
// server-side (PROVIDERS.viator), so attribution is identical and the handoff
// is ours.
import { useEffect, useState } from "react";
import { wayfindScore } from "../../lib/google";
import { toDisplayScore } from "../../lib/score";
import { isPerfectScore } from "../../lib/lawfulOrder";
import { rankExperiences } from "../../lib/experiencesData";
import { commerceHref } from "../../lib/commerce";

const WATER = /beach|dolphin|kayak|snorkel|boat|sail|paddle|jet ski|parasail|cruise|water|manatee|sunset/i;

/**
 * THE href for a strip card. Exported so a guard can CALL it.
 *
 * The row carries `url` — the raw viator.com product link with a live pid. That
 * value must never reach an href (see the header comment); this is the single
 * decision point that converts it into our own redirect, and returning null
 * when there is no offer id is what stops a caller falling back to `t.url`.
 *
 * It is exported rather than inlined because the leak it replaces was invisible
 * to source scanning, and rendering the component in a guard cannot reach the
 * card markup at all — the rows arrive from a useEffect fetch, which does not
 * run under renderToStaticMarkup. A guard that "rendered" the component would
 * inspect an empty string and report success. Calling this is the real check.
 */
export function tourHref(t) {
  const code = t && t.code ? String(t.code).trim() : "";
  if (!code) return null;
  return commerceHref({ provider: "viator", offerId: code, surface: "tour_strip", contentId: code });
}

export default function TourStrip({ lat, lng, title, subtitle, waterOnly }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!isFinite(lat)) { setItems([]); return; }
    let dead = false;
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), mi: "60", cat: "all", limit: "12", page: "0" });
    fetch("/api/experiences?" + q.toString()).then((r) => (r.ok ? r.json() : null), () => null).then((res) => {
      if (dead) return;
      // `t.code` is now REQUIRED, because it is what the redirect resolves —
      // a row without one cannot be linked at all, and the honest answer is to
      // drop it rather than fall back to the raw partner URL. The pid check on
      // the stored URL is kept as a completeness signal on the row itself, not
      // because that URL is ever rendered.
      let arr = (res && Array.isArray(res.items) ? res.items : []).filter((t) => t && t.url && /pid=/.test(t.url) && t.image && t.code);
      if (waterOnly) arr = arr.filter((t) => WATER.test(t.title || ""));
      const seen = new Set();
      arr = rankExperiences(arr.filter((t) => { const k = (t.title || "").toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })).slice(0, 4);
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
        {items.map((t) => {
          const href = tourHref(t);
          if (!href) return null; // no offer id, no link — never the raw partner URL
          return (
          <a key={t.code} href={href} target="_blank" rel="noopener sponsored nofollow" style={{ background: "#10141d", border: "1px solid #1F2937", borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
            <img src={t.image} alt="" loading="lazy" style={{ width: "100%", height: 92, objectFit: "cover", display: "block" }} />
            <div style={{ padding: "9px 11px 11px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: "#F1F5F9", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 4 }}>
                {t.rating > 0 && t.reviews > 0 ? (() => { const s = toDisplayScore(wayfindScore(t.rating, t.reviews)); return <span style={{ fontSize: 13, fontWeight: 800, color: "#3ee08a" }}>{s}{isPerfectScore(s) ? " \u{1F525}" : ""}</span>; })() : <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8B93A1" }}>New</span>}
                <span style={{ fontSize: 11, color: "#8B93A1" }}>{t.fromPrice != null ? "from $" + t.fromPrice : ""}</span>
              </div>
              <div style={{ marginTop: 8, display: "inline-block", background: "#F97316", color: "#0D1117", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 800 }}>Book ↗</div>
            </div>
          </a>
          );
        })}
      </div>
      <p style={{ fontSize: 10, color: "#8B93A1", marginTop: 8 }}>Wayfind may earn a commission when you book through these links, at no extra cost to you. It never changes our rankings.</p>
    </section>
  );
}
