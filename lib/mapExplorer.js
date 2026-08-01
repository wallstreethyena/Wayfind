export const MAP_DEFAULT_CATEGORY = "food";
export const MAP_RING_MILES = [1, 2, 3];

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

export function distanceRingData(center) {
  if (!center || center.lat == null || center.lng == null) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: MAP_RING_MILES.flatMap((miles) => [circleFeature(center, miles), labelFeature(center, miles)]),
  };
}
