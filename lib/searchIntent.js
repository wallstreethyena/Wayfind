// lib/searchIntent.js — hand-curated search phrases.
//
// "things to do" can never match a place name. These phrases resolve to pages
// that already exist, scoped to the city the reader selected (or named). A
// selected city with no such page falls back to the nearest covered city that
// has one. The model is not involved: a known phrase never spends a request.

import { COVERED_CITIES, LANDING_CITIES, CITY_ALIASES } from "./landingCities.js";

const EDGE_FILLERS = new Set(["a", "an", "the", "in", "near", "around", "for", "me", "my", "some", "please", "just", "nearby"]);

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019'`]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLng = (bLng - aLng) * p;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function cityRecord(slug, city, source) {
  return {
    slug,
    name: city.name,
    state: city.state,
    lat: city.lat,
    lng: city.lng,
    landing: Object.prototype.hasOwnProperty.call(LANDING_CITIES, slug),
    source,
  };
}

const CITY_FORMS = Object.entries(COVERED_CITIES)
  .flatMap(([slug, city]) => {
    const names = [city.name, ...(CITY_ALIASES[slug] || [])];
    return names.map((name) => ({ slug, city, form: normalize(name) }));
  })
  .filter((row) => row.form)
  .sort((a, b) => b.form.length - a.form.length);

function nearest(table, lat, lng) {
  let best = null;
  let bestM = Infinity;
  for (const [slug, city] of Object.entries(table)) {
    const meters = haversineMeters(lat, lng, city.lat, city.lng);
    if (meters < bestM) {
      bestM = meters;
      best = cityRecord(slug, city, "nearest");
    }
  }
  return best;
}

/** The city this search is about: named in the query, else the selected point, else the home market. */
export function resolveSearchCity({ query, lat, lng } = {}) {
  const normalized = normalize(query);
  let named = null;
  let text = normalized;
  if (normalized) {
    for (const candidate of CITY_FORMS) {
      if (normalized === candidate.form || normalized.endsWith(` ${candidate.form}`) || normalized.startsWith(`${candidate.form} `) || normalized.includes(` ${candidate.form} `)) {
        named = cityRecord(candidate.slug, candidate.city, "query");
        text = normalized.split(candidate.form).join(" ").replace(/\s+/g, " ").trim();
        break;
      }
    }
  }
  // null and "" are "no point". Number(null) is 0, which would otherwise
  // snap every unset search to the city nearest 0,0.
  const coord = (value) => (value == null || String(value).trim() === "" ? NaN : Number(value));
  const pointLat = coord(lat);
  const pointLng = coord(lng);
  const hasPoint = Number.isFinite(pointLat) && Number.isFinite(pointLng) && Math.abs(pointLat) <= 90 && Math.abs(pointLng) <= 180;
  const selected = hasPoint ? nearest(COVERED_CITIES, pointLat, pointLng) : null;
  const city = named || selected || cityRecord("parrish", LANDING_CITIES.parrish, "home");
  if (!named && !selected) city.assumed = true;
  return { city, text: stripEdges(named ? text : normalized) };
}

