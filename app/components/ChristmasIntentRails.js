"use client";
import RailGuideSlot from "./RailGuideSlot";

// Christmas in Florida: eight intent rails behind one poster tap, modeled on
// FallIntentRails (owner, 2026-10-08). Every card is the STANDARD horizontal
// rail card: no seasonal skin, no spooky skin, no Directions button, score
// badge top right. Each rail pages independently via usePagedRail, seeded from
// the one bulk /api/events/christmas fetch (see lib/railPage.js).
import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import RailLoading from "./RailLoading";
import { RailDevError, RailMascotBusy } from "./kit.js";
import { toDisplayScore } from "../../lib/score.js";
import { useCuratorPicks, applyCuratorPicks } from "../../lib/curatorPicks.js";
import { settleRescored, rescoredIds } from "../../lib/lawfulOrder.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { emitRailDegraded, isRailCancelled, railDeveloperFailure } from "../../lib/railFailure.js";
import { fetchClassifiedPosterJson as fetchRailJson } from "../../lib/posterJson.js";
import { RAIL_PAGE_SIZE } from "../../lib/railPage.js";
import { usePagedRail } from "./usePagedRail.js";
import { railRenderState, RAIL_RENDER_STATE } from "../../lib/railVisibility.js";
import useEventClock from "./useEventClock.js";
import { eventVisitStatus, eventRestrictionChips } from "../../lib/eventVisitFacts.js";
import { ownedPlacePhotoSrc } from "../../lib/placePhoto.js";
import { partnerTicketLabel } from "../../lib/partnerCopy.js";
import { CHRISTMAS_CARD_LABELS, christmasDistanceLabel } from "../../lib/christmasCardCopy.js";

const TICKET_SURFACE = "christmas_intent_rail";

const COLORS = { text: "#FFF7ED", muted: "#A99FA8" };
export const CHRISTMAS_LOAD_TIMEOUT_MS = 10000;
const RAIL_COUNT = 8;
const compact = (value) => Number(value) >= 1000 ? Math.round(Number(value) / 100) / 10 + "k" : String(Number(value) || 0);

function eventChips(card, { onOpenVenue = null } = {}) {
  const chips = [];
  // The schedule first: which days and what time, from the row's own clock.
  if (card.schedule?.label) chips.push({ key: "schedule", icon: "🗓", label: card.schedule.label, title: card.schedule.title || card.schedule.label });
  for (const rule of eventRestrictionChips(card)) chips.push({ key: rule, icon: "✓", label: rule });
  if (onOpenVenue) chips.push({ key: "venue", icon: "📍", label: "Venue", title: card.venue || card.name, onClick: onOpenVenue });
  return chips.slice(0, 4);
}

function eventCta(card, onTrack) {
  if (!card.ticket?.href) return null;
  return {
    // /api/commerce/go, never the partner URL: the redirect mints the click id,
    // refuses crawlers and applies the deep link server side.
    label: partnerTicketLabel(card.ticket.via, { product: card.ticket.product, card: true }), href: card.ticket.href, external: true, sponsored: true,
    onClick: (event) => {
      const offerId = card.ticket.offer_id ?? card.ticket.deal_id;
      try { onTrack?.("tickets_out", { kind: TICKET_SURFACE, id: card.id, name: card.name, deal: offerId }); } catch {}
      import("../../lib/commerce.js").then(({ commerceHref, emitCommerce, mintClickId }) => {
        try {
          const clickId = mintClickId();
          const live = commerceHref({ provider: card.ticket.provider || "undercover_tourist", offerId, surface: TICKET_SURFACE, contentId: card.id, clickId });
          if (live && event && event.currentTarget) event.currentTarget.href = live;
          emitCommerce("commerce_cta_clicked", { surface: TICKET_SURFACE, content_id: card.id, provider: card.ticket.provider || "undercover_tourist", merchant: card.ticket.via, offer_id: String(offerId), click_id: clickId, disclosure_version: "fall-intent-v2" });
        } catch {}
      }).catch(() => {});
    },
  };
}

