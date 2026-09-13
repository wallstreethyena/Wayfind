import { tripConnections, withTripConnectionDeadline } from "../../../lib/tripConnections.js";

const noStore = { "cache-control": "no-store" };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedMode = searchParams.get("mode");
  const mode = requestedMode === "attractions" || requestedMode === "stays" ? requestedMode : "detail";
  const placeId = String(searchParams.get("id") || "").trim().slice(0, 220);
  const hasLat = searchParams.has("lat");
  const hasLng = searchParams.has("lng");
  const lat = hasLat ? Number(searchParams.get("lat")) : null;
  const lng = hasLng ? Number(searchParams.get("lng")) : null;
  const coordinatesValid = hasLat && hasLng && Number.isFinite(lat) && Number.isFinite(lng);
  if (hasLat !== hasLng || ((hasLat || hasLng) && !coordinatesValid) || (mode === "detail" && !placeId) || (mode !== "detail" && !coordinatesValid)) {
    return Response.json({ error: mode !== "detail" ? "Valid center coordinates are required" : "A place ID and either two valid coordinates or neither are required", places: [] }, { status: 400, headers: noStore });
  }
  try {
    const answer = await withTripConnectionDeadline(tripConnections({ placeId, lat: coordinatesValid ? lat : null, lng: coordinatesValid ? lng : null, mode }));
    if (answer.invalid) {
      return Response.json({ error: "This location is outside the supported area", places: [] }, { status: 400, headers: noStore });
    }
    return Response.json(answer, { status: 200, headers: noStore });
  } catch (error) {
    console.error("[api/trip-connections] inventory unavailable", { message: String(error?.message || error) });
    return Response.json({ error: "Nearby trip ideas are temporarily unavailable", places: [] }, { status: 503, headers: noStore });
  }
}

export const runtime = "nodejs";
