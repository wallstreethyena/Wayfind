import GuideArticleHero from "../../components/GuideArticleHero";
import ShareButton from "../../components/ShareButton";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import { WF_PLACE_CARD_CSS } from "../../components/css";
import GuideMapExplorer from "../../components/GuideMapExplorer";
import GuideFigure from "../../components/GuideFigure";
import { fallEventCardImageSrc, withFallVenueIdentity } from "../../../lib/fallEventImage";
import styles from "./page.module.css";
import {
  FLORIDA_FALL_GUIDE_EVENTS_2026,
  FLORIDA_FALL_GUIDE_EVENT_COUNT,
  FALL_GUIDE_KIND_LABELS,
  FALL_GUIDE_OCTOBER_WEEKENDS,
  FALL_GUIDE_REGION_ORDER,
  FALL_GUIDE_STARTER_IDS,
  FALL_GUIDE_WEEKDAY_IDS,
  fallGuideEventHref,
  fallGuideKind,
  fallGuideRegion,
  findFallGuideEvent,
} from "../../../lib/floridaFallGuide2026";

// v2026-09-22 — moved onto the shared GuideMapExplorer (map + house-card
// rail + category filters), the SAME component every guide with >=3 mappable
// places now gets. This guide keeps its own filter set and photo-place-id
// map (EVENT_PHOTO_PLACE_IDS below) because those are this guide's own
// editorial data, not something a generic component should invent.
const MAP_EXPLORER_FILTERS = [
  { id: "pumpkins", label: "Pumpkin patches", family: "outdoors" },
  { id: "markets", label: "Markets", family: "shop" },
  { id: "family", label: "Family Halloween", family: "shows" },
  { id: "haunts", label: "Haunted + after dark", family: "drinks" },
  { id: "tastes", label: "Fall food + drinks", family: "food" },
  { id: "events", label: "Big fall events", family: "shows" },
  { id: "all", label: "Everything", family: "other" },
];

const EVENT_PHOTO_PLACE_IDS = Object.freeze({
  "st-pete-pier-fall-fest-2026": "ChIJX-E766nhwogR8u_Re6nJTyk",
  "fox-squirrel-maze-2026": "ChIJFwrRu7o33YgRIuZ-0QgeCVQ",
  "keel-farms-harvest-days-2026": "ChIJ_5yVrBY13YgRwSgyH1hrRjg",
  "hunsader-pumpkin-2026": "ChIJuSnFvF8xw4gRt0WOWL_cqRc",
  "tampa-riverwalk-trick-or-treat-2026": "ChIJc8QsSADFwogRH9awG-1qaCs",
  "howl-o-scream-tampa-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag",
  "screamageddon-2026": "ChIJ7zRUJ9CowogRM70pcoqrdUM",
  "oktoberfest-tampa-curtis-hixon-2026": "ChIJlRUlG4nEwogRJOgu0Hf2n54",
  "tampa-pig-jig-2026": "ChIJ-U84wHnEwogR9ry4KMSoZW8",
  "fantasy-fest-2026": "ChIJs_tsm0ix0YgRmYbIX_M5CT8",
  "mount-dora-craft-fair-2026": "ChIJGSMzu2Oi54gR-rlDDL6V3Qs",
  "florida-coffee-festival-2026": "ChIJcQyYH85654gRPh6gV_UpsDY",
  "southern-hill-farms-fall-festival-2026": "ChIJ-aI9NvSI54gRrVByB84z-AY",
  "great-scott-fall-fest-2026": "ChIJ68SLYriZ54gRaJgw169KqYA",
  "fruitville-grove-pumpkin-2026": "ChIJhWqZvoVHw4gRehUSFsbZARo",
  "gatorland-ghosts-goblins-2026": "ChIJ9RHZGx6H3YgRnWVYIWsHNPM",
});

function fallGuideSpots(spots) {
  return spots.map((spot) => {
    if (spot.image || !/^ChIJ/.test(String(spot.id))) {
      const placeId = EVENT_PHOTO_PLACE_IDS[spot.id];
      if (placeId) return { ...spot, image: "/api/photo?place=" + encodeURIComponent(placeId) + "&g=2&w=800" };
      return spot;
    }
    return { ...spot, image: "/api/photo?place=" + encodeURIComponent(spot.id) + "&g=2&w=800" };
  });
}

