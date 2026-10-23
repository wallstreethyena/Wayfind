// Owner's 50 Florida fall photo destinations, reviewed October 20, 2026.
// Rank records editorial priority, never measured virality or a Wayfind Score.
// A destination needs a real owned venue/photo or an already trusted event.
import { FALL_PHOTO_DESTINATIONS_LOWER_2026 } from "./fallPhotoDestinationsLower2026.js";

const top = (rank, name, eventIds, placeIds, venueNames, cityNames, shotLocation, visualProof, sourceUrl, endsOn, accessNote, extra = {}) => ({
  rank, name, eventIds, placeIds, venueNames, cityNames, shotLocation, visualProof,
  fallReason: "A seasonal pumpkin display, flower field or Halloween setting gives this photo its fall identity.",
  bestTime: "Daylight on an open date",
  accessNote, sourceUrl, endsOn, reviewThrough: "2026-11-03", ...extra,
});

export const FALL_PHOTO_DESTINATIONS_2026 = Object.freeze([
  top(1, "Magic Kingdom", ["mnsshp-2026", "mickeys-not-so-scary-halloween-party-2026"], ["ChIJgUulalN-3YgRGoTaWM2LawY"], ["Magic Kingdom Park", "Magic Kingdom"], ["Lake Buena Vista", "Bay Lake"],
    "Main Street and Town Square with the castle behind the seasonal décor",
    "Frame the Main Street Halloween decorations with Cinderella Castle in the distance.",
    "https://www.visitorlando.com/blog/post/best-places-to-trickortreat-in-orlando/", "2026-10-31",
    "Park admission is required. Party nights require their own ticket; check the park calendar.", { bestTime: "Daylight or a ticketed party night" }),
  top(2, "Southern Hill Farms", ["southern-hill-farms-fall-festival-2026"], ["ChIJ-aI9NvSI54gRrVByB84z-AY"], ["Southern Hill Farms"], ["Clermont"],
    "Pumpkin barn and designated photo areas, then the flower-field paths",
    "Pumpkins and rustic barn scenes pair with sunflower and zinnia portraits when blooms are available.",
    "https://southernhillfarms.com/fall-festival/", "2026-11-22",
    "Buy admission online for a scheduled festival date. Flower conditions vary; follow the farm's photography rules."),
  top(3, "Gallagher's Pumpkin Patch", ["gallaghers-pumpkins-2026"], ["ChIJO4wiQV3hwogRNncNJo43D5U"], ["Gallagher's Pumpkins & Christmas Trees", "Gallagher's Pumpkin & Christmas Tree's patch"], ["St. Petersburg", "Saint Petersburg"],
    "The vintage red truck beside the seasonal pumpkin displays",
    "A vintage red truck and pumpkin displays create a distinctive St. Petersburg fall portrait.",
    "https://www.gallagherspumpkinsandchristmastrees.com/", null,
    "Check current pumpkin-season hours. Casual photos and arranged professional sessions have different rules."),
  top(4, "Amber Brooke Farms", ["amber-brooke-fall-festival-2026", "fall-festival-at-amber-brooke-farms-2026"], ["ChIJkyg5UW6654gRECAKyCherD8"], ["Amber Brooke Farms", "Amber Brooke Farms Eustis"], ["Eustis"],
    "Pumpkin Barn and designated photo stations at the Eustis farm",
    "Use the Pumpkin Barn for a fall portrait, then sunflower or zinnia fields when available.",
    "https://amberbrookefarms.com/central-florida-fall-festival/", "2026-11-22",
    "Choose a published festival date and timed arrival. Blooms and access depend on farm conditions."),
  top(5, "The Berry Farm", ["the-berry-farm-harvest-festival-2026"], [], ["The Berry Farm"], ["Miami", "Homestead"],
    "Pumpkin patch, corn-maze paths and sunflower-field paths",
    "Pumpkins, a five-acre corn maze and sunflower fields combine for a sunny South Florida fall carousel.",
    "https://www.visittheberryfarm.com/pages/fall-season", "2026-11-15",
    "Harvest Festival admission applies. Check flower conditions and date-specific hours before planning sunset photos."),
  top(6, "Universal Studios Florida Halloween Horror Nights", ["hhn-orlando-2026", "halloween-horror-nights-orlando-2026"], ["ChIJdd8VlMN-54gRoaU0d_zYhfk", "ChIJvRBCrN9-54gRGZuuaCLGrQE"], ["Universal Studios Florida"], ["Orlando"],
    "Outdoor scare-zone streets during Halloween Horror Nights",
    "Themed street scenery and theatrical lighting suit dramatic Halloween portraits and short videos.",
    "https://www.universalorlando.com/hhn/en/us/things-to-do", "2026-11-01",
    "Separately ticketed event on selected nights. Follow current filming rules and avoid planning photos inside houses.", { bestTime: "After dark on a scheduled event night." }),
  top(7, "St. Pete Pier Pumpkin Patch", ["st-pete-pier-pumpkin-patch-2026"], ["ChIJX-E766nhwogR8u_Re6nJTyk"], ["St. Pete Pier", "St Pete Pier"], ["St. Petersburg", "Saint Petersburg"],
    "Seasonal pumpkin displays with the Pier waterfront in a wider frame",
    "Combine the pumpkin patch with waterfront surroundings for a coastal Florida fall photo.",
    "https://www.visitstpeteclearwater.com/event/pumpkin-patch-st-pete-pier/47846", "2026-10-25",
    "Patch entry is free; pumpkins cost extra. Use the current organizer's location and patch hours."),
  top(8, "Tinez Farms", [], [], ["Tinez Farms"], ["Miami", "Homestead"],
    "Designated fall photo installations and pumpkin areas",
    "Seasonal photo setups and pumpkins anchor a farm portrait with barnyard scenes for variety.",
    "https://www.tinezfarms.com/", null,
    "Book a current Fall at the Farm date. Special Fall Photo Experience sessions may have separate admission."),
  top(9, "Pinto's Farm", ["pintos-fall-at-the-farm-2026"], ["ChIJUczTK5XC2YgRRt4Jp6N3B70"], ["Pinto's Farm", "Pinto Farm"], ["Miami", "Homestead"],
    "Fall photo spots and pumpkin-patch walk-through",
    "Pumpkin scenes and dedicated photo sets pair with the farm's tractor and paddleboat settings.",
    "https://pintosfarm.ticketspice.com/pintos-farm-2026", "2026-11-08",
    "Admission is required for ages two and up. Visit on published Thursday through Sunday dates."),
  top(10, "Hunsader Farms Pumpkin Festival", ["hunsader-pumpkin-2026", "hunsader-farms-pumpkin-festival-2026"], ["ChIJuSnFvF8xw4gRt0WOWL_cqRc"], ["Hunsader Farms"], ["Bradenton"],
    "Pumpkin displays and rustic festival grounds",
    "Use pumpkins and farm scenery for a traditional harvest portrait, with festival details as supporting frames.",
    "https://www.hunsaderfarms.com/pumpkin-festival", "2026-10-25",
    "Remaining 2026 festival dates are October 24 and 25. Festival admission and parking rules apply."),
  top(11, "Bedner's Farm", ["bedners-fall-festival-2026"], [], ["Bedner's Farm Fresh Market", "Bedner's Farm"], ["Boynton Beach"],
    "Pumpkin and gourd displays, with flower fields only when open",
    "Pumpkins and farm greenery make a warm-weather fall setting. Sunflower access depends on growing conditions.",
    "https://bedners.com/fall-festival/", "2026-11-01",
    "Use the Boynton Beach farm location. Check the current festival ticket and field availability."),
  top(12, "Fruitville Grove Pumpkin Festival", ["fruitville-grove-pumpkin-2026", "fruitville-grove-pumpkin-festival-2026"], ["ChIJhWqZvoVHw4gRehUSFsbZARo"], ["Fruitville Grove", "Fruitville Grove Farm"], ["Sarasota"],
    "Pumpkins, gourds, cornstalks and hay-bale displays",
    "Layer heirloom pumpkins, cornstalks and hay bales into a Sarasota fall portrait.",
    "https://fruitvillegrovefarm.com/festival/", "2026-11-01",
    "Festival dates are weekends through November 1. Admission applies and some activities cost extra."),
  top(13, "Fat Beet Farm Pumpkin Parlour", [], [], ["Fat Beet Farm", "Fat Beet Farm Kitchen and Bakery"], ["Tampa", "Oldsmar"],
    "The Porchkins Pumpkin Parlour display at Fat Beet Farm",
    "Styled pumpkin groupings give this fall stop a décor-focused portrait setting.",
    "https://porchkinstampabay.com/pages/parlour-2026", null,
    "Check current Pumpkin Parlour hours and stock. Farm tours require advance booking."),
  top(14, "Kerby's Nursery", [], [], ["Kerby's Nursery", "Kerby's Nursery & Landscaping"], ["Seffner"],
    "Seasonal pumpkin display at the nursery",
    "Pumpkin varieties and nursery greenery can frame a compact fall portrait stop.",
    "https://www.kerbysnursery.com/", null,
    "Confirm the current pumpkin display before visiting.", { holdReason: "The September kickoff is past; the current pumpkin-wall installation still needs primary-source confirmation." }),
  top(15, "Great Scott Farms", ["great-scott-fall-fest-2026"], ["ChIJ68SLYriZ54gRaJgw169KqYA"], ["Great Scott Farms", "Long & Scott Farms"], ["Mount Dora"],
    "Giant-chair photo spot, vintage farm vehicles and pumpkin patch",
    "The oversized chair creates a playful fall portrait alongside pumpkins, vintage trucks and corn-maze paths.",
    "https://www.visitgreatscott.com/fall-festival", "2026-11-15",
    "Festival admission applies on Saturdays and Sundays. Check the organizer for current attraction access."),
  ...FALL_PHOTO_DESTINATIONS_LOWER_2026,
]);

