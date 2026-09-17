"use client";
// app/components/useLivePosterTiles.js
//
// Builds the SYNTHETIC rail tiles for the two live event posters (Sporting
// Events, Concerts) so they ride the ordinary poster rail in
// app/components/DaypartRail.js at exactly the same size as every other
// poster. Owner direction 2026-09-17: these are posters IN that rail, not a
// separate row above it.
//
// Location comes ONLY from the canonical values the location selector already
// drives (app/home.js: railCenter/center + locName). No second location
// state, no independent geolocation.
//
// The event pool comes from usePosterEvents, the same bounded /api/events
// feed every other standalone poster surface already uses, with the same
// stale-response protection: a response for a location the reader has left
// can never replace the current one.
import { useEffect, useState } from "react";
import { usePosterEvents } from "./usePosterEvents.js";
import { LIVE_POSTER_TYPE_CONFIG } from "../../lib/liveEventPosterTypes.js";

// One tile's worth of work: pick this bucket's top event, ask
// /api/live-poster to fit its real Ticketmaster artwork to the tile box, and
// return a synthetic rail object DaypartRail can render. Returns null at every
// stage where there is nothing honest to show -- no location yet, no event in
// this bucket near the reader, or no image of that event that survives the
// crop. A null tile simply does not appear; the rail is unaffected.
function useOneLivePoster(type, center, city) {
  const config = LIVE_POSTER_TYPE_CONFIG[type];
  const { byRail, pending } = usePosterEvents({ active: !!config, center, city, mode: config?.mode });
  const event = config ? byRail?.[config.bucketKey]?.[0] || null : null;
  const [tile, setTile] = useState(null);

  useEffect(() => {
    if (!event) { setTile(null); return undefined; }
    let cancelled = false;
    fetch("/api/live-poster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data || !data.ok || !data.dataUrl) { setTile(null); return; }
        const e = data.event || {};
        setTile({
          // `live-` ids never collide with lib/rails.js RAILS.
          id: `live-${type}`,
          title: e.name || config.label,
          short: [e.venue || e.city, e.date].filter(Boolean).join(" · "),
          href: e.dest || null,
          // The marker DaypartRail keys on to render remote poster art
          // instead of a local public/cards-v8 file.
          livePosterSrc: data.dataUrl,
          livePosterType: type,
          livePosterEventId: e.id || null,
          livePosterStrategy: data.strategy || null,
          // A live event tile is not a curated list with a share route, and
          // it is not a paid sponsor unit either. `sponsor: true` is what
          // DaypartRail already checks to suppress the share control, which
          // is the correct behaviour here for the same reason.
          sponsor: true,
        });
      })
      .catch(() => { if (!cancelled) setTile(null); });
    return () => { cancelled = true; };
  }, [event && event.id, type]);

  return pending ? null : tile;
}

/**
 * center/city MUST be the canonical active location (railCenter/center +
 * locName in app/home.js). Returns an array of 0, 1 or 2 synthetic tiles,
 * sports first, ready to hand to <DaypartRail livePosters={...} />.
 */
export function useLivePosterTiles({ center, city }) {
  const sports = useOneLivePoster("sports", center, city);
  const concerts = useOneLivePoster("concerts", center, city);
  return [sports, concerts].filter(Boolean);
}
