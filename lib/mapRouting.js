// lib/mapRouting.js — Florida Coastal & Water-Barrier Drive Effort Estimator,
// Ephemeral Session-Only Apple MapKit Route Upgrade, and Destination Parking Bridge.
import { validPoint, haversineMiles } from "./mapLocationTruth.js";
import { createParkingSearch, parkingDirectionsUrl, parkingMapsUrl } from "./appleParking.js";

// Ephemeral in-memory LRU cache ONLY (Apple DPLA Attachment 6 §2.4–2.5:
// zero localStorage, zero database persistence, cleared when page unloads).
const APPLE_ROUTE_CACHE = new Map();
const APPLE_PARKING_CACHE = new Map();
const MAX_EPHEMERAL_CACHE = 40;

function setBounded(map, key, val) {
  if (map.size >= MAX_EPHEMERAL_CACHE) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, val);
}

function inBox(pt, s, n, w, e) {
  return pt.lat >= s && pt.lat <= n && pt.lng >= w && pt.lng <= e;
}

function isGulfBarrierIsland(pt) {
  // Anna Maria / Longboat Key / Lido / St. Armands / Siesta Key / Casey Key / Manasota Key
  if (pt.lat >= 27.38 && pt.lat <= 27.54 && pt.lng <= -82.68) return "Anna Maria / Longboat bridge";
  if (pt.lat >= 27.29 && pt.lat <= 27.38 && pt.lng <= -82.565) return "Ringling / Lido causeway";
  if (pt.lat >= 27.21 && pt.lat <= 27.29 && pt.lng <= -82.535) return "Siesta Key drawbridge";
  if (pt.lat >= 26.90 && pt.lat <= 27.21 && pt.lng <= -82.465 && pt.lng <= -82.38 + (27.21 - pt.lat) * 0.45) return "Coastal island bridge";
  // Clearwater Beach / Sand Key / Indian Rocks / St. Pete Beach / Treasure Island / Tierra Verde
  if (pt.lat >= 27.62 && pt.lat <= 28.01 && pt.lng <= -82.735) return "Pinellas beach causeway";
  // Sanibel / Captiva / Fort Myers Beach
  if (pt.lat >= 26.41 && pt.lat <= 26.56 && pt.lng <= -82.01) return "Sanibel / Estero causeway";
  // Miami Beach / Key Biscayne
  if (pt.lat >= 25.67 && pt.lat <= 25.90 && pt.lng >= -80.165 && pt.lng <= -80.11) return "Biscayne Bay causeway";
  return null;
}

function isPinellasPeninsula(pt) {
  return inBox(pt, 27.60, 28.06, -82.86, -82.58);
}

function isManateeSarasotaSide(pt) {
  return inBox(pt, 27.15, 27.58, -82.78, -82.30);
}

function isTampaMainland(pt) {
  return inBox(pt, 27.72, 28.15, -82.55, -82.20);
}

function isFloridaKeys(pt) {
  return pt.lat >= 24.50 && pt.lat <= 25.25 && pt.lng >= -81.90 && pt.lng <= -80.32;
}

