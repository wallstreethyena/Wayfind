// lib/eventDeepLink.js — does an event's outbound button land on THAT event?
//
// Owner, 2026-10-22: "i need to make sure all of the events in the events page
// and everywhere on wayfind have a deeplink". Audit that day: of 991 live
// wf_events rows, 200 sent the reader to a site's front page and 60 to a
// generic calendar/listing page, so the reader had to hunt for the event again
// after tapping. A homepage link is still better than no link, so this module
// never hides a button; it only CLASSIFIES, so the nightly sweep
// (app/api/cron/events-link-health) can report every shallow link and a new
// one cannot slip in unseen.
//
// Pure, no I/O. Locked by scripts/check-event-deeplink.mjs.

// Hosts that exist for ONE event (the festival/haunt's own domain), so the
// front page IS the event's page. Each entry was confirmed by reading the
// live site during the 2026-10-22 audit; add a host only after doing the same.
export const EVENT_DEDICATED_HOSTS = Object.freeze(new Set([
  "apopkaartandfoliagefestival.org",
  "artfestfortmyers.com",
  "billboardlatinmusicweek.com",
  "bradentonarearegatta.com",
  "bradfordcountystrawberryfestival.com",
  "camelotdays.com",
  "capeboom.com",
  "capecoralartfestival.com",
  "capecoraloktoberfest.com",
  "caribbeanculturefest.com",
  "cedarkeypiratefest.com",
  "centralfloridafalleggfest.com",
  "cfvegfest.org",
  "cgaf.com",
  "chainofparks.org",
  "christmasatgaylordpalms.com",
  "clearwatergreekfest.com",
  "clewistonsugarfestival.com",
  "conchrepublic.com",
  "coquinabeachmarket.org",
  "cowsncabs.com",
  "dazzlingorlando.com",
  "deckthechairs.org",
  "delrayaffair.com",
  "dxlwineandcheese.com",
  "englewoodfestival.com",
  "events.veneziarenaissancefaire.com",
  "evergladesseafoodfestival.org",
  "fallfestivaloftheartsdeland.com",
  "feastoflittleitaly.com",
  "fernandinasongwritersfestival.org",
  "festivalboca.org",
  "fiestainthepark.com",
  "flascot.com",
  "florida.rollingloud.com",
  "floridaasl.com",
  "floridabohemianfestival.com",
  "floridakeysseafoodfestival.com",
  "floridaseafoodfestival.com",
  "flstrawberryfestival.com",
  "forbiddenkingdom.frontgatetickets.com",
  "forbiddenkingdomfestival.com",
  "fortmyersbeachshrimpfestival.com",
  "foxfamjam.com",
  "foxsquirrelcornmaze.com",
  "froglegfestival.com",
  "ftmyersfest.com",
  "gainesvilledowntownartfest.net",
  "galaxyfrightnights.com",
  "gasparillaarts.com",
  "ggaf.org",
  "gomanateefest.com",
  "gostrawberryfest.com",
  "grantseafoodfestival.com",
  "greatdayoviedo.org",
  "greekfestfortmyers.com",
  "groundupmusicfestival.com",
  "gullahgeecheefestival.com",
  "halifaxartfestival.com",
  "halloweennotte.com",
  "harvestholler.com",
  "hoggetownemedfaire.com",
  "holidaylightsdrivethru.com",
  "hollyweirdfestival.com",
  "houseofhorrorcarnival.com",
  "hulaween.com",
  "hulaween.frontgatetickets.com",
  "hydeparkpetparade.com",
  "imagesartfestival.org",
  "indiafesttampa.com",
  "jupiterseafoodfestival.net",
  "keywestlobsterfest.com",
  "kumquatfestival.org",
  "lakehelenfest.com",
  "lakelandpigfest.org",
  "localtopia.keepsaintpetersburglocal.org",
  "longwoodfestival.com",
  "lynqortreat.com",
  "mainsailart.org",
  "mandarinartfestival.org",
  "miamibeachpride.com",
  "miamiopen.com",
  "miamiwonderland.com",
  "micanopyfallfestival.org",
  "monticellowatermelonfestival.com",
  "nativerhythmsfestival.com",
  "northfloridafair.com",
  "ocalachristmasparade.org",
  "olusteefestival.com",
  "orlando.edc.com",
  "orlandobeerfestival.com",
  "orlandogreekfest.com",
  "palmcoastfest.com",
  "panhandlewatermelon.com",
  "pensacolachristmasparade.org",
  "pensacolafest.com",
  "pensacolawinterfest.org",
  "portsaintlucieseafoodfestival.com",
  "portstluciefest.com",
  "puntagordaboatparade.com",
  "rightwhalefestival.com",
  "rocknrollrevival.org",
  "rockywaterbrewfest.com",
  "sandestinwinefestival.com",
  "sanfordporchfest.org",
  "sanibelartfair.com",
  "santaswonderlandfestival.com",
  "sarasotafilmfestival.com",
  "sarasotaholidayparade.com",
  "sarasotamagyarfesztival.com",
  "sarasotamedievalfair.com",
  "screamageddon.com",
  "sebringsodafest.com",
  "semtribefair.com",
  "sgibrewfest.com",
  "sgishrimpfest.com",
  "shamrockinfest.com",
  "sobewff.org",
  "spiritofthebuffalopowwow.com",
  "sssco.org",
  "stbarbarafestival.org",
  "stpetecountryfest.com",
  "stuartchristmasparade.com",
  "sugarsandfestival.com",
  "sunshinegetdown.com",
  "suwanneelights.com",
  "swampbuggy.com",
  "tallahasseegreekfoodfest.blog",
  "tampabayvegfest.com",
  "tampagreekfestival.com",
  "tarponspringsbookfestival.com",
  "tasteofpuntagorda.org",
  "thunderbeachproductions.com",
  "thunderbirdpowwow.org",
  "thunderingspiritfamily.com",
  "tickets.circus.fsu.edu",
  "tickets.gaylordpalms.com",
  "tickets.halloweennotte.com",
  "tormentedtrails.com",
  "tormentedtrails.fearticket.com",
  "ultramusicfestival.com",
  "uptownartexpo.com",
  "veneziarenaissancefaire.com",
  "verobeachchristmasparade.org",
  "veteransboatparade.org",
  "vlfoodwine.com",
  "whiskeynbizz.com",
  "wickedmanors.org",
  "wildturkeytrot.com",
  "wormgruntinfestival.com",
  "wpsaf.org",
  "yankeetownseafoodfestival.com",
  "yborcigarfestival.com",
  "zenawakeningfestival.com",
]));