function ChristmasRailSection({ rail, lat, lng, onOpenPlace, onTrack, city, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const seedItems = useMemo(() => (rail.cards || []).slice(0, RAIL_PAGE_SIZE), [rail]);
  const params = useMemo(() => (lat != null && lng != null ? { lat, lng, rail: rail.id } : null), [lat, lng, rail.id]);
  const { items: pagedItems, total, sentinelIndex, sentinelRef, loading, loadingMore, error, fetchMore } = usePagedRail(
    "/api/events/christmas", params, { enabled: !!params, seedItems, seedTotal: (rail.cards || []).length, itemsKey: "cards" },
  );
  const curatorPicks = useCuratorPicks();
  const now = useEventClock();
  const nowStamp = now.getTime();
  // Owner picks on PLACE cards only (events untouched), applied before render.
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
  const railId = "christmas-intent-" + rail.id;
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
      <div className="wf-rail wf-rail-exploding wf-christmas" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}><RailGuideSlot railId={rail.id} guide={rail.guide ?? null} onTrack={onTrack}>
        {items.map((card, index) => {
          const rank = index + 1;
          const isEvent = card.kind === "event";
          const place = isEvent ? null : { ...card, id: card.id, photo: card.image || null, hook: card.take || null };
          // True distance on every card; farther (top up / day trip) and
          // approximate (city centre) locations say so (christmasDistanceLabel).
          const facts = isEvent
            ? [card.city || null, christmasDistanceLabel(card)].filter(Boolean)
            : [card.reviews ? compact(card.reviews) + " reviews" : null, christmasDistanceLabel(card)].filter(Boolean);
          const openEventVenue = isEvent && card.place_id && onOpenPlace
            ? () => onOpenPlace({ id: card.place_id, name: card.venue || card.name, lat: card.lat, lng: card.lng, types: [], hook: card.hook })
            : null;
          const eventBodyHref = isEvent ? (card.detailHref || (!openEventVenue ? card.url || null : null)) : null;
          const eventBodyExternal = isEvent && !card.detailHref;
          return <RailCard key={card.id} className="wf-exploding-primary" domRef={index === Math.min(sentinelIndex, items.length - 1) ? sentinelRef : undefined}
            photo={card.image || null}
            placeholder={isEvent && !card.image ? card.placeholder || null : null}
            photoFallback={isEvent && card.place_id ? ownedPlacePhotoSrc(card.place_id, 640) : null}
            eagerMedia={index < 3}
            visitFacts={isEvent ? card : null}
            photoPosition={card.photoPosition || "50% 50%"}
            photoAttr={card.photoAttr || null} photoAttrHref={card.photoAttrHref || null} place={place}
            title={card.title || card.name} eyebrow={CHRISTMAS_CARD_LABELS[rail.id] || rail.title} rank={rank}
            score={isEvent ? null : toDisplayScore(Number.isFinite(card.governed_score) ? card.governed_score : card.wfScore)} when={isEvent ? card.when : null}
            facts={facts} chips={isEvent ? eventChips(card, { onOpenVenue: card.detailHref ? openEventVenue : null }) : card.seasonChip ? [{ key: "season", icon: "🗓", label: card.seasonChip, title: card.seasonChip + ", " + String(card.take || "").toLowerCase() }] : []}
            take={card.hook || card.take || null} cta={isEvent ? eventCta(card, onTrack) : null}
            creatorVideos={isEvent ? card.creatorReels : undefined}
            href={eventBodyHref} external={eventBodyExternal}
            ariaLabel={`Open ${card.title || card.name}`} onOpen={isEvent ? (card.detailHref ? undefined : openEventVenue || undefined) : (place && onOpenPlace ? () => onOpenPlace(place) : undefined)}
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
      </RailGuideSlot></div>
      {items.length > 1 ? <RailDots railId={railId} count={items.length} /> : null}
    </>
  </section>;
}

export default function ChristmasIntentRails({
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

  useEffect(() => {
    const requestKey = key + "|" + retry;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailure(null);
    let cancelled = false;
    const controller = new AbortController();
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, v: "1" });
    fetchRailJson("/api/events/christmas?" + query.toString(), { timeoutMs: CHRISTMAS_LOAD_TIMEOUT_MS, signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        if (!result || !Array.isArray(result.rails) || result.rails.length !== RAIL_COUNT) {
          setFailure(railDeveloperFailure("invalid_payload", { route: "/api/events/christmas" }));
          return;
        }
        setPayload(result);
        try { onTrack?.("christmas_intent_collection_open", { city, rails: result.rails.map((rail) => rail.id).join(","), cards: result.rails.reduce((sum, rail) => sum + rail.cards.length, 0) }); } catch {}
      })
      .catch((error) => {
        if (cancelled || isRailCancelled(error)) return;
        if (error?.kind === "developer") console.error("[ChristmasIntentRails] request contract failure", error);
        setFailure(error);
      });
    return () => { cancelled = true; controller.abort(); asked.current = ""; };
    // The parent's inline telemetry callback is not request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  if (!active) return null;
  if (!key) return <p style={{ color: COLORS.muted, fontSize: 13 }}>Share your location to rank Florida&apos;s Christmas options for you.</p>;
  if ((!payload && !failure) || (payload?.today && payload.today !== today)) return <RailLoading label="Ranking Florida Christmas plans" />;
  if (failure) return failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="christmas" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "christmas" }); }} />;

  // Each rail links its OWN guide (owner, 2026-10-08), carried server side on
  // rail.guide and placed INSIDE that rail as its third card (RailGuideSlot,
  // lib/railGuideSlot.js): nothing renders between the rails.
  return <>{payload.rails.map((rail) => <ChristmasRailSection key={`${today}:${rail.id}`} rail={rail} lat={lat} lng={lng} onOpenPlace={onOpenPlace} onTrack={onTrack} city={city}
    isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
    onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />)}</>;
}
