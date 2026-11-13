// lib/detailCta.js — detail-sheet primary CTA ladder (v1.0, Kimi revenue lane).
//
// Pure functions. The ladder decides the ONE primary action on the place detail
// sheet and is the single source of truth for its label, href, and monetized
// flag. Callers render the button; this module does not build JSX and does not
// fire events.
//
// Rules from the spec, in precedence order:
//   1. An exact founder-verified placePartnerPick → that product (even when
//      Google says the venue is closed — a tour is not venue admission).
//   2. Closed right now, no pin → "Add to plan" (never a false booking).
//   3. Place type selects the verb:
//        attraction / tour / experience / museum / theme park → "Book tickets"
//        hotel / lodging                              → "Check rates"
//        restaurant with a live deal                  → "Claim deal"
//        restaurant without deal, reservable          → "Reserve"   (dark today)
//        restaurant without deal, not reservable      → "See menu"
//        cafe / bakery                                → "See menu" / "Directions"
//        (delivery/pickup rungs removed 2026-08-26 with Uber Eats — owner
//        directive; see lib/affiliates.js REMOVED note)
//        beach                                        → "Check conditions" / "Directions"
//        bar / nightlife                              → "See deals" / "Reserve" / "Get a ride"
//        shopping / retail                            → "See deals" / "Directions"
//        unsupported                                  → "Directions"
//   3. A monetized href must always be accompanied by its FTC disclosure.
//   4. The ladder always returns a CTA; unsupported falls back to Directions.

import { partnerTicketLabel } from "./partnerCopy.js";
import { reserveLabel, isReserveLane } from "./reserveCapability.js";
import * as Aff from "./affiliates.js";
import { isTrueLodging } from "./lodging.js";
import { bookingTargets, placeEvidence } from "./bookingResolve.js";
import { bookItTarget } from "./monetize.js";
import { isTpProgramLive, TP_PROGRAMS } from "./travelpayouts.js";
import { couponForPlace, couponIsLive } from "./coupons.js";
import { siteTodayStr } from "./siteTime.js";
import * as Tags from "./tags.js";
import * as Ranking from "./ranking.js";
// v8.29.3 — THE CARD AND THE SHEET MUST NAME THE SAME PRODUCT (owner,
// 2026-08-20, on a kayak tour whose card showed "TICKETS · Viator" and whose
// detail sheet showed Directions and nothing else: "where the fuck is the
// viator link ... i need this to be fixed globally").
//
// Two resolvers existed. The CARD reads lib/placePartnerPicks.js — the
// hand-verified exact-name registry, one place to one product code. The SHEET
// ran this ladder, which resolves tickets through bookingTargets/travelpayouts
// and knows nothing about that registry, so any place in it that the ladder's
// own probes missed promised a ticket on the card and dropped it on the sheet.
// A card that advertises a purchase the next screen cannot make is worse than
// no card: it spends the click and then loses it.
//
// The registry now runs FIRST, for every place type. It is the most specific
// thing we know — an exact, human-verified product for this exact venue — so
// it outranks every probe below it, and both surfaces cite one source.
import { placePartnerPick } from "./placePartnerPicks.js";
import { commerceHref } from "./commerce.js";
import { safeUrl } from "./links.js";
import { isTicketedPlace, isVerifiedFreePlace } from "./gamePlan.js";

export const DETAIL_CTA_TYPES = Object.freeze({
  tickets: "tickets",
  officialTickets: "official_tickets",
  admission: "admission",
  deal: "deal",
  reserve: "reserve",
  menu: "menu",
  website: "website",
  conditions: "conditions",
  ride: "ride",
  rates: "rates",
  plan: "plan",
  directions: "directions",
});

