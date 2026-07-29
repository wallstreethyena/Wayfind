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
import { areaSeasonalContext } from "../../lib/areaSeasonalContext";
import { currentSeason } from "../../lib/seasons";
import { INTENT_PAGES, toRow, rankRows, intentEyebrow, intentTitle, intentSub, intentVariantCount } from "../../lib/intentPages";
import { track } from "../../lib/track";
import { supabase } from "../../lib/supabase";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { TRENDING_POPULARITY_THRESHOLD } from "./kit";

const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export default function IntentPageClient({ intent }) {
  const def = INTENT_PAGES[intent];
  const sp = useSearchParams();
  const [rows, setRows] = useState(null); // null = loading
  const [copied, setCopied] = useState(false);
  const [variant, setVariant] = useState(0); // 0 = canonical; SSR and first client render must agree
  // v6.71 (Wave 2): date-night/family never QUERY for beaches, but a text
  // search like "waterfront dinner sunset views" or "scenic sunset spot" can
  // still surface a real one (toRow now keeps `types`). Batched once per
  // result set, same wf_beach_water / wf_place_popularity_scored reads as
  // every other beach surface — a types false-positive just gets no rows back.
  const [beachSignals, setBeachSignals] = useState({});

  // Preserve a valid shared photo reference for link metadata, while the
  // visible landing-page hero stays locked to the matching homepage card.
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

  // v6.64: city x season editorial context for the header. Declared AFTER loc —
  // it reads loc.city, and referencing a const before its declaration is a
  // temporal-dead-zone throw, not a silent undefined. Cache-free: a hand-seeded
  // module, no fetch, no LLM, nothing in the request path.
  const areaCtx = areaSeasonalContext(loc && loc.city, currentSeason());

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
      // v6.60 (owner): every card carries an editorial line. Rows without a
      // VERIFIED hook get one written by the LLM in the Wayfind voice — the
      // same evidence-first Atlas prompt /api/blurbs already runs (shared
      // 30-day pool, so it costs nothing on a warm area). Applied to the top
      // rows; fail-soft to no line.
      try {
        const need = ranked.filter((r) => !r.editorial_hook).slice(0, 8);
        if (need.length) {
          // v6.61: never send r.editorial (Google's editorialSummary.text) into the
          // blurb model — ai_line must be grounded ONLY in curated_fact and
          // review_signals, both Wayfind-authored derivations, never Google's summary.
          // v6.63 cacheOnly: this is a RENDER PATH. It reads the shared 30-day
          // pool and never triggers generation, so a cold area costs the user
          // no latency and the row falls back to NO LINE (honest) instead of
          // waiting on a model. Warming the pool is a scheduled job's problem.
          const res = await fetch("/api/blurbs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cacheOnly: true, city: loc.city, places: need.map((r) => ({ id: r.id, name: r.name, type: r.type, rating: r.rating, reviews: r.reviews })) }) });
          const j = res.ok ? await res.json() : null;
          if (j && j.blurbs && !dead) { for (const r of ranked) { if (!r.editorial_hook && j.blurbs[r.id]) r.ai_line = j.blurbs[r.id]; } setRows([...ranked]); }
        }
      } catch (e) {}
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  useEffect(() => {
    if (!Array.isArray(rows) || !rows.length || !supabase) return;
    const ids = rows.filter((r) => ((r.types || []).join(" ")).toLowerCase().includes("beach")).map((r) => r.id);
    if (!ids.length) return;
    let dead = false;
    (async () => {
      try {
        const [{ data: water }, { data: pop }] = await Promise.all([
          supabase.from("wf_beach_water").select("beach_place_id,result,advisory,sampled_at").in("beach_place_id", ids),
          supabase.from("wf_place_popularity_scored").select("place_id,tier2_popularity").in("place_id", ids),
        ]);
        if (dead) return;
        const next = {};
        (water || []).forEach((r) => { next[r.beach_place_id] = { ...(next[r.beach_place_id] || {}), water: r }; });
        (pop || []).forEach((r) => { next[r.place_id] = { ...(next[r.place_id] || {}), popularityPct: r.tier2_popularity }; });
        setBeachSignals(next);
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, [rows]);

  // COPY ROTATION — deliberately in an effect, not in render.
  // This component is server-rendered to HTML before it hydrates, so picking a
  // variant during render would emit one headline on the server and a different
  // one on the client. That is a hydration mismatch, and on this codebase a
  // mismatch does not garble the headline — it kills the page's interactivity
  // (the 3d95dd7 outage class). Variant 0 is what SSR and the first client
  // render both produce; the rotation swaps in immediately after mount.
  //
  // Random without immediate repeat, remembered per intent, same contract as
  // lib/hooks.js pickHook for the hero cards: a returning visitor never sees the
  // same line twice running, which is the reason to reopen the page.
  useEffect(() => {
    if (!def) return;
    const n = intentVariantCount(def);
    let pick = 0;
    if (n > 1) {
      let last = -1;
      try { last = (JSON.parse(localStorage.getItem("wf_intent_copy_last") || "{}") || {})[intent]; } catch (e) {}
      pick = Math.floor(Math.random() * n);
      if (pick === last) pick = (pick + 1) % n;
      try {
        const m = JSON.parse(localStorage.getItem("wf_intent_copy_last") || "{}") || {};
        m[intent] = pick;
        localStorage.setItem("wf_intent_copy_last", JSON.stringify(m));
      } catch (e) {}
    }
    setVariant(pick);
    // The impression carries the variant so click-through can be measured per
    // line and winners promoted. Fired once per mount, after the variant is
    // decided — firing before would attribute every impression to variant 0.
    track("intent_copy_impression", { intent, variant: pick, variants: n });
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
    try { if (navigator.share) { await navigator.share({ title: intentEyebrow(def, variant) + " — " + loc.city, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" />}
      eyebrow={intentEyebrow(def, variant)}
      titleTop={intentTitle(def, h, loc.city, variant)}
      titleBottom={loc.city}
      subtitle={intentSub(def, loc.city, variant)}
      heroImg={def.art}
      accent={def.accent}
      footNote="The Wayfind Score weighs each rating by how many people stand behind it — a 4.8 from thousands outranks a 5.0 from a handful. No ads, no paid placement. Rankings recompute as reviews grow."
    >
      {areaCtx ? (
        // v6.64 AreaSeasonalContext. The seasonal header read as a weather
        // widget with a place name attached: city, then a filter explanation.
        // This is ADDITIVE and sits above the filter line, which keeps doing its
        // job (every subhead states the filter applied). Order is deliberate:
        // where you are (title) -> why this season matters HERE -> what the area
        // is known for -> what we filtered out.
        // Renders nothing when the city has no entry: an absent line is honest,
        // a generic one that fits any city is exactly what this replaces.
        <div style={{ marginBottom: 16, maxWidth: 620 }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "#C9D1D9" }}>{areaCtx.headline_context}</p>
          <p style={{ margin: "7px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "#8B949E" }}>{areaCtx.area_known_for}</p>
        </div>
      ) : null}
      <button onClick={share} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 42, padding: "9px 20px", borderRadius: 999, border: "none", background: def.accent, color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
        {copied ? "Link copied" : "Share this list"}
      </button>
      {rows === null ? (
        <div style={{ marginTop: 18 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="wf-skeleton" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}
        </div>
      ) : rows.length ? (
        <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
          {rows.map((r, i) => {
            const sig = beachSignals[r.id];
            const wq = sig && sig.water ? (sig.water.advisory ? { t: "Advisory", c: "#EF4444" } : sig.water.result === "Good" ? { t: "Water: Good", c: "#22C55E" } : sig.water.result === "Moderate" ? { t: "Water: Moderate", c: "#E8B84B" } : sig.water.result ? { t: "Water: Poor", c: "#EF4444" } : null) : null;
            const badge = sig ? (
              <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                {sig.popularityPct != null && sig.popularityPct >= TRENDING_POPULARITY_THRESHOLD ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: "#FB923C", background: "rgba(251,146,60,.12)", border: "1px solid rgba(251,146,60,.4)", borderRadius: 999, padding: "3px 9px" }}>🔥 Popular</span>
                ) : null}
                {wq ? <span style={{ fontSize: 11.5, fontWeight: 700, color: wq.c }}>🏖️ {wq.t}</span> : null}
              </span>
            ) : null;
            return (
              <RankedRow key={r.id} i={i} href={"/p/" + encodeURIComponent(r.id)}
                img={r.photoRef ? "/api/photo?ref=" + encodeURIComponent(r.photoRef) + "&w=240" : null}
                title={r.name}
                score={toDisplayScore(wayfindScore(r.rating, r.reviews))}
                why={toDisplayScore(wayfindScore(r.rating, r.reviews)) + "/10 · " + r.rating + "★ · " + (r.reviews >= 1000 ? (Math.round(r.reviews / 100) / 10) + "k" : r.reviews) + " reviews" + (r.distMi != null ? " · " + (r.distMi < 10 ? r.distMi.toFixed(1) : Math.round(r.distMi)) + " mi" : "") + (r.deduction ? " — ranked lower for the drive (−" + r.deduction.toFixed(1) + ")" : "")}
                editorial={r.editorial_hook || r.ai_line || null}
                badge={badge} />
            );
          })}
        </ol>
      ) : (
        <p style={{ marginTop: 18, fontSize: 13, color: "#8b93a1" }}>Nothing near you clears the bar for this list right now — that honesty is the product. Try again closer to town.</p>
      )}
    </RankedExperiencePage>
  );
}
