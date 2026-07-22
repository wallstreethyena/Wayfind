"use client";
// IntentPageClient — the dynamic engine behind /date-night and /family
// (owner: "pull a dynamic search when the user clicks"). Location from URL
// params (the hero cards pass them) with a wf_center fallback; queries per
// intent + daypart from lib/intentPages; results floored on real depth,
// ranked by the ONE score, rendered on the /best-beaches standard shell.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage, { RankedRow } from "./RankedExperiencePage";
import { BackControl } from "../best-beaches/[metro]/parts";
import { INTENT_PAGES, toRow, rankRows } from "../../lib/intentPages";
import { supabase } from "../../lib/supabase";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";

const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export default function IntentPageClient({ intent }) {
  const def = INTENT_PAGES[intent];
  const sp = useSearchParams();
  const [rows, setRows] = useState(null); // null = loading
  const [copied, setCopied] = useState(false);

  // THE CONTINUITY RULE (owner, 2026-07-22): the photo you clicked is the
  // photo you land on. The card passes its own photoRef via ?img= and the
  // hero NEVER repaints to a different image. Without the param (shared
  // links), heroFromList pages hold the dark shell until the list's own
  // photo is known — never another card's art in between.
  const passedRef = useMemo(() => {
    const v = sp.get("img") || "";
    return PHOTO_REF.test(v) ? v : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loc = useMemo(() => {
    let lat = parseFloat(sp.get("lat")), lng = parseFloat(sp.get("lng"));
    let city = (sp.get("city") || "").slice(0, 40);
    if (!isFinite(lat) || !isFinite(lng)) {
      try { const c = JSON.parse(localStorage.getItem("wf_center") || "null"); if (c && isFinite(c.lat)) { lat = c.lat; lng = c.lng; city = city || (c.loc || "").split(",")[0]; } } catch (e) {}
    }
    return { lat, lng, city: city || "your town" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!def || !isFinite(loc.lat)) { setRows([]); return; }
    let dead = false;
    (async () => {
      const h = new Date().getHours() + new Date().getMinutes() / 60;
      const qs = def.queries(h);
      const results = await Promise.all(qs.map(async ({ cat, q }) => {
        try {
          const u = "/api/places/search?q=" + encodeURIComponent(q) + "&lat=" + loc.lat.toFixed(2) + "&lng=" + loc.lng.toFixed(2) + "&radius=32000&n=20&cat=" + encodeURIComponent(cat);
          const r = await fetch(u);
          const j = r.ok ? await r.json() : null;
          return (j && Array.isArray(j.places) ? j.places : []).map(toRow);
        } catch (e) { return []; }
      }));
      const ranked = rankRows(results.flat(), def.floor, { origin: { lat: loc.lat, lng: loc.lng }, penalty: def.distancePenalty || null });
      // v6.56 (owner): the line under each row is WAYFIND editorial (verified
      // wf_editorial hooks, one anon in() call) — never Google's summary text.
      try {
        if (supabase && ranked.length) {
          const { data: eds } = await supabase.from("wf_editorial").select("place_id,hook").eq("verified", true).in("place_id", ranked.map((r) => r.id));
          const byId = new Map((eds || []).map((e) => [e.place_id, e.hook]));
          for (const r of ranked) r.editorial_hook = byId.get(r.id) || null;
        }
      } catch (e) {}
      if (!dead) setRows(ranked);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  if (!def) return null;
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const share = async () => {
    // THE SHARE-CARD STANDARD: the link we hand out carries the hero's real
    // photoRef, so every recipient's unfurl shows the actual top place —
    // never generic art (owner, 2026-07-22).
    let url = window.location.href;
    try {
      const u = new URL(url);
      const heroRef = passedRef || (rows && rows[0] && rows[0].photoRef) || null;
      if (heroRef && !u.searchParams.get("img")) { u.searchParams.set("img", heroRef); url = u.toString(); }
    } catch (e) {}
    try { if (navigator.share) { await navigator.share({ title: def.eyebrow + " — " + loc.city, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" />}
      eyebrow={def.eyebrow}
      titleTop={def.title(h, loc.city)}
      titleBottom={loc.city}
      subtitle={def.sub(loc.city)}
      heroImg={passedRef ? "/api/photo?ref=" + encodeURIComponent(passedRef) + "&w=800"
        : def.heroFromList ? (rows && rows[0] && rows[0].photoRef ? "/api/photo?ref=" + encodeURIComponent(rows[0].photoRef) + "&w=800" : null)
        : def.art}
      accent={def.accent}
      footNote="The Wayfind Score weighs each rating by how many people stand behind it — a 4.8 from thousands outranks a 5.0 from a handful. No ads, no paid placement. Rankings recompute as reviews grow."
    >
      <button onClick={share} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 42, padding: "9px 20px", borderRadius: 999, border: "none", background: def.accent, color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
        {copied ? "Link copied" : "Share this list"}
      </button>
      {rows === null ? (
        <div style={{ marginTop: 18 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="wf-skeleton" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}
        </div>
      ) : rows.length ? (
        <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
          {rows.map((r, i) => (
            <RankedRow key={r.id} i={i} href={"/p/" + encodeURIComponent(r.id)}
              img={r.photoRef ? "/api/photo?ref=" + encodeURIComponent(r.photoRef) + "&w=240" : null}
              title={r.name}
              score={toDisplayScore(wayfindScore(r.rating, r.reviews))}
              why={toDisplayScore(wayfindScore(r.rating, r.reviews)) + "/10 · " + r.rating + "★ · " + (r.reviews >= 1000 ? (Math.round(r.reviews / 100) / 10) + "k" : r.reviews) + " reviews" + (r.distMi != null ? " · " + (r.distMi < 10 ? r.distMi.toFixed(1) : Math.round(r.distMi)) + " mi" : "") + (r.deduction ? " — ranked lower for the drive (−" + r.deduction.toFixed(1) + ")" : "")}
              editorial={r.editorial_hook || null} />
          ))}
        </ol>
      ) : (
        <p style={{ marginTop: 18, fontSize: 13, color: "#8b93a1" }}>Nothing near you clears the bar for this list right now — that honesty is the product. Try again closer to town.</p>
      )}
    </RankedExperiencePage>
  );
}
