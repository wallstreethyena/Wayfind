"use client";

import { useEffect, useRef, useState } from "react";
import RailCard, { RailNav, RailDots } from "./RailCard";
import { C, directionsUrl } from "./kit";
import { tbPhotoUrl } from "../../lib/todaysBest.js";
import { toDisplayScore } from "../../lib/score.js";
import { priceLabel } from "../../lib/price.js";
import { markExplodingInteraction, noteExplodingReturn } from "../../lib/explodingExperiment.js";
import useMissingPlacePhotos from "./useMissingPlacePhotos";
import { loadProvidedTrendList } from "../../lib/explodingLaunchSearch.js";
import { EXPLODING_STAT_ASOF } from "../../lib/trendTaxonomy.js";
import { nowContext } from "../../lib/nowContext.js";
import { gateOutdoor } from "../../lib/ranking.js";

const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);
const prettyType = (t) => {
  const s = String(t || "").replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
};

function asPlace(p, photoRef) {
  return {
    priceLevel: p.priceLevel != null ? p.priceLevel : null,
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    rating: p.rating,
    reviews: p.reviews,
    type: p.primaryType || p.category,
    category: p.category,
    types: p.types || [],
    photo: tbPhotoUrl(photoRef || p.photoRef, 720),
    photos: (photoRef || p.photoRef) ? [tbPhotoUrl(photoRef || p.photoRef, 720)] : [],
    wfScore: p.governedScore,
    distMi: p.distanceMi,
  };
}

function evidenceChip(p) {
  const kinds = new Set(p.evidenceKinds || []);
  if (kinds.has("scheduledEvent")) return { key: "verified-event", icon: "✓", label: "Event verified" };
  if (kinds.has("menu") || kinds.has("product")) return { key: "verified-menu", icon: "✓", label: "Menu verified" };
  if (kinds.has("bookingPage")) return { key: "verified-booking", icon: "✓", label: "Bookable offering" };
  return null;
}

