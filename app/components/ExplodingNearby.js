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
import { nowContext } from "../../lib/nowContext.js";
import { gateOutdoor, coarseCat } from "../../lib/ranking.js";
import { topPickAward } from "../../lib/topPickAward.js";

// v8.27 (owner, 2026-08-20, on a screenshot of the ramen card: "these pills are
// too long"). "One of the best nearby places to try it" is 39 characters — it
// wrapped the pill to two lines on a 390px phone and pushed the card's real
// content down. The CLAIM is unchanged and still gated by
// LAUNCH_LEAD_MIN_REVIEWS / LAUNCH_LEAD_MIN_SCORE; only its wording is shorter.
// It reads under the trend heading, which already names the thing.
export const LEAD_AWARD_LABEL = "Top nearby pick";

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

function TrendBlock({ trend, index, photoRefFor, onLog, onMeaningful, onOpenPlace, onFindSimilar, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const railSeen = useRef(false);
  const primary = trend.matches[0];
  const more = trend.matches.slice(1);
  // v8.39 — derived from the ROWS, with `provenCount` only as a hint. The
  // producer and the renderer are two modules and a cached payload apart; a
  // count that disagreed with its own list is how a rail ends up claiming a
  // number it cannot show. Counting the rendered rows cannot drift.
  const provenCount = trend.matches.filter((p) => p.trendProof !== "category").length;
  const nearbyCount = trend.matches.length - provenCount;
  // What the extra cards ARE, named from the rows themselves: one venue type
  // if they agree, the honest generic if they do not.
  const nearbyTypes = new Set(trend.matches.filter((p) => p.trendProof === "category").map((p) => prettyType(p.primaryType || p.category).toLowerCase()));
  const nearbyNoun = nearbyTypes.size === 1 ? [...nearbyTypes][0] + "s" : "places";
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
      // v8.22 (owner: "these pills are very long winded — we should just say
      // trending"). The section header directly above already names the trend
      // in full ("6 spots for functional smoothies…"), so the pill repeating
      // it was pure noise and forced a cut-off. One word on the pill; the full
      // trend stays in the title for hover/screen readers.
      // v8.39 — THE CHIP SAYS WHAT THIS CARD PROVED, NOT WHAT THE RAIL IS ABOUT.
      //
      // A "🔥 Trending" chip on a card asserts that THIS place offers the
      // trend. That is true of an offering-proven match (a discriminating
      // Google type, or the venue's own name) and it is NOT true of a
      // categorical one — the right kind of venue nearby, returned by Google
      // for this query, proven as nothing more. Giving both the same chip
      // would launder the second into the first, which is the whole reason
      // the tier exists. So the categorical card names its VENUE instead, and
      // the find-similar search it runs is the venue type, not the trend.
      p.trendProof === "category"
        ? { key: "nearby-type", icon: "📍", label: prettyType(p.primaryType || p.category), title: prettyType(p.primaryType || p.category) + " nearby — not verified for " + trend.label, onClick: onFindSimilar ? () => {
            onMeaningful("trend_find_similar", place, { concept_key: trend.conceptKey, query: prettyType(p.primaryType || p.category), proof: "category" });
            onFindSimilar(prettyType(p.primaryType || p.category));
          } : undefined }
        : { key: "exploding-trend", icon: "🔥", label: "Trending", title: "Trending: " + trend.label, onClick: onFindSimilar ? () => {
            onMeaningful("trend_find_similar", place, { concept_key: trend.conceptKey, query: trend.label, proof: "offering" });
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
        award={!additional ? topPickAward({ category: coarseCat(place) || prettyType(p.primaryType || p.category) || "nearby", rank }) : null}
        chips={chips}
        take={p.editorialHook || null}
        cta={directionHref ? {
          label: "Directions ↗",
          href: directionHref,
          external: true,
          onClick: () => onMeaningful("directions", place, { concept_key: trend.conceptKey, trend_position: index + 1, card_position: rank }),
        } : null}
        ariaLabel={"Open " + p.name + " for " + trend.label}
        // v8.29.2 — the row itself, so an unwired caller still gets a working
        // thumb from lib/cardActions instead of a button that does nothing.
        place={place}
        saved={!!(isSaved && isSaved(place))}
        liked={!!(liked && liked[p.id]) || !!(isLiked && isLiked(p.id))}
        disliked={!!(disliked && disliked[p.id]) || !!(isDisliked && isDisliked(p.id))}
        onOpen={() => {
          onMeaningful(additional ? "additional_trend_place_click" : "primary_trend_card_click", place, { concept_key: trend.conceptKey, trend_position: index + 1, card_position: rank });
          try { onLog && onLog("place_detail_view", place, { surface: "exploding_nearby", concept_key: trend.conceptKey, card_position: rank }); } catch (e) {}
          if (onOpenPlace) onOpenPlace(place);
        }}
        onSave={onSave ? (e) => {
          onMeaningful("trend_card_save", place, { concept_key: trend.conceptKey, card_position: rank });
          onSave(e, place);
        } : undefined}
        // v8.29.2 — CONDITIONAL, not swallowing. `(e) => { if (onLike) ... }`
        // is always a function, so RailCard could not tell a wired caller from
        // an unwired one and rendered a live button over a no-op. undefined is
        // the honest value, and it is what lets the card's own fallback run.
        onLike={onLike ? (e) => onLike(e, place) : undefined}
        onDislike={onDislike ? (e) => onDislike(e, place) : undefined}
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
          {/* v7.14 (owner, repeated ask): the search-data stat line is GONE from
              the card. It read as an internal memo, not a recommendation. The
              numbers stay in lib/trendTaxonomy.js for ranking/audit only —
              nothing on this surface may render trend.stat. */}
        </div>
        <button type="button" onClick={shareTrend} aria-label={"Share " + trend.label} style={{ flexShrink: 0, minWidth: 40, minHeight: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: C.text, cursor: "pointer", fontSize: 15 }}>↗</button>
      </div>
      {/* v7.12 (owner, 2026-08-11): "if an exploding category has more
          options don't place it vertically — place it in a horizontal rail and
          make sure the user knows it has more." ONE rail holds every verified
          match, best governed score first; the primary card keeps its award
          band inside the rail, and RailDots is the there-is-more bubble. */}
      {/* v8.39 — THE COUNT LINE COUNTS ONLY WHAT THE RAIL CAN CLAIM.
          This read `count={trend.matches.length}` with unit "spots for <trend>",
          which was exact while every card was offering-proven. Now that a rail
          can carry categorical venues behind its proven ones, the same line
          would call twelve burger restaurants twelve smash-burger spots. The
          headline number is the PROVEN count; the rest are described as what
          they are, in the same breath, so nothing has to be discovered by
          tapping. */}
      {more.length ? (
        <RailNav
          railId={"exploding-" + trend.conceptKey}
          count={provenCount}
          total={trend.matches.length}
          unit={(provenCount === 1 ? "spot for " : "spots for ") + trend.label.toLowerCase()
            + (nearbyCount ? ", plus " + nearbyCount + " more " + nearbyNoun + " nearby" : "")}
        />
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

export default function ExplodingNearby({ center, city, weather, active, onVisibleIds, onOpenPlace, onFindSimilar, onLog, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
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
    loadProvidedTrendList({
      center, city, signal: ctrl.signal,
      // v8.24 — trends render AS THE WALK FINDS THEM (owner: "always takes so
      // long to load"). Each partial is the ranked prefix of the final list,
      // so nothing reorders under the reader; `partial` keeps a small tail
      // skeleton up until the walk completes.
      onPartial: (body) => { if (!ctrl.signal.aborted && Array.isArray(body.trends) && body.trends.length) setResult({ status: "ok", trends: body.trends, partial: true }); },
    })
      .then((body) => {
        if (ctrl.signal.aborted) return;
        // v7.24 — THE GATE MOVED TO RENDER (see `gatedTrends` below). The
        // owner's rule is unchanged — "the result should be based on the time
        // of the day and weather also, use common sense", 2026-08-11 — but it
        // used to be applied HERE, inside the fetch callback, and this effect
        // has no `weather` dependency.
        //
        // Measured on a cold production load: this rail's searches fire at
        // t≈1.24s and /api/weather does not answer until t≈1.66s. So the gate
        // ran against `weather === null` — which `outdoorGate` correctly reads
        // as "unknown weather, leave everything in" — and then nothing ever
        // re-ran it. This is the ONE rail open by default, so it lost that race
        // on essentially every visit and stayed ungated for the whole session.
        //
        // Deriving it during render instead costs nothing (gateOutdoor is a
        // pure filter over rows already in memory), needs no refetch, and fixes
        // the hour boundary too: a rail opened at 11:29 is re-gated at 11:31
        // when the bucket flips from morning to afternoon.
        const trends = Array.isArray(body.trends) ? body.trends : [];
        setResult({ status: body.status || "trend_data_error", trends, error: body.error || null });
      })
      .catch(() => { if (!ctrl.signal.aborted) setResult({ status: "trend_data_error", trends: [], error: "Trend recommendations are temporarily unavailable." }); });
    return () => ctrl.abort();
  }, [active, retry, city, center && center.lat, center && center.lng]);

  // v7.24 — THE GATE, derived on every render from the CURRENT weather and the
  // CURRENT hour. An outdoor trend match (a rucking route, a forest-bathing
  // trail, a pickleball court) is suppressed when the two make it wrong, and a
  // trend whose matches are all gated renders no module rather than a wrong
  // one. Fails open exactly as before: unreadable weather leaves every row in.
  const gatedTrends = (() => {
    const list = Array.isArray(result.trends) ? result.trends : [];
    if (!list.length || !center || !isFinite(center.lat)) return list;
    try {
      const ctx = nowContext({ lat: center.lat, lng: center.lng, city: city || null, weather: weather || null });
      return list
        .map((t) => ({ ...t, matches: gateOutdoor(t.matches, ctx) }))
        .filter((t) => t.matches.length);
    } catch (e) { return list; }
  })();
  // Every match gated away is an honest empty state, not an error — unless
  // the walk is still running (v8.24 partial), in which case it is simply
  // still loading, not "nothing qualifies".
  const status = result.status === "ok" && !gatedTrends.length ? (result.partial ? "loading" : "no_verified_inventory") : result.status;

  const visibleIdKey = status === "ok"
    ? gatedTrends.flatMap((trend) => trend.matches || []).map((p) => p && p.id).filter(Boolean).join("|")
    : "";
  const photoRefFor = useMissingPlacePhotos(
    status === "ok" ? gatedTrends.flatMap((trend) => trend.matches || []) : [],
    center,
    active && status === "ok"
  );
  useEffect(() => {
    if (onVisibleIds) onVisibleIds(visibleIdKey ? visibleIdKey.split("|") : []);
    // The joined identity list is the value. Depending on the callback identity
    // would report forever because the parent binds the section name inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdKey]);

  useEffect(() => {
    if (status !== "ok" || !gatedTrends.length || impressed.current) return;
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      impressed.current = true;
      try { onLog && onLog("exploding_section_impression", null, { surface: "home", count: gatedTrends.length }); } catch (e) {}
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
          try { onLog && onLog("exploding_section_impression", null, { surface: "home", count: gatedTrends.length }); } catch (e) {}
          try { onLog && onLog("trend_expand", null, { surface: "home", trigger: "default", count: gatedTrends.length }); } catch (e) {}
          try { noteExplodingReturn(onLog); } catch (e) {}
        }
      }
    }, { threshold: 0.12 });
    io.observe(node);
    node.querySelectorAll("[data-exploding-trend]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [status, gatedTrends.length, onLog]);

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
  if (status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Finding verified trends near you" style={{ padding: "4px 0 8px" }}>
        {[0, 1, 2].map((i) => <div key={i} className="wf-sk" style={{ height: 224, borderRadius: 17, marginTop: i ? 16 : 0 }} />)}
      </div>
    );
  }
  if (status === "unsupported_location") {
    return <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, padding: "7px 2px 13px" }}>Exploding Trends Near You is not available in this area yet.</div>;
  }
  if (status === "no_verified_inventory") {
    return <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, padding: "7px 2px 13px" }}>No trend has enough verified local inventory to recommend right now.</div>;
  }
  if (status !== "ok" || !gatedTrends.length) {
    return (
      <div role="alert" style={{ padding: "8px 2px 14px" }}>
        <div style={{ color: "#F8C6B8", fontSize: 13, lineHeight: 1.5 }}>{result.error || "Trend recommendations are temporarily unavailable."}</div>
        <button type="button" onClick={() => setRetry((n) => n + 1)} style={{ marginTop: 8, minHeight: 38, padding: "0 13px", borderRadius: 9, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.04)", color: C.text, fontWeight: 750, cursor: "pointer" }}>Try again</button>
      </div>
    );
  }
  return (
    <div ref={rootRef}>
      {gatedTrends.map((trend, i) => (
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
          isLiked={isLiked}
          isDisliked={isDisliked}
          onSave={onSave}
          onLike={onLike}
          onDislike={onDislike}
          onShare={onShare}
        />
      ))}
      {/* v8.24 — the walk is still searching: one small tail skeleton says
          "more coming" without blocking what is already verified above. */}
      {result.partial ? <div role="status" aria-label="Finding more verified trends" className="wf-sk" style={{ height: 88, borderRadius: 17, marginTop: 16 }} /> : null}
      <div style={{ padding: "10px 2px 8px", color: "#6F7C8D", fontSize: 10.5, lineHeight: 1.45 }}>
        Trend momentum selects experiences. Wayfind Score ranks places. No paid placement.
      </div>
    </div>
  );
}
