"use client";
// IntentPageClient — the dynamic engine behind /date-night and /family
// (owner: "pull a dynamic search when the user clicks"). Location from URL
// params (the hero cards pass them) with a wf_center fallback; queries per
// intent + daypart from lib/intentPages; results floored on real depth,
// ranked by the ONE score, rendered on the /best-beaches standard shell.
import { useEffect, useMemo, useRef, useState } from "react";
// v7.06 — the ONE editorial-line compressor, shared by every place surface.
import { toHookLine } from "../../lib/editorialHook";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "./RankedExperiencePage";
import IconicPlaceCard from "./IconicPlaceCard";
import CollectionFilter from "./CollectionFilter";
import { BackControl } from "../best-beaches/[metro]/parts";
import { areaSeasonalContext } from "../../lib/areaSeasonalContext";
import { currentSeason } from "../../lib/seasons";
import { INTENT_PAGES, toRow, rankRows, resolvePlanAhead, intentEyebrow, intentVariantCount, INTENT_COUPON_BADGE, INTENT_MOMENT_ID } from "../../lib/intentPages";
import { placeAllowed } from "../../lib/placeFilter";
import { resolveMarqueeDayTrips } from "../../lib/marqueeDayTrips";
import { editorialIntentHeader } from "../../lib/collectionHeader";
// v6.72 THE COMPOSITION (owner, 2026-07-31). The five blocks — coupon strip,
// tour rail, "Perfect right now", the list, and the glass-box disclosure — are
// component shared with app/components/screens/Experience.js, the reference
// sheet. This page keeps its SHELL (dark chrome, serif headline, back button)
// and adopts that CONTENT COMPOSITION inside it: shell from one, body from
// the other. Nothing here re-implements a block.
import { PerfectRightNow, ScoreDisclosure } from "./ExperienceBlocks";
import IntentPartnerPick from "./IntentPartnerPick";
import { mergePartnerInventory, partnerInventoryRequest } from "../../lib/intentPartnerPicks";
// v6.72: this component had ZERO weather references. Its header rendered
// areaSeasonalContext(city, season) — season and place, never time, never
// weather — while `h` chose a query set and touched nothing else. Both halves
// now come from ONE source: nowContext decides the bucket and the outdoor gate,
// rankRows enforces the gate and reweights, and nowSubline states why.
import { nowContext } from "../../lib/nowContext";
import { track } from "../../lib/track";
import { supabase } from "../../lib/supabase";
import { readLocalLikeState, readLocalSavedState, persistLike, persistDislike, persistSave, recordLikeEvent, recordTasteSignal } from "../../lib/likeSignal";
import { wayfindScore } from "../../lib/google";
import { governedScoreOf } from "../../lib/lawfulOrder";
import { FAR_MILES } from "../../lib/wayfindScore";
import { attachTrendSignals } from "../../lib/trendSignal";
import { TRENDING_POPULARITY_THRESHOLD } from "./kit";
import { canonicalShareUrl } from "../../lib/site";
import { askShareIntent } from "./shareIntentSheet";
import { placeKinds } from "../../lib/dateInvite";
import { resolveLocationContext, locationSurface } from "../../lib/locationHonesty";
import { settleLoad } from "../../lib/loadState.js";
// v8.57 — THIS SURFACE PAINTS A SKELETON, SO IT MUST REACH A DECISION.
// A try/catch (or .catch) only ever sees the failure mode that THROWS. The one
// that stranded production was the other one: a fetch that neither resolves nor
// rejects, which leaves every await pending, skips catch AND finally, and
// leaves the reader on a permanent grey box. settleLoad (lib/loadState.js) arms
// its clock BEFORE the work, so the pending state is always overwritten.
// Locked by scripts/check-no-stuck-loading.mjs section 5.
const INTENT_PAGE_LOAD_TIMEOUT_MS = 12000;

