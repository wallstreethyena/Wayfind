// Owned search: place names stay on the free inventory matcher. Pages, guides,
// events, and coupons come from the library index. The optional Claude filter
// is inside searchLibrary and stays off unless WAYFIND_SEARCH_UNDERSTAND=on.
import { searchOwnedPlaces } from "../../../lib/directSearch.js";
import { resolveSearchIntent } from "../../../lib/searchIntent.js";
import { searchLibrary } from "../../../lib/unifiedSearch.js";

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
    try {
      const library = await searchLibrary({
        query: params.get("q"),
        lat,
        lng,
      });
      if (library.results && library.results.length) {
        const next = { ...result, status: "ok", results: library.results };
        delete next.reason;
        result = next;
      }
    } catch {
      // The place answer still stands when the library read throws.
    }
  }
  return Response.json(result, { status: 200, headers: NO_STORE });
}
