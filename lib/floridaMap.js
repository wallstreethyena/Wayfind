// lib/floridaMap.js: a small, self contained Florida outline for inline SVG
// maps (the Christmas parades map, owner 2026-11-25). US Census state boundary,
// simplified, in a 400x383 equirectangular frame: lon -87.7..-79.8,
// lat 24.4..31.1, x scaled by cos(27.75 deg). The Keys are not in the
// simplified outline; a point there still plots at its true position.
export const FLORIDA_MAP_W = 400;
export const FLORIDA_MAP_H = 383;
const W0 = -87.7, W1 = -79.8, S0 = 24.4, N1 = 31.1;

// lat/lng -> {x, y} in the frame, or null outside Florida's box (never a
// guessed position).
export function floridaMapPoint(lat, lng) {
  const la = Number(lat), lo = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < S0 || la > N1 || lo < W0 || lo > W1) return null;
  const x = ((lo - W0) / (W1 - W0)) * FLORIDA_MAP_W;
  const y = ((N1 - la) / (N1 - S0)) * FLORIDA_MAP_H;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

export const FLORIDA_MAP_PATH = "M111.5 5.9 L136.5 5.5 L143.4 22.1 L212.8 25.9 L277.6 30.3 L280.1 42.5 L286.2 42.2 L288.5 30.6 L286.5 19.9 L291.2 15.6 L302.9 20.3 L316.7 22.5 L319.8 47.2 L326.2 75.0 L340.9 111.7 L363.3 150.8 L360.0 153.6 L361.1 171.8 L370.5 192.1 L385.2 233.2 L388.3 246.0 L388.0 259.1 L382.5 306.4 L377.8 307.4 L372.8 322.1 L374.4 326.8 L364.7 337.4 L360.8 334.9 L351.4 339.3 L335.3 341.8 L330.6 335.8 L332.8 327.1 L321.5 301.7 L312.6 297.0 L304.8 300.5 L298.7 286.4 L297.1 274.8 L286.5 262.0 L284.0 253.5 L285.7 241.3 L279.9 239.1 L281.3 246.3 L276.0 248.2 L259.9 217.2 L253.5 209.4 L268.8 186.5 L258.8 187.8 L252.1 195.0 L245.5 183.7 L254.4 152.4 L256.0 126.4 L249.9 120.1 L248.0 111.7 L238.3 109.8 L226.9 96.0 L217.7 90.4 L217.2 81.9 L210.8 78.8 L205.5 69.4 L186.1 56.9 L169.2 59.7 L170.1 68.5 L164.5 66.9 L143.4 77.6 L121.0 80.1 L121.5 73.8 L116.3 66.3 L89.9 49.4 L71.0 42.2 L54.1 40.3 L40.0 41.5 L9.2 46.9 L16.7 38.4 L12.8 33.7 L14.8 24.3 L3.4 13.4 L5.0 5.9 L111.5 5.9 Z";
