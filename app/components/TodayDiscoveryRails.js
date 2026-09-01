"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { directionsUrl } from "./kit";
import { toHookLine } from "../../lib/editorialHook";
import { priceLabel } from "../../lib/price.js";
import { toDisplayScore } from "../../lib/score.js";
import { topPickAward } from "../../lib/topPickAward.js";
import { wayfindScore } from "../../lib/wayfindScore.js";
import { beachDecisionReason, beachWaterBand } from "../../lib/beachDecision.js";

const COLORS = { text: "#F1F5F9", muted: "#8b93a1" };
const compact = (value) => Number(value) >= 1000 ? Math.round(Number(value) / 100) / 10 + "k" : String(Number(value) || 0);
const WATER_LABEL = { good: "Good water quality", moderate: "Moderate water quality", poor: "Poor water quality", advisory: "Health advisory" };

export default function TodayDiscoveryRails({
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

  useEffect(() => {
    const requestKey = `${key}|${city}|${retry}`;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailed(false);
    let dead = false;
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, city, v: "1" });
    fetch("/api/today-discovery?" + query.toString())
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (dead) return;
        if (!result || !Array.isArray(result.rails)) { setFailed(true); return; }
        setPayload(result);
        try { onTrack?.("today_discovery_open", { city, rails: result.rails.map((rail) => rail.id).join(","), places: result.rails.reduce((sum, rail) => sum + rail.places.length, 0) }); } catch {}
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, [key, city, retry, onTrack]);

  if (!active) return null;
  if (!key) return <p style={{ color: COLORS.muted, fontSize: 13 }}>Share your location to rank today&apos;s best discoveries near you.</p>;
  if (!payload && !failed) return <div role="status" aria-busy="true" aria-label="Ranking today's best discoveries">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}</div>;
  if (failed) return <div><p style={{ color: COLORS.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s discovery inventory. That is a service miss, not an empty town.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #4B5563", borderRadius: 999, background: "#111827", color: COLORS.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;

  return <>{payload.rails.map((rail) => {
    const railId = "today-discovery-" + rail.id;
    return <section key={rail.id} aria-label={rail.title} style={{ marginTop: 22 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: COLORS.text }}>{rail.title}</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "#AEB8C6" }}>{rail.deck}</p>
      {!rail.places.length ? <p style={{ margin: "8px 0 0", fontSize: 13, color: COLORS.muted }}>No nearby place has enough verified evidence for this rail yet. We will not fill it with a look-alike.</p> : <>
        <RailNav railId={railId} count={rail.places.length} unit={rail.places.length === 1 ? "ranked place" : "ranked places"} />
        <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
          {rail.places.map((place, index) => {
            const rank = index + 1;
            const photo = place.photo || (place.photoRef ? "/api/photo?ref=" + encodeURIComponent(place.photoRef) + "&w=640" : null);
            const facts = [place.reviews ? compact(place.reviews) + " reviews" : null, priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null, Number.isFinite(place.distMi) ? place.distMi + " mi" : null].filter(Boolean);
            const band = rail.id === "beaches" ? beachWaterBand(place.water) : "unknown";
            const chips = band !== "unknown" ? [{ key: "water", icon: "💧", label: WATER_LABEL[band], title: beachDecisionReason(place.water) || WATER_LABEL[band] }] : [];
            const directions = directionsUrl(place);
            return <RailCard key={place.id} className="wf-exploding-primary" photo={photo} place={place} title={place.name} eyebrow={rail.title} rank={rank}
              score={toDisplayScore(wayfindScore(place.rating, place.reviews))} facts={facts} chips={chips}
              award={topPickAward({ category: rail.title.toLowerCase(), rank })}
              take={place.water && beachDecisionReason(place.water) ? beachDecisionReason(place.water) : (toHookLine(place.editorial, place.name) || null)}
              cta={directions ? { label: "Directions ↗", href: directions, external: true } : null}
              ariaLabel={"Open " + place.name} onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
              saved={isSaved ? !!isSaved(place.id) : undefined}
              liked={isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined}
              disliked={isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined}
              onSave={onSave ? (event) => onSave(event, place) : undefined}
              onLike={onLike ? (event) => onLike(event, place) : undefined}
              onDislike={onDislike ? (event) => onDislike(event, place) : undefined}
              onShare={onShare ? () => onShare(place, { city }) : undefined} />;
          })}
        </div>
        {rail.places.length > 1 ? <RailDots railId={railId} count={rail.places.length} /> : null}
      </>}
    </section>;
  })}</>;
}
