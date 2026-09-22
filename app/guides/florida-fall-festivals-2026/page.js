import GuideArticleHero from "../../components/GuideArticleHero";
import PosterEventCard from "../../components/PosterEventCard";
import { RailDots, RailNav } from "../../components/RailCard";
import FallGuideExplorer from "./FallGuideExplorer";
import styles from "./page.module.css";

const shareImage = "/api/og?t=Florida%20Fall%202026&loc=Florida&cta=OPEN%20THE%20GUIDE&sub=Pumpkins%20%E2%80%A2%20markets%20%E2%80%A2%20haunts%20%E2%80%A2%20food&tone=fall";

export const metadata = {
  title: "Florida Fall Guide 2026 | Wayfind",
  description: "Pumpkin patches, fall markets, haunted nights, family Halloween, seasonal food and the biggest fall weekends across Florida, all mapped by Wayfind.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Florida Fall Guide 2026 | Wayfind",
    description: "Pumpkins, markets, haunts, fall food and family plans. Filter the map and pick what is actually worth the drive.",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Florida Fall Guide 2026 | Wayfind",
    description: "Pumpkins, markets, haunts, fall food and family plans, all in one mapped guide.",
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

const pumpkin = [
  {
    id: "st-pete-pier-fall-fest-2026",
    name: "St. Pete Pier Fall Fest + Pumpkin Patch",
    date: "2026-10-10",
    venue: "St. Pete Pier",
    city: "St. Petersburg",
    genre: "Pumpkin & Harvest",
    ticketed: false,
    thumb: "/api/photo?place=ChIJX-E766nhwogR8u_Re6nJTyk&w=800",
    dest: "https://stpetepier.org/signature-event/st-pete-fall-festival/",
    destKind: "external",
  },
  {
    id: "gallaghers-pumpkins-2026",
    name: "Gallagher's Pumpkins & Christmas Trees",
    date: "2026-09-21",
    venue: "Gallagher's Pumpkins & Christmas Trees",
    city: "St. Petersburg",
    genre: "Pumpkin Patch",
    dest: "/florida-events/gallaghers-pumpkins-2026",
    destKind: "internal",
  },
  {
    id: "fox-squirrel-maze-2026",
    name: "Fox Squirrel Corn Maze & Pumpkin Patch",
    date: "2026-09-26",
    venue: "Fox Squirrel Corn Maze",
    city: "Plant City",
    genre: "Pumpkin & Harvest",
    price: "$15",
    thumb: "/api/photo?place=ChIJFwrRu7o33YgRIuZ-0QgeCVQ&w=800",
    dest: "/florida-events/fox-squirrel-maze-2026",
    destKind: "internal",
  },
  {
    id: "keel-farms-harvest-days-2026",
    name: "Keel Farms Harvest Days",
    date: "2026-10-03",
    venue: "Keel Farms",
    city: "Plant City",
    genre: "Pumpkin & Harvest",
    ticketed: false,
    thumb: "/api/photo?place=ChIJ_5yVrBY13YgRwSgyH1hrRjg&w=800",
    dest: "/florida-events/keel-farms-harvest-days-2026",
    destKind: "internal",
  },
  {
    id: "hunsader-pumpkin-2026",
    name: "Hunsader Farms Pumpkin Festival",
    date: "2026-10-10",
    venue: "Hunsader Farms",
    city: "Bradenton",
    genre: "Pumpkin & Harvest",
    price: "$5 to $15",
    dest: "/florida-events/hunsader-pumpkin-2026",
    destKind: "internal",
  },
  {
    id: "southern-hill-farms-fall-festival-2026",
    name: "Southern Hill Farms Fall Festival",
    date: "2026-09-26",
    venue: "Southern Hill Farms",
    city: "Clermont",
    genre: "Pumpkin & Harvest",
    price: "$29.94",
    thumb: "/api/photo?place=ChIJ-aI9NvSI54gRrVByB84z-AY&w=800",
    dest: "/florida-events/southern-hill-farms-fall-festival-2026",
    destKind: "internal",
  },
  {
    id: "great-scott-fall-fest-2026",
    name: "Great Scott Farms Fall Fest and Corn Maze",
    date: "2026-09-26",
    venue: "Great Scott Farms",
    city: "Mount Dora",
    genre: "Pumpkin & Harvest",
    price: "$16 to $20",
    thumb: "/api/photo?place=ChIJ68SLYriZ54gRaJgw169KqYA&w=800",
    dest: "/florida-events/great-scott-fall-fest-2026",
    destKind: "internal",
  },
  {
    id: "fruitville-grove-pumpkin-2026",
    name: "Fruitville Grove Pumpkin Festival",
    date: "2026-10-03",
    venue: "Fruitville Grove",
    city: "Sarasota",
    genre: "Pumpkin & Harvest",
    ticketed: false,
    thumb: "/api/photo?place=ChIJhWqZvoVHw4gRehUSFsbZARo&w=800",
    dest: "/florida-events/fruitville-grove-pumpkin-2026",
    destKind: "internal",
  },
];

const family = [
  {
    id: "tampa-riverwalk-trick-or-treat-2026",
    name: "Tampa Riverwalk Trick or Treat",
    date: "2026-10-24",
    time: "4 PM",
    venue: "Cotanchobee Fort Brooke Park",
    city: "Tampa",
    genre: "Family Halloween",
    ticketed: false,
    thumb: "/api/photo?place=ChIJc8QsSADFwogRH9awG-1qaCs&w=800",
    dest: "/florida-events/tampa-riverwalk-trick-or-treat-2026",
    destKind: "internal",
  },
  {
    id: "halloween-on-central-st-pete-2026",
    name: "Halloween on Central",
    date: "2026-10-25",
    time: "12 PM",
    venue: "Central Avenue",
    city: "St. Petersburg",
    genre: "Family Halloween",
    ticketed: false,
    dest: "/florida-events/halloween-on-central-st-pete-2026",
    destKind: "internal",
  },
  {
    id: "seminole-heights-great-pumpkin-patch-2026",
    name: "Seminole Heights Great Pumpkin Patch",
    date: "2026-10-07",
    venue: "Seminole Heights Great Pumpkin Patch",
    city: "Tampa",
    genre: "Family Halloween",
    dest: "/florida-events/seminole-heights-great-pumpkin-patch-2026",
    destKind: "internal",
  },
  {
    id: "gatorland-ghosts-goblins-2026",
    name: "Gators, Ghosts & Goblins at Gatorland",
    date: "2026-10-10",
    time: "10 AM",
    venue: "Gatorland",
    city: "Orlando",
    genre: "Family Halloween",
    thumb: "/api/photo?place=ChIJ9RHZGx6H3YgRnWVYIWsHNPM&w=800",
    dest: "/florida-events/gatorland-ghosts-goblins-2026",
    destKind: "internal",
  },
  {
    id: "zoo-boo-zoo-miami-2026",
    name: "Zoo Boo at Zoo Miami",
    date: "2026-10-24",
    venue: "Zoo Miami",
    city: "Miami",
    genre: "Family Halloween",
    dest: "/florida-events/zoo-boo-zoo-miami-2026",
    destKind: "internal",
  },
];

const haunts = [
  {
    id: "howl-o-scream-tampa-2026",
    name: "Howl-O-Scream Busch Gardens Tampa Bay",
    date: "2026-09-11",
    time: "7 PM",
    venue: "Busch Gardens Tampa Bay",
    city: "Tampa",
    genre: "Haunted & After Dark",
    price: "From $49.99",
    thumb: "/api/photo?place=ChIJhRo4DU_GwogRUgjhMAj-pag&w=800",
    dest: "/florida-events/howl-o-scream-tampa-2026",
    destKind: "internal",
  },
  {
    id: "screamageddon-2026",
    name: "Scream-A-Geddon Horror Park",
    date: "2026-09-04",
    time: "7 PM",
    venue: "Scream-A-Geddon Horror Park",
    city: "Dade City",
    genre: "Haunted & After Dark",
    price: "$30.95 to $55.95",
    thumb: "/api/photo?place=ChIJ7zRUJ9CowogRM70pcoqrdUM&w=800",
    dest: "/florida-events/screamageddon-2026",
    destKind: "internal",
  },
  {
    id: "house-of-horror-carnival-2026",
    name: "House of Horror Carnival",
    date: "2026-09-24",
    venue: "House of Horror at Tropical Park",
    city: "Miami",
    genre: "Haunted & After Dark",
    dest: "/florida-events/house-of-horror-carnival-2026",
    destKind: "internal",
  },
  {
    id: "nightmare-village-xtreme-action-park-2026",
    name: "Nightmare Village at Xtreme Action Park",
    date: "2026-10-02",
    venue: "Xtreme Action Park",
    city: "Fort Lauderdale",
    genre: "Haunted & After Dark",
    dest: "/florida-events/nightmare-village-xtreme-action-park-2026",
    destKind: "internal",
  },
];

const bigWeekends = [
  {
    id: "oktoberfest-tampa-curtis-hixon-2026",
    name: "Oktoberfest Tampa",
    date: "2026-10-09",
    venue: "Curtis Hixon Waterfront Park",
    city: "Tampa",
    genre: "Big Fall Event",
    thumb: "/api/photo?place=ChIJlRUlG4nEwogRJOgu0Hf2n54&w=800",
    dest: "/florida-events/oktoberfest-tampa-curtis-hixon-2026",
    destKind: "internal",
  },
  {
    id: "tampa-pig-jig-2026",
    name: "Tampa Pig Jig",
    date: "2026-10-17",
    venue: "Julian B. Lane Riverfront Park",
    city: "Tampa",
    genre: "Big Fall Event",
    thumb: "/api/photo?place=ChIJ-U84wHnEwogR9ry4KMSoZW8&w=800",
    dest: "/florida-events/tampa-pig-jig-2026",
    destKind: "internal",
  },
  {
    id: "fantasy-fest-2026",
    name: "Fantasy Fest",
    date: "2026-10-16",
    venue: "Key West",
    city: "Key West",
    genre: "Big Fall Event",
    thumb: "/api/photo?place=ChIJs_tsm0ix0YgRmYbIX_M5CT8&w=800",
    dest: "/florida-events/fantasy-fest-2026",
    destKind: "internal",
  },
  {
    id: "stone-crab-festival-2026",
    name: "Naples Stone Crab Festival",
    date: "2026-10-23",
    time: "5 PM",
    venue: "Tin City Waterfront Shops",
    city: "Naples",
    genre: "Big Fall Event",
    ticketed: false,
    dest: "/florida-events/stone-crab-festival-2026",
    destKind: "internal",
  },
  {
    id: "mount-dora-craft-fair-2026",
    name: "Mount Dora Craft Fair",
    date: "2026-10-24",
    venue: "Downtown Mount Dora",
    city: "Mount Dora",
    genre: "Big Fall Event",
    ticketed: false,
    thumb: "/api/photo?place=ChIJGSMzu2Oi54gR-rlDDL6V3Qs&w=800",
    dest: "/florida-events/mount-dora-craft-fair-2026",
    destKind: "internal",
  },
  {
    id: "florida-coffee-festival-2026",
    name: "Florida Coffee Festival",
    date: "2026-11-15",
    time: "11 AM",
    venue: "Festival Park",
    city: "Orlando",
    genre: "Big Fall Event",
    price: "$20 to $50",
    thumb: "/api/photo?place=ChIJcQyYH85654gRPh6gV_UpsDY&w=800",
    dest: "/florida-events/florida-coffee-festival-2026",
    destKind: "internal",
  },
];

const sections = [
  ["Pumpkins, Farms & Harvest", "The pumpkin patches and harvest weekends with a real 2026 schedule.", pumpkin],
  ["Family Halloween", "Candy, costumes and daytime Halloween without the full scare factor.", family],
  ["Haunted & After Dark", "The nights to save for haunted houses, scare zones and darker Florida plans.", haunts],
  ["Big Fall Weekends", "Festival-size plans for the calendar, from Oktoberfest to waterfront music and food.", bigWeekends],
];

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
    detail: "A local pumpkin stop built for fall photos and an easy family outing.",
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
    detail: "Corn maze, pumpkins and a farm day that works when you want the full harvest-festival version of fall.",
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
    detail: "Free Harvest Days with pumpkins and family farm energy, plus the food and wine side of Keel Farms.",
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
    detail: "A major local pumpkin-festival weekend with a corn-maze and hayride profile. Wayfind keeps the photo neutral until an exact reusable event image is cleared.",
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
    detail: "A neighborhood pumpkin-patch option in Seminole Heights for a lighter, closer-to-home fall plan.",
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
    detail: "Haunted houses, scare zones and coasters after dark. This is the full theme-park scare-night commitment.",
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
    detail: "A dedicated independent horror park in Dade City with multiple haunted experiences and a stronger scare-first profile.",
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
    detail: "A downtown Tampa fall weekend at Curtis Hixon Waterfront Park built around Oktoberfest food, beer and festival energy.",
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
    detail: "A waterfront music and barbecue day at Julian B. Lane Riverfront Park with a big-event feel.",
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
    detail: "A full farm-festival day with pumpkins and harvest-season attractions, verified for the 2026 run.",
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
    detail: "Pumpkins, a corn-maze profile and a long 2026 fall run near Mount Dora.",
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
    detail: "A free Sarasota pumpkin-festival option with a farm setting and a month-long 2026 run.",
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
    detail: "A family Halloween event at Gatorland with the kind of only-in-Florida setting that makes the drive feel different.",
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
    detail: "A family Halloween weekend at Zoo Miami with trick-or-treating in the 2026 event lineup.",
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
    detail: "Miami's House of Horror returns as a dedicated Halloween carnival and haunt option for the 2026 season.",
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
    detail: "A South Florida haunted-attraction option inside Xtreme Action Park for the 2026 Halloween season.",
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
    detail: "Key West's citywide costume festival is one of Florida's most distinctive October road-trip events.",
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
    detail: "A free waterfront fall weekend in Naples centered on Florida stone crab and seafood.",
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
    detail: "A free downtown Mount Dora arts-and-craft weekend that fits the small-town fall road-trip lane.",
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
    detail: "A late-fall Orlando event for coffee people, with a focused food-and-drink reason to make the trip.",
    href: "/florida-events/florida-coffee-festival-2026",
    lat: 28.546919,
    lng: -81.3467079,
    category: "shows",
    mapFamily: "shows",
  },
];

