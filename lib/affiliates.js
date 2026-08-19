// Affiliate ticketing links. Ships dark: every function returns null until a
// partner ID exists in env, so the UI renders nothing today and lights up the
// moment approval lands (paste the ID into Vercel -> redeploy, no code change).
// Viator link format verified against partner docs: any viator.com URL +
// ?pid=P########&mcid=42383&medium=link. GetYourGuide uses partner_id.
// v6.80 — read through credential(), not `|| ""`. `vercel env pull` writes the
// literal "[SENSITIVE]" for every var flagged Sensitive in the dashboard (all
// three of these are), so a sourced .env.production.local used to set
// NEXT_PUBLIC_VIATOR_PID="[SENSITIVE]" and every Viator URL went out carrying
// ?pid=%5BSENSITIVE%5D — a WORKING, UNATTRIBUTED link, which is the vrboUrl leak
// with a configured var in front of it. credential() maps a placeholder to "",
// so the existing `if (VIATOR)` fail-closed paths below handle junk config the
// same way they already handle missing config. See lib/envPlaceholder.js.
import { credential } from "./envPlaceholder.js";
const VIATOR = credential(process.env.NEXT_PUBLIC_VIATOR_PID);
const GYG = credential(process.env.NEXT_PUBLIC_GYG_PID);
const CJPID = credential(process.env.NEXT_PUBLIC_CJ_PID); // CJ publisher ID (Booking.com advertiser)