export function detectFloridaWaterCrossing(origin, dest) {
  const a = validPoint(origin);
  const b = validPoint(dest);
  if (!a || !b) return null;

  // 1. Mouth of Tampa Bay (Pinellas <-> Manatee/Sarasota requires Sunshine Skyway I-275 detour)
  if ((isPinellasPeninsula(a) && isManateeSarasotaSide(b)) || (isManateeSarasotaSide(a) && isPinellasPeninsula(b))) {
    return { kind: "skyway_bay_crossing", label: "via Sunshine Skyway", roadFactor: 1.75, penaltyMin: 14, avgMph: 46 };
  }
  // 2. Old / Middle Tampa Bay (Pinellas <-> Tampa mainland via Howard Frankland / Gandy / Courtney Campbell)
  if ((isPinellasPeninsula(a) && isTampaMainland(b)) || (isTampaMainland(a) && isPinellasPeninsula(b))) {
    return { kind: "tampa_bay_bridge", label: "across Tampa Bay", roadFactor: 1.44, penaltyMin: 7, avgMph: 44 };
  }
  // 3. Gulf / Atlantic Barrier Island drawbridges & causeways
  const islandA = isGulfBarrierIsland(a);
  const islandB = isGulfBarrierIsland(b);
  if (islandA && islandB && islandA !== islandB) {
    return { kind: "inter_island_detour", label: "via mainland bridges", roadFactor: 1.65, penaltyMin: 11, avgMph: 24 };
  }
  if (islandA !== islandB) {
    return { kind: "barrier_island_bridge", label: islandB || islandA, roadFactor: 1.48, penaltyMin: 7, avgMph: 25 };
  }
  // 4. Charlotte Harbor / Caloosahatchee River (Cape Coral <-> Fort Myers, Port Charlotte <-> Punta Gorda)
  const capeCoralA = inBox(a, 26.53, 26.72, -82.06, -81.91);
  const capeCoralB = inBox(b, 26.53, 26.72, -82.06, -81.91);
  const ftMyersA = inBox(a, 26.48, 26.68, -81.90, -81.75);
  const ftMyersB = inBox(b, 26.48, 26.68, -81.90, -81.75);
  if ((capeCoralA && ftMyersB) || (ftMyersA && capeCoralB)) {
    return { kind: "river_bridge", label: "across Caloosahatchee", roadFactor: 1.52, penaltyMin: 7, avgMph: 32 };
  }
  // 5. Florida Keys single-highway island chain (US-1 Overseas Highway)
  if (isFloridaKeys(a) || isFloridaKeys(b)) {
    return { kind: "keys_corridor", label: "via US-1 Keys", roadFactor: 1.32, penaltyMin: 4, avgMph: 35 };
  }
  return null;
}

/**
 * Conservative, zero-spend Florida travel estimator.
 * Never fabricates live traffic precision (`isEstimate: true`, formatted with `~`).
 */
export function estimateFloridaDrive(origin, dest) {
  const a = validPoint(origin);
  const b = validPoint(dest);
  if (!a || !b) return null;
  const straightMi = haversineMiles(a, b);
  if (straightMi == null) return null;

  const crossing = detectFloridaWaterCrossing(a, b);
  if (straightMi <= 0.45 && !crossing) {
    const walkMin = Math.max(2, Math.round((straightMi * 1.25 / 3.0) * 60));
    return {
      straightMi,
      roadMiEst: +(straightMi * 1.22).toFixed(1),
      driveMinEst: Math.max(2, Math.round(straightMi * 3.2)),
      walkMinEst: walkMin,
      mode: "walk",
      waterCrossing: null,
      isEstimate: true,
      label: `~${walkMin} min walk`,
    };
  }

  const roadFactor = crossing ? crossing.roadFactor : (straightMi < 3 ? 1.34 : straightMi < 12 ? 1.28 : 1.23);
  const avgMph = crossing ? crossing.avgMph : (straightMi < 2.5 ? 22 : straightMi < 8 ? 29 : straightMi < 20 ? 38 : 49);
  const penaltyMin = crossing ? crossing.penaltyMin : 2;
  const roadMiEst = +(straightMi * roadFactor).toFixed(1);
  const driveMinEst = Math.max(3, Math.round((roadMiEst / avgMph) * 60 + penaltyMin));
  const walkMinEst = straightMi <= 1.5 && !crossing ? Math.round((roadMiEst / 3.0) * 60) : null;

  return {
    straightMi,
    roadMiEst,
    driveMinEst,
    walkMinEst,
    mode: "drive",
    waterCrossing: crossing ? crossing.label : null,
    waterCrossingKind: crossing ? crossing.kind : null,
    isEstimate: true,
    label: `~${driveMinEst} min drive`,
  };
}

