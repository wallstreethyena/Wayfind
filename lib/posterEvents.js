// Specialty posters select from the complete eligible event pool BEFORE a
// presentation cap. A popular grocery store is still not a concert.
import { validateEvent, haversineMi } from "./eventsPipeline.js";
import { rankIntentEvents } from "./eventPopularity.js";
import { NIGHT_OUT_MAX_MI, nightOutEventRails, NIGHT_OUT_RAIL_DEFS } from "./nightOutIntent.js";

export function posterEventBucket(event) {
  const segment = String(event?.segment || "").toLowerCase();
  const genre = String(event?.genre || "").toLowerCase();
  const name = String(event?.name || "");
  if (genre.includes("comedy") || /\b(comedian|stand[- ]?up|improv|comedy (club|night|show|tour|jam|hour|festival|special|series)|live comedy|night of comedy|open mic|laugh(s| ?fest| ?factory))\b/i.test(name)) return "comedy";
  if (segment.includes("business")) return "business";
  if (/music|concert/.test(segment)) return "concerts";
  if (segment.includes("sport")) return "sports";
  if (/arts|theatre|theater/.test(segment)) return "theater";
  return "community";
}

export function selectPosterEvents(events, { mode, center, bucketOf = posterEventBucket, now = new Date() } = {}) {
  const byRail = mode === "night-out"
    ? Object.fromEntries(NIGHT_OUT_RAIL_DEFS.map(({ id }) => [id, []]))
    : { [mode === "date-night" ? "livemusic" : mode === "summer-sports" ? "sports" : "entertainment"]: [] };
  // A saved distance belongs to its old origin. Recompute using coordinates
  // for every visitor; null coordinates must not coerce to zero.
  const coordinate = (v) => v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v));
  if (!coordinate(center?.lat) || !coordinate(center?.lng)) return byRail;
  const seen = new Set();
  const eligible = (Array.isArray(events) ? events : []).filter((event) => {
    if (!event?.id || !event.dest || event.civic || !validateEvent(event, now).ok) return false;
    if (!coordinate(event.lat) || !coordinate(event.lng)) return false;
    if (haversineMi(Number(center.lat), Number(center.lng), Number(event.lat), Number(event.lng)) > NIGHT_OUT_MAX_MI) return false;
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
  for (const event of rankIntentEvents(eligible, bucketOf)) {
    const bucket = bucketOf(event);
    if (mode === "night-out") {
      for (const rail of nightOutEventRails(event)) {
        if (byRail[rail]) byRail[rail].push(event);
      }
    } else if (mode === "date-night" && bucket === "concerts") byRail.livemusic.push(event);
    else if (mode === "summer-sports" && bucket === "sports") byRail.sports.push(event);
    else if (mode === "today-entertainment" && ["concerts", "comedy"].includes(bucket)) byRail.entertainment.push(event);
  }
  if (mode === "today-entertainment") byRail.entertainment = byRail.entertainment.slice(0, 10);
  return byRail;
}
