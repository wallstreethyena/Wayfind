// Loaded only when a live-event bucket has candidates. Keeping the artwork
// prefilter out of the initial homepage bundle saves every reader from paying
// for poster fitting rules before there is any event to fit.
import { livePosterArtFor } from "./livePosterArt.js";
import { eventMayHaveUsableProviderArt } from "./livePosterCandidate.js";
import { fetchJsonWithDeadline } from "./clientJson.js";

export const LIVE_POSTER_REQUEST_TIMEOUT_MS = 10000;
export const LIVE_POSTER_MAX_ATTEMPTS = 6;
export const LIVE_POSTER_MAX_RANKED_SCAN = 24;

/** Browser-safe prefilter only. False means the event is definitively unable
 * to pass the existing server gates; true still requires /api/live-poster. */
export function mayHaveUsableLivePosterArt(type, event) {
  if (!event?.dest || !event?.name) return false;
  if (livePosterArtFor(type, event)) return true;
  return eventMayHaveUsableProviderArt(event);
}

/** Preserve ranked order while spending at most six image-processing POSTs. */
export function livePosterCandidates(type, rankedEvents) {
  return (Array.isArray(rankedEvents) ? rankedEvents : [])
    .slice(0, LIVE_POSTER_MAX_RANKED_SCAN)
    .filter((event) => mayHaveUsableLivePosterArt(type, event))
    .slice(0, LIVE_POSTER_MAX_ATTEMPTS);
}

function tileFor(type, config, event, src, strategy) {
  return {
    id: `live-${type}`,
    title: event.name || config.label,
    short: [event.venue || event.city, event.date].filter(Boolean).join(" · "),
    href: event.dest || null,
    livePosterSrc: src,
    livePosterType: type,
    livePosterEventId: event.id || null,
    livePosterStrategy: strategy,
    opensPage: true,
    sponsor: true,
  };
}

/** Resolve the first honest tile without losing ranked order. `cancelled`
 * stops the remaining bounded POSTs when the reader changes location. */
export async function resolveLivePosterTile(type, config, rankedEvents, cancelled = () => false) {
  for (const event of livePosterCandidates(type, rankedEvents)) {
    if (cancelled()) return null;
    const ownerArt = livePosterArtFor(type, event);
    if (ownerArt) {
      if (!event.dest || !event.name) continue;
      return tileFor(type, config, event, ownerArt, "owner-art");
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
    if (cancelled()) return null;
    if (!data || !data.ok || !data.dataUrl) continue;
    return tileFor(type, config, data.event || {}, data.dataUrl, data.strategy || null);
  }
  return null;
}
