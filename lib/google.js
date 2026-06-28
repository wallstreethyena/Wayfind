"use client";
import { Loader } from "@googlemaps/js-api-loader";

// One shared loader for the whole app.
let loader;
export function getLoader() {
  if (!loader) {
    loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
      version: "weekly",
    });
  }
  return loader;
}

// Top-level categories. Each has a plain-language query Google understands.
export const CATEGORIES = [
  { id: "food", label: "🍽️ Food", query: "best restaurants" },
  { id: "nightlife", label: "🍸 Nightlife", query: "best bars and nightlife" },
  { id: "attractions", label: "🎯 Activities", query: "top tourist attractions" },
  { id: "beach", label: "🏖️ Beach", query: "best beaches" },
  { id: "hotels", label: "🏨 Hotels", query: "best hotels" },
  { id: "shopping", label: "🛍️ Shopping", query: "best shopping" },
];

// Sub-filters per category. Each runs a real, targeted Google text search.
export const SUBFILTERS = {
  food: [
    { id: "all", label: "All", query: "best restaurants" },
    { id: "breakfast", label: "Breakfast", query: "best breakfast and brunch" },
    { id: "lunch", label: "Lunch", query: "best lunch spots" },
    { id: "dinner", label: "Dinner", query: "best dinner restaurants" },
    { id: "coffee", label: "Coffee", query: "best coffee shops and cafes" },
  ],
  nightlife: [
    { id: "all", label: "All", query: "best bars and nightlife" },
    { id: "clubs", label: "Clubs", query: "nightclubs" },
    { id: "cocktails", label: "Cocktails", query: "best cocktail bars" },
    { id: "karaoke", label: "Karaoke", query: "karaoke bars" },
    { id: "sports", label: "Sports Bars", query: "sports bars" },
    { id: "music", label: "Live Music", query: "live music bars and venues" },
  ],
  attractions: [
    { id: "all", label: "All", query: "top tourist attractions" },
    { id: "outdoors", label: "Outdoors", query: "parks and outdoor attractions" },
    { id: "museums", label: "Museums", query: "museums and galleries" },
    { id: "family", label: "Family", query: "family friendly attractions" },
    { id: "tours", label: "Tours", query: "tours and sightseeing" },
  ],
  hotels: [
    { id: "all", label: "All", query: "best hotels" },
    { id: "luxury", label: "Luxury", query: "luxury hotels" },
    { id: "budget", label: "Budget", query: "affordable hotels" },
    { id: "beach", label: "Beach", query: "beach resorts and hotels" },
  ],
  shopping: [
    { id: "all", label: "All", query: "best shopping" },
    { id: "malls", label: "Malls", query: "shopping malls" },
    { id: "boutiques", label: "Boutiques", query: "boutique shops" },
    { id: "markets", label: "Markets", query: "markets and outlets" },
  ],
};

// Resolve the right search text for a category + sub-filter combo.
export function queryFor(catId, subId) {
  const subs = SUBFILTERS[catId];
  if (subs) {
    const s = subs.find((x) => x.id === subId);
    if (s) return s.query;
  }
  const cat = CATEGORIES.find((c) => c.id === catId);
  return cat ? cat.query : "best places";
}

// Third-tier vibe / occasion modifiers. Each prepends a real keyword to the
// search so results actually match. These are searches, not invented labels.
export const VIBES = {
  food: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "romantic", label: "Romantic", q: "romantic" },
    { id: "quick", label: "Quick bite", q: "quick casual" },
    { id: "family", label: "Family", q: "family friendly" },
    { id: "outdoor", label: "Outdoor", q: "outdoor patio" },
    { id: "upscale", label: "Upscale", q: "upscale fine dining" },
    { id: "cheap", label: "Cheap eats", q: "cheap" },
  ],
  nightlife: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "date", label: "Date night", q: "romantic date" },
    { id: "rooftop", label: "Rooftop", q: "rooftop" },
    { id: "dance", label: "Dancing", q: "dance" },
    { id: "chill", label: "Chill", q: "low key chill" },
    { id: "dive", label: "Dive", q: "dive" },
  ],
  attractions: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "outdoor", label: "Outdoor", q: "outdoor" },
    { id: "indoor", label: "Indoor", q: "indoor" },
    { id: "family", label: "Family", q: "family friendly" },
    { id: "free", label: "Free", q: "free" },
    { id: "date", label: "Date", q: "romantic date" },
  ],
  hotels: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "pool", label: "Pool", q: "with pool" },
    { id: "romantic", label: "Romantic", q: "romantic" },
    { id: "family", label: "Family", q: "family friendly" },
    { id: "pet", label: "Pet friendly", q: "pet friendly" },
  ],
  shopping: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "boutique", label: "Boutique", q: "boutique" },
    { id: "outlet", label: "Outlet", q: "outlet" },
    { id: "vintage", label: "Vintage", q: "vintage thrift" },
    { id: "local", label: "Local", q: "local independent" },
  ],
};

