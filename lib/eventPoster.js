// lib/eventPoster.js
//
// Orchestrates ONE already-selected, already-normalized event (produced by
// the existing /api/events route + lib/posterEvents.js selectPosterEvents)
// into a 9:16 poster image. This file never calls Ticketmaster's events
// API, never ranks events, never dedupes events, never invents metadata.
// Every non-image field on the returned poster is copied verbatim from the
// event object the pipeline already produced -- see app/components/
// PosterEventCard.js for the same trust pattern this mirrors.

import { fitPosterImage, isPlaceholderTmUrl, POSTER_RATIO } from "./posterImageFit.js";

// Ticketmaster ships multiple ratio variants of the SAME photo in one event
// payload (16_9, 3_2, 4_3). app/api/events/route.js's fromTicketmaster()
// already receives all of them and now also carries the fuller set through
// as event.imageVariants (additive field, 2026-09-16 -- the existing
// event.image/event.thumb fields are untouched and unaffected). 3_2 and 4_3
// are TALLER relative to width than 16_9, which is exactly what gives a
// crop more room when 16_9 cannot pass the attention check. Non-Ticketmaster
// providers never set imageVariants; they fall through to their single
// event.image, which is the honest, expected behavior for them.
export function posterImageCandidatesFor(event) {
  const seen = new Set();
  const out = [];
  const push = (url) => { if (url && typeof url === "string" && !seen.has(url) && !isPlaceholderTmUrl(url)) { seen.add(url); out.push({ url }); } };
  if (Array.isArray(event?.imageVariants) && event.imageVariants.length) {
    const order = { "16_9": 0, "3_2": 1, "4_3": 2 };
    const sorted = [...event.imageVariants].sort(
      (a, b) => (order[a?.ratio] ?? 9) - (order[b?.ratio] ?? 9) || (b?.width || 0) - (a?.width || 0)
    );
    for (const v of sorted) push(v?.url);
  }
  push(event?.image);
  push(event?.thumb);
  return out;
}

// Exactly the fields other Wayfind surfaces already trust from the pipeline
// (see PosterEventCard.js: event.dest, event.name, event.venue, event.city,
// event.date, event.time, event.source). Copied, never recomputed, never
// re-resolved -- the destination URL in particular must stay byte-identical
// to what resolveDestination() in lib/eventsPipeline.js already produced.
function passthrough(event) {
  const { id, name, date, time, venue, city, source, dest, destKind, url, segment, genre } = event || {};
  return { id, name, date, time, venue, city, source, dest, destKind, url, segment, genre };
}

/**
 * event: one already-selected, already-validated normalized event object
 *   (an item out of selectPosterEvents()'s byRail arrays, or equivalent).
 * fetchImage: (url) => Promise<Buffer|null> -- injected so tests never hit
 *   the network and production can use a real fetch.
 *
 * Returns:
 *   { ok:true,  strategy:"attention"|"blurred-extend", sourceUrl, buffer,
 *     survivalRatio?, event: {...passthrough} }
 *   { ok:false, reason, event?: {...passthrough}, attempts? }
 *
 * ok:false is the fail-closed path: the caller renders nothing for this
 * event (matching PosterEventCard.js's `if (!event?.dest || !event?.name)
 * return null` convention) rather than showing a broken or borrowed image.
 */
export async function buildEventPoster(event, { ratio = POSTER_RATIO, fetchImage } = {}) {
  if (typeof fetchImage !== "function") return { ok: false, reason: "no_fetcher_provided" };
  if (!event || !event.dest || !event.name) return { ok: false, reason: "ineligible_event" };

  const candidates = posterImageCandidatesFor(event);
  if (!candidates.length) return { ok: false, reason: "no_image", event: passthrough(event) };

  const fit = await fitPosterImage(candidates, { ratio, fetchImage });
  if (!fit.ok) return { ok: false, reason: fit.reason, event: passthrough(event), attempts: fit.attempts };

  return {
    ok: true,
    strategy: fit.strategy,
    sourceUrl: fit.sourceUrl,
    buffer: fit.buffer,
    survivalRatio: fit.survivalRatio,
    attempts: fit.attempts,
    event: passthrough(event),
  };
}