// v5.40 (July 2026 audit, Phase 8): every outbound affiliate URL is built
// exactly once through new URL() + URLSearchParams.set(), so pid/mcid/medium
// can never appear twice or with conflicting values — string concatenation
// used to double them when a source URL already carried tracking.
export function withViatorTracking(rawUrl, pid = VIATOR) {
  if (!rawUrl) return rawUrl;
  // v6.80: an EXPLICIT pid must clear the same bar as the env-read default —
  // lib/viatorServer.js passes one (`withViatorTracking(hit.productUrl, PID)`)
  // from its own process.env read, so hardening only the module-scope const
  // would have left the SSR product links stamping "[SENSITIVE]".
  const id = credential(pid);
  if (!id) return rawUrl;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set("pid", id);
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
export function experienceGoUrl(query, city, kind, placeId, opts = {}) {
  if (!query) return null;
  let u = "/api/viator/go?q=" + encodeURIComponent(String(query)) + (city ? "&city=" + encodeURIComponent(String(city)) : "");
  if (kind) u += "&kind=" + encodeURIComponent(String(kind));
  if (placeId) u += "&placeId=" + encodeURIComponent(String(placeId));
  if (opts && opts.surface) u += "&surface=" + encodeURIComponent(String(opts.surface));
  if (opts && opts.contentId) u += "&content=" + encodeURIComponent(String(opts.contentId));
  return u;
}

// v4.19: verified direct Viator link (product or attraction page) with partner
// tracking. Fixes "Book" buttons landing on generic search results.
// v6.80 — THE APEX DOMAIN IS OURS TOO. This matched www.viator.com ONLY, so a
// perfectly good https://viator.com/... product URL returned null. That was
// survivable while every call site read `viatorDirectUrl(x) || x`; 823ebf7
// closed those seven `|| raw` fallbacks (correctly — they were the unattributed
// leak), which turned "attribution quietly skipped" into "the CTA does not
// render at all". Caught by test-detail-cta-ladder, whose fixture uses the apex
// form; lib/commerce's own redirect allowlist already treats the apex as valid
// Viator inventory (check-commerce-redirect: "the apex domain is allowed"), so
// this was the outlier, not the fixture.
// STILL EXACT-HOST: `(?:www\.)?viator\.com` and nothing else — a prefix match
// would hand our pid to viator.com.attacker.net.
export function viatorDirectUrl(url) {
  if (!url || !/^https:\/\/(?:www\.)?viator\.com\//.test(url)) return null;
  return VIATOR ? withViatorTracking(url) : url;
}

// 2026-07-31: the INTERNAL form of viatorDirectUrl. /culture/[metro] rendered
// viatorDirectUrl() straight into an <a href>, so a live monetized link sat in
// the DOM and every click bypassed /api/viator/go — no provider_redirect_started,
// no server record, and a partner URL that any JS-rendering crawler "clicks".
//
// Same destination, same attribution (the route re-applies withViatorTracking),
// but the handoff is ours. The exact product URL travels as ?product= and is
// re-validated server-side against the viator.com host before it can become a
// Location — the page is not trusted to have supplied a safe destination.
export function viatorProductGoUrl(productUrl, city, kind, surface) {
  // Apex and www are both ours (same rule as viatorDirectUrl). Normalize to
  // www so /api/viator/go's isValidViatorProduct (exact www host) accepts it.
  if (!productUrl || !/^https:\/\/(?:www\.)?viator\.com\//.test(productUrl)) return null;
  const product = String(productUrl).replace(/^https:\/\/viator\.com\//i, "https://www.viator.com/");
  if (!/^https:\/\/www\.viator\.com\//.test(product)) return null;
  let u = "/api/viator/go?product=" + encodeURIComponent(product);
  if (city) u += "&city=" + encodeURIComponent(String(city));
  if (kind) u += "&kind=" + encodeURIComponent(String(kind));
  if (surface) u += "&surface=" + encodeURIComponent(String(surface));
  return u;
}

// REMOVED 2026-07-30 — hotelSearchUrl(). It returned a bare
// booking.com/searchresults.html?ss=... with NO affiliate parameter and no env
// var that could add one: unattributable BY CONSTRUCTION, not by misconfiguration.
// It had zero callers; its only remaining mentions are comments describing it as
// a removed parallel path. Deleted rather than left callable, because dead code
// that returns a free-traffic partner link is a loaded gun pointed at whoever
// next wires "hotel search on guides". Do not re-add it — if guides need hotel
// search, route it through hotelUrl()/Stay22, which is attributable.

// v6.62 (Ticketmaster CORRECTION): Ticketmaster does NOT monetize via an appended
// query param -- it runs through the Impact affiliate network, which monetizes via a
// REDIRECT tracking link on Impact's own domain (ticketmaster.evyy.net). The old
// query-param-append approach (v5.54/#294) never attributed a single click and is
// retired. Confirmed live-generated link shape (WayfindLLC account, 2026-07-21):
//   https://ticketmaster.evyy.net/c/7475855/264167/4272?u=<ENCODED_DESTINATION_URL>
// where the path is /c/{SID}/{CAMPAIGN}/{AD} and `u` carries the URL-encoded final
// Ticketmaster destination. SID 7475855 is the Impact Media Partner ID (WayfindLLC) --
// NOT secret; it rides in every link. Campaign/ad default to the confirmed live values
// and are overridable per surface via env. US Ticketmaster brand is approved.
const TM_IMPACT_SID = (process.env.NEXT_PUBLIC_IMPACT_SID || "7475855").trim();
const TM_IMPACT_CAMPAIGN = (process.env.NEXT_PUBLIC_TM_IMPACT_CAMPAIGN || "264167").trim();
const TM_IMPACT_AD = (process.env.NEXT_PUBLIC_TM_IMPACT_AD || "4272").trim();
const TM_IMPACT_DESTPARAM = (process.env.NEXT_PUBLIC_TM_IMPACT_DESTPARAM || "u").trim(); // Impact deep-link param; confirmed "u"
const TM_IMPACT_HOST = "ticketmaster.evyy.net";
// v5.97: the Impact/Ticketmaster link is Ticketmaster-FAMILY specific (Ticketmaster,
// Live Nation, TicketWeb all run the same TM/Impact affiliate program). Wrapping a
// NON-TM ticket URL (SeatGeek, Eventbrite, AXS, DICE, StubHub...) in the TM Impact
// redirect would not attribute the click AND would hand a competitor's destination to
// Ticketmaster's tracker, so we guard on the host: TM-family gets the redirect, every
// other provider is a clean pass-through.
const TM_FAMILY = /(?:^|\.)(?:ticketmaster|livenation|ticketweb)\.[a-z]{2,}(?:\.[a-z]{2,})?$/i;
export function isTicketmasterFamily(url) {
  try { return TM_FAMILY.test(new URL(url).hostname); } catch { return false; }
}
// Build the Impact redirect link that wraps a Ticketmaster destination URL. subId (a
// short surface tag like "home_pulse" / "event_<id>" / "ranking") flows to Impact's
// subId1 for per-surface reporting. Dormant-safe: if any ID is unset it returns the raw
// destination rather than an unattributed-but-broken redirect.
export function tmImpactLink(destUrl, subId) {
  if (!destUrl || !TM_IMPACT_SID || !TM_IMPACT_CAMPAIGN || !TM_IMPACT_AD) return destUrl || null;
  try {
    const q = new URLSearchParams();
    q.set(TM_IMPACT_DESTPARAM, destUrl);
    if (subId) q.set("subId1", String(subId).slice(0, 40));
    return `https://${TM_IMPACT_HOST}/c/${TM_IMPACT_SID}/${TM_IMPACT_CAMPAIGN}/${TM_IMPACT_AD}?` + q.toString();
  } catch { return destUrl; }
}
// Route every outbound Ticketmaster click through the Impact redirect. Non-TM providers
// pass through untouched. subId is optional; when omitted the link still attributes.
export function ticketOutUrl(url, subId) {
  if (!url || !isTicketmasterFamily(url)) return url;
  return tmImpactLink(url, subId) || url;
}

// Server redirect path for Ticketmaster-family event links. The UI never renders
// the raw ticketmaster.com URL; it links here, and this route validates the
// destination, applies Impact tracking server-side, and emits
// provider_redirect_started.
export function ticketmasterGoUrl(url, opts = {}) {
  if (!url) return null;
  const q = new URLSearchParams({ url: String(url) });
  if (opts.surface) q.set("surface", String(opts.surface));
  if (opts.contentId) q.set("content", String(opts.contentId));
  if (opts.offerId) q.set("offer", String(opts.offerId));
  return "/api/ticketmaster/go?" + q.toString();
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
// 2026-08-13: NOW FAILS CLOSED, matching vrboUrl. The dark-but-functional
// posture above was an owner-decided exception with a deadline, and the deadline
// was today. Uber Eats affiliate approval has not landed and the project is
// parked, so the exception expired into its intended end state rather than being
// extended: with no template we can attribute nothing, so we render nothing.
//
// This costs no revenue — an untracked click earned $0 either way — and it frees
// the CTA slot. Both call sites already null-check (lib/detailCta.js falls
// through to the Maps "menu"/"pickup" CTA; app/eat/[metro]/[cuisine] uses
// `|| null`), so the user still gets a working action on every restaurant card.
//
// TO RE-ARM: set NEXT_PUBLIC_UBEREATS_TEMPLATE to the tracked wrapper (an
// Impact-style URL containing a literal "{url}") and every click starts earning.
// No code change. Then this returns the wrapped link again on its own.
export function uberEatsUrl(name, city) {
  if (!name) return null;
  if (!UBEREATS_TEMPLATE || UBEREATS_TEMPLATE.indexOf("{url}") < 0) return null;
  const q = encodeURIComponent(String(name) + (city ? " " + city : ""));
  const dest = "https://www.ubereats.com/search?diningMode=DELIVERY&q=" + q;
  try { return UBEREATS_TEMPLATE.replace("{url}", encodeURIComponent(dest)); } catch { return null; }
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
  // v6.78 — NO TEMPLATE, NO LINK. This used to `return dest` when
  // NEXT_PUBLIC_VRBO_TEMPLATE was unset, which is not a dead link — it is a
  // WORKING, fully untracked one. The user clicks, lands on VRBO, may book, and
  // we earn nothing: free traffic to Expedia out of our highest-commission
  // category. Verified missing in Vercel production 2026-07-30, so this has been
  // the live behaviour.
  //
  // Unlike the marker/PID vars (TP_MARKER, TM_IMPACT_*) a tracking TEMPLATE
  // cannot have a sensible literal fallback — it is account-specific — so the
  // honest degrade is to render nothing and free the slot. Returning null makes
  // every caller's existing `if (!url) return null` suppress the row.
  if (!VRBO_TEMPLATE || VRBO_TEMPLATE.indexOf("{url}") < 0) return null;
  try { return VRBO_TEMPLATE.replace("{url}", encodeURIComponent(dest)); } catch { return null; }
}
