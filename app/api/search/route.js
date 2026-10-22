// Owned search: place names stay on the free inventory matcher. Pages, guides,
// events, and coupons come from the library index. The optional Claude filter
// is inside searchLibrary and stays off unless WAYFIND_SEARCH_UNDERSTAND=on.
import { searchOwnedPlaces } from "../../../lib/directSearch.js";
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
  if (result && result.reason !== "unsupported_location") {
    try {
      const library = await searchLibrary({
        query: params.get("q"),
        lat: params.get("lat"),
        lng: params.get("lng"),
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
