// lib/creatorTaxonomy.js - ONE taxonomy for curated creator videos
// (owner approval 2026-11-03, "Fix it"). Pure, zero dependencies, client safe.
//
// Three rules, applied once when lib/creatorVideos.js loads, so every reader
// (Social Find sheet, creator pages, browse groups, seasonal pages) sees the
// same values and new entries cannot reintroduce the old drift:
//
//  1. CATEGORIES. A small closed set. Synonyms collapse: Nightlife into
//     Night out; Hotels and Lodging into Stays; Coffee into Food plus a coffee
//     tag. A holiday is never a category: an entry that says "Halloween" is
//     recategorized to its real category and the holiday becomes a season tag.
//  2. METROS. Videos group by the wf_inventory.metro label (tampa, st-pete,
//     orlando, manatee-sarasota, miami-dade, broward, palm-beach, keys), not by
//     small city names. The city stays as display detail on every spot. Browse
//     groups use the coverage region from lib/metroRegions.js, so st-pete rows
//     sit inside Tampa Bay exactly like every other surface.
//  3. SEASONS. A season tag (christmas, halloween) on the entry or on one video.
//     Seasonal pages read it: /christmas-in-florida lists christmas videos.

export const CREATOR_CATEGORIES = Object.freeze(["Food", "Night out", "Activities", "Family", "Shopping", "Stays", "Farm"]);

const CATEGORY_ALIASES = Object.freeze({
  nightlife: { category: "Night out" },
  "night out": { category: "Night out" },
  hotels: { category: "Stays" },
  hotel: { category: "Stays" },
  lodging: { category: "Stays" },
  stays: { category: "Stays" },
  coffee: { category: "Food", tag: "coffee" },
});

export const CREATOR_SEASONS = Object.freeze(["christmas", "halloween"]);

// A holiday written as a category: the season it becomes, and the real
// category for the entries that carried it (default Activities).
const SEASON_CATEGORIES = Object.freeze({ halloween: "halloween", christmas: "christmas" });
const REAL_CATEGORY_BY_KEY = Object.freeze({
  "wekiva-island-longwood": "Activities",
});

// Holiday reels, reviewed by hand. Entry level when the whole place is the
// holiday (a Christmas store, a haunt); video level when one post of several is.
export const SEASON_BY_KEY = Object.freeze({
  "roberts-christmas-wonderland-clearwater": ["christmas"],
  "snowcat-ridge-dade-city": ["christmas"],
  "santas-christmas-tree-forest-eustis": ["christmas"],
  "holly-bluff-resort-marina-deland": ["christmas"],
  // Reel intake 2026-11-03. Keys match lib/creatorVideos.js on the reels branch.
  "omni-orlando-championsgate-blitzens": ["christmas"],
  "tropicana-field-enchant-st-petersburg": ["christmas"],
  "wekiva-island-longwood": ["halloween"],
  "rreal-tacos-downtown-tampa": ["halloween"],
  "pemberton-haunted-acres-plant-city": ["halloween"],
  "halloweenville-warrington": ["halloween"],
});
export const SEASON_BY_URL = Object.freeze({
  "https://www.instagram.com/reel/De45KqwM80c/": ["halloween"], // The Eye, Halloween show
  "https://www.instagram.com/reel/DeQUPZfRerz/": ["halloween"], // Raglan Road, Halloween menu
  "https://www.instagram.com/reel/DePeTZRuYDC/": ["halloween"], // Strandhill Public, Halloween pop up
  "https://www.instagram.com/reel/DcPT0D5Rwn6/": ["halloween"], // All Fired Up, Halloween pottery
});

