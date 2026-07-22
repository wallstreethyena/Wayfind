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

// The place-TYPE half of the tickets gate (TICKETY only), independent of whether
// an affiliate PID is configured. The place-card "Tickets & tours" CTA gates on
// THIS so it renders on genuinely ticketed venues (museums / zoos / aquariums /
// theme + water parks / attractions) and NEVER on free parks, beaches, scenic
// overlooks or waterfronts -- matching the Detail sheet's ticketsUrl() gate --
// while clicks still route through the verified /api/viator/go resolver.
export function isTicketyPlace(place) {
  const types = ((place && place.types) || []).join(" ").toLowerCase();
  // v6.53 (owner report): beaches carry tourist_attraction in their Google
  // types, which leaked Viator CTAs onto free sand. A beach-typed or
  // beach-categorized place is NEVER bookable inventory, full stop.
  if (/\bbeach\b/.test(types) || /natural_feature/.test(types) || (place && place.category === "beach")) return false;
  return TICKETY.test(types);
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
const TICKETMASTER_PARAM = (process.env.NEXT_PUBLIC_TM_AFFILIATE_PARAM || "").trim(); // owner sets the Impact param in Vercel -> every TM-family link earns; blank = clean pass-through
// v5.97: the Impact/Ticketmaster param is Ticketmaster-FAMILY specific (Ticketmaster,
// Live Nation, TicketWeb all run the same TM/Impact affiliate program). Appending it
// to a NON-TM ticket URL (SeatGeek, Eventbrite, AXS, DICE, StubHub...) would not
// attribute the click AND would pollute a competitor's link with a foreign param, so
// we guard on the host. Once TICKETMASTER_PARAM is set it earns on TM-family links
// everywhere and is a clean pass-through on every other provider.
const TM_FAMILY = /(?:^|\.)(?:ticketmaster|livenation|ticketweb)\.[a-z]{2,}(?:\.[a-z]{2,})?$/i;
function isTicketmasterFamily(url) {
  try { return TM_FAMILY.test(new URL(url).hostname); } catch { return false; }
}
export function ticketOutUrl(url) {
  if (!url || !TICKETMASTER_PARAM || !isTicketmasterFamily(url)) return url;
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

// ── v6.37: Order In (Uber Eats) ─────────────────────────────────────────────
// Ships DARK-BUT-FUNCTIONAL, a deliberate upgrade on the ships-dark pattern:
// the plain Uber Eats search deep link always works for users, and the moment
// the Uber affiliate application is approved you set
// NEXT_PUBLIC_UBEREATS_TEMPLATE to the tracked wrapper (Impact-style, with a
// literal "{url}" placeholder that receives the encoded destination) and every
// click starts earning — no code change, exactly like the Viator/CJ consts up top.
const UBEREATS_TEMPLATE = (process.env.NEXT_PUBLIC_UBEREATS_TEMPLATE || "").trim();
export function uberEatsUrl(name, city) {
  if (!name) return null;
  const q = encodeURIComponent(String(name) + (city ? " " + city : ""));
  const dest = "https://www.ubereats.com/search?diningMode=DELIVERY&q=" + q;
  if (!UBEREATS_TEMPLATE || UBEREATS_TEMPLATE.indexOf("{url}") < 0) return dest;
  try { return UBEREATS_TEMPLATE.replace("{url}", encodeURIComponent(dest)); } catch { return dest; }
}

// ── v6.37: VRBO vacation rentals (Expedia Group affiliate) ──────────────────
// Same template contract as Uber Eats above. Surfaced on lodging Detail sheets
// next to the Stay22-owned "Check rates" path — VRBO covers the whole-home
// rental intent Stay22's hotel inventory doesn't.
const VRBO_TEMPLATE = (process.env.NEXT_PUBLIC_VRBO_TEMPLATE || "").trim();
export function vrboUrl(locNameOrCity) {
  const c = String(locNameOrCity || "").split(",")[0].trim();
  if (!c) return null;
  const dest = "https://www.vrbo.com/search?destination=" + encodeURIComponent(c);
  if (!VRBO_TEMPLATE || VRBO_TEMPLATE.indexOf("{url}") < 0) return dest;
  try { return VRBO_TEMPLATE.replace("{url}", encodeURIComponent(dest)); } catch { return dest; }
}