export function detailCtaLabel(type) {
  switch (type) {
    case DETAIL_CTA_TYPES.tickets: return "Get tickets";
    case DETAIL_CTA_TYPES.officialTickets: return "Official tickets";
    case DETAIL_CTA_TYPES.admission: return "See admission";
    case DETAIL_CTA_TYPES.deal: return "Claim deal";
    case DETAIL_CTA_TYPES.reserve: return "Reserve";
    case DETAIL_CTA_TYPES.menu: return "See menu";
    case DETAIL_CTA_TYPES.website: return "Official site";
    case DETAIL_CTA_TYPES.conditions: return "Check conditions";
    case DETAIL_CTA_TYPES.ride: return "Get a ride";
    case DETAIL_CTA_TYPES.rates: return "Check rates";
    case DETAIL_CTA_TYPES.plan: return "Add to my trip"; // v7.08 (owner, discovery-first strategy): "my trip" reads as a possession being built, not an app chore
    case DETAIL_CTA_TYPES.directions: return "Directions";
    default: return "Directions";
  }
}

function _types(place) {
  return [
    ...((place && place.types) || []),
    place && place.primaryType,
    place && place.primary_type,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
}

function _name(place) {
  return String((place && place.name) || "").toLowerCase();
}

function _typeText(place) {
  return _types(place).join(" ");
}

function identityOf(place) {
  return Tags.resolveIdentity(place && place.types, place && place._event);
}

function cityPart(locName) {
  return locName ? locName.split(",")[0].trim() : "";
}

function directionsUrl(place) {
  if (!place) return null;
  if (place.mapsUrl) return place.mapsUrl;
  const hasCoords = place.lat != null && place.lng != null;
  const looksLikePlaceId = typeof place.id === "string" && /^ChIJ|^GhIJ|^Eh|^0x/.test(place.id) && place.id.length >= 20;
  if (looksLikePlaceId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || "")}&query_place_id=${encodeURIComponent(place.id)}`;
  }
  if (place.id && /^(fsq|osm|ridb|nps):/.test(place.id) && hasCoords) {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  }
  if (place.name) {
    const q = encodeURIComponent(place.name + (place.address ? " " + place.address : ""));
    return hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${q}&center=${place.lat},${place.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  if (hasCoords) return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  return null;
}

function isAttractionTourExperience(place) {
  const id = identityOf(place);
  return id === "attraction" || id === "tour" || id === "museum" || id === "themePark";
}

function isHotel(place) {
  return isTrueLodging(place);
}

function isRestaurant(place) {
  const t = _typeText(place);
  return (/restaurant|meal_takeaway|meal_delivery|pizza|sandwich|burger|taco|sushi/.test(t) && !/lodging|hotel|resort/.test(t));
}

function isCafeBakery(place) {
  return /cafe|coffee_shop|bakery|ice_cream_shop|tea_house|juice_shop|donut_shop|dessert_shop/.test(_typeText(place));
}

function isBarNightlife(place) {
  return /bar|night_club|pub|wine_bar|brewery|brewpub|cocktail_bar|liquor/.test(_typeText(place));
}

function isShopping(place) {
  const t = _typeText(place);
  return /shopping_mall|market|department_store|store|shopping_center/.test(t) || /_store/.test(t);
}

function isBeach(place) {
  const t = _typeText(place);
  return /\bbeach\b/.test(t) || place.category === "beach" || /natural_feature/.test(t);
}

function liveDealFor(place, offers, todayIso) {
  const offer = offers && offers[place.id];
  if (offer && (offer.url || offer.affiliate_url)) {
    return {
      href: offer.url || offer.affiliate_url,
      provider: offer.source || "offer",
      offerId: offer.id || null,
      monetized: false, // dashboard offers are not yet routed through commerce schema
    };
  }
  const cpn = couponForPlace(place, todayIso);
  if (cpn && cpn.url && couponIsLive(cpn, todayIso)) {
    // Non-affiliate direct venue coupons (e.g. Monday free Museum of Art admission
    // at ringling.org) are editorial deals, not restaurant Claim-deal overrides on museums.
    if (!cpn.commerce && isAttractionTourExperience(place)) return null;
    return {
      href: cpn.url,
      provider: cpn.commerce ? cpn.commerce.provider : null,
      offerId: cpn.commerce ? cpn.commerce.offerId : null,
      monetized: !!cpn.commerce,
    };
  }
  return null;
}

function bookingHrefFor(place, kind, viaTours, locName) {
  const vt = viaTours && viaTours[place.id];
  const hasTours = !!(vt && !vt.loading && Array.isArray(vt.items) && vt.items.length > 0);
  const topItem = hasTours ? vt.items[0] : null;
  // Book tickets is NEVER the search fallback. tu includes goFallback
  // ("Search Viator"); that must not paint as Book. Only a verified
  // product URL may become the tickets rung.
  const targets = bookingTargets(place, kind, topItem, locName, {
    placeEvidence: placeEvidence(viaTours, place.id),
  });
  return isHotel(place) ? targets.tu : targets.verifiedUrl || null;
}

/**
 * Rung 3 of the attraction/tour ladder: bookItTarget()'s best-EV Travelpayouts
 * match. Returns { href, provider, offerId } or null, never a bare string —
 * the caller needs the real provider/offerId so the CTA can disclose which
 * partner it actually links, not a generic "booking" label.
 *
 * THE BUG THIS FIXES (2026-09-15). bookItTarget()'s EXACT-PRODUCT rung
 * (lib/venueOffers.js, added for audit finding F4) returns
 * { kind: "offer", provider, offerId, url: null } for a hand-verified
 * VENUE_OFFERS row — url is null BY DESIGN, so the client never sees a raw
 * destination (test-book-it-venues.mjs asserts exactly that: `!t.url`).
 * tpDeepLink() requires a destinationUrl and returns null the moment one is
 * missing, so this rung called tpDeepLink(target.provider, null, …) and always
 * got null back — a venue offer (e.g. nyc-budget-911-memorial) could NEVER
 * surface here, even though bookItTarget had already found it. An offer
 * target now routes through Wayfind's own commerce redirect instead, the same
 * path the registry rung (step 1, exactPartner) already uses.
 */
const TP_MERCHANTS = Object.freeze({
  tiqets: "Tiqets",
  klook: "Klook",
  wegotrip: "WeGoTrip",
  ticketnetwork: "TicketNetwork",
});

const BLOCKED_EXTERNAL_ACTION_HOST_RX = /(^|\.)(?:google\.com|goo\.gl|maps\.apple\.com|disney\.com|disney\.go\.com|disneyworld\.com|disneyland\.com|disneysprings\.com|rundisney\.com|viator\.com|tiqets\.com|klook\.com|undercovertourist\.com|getyourguide\.com|ticketnetwork\.com|tripadvisor\.com|yelp\.com|wikipedia\.org|wikidata\.org|doordash\.com|ubereats\.com|grubhub\.com|visitsarasota\.com|visitflorida\.com|visittampabay\.com|visitorlando\.com)$/i;
const GENERIC_SEARCH_ACTION_RX = /(?:\/search(?:\/|$|\?)|\/searchresults|[?&](?:q|query|s|search|keyword|keywords|term)=)/i;

function cleanExternalActionUrl(raw) {
  const clean = safeUrl(raw);
  if (!clean || !/^https?:\/\//i.test(clean)) return null;
  let u;
  try { u = new URL(clean); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!host || BLOCKED_EXTERNAL_ACTION_HOST_RX.test(host)) return null;
  if (GENERIC_SEARCH_ACTION_RX.test(clean)) return null;
  return clean;
}

function usableFirstPartyAction(slot, todayIso) {
  if (!slot) return null;
  if (typeof slot === "string") {
    const href = cleanExternalActionUrl(slot);
    return href ? { href, manual: false, source: "first_party" } : null;
  }
  if (typeof slot !== "object") return null;
  if (slot.confidence !== "EXACT" && slot.confidence !== "HIGH_CONFIDENCE") return null;
  if (slot.verification_status !== "verified" && slot.verification_status !== "manual_verified") return null;
  if (slot.valid_until && String(slot.valid_until).slice(0, 10) < String(todayIso).slice(0, 10)) return null;
  const href = cleanExternalActionUrl(slot.url);
  if (!href) return null;
  return {
    href,
    manual: slot.verification_status === "manual_verified",
    source: slot.source || "first_party",
  };
}

function isReservationHref(url) {
  if (!url || typeof url !== "string") return false;
  if (/\/(?:event-reservations?|private-events?|group-events?|catering)(?:\/|$|\?|#)/i.test(url)) return false;
  return /(?:opentable\.com|resy\.com|exploretock\.com|sevenrooms\.com)/i.test(url)
    || /\/(?:reservations?|reserve|book-a-table)(?:\/|$|\?|#)/i.test(url);
}

function isMenuHref(url) {
  if (!url || typeof url !== "string") return false;
  return /(?:toasttab\.com|popmenu\.com|chownow\.com|olo\.com|bentobox\.com|spoton\.com|square\.site|squareup\.com)/i.test(url)
    || /\/(?:menus?(?:\/|$|\?|#)|[a-z0-9-]+-menus?(?:\/|$|\?|#)|food-and-drink(?:-menus?)?(?:\/|$|\?|#)|dinner(?:\/|$|\?|#)|lunch(?:\/|$|\?|#)|breakfast(?:\/|$|\?|#)|drinks(?:\/|$|\?|#)|brand-order(?:\/|$|\?|#)|order(?:\/|$|\?|#))/i.test(url);
}

function firstPartyTicketAction({ detail, editorial, websiteHref, curatedNotes, mapsUrl, fpaTicket = null, fpaAdmission = null }) {
  if (isBeach(detail) || isVerifiedFreePlace(detail, editorial) || Aff.isNeverBookable(detail)) return null;
  if (fpaTicket) {
    return {
      type: DETAIL_CTA_TYPES.officialTickets,
      label: detailCtaLabel(DETAIL_CTA_TYPES.officialTickets),
      href: fpaTicket.href,
      monetized: false,
      provider: null,
      offerId: null,
      actionSource: fpaTicket.manual ? "manual_verified_ticket" : "first_party_ticket",
      mapsUrl,
    };
  }
  if (fpaAdmission) {
    return {
      type: DETAIL_CTA_TYPES.admission,
      label: detailCtaLabel(DETAIL_CTA_TYPES.admission),
      href: fpaAdmission.href,
      monetized: false,
      provider: null,
      offerId: null,
      actionSource: fpaAdmission.manual ? "manual_verified_admission" : "first_party_admission",
      mapsUrl,
    };
  }
  const isTicketedExperience = isTicketedPlace(detail, editorial)
    || /\b(?:amusement_center|live_music_venue|escape_room)\b/.test(_typeText(detail))
    || /\b(?:escape\s+(?:room|game|games|adventures?|reality)|escapology|sandbox\s+vr|floridian\s+social)\b/i.test(_name(detail));
  if (!isTicketedExperience) return null;
  if (Array.isArray(curatedNotes)) {
    for (const n of curatedNotes) {
      if (!n || typeof n !== "object") continue;
      const clean = cleanExternalActionUrl(n.url);
      if (clean && /\b(tickets?|admissions?|box\s*office|book|passes?)\b/i.test(`${n.label || ""} ${clean}`)) {
        return {
          type: DETAIL_CTA_TYPES.officialTickets,
          label: detailCtaLabel(DETAIL_CTA_TYPES.officialTickets),
          href: clean,
          monetized: false,
          provider: null,
          offerId: null,
          actionSource: "curated_note_ticket",
          mapsUrl,
        };
      }
    }
  }
  const cleanSite = cleanExternalActionUrl(websiteHref);
  if (!cleanSite) return null;
  if (/\/(?:tickets?|admissions?|box-?office|buy-tickets|visit\/tickets)(?:\/|$|\?|#)/i.test(cleanSite)) {
    return {
      type: DETAIL_CTA_TYPES.officialTickets,
      label: detailCtaLabel(DETAIL_CTA_TYPES.officialTickets),
      href: cleanSite,
      monetized: false,
      provider: null,
      offerId: null,
      actionSource: "first_party_ticket",
      mapsUrl,
    };
  }
  return {
    type: DETAIL_CTA_TYPES.admission,
    label: detailCtaLabel(DETAIL_CTA_TYPES.admission),
    href: cleanSite,
    monetized: false,
    provider: null,
    offerId: null,
    actionSource: "first_party_admission",
    mapsUrl,
  };
}

function travelpayoutsHrefFor(place, locName) {
  const live = Object.keys(TP_PROGRAMS).filter(isTpProgramLive);
  const target = bookItTarget(place, { available: live, city: cityPart(locName) });
  // Only exact hand-verified venue offers may claim the primary CTA. Generic
  // search wrappers (e.g. TicketNetwork search via secondary theater types on
  // museums like The Ringling) are never exact venue tickets and caused blank
  // primary slots when handed to BookingCTA.
  if (!target || target.kind !== "offer") return null;
  const href = commerceHref({ provider: target.provider, offerId: target.offerId, surface: "detail_primary", contentId: place && place.id });
  if (!href) return null;
  const merchant = TP_MERCHANTS[target.provider] || target.provider;
  return {
    href,
    provider: target.provider,
    offerId: target.offerId,
    merchant,
    product: target.product || "ticket",
    exact: true,
  };
}

/**
 * Resolve the single primary CTA for a place detail sheet.
 *
 * @param {object} params
 * @param {object} params.detail      the place object
 * @param {string} params.kind        placeKind(detail)
 * @param {object} params.viaTours    verified tours map
 * @param {string} params.locName     "City, ST"
 * @param {object} params.offers      offers map
 * @param {boolean|null} params.openState live open/closed state
 * @param {object} [params.catalog]  optional pin-serveability catalog
 * @param {string|null} [params.websiteHref] verified alive official website URL
 * @param {object|null} [params.editorial] verified Wayfind editorial object
 * @param {Array|null} [params.curatedNotes] founder-curated venue notes
 * @param {boolean} [params.reservePartner] true when this place is a Wayfind
 *   reservation partner or verified OpenTable restaurant (lib/reserveClient.js
 *   useReservePartner). Restaurants and bars then offer "Reserve a table"
 *   (the in-app sheet) ahead of a website reservation link.
 * @param {string|null} [params.reserveLane] the capability lane from lib/reserveCapability.js: "instant" | "request" |
 *   "handoff" (verified, wins over a website reservation link) or "ask" (sit down restaurant or bar with no route; only
 *   used when nothing more specific, a verified reservation link included, would fill the slot). reservePartner=true
 *   is the older spelling of a verified lane and reads as "instant".
 * @param {object|null} [params.firstPartyActions] verified first-party action slots
 * @returns {{type:string,label:string,href:string|null,monetized:boolean,provider:string|null,offerId:string|null,mapsUrl:string|null,actionSource?:string}}
 */
// The in-app Wayfind Reserve sheet says what it does; an outside reservation link keeps "Reserve".
export const RESERVE_IN_APP_LABEL = "Reserve a table";

export function resolveDetailCta({ detail, kind, viaTours, locName, offers, openState, catalog, websiteHref = null, editorial = null, curatedNotes = null, reservePartner = false, reserveLane = null, firstPartyActions = null }) {
  if (!detail) {
    return { type: DETAIL_CTA_TYPES.directions, label: detailCtaLabel(DETAIL_CTA_TYPES.directions), href: null, monetized: false, provider: null, offerId: null, mapsUrl: null, actionSource: "fallback_directions" };
  }

  const mapsUrl = directionsUrl(detail);
  const todayIso = siteTodayStr();
  const lane = isReserveLane(reserveLane) || reserveLane === "ask" ? reserveLane : (reservePartner ? "instant" : null);
  const reserveCta = (l) => ({ type: DETAIL_CTA_TYPES.reserve, label: reserveLabel(l), href: "#reserve", monetized: false, provider: null, offerId: null, actionSource: l === "ask" ? "wayfind_reserve_ask" : "wayfind_reserve", reserveLane: l, mapsUrl });
  const verifiedFree = isBeach(detail) || isVerifiedFreePlace(detail, editorial);

  const fpaSite = usableFirstPartyAction(firstPartyActions && firstPartyActions.officialWebsite, todayIso);
  const fpaTicket = usableFirstPartyAction(firstPartyActions && firstPartyActions.ticket_url, todayIso);
  const fpaAdmission = usableFirstPartyAction(firstPartyActions && firstPartyActions.admission_url, todayIso);
  const fpaReserve = usableFirstPartyAction(firstPartyActions && firstPartyActions.reservation_url, todayIso);
  const fpaMenu = usableFirstPartyAction(firstPartyActions && firstPartyActions.menu_url, todayIso);

  // 1. EXACT VERIFIED PRODUCT. Same registry the place card reads, so the two
  // surfaces cannot disagree about whether this place is bookable.
  //
  // Free-place protection: a free public place or beach can NEVER sell a paid
  // admission "ticket" (only an explicitly typed "tour" departing from a
  // non-beach preserve like Shell Key is allowed).
  const exactPartner = placePartnerPick(detail, catalog);
  if (exactPartner && !(verifiedFree && exactPartner.product !== "tour")) {
    const exactHref = commerceHref({ provider: exactPartner.provider, offerId: exactPartner.offerId, surface: "detail_primary", contentId: detail.id });
    if (exactHref) {
      return {
        type: DETAIL_CTA_TYPES.tickets,
        exact: true,
        label: exactPartner.ctaLabel || partnerTicketLabel(exactPartner.merchant, { arrow: false, product: exactPartner.product }),
        href: exactHref,
        monetized: true,
        provider: exactPartner.provider,
        offerId: exactPartner.offerId,
        merchant: exactPartner.merchant,
        product: exactPartner.product || "ticket",
        actionSource: "partner_exact",
        mapsUrl,
      };
    }
  }

  const walkupFallback = (openType, customHref = null, actionSource = null) => {
    if (openState === false) {
      return { type: DETAIL_CTA_TYPES.plan, label: detailCtaLabel(DETAIL_CTA_TYPES.plan), href: null, monetized: false, provider: null, offerId: null, actionSource: "closed_plan", mapsUrl };
    }
    return {
      type: openType,
      label: detailCtaLabel(openType),
      href: customHref || mapsUrl,
      monetized: false,
      provider: null,
      offerId: null,
      actionSource: actionSource || (openType === DETAIL_CTA_TYPES.directions ? "fallback_directions" : openType),
      mapsUrl,
    };
  };

  const deal = liveDealFor(detail, offers, todayIso);
  const cleanWebsite = cleanExternalActionUrl(websiteHref) || (fpaSite ? fpaSite.href : null);
  const websiteFallbackForDining = () => {
    if (!cleanWebsite) return null;
    if (isMenuHref(cleanWebsite)) {
      return walkupFallback(DETAIL_CTA_TYPES.menu, cleanWebsite, "first_party_menu");
    }
    if (fpaSite) {
      return walkupFallback(DETAIL_CTA_TYPES.website, cleanWebsite, "first_party_site");
    }
    return walkupFallback(DETAIL_CTA_TYPES.menu, cleanWebsite, "first_party_site");
  };

  // 2. Attraction / tour / experience / museum / theme park → tickets or official admission.
  if (isAttractionTourExperience(detail)) {
    if (verifiedFree) {
      return walkupFallback(DETAIL_CTA_TYPES.directions);
    }
    // Manual-verified first-party ticket/admission explicitly outranks automated viaTours probes.
    if (openState !== false && ((fpaTicket && fpaTicket.manual) || (fpaAdmission && fpaAdmission.manual))) {
      const manualOfficial = firstPartyTicketAction({ detail, editorial, websiteHref: cleanWebsite, curatedNotes, mapsUrl, fpaTicket, fpaAdmission });
      if (manualOfficial) return manualOfficial;
    }
    const bookingHref = bookingHrefFor(detail, kind, viaTours, locName);
    if (bookingHref) {
      return { type: DETAIL_CTA_TYPES.tickets, label: detailCtaLabel(DETAIL_CTA_TYPES.tickets), href: bookingHref, monetized: true, provider: "booking", offerId: null, actionSource: "partner_booking", mapsUrl };
    }
    const tp = travelpayoutsHrefFor(detail, locName);
    if (tp) {
      return {
        type: DETAIL_CTA_TYPES.tickets,
        exact: true,
        label: partnerTicketLabel(tp.merchant, { arrow: false, product: tp.product }),
        href: tp.href,
        monetized: true,
        provider: tp.provider,
        offerId: tp.offerId,
        merchant: tp.merchant,
        product: tp.product || "ticket",
        actionSource: "partner_tp",
        mapsUrl,
      };
    }
    if (openState !== false) {
      const officialTicket = firstPartyTicketAction({ detail, editorial, websiteHref: cleanWebsite, curatedNotes, mapsUrl, fpaTicket, fpaAdmission });
      if (officialTicket) return officialTicket;
    }
    return walkupFallback(DETAIL_CTA_TYPES.directions);
  }

  // 3. Hotel / lodging → rates.
  if (isHotel(detail)) {
    const href = bookingHrefFor(detail, kind, viaTours, locName);
    if (href) {
      return { type: DETAIL_CTA_TYPES.rates, label: detailCtaLabel(DETAIL_CTA_TYPES.rates), href, monetized: true, provider: "stay22", offerId: null, actionSource: "partner_stay22", mapsUrl };
    }
    return walkupFallback(DETAIL_CTA_TYPES.directions);
  }

  // 4. Restaurant — never degrade "See menu" to Google Maps, Google Search, or non-menu homepages.
  if (isRestaurant(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, actionSource: "deal", mapsUrl };
    }
    // Wayfind Reserve (partner or verified OpenTable) wins over a website reservation link: it opens
    // our own sheet. It sits before the closed-now fallback because a table is for a later time.
    if (lane && lane !== "ask") return reserveCta(lane);
    if (openState !== false) {
      if (fpaReserve) {
        return { type: DETAIL_CTA_TYPES.reserve, label: detailCtaLabel(DETAIL_CTA_TYPES.reserve), href: fpaReserve.href, monetized: false, provider: null, offerId: null, actionSource: fpaReserve.manual ? "manual_verified_reserve" : "first_party_reserve", mapsUrl };
      }
      if (cleanWebsite && isReservationHref(cleanWebsite)) {
        return { type: DETAIL_CTA_TYPES.reserve, label: detailCtaLabel(DETAIL_CTA_TYPES.reserve), href: cleanWebsite, monetized: false, provider: null, offerId: null, actionSource: "first_party_reserve", mapsUrl };
      }
      if (lane === "ask") return reserveCta("ask");
      if (fpaMenu) {
        return walkupFallback(DETAIL_CTA_TYPES.menu, fpaMenu.href, fpaMenu.manual ? "manual_verified_menu" : "first_party_menu");
      }
      const siteCta = websiteFallbackForDining();
      if (siteCta) return siteCta;
    }
    return walkupFallback(DETAIL_CTA_TYPES.directions);
  }

  // 5. Cafe / bakery — never degrade "See menu" to Google Maps, Google Search, or non-menu homepages.
  if (isCafeBakery(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, actionSource: "deal", mapsUrl };
    }
    if (openState !== false) {
      if (fpaMenu) {
        return walkupFallback(DETAIL_CTA_TYPES.menu, fpaMenu.href, fpaMenu.manual ? "manual_verified_menu" : "first_party_menu");
      }
      const siteCta = websiteFallbackForDining();
      if (siteCta) return siteCta;
    }
    return walkupFallback(DETAIL_CTA_TYPES.directions);
  }

  // 6. Beach.
  if (isBeach(detail)) {
    if (openState === false) {
      return walkupFallback(DETAIL_CTA_TYPES.conditions);
    }
    return { type: DETAIL_CTA_TYPES.conditions, label: detailCtaLabel(DETAIL_CTA_TYPES.conditions), href: "#beach-conditions", monetized: false, provider: null, offerId: null, actionSource: "beach_conditions", mapsUrl };
  }

  // 7. Bar / nightlife.
  if (isBarNightlife(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, actionSource: "deal", mapsUrl };
    }
    if (lane && lane !== "ask") return reserveCta(lane);
    if (openState !== false) {
      if (fpaReserve) {
        return { type: DETAIL_CTA_TYPES.reserve, label: detailCtaLabel(DETAIL_CTA_TYPES.reserve), href: fpaReserve.href, monetized: false, provider: null, offerId: null, actionSource: fpaReserve.manual ? "manual_verified_reserve" : "first_party_reserve", mapsUrl };
      }
      if (cleanWebsite && isReservationHref(cleanWebsite)) {
        return { type: DETAIL_CTA_TYPES.reserve, label: detailCtaLabel(DETAIL_CTA_TYPES.reserve), href: cleanWebsite, monetized: false, provider: null, offerId: null, actionSource: "first_party_reserve", mapsUrl };
      }
      if (lane === "ask") return reserveCta("ask");
      if (fpaMenu) {
        return walkupFallback(DETAIL_CTA_TYPES.menu, fpaMenu.href, fpaMenu.manual ? "manual_verified_menu" : "first_party_menu");
      }
      const siteCta = websiteFallbackForDining();
      if (siteCta) return siteCta;
    }
    return walkupFallback(DETAIL_CTA_TYPES.directions);
  }

  // 8. Shopping / retail.
  if (isShopping(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, actionSource: "deal", mapsUrl };
    }
    return walkupFallback(DETAIL_CTA_TYPES.directions);
  }

  // 8b. Paid state/national/county parks, botanical gardens, seasonal farms,
  // escape rooms, or admission venues whose primary identity resolved outside attraction/tour.
  if (openState !== false && !verifiedFree) {
    const officialTicket = firstPartyTicketAction({ detail, editorial, websiteHref: cleanWebsite, curatedNotes, mapsUrl, fpaTicket, fpaAdmission });
    if (officialTicket) return officialTicket;
  }

  // 9. Unsupported / free public place → Directions when open, Add to my trip when closed (never null CTA).
  return walkupFallback(DETAIL_CTA_TYPES.directions);
}

/**
 * "Go now / wait" verdict using live hours and weather/conditions.
 *
 * Hours-honesty rule (lib/businessStatus.js): "Go now" asserts the place is
 * open. When openState is unknown (null/undefined, e.g. Place Details quota
 * exhausted) the verdict never claims openness: weather-only wording is kept,
 * and with nothing truthful to say the result is null (caller hides the pill).
 *
 * @returns {{text:string,tone:"go"|"wait"}|null}
 */
export function detailVerdict({ detail, weather, openState, business = null, hasIndoorBackup = false }) {
  const next = business && business.nextTransition ? business.nextTransition : null;
  if (openState === false) {
    if (next && next.type === "open" && next.label) {
      const cleanOpen = String(next.label).replace(/^Opens\s+/i, "").trim();
      const phrase = next.today ? `opens at ${cleanOpen}` : `opens ${cleanOpen}`;
      return { text: `Wait — closed now · ${phrase}`, tone: "wait" };
    }
    return { text: "Wait — closed now", tone: "wait" };
  }

  const hoursKnown = openState === true;
  const regime = Ranking.weatherRegime(weather);
  const { lean, water } = Ranking.venueLean(detail);

  if (regime === "wet") {
    if (lean === "indoor") return { text: hoursKnown ? "Go now · indoor rain-safe pick" : "Good indoor weather", tone: "go" };
    return { text: hasIndoorBackup ? "Rainy now · indoor backup available" : "Wait — rain now", tone: "wait" };
  }
  if (regime === "showery" && lean === "outdoor" && !water) {
    return { text: hasIndoorBackup ? "Showers likely · indoor backup nearby" : "Wait — showers likely", tone: "wait" };
  }
  if (regime === "hot" && lean === "outdoor" && !water) {
    return { text: business ? "Very hot now · better after 5 PM" : "Wait — very hot", tone: "wait" };
  }
  if (regime === "cold" && water) {
    return { text: "Wait — cold for water", tone: "wait" };
  }

  if (hoursKnown) {
    if (next && next.type === "close" && next.label) {
      const closeAt = String(next.label).replace(/^Closes\s+/i, "").trim();
      if (next.soon && Number.isFinite(next.inMinutes) && next.inMinutes <= 45) {
        return { text: `Closing soon · closes at ${closeAt}`, tone: "wait" };
      }
      return { text: `Go now · open until ${closeAt}`, tone: "go" };
    }
    return { text: "Go now", tone: "go" };
  }
  return null;
}
