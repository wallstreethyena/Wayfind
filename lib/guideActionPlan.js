// The guide action takes a reader to an exact existing destination, or to the
// part of this guide that lets them make a real choice. No searches dressed
// as tickets, generic offers, artificial urgency or hidden/expired inventory.
import { isSearchAsBookHref } from "./viatorDenylist.js";
import { guideWhereForRecord, guideMapsUrl, isFullStreetAddress } from "./guidePlaceAddress.js";
import { guidePlacePath } from "./guideHandoff.js";
import { isGuidePast, isGuideWithheld } from "./guideLifecycle.js";
import { siteTodayStr } from "./siteTime.js";

export const GUIDE_ACTION_PICK_ANCHOR = "#guide-plan-options";
const CURATED_PLAN_LABEL = Object.freeze({
  "swim-with-manatees-crystal-river": "Compare manatee trips",
  "bioluminescence-kayak-tour-space-coast": "Compare glow tours",
  "florida-scalloping-crystal-river-homosassa": "Compare scalloping trips",
  "weeki-wachee-kayak-mermaids-guide": "Plan a Weeki Wachee visit",
  "winter-park-scenic-boat-tour": "See boat tour times and tickets",
  "siesta-key-drum-circle": "Find the drum circle",
  "pinecraft-sarasota-amish-village": "Compare Pinecraft stops",
  "siesta-key-vs-lido-key": "Compare the two beaches",
  "things-to-do-sarasota": "Choose a Sarasota outing",
  "best-cuban-sandwich-tampa": "Compare Cuban sandwich stops",
  "st-armands-circle-restaurants": "Choose a St. Armands restaurant",
  "best-restaurants-disney-springs": "Choose a Disney Springs restaurant",
  "best-hotels-near-magic-kingdom": "Compare Magic Kingdom hotels",
  "gatorland-vs-wild-florida": "Compare the two gator parks",
  "things-to-do-orlando-not-theme-parks": "Choose an Orlando outing",
  "sarasota-half-price-dining": "Compare Sarasota dining deals",
  "orlando-in-the-rain": "Choose an indoor Orlando outing",
  "birthday-freebies-bradenton-sarasota": "See how to claim birthday offers",
  "anna-maria-island-day-trip": "Plan the Anna Maria day trip",
  "myakka-river-state-park-guide": "Plan a Myakka River visit",
  "ybor-city-tampa-guide": "Choose an Ybor City stop",
  "tampa-riverwalk-guide": "Plan your Tampa Riverwalk route",
  "de-soto-national-memorial-bradenton": "Plan a De Soto visit",
  "robinson-preserve-bradenton": "Plan a Robinson Preserve visit",
  "sarasota-restaurants": "Choose a Sarasota restaurant",
  "tampa-restaurants": "Choose a Tampa restaurant",
  "st-pete-restaurants": "Choose a St. Pete restaurant",
  "orlando-restaurants": "Choose an Orlando restaurant",
  "miami-restaurants": "Choose a Miami restaurant",
  "florida-lovebug-season": "See what to do about lovebugs",
  "tampa-bay-this-week-nov-22-2026": "Compare Tampa Bay events",
  "sarasota-this-week-nov-23-2026": "Compare Sarasota events",
  "river-of-lights-tampa-2026": "Plan a River of Lights visit",
  "restaurants-open-thanksgiving-tampa-bay-2026": "Compare Thanksgiving tables",
  "plant-city-christmas-2026": "See Plant City Christmas hours",
  "tampa-bay-rainy-day": "Choose an indoor Tampa Bay outing",
  "sarasota-rainy-day": "Choose an indoor Sarasota outing",
  "things-to-do-in-parrish-florida": "Choose a Parrish outing",
  "things-to-do-in-sarasota-florida": "Choose a Sarasota outing",
  "things-to-do-in-tampa-florida": "Choose a Tampa outing",
  "gulf-coast-brunch-and-date-night": "Choose a brunch or dinner spot",
  "florida-winter-beaches-2026": "Compare Florida winter beaches",
  "florida-theme-park-christmas-2026": "Compare theme park holiday plans",
  "florida-holiday-nights-out-2026": "Choose a Florida holiday night out",
  "florida-manatee-season-2026": "Compare manatee viewing spots",
  "florida-christmas-boat-parades-2026": "Compare boat parade dates",
  "florida-thanksgiving-weekend-2026": "Compare Thanksgiving weekend plans",
  "florida-christmas-markets-and-towns-2026": "Compare markets and holiday towns",
  "florida-nutcracker-and-holiday-shows-2026": "Compare holiday show dates",
  "florida-snow-and-ice-2026": "Compare snow and ice outings",
  "florida-santa-and-christmas-trains-2026": "Compare Santa trains and visits",
  "free-christmas-lights-florida-2026": "Choose a free light display",
  "florida-new-years-eve-2026": "Compare fireworks and countdowns",
  "fall-events-orlando-2026": "Compare remaining Orlando fall events",
  "seaworld-orlando-christmas-celebration-2026": "Plan a SeaWorld Christmas visit",
  "things-to-do-in-bradenton-florida": "Choose a Bradenton outing",
  "things-to-do-in-miami-florida": "Choose a Miami outing",
  "things-to-do-in-ellenton-florida": "Choose an Ellenton outing",
  "things-to-do-in-palmetto-florida": "Choose a Palmetto outing",
  "things-to-do-in-lakewood-ranch-florida": "Choose a Lakewood Ranch outing",
  "things-to-do-in-cortez-florida": "Choose a Cortez waterfront stop",
  "things-to-do-in-longboat-key-florida": "Choose a Longboat Key outing",
  "things-to-do-in-venice-florida": "Choose a Venice outing",
  "orlando-christmas-concerts-and-santa-2026": "Compare concerts and Santa visits",
  "jacksonville-christmas-by-area-budget-2026": "Compare Jacksonville holiday plans",
  "st-augustine-christmas-coffee-snow-walk-2026": "Plan your St. Augustine holiday walk",
});

