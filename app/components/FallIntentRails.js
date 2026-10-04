"use client";
import GuideRailCollection from "./GuideRailCollection";

// WO11 (2026-09-02): each of Fall Intent's ten rails now pages independently
// via usePagedRail, seeded from the one bulk /api/events/fall fetch below (no
// extra round trip for page 0) and streaming ten more per rail as the reader
// scrolls past the 8th card — see app/components/usePagedRail.js and
// lib/railPage.js for the shared contract every poster/rail endpoint speaks.
import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import RailLoading from "./RailLoading";
import { directionsUrl, RailDevError, RailMascotBusy } from "./kit.js";
import { toDisplayScore } from "../../lib/score.js";
import { useCuratorPicks, applyCuratorPicks } from "../../lib/curatorPicks.js";
import { settleRescored, rescoredIds } from "../../lib/lawfulOrder.js";
import { fallSkinLive } from "../../lib/fallSkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { emitRailDegraded, isRailCancelled, railDeveloperFailure } from "../../lib/railFailure.js";
import { fetchClassifiedPosterJson as fetchRailJson } from "../../lib/posterJson.js";
import { RAIL_PAGE_SIZE } from "../../lib/railPage.js";
import { usePagedRail } from "./usePagedRail.js";
import { railRenderState, RAIL_RENDER_STATE } from "../../lib/railVisibility.js";
import FallRecommendedHotels from "./FallRecommendedHotels.js";
import useEventClock from "./useEventClock.js";
import { eventVisitStatus, eventRestrictionChips } from "../../lib/eventVisitFacts.js";
import { partnerTicketLabel } from "../../lib/partnerCopy.js";
import { ownedPlacePhotoSrc } from "../../lib/placePhoto.js";

const COLORS = { text: "#FFF7ED", muted: "#A99FA8" };
export const FALL_LOAD_TIMEOUT_MS = 10000;
const compact = (value) => Number(value) >= 1000 ? Math.round(Number(value) / 100) / 10 + "k" : String(Number(value) || 0);

function eventChips(card, { onOpenVenue = null } = {}) {
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const audience = Array.isArray(card.audience) ? card.audience : [];
  const chips = [];
  // THE SCHEDULE FIRST (owner, 2026-09-03: "I cannot have someone be
  // interested and not know when they will be able to go"). Which days and
  // what time, from the row's own clock and verified note; the full note is
  // the title. No schedule on the row -> no chip, never a template.
  if (card.schedule?.label) chips.push({ key: "schedule", icon: "🗓", label: card.schedule.label, title: card.schedule.title || card.schedule.label });
  if (tags.includes("scary")) chips.push({ key: "scary", icon: "👻", label: "Intense scares" });
  else if (audience.includes("families") || audience.includes("kids")) chips.push({ key: "family", icon: "🎃", label: "Family-friendly" });
  for (const rule of eventRestrictionChips(card)) chips.push({ key: rule, icon: "✓", label: rule });
  // The venue keeps its door: the card body now opens the EVENT page, so the
  // place sheet (saves, photos, directions) moves to a chip.
  if (onOpenVenue) chips.push({ key: "venue", icon: "📍", label: "Venue", title: card.venue || card.name, onClick: onOpenVenue });
  return chips;
}

function eventCta(card, onTrack) {
  if (card.ticket?.href) return {
    // /api/commerce/go, never the partner URL: the redirect mints the click
    // id, refuses crawlers, and applies the CJ deep link server-side.
    label: partnerTicketLabel(card.ticket.via, { product: card.ticket.product }), href: card.ticket.href, external: true, sponsored: true,
    onClick: (event) => {
      // offerId: deal_id (a wf_deals int) for Undercover Tourist, offer_id (a
      // partnerOfferRegistry key) for Tiqets/Klook — eventTicketCta sets
      // exactly one of the two depending on card.ticket.provider, never both.
      const offerId = card.ticket.offer_id ?? card.ticket.deal_id;
      try { onTrack?.("tickets_out", { kind: "fall_intent_rail", id: card.id, name: card.name, deal: offerId }); } catch {}
      import("../../lib/commerce.js").then(({ commerceHref, emitCommerce, mintClickId }) => {
        try {
          const clickId = mintClickId();
          const live = commerceHref({ provider: card.ticket.provider || "undercover_tourist", offerId, surface: "fall_intent_rail", contentId: card.id, clickId });
          if (live && event && event.currentTarget) event.currentTarget.href = live;
          emitCommerce("commerce_cta_clicked", { surface: "fall_intent_rail", content_id: card.id, provider: card.ticket.provider || "undercover_tourist", merchant: card.ticket.via, offer_id: String(offerId), click_id: clickId, disclosure_version: "fall-intent-v2" });
        } catch {}
      }).catch(() => {});
    },
  };
  if (card.url) return { label: "Official details ↗", href: card.url, external: true, onClick: () => onTrack?.("fall_event_open", { id: card.id, name: card.name }) };
  return null;
}

