#!/usr/bin/env node
// One brand, one card in a rail. Locks the Parrish Halloween shelf that
// showed both Dracula's Legacy locations side by side, and the cover/gallery
// photo rules that go with a place card.
import { railItemIdentity } from "../lib/eventOccurrenceIdentity.js";
import { mergePagedItems, seedSignature } from "../lib/railPage.js";
import { brandKey, collapseRailBrands, dedupePlaces, normName } from "../lib/placeDedupe.js";
import { composeFallIntentRails } from "../lib/fallIntentRails.js";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { composeChristmasIntentRails } from "../lib/christmasIntentRails.js";
import { christmasBrowsePage, parseChristmasBrowseQuery } from "../lib/christmasBrowse.js";
import { rankRailPlaces } from "../lib/railRank.js";
import { cardImageSrc, ownedSignalPhotos } from "../lib/placePhoto.js";
import { detailPhotoFields } from "../lib/detailPhotoFields.js";
import { detailGalleryPhotos } from "../lib/livePhoto.js";
import { placeDiscoveryRef } from "../lib/discoveryRef.js";
import { mergeHealedPlacePhotos } from "../lib/detailHero.js";
import { invPlaceToLanding } from "../lib/landingInventory.js";
import { shapeNearbyRow } from "../lib/nearbyPool.js";
import { readFileSync } from "node:fs";

let failed = 0;
const ok = (cond, message) => {
  if (!cond) {
    failed++;
    console.error("FAIL: " + message);
  }
};

const TAMPA_ID = "ChIJIZt3d7DFwogRQ5Lg2tPMXyk";
const STPETE_ID = "ChIJw8yuv53hwogRivnj0XblR-k";
const DRACULA_SITE = "https://draculaslegacywinebar.com/";
const NUEVA_SITE = "https://nuevacantina.com/";

ok(normName("Dracula's Legacy Wine Bar & Bistro Tampa") === normName("Dracula's Legacy Wine Bar & Bistro"),
  "trailing Tampa strips so both Dracula inventory names share a normName");
ok(normName("Nueva Cantina – Downtown Tampa") === normName("Nueva Cantina – Palm Harbor"),
  "a dash-separated branch suffix still shares a normName");
ok(normName("Nueva Cantina Downtown Tampa") === normName("Nueva Cantina Palm Harbor"),
  "Downtown Tampa and Palm Harbor strip off the same Nueva Cantina brand");
ok(normName("Sunshine Coffee Bar") !== normName("Sunshine Coffee Roasters"),
  "lookalike coffee names stay distinct");
ok(normName("Round Robin Coffee — Route 301") === normName("Round Robin Coffee — 41 Bypass"),
  "the Round Robin dash pair still shares a normName");
ok(normName("Tampa Theatre") === "tampa theatre", "Tampa Theatre keeps both words");
ok(normName("The Tampa") === "the tampa", "The Tampa is a whole name");
ok(normName("Miami Beach") === "miami beach", "Miami Beach is a whole name");
ok(normName("Cafe Tampa") === "cafe tampa", "a one-word name plus a city is not stripped to one token");
ok(normName("Key West") === "key west", "Key West stays intact");
ok(normName("All Fired Up (Winter Park) Pottery Painting") === normName("All Fired Up (Waterford Lakes) Pottery Painting"),
  "parenthetical locality qualifiers strip so both All Fired Up studios share a normName");
ok(normName("Strandhill Public (Tampa Heights)") === normName("Strandhill Public"),
  "a parenthetical Tampa Heights qualifier strips off Strandhill Public");
ok(normName("The Ritz-Carlton, Naples") === normName("The Ritz-Carlton Naples, Tiburón")
  && brandKey("The Ritz-Carlton, Naples") === brandKey("The Ritz-Carlton Naples, Tiburón"),
  "Tiburón loses its accent and joins Naples as the same Ritz-Carlton brand");

