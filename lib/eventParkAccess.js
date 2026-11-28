import footprints from "../public/data/event-park-footprints.json" with { type: "json" };

// Admission belongs to an identified event at an identified venue. These
// two curated records carry different ticket rules at the same resort.
// Confirmed for the 2026 events on Nov 27 (Florida local time):
// https://www.undercovertourist.com/blog/epcot-international-festival-holidays/
// https://www.undercovertourist.com/orlando/mickeys-not-so-scary-halloween-party/
const EVENTS = {
  "epcot-festival-holidays-2026": {
    venueId: "ChIJGzFs3q9_3YgRvZd1y2NSJOo",
    park: "epcot",
    name: "EPCOT",
    ticket: "Park admission required",
  },
  "mnsshp-2026": {
    venueId: "ChIJgUulalN-3YgRGoTaWM2LawY",
    park: "magic-kingdom",
    name: "Magic Kingdom",
    ticket: "Separate party ticket required during the event",
  },
};

export function parkOutingEventId(event) {
  const key = event?.event_id;
  const policy = Object.hasOwn(EVENTS, key) && EVENTS[key];
  return policy && (event.place_id || event.placeId) === policy.venueId ? key : null;
}

export function parkOutingPolicy(key) {
  return Object.hasOwn(EVENTS, key) ? EVENTS[key] : null;
}

// GeoJSON rings run longitude, latitude. Precompute bounding boxes so an
// ordinary nearby point never walks all six outlines. The other area parks
// prevent a ride with a different gate from qualifying as an outside stop.
const areas = footprints.features.map(({ id, geometry }) => {
  const ring = geometry.coordinates[0];
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return { id, ring, west: Math.min(...xs), east: Math.max(...xs), south: Math.min(...ys), north: Math.max(...ys) };
});
const EDGE_METRES = 25; // Includes pin uncertainty and the 5 m outline simplification.
const LAT_METRES = 111320;
function positionInArea(area, lat, lng) {
  const lonMetres = LAT_METRES * Math.cos(lat * Math.PI / 180);
  if (lng < area.west - EDGE_METRES / lonMetres || lng > area.east + EDGE_METRES / lonMetres
    || lat < area.south - EDGE_METRES / LAT_METRES || lat > area.north + EDGE_METRES / LAT_METRES) return "outside";
  let inside = false;
  for (let i = 1; i < area.ring.length; i++) {
    const [x, y] = area.ring[i - 1];
    const [u, v] = area.ring[i];
    const dx = (u - x) * lonMetres;
    const dy = (v - y) * LAT_METRES;
    const px = (lng - x) * lonMetres;
    const py = (lat - y) * LAT_METRES;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared)) : 0;
    if (Math.hypot(px - t * dx, py - t * dy) <= EDGE_METRES) return "uncertain";
    if ((y > lat) !== (v > lat) && lng < x + (u - x) * (lat - y) / (v - y)) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

export function parkOutingPosition(policy, place) {
  if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng) || place.id === policy.venueId) return null;
  for (const area of areas) {
    const position = positionInArea(area, place.lat, place.lng);
    if (position === "uncertain") return null;
    if (position === "inside") return area.id === policy.park ? "inside" : null;
  }
  return "outside";
}

const OUTSIDE_SLOT = {
  lunch_before: "Lunch", dinner_before: "Dinner", breakfast_before: "Breakfast",
  ice_cream_after: "Dessert", dessert_after: "Dessert", dessert_cafe_after: "Café",
  coffee_before: "Coffee", quick_bite_after: "Quick bite", park_time_after: "Outdoor stop",
  family_fun_after: "Family stop", explore_after: "Explore",
};

export function parkOutingLabel(policy, position, slotKey) {
  return position === "inside"
    ? `Inside ${policy.name} · ${policy.ticket}`
    : `${OUTSIDE_SLOT[slotKey] || "Nearby stop"} · Outside ${policy.name}`;
}
