// Bounded, owned-inventory connections between a stay and a ticketed anchor.
// The browser may identify the open card and provide its coordinates only to
// bound the exact inventory read. Names, types and the recommendation origin
// always come back from wf_inventory.
import { ATTRACTION_DISCOVERY_IDS, attractionDiscoveryEligible } from "./attractionDiscovery.js";
import { completeEventStays, eventStays, validStayOrigin } from "./eventStays.js";
import { distMeters, serveInventoryByPlaceIds } from "./inventoryServe.js";
import { isTrueLodging } from "./lodging.js";
import { isOperational } from "./businessStatus.js";
import { toDateNightPlace } from "./dateNightIntent.js";
import { lawfulComparator } from "./lawfulOrder.js";

export const TRIP_CONNECTION_RADIUS_MI = 12;
export const TRIP_CONNECTION_DEADLINE_MS = 8000;
const IDENTITY_RADIUS_MI = 2;
const FAMILY_RATING_FLOOR = 4.5;
const FAMILY_REVIEW_FLOOR = 500;
const ATTRACTION_IDS = new Set(ATTRACTION_DISCOVERY_IDS);
const FLORIDA_EXACT_READ = Object.freeze({ lat: 27.5, lng: -83.75 });
const FLORIDA_EXACT_READ_RADIUS_MI = 500;

const exactInventory = (ids, origin, radiusMi = TRIP_CONNECTION_RADIUS_MI) =>
  serveInventoryByPlaceIds(ids, origin.lat, origin.lng, radiusMi * 1609.344, {
    failLoud: true,
    deadlineMs: 3000,
  });

function inventoryIdentity(raw, requestedId, claimedOrigin) {
  if (!raw || raw.id !== requestedId) return null;
  const lat = Number(raw.location?.latitude);
  const lng = Number(raw.location?.longitude);
  if (!validStayOrigin(lat, lng)) return null;
  if (claimedOrigin && distMeters(claimedOrigin.lat, claimedOrigin.lng, lat, lng) > IDENTITY_RADIUS_MI * 1609.344) return null;
  return { raw, lat, lng };
}

export function selectAttractionConnections(rows, origin, max = 6) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return [];
  const seen = new Set();
  return (rows || []).filter((raw) => raw && raw.excluded !== true && isOperational(raw)
    && attractionDiscoveryEligible(raw, { cat: "attractions", sub: "all", lat: origin.lat, lng: origin.lng, radiusM: TRIP_CONNECTION_RADIUS_MI * 1609.344 }))
    .map((raw) => {
      const place = toDateNightPlace(raw, origin);
      // The shared mapper uses zero for an absent price. Admission is unknown,
      // not free, when the owned place carries no price evidence.
      if (place && raw.priceLevel == null) { place.priceNum = null; place.priceLevel = null; }
      return place;
    }).filter((place) => {
    if (!place || !ATTRACTION_IDS.has(place.id) || seen.has(place.id)) return false;
    if (!validStayOrigin(place.lat, place.lng)) return false;
    if (place.rating < FAMILY_RATING_FLOOR || place.reviews < FAMILY_REVIEW_FLOOR) return false;
    if (distMeters(origin.lat, origin.lng, place.lat, place.lng) > TRIP_CONNECTION_RADIUS_MI * 1609.344) return false;
    seen.add(place.id);
    return true;
  }).sort(lawfulComparator((place) => -(place.distMi || 0))).slice(0, max);
}

async function attractionsNear(origin, readExact) {
  const rows = await readExact(ATTRACTION_DISCOVERY_IDS, origin, TRIP_CONNECTION_RADIUS_MI);
  return selectAttractionConnections(rows, origin);
}

export async function tripConnections({ placeId = "", lat, lng, mode = "detail" }, {
  readExact = exactInventory,
  readStays = eventStays,
  readDestinationStays = completeEventStays,
} = {}) {
  const hasLat = lat !== undefined && lat !== null && lat !== "";
  const hasLng = lng !== undefined && lng !== null && lng !== "";
  if (hasLat !== hasLng) return { invalid: true, places: [] };
  const claimedOrigin = hasLat ? { lat: Number(lat), lng: Number(lng) } : null;
  if (claimedOrigin && !validStayOrigin(claimedOrigin.lat, claimedOrigin.lng)) return { invalid: true, places: [] };

  if (mode === "attractions") {
    if (!claimedOrigin) return { invalid: true, places: [] };
    const places = await attractionsNear(claimedOrigin, readExact);
    return {
      kind: "attractions",
      title: "Attractions near your stay search",
      description: `Ticketed attractions within ${TRIP_CONNECTION_RADIUS_MI} miles of this search area.`,
      places,
      unavailable: false,
    };
  }

  if (mode === "stays") {
    if (!claimedOrigin) return { invalid: true, places: [] };
    const result = await readDestinationStays(claimedOrigin);
    return {
      kind: "stays",
      places: result.places || [],
      unavailable: result.unavailable === true,
    };
  }

  const id = String(placeId || "").trim();
  if (!id) return { invalid: true, places: [] };
  const identityRows = await readExact([id], claimedOrigin || FLORIDA_EXACT_READ,
    claimedOrigin ? IDENTITY_RADIUS_MI : FLORIDA_EXACT_READ_RADIUS_MI);
  const identity = inventoryIdentity(identityRows[0], id, claimedOrigin);
  if (!identity) return { places: [], unavailable: false };
  const verifiedOrigin = { lat: identity.lat, lng: identity.lng };

  // An exact flagship detail remains a useful hotel anchor even when its own
  // rating is below the family recommendation floor (Epic Universe today).
  if (ATTRACTION_IDS.has(id)) {
    const result = await readStays(verifiedOrigin);
    return {
      kind: "stays",
      title: `Stay near ${identity.raw.displayName?.text || identity.raw.name}`,
      description: `Hotels within ${TRIP_CONNECTION_RADIUS_MI} miles of the attraction, ordered by Wayfind Score.`,
      places: result.places || [],
      unavailable: result.unavailable === true,
    };
  }

  const hotel = toDateNightPlace(identity.raw, verifiedOrigin);
  if (!hotel || !isTrueLodging(hotel)) return { places: [], unavailable: false };
  const places = await attractionsNear(verifiedOrigin, readExact);
  return {
    kind: "attractions",
    title: `Attractions near ${hotel.name}`,
    description: `Ticketed attractions within ${TRIP_CONNECTION_RADIUS_MI} miles of this hotel.`,
    places,
    unavailable: false,
  };
}

export function withTripConnectionDeadline(promise, ms = TRIP_CONNECTION_DEADLINE_MS) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Trip connections deadline exceeded")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