const tampa = {
  id: TAMPA_ID, place_id: TAMPA_ID, name: "Dracula's Legacy Wine Bar & Bistro Tampa",
  kind: "place", wfScore: 98, reviews: 2600, rating: 4.8, distMi: 23.1,
  fallRail: "date-night", halloweenRail: "decorated-bars", sourceUrl: DRACULA_SITE, occurrence_dates: [],
};
const stpete = {
  id: STPETE_ID, place_id: STPETE_ID, name: "Dracula's Legacy Wine Bar & Bistro",
  kind: "place", wfScore: 96, reviews: 954, rating: 4.7, distMi: 17.3,
  fallRail: "date-night", halloweenRail: "decorated-bars", sourceUrl: DRACULA_SITE, occurrence_dates: [],
};
ok(brandKey(tampa) === brandKey(stpete) && brandKey(tampa).startsWith("site:"),
  "both Dracula locations share a site brand key (" + brandKey(tampa) + " vs " + brandKey(stpete) + ")");
ok(brandKey({ name: "Joyland" }) !== brandKey({ name: "La Jaula" }) && brandKey({ name: "La Jaula" }) !== brandKey({ name: "Enigma" }),
  "Joyland, La Jaula and Enigma stay three brands");
ok(brandKey({ name: "Cedar Fox Coffee", sourceUrl: "https://thatssotampa.com/cedar" }) !== brandKey({ name: "OfKors Cafe", sourceUrl: "https://thatssotampa.com/ofkors" }),
  "a shared editorial host does not merge unrelated cafes");

const folded = dedupePlaces([stpete, tampa], true);
ok(folded.length === 1 && folded[0].id === TAMPA_ID, "brand collapse keeps the higher-review Dracula (Tampa)");
ok(dedupePlaces([stpete, tampa], false).length === 2, "collapseBrand false keeps both locations");

const fall = composeFallIntentRails([], [stpete, tampa], { lat: 27.5859, lng: -82.4254, today: "2026-10-25" });
const dateNight = fall.rails.find((rail) => rail.id === "date-night");
ok(dateNight && dateNight.cards.length === 1 && dateNight.cards[0].id === TAMPA_ID,
  "Fall date-night keeps the higher-score Dracula, not the closer one");

const halloween = composeHalloweenRails([{ cards: [stpete, tampa] }], "2026-10-25");
const bars = halloween.find((rail) => rail.id === "decorated-bars");
ok(bars && bars.cards.length === 1 && bars.cards[0].id === TAMPA_ID,
  "Halloween decorated-bars shows one Dracula card");

const nuevaFar = { id: "nueva-tampa", name: "Nueva Cantina – Downtown Tampa", kind: "place", christmasRail: "popup-bars", wfScore: 90, distMi: 20, sourceUrl: NUEVA_SITE };
const nuevaNear = { id: "nueva-harbor", name: "Nueva Cantina – Palm Harbor", kind: "place", christmasRail: "popup-bars", wfScore: 80, distMi: 8, sourceUrl: NUEVA_SITE };
const christmas = composeChristmasIntentRails([], [nuevaNear, nuevaFar], { lat: 27.3364, lng: -82.5307, today: "2026-12-01" });
const popup = christmas.rails.find((rail) => rail.id === "popup-bars");
ok(popup && popup.cards.length === 1 && popup.cards[0].id === "nueva-tampa",
  "Christmas popup-bars keeps the higher-score Nueva Cantina inside the same distance group");

const ranked = rankRailPlaces([stpete, tampa]);
ok(ranked.length === 1 && ranked[0].id === TAMPA_ID, "rankRailPlaces keeps the higher Wayfind score");
ok(collapseRailBrands([tampa, stpete]).map((card) => card.id).join() === TAMPA_ID, "collapse keeps the already-first card");

