#!/usr/bin/env node
// One brand, one card in a rail. Locks the Parrish Halloween shelf that
// showed both Dracula's Legacy locations side by side, and the cover/gallery
// photo rules that go with a place card.
import { brandKey, collapseRailBrands, dedupePlaces, normName } from "../lib/placeDedupe.js";
import { composeFallIntentRails } from "../lib/fallIntentRails.js";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { composeChristmasIntentRails } from "../lib/christmasIntentRails.js";
import { christmasBrowsePage, parseChristmasBrowseQuery } from "../lib/christmasBrowse.js";
import { rankRailPlaces } from "../lib/railRank.js";
import { cardImageSrc } from "../lib/placePhoto.js";
import { detailGalleryPhotos } from "../lib/livePhoto.js";

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

if (failed) {
  console.error("test-brand-rail-dedupe: " + failed + " failed");
  process.exit(1);
}
console.log("test-brand-rail-dedupe: OK — one brand per rail, cover photo, and detail gallery");