// v9 (owner, 2026-09-23): "the share cards for all of the guide and blogs
// needs to look premium … it looks cheap." This is a blog-style guide, not
// exempt from that direction just because it lives outside app/guides/
// [slug]. It has no lib/guideHero.js registry entry of its own, so the
// credited inline hero photo below (already used in the article body, an
// Unsplash-licensed photo of pumpkins in Davie, FL) is registered by this
// guide's own id in lib/heroSource.js's DEDICATED_GUIDE_HEROES — resolved
// server-side by kind+id, same as every other guide — rather than left as a
// bare typographic card.
//
// Audit (2026-09-23): this used to hand the photo to the route directly via
// a caller-controlled ?src=/?pos= query override, which — because the same
// route also allowed any same-origin path — made this public route capable
// of fetching and re-serving an arbitrary https URL (including the metered
// /api/photo). The route no longer reads either param at all.
const shareImage = "/api/og/hero?kind=guide&id=florida-fall-festivals-2026"
  + "&t=" + encodeURIComponent("The Complete Florida Fall Guide 2026")
  + "&cat=Guide&loc=" + encodeURIComponent("Florida")
  + "&n=" + FLORIDA_FALL_GUIDE_EVENT_COUNT;

export const metadata = {
  title: "Florida Fall Guide 2026: October Weekends, Halloween, Farms and Food",
  description: "Plan every October weekend in Florida with verified 2026 pumpkin patches, fall festivals, haunted nights, family Halloween, seasonal food, fairs and weekday fall plans across the state.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/guides/florida-fall-festivals-2026" },
  openGraph: {
    title: "The Complete Florida Fall Guide 2026",
    description: "Every October weekend, pumpkin patches, haunted nights, family Halloween, fall food and statewide festival plans in one guide.",
    url: "/guides/florida-fall-festivals-2026",
    images: [{ url: shareImage, width: 1200, height: 630, type: "image/jpeg", alt: "Orange pumpkins arranged at a nursery in Davie, Florida for Wayfind's complete 2026 Florida fall guide" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Complete Florida Fall Guide 2026",
    description: "Pick your October weekend, then choose farms, haunts, family Halloween, food or festivals across Florida.",
    images: [shareImage],
  },
};

const hero = {
  src: "https://images.unsplash.com/photo-1537991458814-f9f068c1fd52?auto=format&fit=crop&fm=jpg&q=82&w=1600&h=1067",
  alt: "Orange pumpkins arranged at a nursery in Davie, Florida",
  width: 1600,
  height: 1067,
  caption: "Illustrative Florida fall photo from Davie.",
  credit: "Debby Hudson / Unsplash",
  creditHref: "https://unsplash.com/photos/orange-pumpkin-lot-mVGhlNZGoLA",
  license: "Unsplash License",
  licenseUrl: "https://unsplash.com/license",
  position: "50% 58%",
};

const mapSpots = [
  {
    id: "st-pete-pier-fall-fest-2026",
    name: "St. Pete Pier Fall Fest + Pumpkin Patch",
    groups: ["pumpkins", "family", "events"],
    city: "St. Petersburg",
    when: "Pumpkin patch Oct 9 to 25 • Fall Fest Oct 10 to 11",
    detail: "Waterfront pumpkins, family activities, live music and food at the Pier. The festival is free to attend.",
    href: "https://stpetepier.org/signature-event/st-pete-fall-festival/",
    cta: "Official event",
    lat: 27.7737074,
    lng: -82.622616,
    category: "attractions",
    primary_type: "tourist_attraction",
    mapFamily: "outdoors",
  },
  {
    id: "gallaghers-pumpkins-2026",
    name: "Gallagher's Pumpkins & Christmas Trees",
    groups: ["pumpkins", "family"],
    city: "St. Petersburg",
    when: "From Sep 21 • 9 AM to 9 PM",
    detail: "An easy neighborhood pumpkin stop with a goat pen, food trailer and an expanded 2026 layout.",
    tip: "Casual family photos are free; professional sessions require a reservation.",
    href: "/florida-events/gallaghers-pumpkins-2026",
    lat: 27.843052,
    lng: -82.6449,
    category: "attractions",
    mapFamily: "outdoors",
  },
  {
    id: "fox-squirrel-maze-2026",
    name: "Fox Squirrel Corn Maze & Pumpkin Patch",
    groups: ["pumpkins", "family"],
    city: "Plant City",
    when: "Sep 26 to Oct 25",
    detail: "A weekend-only Plant City corn maze and pumpkin patch with live music, duck races and a patch you actually pick from.",
    tip: "The last hour before close is cooler and quieter. Kids under 3 are free.",
    href: "/florida-events/fox-squirrel-maze-2026",
    lat: 28.0990771,
    lng: -82.1554914,
    category: "attractions",
    mapFamily: "outdoors",
  },
  {
    id: "keel-farms-harvest-days-2026",
    name: "Keel Farms Harvest Days",
    groups: ["pumpkins", "family", "tastes"],
    city: "Plant City",
    when: "Oct 3 to 25 • 10 AM to 3 PM",
    detail: "Pumpkin activities and farm play for kids, with an on-site winery, brewery and restaurant for the adults.",
    tip: "Book a restaurant table for after the farm loop; October Saturdays build a walk-in queue.",
    href: "/florida-events/keel-farms-harvest-days-2026",
    lat: 28.0666,
    lng: -82.1467,
    category: "attractions",
    mapFamily: "outdoors",
  },
  {
    id: "hunsader-pumpkin-2026",
    name: "Hunsader Farms Pumpkin Festival",
    groups: ["pumpkins", "family", "events"],
    city: "Bradenton",
    when: "Oct 10 to 25 • 9 AM to 5 PM",
    detail: "A three-weekend working-farm festival with pumpkins, hayrides, craft vendors and livestock. Plan on a half day, not a quick photo stop.",
    tip: "Cash only. Go early; the access-road queue builds after 11 AM. Parking is $5.",
    href: "/florida-events/hunsader-pumpkin-2026",
    lat: 27.4448076,
    lng: -82.3046144,
    category: "attractions",
    mapFamily: "outdoors",
  },
  {
    id: "seminole-heights-great-pumpkin-patch-2026",
    name: "Seminole Heights Great Pumpkin Patch",
    groups: ["pumpkins", "family"],
    city: "Tampa",
    when: "Oct 7 to 31",
    detail: "A volunteer-run community pumpkin patch with useful evening hours and a central Tampa location.",
    tip: "Check the day-specific hours before leaving; early October has Monday and Tuesday closures.",
    href: "/florida-events/seminole-heights-great-pumpkin-patch-2026",
    lat: 28.002979,
    lng: -82.454603,
    category: "attractions",
    mapFamily: "outdoors",
  },
  {
    id: "ChIJwTaQvXzxwogR3bHs7Q_MZ6A",
    name: "Dunedin Downtown Market",
    groups: ["markets"],
    city: "Dunedin",
    when: "Seasonal market",
    detail: "A downtown farmers market with a strong local-food and browse-the-main-street feel. Check the current market calendar before you drive.",
    href: "/p/ChIJwTaQvXzxwogR3bHs7Q_MZ6A",
    lat: 28.0117315,
    lng: -82.7890551,
    category: "shopping",
    primary_type: "farmers_market",
    mapFamily: "shopping",
  },
  {
    id: "ChIJN5UJYJniwogRSUETPigZD18",
    name: "Gulfport Tuesday Fresh Market",
    groups: ["markets"],
    city: "Gulfport",
    when: "Recurring market",
    detail: "A waterfront-town market with local vendors and the eclectic Gulfport energy people come for.",
    href: "/p/ChIJN5UJYJniwogRSUETPigZD18",
    lat: 27.7386312,
    lng: -82.7081781,
    category: "shopping",
    primary_type: "market",
    mapFamily: "shopping",
  },
  {
    id: "ChIJsTZmISDFwogRRBlWaUPE54k",
    name: "Hyde Park Village Fresh Market",
    groups: ["markets"],
    city: "Tampa",
    when: "Recurring market",
    detail: "A polished South Tampa market stop for produce, artisan goods and an easy walk through Hyde Park Village.",
    href: "/p/ChIJsTZmISDFwogRRBlWaUPE54k",
    lat: 27.9364549,
    lng: -82.4751943,
    category: "shopping",
    primary_type: "market",
    mapFamily: "shopping",
  },
  {
    id: "ChIJPRapcZzhwogRZwBXnkjb7Jw",
    name: "St. Petersburg Saturday Morning Market",
    groups: ["markets"],
    city: "St. Petersburg",
    when: "Recurring market",
    detail: "One of the region's most established market mornings, with food, growers, makers and downtown St. Pete around it.",
    href: "/p/ChIJPRapcZzhwogRZwBXnkjb7Jw",
    lat: 27.7739887,
    lng: -82.6374558,
    category: "shopping",
    primary_type: "farmers_market",
    mapFamily: "shopping",
  },
  {
    id: "tampa-riverwalk-trick-or-treat-2026",
    name: "Tampa Riverwalk Trick or Treat",
    groups: ["family", "events"],
    city: "Tampa",
    when: "Oct 24 • 4 PM to 9 PM",
    detail: "A free Riverwalk Halloween plan for families, centered at Cotanchobee Fort Brooke Park.",
    href: "/florida-events/tampa-riverwalk-trick-or-treat-2026",
    lat: 27.941553,
    lng: -82.4522125,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "halloween-on-central-st-pete-2026",
    name: "Halloween on Central",
    groups: ["family", "events"],
    city: "St. Petersburg",
    when: "Oct 25 • 12 PM to 5 PM",
    detail: "A free, family-friendly Central Avenue Halloween festival with trick-or-treating and a full street-event scale.",
    href: "/florida-events/halloween-on-central-st-pete-2026",
    lat: 27.7711,
    lng: -82.660733,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "howl-o-scream-tampa-2026",
    name: "Howl-O-Scream Busch Gardens Tampa Bay",
    groups: ["haunts", "events"],
    city: "Tampa",
    when: "Sep 11 to Oct 31 • nights",
    detail: "Haunted houses, scare zones and Busch Gardens coasters after dark make this the full theme-park scare-night commitment.",
    tip: "September weeknights are the quieter and cheaper part of the run.",
    href: "/florida-events/howl-o-scream-tampa-2026",
    lat: 28.0371,
    lng: -82.4195,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "screamageddon-2026",
    name: "Scream-A-Geddon Horror Park",
    groups: ["haunts", "events"],
    city: "Dade City",
    when: "Sep 4 to Nov 1 • nights",
    detail: "A standalone horror park spread across 60 rural acres, with multiple haunts plus a 2026 midway with food trucks, fire pits and a beer garden.",
    tip: "Buy a timed ticket online. October Saturdays have the toughest walk-up queues.",
    href: "/florida-events/screamageddon-2026",
    lat: 28.341,
    lng: -82.254,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "ChIJF06M0-_FwogRirItJy_x26M",
    name: "Ybor City Ghost Tours Co",
    groups: ["haunts"],
    city: "Tampa",
    when: "Year-round ghost tour",
    detail: "A haunted-history walking option through Ybor City when you want spooky without committing to a full haunted attraction.",
    href: "/p/ChIJF06M0-_FwogRirItJy_x26M",
    lat: 27.9607084,
    lng: -82.441888,
    category: "attractions",
    primary_type: "tourist_attraction",
    mapFamily: "culture",
  },
  {
    id: "ChIJ7QVjUK_FwogRaTLY8uxOico",
    name: "SpookEasy Lounge",
    groups: ["haunts", "tastes"],
    city: "Tampa",
    when: "Year-round spooky stop",
    detail: "A spooky lounge with themed drinks, oddities decor and recurring ghost programming, verified again for the 2026 fall collection.",
    href: "/p/ChIJ7QVjUK_FwogRaTLY8uxOico",
    lat: 27.9614157,
    lng: -82.4427268,
    category: "food",
    primary_type: "restaurant",
    mapFamily: "food",
  },
  {
    id: "ChIJw8yuv53hwogRivnj0XblR-k",
    name: "Dracula's Legacy Wine Bar & Bistro",
    groups: ["haunts", "tastes"],
    city: "St. Petersburg",
    when: "Year-round themed bar",
    detail: "A Dracula and Vlad-themed wine bar with immersive decor, making it an easy October drink without needing a one-night event ticket.",
    href: "/p/ChIJw8yuv53hwogRivnj0XblR-k",
    lat: 27.7740854,
    lng: -82.6336368,
    category: "nightlife",
    primary_type: "wine_bar",
    mapFamily: "drinks",
  },
  {
    id: "ChIJVQB8l1PEwogRfNZtGI6suIc",
    name: "Gasparilla Distillery & Cocktail Bar",
    groups: ["tastes"],
    city: "Tampa",
    when: "2026 fall menu",
    detail: "The 2026 seasonal menu brings Pumpkin Spiced Rum, Apple Spiced Rum and limited-run fall cocktails.",
    href: "/p/ChIJVQB8l1PEwogRfNZtGI6suIc",
    lat: 27.9583122,
    lng: -82.4352991,
    category: "nightlife",
    primary_type: "cocktail_bar",
    mapFamily: "drinks",
  },
  {
    id: "ChIJ5crCip3EwogRQnhkbw_Ir6U",
    name: "On Swann",
    groups: ["tastes"],
    city: "Tampa",
    when: "2026 seasonal menu",
    detail: "Current fall dishes include butternut squash and delicata squash across the menu, verified for this season.",
    href: "/p/ChIJ5crCip3EwogRQnhkbw_Ir6U",
    lat: 27.9374672,
    lng: -82.4749343,
    category: "food",
    primary_type: "american_restaurant",
    mapFamily: "food",
  },
  {
    id: "ChIJ9ZpMS-7jwogRWChZqTQG66g",
    name: "Sōl St Pete Bistro",
    groups: ["tastes"],
    city: "St. Petersburg",
    when: "2026 seasonal menu",
    detail: "A current pumpkin-forward seasonal menu stop. Availability can change, so check the restaurant before making a special trip.",
    href: "/p/ChIJ9ZpMS-7jwogRWChZqTQG66g",
    lat: 27.769379451169,
    lng: -82.662862045543,
    category: "food",
    primary_type: "restaurant",
    mapFamily: "food",
  },
  {
    id: "oktoberfest-tampa-curtis-hixon-2026",
    name: "Oktoberfest Tampa",
    groups: ["events", "tastes"],
    city: "Tampa",
    when: "Oct 9 to 11",
    detail: "Three days of imported German beer, German bands, stein-holding contests and wiener-dog races on the Hillsborough River.",
    tip: "Friday evening is the lighter crowd. Poe and Fort Brooke garages are the practical downtown parking options.",
    href: "/florida-events/oktoberfest-tampa-curtis-hixon-2026",
    lat: 27.9489169,
    lng: -82.4616494,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "tampa-pig-jig-2026",
    name: "Tampa Pig Jig",
    groups: ["events", "tastes"],
    city: "Tampa",
    when: "Oct 17",
    detail: "Barbecue teams cook all day on the riverfront while a major country lineup plays into the night.",
    tip: "Eat before late afternoon; the best barbecue cuts can run out before the headliner.",
    href: "/florida-events/tampa-pig-jig-2026",
    lat: 27.949,
    lng: -82.4675,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "southern-hill-farms-fall-festival-2026",
    name: "Southern Hill Farms Fall Festival",
    groups: ["pumpkins", "family", "events"],
    city: "Clermont",
    when: "Sep 26 to Nov 22",
    detail: "Rides, corn, flowers, animals, music and food make this a full Clermont farm-festival day.",
    tip: "Plan a half day; there is enough here for different ages and interests.",
    href: "/florida-events/southern-hill-farms-fall-festival-2026",
    lat: 28.4541904,
    lng: -81.6783927,
    category: "attractions",
    primary_type: "farm",
    mapFamily: "outdoors",
  },
  {
    id: "great-scott-fall-fest-2026",
    name: "Great Scott Farms Fall Fest and Corn Maze",
    groups: ["pumpkins", "family", "events"],
    city: "Mount Dora",
    when: "Sep 26 to Nov 15",
    detail: "A giant corn maze, jumping pillow, zip line and super slide make the maze the main event instead of background decor.",
    tip: "Plan a half day if your group wants to do the maze and attractions without rushing.",
    href: "/florida-events/great-scott-fall-fest-2026",
    lat: 28.72853,
    lng: -81.6682,
    category: "attractions",
    primary_type: "farm",
    mapFamily: "outdoors",
  },
  {
    id: "fruitville-grove-pumpkin-2026",
    name: "Fruitville Grove Pumpkin Festival",
    groups: ["pumpkins", "family", "events"],
    city: "Sarasota",
    when: "Oct 3 to Nov 1 • 10 AM to 5 PM",
    detail: "Pumpkin photos, fall vendors, food and kids activities at the working grove market east of I-75. Festival entry is free.",
    tip: "Morning light is better for patch photos. Parking is $5.",
    href: "/florida-events/fruitville-grove-pumpkin-2026",
    lat: 27.3378046,
    lng: -82.4230065,
    category: "attractions",
    primary_type: "farm",
    mapFamily: "outdoors",
  },
  {
    id: "gatorland-ghosts-goblins-2026",
    name: "Gators, Ghosts & Goblins at Gatorland",
    groups: ["family", "events"],
    city: "Orlando",
    when: "Oct 10 to 25 • 10 AM to 5 PM",
    detail: "A costume parade, candy trails, the Swamp Ghost Museum and a cryptid-themed train, all inside Gatorland.",
    tip: "Halloween activities are included with regular admission, parking is free, and the event is designed to stay non-gory.",
    href: "/florida-events/gatorland-ghosts-goblins-2026",
    lat: 28.3556496,
    lng: -81.4022109,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "zoo-boo-zoo-miami-2026",
    name: "Zoo Boo at Zoo Miami",
    groups: ["family", "events"],
    city: "Miami",
    when: "Oct 24 to 25",
    detail: "Zoo Miami turns into a daytime Halloween stop with costumes, inflatables and animal-themed Halloween activities.",
    tip: "Trick-or-treating is for ages 12 and under and is included with zoo admission.",
    href: "/florida-events/zoo-boo-zoo-miami-2026",
    lat: 25.613,
    lng: -80.4,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "house-of-horror-carnival-2026",
    name: "House of Horror Carnival",
    groups: ["haunts", "events"],
    city: "Miami",
    when: "From Sep 24",
    detail: "Haunted houses, midway rides and a dark coaster make this the Miami pick for groups that want a haunt and carnival on the same night.",
    href: "/florida-events/house-of-horror-carnival-2026",
    lat: 25.724,
    lng: -80.319,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "nightmare-village-xtreme-action-park-2026",
    name: "Nightmare Village at Xtreme Action Park",
    groups: ["haunts", "events"],
    city: "Fort Lauderdale",
    when: "Oct 2 to Nov 1",
    detail: "Three haunted houses inside Xtreme Action Park: Patches' Slaughter, The Collection and The Cellar.",
    href: "/florida-events/nightmare-village-xtreme-action-park-2026",
    lat: 26.193,
    lng: -80.154,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "fantasy-fest-2026",
    name: "Fantasy Fest",
    groups: ["haunts", "events"],
    city: "Key West",
    when: "Oct 16 to 25",
    detail: "A ten-day costume and street festival that takes over Key West and ends with the big Duval Street parade.",
    tip: "Midweek is easier than closing weekend. Once you arrive, avoid moving the car; parking is the pain point.",
    href: "/florida-events/fantasy-fest-2026",
    lat: 24.5551,
    lng: -81.8,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "stone-crab-festival-2026",
    name: "Naples Stone Crab Festival",
    groups: ["tastes", "events"],
    city: "Naples",
    when: "Oct 23 to 25",
    detail: "A free waterfront weekend marking stone crab season with fresh claws, seafood and live music around Tin City.",
    tip: "Go earlier for the first claws. Tin City parking is tight, so the 4th Ave S garage is easier.",
    href: "/florida-events/stone-crab-festival-2026",
    lat: 26.1465,
    lng: -81.7896,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "mount-dora-craft-fair-2026",
    name: "Mount Dora Craft Fair",
    groups: ["markets", "events"],
    city: "Mount Dora",
    when: "Oct 24 to 25",
    detail: "More than 400 juried crafters take over historic downtown Mount Dora for the town's signature October weekend.",
    tip: "Sunday morning is the lighter crowd. Downtown streets close, so use satellite parking and shuttles.",
    href: "/florida-events/mount-dora-craft-fair-2026",
    lat: 28.8023531,
    lng: -81.6436931,
    category: "shows",
    mapFamily: "shows",
  },
  {
    id: "florida-coffee-festival-2026",
    name: "Florida Coffee Festival",
    groups: ["tastes", "events"],
    city: "Orlando",
    when: "Nov 15 • 11 AM to 4 PM",
    detail: "Florida coffee shops, roasters, matcha brands and specialty beverage makers pour tastings across Festival Park.",
    tip: "VIP starts at 10 AM before general admission; specialty pours can disappear early.",
    href: "/florida-events/florida-coffee-festival-2026",
    lat: 28.546919,
    lng: -81.3467079,
    category: "shows",
    mapFamily: "shows",
  },
];


function formatGuideDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function eventWhen(event) {
  if (event.schedule_note) return event.schedule_note;
  const start = formatGuideDate(event.start_date);
  const end = formatGuideDate(event.end_date);
  if (start && end && start !== end) return start + " to " + end;
  return start || end || "Check the organizer for dates";
}

function eventImage(event) {
  if (!event) return null;
  const resolved = withFallVenueIdentity(event);
  const src = fallEventCardImageSrc(resolved, 900);
  if (!src) return null;
  return {
    src,
    alt: resolved.image_alt || ((resolved.venue || resolved.event_name) + "; venue photo"),
    width: 900,
    height: 675,
    caption: event.image_alt || "",
    credit: event.photoAttr || null,
    creditHref: event.photoAttrHref || null,
  };
}

function EventMiniCard({ event, compact = false, rank = null, visual = true }) {
  if (!event) return null;
  const href = fallGuideEventHref(event);
  const image = visual ? eventImage(event) : null;
  return (
    <article className={compact ? styles.miniCardCompact : styles.miniCard}>
      {image ? (
        <div className={styles.miniMedia}>
          {rank ? <span className={styles.rankBadge}>{rank}</span> : null}
          <GuideFigure
            role="card"
            image={image}
            showCaption={false}
            className={styles.miniFigure}
            fallbackText={event.event_name}
          />
        </div>
      ) : rank ? <span className={styles.rankBadgeStatic}>{rank}</span> : null}
      <div className={styles.miniBody}>
        <div className={styles.miniCardTop}>
          <span>{event.city || "Florida"}</span>
          <span>{FALL_GUIDE_KIND_LABELS[fallGuideKind(event)] || "Fall plan"}</span>
        </div>
        <h3>{event.event_name}</h3>
        <p>{event.card_hook || event.editorial_summary || eventWhen(event)}</p>
        <small className={styles.whenLine}>{eventWhen(event)}</small>
        {href ? <a href={href}>{String(href).startsWith("/") ? "Open on Wayfind" : "Official information"}</a> : null}
      </div>
    </article>
  );
}

function StarterGrid() {
  const picks = FALL_GUIDE_STARTER_IDS.map(findFallGuideEvent).filter(Boolean);
  return (
    <section className={styles.editorialSection} aria-labelledby="start-here">
      <p className={styles.kicker}>Start here</p>
      <h2 id="start-here">Ten fall plans worth building a weekend around.</h2>
      <p className={styles.sectionDeck}>
        This is the fast version: unusual experiences, big statewide events, classic farms and the strongest October anchors from North Florida to the Keys.
      </p>
      <div className={styles.topTenGrid}>
        {picks.map((event, index) => <EventMiniCard key={event.event_id} event={event} rank={index + 1} />)}
      </div>
    </section>
  );
}

function FallQuickNav() {
  const items = [
    ["🎃", "Pumpkin patches", "#fall-kind-farms"],
    ["👻", "Halloween events", "#fall-kind-haunts"],
    ["🍴", "Food and drinks", "#fall-kind-food"],
    ["🚂", "Train rides", "#start-here"],
    ["🌽", "Corn mazes", "#fall-kind-farms"],
    ["🧒", "Family fun", "#fall-kind-family"],
    ["🎵", "Live music", "#fall-kind-festival"],
    ["🍂", "Fall festivals", "#fall-kind-festival"],
    ["📅", "Weekend plans", "#october-weekends"],
    ["📍", "Map view", "#fall-map"],
  ];
  return (
    <nav className={styles.quickNav} aria-label="Florida fall guide shortcuts">
      {items.map(([icon, label, href]) => (
        <a key={label} href={href}>
          <span aria-hidden="true">{icon}</span>
          <b>{label}</b>
        </a>
      ))}
    </nav>
  );
}

function ExperienceLanes() {
  const lanes = [
    { id: "food", eyebrow: "Eat the season", title: "Fall food and drinks", copy: "Pumpkin, cider, Oktoberfest, seafood weekends and seasonal menus.", href: "#fall-kind-food" },
    { id: "family", eyebrow: "Easy with kids", title: "Family day solved", copy: "Pumpkin patches, animals, trains, trick or treating and daytime Halloween.", href: "#fall-kind-family" },
    { id: "haunts", eyebrow: "After dark", title: "Halloween and haunts", copy: "Theme park scares, haunted trails, ghost tours and late night Halloween.", href: "#fall-kind-haunts" },
    { id: "weekend", eyebrow: "Pick a date", title: "Your October weekends", copy: "Five weekend plans built from verified 2026 event dates.", href: "#october-weekends" },
  ];
  return (
    <section className={styles.laneGrid} aria-label="Choose your Florida fall plan">
      {lanes.map((lane) => (
        <a className={styles.laneCard} href={lane.href} key={lane.id}>
          <span>{lane.eyebrow}</span>
          <h3>{lane.title}</h3>
          <p>{lane.copy}</p>
          <b>Open this lane →</b>
        </a>
      ))}
    </section>
  );
}

function OctoberWeekendPlanner() {
  return (
    <section className={styles.editorialSection} aria-labelledby="october-weekends">
      <p className={styles.kicker}>Every October weekend</p>
      <h2 id="october-weekends">Pick the weekend first. Then pick the vibe.</h2>
      <p className={styles.sectionDeck}>
        Each weekend below is built from dated 2026 events so you can choose the part of October that fits your group instead of scrolling one giant list.
      </p>
      <div className={styles.weekendStack}>
        {FALL_GUIDE_OCTOBER_WEEKENDS.map((weekend) => (
          <article className={styles.weekendCard} key={weekend.date}>
            <div className={styles.weekendHeading}>
              <span>{weekend.date}</span>
              <div>
                <h3>{weekend.title}</h3>
                <p>{weekend.note}</p>
              </div>
            </div>
            <div className={styles.weekendEvents}>
              {weekend.ids.map(findFallGuideEvent).filter(Boolean).map((event) => (
                <EventMiniCard compact key={event.event_id} event={event} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WeekdayPlans() {
  const plans = FALL_GUIDE_WEEKDAY_IDS.map(findFallGuideEvent).filter(Boolean);
  return (
    <section className={styles.editorialSection} aria-labelledby="weekday-fall">
      <p className={styles.kicker}>Monday through Thursday</p>
      <h2 id="weekday-fall">Fall does not have to wait for Saturday.</h2>
      <p className={styles.sectionDeck}>
        Use these when you want a quieter pumpkin stop, a seasonal dinner, a coffee run, a ghost tour or a major festival that is open beyond the weekend.
      </p>
      <div className={styles.cardGrid}>
        {plans.map((event) => <EventMiniCard key={event.event_id} event={event} />)}
      </div>
    </section>
  );
}

function BrowseByKind() {
  const kinds = ["farms", "family", "haunts", "food", "festival", "activities"];
  return (
    <section className={styles.editorialSection} aria-labelledby="browse-by-kind">
      <p className={styles.kicker}>Everything by vibe</p>
      <h2 id="browse-by-kind">Pumpkins, scares, food, festivals and family Halloween.</h2>
      <div className={styles.bucketGrid}>
        {kinds.map((kind) => {
          const events = FLORIDA_FALL_GUIDE_EVENTS_2026.filter((event) => fallGuideKind(event) === kind)
            .filter((event) => String(event.end_date || event.start_date || "") >= "2026-09-25")
            .slice(0, 10);
          if (!events.length) return null;
          return (
            <div className={styles.bucket} key={kind} id={"fall-kind-" + kind}>
              <h3>{FALL_GUIDE_KIND_LABELS[kind]}</h3>
              <p>{events.length} featured plans in this guide</p>
              <div className={styles.bucketList}>
                {events.map((event) => (
                  <a key={event.event_id} href={fallGuideEventHref(event) || "#guide"}>
                    <span>{event.event_name}</span>
                    <small>{event.city || "Florida"} · {formatGuideDate(event.start_date)}</small>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BrowseByRegion() {
  return (
    <section className={styles.editorialSection} aria-labelledby="browse-by-region">
      <p className={styles.kicker}>Statewide</p>
      <h2 id="browse-by-region">Find fall near the part of Florida you are actually in.</h2>
      <p className={styles.sectionDeck}>
        The guide reaches beyond Tampa Bay and Orlando so a fall road trip can start in Pensacola, Jacksonville, Miami, the Gulf Coast or anywhere in between.
      </p>
      <div className={styles.regionGrid}>
        {FALL_GUIDE_REGION_ORDER.map((region) => {
          const events = FLORIDA_FALL_GUIDE_EVENTS_2026.filter((event) => fallGuideRegion(event) === region)
            .filter((event) => String(event.end_date || event.start_date || "") >= "2026-09-25")
            .slice(0, 12);
          if (!events.length) return null;
          return (
            <article className={styles.regionCard} key={region}>
              <h3>{region}</h3>
              <p>{events.length} current picks shown</p>
              <div className={styles.regionLinks}>
                {events.map((event) => (
                  <a key={event.event_id} href={fallGuideEventHref(event) || "#guide"}>
                    {event.event_name}
                  </a>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function FloridaFallGuide() {
  return (
    <main className={styles.page}>
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
      <GuideArticleHero
        title="The Complete Florida Fall Guide 2026"
        description="Plan every October weekend with pumpkin patches, farm days, haunted nights, family Halloween, seasonal food, fairs and statewide fall festivals."
        image={hero}
        region="Florida"
        category="Fall guide"
        updatedLabel="Updated September 25, 2026"
        backHref="/guides"
        backLabel="All guides"
        jumpHref="#guide"
        jumpLabel="Plan October"
        actions={<ShareButton
          url={pageShareUrl("/guides/florida-fall-festivals-2026")}
          title="The Complete Florida Fall Guide 2026"
          text="Every October weekend, pumpkin patches, haunted nights, family Halloween, fall food and statewide festival plans. On Wayfind."
          tone="dark"
          event="guide_share"
          meta={{ slug: "florida-fall-festivals-2026", placement: "hero" }}
        />}
      />

      <div id="guide" className={styles.content}>
        <div className={styles.trustBar} aria-label="Florida fall guide details">
          <span><b>{FLORIDA_FALL_GUIDE_EVENT_COUNT}+</b> verified plans</span>
          <span><b>Every</b> October weekend</span>
          <span><b>Statewide</b> Florida coverage</span>
        </div>

        <div className={styles.intro}>
          <p className={styles.kicker}>Florida fall, all in one place</p>
          <h2>Pick your weekend. We did the rest.</h2>
          <p>
            This guide combines dated 2026 farms, pumpkin patches, Halloween nights, trick or treating, food festivals, seasonal menus, Oktoberfests, fairs and fall day trips across Florida. Start with the ten anchors, plan an October weekend, then browse by vibe or region.
          </p>
        </div>

        <FallQuickNav />
        <StarterGrid />
        <ExperienceLanes />
        <OctoberWeekendPlanner />
        <WeekdayPlans />

        <section id="fall-map" className={styles.mapSection} aria-label="Florida fall map">
        <GuideMapExplorer
          spots={fallGuideSpots(mapSpots)}
          filters={MAP_EXPLORER_FILTERS}
          kicker="Pick a category, then swipe"
          heading="The card and the map stay together."
          description="Swipe through a category and the matching map pin follows the card you are viewing. Tap a pin to bring that card into view."
          proof={["2026 dates", "Exact locations", "Tips before you go"]}
          note="Swipe the cards to move the selected pin. Tap a pin to jump back to its card."
          railIdPrefix="fall-guide"
        />
        </section>

        <BrowseByKind />
        <BrowseByRegion />

        <aside className={styles.note}>
          <p className={styles.kicker}>Before you go</p>
          <h2>Use the timing to make the day better.</h2>
          <p>
            Farm festivals are easier earlier in the day when it is cooler and photos are cleaner. For ticketed haunts, reserve timed entry before you leave. For food festivals, eat the signature stuff first because the most popular items can run out.
          </p>
        </aside>

        <div className={styles.disclosure}>We may earn a commission when you book through partner links. It never changes our rankings.</div>
      </div>
    </main>
  );
}
