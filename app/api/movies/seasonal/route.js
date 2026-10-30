export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Seasonal "Movies in Theaters" rail data (Fall / Halloween / Christmas).
// Server side on purpose: keeps the registry and the CJ link id out of client chunks,
// and computes status from the US Eastern calendar day. Tickets always go through
// /api/commerce/go with the live Undercover Tourist movie deal (MOVIE_TICKET_OFFER); the
// partner destination never leaves the server. ctaLive false (defensive only) would null
// every ticket and the rail hides itself.

import { moviesForCollection, MOVIES_RAIL_DEFS, MOVIE_COLLECTIONS, MOVIE_TICKET_OFFER, movieTicketHref } from "../../../../lib/seasonalMovies.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

const CACHE = "public, s-maxage=3600, stale-while-revalidate=600";

export async function GET(request) {
  const collection = new URL(request.url).searchParams.get("collection") || "";
  if (!MOVIE_COLLECTIONS.includes(collection)) {
    return Response.json({ error: "unknown-collection", collections: MOVIE_COLLECTIONS }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const today = siteTodayStr();
  const ctaLive = !!(MOVIE_TICKET_OFFER.provider && Number.isInteger(MOVIE_TICKET_OFFER.offerId));
  const surface = `${collection}_movies_rail`;
  const movies = moviesForCollection(collection, today).map((m) => ({
    id: m.id,
    title: m.title,
    rating: m.rating,
    runtimeMin: m.runtimeMin,
    releaseDate: m.releaseDate,
    status: m.status,
    through: m.through,
    why: m.why,
    vibes: m.vibes,
    art: m.art,
    ticket: ctaLive
      ? { provider: MOVIE_TICKET_OFFER.provider, offerId: MOVIE_TICKET_OFFER.offerId, href: movieTicketHref(m.id, surface) }
      : null,
  }));
  return Response.json(
    { collection, title: MOVIES_RAIL_DEFS[collection].title, deck: MOVIES_RAIL_DEFS[collection].deck, today, ctaLive, movies },
    { headers: { "Cache-Control": CACHE } },
  );
}
