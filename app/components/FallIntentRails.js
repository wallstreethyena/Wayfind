"use client";

// WO11 (2026-09-02): each of Fall Intent's ten rails now pages independently
// via usePagedRail, seeded from the one bulk /api/events/fall fetch below (no
// extra round trip for page 0) and streaming ten more per rail as the reader
// scrolls past the 8th card — see app/components/usePagedRail.js and
// lib/railPage.js for the shared contract every poster/rail endpoint speaks.
import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { directionsUrl } from "./kit";
import { toDisplayScore } from "../../lib/score.js";
import { fallSkinLive } from "../../lib/fallSkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { RAIL_PAGE_SIZE } from "../../lib/railPage.js";
import { usePagedRail } from "./usePagedRail.js";

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
  if (card.minimum_age) chips.push({ key: "age", icon: "✓", label: `${card.minimum_age}+` });
  if (card.is_free) chips.push({ key: "free", icon: "✓", label: "Free" });
  // The venue keeps its door: the card body now opens the EVENT page, so the
  // place sheet (saves, photos, directions) moves to a chip.
  if (onOpenVenue) chips.push({ key: "venue", icon: "📍", label: "Venue", title: card.venue || card.name, onClick: onOpenVenue });
  return chips.slice(0, 4);
}

function eventCta(card, onTrack) {
  if (card.ticket?.href) return {
    // /api/commerce/go, never the partner URL: the redirect mints the click
    // id, refuses crawlers, and applies the CJ deep link server-side.
    label: card.ticket.label || `Tickets · ${card.ticket.via} ↗`, href: card.ticket.href, external: true, sponsored: true,
    onClick: (event) => {
      try { onTrack?.("tickets_out", { kind: "fall_intent_rail", id: card.id, name: card.name, deal: card.ticket.deal_id }); } catch {}
      import("../../lib/commerce.js").then(({ commerceHref, emitCommerce, mintClickId }) => {
        try {
          const clickId = mintClickId();
          const live = commerceHref({ provider: card.ticket.provider || "undercover_tourist", offerId: card.ticket.deal_id, surface: "fall_intent_rail", contentId: card.id, clickId });
          if (live && event && event.currentTarget) event.currentTarget.href = live;
          emitCommerce("commerce_cta_clicked", { surface: "fall_intent_rail", content_id: card.id, provider: card.ticket.provider || "undercover_tourist", merchant: card.ticket.via, offer_id: String(card.ticket.deal_id), click_id: clickId, disclosure_version: "fall-intent-v2" });
        } catch {}
      }).catch(() => {});
    },
  };
  if (card.url) return { label: "Event details ↗", href: card.url, external: true, onClick: () => onTrack?.("fall_event_open", { id: card.id, name: card.name }) };
  return null;
}

