// lib/locationHonesty.js — the visitor's city is never guessed.
//
// THE BUGS THIS EXISTS FOR (2026-08-18):
//   • SSR HomeProof said "Near Sarasota right now" on every URL, including
//     /?near=Orlando and /?q=Orlando, because the homepage is one prerendered
//     document and the proof block hardcoded the flagship.
//   • An unknown rail slug, or /api/rails returning covered:false / error,
//     fail-opened to LANDING_CITIES.sarasota — so a Tampa search kept
//     Sarasota places and Sarasota distances.
//   • DEFAULT_CENTER (Parrish) was a real React state value, so
//     setCenter((prev) => prev || geo) could never replace the seed, and
//     chrome said "near you" with no named city.
//
// A city is named or it is not. There is no third state that is allowed to
// print "you", "near you", "around you", or a flagship town.

export const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };

const NOT_A_CITY = new Set([
  "",
  "you",
  "your area",
  "this area",
  "this map area",
  "near you",
  "around you",
]);

/** The map seed is a pin, not a visitor. Same coords after geo/GPS/manual are resolved. */
export function isSeedCenter(c) {
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return true;
  return Math.abs(c.lat - DEFAULT_CENTER.lat) < 1e-5 && Math.abs(c.lng - DEFAULT_CENTER.lng) < 1e-5;
}

/** A label the product may print as the visitor's city. */
export function isNamedCity(locName) {
  if (locName == null) return false;
  const raw = String(locName).trim();
  if (!raw) return false;
  const head = raw.split(",")[0].trim();
  if (!head) return false;
  if (NOT_A_CITY.has(head.toLowerCase()) || NOT_A_CITY.has(raw.toLowerCase())) return false;
  if (/^(near|around)\s+you\b/i.test(head)) return false;
  return /[a-z]/i.test(head);
}

/** First token of a real city name, or "". Never "you". */
export function cityLabel(locName) {
  if (!isNamedCity(locName)) return "";
  return String(locName).split(",")[0].trim();
}

/**
 * " near Tampa" or "". The only legal way to attach a location claim to a
 * phrase. Callers that interpolated "near you" when locName was empty use this.
 */
export function nearPhrase(locName) {
  const city = cityLabel(locName);
  return city ? ` near ${city}` : "";
}

/**
 * An unknown / missing LANDING_CITIES slug is not Sarasota. The flagship is
 * a market we cover, not the visitor's city.
 */
export function resolveRailCity(slug, landingCities) {
  if (!slug || typeof slug !== "string") return null;
  if (!landingCities || typeof landingCities !== "object") return null;
  return landingCities[slug] ? slug : null;
}

export function emptyRailLive() {
  return {
    places: {},
    thin: [],
    region: null,
    citySlug: null,
    cityLabel: "",
    covered: false,
  };
}

/**
 * /api/rails payload → client live state. covered:false, errors, and missing
 * data become an honest empty. They do not keep a previous city's places.
 */
export function liveFromRailsResponse(j) {
  if (!j || j.covered !== true || !j.data) return emptyRailLive();
  const d = j.data;
  // v8.33.1 — REHYDRATE THE DEDUPED WIRE. With no card ceiling a Sarasota
  // response carries 1,885 rows over about 450 distinct places, because `eat`,
  // `best`, `today` and `datenight` legitimately share restaurants and each was
  // shipping a full copy. v=2 sends each place once in `placeIndex` and each
  // rail as ids; this rebuilds the exact arrays the rest of the app expects, in
  // the same order. A v1 response (an old CDN entry, or a client that did not
  // ask for v=2) has no placeIndex and passes through untouched — which is what
  // makes the rollout safe in both directions.
  const idx = d.placeIndex && typeof d.placeIndex === "object" ? d.placeIndex : null;
  let places = d.places && typeof d.places === "object" ? d.places : {};
  if (idx) {
    const rebuilt = {};
    for (const [railId, list] of Object.entries(places)) {
      rebuilt[railId] = (Array.isArray(list) ? list : [])
        .map((x) => (typeof x === "string" ? idx[x] : x))
        .filter(Boolean);
    }
    places = rebuilt;
  }
  return {
    places,
    thin: Array.isArray(d.thin) ? d.thin : [],
    region: d.region || null,
    citySlug: d.citySlug || null,
    cityLabel: d.cityLabel ? String(d.cityLabel) : "",
    covered: true,
  };
}

