// FREE direct search over Wayfind-owned place data. No Google or paid fallback.
import { searchOwnedPlaces } from "../../../lib/directSearch.js";

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
  return Response.json(result, { status: 200, headers: NO_STORE });
}
