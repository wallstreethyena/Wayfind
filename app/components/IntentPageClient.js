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
import { INTENT_PAGES, toRow, rankRows, intentEyebrow, intentTitle, intentSub, intentVariantCount, nowSubline, INTENT_COUPON_BADGE, INTENT_HAS_TOURS, INTENT_MOMENT_ID } from "../../lib/intentPages";
// v6.72 THE COMPOSITION (owner, 2026-07-31). The five blocks — coupon strip,
// tour rail, "Perfect right now", the list, the methodology line — are ONE
// component shared with app/components/screens/Experience.js, the reference
// sheet. This page keeps its SHELL (dark chrome, serif headline, back button)
// and adopts that CONTENT COMPOSITION inside it: shell from one, body from
// the other. Nothing here re-implements a block.
import { CouponStrip, PerfectRightNow, Methodology } from "./ExperienceBlocks";
import ViatorRail from "./ViatorRail";
// v6.72: this component had ZERO weather references. Its header rendered
// areaSeasonalContext(city, season) — season and place, never time, never
// weather — while `h` chose a query set and touched nothing else. Both halves
// now come from ONE source: nowContext decides the bucket and the outdoor gate,
// rankRows enforces the gate and reweights, and nowSubline states why.
import { nowContext } from "../../lib/nowContext";
import { track } from "../../lib/track";
import { supabase } from "../../lib/supabase";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { TRENDING_POPULARITY_THRESHOLD } from "./kit";
import { canonicalShareUrl } from "../../lib/site";

const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