const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export default function IntentPageClient({ intent }) {
  const def = INTENT_PAGES[intent];
  const sp = useSearchParams();
  const [rows, setRows] = useState(null); // null = loading
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState("rated");
  const [radius, setRadius] = useState(17);
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
  // Standalone sheet actions use the same device-local and signed-in stores
  // as app/home.js. Deliberate actions work before sign-in, then sync to the
  // account when a session exists; no action button navigates away from the
  // list just to record a preference.
  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState({});
  const [savedLists, setSavedLists] = useState(null);
  const [liked, setLiked] = useState({});
  const [disliked, setDisliked] = useState({});
  // likedItems/dislikedItems are the fuller {place, ts} maps app/home.js's
  // Liked/Disliked lists read — kept and round-tripped even though this page
  // never renders them itself, so a toggle here does not blow away entries
  // the home shell already wrote (persistLike/persistDislike overwrite all
  // four localStorage keys on every call; passing empty maps would silently
  // erase whatever the user had liked/disliked from elsewhere).
  const [likedItems, setLikedItems] = useState({});
  const [dislikedItems, setDislikedItems] = useState({});
  // Performance clocks are intentionally client-local and contain no user id.
  // They let PostHog answer the Birthday-vs-intent-page question with the same
  // event shape in every market: mount -> usable ranked rows -> committed DOM.
  const mountedAtRef = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());
  const firstRenderLoggedRef = useRef(false);
  useEffect(() => {
    try { const s = readLocalLikeState(); setLiked(s.liked); setDisliked(s.disliked); setLikedItems(s.likedItems); setDislikedItems(s.dislikedItems); } catch (e) {}
    try { const s = readLocalSavedState(); setSaved(s.saved); setSavedLists(s.lists); } catch (e) {}
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data && data.session && data.session.user) setUser(data.session.user);
    }).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session && session.user ? session.user : null);
    });
    return () => { active = false; if (sub && sub.subscription) sub.subscription.unsubscribe(); };
  }, []);
  function toggleLike(e, p) {
    try { e && e.stopPropagation && e.stopPropagation(); } catch (er) {}
    const wasLiked = !!liked[p.id];
    const next = persistLike({ supabase, user, place: p, wasLiked, liked, disliked, likedItems, dislikedItems });
    setLiked(next.liked); setDisliked(next.disliked); setLikedItems(next.likedItems); setDislikedItems(next.dislikedItems);
    if (!wasLiked) { try { track("like", { place_id: p.id, intent }); } catch (er) {} try { recordLikeEvent("like", p, { supabase, user }); } catch (er) {} try { recordTasteSignal("like", p, { supabase, user }); } catch (er) {} }
  }
  function toggleDislike(e, p) {
    try { e && e.stopPropagation && e.stopPropagation(); } catch (er) {}
    const wasDis = !!disliked[p.id];
    const next = persistDislike({ supabase, user, place: p, wasDisliked: wasDis, liked, disliked, likedItems, dislikedItems });
    setLiked(next.liked); setDisliked(next.disliked); setLikedItems(next.likedItems); setDislikedItems(next.dislikedItems);
    if (!wasDis) { try { track("dislike", { place_id: p.id, intent }); } catch (er) {} try { recordLikeEvent("dislike", p, { supabase, user }); } catch (er) {} try { recordTasteSignal("dislike", p, { supabase, user }); } catch (er) {} }
  }
  function toggleSave(e, p) {
    try { e && e.stopPropagation && e.stopPropagation(); e && e.preventDefault && e.preventDefault(); } catch (er) {}
    const wasSaved = !!saved[p.id];
    const next = persistSave({ supabase, user, place: p, wasSaved, lists: savedLists });
    setSaved(next.saved); setSavedLists(next.lists);
    if (!wasSaved) { try { track("save", { place_id: p.id, intent }); } catch (er) {} try { recordLikeEvent("save", p, { supabase, user }); } catch (er) {} try { recordTasteSignal("save", p, { supabase, user }); } catch (er) {} }
  }

  // Preserve a valid shared photo reference for link metadata, while the
  // visible landing-page hero stays locked to the matching homepage card.
  const passedRef = useMemo(() => {
    const v = sp.get("img") || "";
    return PHOTO_REF.test(v) ? v : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loc = useMemo(() => {
    let stored = null;
    try {
      const c = JSON.parse(localStorage.getItem("wf_center") || "null");
      if (c && isFinite(c.lat) && isFinite(c.lng)) stored = { lat: c.lat, lng: c.lng, loc: c.loc };
    } catch (e) {}
    const ctx = resolveLocationContext({
      urlCity: (sp.get("city") || "").slice(0, 40),
      urlLat: parseFloat(sp.get("lat")),
      urlLng: parseFloat(sp.get("lng")),
      stored,
    });
    const surface = locationSurface(ctx);
    return { lat: ctx.lat, lng: ctx.lng, city: surface.headingCity, offersCity: surface.offersCity, links: surface.links };
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
    settleLoad(() => (async () => {
      const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
      const startedAt = clock();
      const traceId = (() => {
        try { return crypto.randomUUID(); } catch (e) { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
      })();
      const qs = def.queries(now);
      const results = await Promise.all(qs.map(async ({ cat, q }) => {
        const queryStartedAt = clock();
        try {
          // v6.94 (owner: "the default for this page should be 30 miles...
          // the hero card is called worth the drive") — every intent page
          // shared one 32km (~20mi) radius (see lib/intentPages.js's own
          // comment on the worth-the-drive entry), which is fine for
          // family/date-night but self-defeating for a page whose entire
          // premise is "day trips that earn the extra miles": it was
          // literally narrower than the 30mi DRIVE_BAND.nearMi that
          // lib/worthTheDrive.js's destination rail already assumes is this
          // list's own radius. def.radiusM lets a specific intent widen its
          // own search without moving the shared default for every other page.
          const u = "/api/places/search?q=" + encodeURIComponent(q) + "&lat=" + loc.lat.toFixed(2) + "&lng=" + loc.lng.toFixed(2) + "&radius=" + (def.radiusM || 32000) + "&n=20&cat=" + encodeURIComponent(cat);
          const r = await fetch(u);
          const j = r.ok ? await r.json() : null;
          // THE ONE GATE — same call the home rail makes (see IntentRail.js):
          // lib/placeFilter.placeAllowed judged against the query's own
          // category, so the page and the rail that links to it cannot admit
          // different places. Owner, 2026-08-11: a phone-repair storefront and
          // an optician were rendering as "hidden gems".
          const raw = j && Array.isArray(j.places) ? j.places : [];
          const eligible = raw.map(toRow).filter((row) => row && placeAllowed(cat, null, row));
          return {
            cat, q, rows: eligible,
            rawCandidates: raw.length,
            afterEligibility: eligible.length,
            cacheStatus: j && j.cached ? (j.stale ? "stale" : "hit") : "miss",
            source: (j && j.source) || (j && j.cached ? "shared-cache" : "search"),
            latencyMs: Math.round(clock() - queryStartedAt),
            ok: r.ok,
          };
        } catch (e) {
          return { cat, q, rows: [], rawCandidates: 0, afterEligibility: 0, cacheStatus: "error", source: "error", latencyMs: Math.round(clock() - queryStartedAt), ok: false };
        }
      }));
      // ctx is what makes this ranking time-aware rather than just time-queried:
      // it applies the outdoor suppression gate, the per-bucket reweight, and
      // the open-now / minutes-to-close multiplier. `timeless` pages (/best-of)
      // pass null and keep the pure-quality order their copy promises.
      // 2026-08-07: the unified trend signal decorates rows BEFORE ranking so
      // rankRows' trending term (+0.6, disclosed on the card) can apply. Fails
      // soft — no popularity rows, no term.
      const searchFinishedAt = clock();
      const flatRows = results.flatMap((result) => result.rows);
      try { await attachTrendSignals(flatRows, {}); } catch (e) {}
      const trendFinishedAt = clock();
      let ranked = rankRows(flatRows, def.floor, {
        origin: { lat: loc.lat, lng: loc.lng },
        penalty: def.distancePenalty || null,
        ctx: def.timeless ? null : now,
        // v7.09 — THE SAME COMPOSITION THE HOME RAIL USES. If the rail held
        // "day trips and landmarks" to Activities and this page did not, the
        // card you tapped and the card you landed on would be different cards
        // under the same heading. One rule, both surfaces.
        compose: def.compose || null,
        // v7.22 — resolved through the shared helper, because `tonight` now
        // decides this per daypart. `!!def.planAhead` would have read a
        // predicate FUNCTION as a permanent true and stopped "Tonight's Move"
        // from ever demoting a closed bar at midnight.
        planAhead: resolvePlanAhead(def, def.timeless ? null : now),
        minDistanceMi: def.minDistanceMi,
      });
      // THE MARQUEE LANE — same rule as the home rail (IntentRail.js), same
      // module, so the card you tapped and the page you landed on agree.
      // Owner, 2026-08-11: the parks, Disney Springs, the best of the best,
      // 2-hour drive max. Order-only; fails soft.
      if (intent === "worth-the-drive") {
        try {
          const marquee = await resolveMarqueeDayTrips({ origin: { lat: loc.lat, lng: loc.lng }, minDistanceMi: def.minDistanceMi });
          if (marquee.length) {
            const mIds = new Set(marquee.map((r) => r.id));
            ranked = marquee.concat(ranked.filter((r) => !mIds.has(r.id)));
          }
        } catch (e) {}
      }
      const rankedFinishedAt = clock();

      // P0: the ranked list is the minimum viable answer. Editorial, Atlas
      // hooks and cached blurbs progressively enhance it below; none may keep
      // the user staring at skeletons after useful places already exist.
      if (!dead) {
        setRows(ranked);
        try {
          track("intent_card_query", {
            trace_id: traceId,
            card_id: intent,
            market: loc.city,
            geo_cell: `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`,
            time_bucket: now.timeBucket,
            availability: resolvePlanAhead(def, def.timeless ? null : now) ? "plan_ahead" : "now",
            radius_m: def.radiusM || 32000,
            query_count: results.length,
            raw_candidates: results.reduce((sum, result) => sum + result.rawCandidates, 0),
            after_eligibility: flatRows.length,
            final_results: ranked.length,
            under_8: ranked.length < 8,
            under_12: ranked.length < 12,
            cache_hits: results.filter((result) => result.cacheStatus === "hit" || result.cacheStatus === "stale").length,
            cache_misses: results.filter((result) => result.cacheStatus === "miss").length,
            query_latency_ms: Math.round(searchFinishedAt - startedAt),
            trend_latency_ms: Math.round(trendFinishedAt - searchFinishedAt),
            ranking_latency_ms: Math.round(rankedFinishedAt - trendFinishedAt),
            usable_rows_latency_ms: Math.round(rankedFinishedAt - startedAt),
            query_funnel: results.map((result) => ({
              category: result.cat,
              query: result.q,
              raw: result.rawCandidates,
              eligible: result.afterEligibility,
              cache: result.cacheStatus,
              source: result.source,
              latency_ms: result.latencyMs,
              ok: result.ok,
            })),
          });
        } catch (e) {}
      }
      // v6.56 (owner): the line under each row is WAYFIND editorial (verified
      // wf_editorial hooks, one anon in() call) — never Google's summary text.
      try {
        if (supabase && ranked.length) {
          const { data: eds } = await supabase.from("wf_editorial").select("place_id,hook").eq("verified", true).in("place_id", ranked.map((r) => r.id));
          const byId = new Map((eds || []).map((e) => [e.place_id, e.hook]));
          for (const r of ranked) r.editorial_hook = byId.get(r.id) || null;
        }
      } catch (e) {}
      // Atlas whyGo is not in that wf_editorial read. /api/known-for is Atlas-
      // first, then the same verified fleet row — fill any hook the direct
      // read missed so a card that already has research is not blank on /tonight.
      try {
        const missing = ranked.filter((r) => r.id && !r.editorial_hook).map((r) => r.id);
        for (let i = 0; i < missing.length; i += 40) {
          const batch = missing.slice(i, i + 40);
          const kr = await fetch("/api/known-for", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids: batch }),
          });
          const kd = kr.ok ? await kr.json() : null;
          if (kd && kd.lines && typeof kd.lines === "object") {
            for (const r of ranked) {
              if (!r.editorial_hook && kd.lines[r.id]) r.editorial_hook = kd.lines[r.id];
            }
          }
        }
      } catch (e) {}
      // Rows without a verified / Atlas hook may already hold a CARD_SUMMARY in
      // the 30-day pool. Ask for every such row, not the first 8 — a café past
      // that cap with a cached hook was blank while a neighbor showed copy.
      // cacheOnly: never generate, never invent. No hook → nothing.
      try {
        const need = ranked.filter((r) => !r.editorial_hook);
        const BLURB_BATCH = 20;
        if (need.length) {
          // v6.61: never send r.editorial (Google's editorialSummary.text) into the
          // blurb model — ai_line must be grounded ONLY in curated_fact and
          // review_signals, both Wayfind-authored derivations, never Google's summary.
          // v6.63 cacheOnly: this is a RENDER PATH. It reads the shared 30-day
          // pool and never triggers generation, so a cold area costs the user
          // no latency and the row falls back to NO LINE (honest) instead of
          // waiting on a model. Warming the pool is a scheduled job's problem.
          for (let i = 0; i < need.length; i += BLURB_BATCH) {
            const batch = need.slice(i, i + BLURB_BATCH);
            const res = await fetch("/api/blurbs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cacheOnly: true, city: loc.city, places: batch.map((r) => ({ id: r.id, name: r.name, type: r.type, rating: r.rating, reviews: r.reviews })) }) });
            const j = res.ok ? await res.json() : null;
            if (j && j.blurbs && !dead) { for (const r of ranked) { if (!r.editorial_hook && j.blurbs[r.id]) r.ai_line = j.blurbs[r.id]; } }
          }
          if (!dead) setRows([...ranked]);
        }
      } catch (e) {}
    })(), { timeoutMs: INTENT_PAGE_LOAD_TIMEOUT_MS }).then((settled) => {
      if (!settled.ok) {
        if (!dead) setRows((prev) => (prev == null ? [] : prev));
      }
    });
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
    if (!Array.isArray(rows) || !rows.length || firstRenderLoggedRef.current) return;
    let cancelled = false;
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        if (cancelled || firstRenderLoggedRef.current) return;
        firstRenderLoggedRef.current = true;
        const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
        try {
          track("intent_first_place_rendered", {
            card_id: intent,
            market: loc.city,
            result_count: rows.length,
            mount_to_first_place_ms: Math.round(nowMs - mountedAtRef.current),
            device_class: window.innerWidth < 768 ? "mobile" : "desktop",
          });
        } catch (e) {}
      });
      return second;
    });
    return () => { cancelled = true; cancelAnimationFrame(first); };
    // The first non-empty committed list is the measurement. Later editorial
    // enhancement intentionally must not create a second timing event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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
  // Same /api/viator/tours endpoint the in-app rails use. This now runs for all
  // seven intents because the verified first result is also the nationwide
  // fallback for IntentPartnerPick. Curated city+intent inventory still wins;
  // an uncurated US city gets a local exact product or no card, never Orlando.
  useEffect(() => {
    if (!def || !isFinite(loc.lat)) return;
    let dead = false;
    (async () => {
      try {
        const request = partnerInventoryRequest(loc.offersCity || loc.city, intent);
        if (!request) return; // no city, no honest query — skip rather than guess
        const params = new URLSearchParams({ q: request.query, region: request.region, mode: "city", count: "12" });
        if (request.destId) params.set("destId", request.destId);
        const curatedParams = new URLSearchParams({ city: loc.offersCity || loc.city, intent });
        // Exact-product enrichment is additive: a provider/cache outage must
        // never erase the broad city rail that already loaded successfully.
        const exactPromise = fetch("/api/viator/curated?" + curatedParams.toString())
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null);
        const r = await fetch("/api/viator/tours?" + params.toString());
        const [j, exact] = await Promise.all([
          r.ok ? r.json() : null,
          exactPromise,
        ]);
        const items = (j && Array.isArray(j.items)) ? j.items : ((j && Array.isArray(j.tours)) ? j.tours : (Array.isArray(j) ? j : []));
        const merged = mergePartnerInventory(items, exact && exact.items);
        if (!dead) setTours(merged.length ? merged : null);
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, [intent, loc.city]);

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
  const header = editorialIntentHeader(intent, loc.city, areaCtx);
  // v6.63 — the client re-sort reads the GOVERNED score, the same number
  // IconicPlaceCard prints on the chip.
  //
  // It used to be `wayfindScore(rating, reviews) + (trending ? 6 : 0)`: the raw
  // base plus trending, with no creator-video term and no distance term. So
  // even after rankRows was fixed, THIS would have re-broken the order on every
  // render — a row showing 10.0 (base 93 + 7 for its creator video) sorted here
  // as a 93 and fell under a row showing 9.4. Both halves had to move together.
  //
  // governedScoreOf prefers the governed_score rankRows already stamped, so
  // this is a read of the sort key rather than a second derivation of it.
  const ratedKey = (r) => governedScoreOf(r) ?? -Infinity;
  const visibleRows = (rows || []).filter((r) => r.distMi == null || r.distMi <= radius).slice().sort((a, b) => {
    if (sortBy === "near") return (a.distMi ?? 1e12) - (b.distMi ?? 1e12);
    if (sortBy === "price") return (a.priceLevel ?? 9) - (b.priceLevel ?? 9) || ratedKey(b) - ratedKey(a);
    return ratedKey(b) - ratedKey(a);
  });
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
  const sharePlace = (p) => {
    const url = canonicalShareUrl("/p/" + encodeURIComponent(p.id));
    try { track("place_card_share", { place_id: p.id, intent }); } catch (e) {}
    try { recordLikeEvent("share", p, { supabase, user }); } catch (e) {}
    try { recordTasteSignal("share", p, { supabase, user }); } catch (e) {}
    // RETURNS TRUE IF THE OS SHEET OPENED. askShareIntent() confirms the invite
    // itself when nothing native took over the screen, so `quiet` suppresses the
    // page's own Copied chip on that path — one confirmation, not two.
    const doShare = (u, title, quiet) => {
      // NOT async, and not awaited. navigator.share() has to run inside the tap
      // that called it — the sheet button's own click — or iOS refuses it.
      try { if (navigator.share) { const pr = navigator.share({ title, url: u }); if (pr && pr.catch) pr.catch(() => {}); return true; } } catch (e) {}
      try { navigator.clipboard.writeText(u); if (!quiet) { setCopied(true); setTimeout(() => setCopied(false), 1800); } } catch (e) {}
      return false;
    };
    askShareIntent({
      name: p.name, city: loc.city, id: p.id, kind: placeKinds(p),
      onPlain: () => doShare(url, p.name),
      onInvite: (u, t) => { try { track("place_card_share", { place_id: p.id, kind: "invite" }); } catch (e) {} return doShare(u, t, true); },
    });
  };

  // v8.29.5 (owner, on /worth-the-drive: "there is nothing there" — a hero
  // panel with a headline, a deck, a rule, then a hand-sized void, then the
  // Share button). TWO empty slots made that hole. This page passed
  // trustLines={[]}, which BLANKED the shield line the hero reserves room for;
  // RankedExperiencePage already ships the right default copy, so the override
  // was deleting content rather than choosing it, and it is gone. The other
  // half is the quick-answer grid, which this page has no server data for —
  // EditorialLandingHero now tightens the whole hero when that block is absent
  // instead of holding 620px open for something that is never coming.
  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" variant="editorial" />}
      eyebrow={header.eyebrow}
      titleTop={header.title}
      subtitle={header.deck}
      heroImg={def.art}
      location={loc.city}
      imageKicker={header.imageKicker}
      imageTitle={header.imageTitle}
      dekLead={header.dekLead}
      actionSlot={(
        <button onClick={share} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, padding: "10px 20px", borderRadius: 14, border: "1px solid rgba(17,24,36,.12)", background: def.accent, color: "#111824", fontSize: 12.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}>
          {copied ? "Link copied" : "Share this list"} <span aria-hidden="true">↗</span>
        </button>
      )}
      footerSlot={<ScoreDisclosure />}
    >
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
        <IntentPartnerPick
          city={loc.city} intent={intent} inventory={tours} accent={def.accent}
          lat={loc.lat} lng={loc.lng} couponIntent={INTENT_COUPON_BADGE[intent]}
          onOpenCoupons={(coupon, state) => {
            try { track("coupon_strip_to_coupons", { intent, coupon_id: coupon && coupon.id, clipped: !!(state && state.clipped) }); } catch (e) {}
            if (!coupon || !coupon.id) { window.location.href = "/coupons"; return; }
            const focus = coupon && coupon.id ? `&focus=${encodeURIComponent(coupon.id)}` : "";
            const saved = state && state.clipped ? "&saved=1" : "";
            window.location.href = `/coupons?view=clipped${focus}${saved}`;
          }}
          onLog={(name, _p, meta) => { try { track(name, { ...(meta || {}), intent }); } catch (e) {} }} />

        {/* momentPicks resolve against the rows this page already loaded, so a
            pick we cannot show a score for is dropped rather than rendered thin. */}
        <PerfectRightNow picks={momentPicks} places={rows || []} durablePlaces={visibleRows} context={now} onOpenPlace={(p) => { window.location.href = "/p/" + encodeURIComponent(p.id); }} />

      </div>

      {rows === null ? (
        <div style={{ marginTop: 18 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="wf-skeleton" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}
        </div>
      ) : rows.length ? (
        <>
        <CollectionFilter sortBy={sortBy} onSort={setSortBy} radius={radius} onRadius={setRadius} city={loc.city} />
        {visibleRows.length ? <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visibleRows.map((r, i) => {
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
              <IconicPlaceCard key={r.id} place={r} rank={i + 1} href={"/p/" + encodeURIComponent(r.id)}
                editorial={toHookLine(r.editorial_hook, r.name) || null}
                aiSummary={toHookLine(r.editorial_hook, r.name) ? null : r.ai_line || null}
                rankingNote={Number.isFinite(r.distMi) && r.distMi > FAR_MILES ? "ranked lower for the drive (−0.2)" : null}
                badge={badge}
                saved={!!saved[r.id]} liked={!!liked[r.id]} disliked={!!disliked[r.id]}
                onSave={toggleSave}
                onLike={toggleLike} onDislike={toggleDislike}
                onShare={sharePlace} />
            );
          })}
        </ol> : <p style={{ margin: "18px 0", fontSize: 13, color: "#8b93a1" }}>No picks fall within {radius} miles. Widen the filter to see more.</p>}
        </>
      ) : (
        <p style={{ marginTop: 18, fontSize: 13, color: "#8b93a1" }}>Nothing near you clears the bar for this list right now — that honesty is the product. Try again closer to town.</p>
      )}
      {areaCtx ? (
        <details style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14 }}>
          <summary style={{ cursor: "pointer", color: "#C9D1D9", fontSize: 13.5, fontWeight: 800 }}>About {loc.city}</summary>
          <div style={{ maxWidth: 620, padding: "10px 0 2px" }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#C9D1D9" }}>{areaCtx.headline_context}</p>
            <p style={{ margin: "7px 0 0", fontSize: 13, lineHeight: 1.5, color: "#8B949E" }}>{areaCtx.area_known_for}</p>
          </div>
        </details>
      ) : null}
    </RankedExperiencePage>
  );
}