/**
 * The shared ISR homepage must not name a city in its proof block. ?near= and
 * ?q= cannot city-swap that document safely, so the heading is city-neutral
 * for every request — including /?near=Orlando and /?q=Orlando.
 */
const LANDING_NAME_TO_SLUG = {
  orlando: "orlando",
  miami: "miami",
  tampa: "tampa",
  sarasota: "sarasota",
  bradenton: "bradenton",
  parrish: "parrish",
  ellenton: "ellenton",
  palmetto: "palmetto",
  venice: "venice",
  cortez: "cortez",
  honolulu: "honolulu",
  kailua: "kailua",
  lahaina: "lahaina",
  kihei: "kihei",
  hilo: "hilo",
  lihue: "lihue",
  kapaa: "kapaa",
  "siesta key": "siesta-key",
  "longboat key": "longboat-key",
  "lakewood ranch": "lakewood-ranch",
  "anna maria island": "anna-maria-island",
  "kailua kona": "kailua-kona",
  "kailua-kona": "kailua-kona",
};

/** Named city → LANDING_CITIES slug. Unknown cities return null — never Sarasota. */
export function landingSlugFromLoc(locName) {
  const city = cityLabel(locName).toLowerCase();
  if (!city) return null;
  if (LANDING_NAME_TO_SLUG[city]) return LANDING_NAME_TO_SLUG[city];
  const slug = city.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return LANDING_NAME_TO_SLUG[slug] || null;
}

export function homeProofCopy(_searchParams) {
  return {
    kicker: "What Wayfind answers with",
    heading: "A short ranked answer — not fifty options",
    sub: "Ranked by rating weighted by review volume, distance, and what's genuinely worth the time — no ads, no paid placement. The in-app answer adapts to the location on the page, the weather, and the time of day.",
  };
}

export function homeProofNamesCity(searchParams) {
  const copy = homeProofCopy(searchParams);
  return /\b(Sarasota|Orlando|Tampa|Parrish|Bradenton)\b/i.test(
    `${copy.kicker} ${copy.heading} ${copy.sub}`
  );
}

// ── One LocationContext per navigation (WF-001) ────────────────────────────
// Route/query city is authoritative for that URL. Stored coords may fill
// only when they belong to the SAME named city. A leftover Boston pin
// cannot rank organic places under a New York heading.
//
// CITY_ORIGINS are ranking pins, not landing markets. NY/Boston exist so a
// URL city can rank without borrowing another city's coords. They are NOT
// added to LANDING_CITIES and they do not mint /restaurants/new-york pages.

const CITY_ALIASES = {
  nyc: "new york",
  "new york city": "new york",
  "new york": "new york",
};

const CITY_ORIGINS = {
  orlando: { lat: 28.5384, lng: -81.3789 },
  miami: { lat: 25.7617, lng: -80.1918 },
  tampa: { lat: 27.9506, lng: -82.4572 },
  sarasota: { lat: 27.3364, lng: -82.5307 },
  bradenton: { lat: 27.4989, lng: -82.5748 },
  parrish: { lat: 27.5859, lng: -82.4254 },
  ellenton: { lat: 27.5217, lng: -82.5273 },
  palmetto: { lat: 27.5214, lng: -82.5723 },
  venice: { lat: 27.0998, lng: -82.4543 },
  cortez: { lat: 27.4689, lng: -82.6867 },
  honolulu: { lat: 21.3069, lng: -157.8583 },
  kailua: { lat: 21.4022, lng: -157.7394 },
  lahaina: { lat: 20.8783, lng: -156.6825 },
  kihei: { lat: 20.7644, lng: -156.445 },
  hilo: { lat: 19.7071, lng: -155.0885 },
  lihue: { lat: 21.9811, lng: -159.3711 },
  kapaa: { lat: 22.075, lng: -159.319 },
  "siesta-key": { lat: 27.2665, lng: -82.546 },
  "longboat-key": { lat: 27.4125, lng: -82.659 },
  "lakewood-ranch": { lat: 27.4438, lng: -82.3929 },
  "anna-maria-island": { lat: 27.5309, lng: -82.734 },
  "kailua-kona": { lat: 19.64, lng: -155.9969 },
  "new york": { lat: 40.7128, lng: -74.0060 },
  boston: { lat: 42.3601, lng: -71.0589 },
};