export function vibeFor(catId, vibeId) {
  const v = (VIBES[catId] || []).find((x) => x.id === vibeId);
  return v ? v.q : "";
}

const PRICE = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

// Turn a city name typed by the user into coordinates.
export async function geocodeCity(query) {
  const { Geocoder } = await getLoader().importLibrary("geocoding");
  const geocoder = new Geocoder();
  const res = await geocoder.geocode({ address: query });
  const results = res?.results || [];
  if (!results.length) return null;
  const r = results[0];
  return {
    name: r.formatted_address,
    lat: r.geometry.location.lat(),
    lng: r.geometry.location.lng(),
  };
}

// Reverse a lat/lng (from device GPS) into a readable place name.
export async function reverseGeocode(lat, lng) {
  try {
    const { Geocoder } = await getLoader().importLibrary("geocoding");
    const geocoder = new Geocoder();
    const res = await geocoder.geocode({ location: { lat, lng } });
    const results = res?.results || [];
    // Walk every result looking for city + state. Never return a street address.
    for (const r of results) {
      const comps = r.address_components || [];
      const city = comps.find((c) => c.types.includes("locality"))?.long_name;
      const state = comps.find((c) => c.types.includes("administrative_area_level_1"))?.short_name;
      if (city && state) return `${city}, ${state}`;
      if (city) return city;
    }
    // Last resort: township or county
    const area = results.find((r) =>
      r.types.some((t) => ["administrative_area_level_3", "administrative_area_level_2", "neighborhood", "sublocality"].includes(t))
    );
    if (area) {
      const comps = area.address_components || [];
      const name = comps.find((c) =>
        c.types.some((t) => ["administrative_area_level_3", "locality", "neighborhood"].includes(t))
      )?.long_name;
      if (name) return name;
    }
    return "";
  } catch {
    return "";
  }
}

// Turn Google's attribute booleans into short, honest labels.
function attrLabels(p) {
  const A = [];
  const add = (c, l) => { if (c) A.push(l); };
  add(p.outdoorSeating, "Outdoor seating");
  add(p.liveMusic, "Live music");
  add(p.servesCocktails, "Cocktails");
  add(p.servesBeer, "Beer");
  add(p.servesWine, "Wine");
  add(p.servesCoffee, "Coffee");
  add(p.servesBreakfast, "Breakfast");
  add(p.servesBrunch, "Brunch");
  add(p.servesVegetarianFood, "Vegetarian options");
  add(p.servesDessert, "Dessert");
  add(p.reservable, "Takes reservations");
  add(p.goodForGroups, "Good for groups");
  add(p.goodForWatchingSports, "Good for sports");
  add(p.goodForChildren, "Kid friendly");
  add(p.menuForChildren, "Kids menu");
  add(p.allowsDogs, "Dog friendly");
  add(p.takeout, "Takeout");
  add(p.delivery, "Delivery");
  add(p.dineIn, "Dine-in");
  add(p.curbsidePickup, "Curbside");
  add(p.restroom, "Restroom");
  if (p.parkingOptions) {
    const po = p.parkingOptions;
    if (po.freeParkingLot || po.freeStreetParking) A.push("Free parking");
    else if (po.paidParkingLot || po.paidStreetParking || po.valetParking) A.push("Paid parking");
  }
  if (p.accessibilityOptions) {
    const ao = p.accessibilityOptions;
    if (ao.wheelchairAccessibleEntrance || ao.wheelchairAccessibleSeating || ao.wheelchairAccessibleRestroom) A.push("Wheelchair accessible");
  }
  return A;
}