// Last path segment of a page that lists MANY events (or no event at all).
const LISTING_TAIL = /^(?:events?|event-calendar|calendar|calendar-of-events|upcoming-events|whats-on|what-s-on|things-to-do|festivals|shows|concerts|special-events|seasonal-events|happenings|programs|activities|attractions|locations?|menu|info|about|about-us|visit|plan-your-visit|home|index\.html?|en|en-us)$/i;
// "/tickets" alone is a site-wide box office; ".../howl-o-scream/tickets/" is
// that event's own ticket page, so "tickets" is a listing only at the root.
const ROOT_ONLY_LISTING_TAIL = /^(?:tickets|buy-tickets|box-office)$/i;

const hostOf = (u) => u.hostname.toLowerCase().replace(/^www\./, "");

// A SUBDOMAIN store on a ticketing platform (sarasotafrightfest.fearticket.com,
// vanswarpedtourorlando.frontgatetickets.com) belongs to one organizer's event,
// so its front page is that event's ticket page.
const EVENT_STORE_PLATFORMS = /\.(?:fearticket\.com|frontgatetickets\.com|ticketspice\.com|square\.site|saffire\.com|freshtix\.com)$/i;

/**
 * "deep"     the URL points at a specific page (an event, a ticket checkout)
 * "homepage" the site's front page, on a host not dedicated to one event
 * "listing"  a generic calendar / events / menu / location page
 * "none"     no usable http(s) URL
 */
export function eventLinkDepth(url) {
  if (typeof url !== "string" || !url.trim()) return "none";
  let u;
  try { u = new URL(url.trim()); } catch { return "none"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "none";
  const host = hostOf(u);
  const segs = u.pathname.split("/").filter(Boolean);
  // Query-string deep links (?event=123, ?eid=, ?id=) are real event pages.
  const queryPick = /(?:^|&)(?:e|eid|event|event_id|eventid|id|p|page_id|show|performance|perf|item|ticket|date)=/i.test(u.search.slice(1));
  if (!segs.length || (segs.length === 1 && /^(?:home|index\.html?|en|en-us)$/i.test(segs[0]))) {
    if (queryPick) return "deep";
    return EVENT_DEDICATED_HOSTS.has(host) || EVENT_STORE_PLATFORMS.test(host) ? "deep" : "homepage";
  }
  const tail = decodeURIComponent(segs[segs.length - 1]);
  // Only a SHALLOW listing path is a listing: "/events/", "/pages/location",
  // "/2026/home". A long path ending in "calendar" (fareharbor
  // ".../items/756803/calendar/") is one item's own booking calendar.
  if (segs.length <= 2 && (LISTING_TAIL.test(tail) || (segs.length === 1 && ROOT_ONLY_LISTING_TAIL.test(tail))) && !queryPick) {
    return EVENT_DEDICATED_HOSTS.has(host) || EVENT_STORE_PLATFORMS.test(host) ? "deep" : "listing";
  }
  return "deep";
}

/** The link the event's button actually publishes (same order as eventOutboundUrl). */
export function eventPrimaryUrl(row) {
  if (!row) return "";
  for (const raw of [row.official_ticket_url, row.official_event_url, row.event_page_url]) {
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

/** Classify a wf_events row by the link its button publishes. */
export function eventRowLinkDepth(row) {
  return eventLinkDepth(eventPrimaryUrl(row));
}
