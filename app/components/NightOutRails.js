"use client";

import { selectPosterEvents } from "../../lib/posterEvents.js";

// One Night Out answer: ten evidence-gated rails over venue inventory and the
// dated event cards owned by home.js. Events lead each shelf because a dated
// happening is not interchangeable with the building where one might occur.
//
// WO11 (2026-09-02, owner): "load the top ten based on the Wayfind score, and
// as they scroll left, as they pass the seventh card, start loading 10 more
// cards, and 10 more, instead of loading everything at once." Each rail below
// now pages independently via usePagedRail, SEEDED from the one bulk
// /api/night-out fetch this component already made (no extra network round
// trip for page 0 — "rank once, page many"). Scrolling past a rail's 8th
// card fetches page 1 of THAT rail from the same paging contract every other
// poster/rail endpoint speaks (lib/railPage.js). This replaces the old
// "Load every ranked option" button, which fetched all ~130 rows for every
// rail in one blob the instant a reader tapped it.
import { useEffect, useMemo, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import RailLoading from "./RailLoading";
import { directionsUrl } from "./kit";
import { toHookLine } from "../../lib/editorialHook";
import { composeNightOutRails } from "../../lib/nightOutIntent.js";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { priceLabel } from "../../lib/price.js";
import { toDisplayScore } from "../../lib/score.js";
import { wayfindScore } from "../../lib/wayfindScore.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { RAIL_PAGE_SIZE } from "../../lib/railPage.js";
import { usePagedRail } from "./usePagedRail.js";
import { nightTourCacheCovers, nightTourProducts } from "../../lib/nightTourProducts.js";
import NightTourProductCards from "./NightTourProductCards.js";

const C = { text: "#F1F5F9", muted: "#8B93A1" };
const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);
const prettyType = (value) => {
  const text = String(value || "").replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

function NightOutRailSection({
  rail, lat, lng, eventCards, eventsPending, onOpenPlace, city,
  tourProducts = [], toursPending = false, toursFailed = false, onRetryTours = null,
  isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare,
}) {
  const seedItems = useMemo(() => (rail.places || []).slice(0, RAIL_PAGE_SIZE), [rail]);
  const seedTotal = Number.isFinite(rail.total) ? rail.total : (rail.places || []).length;
  const params = useMemo(() => ({ lat: lat.toFixed(2), lng: lng.toFixed(2), rail: rail.id }), [lat, lng, rail.id]);
  const { items, total, sentinelIndex, sentinelRef, loadingMore } = usePagedRail(
    "/api/night-out", params, { seedItems, seedTotal, itemsKey: "places", timeoutMs: 22000 },
  );
  const count = eventCards.length + tourProducts.length + (Number.isFinite(total) ? total : items.length);
  const railId = "night-out-" + rail.id;
  if (!count && (eventsPending || toursPending)) return (
    <section aria-label={rail.title} style={{ marginTop: 22 }}>
      <RailHeading title={rail.title} description={rail.deck} />
      <RailLoading label={`Finding ${rail.title}`} />
    </section>
  );
  if (!count && toursFailed) return (
    <section aria-label={rail.title} style={{ marginTop: 22 }}>
      <RailHeading title={rail.title} description={rail.deck} />
      <p style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>Wayfind could not reach its cached night-tour inventory.</p>
      {onRetryTours ? <button type="button" onClick={onRetryTours} style={{ marginTop: 8, border: "1px solid #4B5563", borderRadius: 999, background: "#111827", color: C.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button> : null}
    </section>
  );
  // A successful empty answer is a real product state, so it has no shelf.
  // Pending and failed reads remain visible above and cannot masquerade as it.
  if (!count) return null;
  // ONE VERIFIED OPTION IS NOT A SHELF (v8.97c).
  //
  // A horizontal rail with a single card promises a choice and delivers one,
  // and it reads worse than the honest empty state directly above. Measured at
  // Parrish AFTER the retrieval fix: Dinner + Entertainment really does have
  // exactly one qualifying place within 27 miles, so this is now genuine
  // scarcity rather than the candidate starvation that used to produce it.
  //
  // The answer is presentation, never data. Nothing is padded, nothing is
  // promoted from a neighbouring rail, and no predicate is loosened to find a
  // second card — it says what it is: the one place that clears this intent.
  // A rail whose thinness is a RETRIEVAL bug must be fixed upstream; this
  // branch is only ever reached when the full owned pool really did yield one.
  const soloItem = count === 1 && eventCards.length === 0 && tourProducts.length === 0 && items.length === 1 ? items[0] : null;
  const soloProduct = count === 1 && eventCards.length === 0 && tourProducts.length === 1 && items.length === 0 ? tourProducts[0] : null;
  if (soloProduct) return (
    <section aria-label={rail.title} style={{ marginTop: 22 }} data-rail-solo={rail.id}>
      <RailHeading title={rail.title} description={rail.deck} />
      <p style={{ margin: "6px 0 10px", fontSize: 12.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#FB923C" }}>
        Best match tonight — the only verified guided night activity in this market
      </p>
      <NightTourProductCards items={[soloProduct]} city={city} />
      <p style={{ margin: "9px 0 0", fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>Wayfind may earn a commission when you book through this Viator link, at no extra cost to you. It never changes our rankings.</p>
    </section>
  );
  if (soloItem) {
    const type = prettyType(soloItem.primaryType || soloItem.primary_type || soloItem.category);
    const href = directionsUrl(soloItem);
    return (
      <section aria-label={rail.title} style={{ marginTop: 22 }} data-rail-solo={rail.id}>
        <RailHeading title={rail.title} description={rail.deck} />
        <p style={{ margin: "6px 0 10px", fontSize: 12.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#FB923C" }}>
          Best match tonight — the only place within 27 miles that clears this
        </p>
        <RailCard className="wf-exploding-primary wf-rail-solo"
          photo={cardImageSrc(soloItem, 640) || null} place={soloItem}
          title={soloItem.name} eyebrow={type} rank={1}
          score={toDisplayScore(wayfindScore(soloItem.rating, soloItem.reviews))}
          facts={[
            soloItem.reviews ? compact(soloItem.reviews) + " reviews" : null,
            priceLabel(soloItem.priceLevel != null ? soloItem.priceLevel : soloItem.priceNum) || null,
            Number.isFinite(soloItem.distMi) ? soloItem.distMi + " mi" : null,
          ].filter(Boolean)}
          take={toHookLine(soloItem.editorial, soloItem.name) || null}
          cta={href ? { label: "Directions ↗", href, external: true } : null}
          ariaLabel={`Open ${soloItem.name}`}
          onOpen={onOpenPlace ? () => onOpenPlace(soloItem) : undefined}
          saved={isSaved ? !!isSaved(soloItem.id) : undefined}
          liked={isLiked ? !!isLiked(soloItem.id) : liked ? !!liked[soloItem.id] : undefined}
          disliked={isDisliked ? !!isDisliked(soloItem.id) : disliked ? !!disliked[soloItem.id] : undefined}
          onSave={onSave ? (event) => onSave(event, soloItem) : undefined}
          onLike={onLike ? (event) => onLike(event, soloItem) : undefined}
          onDislike={onDislike ? (event) => onDislike(event, soloItem) : undefined}
          onShare={onShare ? () => onShare(soloItem, { city }) : undefined} />
      </section>
    );
  }

  return (
    <section aria-label={rail.title} style={{ marginTop: 22 }}>
      <RailHeading title={rail.title} description={rail.deck}>
        <RailNav railId={railId} count={count} total={count} loaded={eventCards.length + tourProducts.length + items.length} unit={count === 1 ? "verified option" : "verified options"} />
      </RailHeading>
      {toursFailed ? <p role="status" style={{ margin: "7px 0", fontSize: 12, color: C.muted }}>
        Cached night-tour products are temporarily unavailable. {onRetryTours ? <button type="button" onClick={onRetryTours} style={{ border: 0, padding: 0, background: "transparent", color: "#FB923C", font: "inherit", fontWeight: 800, cursor: "pointer" }}>Try again</button> : null}
      </p> : null}
      {/* Page 0's `total` (from the seed) is the count RailNav shows, never
          the merely-loaded length — the reader sees "130 ranked options" on
          first paint, not "10". */}
      <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
        {eventCards}
        <NightTourProductCards items={tourProducts} city={city} rankOffset={eventCards.length} />
        {items.map((place, index) => {
          const rank = eventCards.length + tourProducts.length + index + 1;
          const type = prettyType(place.primaryType || place.primary_type || place.category);
          const facts = [
            place.reviews ? compact(place.reviews) + " reviews" : null,
            priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null,
            Number.isFinite(place.distMi) ? place.distMi + " mi" : null,
          ].filter(Boolean);
          const href = directionsUrl(place);
          return <RailCard key={place.id} className="wf-exploding-primary"
            domRef={index === sentinelIndex ? sentinelRef : undefined}
            photo={cardImageSrc(place, 640) || null} place={place}
            title={place.name} eyebrow={type} rank={rank}
            score={toDisplayScore(wayfindScore(place.rating, place.reviews))}
            facts={facts} take={toHookLine(place.editorial, place.name) || null}
            cta={href ? { label: "Directions ↗", href, external: true } : null}
            ariaLabel={`Open ${place.name}`}
            onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
            saved={isSaved ? !!isSaved(place.id) : undefined}
            liked={isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined}
            disliked={isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined}
            onSave={onSave ? (event) => onSave(event, place) : undefined}
            onLike={onLike ? (event) => onLike(event, place) : undefined}
            onDislike={onDislike ? (event) => onDislike(event, place) : undefined}
            onShare={onShare ? () => onShare(place, { city }) : undefined} />;
        })}
        {/* Never a whole-rail skeleton for page ≥1 — a small end-of-rail
            spinner card in place instead, so the reader keeps scrolling
            through what has already loaded while the next ten arrive. */}
        {loadingMore ? <div className="wf-rail-card wf-exploding-primary wf-sk" role="status" aria-busy="true" aria-label={`Loading more ${rail.title}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 88, color: C.muted, fontSize: 12.5 }}>Loading more…</div> : null}
      </div>
      {tourProducts.length ? <p style={{ margin: "9px 0 0", fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>Wayfind may earn a commission when you book through these Viator links, at no extra cost to you. It never changes our rankings.</p> : null}
      {eventCards.length + tourProducts.length + items.length > 1 ? <RailDots railId={railId} count={eventCards.length + tourProducts.length + items.length} /> : null}
    </section>
  );
}

export default function NightOutRails({
  active = true, places = [], center = null, city = "", eventsSlot = null,
  onOpenPlace = null, isSaved, liked, disliked, isLiked, isDisliked,
  onSave, onLike, onDislike, onShare,
}) {
  const fallback = useMemo(() => composeNightOutRails([], places, center || {}), [places, center]);
  const [remoteResult, setRemote] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tourResult, setTourResult] = useState(null);
  const [toursFailed, setToursFailed] = useState(false);
  const [tourRetry, setTourRetry] = useState(0);
  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;
  // The bulk request still runs, unchanged: it hydrates the fail-soft
  // fallback path and gives every rail its page-0 SEED (see
  // NightOutRailSection above), which is what keeps first paint exactly as
  // fast as before — no rail waits on a second round trip to show its first
  // ten cards.
  const key = active && Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(2)}|${lng.toFixed(2)}|${retry}` : "";
  useEffect(() => {
    if (!key) return;
    let dead = false;
    setRemote(null);
    setFailed(false);
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng });
    // Allow the bounded server pool plus hydration path to finish.
    fetchJsonWithDeadline("/api/night-out?" + query.toString(), { timeoutMs: 22000, retries: 1 })
      .then((value) => {
        if (dead) return;
        if (!Array.isArray(value?.rails)) { setFailed(true); return; }
        setRemote({ key, value });
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, [key]);
  useEffect(() => {
    if (!key) return;
    let dead = false;
    setTourResult(null);
    setToursFailed(false);
    const [queryLat, queryLng] = key.split("|");
    if (!nightTourCacheCovers({ lat: Number(queryLat), lng: Number(queryLng) }, 27)) {
      setTourResult({ key, items: [] });
      return;
    }
    const query = new URLSearchParams({
      lat: queryLat, lng: queryLng, mi: "27", cat: "concept:night-tours", limit: "100", page: "0",
    });
    // Owned cache only. `/api/experiences` reads wf_experiences and never
    // spends a provider call when this market has no matching inventory.
    fetchJsonWithDeadline("/api/experiences?" + query.toString(), { timeoutMs: 10000 })
      .then((value) => {
        if (dead) return;
        // `reason: empty` is the cache route's healthy zero-row result for the
        // selected market. Configuration/table/read failures use other reasons
        // and stay visibly distinct from that legitimate empty state.
        if (!Array.isArray(value?.items) || (value?.dark && value?.reason !== "empty")) { setToursFailed(true); return; }
        setTourResult({ key, items: nightTourProducts(value.items) });
      })
      .catch(() => { if (!dead) setToursFailed(true); });
    return () => { dead = true; };
  }, [key, tourRetry]);
  const remote = remoteResult?.key === key ? remoteResult.value : null;
  const scopedTours = tourResult?.key === key ? tourResult.items : null;
  const payload = remote || fallback;
  const eventSurface = active && eventsSlot ? eventsSlot("night-out", selectPosterEvents) : null;
  const hasPlaces = payload.rails.some((rail) => rail.places.length);
  const hasContent = hasPlaces || !!scopedTours?.length
    || Object.values(eventSurface?.byRail || {}).some((cards) => Array.isArray(cards) && cards.length);

  if (!active) return null;
  if (!key) return <p style={{ color: C.muted, fontSize: 13 }}>Choose a location to see Night Out places near you.</p>;

  if (!remote && !failed && !hasContent) {
    return <RailLoading label="Building Night Out" />;
  }

  if (failed && !hasContent) {
    return <div><p style={{ color: C.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s Night Out inventory. That is a service miss, not an empty town.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #4B5563", borderRadius: 999, background: "#111827", color: C.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;
  }

  return <>{failed ? <p role="status" style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>Some venue results are unavailable. Available events and tours are shown below.</p> : null}{eventSurface?.failed ? <p role="status" style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>Wayfind could not reach current event inventory. Venue and cached tour results are still available.</p> : null}{payload.rails.map((rail) => {
    const eventCards = Array.isArray(eventSurface?.byRail?.[rail.id]) ? eventSurface.byRail[rail.id] : [];
    const isNightTourRail = rail.id === "night-tours";
    return <NightOutRailSection key={rail.id} rail={rail} lat={Number.isFinite(lat) ? lat : 0} lng={Number.isFinite(lng) ? lng : 0}
      eventCards={eventCards} eventsPending={!!eventSurface?.pending} onOpenPlace={onOpenPlace} city={city}
      tourProducts={isNightTourRail ? (scopedTours || []) : []}
      toursPending={isNightTourRail && !scopedTours && !toursFailed}
      toursFailed={isNightTourRail && toursFailed}
      onRetryTours={isNightTourRail ? () => setTourRetry((value) => value + 1) : null}
      isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
      onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />;
  })}</>;
}