// A transparent 0 to 100 Wayfind score: the star rating, weighted up as more
// people rate it (so a 4.7 with thousands of reviews beats a 4.7 with five).
function wayfindScore(rating, reviews) {
  if (!rating) return null;
  // Bayesian (IMDB-style) average: pull places with few reviews toward a
  // baseline mean, so a 5.0 from a handful of reviews cannot outrank a proven
  // 4.6 with thousands. m is how many reviews it takes to trust the average.
  const m = 60;
  const C = 3.9;
  const v = reviews || 0;
  const bayes = (v / (v + m)) * rating + (m / (v + m)) * C;
  return Math.round((bayes / 5) * 100);
}

const PRICE_NUM = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Compute whether a place is open right now from its regular hours and the
// place's UTC offset. The new Places API no longer exposes a simple openNow
// boolean, so we derive it. Returns true, false, or null if unknown.
function openNowFrom(oh, utcOffsetMinutes) {
  try {
    if (!oh || !oh.periods || !oh.periods.length || utcOffsetMinutes == null) return null;
    // Place local wall-clock: shift epoch by the offset, then read UTC parts.
    const d = new Date(Date.now() + utcOffsetMinutes * 60000);
    const cur = d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes();
    for (const per of oh.periods) {
      const o = per.open;
      if (!o) continue;
      const c = per.close;
      if (!c) return true; // open with no close = 24 hours
      const oMin = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
      const cMin = c.day * 1440 + (c.hour || 0) * 60 + (c.minute || 0);
      if (oMin === cMin) return true; // 24/7
      if (oMin < cMin) {
        if (cur >= oMin && cur < cMin) return true;
      } else {
        // Period wraps across the week boundary (e.g. Sat night into Sun).
        if (cur >= oMin || cur < cMin) return true;
      }
    }
    return false;
  } catch {
    return null;
  }
}

function nextOpenInfo(oh, utcOffsetMinutes) {
  try {
    if (!oh || !oh.periods || !oh.periods.length || utcOffsetMinutes == null) return null;
    const d = new Date(Date.now() + utcOffsetMinutes * 60000);
    const curDay = d.getUTCDay();
    const cur = curDay * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes();
    let best = null;
    for (const per of oh.periods) {
      const o = per.open;
      if (!o) continue;
      const oMin = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
      const delta = (oMin - cur + 10080) % 10080;
      if (delta === 0) continue;
      if (best === null || delta < best.delta) best = { delta, day: o.day, hour: o.hour || 0, minute: o.minute || 0 };
    }
    if (!best) return null;
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const ampm = best.hour >= 12 ? "PM" : "AM";
    let h12 = best.hour % 12; if (h12 === 0) h12 = 12;
    const mm = best.minute ? ":" + String(best.minute).padStart(2, "0") : "";
    const time = h12 + mm + " " + ampm;
    const today = best.day === curDay;
    return { label: today ? "Opens " + time : "Opens " + names[best.day] + " " + time, minsUntil: best.delta, today, soon: best.delta <= 180 };
  } catch {
    return null;
  }
}

