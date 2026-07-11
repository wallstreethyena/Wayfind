// Affiliate ticketing links. Ships dark: every function returns null until a
// partner ID exists in env, so the UI renders nothing today and lights up the
// moment approval lands (paste the ID into Vercel -> redeploy, no code change).
// Viator link format verified against partner docs: any viator.com URL +
// ?pid=P########&mcid=42383&medium=link. GetYourGuide uses partner_id.
const VIATOR = (process.env.NEXT_PUBLIC_VIATOR_PID || "").trim();
const GYG = (process.env.NEXT_PUBLIC_GYG_PID || "").trim();
const CJPID = (process.env.NEXT_PUBLIC_CJ_PID || "").trim(); // CJ publisher ID (Booking.com advertiser)

// v5.40 (July 2026 audit, Phase 8): every outbound affiliate URL is built
// exactly once through new URL() + URLSearchParams.set(), so pid/mcid/medium
// can never appear twice or with conflicting values — string concatenation
// used to double them when a source URL already carried tracking.
export function withViatorTracking(rawUrl, pid = VIATOR) {
  if (!rawUrl) return rawUrl;
  if (!pid) return rawUrl;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set("pid", pid);
    u.searchParams.set("mcid", "42383");
    u.searchParams.set("medium", "link");
    return u.toString();
  } catch {
    return rawUrl;
  }
}

// Pull the city out of a Google formatted address ("1 Main St, Sarasota, FL 34236, USA").
// v4.14: replaces the hardcoded " Orlando" suffix that corrupted searches outside Orlando.
function cityFrom(address) {
  try {
    const parts = String(address || "").split(",").map((x) => x.trim());
    return parts.length >= 3 ? parts[1] : "";
  } catch { return ""; }
}

// Ticket-able place types only: attractions, parks-with-gates, museums, zoos.
// Restaurants, bars, and neighborhood green parks stay excluded.
const TICKETY = /tourist_attraction|amusement|theme_park|water_park|aquarium|zoo|museum/;

export function ticketsUrl(place) {
  if (!place || !place.name) return null;
  const types = ((place.types || []).join(" ")).toLowerCase();
  if (!TICKETY.test(types)) return null;
  const city = cityFrom(place.address);
  const q = encodeURIComponent(place.name + (city ? " " + city : ""));
  if (VIATOR) return withViatorTracking("https://www.viator.com/searchResults/all?text=" + q);
  if (GYG) return "https://www.getyourguide.com/s/?q=" + q + "&partner_id=" + encodeURIComponent(GYG);
  return null;
}

// Booking.com rate links through CJ. Lodging types only; ships dark until
// NEXT_PUBLIC_CJ_PID exists. CJ deep-link format: the destination URL rides
// after /dlg/sid/{sid}/ with its own query string intact. Verify the first
// click appears in CJ reporting; if the advertiser requires encoded
// destinations we flip encodeURIComponent on in one line.
// v4.15: affiliate search link for a named experience ("luau", "airboat tour")
// used by the culture cards. Viator first, GYG fallback, null when neither
// PID exists so the UI ships dark.
export function experienceSearchUrl(query, city) {
  const q = encodeURIComponent(String(query || "") + (city ? " " + city : ""));
  if (!q) return null;
  if (VIATOR) return withViatorTracking("https://www.viator.com/searchResults/all?text=" + q);
  if (GYG) return "https://www.getyourguide.com/s/?q=" + q + "&partner_id=" + encodeURIComponent(GYG);
  return null;
}

// v4.16: hotel rate search link by name (guide pages have no place object).
// v4.23: route a Book click through our exact-product resolver. The API
// route 302s to the precise Viator product (affiliate-attributed) and falls
// back to a tracked search if resolution fails, so behavior never regresses.
// v5.52 (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 1-3): kind/placeId are
// optional — callers with a real place object (Detail.js) pass them so the
// server-side resolver can score category match and track fan-out per
// place; callers with only a free-text query (guides, culture cards) omit
// them and the resolver degrades gracefully (neutral category, per-query
// pseudo placeId), same as before this change.
export function experienceGoUrl(query, city, kind, placeId) {
  if (!query) return null;
  let u = "/api/viator/go?q=" + encodeURIComponent(String(query)) + (city ? "&city=" + encodeURIComponent(String(city)) : "");
  if (kind) u += "&kind=" + encodeURIComponent(String(kind));
  if (placeId) u += "&placeId=" + encodeURIComponent(String(placeId));
  return u;
}

// v4.19: verified direct Viator link (product or attraction page) with partner
// tracking. Fixes "Book" buttons landing on generic search results.
export function viatorDirectUrl(url) {
  if (!url || !/^https:\/\/www\.viator\.com\//.test(url)) return null;
  return VIATOR ? withViatorTracking(url) : url;
}

export function hotelSearchUrl(query) {
  if (!query) return null;
  return "https://www.booking.com/searchresults.html?ss=" + encodeURIComponent(String(query));
}

// v5.54 (events pipeline): Ticketmaster outbound tracking, single source of
// truth. Was module-scope AFFIL in app/home.js; moved here so the server-
// rendered /events/[city]/[slug] page appends the identical param. Blank
// until the affiliate program approves -- pass-through until then.
const TICKETMASTER_PARAM = ""; // e.g. "irgwc=1&clickid=..." once approved, else blank
export function ticketOutUrl(url) {
  if (!url || !TICKETMASTER_PARAM) return url;
  try { return url + (url.indexOf("?") >= 0 ? "&" : "?") + TICKETMASTER_PARAM; } catch { return url; }
}

const HOTELY = /lodging|hotel|motel|resort|bed_and_breakfast|guest_house/;
// v4.44: Stay22 LinkSwap owns hotels. We emit a PLAIN Booking.com search link and
// Stay22's site-wide script rewrites it into the highest-paying hotel commission
// (Booking, Expedia, Hotels.com...) automatically. No CJ wrapper = no duplicate
// attribution. Stay22 optimizes which provider pays most, per booking.
export function hotelUrl(place) {
  if (!place || !place.name) return null;
  const types = ((place.types || []).join(" ")).toLowerCase();
  if (!HOTELY.test(types)) return null;
  // v4.66: lodging-typed outdoor operations (canoe outposts, campgrounds)
  // must not get a Booking.com rates button.
  const nm = place.name;
  if (/campground|rv_park/.test(types) && !/hotel|resort|inn\b|suites|motel|lodge\b/i.test(nm)) return null;
  if (/canoe|kayak|paddle|outpost|outfitter|campground|camp\b|rv park|marina|airboat/i.test(nm) && !/hotel|resort|inn\b|suites|motel|lodge\b/i.test(nm)) return null;
  const city = cityFrom(place.address);
  return "https://www.booking.com/searchresults.html?ss=" + encodeURIComponent(place.name + (city ? " " + city : ""));
}
