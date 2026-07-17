// lib/orderInFeatured.js — the owner's curated Order In inventory (v6.42).
// Two owner directives, verbatim:
//   1. "i need to make sure we have card for each of these restaurants
//      displayed on the uber eats page as they are the most popular choices"
//      -> GUARANTEED: every listed brand must appear as a card in its metro.
//   2. "feature the local brands first ... keep national chains as utility
//      options, not the hero content" -> locals get the Wayfind Featured badge
//      and rank first; chains still get cards, ranked last, never badged.
// Pure data + matchers; no network. scripts/test-orderin-rails.mjs locks it.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// "Taco Bell — 4th Street" / "Pura Vida Miami — The Landings" -> base brand.
export const baseBrand = (name) => String(name || "").split(/\s+[—–-]{1,2}\s+/)[0].trim();

// National/regional chains -> utility tier in EVERY metro (owner rule; PDQ,
// Crumbl, Crisp & Green, Jeremiah's included per the owner's chain call).
const CHAIN_RE = /\b(mcdonald|taco bell|chick[\s-]?fil[\s-]?a|starbucks|crumbl|pdq|crisp\s?&?\s?green|jeremiah|wendy|burger king|kfc\b|popeye|subway|domino|pizza hut|papa john|dunkin|chipotle|panera|five guys|checkers|culver|whataburger|firehouse subs|jersey mike|moe'?s southwest|steak\s?'?n\s?shake|sonic\b|arby|dairy queen|little caesar|wingstop|zaxby)\b/i;
export const isChainBrand = (name) => CHAIN_RE.test(String(name || ""));

// The metros the curation covers. Rough centers for nearest-metro detection.
export const METROS = {
  sarasota: { label: "Sarasota", lat: 27.3364, lng: -82.5307 },
  stpete: { label: "St. Petersburg", lat: 27.7676, lng: -82.6403 },
  tampa: { label: "Tampa", lat: 27.9506, lng: -82.4572 },
  orlando: { label: "Orlando", lat: 28.5384, lng: -81.3789 },
};
// A2: true great-circle distance in MILES, not raw-degree Manhattan. Manhattan
// (|dlat|+|dlng|) both over-weights longitude (1 deg lng < 1 deg lat away from the
// equator) and picks the wrong metro near a boundary; haversine is the real nearest.
const _METRO_R_MI = 3958.8;
function metroDistMi(la1, lo1, la2, lo2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(la2 - la1), dLng = toRad(lo2 - lo1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return _METRO_R_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function nearestMetro(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return null;
  let best = null, bestD = Infinity;
  for (const k of Object.keys(METROS)) {
    const m = METROS[k];
    const d = metroDistMi(lat, lng, m.lat, m.lng);
    if (d < bestD) { bestD = d; best = k; }
  }
  return bestD <= 75 ? best : null; // within ~75mi of a covered metro, else organic-only
}

// The owner's full "most popular on Uber Eats" lists, base-brand-deduped.
// EVERY name here is guaranteed a card in its metro.
export const GUARANTEED = {
  sarasota: [
    "Tandoor Fine Indian Cuisine", "Valentino Pizzeria Trattoria", "Pura Vida Miami",
    "Hyde Park Prime Steakhouse", "Origin Craft Beer & Pizza Café", "Isan Thai Restaurant",
    "Chick-fil-A", "Ichiban Restaurant & Sushi Bar", "McDonald's", "Fresh Kitchen",
    "Naked Farmer", "Taco Bell", "Daruma Japanese Steakhouse & Sushi Lounge",
    "Michelangelo's Pizza", "Pacific Rim",
  ],
  stpete: [
    "Bellabrava", "Mi Carreta Restaurant and Bakery", "Gateway to India",
    "Slice of the Burg", "PDQ", "Crumbl Cookies", "Funky Sweets", "AHI Sushi",
    "Taco Bell", "McDonald's",
  ],
  tampa: [
    "SoDough Square", "Fresh Kitchen", "Water + Flour", "Alimento",
    "Chill Bros Scoop Shop", "Cappy's Pizza", "Taco Bell", "Chick-fil-A",
    "Starbucks", "Greenlane", "Jay Luigi", "Yogurtology", "SoFresh", "Pho 813",
  ],
  orlando: [
    "Winter Park Biscuit Co.", "Bento Asian Kitchen + Sushi", "Chick-fil-A",
    "Taco Bell", "Purple Ocean Superfood Bar", "Starbucks", "Crisp & Green",
    "Jeremiah's Italian Ice", "Caribbean Sunshine Bakery", "Mamak Asian Street Food",
  ],
};

// The owner's explicit "feature these FIRST" hero picks.
export const HERO_FIRST = [
  "Bellabrava", "Fresh Kitchen", "Naked Farmer", "Water + Flour", "Cappy's",
  "SoFresh", "Isan Thai", "AHI Sushi", "Pho 813",
  "Winter Park Biscuit", "Bento Asian Kitchen", "Purple Ocean",
  "Caribbean Sunshine Bakery", "Mamak",
];

const nameMatches = (a, b) => {
  const na = norm(baseBrand(a)), nb = norm(baseBrand(b));
  return na.length > 2 && nb.length > 2 && (na.includes(nb) || nb.includes(na));
};

export const isHeroFirst = (name) => HERO_FIRST.some((f) => nameMatches(name, f));
export function isFeaturedLocal(name, metroKey) {
  if (isChainBrand(name)) return false;
  const list = GUARANTEED[metroKey] || [];
  return list.some((g) => !isChainBrand(g) && nameMatches(name, g));
}

// guaranteedFor(metro) -> [{ name, chain }] (base brands, deduped).
export function guaranteedFor(metroKey) {
  const seen = new Set(); const out = [];
  for (const n of GUARANTEED[metroKey] || []) {
    const key = norm(baseBrand(n));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: baseBrand(n), chain: isChainBrand(n) });
  }
  return out;
}

// Which guaranteed brands are NOT yet in the pool (by name match) — the page
// resolves exactly these so every owner pick gets its card.
export function missingGuaranteed(pool, metroKey) {
  const names = (pool || []).map((p) => (p && p.name) || "");
  return guaranteedFor(metroKey).filter((g) => !names.some((n) => nameMatches(n, g.name)));
}

// Tag a place for ranking/badging: _wfFeatured (local hero -> badge),
// _wfHeroFirst (owner top pick), _wfChain (utility tier). Mutates + returns.
export function tagFeatured(place, metroKey) {
  if (!place || !place.name) return place;
  if (isChainBrand(place.name)) { place._wfChain = true; return place; }
  if (isFeaturedLocal(place.name, metroKey)) {
    place._wfFeatured = true;
    if (isHeroFirst(place.name)) place._wfHeroFirst = true;
  }
  return place;
}
