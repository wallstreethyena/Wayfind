// Loaded only when a live-event bucket has candidates. Keeping the artwork
// prefilter out of the initial homepage bundle saves every reader from paying
// for poster fitting rules before there is any event to fit.
import { livePosterArtFor } from "./livePosterArt.js";
import { eventMayHaveUsableProviderArt } from "./livePosterCandidate.js";

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
