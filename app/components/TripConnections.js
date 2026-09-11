"use client";

import { useEffect, useId, useState } from "react";
import IconicPlaceCard from "./IconicPlaceCard";
import BookingCTA from "./BookingCTA";
import { ATTRACTION_DISCOVERY_IDS } from "../../lib/tripAttractions.js";
import { isTrueLodging } from "../../lib/lodging.js";

const REQUEST_DEADLINE_MS = 9500;
const CONNECTED_ATTRACTION_IDS = new Set(ATTRACTION_DISCOVERY_IDS);

export function tripConnectionsParams({ place, center, mode }) {
  if (place && !CONNECTED_ATTRACTION_IDS.has(String(place.id || "")) && !isTrueLodging(place)) return null;
  const source = place || center;
  const hasLat = source?.lat !== undefined && source?.lat !== null && source?.lat !== "";
  const hasLng = source?.lng !== undefined && source?.lng !== null && source?.lng !== "";
  if (hasLat !== hasLng) return null;
  const lat = hasLat ? Number(source.lat) : null;
  const lng = hasLng ? Number(source.lng) : null;
  if (hasLat && (!Number.isFinite(lat) || !Number.isFinite(lng))) return null;
  const centerMode = mode === "attractions" || (!place && center);
  if (centerMode && !hasLat) return null;
  const params = new URLSearchParams();
  if (hasLat) { params.set("lat", String(lat)); params.set("lng", String(lng)); }
  if (centerMode) params.set("mode", "attractions");
  else {
    const id = String(place?.id || "").trim();
    if (!id) return null;
    params.set("id", id);
  }
  return params;
}

export function tripConnectionCardProps(item, index, { kind, center, onOpenPlace } = {}) {
  const anchor = kind === "stays" ? "the attraction" : center ? "the search area" : "the hotel";
  return {
    place: item,
    rank: index + 1,
    href: item.detailHref || `/p/${encodeURIComponent(item.id)}`,
    editorial: item.blurb || item.editorial || null,
    editorialTier: "known",
    surface: "trip_connections",
    rankingNote: Number.isFinite(item.distMi) ? `${item.distMi.toFixed(1)} miles from ${anchor}` : null,
    onOpen: item.mapsOnly ? undefined : onOpenPlace,
  };
}

export function TripConnectionsContent({ state, currentKey, titleId, center, onOpenPlace, onRetry }) {
  if (!currentKey || state.key !== currentKey || state.status === "idle" || state.status === "loading") return null;
  if (state.status === "failed" || state.unavailable) {
    return <div style={{ marginBottom: 16, color: "#9AA4B2", fontSize: 12.5 }}>
      Nearby trip ideas couldn’t load. <button type="button" onClick={onRetry} style={{ border: 0, padding: 0, background: "transparent", color: "#F59E0B", font: "inherit", fontWeight: 800, cursor: "pointer" }}>Retry</button>
    </div>;
  }
  if (!state.places.length) return null;

  return <section style={{ marginBottom: 18 }} aria-labelledby={titleId}>
    <h2 id={titleId} style={{ margin: "0 0 3px", color: "#F8F5EE", fontSize: 17, lineHeight: 1.25 }}>{state.title}</h2>
    <p style={{ margin: "0 0 10px", color: "#9AA4B2", fontSize: 12.5, lineHeight: 1.45 }}>{state.description}</p>
    <div className="wf8-pcrail" role="list" aria-label={state.title} style={{ margin: 0, padding: 0, gap: 20 }}>
      {state.places.map((item, index) => <div role="listitem" key={item.id} style={{ minWidth: 0, flex: "0 0 min(380px, calc(100vw - 48px))", scrollSnapAlign: "start" }}>
        <IconicPlaceCard {...tripConnectionCardProps(item, index, { kind: state.kind, center, onOpenPlace })} />
        {state.kind === "stays" ? <div style={{ marginTop: 8 }}>
          {item.mapsOnly ? <a href={item.detailHref} style={{ color: "#AAB4C2", fontSize: 12.5 }}>View in Apple Maps</a> : null}
          <BookingCTA variant="primary" detail={item} kind="hotels" label="Check rates" />
          <BookingCTA variant="disclosure" detail={item} kind="hotels" />
        </div> : null}
      </div>)}
    </div>
  </section>;
}

export default function TripConnections({ place = null, center = null, mode = "detail", onOpenPlace }) {
  const titleId = useId();
  const params = tripConnectionsParams({ place, center, mode });
  const key = params ? params.toString() : "";
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ key: "", status: "idle", places: [] });

  useEffect(() => {
    if (!key) { setState({ key: "", status: "idle", places: [] }); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("trip connections deadline")), REQUEST_DEADLINE_MS);
    let current = true;
    setState({ key, status: "loading", places: [] });
    fetch("/api/trip-connections?" + key, { signal: controller.signal })
      .then(async (response) => {
        let body = null;
        try { body = await response.json(); } catch {}
        if (!response.ok) throw new Error(body?.error || `Request returned ${response.status}`);
        return body;
      })
      .then((body) => {
        if (!current) return;
        setState({ key, status: "ready", places: Array.isArray(body?.places) ? body.places : [], title: body?.title, description: body?.description, kind: body?.kind, unavailable: body?.unavailable === true });
      })
      .catch((error) => {
        if (current) setState({ key, status: "failed", places: [], error: String(error?.message || error) });
      })
      .finally(() => clearTimeout(timer));
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [key, retry]);

  return <TripConnectionsContent state={state} currentKey={key} titleId={titleId} center={center} onOpenPlace={onOpenPlace} onRetry={() => setRetry((n) => n + 1)} />;
}
