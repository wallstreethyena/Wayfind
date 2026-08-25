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
// v8.31.2 — TWO DEFECTS, both measured on the live Parrish rail 2026-08-22.
//
//   1. `papa john` could never match "Papa Johns Pizza". The alternation ends in
//      `)\b`, so the trailing `s` in the brand's own name broke the boundary and
//      the biggest pizza chain in America read as a local independent. Every
//      brand whose real-world name carries a possessive/plural now spells it.
//   2. The list was written for the Order In page, where its job is to demote a
//      chain below the local brands. `gems` ("Places You'd Never Find") now uses
//      it as a VETO, which is a stricter job: a chain that is merely missing from
//      the list is not demoted there, it is presented as a hidden gem. Papa
//      Johns was ranked 7th on "Places You'd Never Find" near Parrish. The list
//      is therefore extended to the national sit-down, fast-casual and dessert
//      brands the original never needed to name.
//
// Still ONE list, deliberately — lib/quickService.js's "one rule, both surfaces"
// discipline. A brand added for either surface is correct for the other: a
// national chain is neither the local hero on Order In nor a place you would
// never find.
const CHAIN_RE = /\b(mcdonald|taco bell|chick[\s-]?fil[\s-]?a|starbucks|crumbl|pdq|crisp\s?&?\s?green|jeremiah'?s?|wendy|burger king|kfc\b|popeye|subway|domino|pizza hut|papa john'?s?|marco'?s pizza|hungry howie|dunkin|chipotle|qdoba|panera|five guys|checkers|culver|whataburger|firehouse subs|jersey mike|moe'?s southwest|steak\s?'?n\s?shake|sonic\b|arby|dairy queen|little caesar|wingstop|zaxby|7 ?brew|dutch bros|scooter'?s coffee|tropical smoothie|smoothie king|panda express|pollo tropical|sweetgreen|first watch|keke'?s|bob evans|cracker barrel|ihop\b|denny'?s|waffle house|outback steakhouse|carrabba'?s|bonefish grill|longhorn steakhouse|texas roadhouse|olive garden|red lobster|applebee'?s|chili'?s|tgi ?friday|buffalo wild wings|twin peaks|hooters|ruth'?s chris|fleming'?s prime|mcalister'?s|insomnia cookies|nothing bundt cakes|cold stone|baskin[\s-]?robbins|menchie'?s|ben ?& ?jerry)\b/i;
// Google returns typographic apostrophes ("Fleming’s", "Peggy’s", "Culver’s"), so a
// pattern written with the ASCII ' silently missed half the brands it names. Fold
// both to ' before testing; the regex stays readable and matches reality.
export const isChainBrand = (name) => CHAIN_RE.test(String(name || "").replace(/[‘’ʼ]/g, "'"));

// The metros the curation covers. Rough centers for nearest-metro detection.
//
// v8.13.2 (owner screenshot from Parrish, 2026-08-18: "the coupons — they are
// all gone", /coupons rendering "All deals · 0"): each metro now ALSO carries
// `anchors` — real satellite towns nearestMetro() measures against alongside
// the centroid. WHY: a single-centroid straight-line model ignores Tampa Bay.
// Parrish is in MANATEE COUNTY, 11mi by land from Bradenton — but its
// straight-line-nearest centroid was St. Petersburg, ACROSS THE BAY, so a
// Parrish reader was "stpete" for every metro-gated surface (coupons, Order
// In, partner picks). Every live Sarasota/Bradenton coupon was geo-gated away
// from the exact person living nearest them, and with the St. Pete Clipp
// harvest expired, the page honestly — and absurdly — served zero. Reproduced
// on the call before this fix: dealTiers(COUPONS, today, Parrish) => 0/0
// while Bradenton's Marauders offer sat live 11 miles away.
// Anchors are DRIVING-coherent points on the same side of the bay; adding one
// can only widen a metro toward its own satellites, never across water,
// because the other metro's own anchors stay closer for its own residents.
// scripts/test-coupon-geo.mjs proves table/viewer agreement per town on the
// REAL resolvers.
export const METROS = {
  sarasota: { label: "Sarasota", lat: 27.3364, lng: -82.5307,
    anchors: [{ lat: 27.4989, lng: -82.5748 }, { lat: 27.4436, lng: -82.3959 }, { lat: 27.0998, lng: -82.4543 }] }, // Bradenton, Lakewood Ranch, Venice
  stpete: { label: "St. Petersburg", lat: 27.7676, lng: -82.6403,
    anchors: [{ lat: 27.9659, lng: -82.8001 }] }, // Clearwater
  tampa: { label: "Tampa", lat: 27.9506, lng: -82.4572,
    anchors: [{ lat: 27.9378, lng: -82.2859 }, { lat: 27.8661, lng: -82.3265 }] }, // Brandon, Riverview (the east-shore corridor Ruskin actually drives)
  orlando: { label: "Orlando", lat: 28.5384, lng: -81.3789,
    anchors: [{ lat: 28.2919, lng: -81.4076 }] }, // Kissimmee
  // 2026-08-25 — added with the Coconut Grove partnership's first merchant
  // deal (Barracuda's Bottles & Beats). South Florida deals were UNPLACEABLE
  // before this (the NYC problem documented in lib/partnerDeals.js) even
  // though the Grove partner sheet already geo-gates there. No GUARANTEED
  // roster yet: every read is `GUARANTEED[k] || []`, so Miami Order-In stays
  // organic-only until the owner supplies picks.
  miami: { label: "Miami", lat: 25.7617, lng: -80.1918,
    anchors: [{ lat: 25.7272, lng: -80.2578 }, { lat: 26.1224, lng: -80.1373 }] }, // Coconut Grove, Fort Lauderdale
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
    // Nearest of the centroid AND the metro's anchors (see the METROS note:
    // the single-centroid model put Parrish "in" St. Petersburg across Tampa
    // Bay, hiding its own Bradenton coupons from it).
    const pts = [m, ...(m.anchors || [])];
    for (const p of pts) {
      const d = metroDistMi(lat, lng, p.lat, p.lng);
      if (d < bestD) { bestD = d; best = k; }
    }
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