const GULF_BEACH_SLUGS = new Set([
  "sarasota", "bradenton", "parrish", "ellenton", "palmetto", "venice",
  "cortez", "siesta-key", "longboat-key", "lakewood-ranch", "anna-maria-island",
]);

export function cityKey(locName) {
  const city = cityLabel(locName).toLowerCase();
  if (!city) return "";
  if (CITY_ALIASES[city]) return CITY_ALIASES[city];
  const slug = city.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return CITY_ALIASES[slug] || city;
}

export function sameCity(a, b) {
  const ka = cityKey(a);
  const kb = cityKey(b);
  return !!ka && ka === kb;
}

export function originForCity(locName) {
  const key = cityKey(locName);
  if (!key) return null;
  if (CITY_ORIGINS[key]) return { lat: CITY_ORIGINS[key].lat, lng: CITY_ORIGINS[key].lng };
  const slug = landingSlugFromLoc(locName);
  if (slug && CITY_ORIGINS[slug]) return { lat: CITY_ORIGINS[slug].lat, lng: CITY_ORIGINS[slug].lng };
  return null;
}

// ── THE PAIRING LAW (v8.46, 2026-08-23) ────────────────────────────────────
// `center` and `locName` are two INDEPENDENT useState values in app/home.js,
// written from thirteen call sites, several of them across an `await`. Nothing
// ever tied them together, so a label from one city could sit on coordinates
// from another — and the coordinates are what ranks.
//
// MEASURED ON THE OWNER'S OWN BROWSER (2026-08-23), localStorage.wf_center:
//   { lat: 35.2619678, lng: -81.126481, loc: "Parrish, FL", manual: true }
// That point is outside Gastonia, NORTH CAROLINA, wearing the name of a town
// in Florida 570 miles away. /api/geo answered "Parrish, FL" (27.5875,
// -82.4251) and device GPS answered 27.620,-82.411 — both right — while the
// stored pin stayed in NC. /api/rails for the NC point answers covered:false,
// so every rail drop on the homepage came back empty under a "Parrish"
// heading, and the reader saw loading skeletons that could never resolve.
//
// The two guards that produced it were in ipFallback: the center only moved
// when it was still the seed (`isSeedCenter(prev) ? c : prev`) while the name
// took the IP answer whenever it was blank (`prev || d.name`). Different
// conditions on the two halves of ONE fact — so the halves could disagree.
const R_MI = 3958.8;
function _milesBetween(aLat, aLng, bLat, bLng) {
  const r = (d) => (d * Math.PI) / 180;
  const s = Math.sin(r(bLat - aLat) / 2) ** 2
    + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return R_MI * 2 * Math.asin(Math.sqrt(s));
}

