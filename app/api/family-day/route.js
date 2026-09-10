import { familyDayAnswer, validFamilyOrigin } from "../../../lib/familyDayData.js";
import { FAMILY_DAY_RAILS } from "../../../lib/familyDayTaxonomy.js";
import { getFamilyDayEvents } from "../../../lib/familyDayEvents.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const lat = Number.parseFloat(q.get("lat"));
  const lng = Number.parseFloat(q.get("lng"));
  const radiusMi = q.has("radiusMi") ? Number(q.get("radiusMi")) : 25;
  const rail = q.get("rail");
  if (!validFamilyOrigin(lat, lng) || ![10, 25, 50].includes(radiusMi) || !FAMILY_DAY_RAILS.some((r) => r.id === rail)) {
    return Response.json({ error: "Choose a Florida location, a family rail, and a supported distance." }, { status: 400, headers });
  }
  let filters = {};
  try {
    const input = q.get("filters") || "{}";
    if (input.length > 2000) throw new Error("Too many filters");
    filters = JSON.parse(input);
    if (!filters || Array.isArray(filters) || typeof filters !== "object") throw new Error("Invalid filters");
  } catch {
    return Response.json({ error: "Invalid family filters." }, { status: 400, headers });
  }
  try {
    const options = { lat, lng, radiusMi, rail, filters };
    // Events and places read concurrently; an event outage must not erase the
    // healthy permanent cultural places, nor masquerade as zero family events.
    const events = rail === "culture" ? getFamilyDayEvents(options).then((value) => ({
      events: value.events, eventMatched: value.matched, eventsTruncated: value.more,
    })).catch(() => ({ eventsFailed: true, eventsError: "Family events are temporarily unavailable." })) : Promise.resolve({});
    const [answer, eventAnswer] = await Promise.all([familyDayAnswer(options), events]);
    return Response.json({ ...answer, ...eventAnswer }, { headers });
  } catch (error) {
    console.error("[family-day]", error.message);
    return Response.json({ error: "These family picks are temporarily unavailable. Please try again shortly." }, { status: 503, headers });
  }
}