const norm = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

export function fallPhotoDestinationActive(spot, today) {
  return !!spot && !spot.holdReason && /^2026-\d{2}-\d{2}$/.test(String(today))
    && today >= "2026-08-01" && today <= "2026-11-26"
    && (!spot.startsOn || spot.startsOn <= today)
    && (!spot.endsOn || today <= spot.endsOn)
    && (spot.endsOn || !spot.reviewThrough || today <= spot.reviewThrough);
}

// Exact identifiers only for event projection. Name matching is confined to
// owned inventory and requires a listed city, unique venue and Florida point.
export function fallPhotoEvidence(item, today) {
  if (item?.fallPhotoBlocked) return null;
  const id = item?.event_id || item?.discoveryId || item?.id;
  const placeId = item?.place_id || (item?.kind === "place" ? item?.id : null);
  const isEvent = item?.kind === "event" || !!item?.event_id;
  const spot = FALL_PHOTO_DESTINATIONS_2026.find((entry) =>
    (entry.eventIds || []).includes(id) || (!isEvent && ((entry.placeIds || []).includes(placeId)
      || item?.fallPhotoDestinationRank === entry.rank)));
  return fallPhotoDestinationActive(spot, today) ? spot : null;
}

export function fallPhotoVenueNames(today) {
  return [...new Set(FALL_PHOTO_DESTINATIONS_2026.filter((s) => fallPhotoDestinationActive(s, today)).flatMap((s) => s.venueNames || []))];
}