function routeCacheKey(a, b) {
  return `${a.lat.toFixed(3)},${a.lng.toFixed(3)}->${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
}

export function getCachedAppleDrive(origin, dest) {
  const a = validPoint(origin);
  const b = validPoint(dest);
  if (!a || !b) return null;
  return APPLE_ROUTE_CACHE.get(routeCacheKey(a, b)) || null;
}

/**
 * Upgrades a single high-intent selected destination to live Apple MapKit JS road time
 * when physical GPS and 2D Apple Maps are active. Ephemeral session-only per DPLA §2.4.
 */
export function requestAppleDriveEstimate(mapkit, origin, dest, { timeoutMs = 4500 } = {}) {
  const a = validPoint(origin);
  const b = validPoint(dest);
  if (!a || !b || !mapkit || typeof mapkit.Directions !== "function" || typeof mapkit.Coordinate !== "function") {
    return Promise.resolve(null);
  }
  const dist = haversineMiles(a, b);
  if (dist == null || dist > 85) return Promise.resolve(null);
  const key = routeCacheKey(a, b);
  if (APPLE_ROUTE_CACHE.has(key)) return Promise.resolve(APPLE_ROUTE_CACHE.get(key));

  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (val) setBounded(APPLE_ROUTE_CACHE, key, val);
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      const directions = new mapkit.Directions();
      const transport = mapkit.Directions.Transport && mapkit.Directions.Transport.Automobile
        ? mapkit.Directions.Transport.Automobile
        : undefined;
      directions.route(
        {
          origin: new mapkit.Coordinate(a.lat, a.lng),
          destination: new mapkit.Coordinate(b.lat, b.lng),
          ...(transport ? { transportType: transport } : {}),
        },
        (err, data) => {
          if (err || !data || !Array.isArray(data.routes) || !data.routes.length) {
            finish(null);
            return;
          }
          const best = data.routes[0];
          const sec = Number(best.expectedTravelTime);
          const meters = Number(best.distance);
          if (!Number.isFinite(sec) || sec <= 0) {
            finish(null);
            return;
          }
          const driveMin = Math.max(1, Math.round(sec / 60));
          const roadMi = Number.isFinite(meters) && meters > 0 ? +(meters / 1609.344).toFixed(1) : null;
          finish({
            straightMi: dist,
            roadMiEst: roadMi,
            driveMinEst: driveMin,
            walkMinEst: null,
            mode: "drive",
            waterCrossing: null,
            isEstimate: false,
            source: "apple_mapkit_ephemeral",
            label: `${driveMin} min drive`,
          });
        }
      );
    } catch {
      finish(null);
    }
  });
}

export function formatParkingDistance(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return null;
  const ft = Math.round(m * 3.28084);
  if (ft < 1000) return `${Math.max(50, Math.round(ft / 10) * 10)} ft walk`;
  return `${(m / 1609.344).toFixed(1)} mi`;
}

export async function searchDestinationParking(mapkit, place) {
  const pt = validPoint(place);
  if (!pt) return { status: "unavailable", items: [], fallbackHref: place ? parkingMapsUrl(place, true) : null };
  const key = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
  if (APPLE_PARKING_CACHE.has(key)) return APPLE_PARKING_CACHE.get(key);
  if (!mapkit) {
    return { status: "fallback", items: [], fallbackHref: parkingMapsUrl(place, true) };
  }
  try {
    const venue = { ...place, lat: pt.lat, lng: pt.lng };
    const searcher = createParkingSearch({ mapkit, venue });
    const raw = await searcher.search();
    const rawList = Array.isArray(raw?.places) ? raw.places : Array.isArray(raw) ? raw : [];
    const items = rawList.slice(0, 4).map((lot, idx) => ({
      id: lot.id || `lot-${idx}`,
      name: lot.name || "Public parking",
      address: lot.address || "",
      distanceLabel: formatParkingDistance(lot.distanceMeters),
      driveHref: parkingDirectionsUrl(lot, { ...place, lat: pt.lat, lng: pt.lng }, "drive"),
      walkHref: parkingDirectionsUrl(lot, { ...place, lat: pt.lat, lng: pt.lng }, "walk"),
    }));
    const payload = { status: "ready", items, fallbackHref: parkingMapsUrl(place, true) };
    setBounded(APPLE_PARKING_CACHE, key, payload);
    return payload;
  } catch {
    return { status: "fallback", items: [], fallbackHref: parkingMapsUrl(place, true) };
  }
}
