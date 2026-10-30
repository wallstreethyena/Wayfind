// Owned search: place names stay on the free inventory matcher. Pages, guides,
// events, and coupons come from the library index. The optional Claude filter
// is inside searchLibrary and stays off unless WAYFIND_SEARCH_UNDERSTAND=on.
import { searchOwnedPlaces } from "../../../lib/directSearch.js";
import { resolveSearchIntent } from "../../../lib/searchIntent.js";
import { searchLibrary } from "../../../lib/unifiedSearch.js";
import { searchResultCards } from "../../../lib/searchCards.js";
import { pluralFallbackQuery } from "../../../lib/searchRank.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  let result;
  try {
    result = await searchOwnedPlaces({
      query: params.get("q"),
      lat: params.get("lat"),
      lng: params.get("lng"),
    });
  } catch {
    result = {
      status: "unavailable",
      places: [],
      source: "owned-inventory",
      query: String(params.get("q") || "").trim().slice(0, 160),
      reason: "source_unavailable",
    };
  }
  // A one-word plural with no place match retries its singular once ("Bars"
  // finds the same bars as "bar"). Only a real place answer replaces the
  // first one, and everything below then reads the query that matched.
  let query = params.get("q");
  const singular = pluralFallbackQuery(query);
  if (singular && result && result.reason !== "unsupported_location" && !(Array.isArray(result.places) && result.places.length)) {
    try {
      const retry = await searchOwnedPlaces({ query: singular, lat: params.get("lat"), lng: params.get("lng") });
      if (retry && Array.isArray(retry.places) && retry.places.length) {
        result = { ...retry, query: result.query, matchedAs: singular };
        query = singular;
      }
    } catch {
      // The first answer stands.
    }
  }
  // An out-of-coverage point, or a named city we do not cover, stays a place
  // miss. Gastonia must keep that exact JSON. A known phrase with no point
  // still has a page: "things to do" before GPS resolves is Parrish, the
  // home market. An unknown query with no point does not run, so it cannot
  // surface another city's coupons.
  const lat = params.get("lat");
  const lng = params.get("lng");
  const finiteParam = (value) => value != null && String(value).trim() !== "" && Number.isFinite(Number(value));
  const hasPoint = finiteParam(lat) && finiteParam(lng);
  const phraseWithoutPoint = !hasPoint && resolveSearchIntent(params.get("q"), {}).recognized === true;
  if (result && (result.reason !== "unsupported_location" || phraseWithoutPoint)) {
    let filters = null;
    try {
      const library = await searchLibrary({
        query: params.get("q"),
        lat,
        lng,
      });
      filters = library.meta && library.meta.filters;
      if (library.results && library.results.length) {
        const next = { ...result, status: "ok", results: library.results };
        delete next.reason;
        result = next;
      }
    } catch {
      // The place answer still stands when the library read throws.
    }
    try {
      const cards = await searchResultCards({
        query,
        lat,
        lng,
        ownedPlaces: result.places,
        filters,
        env: process.env,
      });
      if (cards.cards && cards.cards.length) {
        const next = { ...result, status: "ok", cards: cards.cards };
        delete next.reason;
        result = next;
      }
    } catch {
      // A card-feed failure leaves the place and library answer in place.
    }
  }
  return Response.json(result, { status: 200, headers: NO_STORE });
}