/** Miles between two points, or NaN when either is not a real point. */
export function milesBetween(a, b) {
  if (!a || !b) return NaN;
  const aLat = Number(a.lat), aLng = Number(a.lng), bLat = Number(b.lat), bLng = Number(b.lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return NaN;
  return _milesBetween(aLat, aLng, bLat, bLng);
}

/**
 * Do these coordinates and this label describe the same place?
 *
 * TRUE when they agree, and also when we simply cannot tell: a label we hold
 * no pin for (Gulfport is a real town; CITY_ORIGINS has no entry) is not
 * evidence of corruption, and this law must never throw away a good location
 * on a hunch. FALSE only when we DO hold a pin for the named city and the
 * coordinates are more than `maxMi` from it — a pair that cannot both be true.
 *
 * 40 miles is deliberately generous: it holds a whole metro (Parrish to
 * Sarasota is 19mi, Ellenton to Venice is 33mi) so an honest neighbouring-town
 * pin is never discarded, while a cross-state pin like the one above (570mi)
 * cannot survive.
 */
/** The threshold the pairing law uses, exported so an inline script can state it. */
export const PAIRING_MAX_MI = 40;

/**
 * The city pins, slug-keyed and rounded, for a PRE-HYDRATION INLINE SCRIPT that
 * cannot import this module (app/layout.js's /api/events primer reads
 * wf_center before React exists). Interpolated, never retyped — the same rule
 * the rail-collapse script beside it follows, so the table cannot drift from
 * the law it is a copy of.
 *
 * WHY THE PRIMER NEEDS IT. `city` is not decoration on that request: it is part
 * of the server's cache key AND it is the literal text query two event
 * providers run ("events in " + city). The owner's corrupt pair therefore asked
 * Google for "events in Parrish, FL" while the geo providers searched North
 * Carolina, blended the two into one payload, and cached it for that cell.
 *
 * 3 decimals is ~100m — far finer than a 40-mile test needs, and it keeps the
 * inline table small.
 */
export function cityOriginsWire() {
  const out = {};
  for (const [key, c] of Object.entries(CITY_ORIGINS)) {
    out[key.replace(/[^a-z0-9]+/g, "-")] = [Math.round(c.lat * 1000) / 1000, Math.round(c.lng * 1000) / 1000];
  }
  return out;
}

export function centerAgreesWithLabel(center, locName, maxMi = PAIRING_MAX_MI) {
  if (!center || !Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng))) return false;
  const origin = originForCity(locName);
  if (!origin) return true; // unknown town — nothing to contradict
  const mi = milesBetween({ lat: Number(center.lat), lng: Number(center.lng) }, origin);
  return Number.isFinite(mi) ? mi <= maxMi : true;
}

/**
 * Immutable location for one navigation. URL city wins. Stored coords
 * cannot silently override organic ranking for a different city.
 */
export function resolveLocationContext({ urlCity, urlLat, urlLng, stored } = {}) {
  const namedUrl = isNamedCity(urlCity) ? cityLabel(urlCity) : "";
  const urlHasCoords = Number.isFinite(Number(urlLat)) && Number.isFinite(Number(urlLng));
  const storedOk = stored && Number.isFinite(Number(stored.lat)) && Number.isFinite(Number(stored.lng));

  if (namedUrl) {
    if (urlHasCoords) {
      return Object.freeze({ city: namedUrl, lat: Number(urlLat), lng: Number(urlLng), source: "url" });
    }
    if (storedOk && sameCity(stored.loc, namedUrl)) {
      return Object.freeze({ city: namedUrl, lat: Number(stored.lat), lng: Number(stored.lng), source: "url+stored-same" });
    }
    const origin = originForCity(namedUrl);
    if (origin) {
      return Object.freeze({ city: namedUrl, lat: origin.lat, lng: origin.lng, source: "url+origin" });
    }
    return Object.freeze({ city: namedUrl, lat: NaN, lng: NaN, source: "url-city-only" });
  }

  if (storedOk && isNamedCity(stored.loc)) {
    return Object.freeze({ city: cityLabel(stored.loc), lat: Number(stored.lat), lng: Number(stored.lng), source: "stored" });
  }
  if (urlHasCoords) {
    return Object.freeze({ city: "", lat: Number(urlLat), lng: Number(urlLng), source: "url-coords" });
  }
  if (storedOk) {
    return Object.freeze({ city: "", lat: Number(stored.lat), lng: Number(stored.lng), source: "stored-coords" });
  }
  return Object.freeze({ city: "", lat: NaN, lng: NaN, source: "none" });
}

