export const MAP_DEFAULT_CATEGORY = "food";
// v8.23.3 (owner, 2026-08-19, on the live map: "remove the 30 mile ring make
// it 5 10 15 and 20 mile ring"). ONE set now, four rings, at every zoom.
//
// There used to be two sets and a zoom threshold that swapped between them —
// tight 5/10/15 when zoomed in, 5/10/30 when zoomed out — so the outer ring
// never hugged the viewport edge. That machinery existed to make ONE ring
// legible at two zooms. Four evenly-spaced rings read at both, and a scale that
// silently changes what "the outer ring" means is a scale you cannot trust:
// the reader has no way to know the third circle meant 15 miles a moment ago
// and 30 now. A distance ring is a measurement, and a measurement that moves
// is worse than a coarse one.
export const MAP_RING_MILES = [5, 10, 15, 20];

const METERS_PER_MILE = 1609.344;

function circleFeature(center, miles) {
  const points = [];
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  const radius = miles * METERS_PER_MILE;
  for (let i = 0; i <= 96; i += 1) {
    const angle = (i / 96) * Math.PI * 2;
    const dLat = (radius * Math.cos(angle)) / 111320;
    const dLng = (radius * Math.sin(angle)) / (111320 * Math.max(.2, Math.cos(lat * Math.PI / 180)));
    points.push([lng + dLng, lat + dLat]);
  }
  return {
    type: "Feature",
    properties: { kind: "ring", miles },
    geometry: { type: "LineString", coordinates: points },
  };
}

function labelFeature(center, miles) {
  const lat = Number(center.lat) + ((miles * METERS_PER_MILE) / 111320);
  return {
    type: "Feature",
    properties: { kind: "label", miles, label: `${miles} mi` },
    geometry: { type: "Point", coordinates: [Number(center.lng), lat] },
  };
}

export function distanceRingData(center, ringMiles = MAP_RING_MILES) {
  if (!center || center.lat == null || center.lng == null) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: (ringMiles || MAP_RING_MILES).flatMap((miles) => [circleFeature(center, miles), labelFeature(center, miles)]),
  };
}

// ── v7.17 — "Search this area" + score-on-pin (owner-approved 2026-08-11) ───
// Two pure helpers so the guard can assert them ON THE CALL.

// The pill appears once the map center has drifted this far from the search
// origin. 2.5mi ≈ half the innermost ring: enough that the visible area is
// genuinely different, small enough that a pan to the next neighborhood over
// still offers the re-search.
export const AREA_MOVE_THRESHOLD_MI = 2.5;

export function areaMoved(origin, mapCenter, thresholdMi = AREA_MOVE_THRESHOLD_MI) {
  if (!origin || !mapCenter) return false;
  const vals = [origin.lat, origin.lng, mapCenter.lat, mapCenter.lng].map(Number);
  if (!vals.every(Number.isFinite)) return false;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(vals[2] - vals[0]), dLng = rad(vals[3] - vals[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(vals[0])) * Math.cos(rad(vals[2])) * Math.sin(dLng / 2) ** 2;
  const mi = 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return mi >= thresholdMi;
}

// The pin label is the DISPLAYED governed score (score law: lib/score.js
// toDisplayScore is the ONLY /10 conversion; null must never become 0).
// A place with no valid score falls back to its rank string — a real number
// we do hold — rather than fabricating a score.
export function pinScoreLabel(wfScore, rank, toDisplay) {
  const d = toDisplay(wfScore);
  return d != null ? d.toFixed(1) : String(rank);
}
