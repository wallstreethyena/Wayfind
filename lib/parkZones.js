// lib/parkZones.js — is this place INSIDE a theme park?
//
// IN-PARK GEOFENCE. RIDE_RX is a name denylist and names are the weak signal —
// it missed 22 real in-park attractions that then sat in PENDING SOURCE, among
// them The Seas with Nemo & Friends, The American Adventure and Antarctica:
// Empire of the Penguin. Broadening the regex was tried and rejected: ride-ish
// words like "adventure" and "journey" match Nona Adventure Park, TreeUmph!
// Adventure Course and Tampa Theatre, all real standalone destinations. The
// structural question — is this INSIDE a theme park — cannot make that mistake.
// Same lesson as the gift-shop gate: structure over names.
const PARK_ZONES = Object.freeze([
  { name: "Magic Kingdom", lat: 28.4177, lng: -81.5812, r: 900 },
  { name: "EPCOT", lat: 28.3747, lng: -81.5494, r: 900 },
  { name: "Hollywood Studios", lat: 28.3575, lng: -81.5583, r: 800 },
  { name: "Animal Kingdom", lat: 28.3588, lng: -81.5906, r: 1100 },
  { name: "Universal Studios", lat: 28.4749, lng: -81.4664, r: 600 },
  { name: "Islands of Adventure", lat: 28.4722, lng: -81.4700, r: 600 },
  { name: "SeaWorld", lat: 28.4114, lng: -81.4614, r: 800 },
  { name: "Busch Gardens", lat: 28.0372, lng: -82.4194, r: 900 },
  { name: "Legoland", lat: 27.9878, lng: -81.6899, r: 900 },
]);

/**
 * True when a place sits inside a theme park AND is not the park itself.
 * The park is a real destination and keeps its card; what lives inside it is a
 * ride, pavilion, land or show that belongs merged into the parent.
 */
export function isInsidePark(lat, lng, name) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const n = String(name || "").toLowerCase();
  // A park is never "inside" a park — check this against EVERY zone before
  // testing distance to any of them. Universal Studios Florida and Islands of
  // Adventure are ~600m apart, so a per-zone skip let USF match as being inside
  // IoA and demoted the park itself.
  if (PARK_ZONES.some((z) => { const zn = z.name.toLowerCase(); return n.includes(zn) || zn.includes(n); })) return null;
  for (const z of PARK_ZONES) {
    const dLat = (lat - z.lat) * 111320;
    const dLng = (lng - z.lng) * 111320 * Math.cos((lat * Math.PI) / 180);
    if (Math.sqrt(dLat * dLat + dLng * dLng) <= z.r) return z.name;
  }
  return null;
}