// Only these promotion targets are the named guide topic. Other real
// affiliate products in broad roundups retain their existing body position.
const SINGLE_TOPIC_DEAL = Object.freeze({
  "bioluminescence-kayak-tour-space-coast": { place: "Merritt Island", destination: /^A clear-kayak bioluminescence tour$/i },
  "myakka-river-state-park-guide": { place: "Myakka River State Park", destination: /myakka|canopy walkway/i },
  "robinson-preserve-bradenton": { place: "Robinson Preserve", destination: /robinson|observation tower|kayak trails/i },
  "seaworld-orlando-christmas-celebration-2026": { event: "seaworld-orlando-christmas-2026", offerThrough: "2027-01-04", destination: /main entrance|seaworld|christmas celebration|admission/i },
});

const DIRECT_DESTINATION = Object.freeze({
  "siesta-key-drum-circle": { target: /when and exactly where/i, name: "Siesta Beach", label: "Directions to the drum circle" },
  "winter-park-scenic-boat-tour": { target: /tickets and the cash catch|what the hour/i, name: "Winter Park Scenic Boat Tour", label: "Directions to the boat tour" },
  "de-soto-national-memorial-bradenton": { target: /mangrove shoreline|camp uzita/i, name: "De Soto National Memorial", label: "Directions to De Soto National Memorial" },
  "river-of-lights-tampa-2026": { target: /river of lights|winter village/i, name: "Winter Village at Curtis Hixon Waterfront Park", label: "Directions to the River of Lights" },
});

export function guideConversionIsCurrent(slug, guide, today) {
  return !!guide && !isGuidePast(guide, today) && !isGuideWithheld(slug, guide);
}

// Calendar end of a specific event offer can precede the editorial lifecycle.
export function guideEventOfferEnded(slug, event, today = siteTodayStr()) {
  const deal = SINGLE_TOPIC_DEAL[slug];
  return !!deal?.offerThrough && deal.event === event && today > deal.offerThrough;
}