function FallRailSection({ rail, lat, lng, onOpenPlace, onTrack, city, fallSkin, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const seedItems = useMemo(() => (rail.cards || []).slice(0, RAIL_PAGE_SIZE), [rail]);
  const params = useMemo(() => (lat != null && lng != null ? { lat, lng, rail: rail.id } : null), [lat, lng, rail.id]);
  const { items: pagedItems, total, sentinelIndex, sentinelRef, loading, loadingMore, error, fetchMore } = usePagedRail(
    "/api/events/fall", params, { enabled: !!params, seedItems, seedTotal: (rail.cards || []).length, itemsKey: "cards" },
  );
  const curatorPicks = useCuratorPicks();
  const now = useEventClock();
  const nowStamp = now.getTime();
  // Owner picks on PLACE cards only (events untouched), applied before render (lib/curatorPicks.js).
  // A re-scored place settles among the place slots; event slots and the date-first order stay put.
  const items = useMemo(() => {
    const currentItems = pagedItems.filter((card) => card.kind !== "event" || !eventVisitStatus(card, new Date(nowStamp))?.expired);
    const slots = [], places = [];
    currentItems.forEach((c, i) => { if (c && c.kind !== "event") { slots.push(i); places.push(c); } });
    const next = applyCuratorPicks(places, curatorPicks);
    if (next === places) return currentItems;
    const settled = settleRescored(next, rescoredIds(places, next));
    const out = currentItems.slice();
    slots.forEach((slot, n) => { out[slot] = settled[n]; });
    return out;
  }, [pagedItems, curatorPicks, nowStamp]);
  const cardCount = Number.isFinite(total) ? Math.max(items.length, total - (pagedItems.length - items.length)) : items.length;
  const railId = "fall-intent-" + rail.id;
  const renderState = railRenderState(items, { loading, error });
  if (renderState === RAIL_RENDER_STATE.HIDDEN) return null;
  if (renderState === RAIL_RENDER_STATE.LOADING) return <section aria-label={rail.title} style={{ marginTop: 22 }}>
    <RailHeading title={rail.title} description={rail.deck} />
    <RailLoading label={`Loading ${rail.title}`} />
  </section>;
  if (renderState === RAIL_RENDER_STATE.ERROR) return <section aria-label={rail.title} style={{ marginTop: 22 }}>
    <RailHeading title={rail.title} description={rail.deck} />
    <p style={{ margin: "8px 0", fontSize: 13, color: COLORS.muted }}>We could not reach this rail&apos;s verified inventory.</p>
    <button type="button" disabled={loadingMore} onClick={fetchMore} style={{ border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: COLORS.text, padding: "7px 12px", fontWeight: 800 }}>{loadingMore ? "Trying again…" : "Try again"}</button>
  </section>;
  return <section aria-label={rail.title} style={{ marginTop: 22 }}>
    <RailHeading title={rail.title} description={rail.deck}>
      <RailNav railId={railId} count={cardCount} total={cardCount} loaded={items.length} unit={cardCount === 1 ? "ranked option" : "ranked options"} />
    </RailHeading>
    <>
      <div className={`wf-rail wf-rail-exploding${fallSkin ? " wf-fall" : ""}`} data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
        {items.map((card, index) => {
          const rank = index + 1;
          const isEvent = card.kind === "event";
          const place = isEvent ? null : { ...card, id: card.id, photo: card.image || null, hook: card.take || null };
          const facts = isEvent
            ? [card.city || null, Number.isFinite(card.distMi) ? card.distMi + " mi" : null].filter(Boolean)
            : [card.bestTime || null, card.reviews ? compact(card.reviews) + " reviews" : null, Number.isFinite(card.distMi) ? card.distMi + " mi" : null].filter(Boolean);
          const placeChips = !isEvent && card.shotLocation ? [
            { key: "shot", icon: "📍", label: "Exact shot", title: card.shotLocation },
            card.accessNote ? { key: "access", icon: "✓", label: "Check access", title: card.accessNote } : null,
            card.sourceUrl ? { key: "proof", icon: "↗", label: "Proof source", title: "Open the official source", onClick: () => window.open(card.sourceUrl, "_blank", "noopener,noreferrer") } : null,
          ].filter(Boolean) : [];
          const cta = isEvent ? eventCta(card, onTrack) : null;
          const openEventVenue = isEvent && card.place_id && onOpenPlace
            ? () => onOpenPlace({ id: card.place_id, name: card.venue || card.name, lat: card.lat, lng: card.lng, types: [], hook: card.hook })
            : null;
          const eventBodyHref = isEvent ? (card.detailHref || (card.officialOnly || !openEventVenue ? card.url || null : null)) : null;
          const eventBodyExternal = isEvent && !card.detailHref;
          return <RailCard key={card.id} className="wf-exploding-primary" domRef={index === Math.min(sentinelIndex, items.length - 1) ? sentinelRef : undefined}
            photo={card.image || null}
            photoFallback={isEvent && card.place_id ? ownedPlacePhotoSrc(card.place_id, 640) : null}
            eagerMedia={index < 3}
            visitFacts={isEvent ? card : null} planningHref={isEvent ? card.detailHref : null}
            photoCaption={isEvent && card.imageIsVenue ? "Venue photo · event not pictured" : null}
            photoPosition={card.photoPosition || "50% 50%"}
            photoAttr={card.photoAttr || (card.image?.startsWith("/api/photo?") ? "Google Maps" : null)} photoAttrHref={card.photoAttrHref || (card.image?.startsWith("/api/photo?") && card.place_id ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.venue || card.name)}&query_place_id=${encodeURIComponent(card.place_id)}` : null)} place={place}
            creatorVideos={isEvent ? card.creatorReels : undefined}
            title={card.title || card.name} eyebrow={rail.title} rank={rank}
            score={isEvent ? null : toDisplayScore(Number.isFinite(card.governed_score) ? card.governed_score : card.wfScore)} when={isEvent ? card.when : null}
            facts={facts} chips={isEvent ? eventChips(card, { onOpenVenue: card.detailHref || card.officialOnly ? openEventVenue : null }) : placeChips}
            take={card.hook || (card.shotLocation ? `${card.shotLocation}. ${card.take} ${card.fallReason || ""}`.trim() : card.take) || null} cta={cta}
            href={eventBodyHref} external={eventBodyExternal}
            ariaLabel={`Open ${card.title || card.name}`} onOpen={isEvent ? (card.detailHref || card.officialOnly ? undefined : openEventVenue || undefined) : (place && onOpenPlace ? () => onOpenPlace(place) : undefined)}
            actionItem={isEvent ? { id: card.id, type: "event", title: card.title || card.name, image: card.image || null, url: eventBodyHref || card.url || "", provider: card.source || null } : null}
            saved={place && isSaved ? !!isSaved(place.id) : undefined}
            liked={place && (isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined)}
            disliked={place && (isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined)}
            onSave={place && onSave ? (event) => onSave(event, place) : undefined}
            onLike={place && onLike ? (event) => onLike(event, place) : undefined}
            onDislike={place && onDislike ? (event) => onDislike(event, place) : undefined}
            onShare={place && onShare ? () => onShare(place, { city }) : undefined} />;
        })}
        {loadingMore ? <div className="wf-rail-card wf-exploding-primary wf-sk" role="status" aria-busy="true" aria-label={`Loading more ${rail.title}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 88, color: COLORS.muted, fontSize: 12.5 }}>Loading more…</div> : null}
      </div>
      {items.length > 1 ? <RailDots railId={railId} count={items.length} /> : null}
    </>
  </section>;
}

export default function FallIntentRails({
  active = true, center = null, city = "", onOpenPlace = null, onTrack = null,
  isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare,
}) {
  const [payload, setPayload] = useState(null);
  const [failure, setFailure] = useState(null);
  const [retry, setRetry] = useState(0);
  const asked = useRef("");
  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;
  const clock = useEventClock(active);
  const today = siteTodayStr(clock);
  const key = useMemo(() => active && lat != null && lng != null ? `${lat.toFixed(2)}|${lng.toFixed(2)}|${today}` : "", [active, lat, lng, today]);
  const fallSkin = fallSkinLive(siteTodayStr());

  useEffect(() => {
    const requestKey = key + "|" + retry;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailure(null);
    let cancelled = false;
    const controller = new AbortController();
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, v: "2" });
    fetchRailJson("/api/events/fall?" + query.toString(), { timeoutMs: FALL_LOAD_TIMEOUT_MS, signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        if (!result || !Array.isArray(result.rails) || result.rails.length !== 10) {
          setFailure(railDeveloperFailure("invalid_payload", { route: "/api/events/fall" }));
          return;
        }
        setPayload(result);
        try { onTrack?.("fall_intent_collection_open", { city, phase: result.phase, rails: result.rails.map((rail) => rail.id).join(","), cards: result.rails.reduce((sum, rail) => sum + rail.cards.length, 0) }); } catch {}
      })
      .catch((error) => {
        if (cancelled || isRailCancelled(error)) return;
        if (error?.kind === "developer") console.error("[FallIntentRails] request contract failure", error);
        setFailure(error);
      });
    return () => { cancelled = true; controller.abort(); asked.current = ""; };
    // The parent's inline telemetry callback is not request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  if (!active) return null;
  if (!key) return <p style={{ color: COLORS.muted, fontSize: 13 }}>Share your location to rank Florida&apos;s fall options for you.</p>;
  if ((!payload && !failure) || (payload?.today && payload.today !== today)) return <RailLoading label="Ranking Florida fall experiences" />;
  if (failure) return failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="fall" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "fall" }); }} />;

  return <>
    <GuideRailCollection rails={payload.rails} collectionId="fall">{payload.rails.map((rail) => <FallRailSection key={`${today}:${rail.id}`} rail={rail} lat={lat} lng={lng} onOpenPlace={onOpenPlace} onTrack={onTrack} city={city} fallSkin={fallSkin}
      isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
      onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />)}</GuideRailCollection>
    <FallRecommendedHotels center={center} />
  </>;
}