function TrendBlock({ trend, index, photoRefFor, onLog, onMeaningful, onOpenPlace, onFindSimilar, isSaved, liked, disliked, onSave, onLike, onDislike, onShare }) {
  const railSeen = useRef(false);
  const primary = trend.matches[0];
  const more = trend.matches.slice(1);
  if (!primary) return null;

  const card = (p, rank, additional) => {
    const place = asPlace(p, photoRefFor(p));
    const facts = [
      p.reviews ? compact(p.reviews) + " reviews" : null,
      Number.isFinite(p.distanceMi) ? (p.distanceMi < 10 ? p.distanceMi.toFixed(1) : Math.round(p.distanceMi)) + " mi" : null,
      // v7.12 (owner): every place card carries the price when it is verified.
      priceLabel(p.priceLevel),
    ].filter(Boolean);
    const chips = [
      evidenceChip(p),
      // v7.12 (owner): chips are CONTROLS, not decoration — the trend chip
      // runs the app's real search for the trend, which is exactly "identify
      // other place cards similar".
      { key: "exploding-trend", icon: "🔥", label: "Trending: " + trend.label + " ›", onClick: onFindSimilar ? () => {
        onMeaningful("trend_find_similar", place, { concept_key: trend.conceptKey, query: trend.label });
        onFindSimilar(trend.label);
      } : undefined },
      p.hasCreatorVideo ? { key: "creator-video", icon: "🎬", label: "Creator video" } : null,
    ].filter(Boolean);
    const directionHref = directionsUrl(place);
    return (
      <RailCard
        key={p.id}
        className={additional ? "wf-exploding-additional" : "wf-exploding-primary"}
        photo={place.photo}
        title={p.name}
        eyebrow={prettyType(p.primaryType || p.category)}
        rank={rank}
        score={toDisplayScore(p.governedScore)}
        facts={facts}
        award={!additional ? { tone: 1, icon: "🏆", label: "One of the best nearby places to try it" } : null}
        chips={chips}
        take={p.editorialHook || null}
        cta={directionHref ? {
          label: "Directions ↗",
          href: directionHref,
          external: true,
          onClick: () => onMeaningful("directions", place, { concept_key: trend.conceptKey, trend_position: index + 1, card_position: rank }),
        } : null}
        ariaLabel={"Open " + p.name + " for " + trend.label}
        saved={!!(isSaved && isSaved(place))}
        liked={!!(liked && liked[p.id])}
        disliked={!!(disliked && disliked[p.id])}
        onOpen={() => {
          onMeaningful(additional ? "additional_trend_place_click" : "primary_trend_card_click", place, { concept_key: trend.conceptKey, trend_position: index + 1, card_position: rank });
          try { onLog && onLog("place_detail_view", place, { surface: "exploding_nearby", concept_key: trend.conceptKey, card_position: rank }); } catch (e) {}
          if (onOpenPlace) onOpenPlace(place);
        }}
        onSave={(e) => {
          onMeaningful("trend_card_save", place, { concept_key: trend.conceptKey, card_position: rank });
          if (onSave) onSave(e, place);
        }}
        onLike={(e) => { if (onLike) onLike(e, place); }}
        onDislike={(e) => { if (onDislike) onDislike(e, place); }}
        onShare={() => {
          onMeaningful("trend_card_share", place, { concept_key: trend.conceptKey, card_position: rank });
          try { onLog && onLog("share", place, { surface: "exploding_nearby", kind: "place", concept_key: trend.conceptKey, card_position: rank }); } catch (e) {}
          if (onShare) onShare(place);
        }}
      />
    );
  };

  const shareTrend = async () => {
    const place = asPlace(primary, photoRefFor(primary));
    onMeaningful("share", place, { surface: "exploding_nearby", share_kind: "trend", concept_key: trend.conceptKey });
    const title = "🔥 " + trend.headline;
    const text = `${title}. ${primary.name} is one of Wayfind's best nearby places to try it.`;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text + (url ? " " + url : ""));
    } catch (e) {}
  };

  return (
    <article data-exploding-trend={trend.conceptKey} style={{ padding: index ? "21px 0 3px" : "5px 0 3px", borderTop: index ? "1px solid rgba(255,255,255,.08)" : "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 11 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, lineHeight: 1.2, fontWeight: 820, letterSpacing: "-.25px", color: "#FFF3E8" }}>🔥 {trend.headline}</div>
          <div style={{ marginTop: 5, color: "#AEB8C6", fontSize: 12.5, lineHeight: 1.45 }}>{trend.dek}</div>
          {/* THE EVIDENCE LINE (owner, 2026-08-11: "explain to the user that it
              is trending recently and share the data with them"). The stat is
              the owner-supplied measured search delta from the licensed trend
              list — a concrete, dated claim, never a bare "this is trending". */}
          {trend.stat ? (
            <div style={{ marginTop: 5, color: "#8FD3A8", fontSize: 11.5, lineHeight: 1.45, fontWeight: 650 }}>
              📈 {trend.stat} <span style={{ color: "#6F7C8D", fontWeight: 500 }}>({EXPLODING_STAT_ASOF})</span>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={shareTrend} aria-label={"Share " + trend.label} style={{ flexShrink: 0, minWidth: 40, minHeight: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: C.text, cursor: "pointer", fontSize: 15 }}>↗</button>
      </div>
      {/* v7.12 (owner, 2026-08-11): "if an exploding category has more
          options don't place it vertically — place it in a horizontal rail and
          make sure the user knows it has more." ONE rail holds every verified
          match, best governed score first; the primary card keeps its award
          band inside the rail, and RailDots is the there-is-more bubble. */}
      {more.length ? (
        <RailNav railId={"exploding-" + trend.conceptKey} count={trend.matches.length} unit={trend.label.toLowerCase() + " matches"} />
      ) : null}
      <div
        className="wf-rail wf-rail-exploding"
        data-rail={"exploding-" + trend.conceptKey}
        tabIndex={0}
        role="region"
        aria-label={"Verified places for " + trend.label}
        onScroll={(e) => {
          if (railSeen.current || e.currentTarget.scrollLeft < 16) return;
          railSeen.current = true;
          try { onLog && onLog("trend_horizontal_scroll", null, { surface: "exploding_nearby", concept_key: trend.conceptKey, count: more.length }); } catch (er) {}
        }}
      >
        {card(primary, 1, false)}
        {more.map((p, i) => card(p, i + 2, true))}
      </div>
      {more.length ? <RailDots railId={"exploding-" + trend.conceptKey} count={trend.matches.length} /> : null}
    </article>
  );
}

export default function ExplodingNearby({ center, city, weather, active, onVisibleIds, onOpenPlace, onFindSimilar, onLog, isSaved, liked, disliked, onSave, onLike, onDislike, onShare }) {
  const [result, setResult] = useState({ status: "loading", trends: [] });
  const [retry, setRetry] = useState(0);
  const rootRef = useRef(null);
  const mountedAt = useRef(Date.now());
  const firstMeaningful = useRef(false);
  const impressed = useRef(false);

  useEffect(() => {
    if (!active || !center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    const ctrl = new AbortController();
    setResult({ status: "loading", trends: [] });
    loadProvidedTrendList({ center, city, signal: ctrl.signal })
      .then((body) => {
        if (ctrl.signal.aborted) return;
        // THE WEATHER/TIME GATE (owner, 2026-08-11: "the result should be based
        // on the time of the day and weather also — use common sense"). The
        // same gateOutdoor every other rail passes through: an outdoor trend
        // match (a rucking route, a forest-bathing trail) is SUPPRESSED when
        // the hour and the weather make it wrong, and a trend whose matches
        // are all gated renders no module rather than a wrong one.
        let trends = Array.isArray(body.trends) ? body.trends : [];
        try {
          const ctx = nowContext({ lat: center.lat, lng: center.lng, city: city || null, weather: weather || null });
          trends = trends
            .map((t) => ({ ...t, matches: gateOutdoor(t.matches, ctx) }))
            .filter((t) => t.matches.length);
        } catch (e) {}
        // Every match gated away is an honest empty state, not an error.
        const status = body.status === "ok" && !trends.length ? "no_verified_inventory" : (body.status || "trend_data_error");
        setResult({ status, trends, error: body.error || null });
      })
      .catch(() => { if (!ctrl.signal.aborted) setResult({ status: "trend_data_error", trends: [], error: "Trend recommendations are temporarily unavailable." }); });
    return () => ctrl.abort();
  }, [active, retry, city, center && center.lat, center && center.lng]);

  const visibleIdKey = result.status === "ok"
    ? result.trends.flatMap((trend) => trend.matches || []).map((p) => p && p.id).filter(Boolean).join("|")
    : "";
  const photoRefFor = useMissingPlacePhotos(
    result.status === "ok" ? result.trends.flatMap((trend) => trend.matches || []) : [],
    center,
    active && result.status === "ok"
  );
  useEffect(() => {
    if (onVisibleIds) onVisibleIds(visibleIdKey ? visibleIdKey.split("|") : []);
    // The joined identity list is the value. Depending on the callback identity
    // would report forever because the parent binds the section name inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdKey]);

  useEffect(() => {
    if (result.status !== "ok" || !result.trends.length || impressed.current) return;
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      impressed.current = true;
      try { onLog && onLog("exploding_section_impression", null, { surface: "home", count: result.trends.length }); } catch (e) {}
      return;
    }
    const seenTrends = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const concept = entry.target.getAttribute("data-exploding-trend");
        if (concept && !seenTrends.has(concept)) {
          seenTrends.add(concept);
          try { onLog && onLog("trend_impression", null, { surface: "exploding_nearby", concept_key: concept }); } catch (e) {}
        }
        if (entry.target === node && !impressed.current) {
          impressed.current = true;
          try { onLog && onLog("exploding_section_impression", null, { surface: "home", count: result.trends.length }); } catch (e) {}
          try { onLog && onLog("trend_expand", null, { surface: "home", trigger: "default", count: result.trends.length }); } catch (e) {}
          try { noteExplodingReturn(onLog); } catch (e) {}
        }
      }
    }, { threshold: 0.12 });
    io.observe(node);
    node.querySelectorAll("[data-exploding-trend]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [result.status, result.trends.length, onLog]);

  const meaningful = (event, place, extra) => {
    const elapsed = Math.max(0, Date.now() - mountedAt.current);
    if (!firstMeaningful.current) {
      firstMeaningful.current = true;
      markExplodingInteraction();
      try { onLog && onLog("time_to_first_meaningful_interaction", place, { surface: "exploding_nearby", elapsed_ms: elapsed }); } catch (e) {}
      try { onLog && onLog("interaction_within_12_seconds", place, { surface: "exploding_nearby", elapsed_ms: elapsed, within_12_seconds: elapsed <= 12000 }); } catch (e) {}
    }
    try { onLog && onLog(event, place, { surface: "exploding_nearby", ...(extra || {}) }); } catch (e) {}
  };

  if (!active) return null;
  if (result.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Finding verified trends near you" style={{ padding: "4px 0 8px" }}>
        {[0, 1, 2].map((i) => <div key={i} className="wf-sk" style={{ height: 224, borderRadius: 17, marginTop: i ? 16 : 0 }} />)}
      </div>
    );
  }
  if (result.status === "unsupported_location") {
    return <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, padding: "7px 2px 13px" }}>Exploding Near You is not available in this area yet.</div>;
  }
  if (result.status === "no_verified_inventory") {
    return <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, padding: "7px 2px 13px" }}>No trend has enough verified local inventory to recommend right now.</div>;
  }
  if (result.status !== "ok" || !result.trends.length) {
    return (
      <div role="alert" style={{ padding: "8px 2px 14px" }}>
        <div style={{ color: "#F8C6B8", fontSize: 13, lineHeight: 1.5 }}>{result.error || "Trend recommendations are temporarily unavailable."}</div>
        <button type="button" onClick={() => setRetry((n) => n + 1)} style={{ marginTop: 8, minHeight: 38, padding: "0 13px", borderRadius: 9, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.04)", color: C.text, fontWeight: 750, cursor: "pointer" }}>Try again</button>
      </div>
    );
  }
  return (
    <div ref={rootRef}>
      {result.trends.map((trend, i) => (
        <TrendBlock
          key={trend.conceptKey}
          trend={trend}
          index={i}
          photoRefFor={photoRefFor}
          onLog={onLog}
          onMeaningful={meaningful}
          onOpenPlace={onOpenPlace}
          onFindSimilar={onFindSimilar}
          isSaved={isSaved}
          liked={liked}
          disliked={disliked}
          onSave={onSave}
          onLike={onLike}
          onDislike={onDislike}
          onShare={onShare}
        />
      ))}
      <div style={{ padding: "10px 2px 8px", color: "#6F7C8D", fontSize: 10.5, lineHeight: 1.45 }}>
        Trend momentum selects experiences. Wayfind Score ranks places. No paid placement.
      </div>
    </div>
  );
}