const low = { kind: "place", id: "near", name: "Nueva Cantina - Palm Harbor", title: "Nueva Cantina - Palm Harbor", lat: 28.08, lng: -82.76, wfScore: 70, reviews: 100, sourceUrl: NUEVA_SITE, region: "tampa-bay" };
const high = { kind: "place", id: "far", name: "Nueva Cantina - Downtown Tampa", title: "Nueva Cantina - Downtown Tampa", lat: 27.95, lng: -82.46, wfScore: 95, reviews: 800, sourceUrl: NUEVA_SITE, region: "tampa-bay" };
const parade = { kind: "event", id: "parade", name: "Holiday Boat Parade", title: "Holiday Boat Parade", region: "tampa-bay" };
const located = christmasBrowsePage([high, low, parade], parseChristmasBrowseQuery({ page: "1", lat: "28.08", lng: "-82.76" }), "2026-10-25");
ok(located.total === 2 && located.cards.some((card) => card.id === "near") && !located.cards.some((card) => card.id === "far"),
  "a located Christmas browse page keeps the closer branch and the unrelated event");
const unlocated = christmasBrowsePage([low, high], parseChristmasBrowseQuery({ page: "1" }), "2026-10-25");
ok(unlocated.total === 1 && unlocated.cards[0].id === "far",
  "without a location the browse page keeps the higher Wayfind score");

const vibe = "https://cdn.example/vibe.jpg";
ok(cardImageSrc({ signals: { photos: [vibe] } }) === vibe, "signals.photos[0] is the cover when photo_url is unset");
ok(cardImageSrc({ photo_url: "/theme.jpg", signals: { photos: [vibe] } }) === "/theme.jpg", "an explicit seasonal cover beats the gallery");
const ID = "ChIJbrandphototest0001";
const blocked = cardImageSrc({ id: ID, photo_url: "https://images.pexels.com/x.jpg", signals: { photos: [vibe] } });
ok(blocked !== vibe && blocked !== "https://images.pexels.com/x.jpg" && blocked.includes(ID),
  "an illegal photo_url does not unlock the gallery and does not render (" + blocked + ")");

const gallery = detailGalleryPhotos({
  image: "https://cdn.wayfind.test/hero.jpg",
  photos: [{ _directUri: "https://cdn.wayfind.test/hero.jpg" }, { _directUri: "https://cdn.wayfind.test/b.jpg" }, { _directUri: "/api/photo?place=x" }],
  signals: { photos: ["https://cdn.wayfind.test/c.jpg"] },
  photoGallery: ["https://cdn.wayfind.test/b.jpg"],
  owned_photos: ["https://cdn.wayfind.test/d.jpg"],
});
ok(JSON.stringify(gallery) === JSON.stringify([
  "https://cdn.wayfind.test/hero.jpg",
  "https://cdn.wayfind.test/b.jpg",
  "https://cdn.wayfind.test/c.jpg",
  "https://cdn.wayfind.test/d.jpg",
]), "detail gallery leads with the hero and unwraps every owned photo once");

const PALM = "ChIJsWDK4QLzwogR0CgPI35zaX0";
const DOWNTOWN = "ChIJmzKZ8InEwogR0PM7xTqUB6M";
const PINTO = "ChIJUczTK5XC2YgRRt4Jp6N3B70";
const STRAND = "ChIJUVX3MWXEwogRMmHunvjE6xY";
const WINTER = "ChIJjapVvA9w54gRY4Tpi19HXhI";
const WATER = "ChIJhbni_xFn54gR0p89LazzSD8";
const HERE = { lat: 27.9506, lng: -82.4572 };

const nuevaEvent = {
  id: "nueva-hocus", kind: "event", name: "Hocus Pocus Halloween at Nueva Cantina",
  event_name: "Hocus Pocus Halloween at Nueva Cantina", title: "Nueva Cantina Halloween",
  venue: "Nueva Cantina - Palm Harbor", place_id: PALM, halloweenRail: "decorated-bars",
  sourceUrl: NUEVA_SITE, start_date: "2026-10-01", end_date: "2026-11-01", occurrence_dates: [],
  wfScore: 70,
};
const nuevaPalm = {
  id: PALM, kind: "place", name: "Nueva Cantina - Palm Harbor", title: "Nueva Cantina - Palm Harbor",
  place_id: PALM, halloweenRail: "decorated-bars", sourceUrl: NUEVA_SITE, wfScore: 92, occurrence_dates: [],
};
const nuevaDowntown = {
  id: DOWNTOWN, kind: "place", name: "Nueva Cantina - Downtown Tampa", title: "Nueva Cantina - Downtown Tampa",
  place_id: DOWNTOWN, halloweenRail: "decorated-bars", sourceUrl: NUEVA_SITE, wfScore: 88, occurrence_dates: [],
};
const nuevaRail = composeHalloweenRails([{ cards: [nuevaDowntown, nuevaPalm, nuevaEvent] }], "2026-10-25")
  .find((rail) => rail.id === "decorated-bars");