function stripEdges(text) {
  const parts = String(text || "").split(" ").filter(Boolean);
  while (parts.length && EDGE_FILLERS.has(parts[0])) parts.shift();
  while (parts.length && EDGE_FILLERS.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

function pageCity(city) {
  if (city.landing) return { ...city, fallback: false };
  const landing = nearest(LANDING_CITIES, city.lat, city.lng);
  return { ...landing, fallback: true, selectedName: city.name, selectedSlug: city.slug };
}

function cityQuery(name) {
  return `?city=${encodeURIComponent(name)}`;
}

// Longer phrases first so "things to do with kids" does not collapse into "things to do".
const PHRASES = [
  { phrases: ["things to do with kids", "kids activities", "kid friendly", "with the kids", "with my kids"], id: "family" },
  { phrases: ["things to do", "what to do", "stuff to do", "what should i do", "activities"], id: "things-to-do" },
  { phrases: ["date night ideas", "date night", "romantic night", "night out for two"], id: "date-night" },
  { phrases: ["cheap eats", "cheap food", "budget eats", "inexpensive food", "on a budget", "cheap dinner"], id: "budget" },
  { phrases: ["rainy day ideas", "rainy day", "indoor activities", "indoor things to do", "things to do indoors"], id: "rainy" },
  { phrases: ["family fun", "family day", "for kids", "family", "kids"], id: "family" },
  { phrases: ["nightlife", "night life", "bars tonight", "night out"], id: "nightlife" },
  { phrases: ["brunch", "breakfast"], id: "brunch" },
  { phrases: ["beaches", "beach"], id: "beaches" },
  { phrases: ["halloween", "spooky", "haunted"], id: "halloween" },
  { phrases: ["coupons", "coupon", "deals", "discounts"], id: "coupons" },
  { phrases: ["what's on", "whats on", "this weekend", "events"], id: "events" },
  { phrases: ["guides", "guide"], id: "guides" },
];

const PHRASE_INDEX = PHRASES
  .flatMap((row) => row.phrases.map((phrase) => ({ phrase, id: row.id })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

function landingPath(cat, city) {
  const page = pageCity(city);
  const href = `/${cat}/${page.slug}`;
  const titleCity = page.name;
  const secondary = page.fallback
    ? `Page · nearest covered city to ${page.selectedName}`
    : `Page · ${page.name}, ${page.state}`;
  return { href, titleCity, secondary, pageSlug: page.slug, fallback: page.fallback === true };
}

function intentResult(id, city) {
  if (id === "things-to-do" || id === "rainy") {
    const page = landingPath("things-to-do", city);
    const rainy = id === "rainy";
    return {
      kind: "page",
      title: rainy ? `Rainy day in ${page.titleCity}` : `Things to do in ${page.titleCity}`,
      href: page.href,
      secondary: rainy ? `Page · indoor plans · ${page.secondary.replace(/^Page · /, "")}` : page.secondary,
      city_slug: page.pageSlug,
      fallback: page.fallback,
      lead: true,
    };
  }
  if (id === "date-night") {
    return { kind: "page", title: `Date night in ${city.name}`, href: `/date-night${cityQuery(city.name)}`, secondary: `Page · ${city.name}, ${city.state}`, city_slug: city.slug, lead: true };
  }
  if (id === "budget") {
    return { kind: "page", title: `Cheap eats in ${city.name}`, href: `/budget${cityQuery(city.name)}`, secondary: `Page · ${city.name}, ${city.state}`, city_slug: city.slug, lead: true };
  }
  if (id === "family") {
    return { kind: "page", title: `Family things to do in ${city.name}`, href: `/family${cityQuery(city.name)}`, secondary: `Page · ${city.name}, ${city.state}`, city_slug: city.slug, lead: true };
  }
  if (id === "nightlife") {
    const page = landingPath("nightlife", city);
    return { kind: "page", title: `Nightlife in ${page.titleCity}`, href: page.href, secondary: page.secondary, city_slug: page.pageSlug, fallback: page.fallback, lead: true };
  }
  if (id === "brunch") {
    const page = landingPath("restaurants", city);
    return { kind: "page", title: `Brunch in ${page.titleCity}`, href: page.href, secondary: `Page · breakfast and brunch · ${page.titleCity}`, city_slug: page.pageSlug, fallback: page.fallback, lead: true };
  }
  if (id === "beaches") {
    const page = landingPath("beaches", city);
    return { kind: "page", title: `Beaches in ${page.titleCity}`, href: page.href, secondary: page.secondary, city_slug: page.pageSlug, fallback: page.fallback, lead: true };
  }
  if (id === "halloween") {
    return { kind: "page", title: "Halloween in Florida", href: "/halloween-in-florida", secondary: `Page · Halloween${city ? ` · ${city.name}` : ""}`, city_slug: city && city.slug, lead: true };
  }
  if (id === "coupons") {
    return { kind: "page", title: `Coupons in ${city.name}`, href: "/coupons", secondary: `Coupon · ${city.name}, ${city.state}`, city_slug: city.slug, lead: true };
  }
  if (id === "events") {
    const page = pageCity(city);
    return { kind: "page", title: `Events in ${page.name}`, href: `/events/${page.slug}/this-weekend`, secondary: page.fallback ? `Event · nearest covered city to ${page.selectedName}` : `Event · ${page.name}, ${page.state}`, city_slug: page.slug, fallback: page.fallback, lead: true };
  }
  if (id === "guides") {
    return { kind: "page", title: "Wayfind guides", href: "/guides", secondary: "Guide", lead: true };
  }
  return null;
}

/**
 * Exact phrase only, after the city and edge filler words are peeled off.
 * Returns { recognized, phrase, result } . `result` is null when the query is not a known phrase.
 */
export function resolveSearchIntent(query, { lat, lng } = {}) {
  const { city, text } = resolveSearchCity({ query, lat, lng });
  const hit = PHRASE_INDEX.find((row) => row.phrase === text);
  if (!hit) return { recognized: false, phrase: null, city, result: null };
  const result = intentResult(hit.id, city);
  return { recognized: !!result, phrase: hit.phrase, city, result };
}

export const SEARCH_INTENT_PHRASES = Object.freeze(PHRASE_INDEX.map((row) => row.phrase));
