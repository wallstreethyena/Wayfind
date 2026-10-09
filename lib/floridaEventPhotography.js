import { FLORIDA_EVENT_PHOTOS, FLORIDA_PARK_PHOTOS } from "./floridaPhotography.js";
import { MENU_PARTNER_OFFERS } from "./menuPartnerOffers.js";
import { guideHero } from "./guideHero.js";
import { landingOfferImage } from "./paidFloridaLanding.js";

// An event with no reviewed photograph must never inherit another venue.
// These are the existing partner photographs of the event's own venue.
// Zoo Miami and Gatorland crops visually rechecked on 2026-10-09.
const VENUE_PHOTOS = Object.freeze({
  "zoo-boo-zoo-miami-2026": { offerId: "miami-hook-zoo-miami", city: "Miami", alt: "Two hippos in the water at Zoo Miami" },
  "gatorland-ghosts-goblins-2026": { offerId: "orlando-hook-gatorland", city: "Orlando", alt: "An alligator beside the water at Gatorland" },
  "howl-o-scream-tampa-2026": { offerId: "tampa-hook-busch-gardens", city: "Tampa", alt: "Riders on a roller coaster at Busch Gardens Tampa Bay" },
});

export function floridaEventPhoto(event) {
  const id = String(event?.event_id || "").replace(/^wfc:/, "");
  if (!id) return null;
  const specific = Object.hasOwn(FLORIDA_EVENT_PHOTOS, id) ? FLORIDA_EVENT_PHOTOS[id] : null;
  if (specific?.src) return specific;
  const context = Object.hasOwn(VENUE_PHOTOS, id) ? VENUE_PHOTOS[id] : null;
  if (!context || String(event.city || "").trim().toLowerCase() !== context.city.toLowerCase()) return null;
  const offer = MENU_PARTNER_OFFERS.find((item) => item.offerId === context.offerId && item.market === context.city);
  if (!offer?.image) return null;
  return {
    ...(FLORIDA_PARK_PHOTOS[offer.offerId] || {}),
    src: FLORIDA_PARK_PHOTOS[offer.offerId]?.src || landingOfferImage(offer.image),
    width: 960,
    height: 600,
    alt: context.alt,
    caption: `${offer.title} · Venue photo. Seasonal event not pictured.`,
    credit: `Photo via ${offer.provider === "tiqets" ? "Tiqets" : offer.provider}`,
  };
}

// Search cards describe a category, not a booked operator. Use only reviewed
// local subjects and say which operator is pictured. No category-wide stock.
const SEARCH_PHOTOS = Object.freeze({
  "orlando-airboat": { city: "Orlando", offerId: "orlando-hook-boggy-creek", alt: "An airboat on the water at sunset at Boggy Creek in Kissimmee", caption: "Boggy Creek, Kissimmee. Operator shown; compare Orlando area tours." },
  "clearwater-dolphin-cruise": { city: "Clearwater", offerId: "clearwater-hook-dolphin-cruise", alt: "The Tropics Boat Tours vessel in Clearwater", caption: "Clearwater Dolphin Exploration Cruise. Operator shown; compare local tours." },
});
export function floridaSearchPhoto(item) {
  if (item?.id === "manatee-crystal-river" && item.city === "Crystal River") return guideHero("swim-with-manatees-crystal-river");
  const context = Object.hasOwn(SEARCH_PHOTOS, item?.id || "") ? SEARCH_PHOTOS[item.id] : null;
  if (!context || context.city !== item.city) return null;
  const offer = MENU_PARTNER_OFFERS.find((row) => row.offerId === context.offerId);
  if (!offer?.image) return null;
  return { src: landingOfferImage(offer.image), width: 960, height: 600, alt: context.alt, caption: context.caption, credit: "Photo via Tiqets" };
}