ok(nuevaRail && nuevaRail.cards.length === 1 && nuevaRail.cards[0].id === "nueva-hocus",
  "Halloween decorated-bars keeps one Nueva Cantina card when the event and both branches are present");

const pintoEvent = {
  id: "pintos-fall", kind: "event", name: "Pinto's Fall at the Farm", event_name: "Pinto's Fall at the Farm",
  title: "Pinto's Fall at the Farm", tags: ["fall", "farm"], fall_rail: "farms", place_id: PINTO,
  distMi: 2, start_date: "2026-10-01", end_date: "2026-11-08", occurrence_dates: [],
};
const pintoPlace = {
  id: PINTO, kind: "place", name: "Pinto's Farm", title: "Pinto's Farm", fallRail: "farms",
  place_id: PINTO, distMi: 2, wfScore: 90, occurrence_dates: [],
};
const farms = composeFallIntentRails([pintoEvent], [pintoPlace], { ...HERE, today: "2026-10-25" })
  .rails.find((rail) => rail.id === "farms");
ok(farms && farms.cards.length === 1 && farms.cards[0].id === "pintos-fall",
  "a Fall farms rail keeps one card when the event and the place share a place_id");

const winter = {
  id: WINTER, kind: "place", name: "All Fired Up (Winter Park) Pottery Painting",
  title: "All Fired Up Halloween Pottery", halloweenRail: "festivals", fallRail: "date-night",
  wfScore: 80, distMi: 4, occurrence_dates: [],
};
const waterford = {
  id: WATER, kind: "place", name: "All Fired Up (Waterford Lakes) Pottery Painting",
  title: "All Fired Up Halloween Pottery", halloweenRail: "festivals", fallRail: "date-night",
  wfScore: 88, distMi: 6, occurrence_dates: [],
};
const firedHalloween = composeHalloweenRails([{ cards: [winter, waterford] }], "2026-10-25")
  .find((rail) => rail.id === "festivals");
ok(firedHalloween && firedHalloween.cards.length === 1 && firedHalloween.cards[0].id === WATER,
  "Halloween festivals collapses the two All Fired Up studios that share a displayed title");
const firedFall = composeFallIntentRails([], [winter, waterford], { ...HERE, today: "2026-10-25" })
  .rails.find((rail) => rail.id === "date-night");
ok(firedFall && firedFall.cards.length === 1 && firedFall.cards[0].id === WATER,
  "Fall date-night keeps the higher-score All Fired Up studio");

const strandEvent = {
  id: "strand-miracle", name: "Miracle at Strandhill Public", title: "Miracle at Strandhill Public",
  venue: "Strandhill Public (Tampa Heights)", place_id: STRAND, christmas_rail: "popup-bars",
  start_date: "2026-11-20", end_date: "2026-12-31", distMi: 4, occurrence_dates: [],
};
const strandPlace = {
  id: STRAND, kind: "place", name: "Strandhill Public (Tampa Heights)", title: "Strandhill Public (Tampa Heights)",
  place_id: STRAND, christmasRail: "popup-bars", distMi: 4, wfScore: 91,
};
const strandRail = composeChristmasIntentRails([strandEvent], [strandPlace], { ...HERE, today: "2026-12-01" })
  .rails.find((rail) => rail.id === "popup-bars");
ok(strandRail && strandRail.cards.length === 1 && strandRail.cards[0].id === "strand-miracle",
  "Christmas popup-bars keeps the Strandhill event and drops the same-venue place card");