function normalize(p) {
  if (!p.location) return null;
  let photo = null;
  let photos = [];
  try {
    if (p.photos && p.photos.length) {
      photos = p.photos.slice(0, 8).map((ph) => ph.getURI({ maxWidth: 1000 }));
      photo = p.photos[0].getURI({ maxWidth: 480 });
    }
  } catch {}
  return {
    id: p.id,
    name: typeof p.displayName === "string" ? p.displayName : p.displayName?.text || "Unnamed",
    rating: p.rating || null,
    reviews: p.userRatingCount || 0,
    wfScore: wayfindScore(p.rating, p.userRatingCount || 0),
    price: PRICE[p.priceLevel] || null,
    priceNum: p.priceLevel in PRICE_NUM ? PRICE_NUM[p.priceLevel] : null,
    address: p.formattedAddress || "",
    lat: p.location.lat(),
    lng: p.location.lng(),
    openNow: openNowFrom(p.regularOpeningHours, p.utcOffsetMinutes),
    nextOpen: nextOpenInfo(p.regularOpeningHours, p.utcOffsetMinutes),
    type: (p.types && p.types[0] ? p.types[0] : "").replace(/_/g, " "),
    types: p.types || [],
    photo,
    photos,
    labels: attrLabels(p),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      p.displayName?.text || p.displayName || ""
    )}&query_place_id=${p.id}`,
  };
}

// Fetch a single place fully by its Google id and normalize it to the same
// shape the list uses, so a shared deep link can open it. Fails soft.
export async function fetchPlaceById(id) {
  try {
    const { Place } = await getLoader().importLibrary("places");
    const place = new Place({ id });
    const baseFields = [
      "id", "displayName", "location", "rating", "userRatingCount",
      "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos",
    ];
    const attrFields = [
      "outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine",
      "servesCoffee", "servesBreakfast", "servesBrunch", "servesVegetarianFood",
      "servesDessert", "reservable", "goodForGroups", "goodForChildren",
      "goodForWatchingSports", "menuForChildren", "allowsDogs", "takeout",
      "delivery", "dineIn", "curbsidePickup", "restroom", "parkingOptions", "accessibilityOptions",
    ];
    try {
      await place.fetchFields({ fields: [...baseFields, ...attrFields] });
    } catch {
      await place.fetchFields({ fields: baseFields });
    }
    return normalize(place);
  } catch (e) {
    return null;
  }
}

// Straight-line distance in meters between two lat/lng points.
function distMeters(a, b) {
  const R = 6371000;
  const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Live search: real places from Google, ranked by quality, near the location.
// Find a single place by free text (e.g. an event venue name), biased to a
// location. Returns the same normalized shape the list uses, so it can open in
// the standard detail sheet with real reviews, hours, and grounded AI tips.
// Search for any named place or brand within a radius, sorted closest first.
// This is what powers "McDonald's near me" type searches — handles chains,
// specific restaurants, bars, any business name the user types.
export async function searchNearbyPlaces(query, center, radiusMiles = 20) {
  if (!query || !center) return [];
  try {
    const { Place } = await getLoader().importLibrary("places");
    const radiusMeters = Math.min(radiusMiles * 1609.34, 50000);
    const baseFields = ["id", "displayName", "location", "rating", "userRatingCount", "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos", "businessStatus"];
    const attrFields = ["outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine", "servesCoffee", "servesBreakfast", "servesBrunch", "goodForGroups", "goodForChildren", "allowsDogs", "takeout", "delivery", "dineIn"];
    let places;
    try {
      ({ places } = await Place.searchByText({ textQuery: query, maxResultCount: 10, locationBias: { center, radius: radiusMeters }, fields: [...baseFields, ...attrFields] }));
    } catch {
      ({ places } = await Place.searchByText({ textQuery: query, maxResultCount: 10, locationBias: { center, radius: radiusMeters }, fields: baseFields }));
    }
    let list = (places || []).map(normalize).filter(Boolean);
    // Hard cap at the requested radius — bias alone doesn't guarantee proximity
    list = list.filter((p) => distMeters(center, { lat: p.lat, lng: p.lng }) <= radiusMeters);
    list.forEach((p) => { p.distMi = distMeters(center, { lat: p.lat, lng: p.lng }) / 1609.34; });
    // Sort closest first — this is the primary ranking for a direct name search
    list.sort((a, b) => (a.distMi || 0) - (b.distMi || 0));
    return list;
  } catch { return []; }
}

export async function findPlace(query, center) {
  if (!query) return null;
  try {
    const { Place } = await getLoader().importLibrary("places");
    const baseFields = ["id", "displayName", "location", "rating", "userRatingCount", "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos"];
    const attrFields = ["outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine", "servesCoffee", "servesBreakfast", "servesBrunch", "servesVegetarianFood", "servesDessert", "reservable", "goodForGroups", "goodForChildren", "goodForWatchingSports", "menuForChildren", "allowsDogs", "takeout", "delivery", "dineIn", "curbsidePickup", "restroom", "parkingOptions", "accessibilityOptions"];
    const common = { textQuery: query, maxResultCount: 1 };
    if (center) common.locationBias = { center, radius: 16000 };
    let places;
    try { ({ places } = await Place.searchByText({ ...common, fields: [...baseFields, ...attrFields] })); }
    catch { ({ places } = await Place.searchByText({ ...common, fields: baseFields })); }
    const p = (places || []).map(normalize).filter(Boolean)[0];
    if (p && center) p.distMi = distMeters(center, { lat: p.lat, lng: p.lng }) / 1609.34;
    return p || null;
  } catch { return null; }
}

export async function searchPlaces(categoryId, subId, center, radiusMeters = 24000, vibeId = "all", keyword = "") {
  let textQuery = queryFor(categoryId, subId);
  const vq = vibeFor(categoryId, vibeId);
  if (vq) textQuery = vq + " " + textQuery;
  if (keyword) textQuery = keyword + " " + textQuery;
  const { Place } = await getLoader().importLibrary("places");
  const baseFields = [
    "id", "displayName", "location", "rating", "userRatingCount",
    "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos",
  ];
  const attrFields = [
    "outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine",
    "servesCoffee", "servesBreakfast", "servesBrunch", "servesVegetarianFood",
    "servesDessert", "reservable", "goodForGroups", "goodForChildren",
    "goodForWatchingSports", "menuForChildren", "allowsDogs", "takeout",
    "delivery", "dineIn", "curbsidePickup", "restroom", "parkingOptions", "accessibilityOptions",
  ];
  const common = { textQuery, locationBias: { center, radius: radiusMeters }, maxResultCount: 20 };
  let places;
  try {
    ({ places } = await Place.searchByText({ ...common, fields: [...baseFields, ...attrFields] }));
  } catch (e) {
    // If an attribute field isn't supported, fall back so the list still loads.
    ({ places } = await Place.searchByText({ ...common, fields: baseFields }));
  }
  let list = (places || []).map(normalize).filter(Boolean);
  // Hard distance gate: keep only places genuinely near the location, so a
  // thin category (e.g. shopping in a small town) can't bleed in far-off or
  // out-of-state results. Bias affects ranking; this enforces the boundary.
  const gate = radiusMeters * 2; // ~48 km / 30 mi around the search center
  list = list.filter((p) => distMeters(center, { lat: p.lat, lng: p.lng }) <= gate);
  // Distance (miles) from the area center, shown on each card.
  list.forEach((p) => { p.distMi = distMeters(center, { lat: p.lat, lng: p.lng }) / 1609.34; });

  // Sort by a distance-adjusted Wayfind Score.
  // wfScore (displayed on cards) reflects pure quality and doesn't change.
  // _sortScore adds a proximity bonus so a 4.7★ place at 2 miles outranks
  // the same rating at 22 miles. Penalty: 1 point per 3 miles of distance,
  // capped at 15 points so a truly outstanding place (9.8) can still surface
  // even from a distance.
  list.forEach((p) => {
    const distPenalty = Math.min(15, (p.distMi || 0) / 3);
    p._sortScore = (p.wfScore || 0) - distPenalty;
  });
  list.sort((a, b) => (b._sortScore || 0) - (a._sortScore || 0));

  // Transparent score + position within this nearby set.
  // Score is global (set in normalize). Rank and total are relative to THIS set.
  list.forEach((p, i) => {
    p.rank = i + 1;
    p.total = list.length;
  });
  return list;
}

// On-demand deep data for a single opened place. This uses Google's pricier
// "atmosphere" fields, so it only runs when a user opens a place, never for
// the whole list. Fails soft: returns null if anything goes wrong.
export async function fetchPlaceDetail(placeId) {
  try {
    const { Place } = await getLoader().importLibrary("places");
    const place = new Place({ id: placeId });
    await place.fetchFields({
      fields: ["editorialSummary", "reviews", "regularOpeningHours"],
    });

    const ed = place.editorialSummary;
    const editorial = (ed && (ed.text || ed)) ? (ed.text || ed).toString() : null;

    const reviews = (place.reviews || [])
      .slice(0, 5)
      .map((r) => {
        const t = r && r.text ? (r.text.text || r.text) : "";
        const author = r && r.authorAttribution ? (r.authorAttribution.displayName || "") : "";
        const when = r ? (r.relativePublishTimeDescription || "") : "";
        return { text: (t || "").toString().slice(0, 700), rating: r ? r.rating || null : null, author, when };
      })
      .filter((r) => r.text);

    const hours = (place.regularOpeningHours && place.regularOpeningHours.weekdayDescriptions) || null;

    return { editorial, reviews, hours };
  } catch (e) {
    return null;
  }
}
