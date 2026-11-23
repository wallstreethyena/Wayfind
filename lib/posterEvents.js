// Specialty posters select from the complete eligible event pool BEFORE a
// presentation cap. A popular grocery store is still not a concert.
import { validateEvent, haversineMi } from "./eventsPipeline.js";
import { isFloridaVenue } from "./floridaVenue.js";
import { rankIntentEvents, eventPopularitySignal } from "./eventPopularity.js";
import { NIGHT_OUT_MAX_MI, nightOutEventRails, NIGHT_OUT_RAIL_DEFS } from "./nightOutIntent.js";
import { TRENDING_RAIL_IDS, trendingEventRail, inTrendingWindow, isScoutTrending, isMarqueeEvent, TRENDING_EVENT_MIN_SIGNAL } from "./trendingRails.js";
import { siteTodayStr } from "./siteTime.js";

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

// ONE PHOTO, ONE CARD PER RAIL (owner, 2026-11-23: "there are repetitive
// photos here"). An event with no photo of its own borrows its VENUE photo
// (lib/curatedEvents.js), so two festivals at Vinoy Park showed the identical
// park picture side by side. Within a rail, a venue photo that an earlier card
// already shows is not shown twice: that later card leaves this rail (it stays
// on the Events tab). Event art is never dropped here.
export function posterImageKey(event) {
  const raw = String(event?.thumb || event?.image || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://www.gowayfind.com");
    if (url.pathname === "/api/photo") {
      const place = url.searchParams.get("place");
      if (place) return "place:" + place + ":" + (url.searchParams.get("g") || "0");
      const ref = String(url.searchParams.get("ref") || "");
      const m = ref.match(/^places\/([^/]+)\/photos\/(.+)$/);
      if (m) return "place:" + m[1] + ":" + (m[2] === "wfplacediscovery" ? "0" : m[2]);
      return "ref:" + ref;
    }
    return (url.host + url.pathname).toLowerCase();
  } catch {
    return raw;
  }
}
function posterIsVenuePhoto(event) {
  if (event?.imageIsVenue === true || event?.visitFacts?.image_is_venue === true) return true;
  return /^place:/.test(posterImageKey(event));
}
export function dedupeRailImages(list) {
  const shown = new Set();
  return (Array.isArray(list) ? list : []).filter((event) => {
    const key = posterImageKey(event);
    if (!key) return true;
    if (shown.has(key) && posterIsVenuePhoto(event)) return false;
    shown.add(key);
    return true;
  });
}
function dedupeAllRails(byRail) {
  for (const id of Object.keys(byRail)) byRail[id] = dedupeRailImages(byRail[id]);
  return byRail;
}

export function selectPosterEvents(events, { mode, center, bucketOf = posterEventBucket, now = new Date() } = {}) {
  const byRail = mode === "night-out"
    ? Object.fromEntries(NIGHT_OUT_RAIL_DEFS.map(({ id }) => [id, []]))
    : mode === "trending"
    ? Object.fromEntries(TRENDING_RAIL_IDS.map((id) => [id, []]))
    : { [mode === "date-night" ? "livemusic" : mode === "summer-sports" ? "sports" : "entertainment"]: [] };
  // A saved distance belongs to its old origin. Recompute using coordinates
  // for every visitor; null coordinates must not coerce to zero.
  const coordinate = (v) => v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v));
  if (!coordinate(center?.lat) || !coordinate(center?.lng)) return byRail;
  const seen = new Set();
  const eligible = (Array.isArray(events) ? events : []).filter((event) => {
    if (!event?.id || !event.dest || event.civic || !validateEvent(event, now).ok) return false;
    if (!coordinate(event.lat) || !coordinate(event.lng)) return false;
    // Florida venue rule (lib/floridaVenue.js): a poster never shows an out-of-state venue, whatever the centre.
    if (!isFloridaVenue(event)) return false;
    if (haversineMi(Number(center.lat), Number(center.lng), Number(event.lat), Number(event.lng)) > NIGHT_OUT_MAX_MI) return false;
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
  if (mode === "trending") {
    // Trending Now (owner, 2026-11-05): happenings this week, scout-verified
    // trends first, then the ordinary popularity order. Every eligible row is
    // kept — no presentation cap (the owner wants every option on a rail).
    const today = siteTodayStr(now);
    // "Trending" is a demand claim, so a happening only rides these shelves
    // with evidence: the scout verified it as trending this week, or it
    // carries a measured demand signal at or above the floor.
    // A show or game in a marquee venue (lib/trendingRails.js) is the third
    // kind of evidence: big rooms only book what people are buying.
    const trendingEvidence = (event) => isScoutTrending(event.tags)
      || ((eventPopularitySignal(event) || { value: -1 }).value >= TRENDING_EVENT_MIN_SIGNAL)
      || isMarqueeEvent(event);
    const ranked = rankIntentEvents(eligible.filter((event) => inTrendingWindow(event, today) && trendingEvidence(event)), bucketOf);
    const lead = ranked.filter((event) => isScoutTrending(event.tags));
    const rest = ranked.filter((event) => !isScoutTrending(event.tags));
    // One card per show: a run of nights (Hamilton, Rod Wave x2) keeps only
    // its first listing, so a shelf is a range of picks, not one show repeated.
    const seenShow = new Set();
    for (const event of [...lead, ...rest]) {
      const key = String(event.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "|" + String(event.venue || "").toLowerCase();
      if (seenShow.has(key)) continue;
      seenShow.add(key);
      byRail[trendingEventRail(event)].push(event);
    }
    return dedupeAllRails(byRail);
  }
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
  dedupeAllRails(byRail);
  if (mode === "today-entertainment") byRail.entertainment = byRail.entertainment.slice(0, 10);
  return byRail;
}
