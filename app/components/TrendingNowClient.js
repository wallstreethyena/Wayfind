"use client";
// TrendingNowClient — the page behind the "Trending near you" hero (owner:
// the card must open a RANKED page of the top picks, not one detail sheet).
// Real tier-2 popularity via wf_buzz_picks; each row's editorial line is
// written by the built-in LLM in the Wayfind voice (/api/buzz/why, shared
// 1-day pool). Same /best-beaches standard shell, same honest gating: it
// shows only places carrying real popularity signals.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "./RankedExperiencePage";
import IconicPlaceCard from "./IconicPlaceCard";
import CollectionFilter from "./CollectionFilter";
import { BackControl } from "../best-beaches/[metro]/parts";
import { supabase } from "../../lib/supabase";
import { wayfindScore } from "../../lib/google";
import { rankByHour, timeFit } from "../../lib/trendingTime";
import { nowContext } from "../../lib/nowContext.js";
import { canonicalShareUrl } from "../../lib/site";
import { track } from "../../lib/track";
import { readLocalLikeState, readLocalSavedState, persistLike, persistDislike, persistSave, recordLikeEvent, recordTasteSignal } from "../../lib/likeSignal";

const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export default function TrendingNowClient() {
  const sp = useSearchParams();
  const [rows, setRows] = useState(null); // null = loading
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState("rated");
  const [radius, setRadius] = useState(17);
  // Like/Dislike (2026-08-01) — same fix and same reasoning as
  // IntentPageClient.js: see lib/likeSignal.js for the defect this replaces
  // (a two-hop navigation with no local state or visual feedback at all).
  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState({});
  const [savedLists, setSavedLists] = useState(null);
  const [liked, setLiked] = useState({});
  const [disliked, setDisliked] = useState({});
  const [likedItems, setLikedItems] = useState({});
  const [dislikedItems, setDislikedItems] = useState({});
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
    if (!wasLiked) { try { track("like", { place_id: p.id, surface: "trending_now" }); } catch (er) {} try { recordLikeEvent("like", p, { supabase, user }); } catch (er) {} try { recordTasteSignal("like", p, { supabase, user }); } catch (er) {} }
  }
  function toggleDislike(e, p) {
    try { e && e.stopPropagation && e.stopPropagation(); } catch (er) {}
    const wasDis = !!disliked[p.id];
    const next = persistDislike({ supabase, user, place: p, wasDisliked: wasDis, liked, disliked, likedItems, dislikedItems });
    setLiked(next.liked); setDisliked(next.disliked); setLikedItems(next.likedItems); setDislikedItems(next.dislikedItems);
    if (!wasDis) { try { track("dislike", { place_id: p.id, surface: "trending_now" }); } catch (er) {} try { recordLikeEvent("dislike", p, { supabase, user }); } catch (er) {} try { recordTasteSignal("dislike", p, { supabase, user }); } catch (er) {} }
  }
  function toggleSave(e, p) {
    try { e && e.stopPropagation && e.stopPropagation(); e && e.preventDefault && e.preventDefault(); } catch (er) {}
    const wasSaved = !!saved[p.id];
    const next = persistSave({ supabase, user, place: p, wasSaved, lists: savedLists });
    setSaved(next.saved); setSavedLists(next.lists);
    if (!wasSaved) { try { track("save", { place_id: p.id, surface: "trending_now" }); } catch (er) {} try { recordLikeEvent("save", p, { supabase, user }); } catch (er) {} try { recordTasteSignal("save", p, { supabase, user }); } catch (er) {} }
  }

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
      // HOUR-AWARE: re-rank by time-of-day fit so tonight's list leans to things
      // you can actually do now (a 9pm list shouldn't lead with museums/beaches),
      // then take the top few and write editorial only for those.
      // v6.72: the hour comes from nowContext (venue-local ET, one source),
      // not from the visitor's device clock. rankByHour keeps its own
      // category fit table — that is a per-category curve, not a bucket.
      const hour = nowContext({ lat: loc.lat, lng: loc.lng, city: loc.city }).hour;
      const ranked = rankByHour(picks, hour).slice(0, 8);
      // Editorial in the Wayfind voice — one cached call per pick. Fail-soft:
      // a pick with no honest line falls back to a data-templated one.
      const withWhy = await Promise.all(ranked.map(async (p) => {
        let line = null;
        try {
          const r = await fetch("/api/buzz/why", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ place_id: p.place_id, name: p.name, category: p.category, city: loc.city, rating: p.rating, reviews: p.reviews, popularity: p.popularity, sources_count: p.sources_count, by_source: p.by_source, freshest: p.freshest }) });
          const j = r.ok ? await r.json() : null; line = j && j.line ? j.line : null;
        } catch (e) {}
        return { ...p, why: line, timeFit: timeFit(p.category, hour) };
      }));
      if (!dead) setRows(withWhy);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heroImg = passedRef ? "/api/photo?ref=" + encodeURIComponent(passedRef) + "&w=800"
    : (rows && rows[0] && rows[0].photo_ref ? "/api/photo?ref=" + encodeURIComponent(rows[0].photo_ref) + "&w=800" : null);

  const share = async () => {
    // Canonical origin — see lib/site.canonicalShareUrl.
    const url = canonicalShareUrl(window.location.href);
    try { if (navigator.share) { await navigator.share({ title: "Trending near " + loc.city, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const sharePlace = async (place) => {
    const url = canonicalShareUrl("/p/" + encodeURIComponent(place.id));
    try { track("place_card_share", { place_id: place.id, surface: "trending_now" }); } catch (e) {}
    try { recordLikeEvent("share", place, { supabase, user }); } catch (e) {}
    try { recordTasteSignal("share", place, { supabase, user }); } catch (e) {}
    try { if (navigator.share) { await navigator.share({ title: place.name, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const visibleRows = (rows || []).filter((r) => r.distance_mi == null || r.distance_mi <= radius).slice().sort((a, b) => {
    if (sortBy === "near") return (a.distance_mi ?? 1e12) - (b.distance_mi ?? 1e12);
    return wayfindScore(b.rating, b.reviews) - wayfindScore(a.rating, a.reviews);
  });

  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" variant="editorial" />}
      eyebrow="Trending near you"
      titleTop="What's drawing people"
      titleBottom={loc.city}
      subtitle={"The places near " + loc.city + " getting the most attention right now — measured by real signals and ordered for the time of day, so what's worth doing this hour rises to the top."}
      heroImg={heroImg}
      location={loc.city}
      imageKicker="THE WAYFIND LIVE EDITION"
      imageTitle={"See where " + loc.city + " is moving before the crowd catches up."}
      dekLead="Follow the signal, not the hype."
      actionSlot={(
        <button onClick={share} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, padding: "10px 20px", borderRadius: 14, border: "1px solid rgba(17,24,36,.12)", background: "#FF6B6B", color: "#111824", fontSize: 12.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}>
          {copied ? "Link copied" : "Share what's trending"} <span aria-hidden="true">↗</span>
        </button>
      )}
      footNote="Trending is measured from real popularity signals (search interest and cross-platform attention), never door counts or paid placement. The Wayfind Score stays the same for everyone."
    >
      {rows === null ? (
        <div style={{ marginTop: 18 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="wf-skeleton" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}</div>
      ) : rows.length ? (
        <>
          <CollectionFilter sortBy={sortBy} onSort={setSortBy} radius={radius} onRadius={setRadius} city={loc.city} showPrice={false} />
          {visibleRows.length ? <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visibleRows.map((r, i) => (
              <IconicPlaceCard key={r.place_id}
                place={{ ...r, id: r.place_id, photoRef: r.photo_ref, distMi: r.distance_mi, type: r.category, primaryType: r.category, types: r.category ? [r.category] : [] }}
                rank={i + 1}
                href={"/p/" + encodeURIComponent(r.place_id)}
                editorial={r.why || (r.sources_count > 1 ? "Drawing attention across " + r.sources_count + " signals this week." : "More people are looking this up than usual.")}
                rankingNote={r.timeFit || null}
                saved={!!saved[r.place_id]} liked={!!liked[r.place_id]} disliked={!!disliked[r.place_id]}
                onSave={toggleSave}
                onLike={toggleLike} onDislike={toggleDislike}
                onShare={sharePlace} />
            ))}
          </ol> : <p style={{ margin: "18px 0", fontSize: 13, color: "#8b93a1" }}>No trending picks fall within {radius} miles. Widen the filter to see more.</p>}
        </>
      ) : (
        <p style={{ marginTop: 18, fontSize: 13, color: "#8b93a1" }}>Nothing is trending near you yet — the signal builds as the popularity engine gathers data. Check back soon.</p>
      )}
    </RankedExperiencePage>
  );
}
