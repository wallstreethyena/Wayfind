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

import * as Aff from "./affiliates.js";
import { bookingTargets, placeEvidence } from "./bookingResolve.js";
import { bookItTarget } from "./monetize.js";
import { isTpProgramLive, tpDeepLink, TP_PROGRAMS } from "./travelpayouts.js";
import { couponForPlaceName, couponIsLive } from "./coupons.js";
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

export const DETAIL_CTA_TYPES = Object.freeze({
  tickets: "tickets",
  deal: "deal",
  reserve: "reserve",
  menu: "menu",
  conditions: "conditions",
  ride: "ride",
  rates: "rates",
  plan: "plan",
  directions: "directions",
});

export function detailCtaLabel(type) {
  switch (type) {
    case DETAIL_CTA_TYPES.tickets: return "Book tickets";
    case DETAIL_CTA_TYPES.deal: return "Claim deal";
    case DETAIL_CTA_TYPES.reserve: return "Reserve";
    case DETAIL_CTA_TYPES.menu: return "See menu";
    case DETAIL_CTA_TYPES.conditions: return "Check conditions";
    case DETAIL_CTA_TYPES.ride: return "Get a ride";
    case DETAIL_CTA_TYPES.rates: return "Check rates";
    case DETAIL_CTA_TYPES.plan: return "Add to my trip"; // v7.08 (owner, discovery-first strategy): "my trip" reads as a possession being built, not an app chore
    case DETAIL_CTA_TYPES.directions: return "Directions";
    default: return "Directions";
  }
}