// City (match.city) to wf_inventory.metro label. null = a Florida city outside
// every served metro; it keeps its own city group. Cities not listed here and
// not in Florida also keep their own group.
export const CITY_METRO = Object.freeze({
  // orlando
  Orlando: "orlando", "Lake Buena Vista": "orlando", ChampionsGate: "orlando", Kissimmee: "orlando",
  "Winter Garden": "orlando", "Winter Park": "orlando", Maitland: "orlando", Apopka: "orlando",
  Longwood: "orlando", "Altamonte Springs": "orlando", Oviedo: "orlando", Sanford: "orlando",
  Clermont: "orlando", Davenport: "orlando", "Celebration": "orlando",
  // tampa
  Tampa: "tampa", "Tampa Bay": "tampa", Brandon: "tampa", Riverview: "tampa", Gibsonton: "tampa",
  "Apollo Beach": "tampa", "Temple Terrace": "tampa", Lutz: "tampa", Oldsmar: "tampa", Seffner: "tampa",
  "Wesley Chapel": "tampa", Odessa: "tampa", "Plant City": "tampa", "Dade City": "tampa",
  "Spring Hill": "tampa", Brooksville: "tampa",
  // st-pete (Pinellas)
  "St. Petersburg": "st-pete", "St. Pete Beach": "st-pete", "Treasure Island": "st-pete",
  "Madeira Beach": "st-pete", "Tierra Verde": "st-pete", "South Pasadena": "st-pete",
  "Pinellas Park": "st-pete", Seminole: "st-pete", Clearwater: "st-pete", "Clearwater Beach": "st-pete",
  Dunedin: "st-pete", "Palm Harbor": "st-pete",
  // manatee-sarasota
  Sarasota: "manatee-sarasota", Bradenton: "manatee-sarasota", "Bradenton Beach": "manatee-sarasota",
  "Holmes Beach": "manatee-sarasota", "Anna Maria": "manatee-sarasota", "Longboat Key": "manatee-sarasota",
  "Lakewood Ranch": "manatee-sarasota", Parrish: "manatee-sarasota", Palmetto: "manatee-sarasota",
  Ellenton: "manatee-sarasota", "Terra Ceia": "manatee-sarasota", Cortez: "manatee-sarasota",
  Nokomis: "manatee-sarasota", Englewood: "manatee-sarasota",
  // miami-dade
  Miami: "miami-dade", "Miami Beach": "miami-dade", "Miami Lakes": "miami-dade", "North Miami": "miami-dade",
  "North Miami Beach": "miami-dade", Doral: "miami-dade", Hialeah: "miami-dade", Medley: "miami-dade",
  "Coral Gables": "miami-dade", "South Miami": "miami-dade", Aventura: "miami-dade",
  "Palmetto Bay": "miami-dade", "Sunny Isles Beach": "miami-dade", Homestead: "miami-dade",
  // broward
  "Fort Lauderdale": "broward", Hollywood: "broward", "Hallandale Beach": "broward", Davie: "broward",
  "Coral Springs": "broward", Weston: "broward", "Southwest Ranches": "broward",
  // palm-beach
  "West Palm Beach": "palm-beach", "Boynton Beach": "palm-beach", Jupiter: "palm-beach",
  // Florida, outside a served metro: keeps its own city group
  DeLand: null, "De Leon Springs": null, "Vero Beach": null, Tavares: null, Eustis: null,
  "St. Augustine": null, Oxford: null, Lakeland: null, "Fort Myers": null, Melbourne: null,
});

// Browse group label for a metro, through the same coverage region every other
// surface uses (st-pete reads inside Tampa Bay). No dashes in visible copy.
export const METRO_GROUP = Object.freeze({
  tampa: { key: "tampa", label: "Tampa Bay" },
  "st-pete": { key: "tampa", label: "Tampa Bay" },
  orlando: { key: "orlando", label: "Orlando" },
  "manatee-sarasota": { key: "manatee-sarasota", label: "Sarasota and Bradenton" },
  "miami-dade": { key: "miami-dade", label: "Miami" },
  broward: { key: "broward", label: "Fort Lauderdale" },
  "palm-beach": { key: "palm-beach", label: "Palm Beaches" },
  keys: { key: "keys", label: "Florida Keys" },
});

/** wf_inventory.metro label for a city, or null (unknown or outside every metro). */
export function metroForCity(city) {
  const m = city ? CITY_METRO[city] : null;
  return m || null;
}

/** { key, label } browse group for a spot city: its metro region, else the city itself. */
export function groupForCity(city) {
  const m = metroForCity(city);
  if (m && METRO_GROUP[m]) return METRO_GROUP[m];
  return { key: "city:" + String(city || ""), label: String(city || "") };
}

const uniq = (a) => Array.from(new Set(a.filter(Boolean)));

/** { category, tags, seasons } for a raw entry. Pure. */
export function normalizeEntry(e) {
  const raw = e && e.category ? String(e.category).trim() : "";
  const low = raw.toLowerCase();
  const tags = Array.isArray(e && e.tags) ? e.tags.map((t) => String(t).toLowerCase()) : [];
  const seasons = uniq([...(Array.isArray(e && e.seasons) ? e.seasons : []), ...((e && SEASON_BY_KEY[e.key]) || [])].map((s) => String(s).toLowerCase()));
  let category = raw || null;
  if (SEASON_CATEGORIES[low]) {
    seasons.push(SEASON_CATEGORIES[low]);
    category = REAL_CATEGORY_BY_KEY[e.key] || "Activities";
  } else if (CATEGORY_ALIASES[low]) {
    category = CATEGORY_ALIASES[low].category;
    if (CATEGORY_ALIASES[low].tag) tags.push(CATEGORY_ALIASES[low].tag);
  }
  return { category, tags: uniq(tags), seasons: uniq(seasons) };
}

/** Season tags for one video of an entry (entry seasons plus video level ones). */
export function videoSeasons(entrySeasons, video) {
  const own = video && Array.isArray(video.seasons) ? video.seasons : [];
  return uniq([...(entrySeasons || []), ...own, ...((video && SEASON_BY_URL[video.url]) || [])].map((s) => String(s).toLowerCase()));
}
