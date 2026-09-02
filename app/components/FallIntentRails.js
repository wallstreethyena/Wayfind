"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { directionsUrl } from "./kit";
import { toDisplayScore } from "../../lib/score.js";
import { fallSkinLive } from "../../lib/fallSkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { railScrollNeedsMore } from "../../lib/railResponse.js";

const COLORS = { text: "#FFF7ED", muted: "#A99FA8" };
export const FALL_LOAD_TIMEOUT_MS = 10000;
const compact = (value) => Number(value) >= 1000 ? Math.round(Number(value) / 100) / 10 + "k" : String(Number(value) || 0);

function eventChips(card) {
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const audience = Array.isArray(card.audience) ? card.audience : [];
  const chips = [];
  if (tags.includes("scary")) chips.push({ key: "scary", icon: "👻", label: "Intense scares" });
  else if (audience.includes("families") || audience.includes("kids")) chips.push({ key: "family", icon: "🎃", label: "Family-friendly" });
  if (card.minimum_age) chips.push({ key: "age", icon: "✓", label: `${card.minimum_age}+` });
  if (card.is_free) chips.push({ key: "free", icon: "✓", label: "Free" });
  if (card.select_nights) chips.push({ key: "nights", icon: "🌙", label: "Select nights" });
  return chips.slice(0, 3);
}

function eventCta(card, onTrack) {
  if (card.ticket?.href) return {
    label: `Tickets · ${card.ticket.via} ↗`, href: card.ticket.href, external: true, sponsored: true,
    onClick: () => {
      try { onTrack?.("tickets_out", { kind: "fall_intent_rail", id: card.id, name: card.name, deal: card.ticket.deal_id }); } catch {}
      import("../../lib/commerce.js").then(({ emitCommerce, mintClickId }) => {
        try { emitCommerce("commerce_cta_clicked", { surface: "fall_intent_rail", content_id: card.id, provider: "undercover_tourist", merchant: card.ticket.via, offer_id: String(card.ticket.deal_id), click_id: mintClickId(), disclosure_version: "fall-intent-v1" }); } catch {}
      }).catch(() => {});
    },
  };
  if (card.url) return { label: "Event details ↗", href: card.url, external: true, onClick: () => onTrack?.("fall_event_open", { id: card.id, name: card.name }) };
  return null;
}

export default function FallIntentRails({
  active = true, center = null, city = "", onOpenPlace = null, onTrack = null,
  isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare,
}) {
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [full, setFull] = useState(false);
  const asked = useRef("");
  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;
  const key = useMemo(() => active && lat != null && lng != null ? `${lat.toFixed(2)}|${lng.toFixed(2)}` : "", [active, lat, lng]);
  const fallSkin = fallSkinLive(siteTodayStr());

  useEffect(() => {
    const requestKey = `${key}|${retry}|${full ? "full" : "first"}`;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailed(false);
    let cancelled = false;
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, v: "2" });
    if (full) query.set("full", "1");
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
  }, [key, retry, full]);

  if (!active) return null;
  if (!key) return <p style={{ color: COLORS.muted, fontSize: 13 }}>Share your location to rank Florida&apos;s fall options for you.</p>;
  if (!payload && !failed) return <div role="status" aria-busy="true" aria-label="Ranking Florida fall experiences">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#140C12" }} />)}</div>;
  if (failed) return <div><p style={{ color: COLORS.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s verified fall inventory. That is a service miss, not an empty city.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: COLORS.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;

  return <>{payload.rails.map((rail) => {
    const railId = "fall-intent-" + rail.id;
    return <section key={rail.id} aria-label={rail.title} style={{ marginTop: 22 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 850, color: COLORS.text }}>{rail.title}</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "#C9BFC6" }}>{rail.deck}</p>
      {!rail.cards.length ? <p style={{ margin: "8px 0 0", fontSize: 13, color: COLORS.muted }}>No nearby option has enough current evidence for this rail yet. Wayfind will not fill it with a seasonal look-alike.</p> : <>
        <RailNav railId={railId} count={rail.total || rail.cards.length} total={rail.cards.length} unit={(rail.total || rail.cards.length) === 1 ? "ranked option" : "ranked options"} />
        <div className={`wf-rail wf-rail-exploding${fallSkin ? " wf-fall" : ""}`} data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}
          onScroll={(event) => { if (!full && payload.hasMore && railScrollNeedsMore(event.currentTarget)) setFull(true); }}>
          {rail.cards.map((card, index) => {
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
            return <RailCard key={card.id} className="wf-exploding-primary" photo={card.image || null} place={place}
              title={card.title || card.name} eyebrow={rail.title} rank={rank}
              score={isEvent ? null : toDisplayScore(card.wfScore)} when={isEvent ? card.when : null}
              facts={facts} chips={isEvent ? eventChips(card) : placeChips}
              take={card.hook || (card.shotLocation ? `${card.shotLocation}. ${card.take} ${card.fallReason || ""}`.trim() : card.take) || null} cta={cta}
              href={isEvent && !openEventVenue ? (card.url || null) : null} external={isEvent}
              ariaLabel={`Open ${card.title || card.name}`} onOpen={openEventVenue || (place && onOpenPlace ? () => onOpenPlace(place) : undefined)}
              actionsReadOnly={isEvent}
              saved={place && isSaved ? !!isSaved(place.id) : undefined}
              liked={place && (isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined)}
              disliked={place && (isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined)}
              onSave={place && onSave ? (event) => onSave(event, place) : undefined}
              onLike={place && onLike ? (event) => onLike(event, place) : undefined}
              onDislike={place && onDislike ? (event) => onDislike(event, place) : undefined}
              onShare={place && onShare ? () => onShare(place, { city }) : undefined} />;
          })}
        </div>
        {rail.cards.length > 1 ? <RailDots railId={railId} count={rail.cards.length} /> : null}
      </>}
    </section>;
  })}{payload.hasMore && !full ? <button type="button" onClick={() => setFull(true)} style={{ marginTop: 18, border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: COLORS.text, padding: "9px 14px", fontWeight: 800 }}>Load every verified fall option</button> : null}</>;
}
