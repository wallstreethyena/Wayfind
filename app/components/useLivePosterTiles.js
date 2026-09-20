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
import { livePosterArtFor } from "../../lib/livePosterArt.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";

export const LIVE_POSTER_REQUEST_TIMEOUT_MS = 10000;

// An event id alone does not identify the poster request. Providers can repair
// an image, destination, date or label while keeping the same id; key those
// fields so a refreshed event cannot resurrect the previous tile's art/link.
export function livePosterCandidateKey(candidates) {
  // These are JSON API records. Keying their full bounded list is both smaller
  // client code and stricter than maintaining a second projection of fields:
  // every art, identity, classification or destination repair invalidates it.
  return JSON.stringify(candidates || []);
}

// Artwork resolves after the event feed. Keep the key beside the tile so the
// render that first receives a new feed cannot briefly reveal the previous
// city's tile while this feed's artwork request is still in flight.
export function currentLivePosterTile(tileState, candidateKey, pending) {
  if (pending || !tileState || tileState.candidateKey !== candidateKey) return null;
  return tileState.tile || null;
}

// The synthetic rail object DaypartRail renders. `e` is the event exactly as
// the pipeline produced it (or lib/eventPoster.js's verbatim passthrough of
// it); `src` is the tile picture, which is the only thing that varies.
function tileFor(type, config, e, src, strategy) {
  return {
    id: `live-${type}`,
    title: e.name || config.label,
    short: [e.venue || e.city, e.date].filter(Boolean).join(" · "),
    href: e.dest || null,
    livePosterSrc: src,
    livePosterType: type,
    livePosterEventId: e.id || null,
    livePosterStrategy: strategy,
    // A LIVE EVENT POSTER'S ANSWER IS THE EVENT'S OWN PAGE, so it uses
    // the rail's existing `opensPage` opt-in and navigates on click
    // instead of opening the in-rail drop. Without this the tile opened
    // a drop of nearby PLACES, which for a reader in a town Wayfind has
    // not ranked yet read as "Showing Tampa Bay Rays vs. Boston Red Sox
    // near Parrish -- Wayfind isn't live in Parrish yet": a poster that
    // advertises a specific game and then answers with an empty list
    // about somewhere else. The drop is right for a category tile and
    // wrong for a single dated event.
    opensPage: true,
    sponsor: true,
  };
}

// One tile's worth of work: pick this bucket's top event, ask
// /api/live-poster to fit its real Ticketmaster artwork to the tile box, and
// return a synthetic rail object DaypartRail can render. Returns null at every
// stage where there is nothing honest to show -- no location yet, no event in
// this bucket near the reader, or no image of that event that survives the
// crop. A null tile simply does not appear; the rail is unaffected.
function useOneLivePoster(type, center, city) {
  const config = LIVE_POSTER_TYPE_CONFIG[type];
  const { byRail, pending } = usePosterEvents({ active: !!config, center, city, mode: config?.mode });
  // The ranked bucket, not just its top event. A poster must show artwork OF
  // the event it links to, and the top-ranked event does not always have any:
  // a Wayfind curated event carries a photo of its VENUE, which produced a
  // playground photo as the Concerts poster. When the top event has no usable
  // event artwork the poster walks DOWN the same ranking rather than giving
  // up, so the reader still gets the most relevant event that can be shown
  // honestly. Definitive venue/stock/undersized failures do not consume one of
  // the six expensive server attempts; the raw ranked scan remains finite.
  // Bound the identity immediately, then load the definitive no-art prefilter
  // only when this bucket actually has events. The selector keeps the same
  // ranked top-24 scan and six expensive attempts.
  const rankedEvents = (config ? byRail?.[config.bucketKey] || [] : []).slice(0, 24);
  const candidateKey = livePosterCandidateKey(rankedEvents);
  const [tile, setTile] = useState(null);

  useEffect(() => {
    if (!rankedEvents.length) { setTile(null); return undefined; }
    let cancelled = false;
    (async () => {
      let candidates;
      try {
        const selection = await import("../../lib/livePosterSelection.js");
        candidates = selection.livePosterCandidates(type, rankedEvents);
      } catch {
        if (!cancelled) setTile(null);
        return;
      }
      if (cancelled) return;
      for (const event of candidates) {
        if (cancelled) return;
        // OWNER POSTER ART (lib/livePosterArt.js, 2026-09-18): a baseball game
        // shows Wayfind's own artwork on the tile. Only the picture changes --
        // the event, its label and its destination are the same fields the
        // fitted-art path below uses, and the same eligibility rule applies
        // (lib/eventPoster.js: no dest or no name, no poster). No fetch here.
        const ownerArt = livePosterArtFor(type, event);
        if (ownerArt) {
          if (!event.dest || !event.name) continue;
          setTile({ candidateKey, tile: tileFor(type, config, event, ownerArt, "owner-art") });
          return;
        }
        let data = null;
        try {
          data = await fetchJsonWithDeadline("/api/live-poster", {
            timeoutMs: LIVE_POSTER_REQUEST_TIMEOUT_MS,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event }),
          });
        } catch {
          data = null;
        }
        if (cancelled) return;
        if (!data || !data.ok || !data.dataUrl) continue; // no usable art: next event down the ranking
        setTile({ candidateKey, tile: tileFor(type, config, data.event || {}, data.dataUrl, data.strategy || null) });
        return;
      }
      if (!cancelled) setTile(null); // nothing in this bucket can be shown honestly
    })();
    return () => { cancelled = true; };
  }, [candidateKey, type]);

  return currentLivePosterTile(tile, candidateKey, pending);
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