const ritzNaples = { id: "ritz-naples", kind: "place", name: "The Ritz-Carlton, Naples", title: "The Ritz-Carlton, Naples", wfScore: 96 };
const ritzTiburon = { id: "ritz-tiburon", kind: "place", name: "The Ritz-Carlton Naples, Tiburón", title: "The Ritz-Carlton Naples, Tiburón", wfScore: 90 };
ok(collapseRailBrands([ritzNaples, ritzTiburon]).map((card) => card.id).join() === "ritz-naples",
  "Southwest shelf collapse keeps one Ritz-Carlton after Tiburón normalizes");

// An event title identifies the program, not its date or location. Retain
// distinct occurrences while still folding duplicate representations of one.
const festival = {
  kind: "event", id: "harvest-oct30-north", name: "Harvest Festival", title: "Harvest Festival",
  venue: "North Community Park", city: "Tampa", place_id: "north-park",
  start_date: "2026-10-30", end_date: "2026-10-30", start_time: "18:00",
  halloweenRail: "festivals", fall_rail: "festivals", christmas_rail: "towns-markets",
  tags: ["halloween", "fall", "festival"], lat: 27.95, lng: -82.46,
};
const nextDate = { ...festival, id: "harvest-oct31-north", start_date: "2026-10-31", end_date: "2026-10-31" };
const otherVenue = { ...festival, id: "harvest-oct30-south", place_id: "south-park", venue: "South Community Park" };
const laterTime = { ...festival, id: "harvest-oct30-late", start_time: "20:00" };
const eventCases = [festival, nextDate, otherVenue, laterTime];
ok(collapseRailBrands(eventCases).length === 4, "same event title at different dates, venues, and times stays four occurrences");
ok(collapseRailBrands([festival, { ...festival }]).length === 1, "a duplicate event record still collapses");
ok(collapseRailBrands([festival, { ...festival, id: "other-provider-id" }]).length === 1,
  "two provider records for the same title, venue, and schedule collapse");
ok(collapseRailBrands([festival, { ...nextDate, id: festival.id }]).length === 2,
  "a reused event ID cannot hide a different dated occurrence");
ok(collapseRailBrands([festival, { ...otherVenue, id: festival.id }]).length === 2,
  "a reused event ID cannot hide a different venue");
ok(collapseRailBrands([{ kind: "event", id: "undated-a", title: "Fall Festival" }, { kind: "event", id: "undated-b", title: "Fall Festival" }]).length === 2,
  "a title without venue and schedule is insufficient evidence to collapse events");
ok(collapseRailBrands([{ kind: "event", id: "id-only" }, { kind: "event", id: "id-only" }]).length === 1,
  "an exact event ID still deduplicates a sparse copy");
ok(collapseRailBrands([
  { ...festival, id: "town-a", place_id: null, venue: "Community Park", city: "Tampa" },
  { ...festival, id: "town-b", place_id: null, venue: "Community Park", city: "Orlando" },
]).length === 2, "identically named venues in different cities stay distinct");
ok(collapseRailBrands([
  { ...festival, id: "branch-a", place_id: null, venue: "Nueva Cantina - Palm Harbor" },
  { ...festival, id: "branch-b", place_id: null, venue: "Nueva Cantina - Downtown Tampa" },
]).length === 2, "event venue matching retains branch suffixes");
ok(collapseRailBrands([
  { ...festival, id: "series-a", occurrence_dates: ["2026-10-30", "2026-10-31"] },
  { ...festival, id: "series-b", occurrence_dates: ["2026-10-31", "2026-10-30", "2026-10-30"] },
]).length === 1, "the same verified date set in a different order is one occurrence listing");
ok(collapseRailBrands([
  { ...festival, id: "series-a", occurrence_dates: ["2026-10-30"] },
  { ...festival, id: "series-b", occurrence_dates: ["2026-10-31"] },
]).length === 2, "different verified date sets stay distinct even when their season envelope matches");
const rejectedVenuePlace = { kind: "place", id: "north-park", place_id: "north-park", name: "North Community Park" };
ok(collapseRailBrands([festival, rejectedVenuePlace, nextDate]).map((row) => row.id).join() === [festival.id, nextDate.id].join(),
  "a rejected duplicate venue card cannot hide a later distinct event");