// The one context the server and the first client render can agree on: a fixed
// hour, no weather. Module-level and frozen so it is byte-identical on both
// sides. Nothing derived from it may claim a weather condition — with
// weather.known false, nowContext's copy branches say only what the hour is for.
const SSR_CTX = Object.freeze(nowContext({ hour: 12, weather: null }));

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
  // v6.72 composition data. Both start null and STAY null on any failure, which
  // is what makes "degrade honestly" real: the rail and the picks block render
  // nothing rather than an empty shell.
  const [tours, setTours] = useState(null);
  const [momentPicks, setMomentPicks] = useState(null);

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

  // ── TIME + WEATHER (v6.72) ─────────────────────────────────────────────────
  // `now` is held in STATE and set in an effect, never computed during render.
  // Same reason the copy rotation below is in an effect: this component is
  // server-rendered to HTML before it hydrates, and a value derived from the
  // clock or from a client-only fetch differs between the two renders. On this
  // codebase a hydration mismatch does not garble one line — it takes the
  // page's interactivity down (the 3d95dd7 outage class). SSR_CTX is what both
  // the server and the first client render produce; the real context swaps in
  // immediately after mount.
  //
  // NOTE this also fixes a pre-existing hazard: intentTitle() was already being
  // called with a render-time hour, and /date-night's variant-0 title branches
  // on it, so the server and client could disagree across a bucket edge.
  const [now, setNow] = useState(null);
  const [weather, setWeather] = useState(null);

  // ?hour= is the simulation hook the three-bucket verification runs on. It is
  // read ONLY here, client-side, and only ever feeds nowContext — it cannot
  // reach a query string, a fetch, or the DOM. Out-of-range values are ignored
  // by nowContext's own normalisation.
  const hourOverride = useMemo(() => {
    const v = parseFloat(sp.get("hour"));
    return Number.isFinite(v) ? v : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Weather first — /api/weather is the existing keyless Open-Meteo proxy, and
  // nowContext takes the raw payload shape directly. Fails soft: on any error
  // the context keeps weather.known === false, which leaves outdoorOK TRUE. A
  // failed fetch must never suppress every outdoor place in the market.
  useEffect(() => {
    if (!isFinite(loc.lat)) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/weather?lat=" + loc.lat.toFixed(2) + "&lng=" + loc.lng.toFixed(2));
        const j = r.ok ? await r.json() : null;
        if (!dead && j) setWeather(j);
      } catch (e) {}
      finally { if (!dead) setWeatherSettled(true); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Distinguishes "weather has not arrived yet" from "weather came back empty".
  // Without it the list would fire once ungated and again gated, and the user
  // would watch outdoor rows appear and then vanish.
  const [weatherSettled, setWeatherSettled] = useState(false);

  useEffect(() => {
    if (!weatherSettled) return;
    setNow(nowContext({ lat: loc.lat, lng: loc.lng, city: loc.city, weather, hour: hourOverride }));
    // Re-bucket on the hour boundary rather than on an interval: a page left
    // open across 17:30 should become the evening list without a reload.
    const id = setInterval(() => {
      setNow(nowContext({ lat: loc.lat, lng: loc.lng, city: loc.city, weather, hour: hourOverride }));
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather, weatherSettled, hourOverride]);

  useEffect(() => {
    if (!def || !isFinite(loc.lat)) { setRows([]); return; }
    // Wait for the context. Querying before it exists would fire the ungated
    // query bank and then re-fire the gated one — the user watches beach rows
    // appear during a heat advisory and then disappear, which is worse than a
    // beat of loading.
    if (!now) return;
    let dead = false;
    (async () => {
      const qs = def.queries(now);
      const results = await Promise.all(qs.map(async ({ cat, q }) => {
        try {
          const u = "/api/places/search?q=" + encodeURIComponent(q) + "&lat=" + loc.lat.toFixed(2) + "&lng=" + loc.lng.toFixed(2) + "&radius=32000&n=20&cat=" + encodeURIComponent(cat);
          const r = await fetch(u);
          const j = r.ok ? await r.json() : null;
          return (j && Array.isArray(j.places) ? j.places : []).map(toRow);
        } catch (e) { return []; }
      }));
      // ctx is what makes this ranking time-aware rather than just time-queried:
      // it applies the outdoor suppression gate, the per-bucket reweight, and
      // the open-now / minutes-to-close multiplier. `timeless` pages (/best-of)
      // pass null and keep the pure-quality order their copy promises.
      const ranked = rankRows(results.flat(), def.floor, {
        origin: { lat: loc.lat, lng: loc.lng },
        penalty: def.distancePenalty || null,
        ctx: def.timeless ? null : now,
      });
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
    // `now` IS a dependency and leaving it out is not a style question: the
    // effect returns early while the context is still null (it waits for
    // weather so the gated and ungated lists do not both render), so without
    // `now` here it never re-runs and the page sits in its loading skeleton
    // forever. That is exactly what shipped in the first draft of this change,
    // and no test caught it — only loading the page did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, now]);

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

  // ── BLOCK 2: bookable tours ────────────────────────────────────────────────
  // Same /api/viator/tours endpoint the in-app rails use. Only fires for the
  // intents that actually carry tour inventory (INTENT_HAS_TOURS), so /best-of
  // and /budget never pay for a call whose result they would not render.
  useEffect(() => {
    if (!INTENT_HAS_TOURS[intent] || !isFinite(loc.lat)) return;
    let dead = false;
    (async () => {
      try {
        const q = (loc.city && loc.city !== "your town") ? loc.city : "";
        if (!q) return; // no city, no honest query — skip rather than guess
        const r = await fetch("/api/viator/tours?q=" + encodeURIComponent(q) + "&count=12");
        const j = r.ok ? await r.json() : null;
        const items = (j && Array.isArray(j.tours)) ? j.tours : (Array.isArray(j) ? j : []);
        if (!dead && items.length) setTours(items);
      } catch (e) {}
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  // ── BLOCK 3: "Perfect right now" ───────────────────────────────────────────
  // Runs AFTER the list, because the picks are an interpretation OF the list:
  // the route reasons over candidates we already ranked and returns id + why.
  // Needs >=3 candidates (the route returns a no-match envelope below that),
  // and the whole block is absent on any failure.
  useEffect(() => {
    const mid = INTENT_MOMENT_ID[intent];
    if (!mid || !Array.isArray(rows) || rows.length < 3 || !now) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/moment/picks", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: mid,
            city: loc.city,
            // The weather + time buckets are the cache key on the route, so they
            // come from nowContext — the same source that chose the query set
            // and gated the list. A different bucketing here would split the
            // cache and describe a moment the list is not showing.
            wx: now.weather.known ? ((now.weather.condition || (now.weather.isWet ? "wet" : "clear")) + "-" + Math.round(now.weather.tempF ?? 0)) : "",
            tb: now.dayName.slice(0, 3).toLowerCase() + "-" + now.timeBucket,
            candidates: rows.slice(0, 12).map((x) => ({ id: x.id, name: x.name, rating: x.rating, reviews: x.reviews, distMi: x.distMi })),
          }),
        });
        const j = r.ok ? await r.json() : null;
        if (!dead && j && Array.isArray(j.picks) && j.picks.length) setMomentPicks(j.picks);
      } catch (e) {}
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, intent]);

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
  // SSR_CTX is the deterministic context the server and the FIRST client render
  // both produce — noon, no weather, so no gate and no weather claim. `now`
  // replaces it immediately after mount. Never inline `new Date()` here: that is
  // precisely the hydration mismatch the copy-rotation comment above describes,
  // and /date-night's variant-0 title branches on the bucket.
  const titleCtx = now || SSR_CTX;
  // The why-line. Rendered only once the real context exists, so the server
  // never emits a weather claim it cannot stand behind.
  const whyLine = now ? nowSubline(def, now, loc.city) : null;
  const share = async () => {
    // THE SHARE-CARD STANDARD: the link we hand out carries the hero's real
    // photoRef, so every recipient's unfurl shows the actual top place —
    // never generic art (owner, 2026-07-22).
    // canonicalShareUrl, never the raw window origin: a dev server or a Vercel
    // preview would otherwise put an unopenable host into a real thread.
    let url = canonicalShareUrl(window.location.href);
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
      titleTop={intentTitle(def, titleCtx, loc.city, variant)}
      titleBottom={loc.city}
      subtitle={intentSub(def, loc.city, variant)}
      heroImg={def.art}
      accent={def.accent}
      footNote="The Wayfind Score weighs each rating by how many people stand behind it — a 4.8 from thousands outranks a 5.0 from a handful. No ads, no paid placement. Rankings recompute as reviews grow."
    >
      {whyLine ? (
        // v6.72 THE WHY-LINE (owner: "the headline must say why").
        //
        // This states the three things that produced this exact list: the time
        // bucket, the outdoor gate, and the evidence that opened or closed it —
        // "Afternoon picks near Orlando — indoors, because it is 96° and there
        // is a heat advisory". Never generic: nowReason has no catch-all
        // branch, and a `timeless` page returns null here rather than printing
        // a weather claim its own subhead denies.
        //
        // It sits ABOVE the seasonal context and the filter subhead, because it
        // is the most volatile and most decision-relevant of the three:
        // why NOW (this line) -> why HERE this season -> what we filtered out.
        //
        // The claim is bound to the code: the "indoors" half is emitted from
        // the same ctx.outdoorOK that rankRows suppresses outdoor rows on, so
        // the line cannot describe a filter that did not run.
        <div style={{ marginBottom: 14, maxWidth: 620, display: "flex", alignItems: "baseline", gap: 9 }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: def.accent, flex: "0 0 auto", transform: "translateY(-2px)" }} />
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "#E6EDF3", fontWeight: 600 }}>{whyLine}</p>
        </div>
      ) : null}
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

      {/* ══ THE SHARED COMPOSITION (v6.72) ══════════════════════════════════
          Blocks 1, 2, 3 and 5 are the SAME components app/components/screens/
          Experience.js renders — imported, not copied. The order is
          monetization-first and is owned by that file, not by this one:
            1 coupon strip -> 2 bookable rail -> 3 reasoned picks -> 4 list -> 5 method
          Block 4 (the list) stays this page's RankedRow for now; see the row-seam
          note in ExperienceBlocks.js for why PlaceCard cannot cross the module
          boundary yet.
          Every block degrades to ABSENT, never to a placeholder. */}
      <div style={{ marginTop: 18 }}>
        <CouponStrip
          intentId={INTENT_COUPON_BADGE[intent]}
          lat={loc.lat} lng={loc.lng}
          onOpenCoupons={() => { try { track("coupon_strip_to_coupons", { intent }); } catch (e) {} window.location.href = "/coupons"; }}
          onLog={(name, _p, meta) => { try { track(name, { ...(meta || {}), intent }); } catch (e) {} }} />

        {INTENT_HAS_TOURS[intent] && tours && tours.length ? (
          <ViatorRail
            title={intent === "hidden-gems" ? "Hidden gem experiences" : "Top-rated experiences"}
            items={tours}
            theme={intent}
            onLog={(name, _p, meta) => { try { track(name, { ...(meta || {}), intent }); } catch (e) {} }} />
        ) : null}

        {/* momentPicks resolve against the rows this page already loaded, so a
            pick we cannot show a score for is dropped rather than rendered thin. */}
        <PerfectRightNow picks={momentPicks} places={rows || []} onOpenPlace={(p) => { window.location.href = "/p/" + encodeURIComponent(p.id); }} />

        <Methodology />
      </div>

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