export function fallPhotoKnownPlaceIds(today) {
  return [...new Set(FALL_PHOTO_DESTINATIONS_2026.filter((s) => fallPhotoDestinationActive(s, today)).flatMap((s) => s.placeIds || []))];
}

export function blockCalendarControlledPhotoPlaces(places, eventRows) {
  const eventIds = new Set((eventRows || []).map((row) => row.event_id || row.id).filter(Boolean));
  const controlled = FALL_PHOTO_DESTINATIONS_2026.filter((spot) =>
    (spot.eventIds || []).some((id) => eventIds.has(id)));
  return (places || []).map((place) => controlled.some((spot) =>
    spot.rank === place.fallPhotoDestinationRank || (spot.placeIds || []).includes(place.place_id || place.id))
    ? { ...place, fallPhotoBlocked: true } : place);
}

export function blockUnavailablePhotoEvents(events, calendars, today, calendarFailed = false) {
  const byId = new Map((calendars || []).map((row) => [row.event_id, row]));
  const known = new Set(FALL_PHOTO_DESTINATIONS_2026.flatMap((spot) => spot.eventIds || []));
  return (events || []).map((event) => {
    const id = event.event_id || event.id;
    const source = byId.get(id);
    const terminal = source && !["scheduled", "sold_out"].includes(source.event_status);
    const expired = source?.end_date && source.end_date < today;
    const exhausted = source?.occurrence_dates?.length > 0
      && !source.occurrence_dates.some((day) => day >= today && (!source.end_date || day <= source.end_date));
    return known.has(id) && (calendarFailed || terminal || expired || exhausted)
      ? { ...event, fallPhotoBlocked: true } : event;
  });
}

export function matchFallPhotoInventory(spot, rows, today) {
  if (!fallPhotoDestinationActive(spot, today)) return null;
  const unique = [...new Map((rows || []).filter((r) => r?.place_id).map((r) => [r.place_id, r])).values()];
  const hits = unique.filter((row) => row.excluded !== true && (!row.status || row.status === "OPERATIONAL")
    && Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.lat >= 24.3 && row.lat <= 31.1 && row.lng >= -87.7 && row.lng <= -79.8
    && ((spot.placeIds || []).includes(row.place_id)
      || ((spot.venueNames || []).some((name) => norm(name) === norm(row.name))
        && (spot.cityNames || []).some((city) => norm(city) === norm(row.locality || row.city || row.metro)))));
  return hits.length === 1 ? hits[0] : null;
}