function FallRailSection({ rail, lat, lng, onOpenPlace, onTrack, city, fallSkin, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const seedItems = useMemo(() => (rail.cards || []).slice(0, RAIL_PAGE_SIZE), [rail]);
  const params = useMemo(() => (lat != null && lng != null ? { lat, lng, rail: rail.id } : null), [lat, lng, rail.id]);
  const { items, total, sentinelIndex, sentinelRef, loadingMore } = usePagedRail(
    "/api/events/fall", params, { enabled: !!params, seedItems, seedTotal: (rail.cards || []).length, itemsKey: "cards" },
  );
  const cardCount = Number.isFinite(total) ? total : items.length;
  const railId = "fall-intent-" + rail.id;
  return <section aria-label={rail.title} style={{ marginTop: 22 }}>
    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 850, color: COLORS.text }}>{rail.title}</h2>
    <p className="wf-rail-deck" style={{ color: "#C9BFC6" }}>{rail.deck}</p>
    {!items.length ? <p style={{ margin: "8px 0 0", fontSize: 13, color: COLORS.muted }}>No nearby option has enough current evidence for this rail yet. Wayfind will not fill it with a seasonal look-alike.</p> : <>
      <RailNav railId={railId} count={cardCount} total={cardCount} unit={cardCount === 1 ? "ranked option" : "ranked options"} />
      <div className={`wf-rail wf-rail-exploding${fallSkin ? " wf-fall" : ""}`} data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
        {items.map((card, index) => {
          const rank = index + 1;
          const isEvent = card.kind === "event";
          const place = isEvent ? null : { ...card, id: card.id, photo: card.image || null, hook: card.take || null };
          const facts = isEvent
            ? [card.city || null, card.is_free ? "Free" : card.price_band || null, Number.isFinite(card.distMi) ? card.distMi + " mi" : null].filter(Boolean)
            : [card.bestTime || null, card.reviews ? compact(card.reviews) + " reviews" : null, Number.isFinite(card.distMi) ? card.distMi + " mi" : null].filter(Boolean);
          const placeChips = !isEvent && card.shotLocation ? [
            { key: "shot", icon: "📍", label: "Exact shot", title: card.shotLocation },
            card.accessNote ? { key: "access", icon: "✓", label: "Check access", title: card.accessNote } : null,
            card.sourceUrl ? { key: "proof", icon: "↗", label: "Proof source", title: "Open the official source", onClick: () => window.open(card.sourceUrl, "_blank", "noopener,noreferrer") } : null,
          ].filter(Boolean) : [];
          const cta = isEvent ? eventCta(card, onTrack) : (() => { const href = directionsUrl(place); return href ? { label: "Directions ↗", href, external: true } : null; })();
          const openEventVenue = isEvent && card.place_id && onOpenPlace
            ? () => onOpenPlace({ id: card.place_id, name: card.venue || card.name, lat: card.lat, lng: card.lng, types: [], hook: card.hook })
            : null;
          const eventBodyHref = isEvent ? (card.detailHref || (!openEventVenue ? card.url || null : null)) : null;
          const eventBodyExternal = isEvent && !card.detailHref;
          return <RailCard key={card.id} className="wf-exploding-primary" domRef={index === sentinelIndex ? sentinelRef : undefined}
            photo={card.image || null} place={place}
            title={card.title || card.name} eyebrow={rail.title} rank={rank}
            score={isEvent ? null : toDisplayScore(card.wfScore)} when={isEvent ? card.when : null}
            facts={facts} chips={isEvent ? eventChips(card, { onOpenVenue: card.detailHref ? openEventVenue : null }) : placeChips}
            take={card.hook || (card.shotLocation ? `${card.shotLocation}. ${card.take} ${card.fallReason || ""}`.trim() : card.take) || null} cta={cta}
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
        {loadingMore ? <div className="wf-rail-card wf-exploding-primary" aria-busy="true" aria-label={`Loading more ${rail.title}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 88, color: COLORS.muted, fontSize: 12.5 }}>Loading more…</div> : null}
      </div>
      {items.length > 1 ? <RailDots railId={railId} count={items.length} /> : null}
    </>}
  </section>;
}

export default function FallIntentRails({
  active = true, center = null, city = "", onOpenPlace = null, onTrack = null,
  isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare,
}) {
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const asked = useRef("");
  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;
  const key = useMemo(() => active && lat != null && lng != null ? `${lat.toFixed(2)}|${lng.toFixed(2)}` : "", [active, lat, lng]);
  const fallSkin = fallSkinLive(siteTodayStr());

  useEffect(() => {
    const requestKey = `${key}|${retry}`;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailed(false);
    let cancelled = false;
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, v: "2" });
    fetchJsonWithDeadline("/api/events/fall?" + query.toString(), { timeoutMs: FALL_LOAD_TIMEOUT_MS })
      .then((result) => {
        if (cancelled) return;
        if (!result || !Array.isArray(result.rails) || result.rails.length !== 10) { setFailed(true); return; }
        setPayload(result);
        try { onTrack?.("fall_intent_collection_open", { city, phase: result.phase, rails: result.rails.map((rail) => rail.id).join(","), cards: result.rails.reduce((sum, rail) => sum + rail.cards.length, 0) }); } catch {}
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // `onTrack` is intentionally not a dependency. The parent supplies an
    // inline telemetry callback and can re-render while this request is in
    // flight; treating that callback identity as data aborts the request, then
    // the duplicate-request guard refuses to restart it, leaving a permanent
    // skeleton. Location and an explicit retry are the request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  if (!active) return null;
  if (!key) return <p style={{ color: COLORS.muted, fontSize: 13 }}>Share your location to rank Florida&apos;s fall options for you.</p>;
  if (!payload && !failed) return <div role="status" aria-busy="true" aria-label="Ranking Florida fall experiences">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#140C12" }} />)}</div>;
  if (failed) return <div><p style={{ color: COLORS.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s verified fall inventory. That is a service miss, not an empty city.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: COLORS.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;

  return <>{payload.rails.map((rail) => (
    <FallRailSection key={rail.id} rail={rail} lat={lat} lng={lng} onOpenPlace={onOpenPlace} onTrack={onTrack} city={city} fallSkin={fallSkin}
      isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
      onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />
  ))}</>;
}