function EventRail({ title, description, events, id }) {
  if (!events.length) return null;
  return (
    <section className={styles.section} aria-labelledby={id + "-heading"}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.kicker}>Wayfind verified</p>
          <h2 id={id + "-heading"}>{title}</h2>
          <p>{description}</p>
        </div>
        <RailNav railId={id} count={events.length} total={events.length} loaded={events.length} unit="picks" />
      </div>
      <div className={styles.rail} data-rail={id}>
        {events.map((event, index) => (
          <PosterEventCard key={event.id} event={event} rank={index + 1} surface="guide_florida_fall_2026" />
        ))}
      </div>
      <RailDots railId={id} count={events.length} />
    </section>
  );
}

export default function FloridaFallGuide() {
  return (
    <main className={styles.page}>
      <GuideArticleHero
        title="Florida Fall Guide 2026"
        description="Pumpkin patches, markets, haunted nights, fall food, family Halloween and the weekends actually worth putting on the calendar."
        image={hero}
        region="Florida"
        category="Fall guide"
        updatedLabel="Updated September 21, 2026"
        backHref="/guides"
        backLabel="All guides"
        jumpHref="#guide"
        jumpLabel="Open the fall map"
      />

      <div id="guide" className={styles.content}>
        <div className={styles.trustBar} aria-label="Wayfind guide standards">
          <span><b>Verified</b> dates and places</span>
          <span><b>Mapped</b> with exact coordinates</span>
          <span><b>No</b> paid placement</span>
        </div>

        <div className={styles.intro}>
          <p className={styles.kicker}>Fall without the homework</p>
          <h2>Stop saving screenshots. Pick a plan.</h2>
          <p>
            The posts that inspired this guide are good at giving you ideas. Wayfind turns those ideas into something you can use: current dates, exact locations, category filters, real map pins and direct event or place pages.
          </p>
        </div>

        <FallGuideExplorer spots={mapSpots} />

        <div className={styles.railIntro}>
          <p className={styles.kicker}>Start with the strongest plans</p>
          <h2>Four rails. No filler.</h2>
          <p>These are the dated 2026 picks we can put on your calendar now. Swipe each rail for more.</p>
        </div>

        {sections.map(([title, description, events], index) => (
          <EventRail
            key={title}
            title={title}
            description={description}
            events={events}
            id={"fall-section-" + (index + 1)}
          />
        ))}

        <aside className={styles.note}>
          <p className={styles.kicker}>Why this stays trustworthy</p>
          <h2>A viral post can be a lead. It cannot be the date.</h2>
          <p>
            Wayfind checks event timing, place identity and location before it becomes a mapped recommendation. If an item from a roundup cannot be verified yet, it stays out instead of getting a guessed date, a guessed pin or the wrong photo.
          </p>
        </aside>
      </div>
    </main>
  );
}