const eventHalloween = composeHalloweenRails([{ cards: eventCases }], "2026-10-29").find((row) => row.id === "festivals");
ok(eventHalloween?.cards.length === 4, "Halloween composition retains all four event occurrences");
const eventFall = composeFallIntentRails(eventCases, [], { ...HERE, today: "2026-10-29" }).rails.find((row) => row.id === "festivals");
ok(eventFall?.cards.length === 4, "Fall composition retains all four event occurrences");
const winterEvents = [
  { ...festival, id: "winter-dec1", name: "Winter Market", title: "Winter Market", tags: ["christmas"], start_date: "2026-12-01", end_date: "2026-12-01" },
  { ...festival, id: "winter-dec2", name: "Winter Market", title: "Winter Market", tags: ["christmas"], start_date: "2026-12-02", end_date: "2026-12-02" },
];
const eventChristmas = composeChristmasIntentRails(winterEvents, [], { ...HERE, today: "2026-12-01" }).rails.find((row) => row.id === "towns-markets");
ok(eventChristmas?.cards.length === 2, "Christmas composition keeps different events at the same venue on different dates");

const reusedIdDates = [festival, { ...nextDate, id: festival.id }];
ok(composeFallIntentRails(reusedIdDates, [], { ...HERE, today: "2026-10-29" }).rails.find((row) => row.id === "festivals")?.cards.length === 2,
  "Fall does not treat a reused source event ID as an explicit series");
ok(composeHalloweenRails([{ cards: reusedIdDates }], "2026-10-29").find((row) => row.id === "festivals")?.cards.length === 2,
  "Halloween does not treat a reused source event ID as an explicit series");
ok(composeChristmasIntentRails([winterEvents[0], { ...winterEvents[1], id: winterEvents[0].id }], [], { ...HERE, today: "2026-12-01" }).rails.find((row) => row.id === "towns-markets")?.cards.length === 2,
  "Christmas does not treat a reused source event ID as an explicit series");
ok(mergePagedItems([reusedIdDates[0]], [reusedIdDates[1]], 1, railItemIdentity).length === 2,
  "client paging uses the same occurrence identity as server selection");
ok(mergePagedItems([festival], [{ ...festival }], 1, railItemIdentity).length === 1,
  "an already loaded occurrence is not appended a second time");
ok(seedSignature([reusedIdDates[0]], 1, railItemIdentity) !== seedSignature([reusedIdDates[1]], 1, railItemIdentity),
  "a same-sized seed changes when a source ID moves to another occurrence date");
ok(seedSignature([festival], 1, railItemIdentity) === seedSignature([{ ...festival }], 1, railItemIdentity),
  "equivalent occurrence data keeps a stable client seed signature");
ok(railItemIdentity(tampa) === TAMPA_ID && railItemIdentity({ ...tampa }) === TAMPA_ID,
  "permanent place render and paging identity stays its source ID");
const explicitSeries = [festival, nextDate].map((row) => ({ ...row, event_series_id: "verified-harvest-series" }));
ok(composeFallIntentRails(explicitSeries, [], { ...HERE, today: "2026-10-29" }).rails.find((row) => row.id === "festivals")?.cards.length === 1,
  "Fall still groups an explicitly identified event series");
ok(composeHalloweenRails([{ cards: explicitSeries }], "2026-10-29").find((row) => row.id === "festivals")?.cards.length === 1,
  "Halloween still groups an explicitly identified event series");
ok(composeChristmasIntentRails(winterEvents.map((row) => ({ ...row, event_series_id: "verified-winter-series" })), [], { ...HERE, today: "2026-12-01" }).rails.find((row) => row.id === "towns-markets")?.cards.length === 1,
  "Christmas still groups an explicitly identified event series");
ok(collapseRailBrands([
  { kind: "event", id: "unknown-venue-a", name: "Harvest Festival", city: "Tampa", start_date: "2026-10-30" },
  { kind: "event", id: "unknown-venue-b", name: "Harvest Festival", city: "Tampa", start_date: "2026-10-30" },
]).length === 2, "a city is not sufficient venue evidence for occurrence deduplication");

