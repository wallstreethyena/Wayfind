// Boo's "you are outside Wayfind's map" guide. Plain module on purpose: the
// companion imports it and scripts/check-boo-companion.mjs calls it directly.
//
// WHEN IT FIRES. Exactly when /api/rails answers covered:false for the stored
// center: no COVERED_CITIES entry within COVERAGE_MI (lib/railCoverage.js is
// the one shared law, same function, same constant). So Boo only says "it is
// quiet here" when the feed really has no ranked city behind it.
//
// WHAT HE SAYS. Four short polite lines, shown one at a time: Wayfind has not
// reached the area yet, which part of Florida is covered, the nearest covered
// Florida city as an OPTION, and a no pressure invitation. A tap opens the
// sheet with one button per city. Nothing moves unless a visitor taps a city.
//
// UNKNOWN LOCATION. Nothing stored (no wf_center) is NOT "covered" and NOT
// "uncovered": coverageState returns kind "unknown" and Boo offers a city
// selector in the sheet, once per tab session. He never reads the device
// location for this; he only reads what the site already stored.
//
// Rules: no dashes anywhere, at most 14 words a line, never coordinates.

import { COVERED_CITIES } from "../../lib/landingCities.js";
import { COVERAGE_MI, nearestCoveredCity, railDistanceMi } from "../../lib/railCoverage.js";
import { cityLabel } from "../../lib/locationHonesty.js";

// Cities with the most places in wf_inventory, measured 2026-10-28 (not
// excluded, not closed), grouped by metro: manatee-sarasota 2,872, orlando
// 2,630, miami-dade 1,931, tampa 1,895, broward 1,189, st-pete 951. Each slug
// must be a FL key of COVERED_CITIES (the check script asserts it). Re-measure
// when a new market fills; order only, the counts are never shown.
export const MOST_PICKS = ["sarasota", "orlando", "miami", "tampa", "fort-lauderdale", "st-petersburg"];

// Past this, a distance is a flight, not a road trip: no miles are quoted.
export const DRIVE_MI = 300;

// How Boo names the covered regions in one breath (names come from the same
// covered city list, so the line cannot drift from the data).
export function regionsLine() {
  const names = ["tampa", "sarasota", "orlando", "miami"].map((s) => COVERED_CITIES[s] && COVERED_CITIES[s].name).filter(Boolean);
  return "Right now Wayfind covers Florida: " + names.join(", ") + " and more.";
}

const FL = Object.entries(COVERED_CITIES).filter(([, c]) => c && c.state === "FL");

function parseCenter(raw) {
  let c = raw;
  try { if (typeof raw === "string") c = JSON.parse(raw); } catch { return null; }
  if (!c || typeof c !== "object") return null;
  const lat = Number(c.lat), lng = Number(c.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, loc: typeof c.loc === "string" ? c.loc : "" };
}

function cityOf(slug, from) {
  const c = COVERED_CITIES[slug];
  if (!c) return null;
  const mi = from ? railDistanceMi(from.lat, from.lng, c.lat, c.lng) : null;
  return { slug, name: c.name, label: c.name + ", " + c.state, lat: c.lat, lng: c.lng, mi };
}

/** Rounded, human distance. Under 15 mi never happens here (that is covered). */
export function roundMiles(mi) {
  if (!Number.isFinite(mi)) return null;
  return mi < 100 ? Math.round(mi / 5) * 5 : Math.round(mi / 10) * 10;
}

/**
 * null when the stored center is covered, missing or unreadable. Otherwise the
 * facts Boo needs: the visitor's own area name (or ""), the nearest covered
 * Florida city, and the cities to offer (nearest first, then most picks).
 */
export function coverageGap(raw) {
  const c = parseCenter(raw);
  if (!c) return null;
  if (nearestCoveredCity(COVERED_CITIES, c.lat, c.lng, COVERAGE_MI)) return null;
  let near = null;
  for (const [slug] of FL) {
    const x = cityOf(slug, c);
    if (x && (!near || x.mi < near.mi)) near = x;
  }
  if (!near) return null;
  const options = [near];
  for (const slug of MOST_PICKS) {
    if (options.length >= 4) break;
    if (options.some((o) => o.slug === slug)) continue;
    const x = cityOf(slug, c);
    if (x) options.push(x);
  }
  return { area: cityLabel(c.loc), near, options, cell: c.lat.toFixed(1) + "," + c.lng.toFixed(1) };
}

/** All covered Florida cities, for the selector: [{ slug, name, label, lat, lng }]. */
export function floridaCities() {
  return FL.map(([slug]) => cityOf(slug, null)).filter(Boolean).sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * The one entry point the companion uses.
 *   { kind: "covered" }                      stored center is inside coverage
 *   { kind: "gap", gap }                     stored center is outside coverage
 *   { kind: "unknown", options }             nothing usable stored: offer a selector
 * Never guesses a location: unknown stays unknown.
 */
export function coverageState(raw) {
  const c = parseCenter(raw);
  if (!c) {
    const options = MOST_PICKS.map((s) => cityOf(s, null)).filter(Boolean);
    return { kind: "unknown", options, more: floridaCities() };
  }
  const gap = coverageGap(raw);
  return gap ? { kind: "gap", gap } : { kind: "covered" };
}

/** The bubble lines, one at a time. Polite, short, the nearest city is optional. */
export function coverageLines(gap) {
  if (!gap) return [];
  const where = gap.area || "your area";
  const lines = ["Wayfind hasn't reached " + where + " yet. Boo is a little embarrassed."];
  lines.push(regionsLine());
  const mi = roundMiles(gap.near.mi);
  lines.push(mi != null && mi <= DRIVE_MI
    ? "Closest city, if you're curious: " + gap.near.name + ", about " + mi + " miles. Totally optional!"
    : "Planning a Florida trip? " + gap.near.name + " is closest. Totally optional!");
  lines.push("Tap me anytime to pick a city. Or keep browsing, no pressure.");
  return lines;
}

/** The sheet's opening message when the visitor is outside coverage. */
export function coverageSheetLine(gap) {
  const where = gap && gap.area ? gap.area : "your area";
  return "Wayfind hasn't reached " + where + " yet. Want to peek at a Florida city? Totally optional.";
}

/** The sheet's opening message when no location is stored. */
export function unknownSheetLine() {
  return "I don't know where you are. Pick a Florida city if you like.";
}

/** Button text for a city option. Distance only on the nearest one. */
export function coverageButtonText(opt, isNearest) {
  const mi = roundMiles(opt.mi);
  return "Explore " + opt.name + (isNearest && mi != null && mi <= DRIVE_MI ? " (" + mi + " mi)" : "");
}