/** Heading, ranking origin, weather, offers, and generated links share ONE city. */
export function locationSurface(ctx) {
  const city = ctx && isNamedCity(ctx.city) ? cityLabel(ctx.city) : "";
  const q = city ? "?city=" + encodeURIComponent(city) : "";
  return Object.freeze({
    headingCity: city || "your town",
    resultsOrigin: Object.freeze({ lat: ctx ? ctx.lat : NaN, lng: ctx ? ctx.lng : NaN }),
    weatherOrigin: Object.freeze({ lat: ctx ? ctx.lat : NaN, lng: ctx ? ctx.lng : NaN }),
    offersCity: city,
    links: Object.freeze({
      bestOf: "/best-of" + q,
    }),
  });
}

/** Real BEACH_METROS key for a named landing slug, or null. Never invents Sarasota. */
export function beachMetroForCity(citySlug) {
  if (!citySlug) return null;
  if (citySlug === "orlando" || citySlug === "tampa") return citySlug;
  if (GULF_BEACH_SLUGS.has(citySlug)) return "manatee-sarasota";
  return null;
}

/**
 * Category / promo href for a named city. Unknown cities (NY, Boston, empty)
 * return null — never /restaurants/sarasota. Flagship slugs only when the
 * named city actually is that city.
 */
export function categoryNavHref(kind, locName) {
  const slug = landingSlugFromLoc(locName);
  if (!slug) return null;
  if (kind === "restaurants") return "/restaurants/" + slug;
  if (kind === "things-to-do") return "/things-to-do/" + slug;
  if (kind === "nightlife") return "/nightlife/" + slug;
  if (kind === "beaches") return "/beaches/" + slug;
  if (kind === "best-beaches") {
    const metro = beachMetroForCity(slug);
    return metro ? "/best-beaches/" + metro : null;
  }
  return null;
}

export function categoryNavHrefs(locName) {
  return ["restaurants", "things-to-do", "nightlife", "beaches", "best-beaches"]
    .map((k) => categoryNavHref(k, locName))
    .filter(Boolean);
}

export function placePath(id) {
  if (id == null) return null;
  const s = String(id).trim();
  if (!s) return null;
  return "/p/" + encodeURIComponent(s);
}

export function placeCanonical(id, siteUrl) {
  const path = placePath(id);
  if (!path) return null;
  return String(siteUrl || "").replace(/\/+$/, "") + path;
}

export function bestOfCanonical(city, siteUrl) {
  const base = String(siteUrl || "").replace(/\/+$/, "") + "/best-of";
  const c = cityLabel(city);
  return c ? base + "?city=" + encodeURIComponent(c) : base;
}

/**
 * Origin for the first /api/rails request. This is NOT the visitor's city.
 *
 * `center` in app/home.js still starts null (DEFAULT_CENTER is a seed, not a
 * visitor). DaypartRail used to wait for locResolved (GPS / manual / /api/geo
 * at 2.5s) before it received any point, so the owner's iPhone sat on
 * LOAD_PENDING while /api/rails for Parrish was already healthy.
 *
 * A resolved visitor point always wins. Otherwise use an already-inlined
 * events-primer, a pairing-valid stored pin, or DEFAULT_CENTER so the fetch
 * starts at first paint. When real GPS arrives the caller passes that point
 * and the rail refetches. covered:false still empties — this helper never
 * names a city.
 */
export function firstPaintRailOrigin({ resolved = null, locResolved = false, prime = null, stored = null } = {}) {
  if (locResolved && resolved && Number.isFinite(+resolved.lat) && Number.isFinite(+resolved.lng)) {
    return { lat: +resolved.lat, lng: +resolved.lng };
  }
  if (prime && Number.isFinite(+prime.lat) && Number.isFinite(+prime.lng)) {
    return { lat: +prime.lat, lng: +prime.lng };
  }
  if (stored && Number.isFinite(+stored.lat) && Number.isFinite(+stored.lng)
      && centerAgreesWithLabel({ lat: +stored.lat, lng: +stored.lng }, stored.loc)) {
    return { lat: +stored.lat, lng: +stored.lng };
  }
  return { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng };
}