ok(collapseRailBrands([
  { ...festival, id: "opaque-venue-a", place_id: null, venue: { name: "North Park" } },
  { ...festival, id: "opaque-venue-b", place_id: null, venue: { name: "South Park" } },
]).length === 2, "opaque venue objects never become a shared literal object name");

const PHOTO_ID = "ChIJphotogallerytest01";
const DIRECT_A = "https://cdn.wayfind.test/a.jpg";
const DIRECT_B = "https://cdn.wayfind.test/b.jpg";
const discovery = placeDiscoveryRef(PHOTO_ID);
const proxy = "/api/photo?ref=" + encodeURIComponent(discovery) + "&g=2&w=640";
const healedFields = detailPhotoFields({
  photos: [{ _directUri: DIRECT_A }, { _directUri: DIRECT_B }, { name: discovery }],
}, PHOTO_ID);
ok(healedFields.photos[0] === DIRECT_A && healedFields.photos[1] === DIRECT_B && healedFields.photos[2] === proxy
  && healedFields.photoRef === discovery,
  "fetchPlaceDetail keeps vaulted direct URLs and still appends the discovery proxy");
const proxyOnly = detailPhotoFields({ photos: [{ name: discovery }] }, PHOTO_ID);
ok(proxyOnly.photos.length === 1 && proxyOnly.photos[0] === proxy && proxyOnly.photoRef === discovery,
  "a discovery-ref-only details payload still heals through the guarded proxy");
const cover = "/api/photo?ref=" + encodeURIComponent(discovery) + "&g=2&w=640";
const grown = mergeHealedPlacePhotos(
  { id: PHOTO_ID, photo: cover },
  { ok: true, photos: [DIRECT_A, DIRECT_B] },
);
ok(grown.photos[0] === cover && grown.photos[1] === DIRECT_A && grown.photos[2] === DIRECT_B,
  "a card that already has its cover grows into the full gallery with the cover first");

const signalPhotos = ["https://cdn.wayfind.test/rail-a.jpg", "https://cdn.wayfind.test/rail-b.jpg"];
const landed = invPlaceToLanding({ id: PHOTO_ID, name: "Gallery Place", lat: 1, lng: 2, signals: { photos: signalPhotos } });
ok(landed && JSON.stringify(landed.photos) === JSON.stringify(signalPhotos),
  "a landing card carries signals.photos onto the click");
const nearby = shapeNearbyRow({
  place_id: "ChIJnearbyphotophoto01", name: "Nearby Gallery", lat: 27.95, lng: -82.46,
  primary_type: "restaurant", google_types: ["restaurant", "food"],
  signals: { rating: 4.6, reviews: 200, photos: signalPhotos },
}, HERE, "food");
ok(nearby && JSON.stringify(nearby.photos) === JSON.stringify(signalPhotos),
  "a nearby card carries signals.photos onto the click");
const slimSrc = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");
const slimFn = slimSrc.slice(slimSrc.indexOf("export function slimPlace"), slimSrc.indexOf("async function attachBeachWater"));
ok(/ownedSignalPhotos\(p\)/.test(slimFn) && /photos\.length/.test(slimFn) && /\{\s*photos\s*\}/.test(slimFn),
  "a homepage rail card copies owned signals.photos onto the click");
ok(JSON.stringify(ownedSignalPhotos({ signals: { photos: [...signalPhotos, "https://images.pexels.com/photos/1/stock.jpg"] } })) === JSON.stringify(signalPhotos),
  "owned gallery photos drop stock URLs before a rail card carries them");
ok(JSON.stringify(ownedSignalPhotos({ signals: { photos: [] } })) === "[]",
  "an empty gallery stays off the card");

if (failed) {
  console.error("test-brand-rail-dedupe: " + failed + " failed");
  process.exit(1);
}
console.log("test-brand-rail-dedupe: OK — one brand per rail, cover photo, and detail gallery");
