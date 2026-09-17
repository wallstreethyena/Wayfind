"use client";
// app/components/LiveEventPoster.js
//
// Independent 9:16 live-event poster tile. Image only -- no overlay text,
// per owner direction 2026-09-16. Reuses usePosterEvents (the existing
// bounded /api/events feed) for its event pool, exactly like every other
// standalone poster surface already does -- no new fetcher, no new
// location state. `center` and `city` must be the SAME two values that
// drive Wayfind's own location selector (app/home.js: `center` + `locName`)
// -- this component never resolves its own location and never invents a
// parallel one.
//
// type="sports" | "concerts" is the only thing a caller needs to know. The
// mapping to real, already-shipped event buckets lives in
// lib/liveEventPosterTypes.js (a plain, non-JSX file so it's testable
// without a JSX transpiler, and reusable if another surface wants the same
// two types later).
import { useEffect, useState } from "react";
import { usePosterEvents } from "./usePosterEvents.js";
import { LIVE_POSTER_TYPE_CONFIG } from "../../lib/liveEventPosterTypes.js";

export default function LiveEventPoster({ type, center, city = "", active = true, className, style }) {
  const config = LIVE_POSTER_TYPE_CONFIG[type];
  const { byRail, pending } = usePosterEvents({ active: active && !!config, center, city, mode: config?.mode });
  const event = config ? byRail?.[config.bucketKey]?.[0] || null : null;
  const [poster, setPoster] = useState(null);
  const [posterFor, setPosterFor] = useState(null);

  useEffect(() => {
    if (!event) { setPoster(null); setPosterFor(null); return; }
    let cancelled = false;
    fetch("/api/live-poster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) { setPoster(data && data.ok ? data : null); setPosterFor(event.id); } })
      .catch(() => { if (!cancelled) { setPoster(null); setPosterFor(event.id); } });
    return () => { cancelled = true; };
  }, [event && event.id]);

  // Fail closed at every stage: unknown type, no bucket config, still
  // loading, no event in this bucket for this location, or the image
  // engine rejected every candidate -> render nothing. One poster's empty
  // state never affects the other, because each is its own independent
  // component instance with its own independent fetch.
  if (!config || pending || !event) return null;
  if (posterFor !== event.id || !poster || !poster.ok) return null;

  const internal = poster.event.destKind === "internal" || String(poster.event.dest || "").startsWith("/");
  const label = [poster.event.name, poster.event.venue || poster.event.city].filter(Boolean).join(" — ");

  return (
    <a
      href={poster.event.dest}
      target={internal ? undefined : "_blank"}
      rel={internal ? undefined : "noopener"}
      aria-label={label}
      className={className}
      style={{ display: "block", width: "100%", aspectRatio: `9 / 16`, borderRadius: 16, overflow: "hidden", background: "#0A0E1A", ...style }}
      data-live-poster-type={type}
      data-live-poster-strategy={poster.strategy}
      data-live-poster-event-id={poster.event.id}
    >
      <img
        src={poster.dataUrl}
        alt={`${poster.event.name} — ${poster.event.date}`}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        loading="eager"
      />
    </a>
  );
}