function _types(place) {
  return ((place && place.types) || []).map((t) => String(t).toLowerCase());
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
  return /lodging|hotel|motel|resort_hotel|bed_and_breakfast|guest_house/.test(_typeText(place));
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
  const cpn = couponForPlaceName(place.name, todayIso);
  if (cpn && cpn.url && couponIsLive(cpn, todayIso)) {
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
  return targets.verifiedUrl || null;
}

function travelpayoutsHrefFor(place, locName) {
  const live = Object.keys(TP_PROGRAMS).filter(isTpProgramLive);
  const target = bookItTarget(place, { available: live, city: cityPart(locName) });
  if (!target) return null;
  return tpDeepLink(target.provider, target.url, place.id) || null;
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
 * @returns {{type:string,label:string,href:string|null,monetized:boolean,provider:string|null,offerId:string|null,mapsUrl:string|null}}
 */
export function resolveDetailCta({ detail, kind, viaTours, locName, offers, openState }) {
  if (!detail) {
    return { type: DETAIL_CTA_TYPES.directions, label: detailCtaLabel(DETAIL_CTA_TYPES.directions), href: null, monetized: false, provider: null, offerId: null, mapsUrl: null };
  }

  const mapsUrl = directionsUrl(detail);
  const todayIso = siteTodayStr();

  // 1. EXACT VERIFIED PRODUCT. Same registry the place card reads, so the two
  // surfaces cannot disagree about whether this place is bookable.
  //
  // This outranks the closed-hours gate. A founder-verified tour (kayak,
  // ferry, admission) is not "false booking" of the venue's own ticket
  // window — Google "closed now" on Shell Key Preserve is why the nearby
  // ferry stole the only earning CTA after hours (Trust 2026-08-25).
  const exactPartner = placePartnerPick(detail);
  if (exactPartner) {
    const exactHref = commerceHref({ provider: exactPartner.provider, offerId: exactPartner.offerId, surface: "detail_primary", contentId: detail.id });
    if (exactHref) {
      return {
        type: DETAIL_CTA_TYPES.tickets,
        // `exact` tells the sheet to link THIS product rather than hand the
        // place back to <BookingCTA>, which re-resolves from scratch and would
        // throw the verified match away.
        exact: true,
        label: "Tickets \u00b7 " + exactPartner.merchant,
        href: exactHref,
        monetized: true,
        provider: exactPartner.provider,
        offerId: exactPartner.offerId,
        merchant: exactPartner.merchant,
        mapsUrl,
      };
    }
  }

  // 2. Closed, and no founder pin → never a false booking.
  if (openState === false) {
    return { type: DETAIL_CTA_TYPES.plan, label: detailCtaLabel(DETAIL_CTA_TYPES.plan), href: null, monetized: false, provider: null, offerId: null, mapsUrl };
  }

  const deal = liveDealFor(detail, offers, todayIso);

  // 2. Attraction / tour / experience / museum / theme park → tickets.
  if (isAttractionTourExperience(detail)) {
    const href = bookingHrefFor(detail, kind, viaTours, locName) || travelpayoutsHrefFor(detail, locName);
    if (href) {
      return { type: DETAIL_CTA_TYPES.tickets, label: detailCtaLabel(DETAIL_CTA_TYPES.tickets), href, monetized: true, provider: "booking", offerId: null, mapsUrl };
    }
    return { type: DETAIL_CTA_TYPES.directions, label: detailCtaLabel(DETAIL_CTA_TYPES.directions), href: mapsUrl, monetized: false, provider: null, offerId: null, mapsUrl };
  }

  // 3. Hotel / lodging → rates.
  if (isHotel(detail)) {
    const href = bookingHrefFor(detail, kind, viaTours, locName);
    if (href) {
      return { type: DETAIL_CTA_TYPES.rates, label: detailCtaLabel(DETAIL_CTA_TYPES.rates), href, monetized: true, provider: "stay22", offerId: null, mapsUrl };
    }
    return { type: DETAIL_CTA_TYPES.directions, label: detailCtaLabel(DETAIL_CTA_TYPES.directions), href: mapsUrl, monetized: false, provider: null, offerId: null, mapsUrl };
  }

  // 4. Restaurant.
  if (isRestaurant(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, mapsUrl };
    }
    // Reservation partner: dark today; no signal exists in the codebase.
    // When OpenTable/Resy or a reservation affiliate lands, add the reservable
    // probe here and return DETAIL_CTA_TYPES.reserve.
    //
    // 2026-08-26 — the delivery rung is GONE with Uber Eats (owner directive;
    // see lib/affiliates.js REMOVED note). The rung's whole value was a
    // tracked handoff; untracked it was a free-traffic leak. Restaurants fall
    // to the honest Maps "See menu" CTA.
    return { type: DETAIL_CTA_TYPES.menu, label: detailCtaLabel(DETAIL_CTA_TYPES.menu), href: mapsUrl, monetized: false, provider: null, offerId: null, mapsUrl };
  }

  // 5. Cafe / bakery.
  if (isCafeBakery(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, mapsUrl };
    }
    // 2026-08-26 — pickup rung gone with Uber Eats (same note as restaurants).
    return { type: DETAIL_CTA_TYPES.menu, label: detailCtaLabel(DETAIL_CTA_TYPES.menu), href: mapsUrl, monetized: false, provider: null, offerId: null, mapsUrl };
  }

  // 6. Beach.
  if (isBeach(detail)) {
    return { type: DETAIL_CTA_TYPES.conditions, label: detailCtaLabel(DETAIL_CTA_TYPES.conditions), href: "#beach-conditions", monetized: false, provider: null, offerId: null, mapsUrl };
  }

  // 7. Bar / nightlife.
  if (isBarNightlife(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, mapsUrl };
    }
    // Reservation partner is dark today; rideshare deep-link is not yet wired.
    return { type: DETAIL_CTA_TYPES.directions, label: detailCtaLabel(DETAIL_CTA_TYPES.directions), href: mapsUrl, monetized: false, provider: null, offerId: null, mapsUrl };
  }

  // 8. Shopping / retail.
  if (isShopping(detail)) {
    if (deal) {
      return { type: DETAIL_CTA_TYPES.deal, label: detailCtaLabel(DETAIL_CTA_TYPES.deal), href: deal.href, monetized: deal.monetized, provider: deal.provider, offerId: deal.offerId, mapsUrl };
    }
    return { type: DETAIL_CTA_TYPES.directions, label: detailCtaLabel(DETAIL_CTA_TYPES.directions), href: mapsUrl, monetized: false, provider: null, offerId: null, mapsUrl };
  }

  // 9. Unsupported → Directions (never null CTA).
  return { type: DETAIL_CTA_TYPES.directions, label: detailCtaLabel(DETAIL_CTA_TYPES.directions), href: mapsUrl, monetized: false, provider: null, offerId: null, mapsUrl };
}

/**
 * "Go now / wait" verdict using live hours and weather/conditions.
 *
 * @returns {{text:string,tone:"go"|"wait"}}
 */
export function detailVerdict({ detail, weather, openState }) {
  if (openState === false) return { text: "Wait — closed now", tone: "wait" };

  const regime = Ranking.weatherRegime(weather);
  const { lean, water } = Ranking.venueLean(detail);

  if (regime === "wet") {
    if (lean === "indoor") return { text: "Go now — good indoor weather", tone: "go" };
    return { text: "Wait — rain now", tone: "wait" };
  }
  if (regime === "showery" && lean === "outdoor" && !water) {
    return { text: "Wait — showers likely", tone: "wait" };
  }
  if (regime === "hot" && lean === "outdoor" && !water) {
    return { text: "Wait — very hot", tone: "wait" };
  }
  if (regime === "cold" && water) {
    return { text: "Wait — cold for water", tone: "wait" };
  }

  return { text: "Go now", tone: "go" };
}
