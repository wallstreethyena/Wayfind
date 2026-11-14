// lib/mapLocationTruth.js — Canonical 7-way Location Truth, Near Me vs Explore Here,
// Viewport Camera Governance, Metro Boundaries, and Privacy-Safe Map Deep Links.
import { DEFAULT_CENTER, cityLabel } from "./locationHonesty.js";
import { formatDistanceMiles } from "./deviceDistance.js";
import { resolveSearchCity } from "./searchIntent.js";

export const NEAR_ME_RADIUS_MI = 2.5;
export const MAX_QUERY_LAT_SPAN = 1.35;
export const MAX_QUERY_LNG_SPAN = 1.55;
export const MAX_AREA_PAGES = 12;
export const STORED_COORD_DECIMALS = 3; // ~110m coarse privacy rounding

const R_MI = 3958.8;

export function validPoint(pt) {
  if (!pt || pt.lat == null || pt.lng == null || pt.lat === "" || pt.lng === "") return null;
  if (typeof pt.lat === "boolean" || typeof pt.lng === "boolean") return null;
  const lat = Number(pt.lat);
  const lng = Number(pt.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function haversineMiles(a, b) {
  const pa = validPoint(a);
  const pb = validPoint(b);
  if (!pa || !pb) return null;
  const toR = Math.PI / 180;
  const dLat = (pb.lat - pa.lat) * toR;
  const dLng = (pb.lng - pa.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(pa.lat * toR) * Math.cos(pb.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function roundCoordForStorage(value, decimals = STORED_COORD_DECIMALS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function sanitizeStoredCenterPayload({ center, locName, manual, locApprox, ts = Date.now() }) {
  const pt = validPoint(center);
  if (!pt || !locName) return null;
  // Automatic physical GPS fixes are coarsened to ~110m (3 decimals) so exact
  // residential coordinates never sit unrounded in localStorage.
  const lat = manual ? roundCoordForStorage(pt.lat, 4) : roundCoordForStorage(pt.lat, STORED_COORD_DECIMALS);
  const lng = manual ? roundCoordForStorage(pt.lng, 4) : roundCoordForStorage(pt.lng, STORED_COORD_DECIMALS);
  return { lat, lng, loc: String(locName), manual: !!manual, approx: !!locApprox, ts };
}

export function shouldRecordRecentLocation({ manual, locName }) {
  if (!manual) return false;
  const clean = String(locName || "").trim();
  if (!clean || /^this map area$/i.test(clean) || /^current location$/i.test(clean)) return false;
  return true;
}

export function viewportCenterOf(bounds) {
  if (!bounds) return null;
  const n = Number(bounds.north), s = Number(bounds.south), e = Number(bounds.east), w = Number(bounds.west);
  if (![n, s, e, w].every(Number.isFinite) || n <= s || e <= w) return null;
  return validPoint({ lat: (n + s) / 2, lng: (e + w) / 2 });
}

export function clampMapViewportBounds(bounds) {
  if (!bounds) return null;
  const n = Number(bounds.north), s = Number(bounds.south), e = Number(bounds.east), w = Number(bounds.west);
  if (![n, s, e, w].every(Number.isFinite) || n <= s || e <= w) return null;
  const latSpan = n - s;
  const lngSpan = e - w;
  if (latSpan <= MAX_QUERY_LAT_SPAN && lngSpan <= MAX_QUERY_LNG_SPAN) {
    return { north: n, south: s, east: e, west: w, clamped: false };
  }
  const cLat = (n + s) / 2;
  const cLng = (e + w) / 2;
  const halfLat = Math.min(latSpan, MAX_QUERY_LAT_SPAN) / 2;
  const halfLng = Math.min(lngSpan, MAX_QUERY_LNG_SPAN) / 2;
  return {
    north: Math.min(90, cLat + halfLat),
    south: Math.max(-90, cLat - halfLat),
    east: Math.min(180, cLng + halfLng),
    west: Math.max(-180, cLng - halfLng),
    clamped: true,
  };
}

const METRO_REGIONS = Object.freeze([
  { id: "sarasota", label: "Sarasota · Bradenton", south: 26.92, north: 27.64, west: -82.80, east: -82.18, center: { lat: 27.3364, lng: -82.5307 }, rx: /\b(sarasota|bradenton|siesta key|longboat key|anna maria|cortez|lakewood ranch|venice|parrish|palmetto|osprey|nokomis|ellent[o]n)\b/i },
  { id: "tampa", label: "Tampa · St. Pete · Clearwater", south: 27.64, north: 28.28, west: -82.88, east: -82.18, center: { lat: 27.9506, lng: -82.4572 }, rx: /\b(tampa|st\.?\s*pete(?:rsburg)?|saint petersburg|clearwater|dunedin|tarpon springs|brandon|ybor|safety harbor|largo|indian rocks|st\.?\s*pete beach|treasure island|tierra verde)\b/i },
  { id: "orlando", label: "Orlando · Kissimmee · Winter Park", south: 28.18, north: 28.82, west: -81.72, east: -81.10, center: { lat: 28.5383, lng: -81.3792 }, rx: /\b(orlando|kissimmee|winter park|lake buena vista|celebration|davenport|altamonte|sanford|windermere|dr\.?\s*phillips)\b/i },
  { id: "miami", label: "Miami · Fort Lauderdale · Palm Beach", south: 25.55, north: 26.82, west: -80.48, east: -79.98, center: { lat: 25.7617, lng: -80.1918 }, rx: /\b(miami|miami beach|coral gables|coconut grove|wynwood|brickell|doral|key biscayne|fort lauderdale|ft\.?\s*lauderdale|hollywood|pompano|boca raton|delray|west palm beach|palm beach)\b/i },
  { id: "keys", label: "Florida Keys", south: 24.50, north: 25.30, west: -81.90, east: -80.30, center: { lat: 24.5551, lng: -81.7800 }, rx: /\b(key west|key largo|islamorada|marathon|big pine|florida keys)\b/i },
  { id: "swfl", label: "Naples · Fort Myers · Sanibel", south: 26.05, north: 26.80, west: -82.30, east: -81.60, center: { lat: 26.1420, lng: -81.7948 }, rx: /\b(naples|fort myers|ft\.?\s*myers|sanibel|captiva|bonita springs|estero|cape coral|marco island|punta gorda)\b/i },
]);

export function resolveSpatialMetro(point, label = "") {
  const pt = validPoint(point);
  const text = String(label || "").trim();
  if (pt) {
    let best = null;
    let bestDist = Infinity;
    for (const m of METRO_REGIONS) {
      if (pt.lat >= m.south && pt.lat <= m.north && pt.lng >= m.west && pt.lng <= m.east) {
        const d = haversineMiles(pt, m.center) ?? 999;
        if (d < bestDist) { bestDist = d; best = m; }
      }
    }
    if (best) return { id: best.id, label: best.label, source: "coordinates" };
  }
  if (text && !/^this map area$/i.test(text)) {
    for (const m of METRO_REGIONS) {
      if (m.rx.test(text)) return { id: m.id, label: m.label, source: "label" };
    }
  }
  if (pt && pt.lat >= 24.4 && pt.lat <= 31.0 && pt.lng >= -87.7 && pt.lng <= -79.9) {
    return { id: "florida", label: "Florida", source: "state_bounds" };
  }
  return { id: null, label: text && !/^this map area$/i.test(text) ? cityLabel(text) || text : "Map area", source: "unknown" };
}

export function extractCityFromQuery(query) {
  if (!query || typeof query !== "string") return null;
  const q = query.trim();
  if (!q) return null;
  const { city } = resolveSearchCity({ query: q });
  if (city && city.source === "query") {
    return city;
  }
  for (const m of METRO_REGIONS) {
    if (m.rx.test(q)) {
      return { slug: m.id, name: m.label, lat: m.center.lat, lng: m.center.lng, source: "query" };
    }
  }
  return null;
}

export function queryImpliesExplicitArea(query) {
  return extractCityFromQuery(query) != null;
}

export function isBootstrapSeed(point, locName, manual, verifiedDevice) {
  if (manual || verifiedDevice) return false;
  const pt = validPoint(point);
  if (!pt) return true;
  const d = haversineMiles(pt, DEFAULT_CENTER);
  return d != null && d < 0.15 && (!locName || /^parrish,\s*fl$/i.test(String(locName).trim()));
}

/**
 * Explicitly separates all 7 location concepts so they NEVER silently collapse:
 * 1. deviceLocation (physical GPS only — never IP centroid or bootstrap)
 * 2. mapCenter (current camera center)
 * 3. searchLocation (query city -> active map viewport when on /map -> selected area -> device -> bootstrap)
 * 4. selectedArea (intentional user city/area pick)
 * 5. savedLocation (coarsened persistent preference)
 * 6. urlLocation (shareable deep-link city/area without exact GPS)
 * 7. bootstrapCenter (fallback seed only so map can initialize)
 */
export function resolveLocationTruth({
  rawDeviceLoc = null,
  locApprox = false,
  discoveryCenter = null,
  locName = "",
  manual = false,
  viewport = null,
  areaOffer = null,
  queryGeo = null,
  query = null,
  urlCity = null,
  savedCenter = null,
  screen = "map",
} = {}) {
  const verifiedDevice = !locApprox ? validPoint(rawDeviceLoc) : null;
  const discPt = validPoint(discoveryCenter);
  const vpCenter = validPoint(areaOffer) || viewportCenterOf(viewport) || discPt || validPoint(DEFAULT_CENTER);
  const bootstrap = isBootstrapSeed(discPt, locName, manual, verifiedDevice);

  const selectedArea = manual && discPt
    ? { ...discPt, label: cityLabel(locName) || resolveSpatialMetro(discPt, locName).label }
    : null;

  const mapMetro = resolveSpatialMetro(vpCenter, !areaOffer ? locName : "");
  const mapCenter = vpCenter ? { ...vpCenter, metro: mapMetro.id, areaLabel: (!areaOffer && cityLabel(locName)) || mapMetro.label } : null;

  let searchLocation = null;
  const effectiveQuery = (typeof query === "string" && query.trim()) || (queryGeo && typeof queryGeo.name === "string" && queryGeo.name.trim()) || "";
  const isExplicitQueryCity = effectiveQuery ? queryImpliesExplicitArea(effectiveQuery) : (queryGeo && (queryGeo.source === "query_city" || queryGeo.explicit === true));

  if (validPoint(queryGeo) && isExplicitQueryCity) {
    searchLocation = { ...validPoint(queryGeo), label: queryGeo.name || "", source: "query_city" };
  } else if (!validPoint(queryGeo) && effectiveQuery && queryImpliesExplicitArea(effectiveQuery)) {
    const qCity = extractCityFromQuery(effectiveQuery);
    if (qCity && validPoint(qCity)) {
      searchLocation = { lat: qCity.lat, lng: qCity.lng, label: qCity.name || effectiveQuery, source: "query_city" };
    }
  }

  if (!searchLocation) {
    if (screen === "map" && mapCenter) {
      searchLocation = { lat: mapCenter.lat, lng: mapCenter.lng, label: mapCenter.areaLabel, source: "map_viewport" };
    } else if (selectedArea) {
      searchLocation = { lat: selectedArea.lat, lng: selectedArea.lng, label: selectedArea.label, source: "selected_area" };
    } else if (verifiedDevice) {
      searchLocation = { lat: verifiedDevice.lat, lng: verifiedDevice.lng, label: cityLabel(locName) || "Near you", source: "device" };
    } else {
      const fallback = discPt || validPoint(DEFAULT_CENTER);
      searchLocation = { lat: fallback.lat, lng: fallback.lng, label: cityLabel(locName) || DEFAULT_CENTER.name, source: bootstrap ? "bootstrap" : "fallback" };
    }
  }

  return {
    deviceLocation: verifiedDevice ? { ...verifiedDevice, source: "gps" } : null,
    approximateIpLocation: locApprox && validPoint(rawDeviceLoc) ? { ...validPoint(rawDeviceLoc), source: "ip_approx" } : null,
    mapCenter,
    searchLocation,
    selectedArea,
    savedLocation: savedCenter && validPoint(savedCenter) ? { lat: savedCenter.lat, lng: savedCenter.lng, label: savedCenter.loc || "" } : null,
    urlLocation: urlCity ? { city: String(urlCity) } : null,
    bootstrapCenter: { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, label: DEFAULT_CENTER.name, active: bootstrap },
  };
}

export function resolveMapScopeMode(truth) {
  const dev = truth && truth.deviceLocation;
  const mc = truth && truth.mapCenter;
  if (dev && mc) {
    const driftMi = haversineMiles(dev, mc);
    if (driftMi != null && driftMi <= NEAR_ME_RADIUS_MI) {
      return {
        mode: "near_me",
        label: "Near you",
        areaLabel: mc.areaLabel || "Near you",
        driftMi,
        hasPhysicalLocation: true,
      };
    }
    return {
      mode: "explore_here",
      label: mc.areaLabel && mc.areaLabel !== "Map area" ? `Exploring ${mc.areaLabel}` : "Exploring map area",
      areaLabel: mc.areaLabel || "Map area",
      driftMi,
      hasPhysicalLocation: true,
    };
  }
  return {
    mode: "explore_here",
    label: mc && mc.areaLabel && mc.areaLabel !== "Map area" ? `Exploring ${mc.areaLabel}` : "Exploring area",
    areaLabel: (mc && mc.areaLabel) || "Area",
    driftMi: null,
    hasPhysicalLocation: false,
  };
}

/**
 * Honest Distance Contract (Phase 1, 2 & 4):
 * - When verified physical GPS exists (or live watchPosition distance is supplied),
 *   ALWAYS measure from the user's physical location (even when browsing another city,
 *   and even for `apple_live` recovered pins via `pinPoint`).
 * - When physical GPS is unavailable/denied, NEVER display bare "1.4 mi" from bootstrap
 *   Parrish or map center as if it were user distance — either return null or explicitly
 *   qualify as "1.4 mi from center" when `allowAreaFallback` is requested.
 */
export function resolvePlaceDistanceSemantics(place, { liveUserMiles = null, verifiedDeviceLoc = null, areaCenter = null, pinPoint = null, allowAreaFallback = false } = {}) {
  if (typeof liveUserMiles === "number" && Number.isFinite(liveUserMiles) && liveUserMiles >= 0) {
    const formatted = formatDistanceMiles(liveUserMiles);
    return formatted ? { miles: liveUserMiles, kind: "from_you", text: `${formatted} mi`, ariaLabel: `${formatted} miles from you` } : null;
  }
  const targetPt = validPoint(pinPoint) || validPoint(place);
  if (verifiedDeviceLoc && targetPt) {
    const d = haversineMiles(verifiedDeviceLoc, targetPt);
    if (d != null) {
      const formatted = formatDistanceMiles(d);
      if (formatted) return { miles: d, kind: "from_you", text: `${formatted} mi`, ariaLabel: `${formatted} miles from you` };
    }
  }
  if (allowAreaFallback && areaCenter && targetPt) {
    const d = haversineMiles(areaCenter, targetPt);
    if (d != null) {
      const formatted = formatDistanceMiles(d);
      if (formatted) return { miles: d, kind: "from_center", text: `${formatted} mi from center`, ariaLabel: `${formatted} miles from map center` };
    }
  }
  return null;
}

export function evaluateCameraMovement({
  prevViewport = null,
  nextViewport = null,
  discoveryOrigin = null,
  hasActiveSelection = false,
  coveredBoxes = [],
} = {}) {
  const clamped = clampMapViewportBounds(nextViewport);
  if (!clamped) return { action: "ignore", clampedBounds: null, offerExploreHere: false, driftMi: 0 };
  const nextCenter = viewportCenterOf(clamped);
  const originPt = validPoint(discoveryOrigin);
  const driftMi = originPt && nextCenter ? (haversineMiles(originPt, nextCenter) ?? 0) : 0;
  const eps = 1e-4;
  const covered = Array.isArray(coveredBoxes) && coveredBoxes.some(
    (cb) => clamped.north <= cb.north + eps && clamped.south >= cb.south - eps && clamped.east <= cb.east + eps && clamped.west >= cb.west - eps
  );
  let zoomChanged = false;
  if (prevViewport && Number.isFinite(prevViewport.north) && Number.isFinite(prevViewport.south)) {
    const prevSpan = Math.max(1e-5, prevViewport.north - prevViewport.south);
    const nextSpan = Math.max(1e-5, clamped.north - clamped.south);
    const ratio = nextSpan / prevSpan;
    zoomChanged = ratio > 1.32 || ratio < 0.72;
  }
  const offerExploreHere = driftMi >= NEAR_ME_RADIUS_MI;
  if (covered) {
    return { action: "reuse_cache", clampedBounds: clamped, offerExploreHere, driftMi, zoomChanged };
  }
  // Never yank or reset the active selection while the user is inspecting a pin;
  // preload quietly in background if within reasonable span, or wait for Explore Here on huge jumps.
  return {
    action: hasActiveSelection ? "background_preload" : "fetch_viewport",
    clampedBounds: clamped,
    offerExploreHere,
    driftMi,
    zoomChanged,
  };
}

const ALLOWED_CATS = new Set(["all", "food", "nightlife", "attractions", "beach", "family", "hotels", "shopping"]);
const ALLOWED_LENSES = new Set(["open_now", "tonight", "rain_safe", "christmas", "free"]);

export function parseMapDeepLink(searchStr = "") {
  const sp = new URLSearchParams(String(searchStr || "").replace(/^\?/, ""));
  const rawCity = (sp.get("city") || sp.get("near") || "").trim().slice(0, 64);
  const rawCat = (sp.get("cat") || "").trim().toLowerCase();
  const rawSub = (sp.get("sub") || "").trim().toLowerCase().slice(0, 32);
  const rawLens = (sp.get("lens") || "").trim().toLowerCase();
  const rawPlace = (sp.get("place") || "").trim().slice(0, 180);
  const rawQuery = (sp.get("q") || "").trim().slice(0, 120);
  return {
    city: /^[A-Za-z0-9 .,'-]{2,64}$/.test(rawCity) ? rawCity : null,
    cat: ALLOWED_CATS.has(rawCat) ? rawCat : null,
    sub: /^[a-z0-9_-]{2,32}$/.test(rawSub) ? rawSub : null,
    lens: ALLOWED_LENSES.has(rawLens) ? rawLens : null,
    placeId: /^[A-Za-z0-9_:-]{6,180}$/.test(rawPlace) ? rawPlace : null,
    q: rawQuery || null,
  };
}

export function buildMapDeepLink({ city = null, cat = null, sub = null, lens = null, placeId = null, q = null } = {}) {
  // Privacy Law (Phase 26 & 27): NEVER encode raw lat/lng in shareable map URLs.
  const sp = new URLSearchParams();
  const cleanCity = cityLabel(city || "") || (typeof city === "string" && !/^this map area$/i.test(city) ? city.trim() : "");
  if (cleanCity && /^[A-Za-z0-9 .,'-]{2,64}$/.test(cleanCity)) sp.set("city", cleanCity);
  if (cat && ALLOWED_CATS.has(cat) && cat !== "attractions") sp.set("cat", cat);
  if (sub && sub !== "all" && /^[a-z0-9_-]{2,32}$/.test(sub)) sp.set("sub", sub);
  if (lens && ALLOWED_LENSES.has(lens)) sp.set("lens", lens);
  if (placeId && /^[A-Za-z0-9_:-]{6,180}$/.test(placeId)) sp.set("place", placeId);
  if (q && String(q).trim()) sp.set("q", String(q).trim().slice(0, 120));
  const qs = sp.toString();
  return "/map" + (qs ? "?" + qs : "");
}