export function guideDayAction({ slug, guide, shippingPicks = [], primary, noSale = null, today } = {}) {
  if (!guideConversionIsCurrent(slug, guide, today)) return null;
  if (guide.fieldArticle && guide.officialAction) {
    return { ...guide.officialAction, kind: "official", exact: true };
  }
  const covered = shippingPicks.map((row) => row?.pick || row).filter(Boolean);
  const goal = DIRECT_DESTINATION[slug];
  const exactEarning = primary?.exact === true && primary.monetized === true && primary.sponsored === true &&
    /^(deal|tour|hotel)$/.test(primary.kind) && typeof primary.label === "string" && !!primary.label.trim() &&
    typeof primary.href === "string" && /^\/api\/(commerce|viator|hotels)\/go(?:\?|$)/.test(primary.href) &&
    !isSearchAsBookHref(primary.href);
  const deal = SINGLE_TOPIC_DEAL[slug];
  const isNamedOffer = !!deal && (deal.event
    ? guide.eventTicket === deal.event && primary?.provider === "undercover_tourist"
    : primary?.place === deal.place && (guide.parkTicketPlace === deal.place || guide.partnerTour?.place === deal.place));
  if (isNamedOffer && !guideEventOfferEnded(slug, guide.eventTicket, today) && !noSale && exactEarning && covered.some((pick) => deal.destination.test(pick.name || ""))) {
    // Exact operator listing for 123164P2 says Haulover Canal, Mims (the
    // refuge is broader than the meeting locality); do not sell it as a
    // generic Merritt Island departure. Keep its approved tracked product.
    const label = slug === "seaworld-orlando-christmas-celebration-2026" ? "SeaWorld park admission"
      : slug === "bioluminescence-kayak-tour-space-coast" ? "Book the Haulover Canal glow tour" : primary.label;
    return { ...primary, label, promoted: true, placement: "hero" };
  }
  if (goal) {
    for (const p of covered) {
      if (!goal.target.test(p.name || "")) continue;
      const where = guideWhereForRecord(p, { slug });
      if (where?.mapsUrl && isFullStreetAddress(where.address)) {
        return { href: guideMapsUrl({ name: goal.name, address: where.address, placeId: where.placeId }), kind: "directions", label: goal.label, exact: true };
      }
      const placeHref = guidePlacePath(p.placeId);
      if (placeHref) return { href: placeHref, kind: "place", label: "See location and visiting details", exact: true };
    }
  }
  if (slug === "florida-new-years-eve-2026" && !covered.length) {
    return { href: "/new-years-in-florida", kind: "plan", label: "Find Florida New Year’s Eve plans" };
  }
  // Same-page target is explicitly rendered before the shipped picks, after
  // the top promotional lane; no chance of an anchor into a withheld row.
  return { href: covered.length ? GUIDE_ACTION_PICK_ANCHOR : "#guide", kind: "plan",
    label: CURATED_PLAN_LABEL[slug] || "See the places and planning details" };
}

export function dedicatedGuideAction(slug, today) {
  if (slug === "disney-world-holiday-food-guide-2026" && today <= "2027-01-31") {
    return { href: "#disney-food-map", kind: "map", label: "Find Disney holiday food on the map" };
  }
  if (slug === "universal-orlando-christmas-2026" && today <= "2027-01-03") {
    return { href: "#explore-the-park", kind: "map", label: "Open the Universal holiday map" };
  }
  if (slug === "florida-fall-festivals-2026") {
    return { href: "/florida-events", kind: "plan", label: "See current Florida events" };
  }
  return null;
}

/** Editorial selections join by exact pick name; published visible indexes,
 * not source positions, own every anchor after photo holds. */
export function visibleQuickChoices(choices, shippingPicks) {
  const visible = new Map(shippingPicks.map(({ pick }, index) => [pick.name, index + 1]));
  return choices.flatMap((choice) => {
    const index = visible.get(choice.pickName);
    return index ? [{ ...choice, href: "#pick-" + index }] : [];
  });
}

// The old footer sent a name-plus-city query for multi-branch restaurants.
// Bind it to the exact shipped guide pick's reviewed map or hide it.
const placeNameKey = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
export function scopedGuideBodyCta(primary, shippingPicks, slug) {
  if (primary?.kind !== "directions") return primary;
  const place = placeNameKey(primary.place);
  if (!place) return null;
  const pick = shippingPicks.map((row) => row?.pick || row).find((p) => placeNameKey(p?.name) === place);
  const where = pick && guideWhereForRecord(pick, { slug });
  return where?.mapsUrl ? { ...primary, href: where.mapsUrl } : null;
}
