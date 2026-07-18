// lib/experiencesData.js — PURE taxonomy + mappers for Experiences v3 (Viator
// bookable products, table-backed via wf_experiences). No network, no key, no
// imports. The cron (app/api/cron/experiences) turns live Viator
// /products/search results into wf_experiences rows using this; the serve layer
// + UI use the category/chip/dest metadata.
//
// ISOLATION (Gate-2): nothing here touches Score or ranking, and NO product URL
// is ever hand-built — product_url is always runtime data off the API, never a
// literal. rankExperiences orders the affiliate rail ONLY; it never feeds
// lib/score.js or lib/ranking.js.

// The 5 Florida markets Viator actually has as destinations — verified live
// 2026-07-17 against /partner/destinations (lookupId hierarchy path 8.77.276.*,
// Florida = destId 276). The 3 spec'd cities Viator does NOT have as their own
// destination — Venice FL, Bradenton, Kissimmee — fold into their parent metro
// (their products surface under the parent dest). center lat/lng = city centre,
// used to resolve a user location + the distance rungs to the nearest markets.
export const DESTS = [
  { destId: "25738", city: "Sarasota",       lat: 27.336, lng: -82.531 },
  { destId: "5403",  city: "St. Petersburg", lat: 27.771, lng: -82.640 },
  { destId: "22457", city: "Clearwater",     lat: 27.966, lng: -82.800 },
  { destId: "666",   city: "Tampa",          lat: 27.951, lng: -82.457 },
  { destId: "663",   city: "Orlando",        lat: 28.538, lng: -81.379 },
];
export const DEST_BY_ID = Object.fromEntries(DESTS.map((d) => [d.destId, d]));

// metro / place name -> nearest Viator dest (incl. the 3 folds). The serve layer
// resolves a user's metro to one of the 5 real markets through this.
const METRO_TO_DEST = {
  sarasota: "25738", venice: "25738", bradenton: "25738", "longboat key": "25738", "siesta key": "25738", "anna maria": "25738", "anna maria island": "25738",
  "st. petersburg": "5403", "st petersburg": "5403", "saint petersburg": "5403", stpete: "5403", "st pete": "5403", gulfport: "5403",
  clearwater: "22457", "clearwater beach": "22457", dunedin: "22457",
  tampa: "666", brandon: "666", "temple terrace": "666",
  orlando: "663", kissimmee: "663", "winter park": "663", "lake buena vista": "663", celebration: "663",
};
export function metroToDest(metro) {
  const k = String(metro || "").toLowerCase().trim();
  const id = METRO_TO_DEST[k] || null;
  const hit = id ? DEST_BY_ID[id] : null;
  return hit ? { destId: hit.destId, city: hit.city } : null;
}

// haversine miles between two lat/lng — for the distance rungs (which markets
// fall within the selected radius of the user).
export function milesBetween(a, b) {
  if (!a || !b || typeof a.lat !== "number" || typeof b.lat !== "number") return Infinity;
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// dest ids whose city centre is within `miles` of {lat,lng}; always includes the
// nearest one so a location just outside every ring still gets its home market.
export function destsWithin(loc, miles) {
  if (!loc || typeof loc.lat !== "number") return DESTS.map((d) => d.destId);
  const ranked = DESTS.map((d) => ({ id: d.destId, mi: milesBetween(loc, d) })).sort((a, b) => a.mi - b.mi);
  const within = ranked.filter((r) => r.mi <= (Number(miles) || 0)).map((r) => r.id);
  return within.length ? within : [ranked[0].id];
}

// 11 experience catalogs -> the Viator tagId that ACTUALLY returns products
// (ground-truthed from real product tags on 2026-07-17, not name-guessed:
// Kayaking is 12047 "Kayaking Tours" not 13298; Private&Luxury is 11938).
export const CATEGORIES = [
  { key: "kayaking",    label: "Kayaking",         icon: "🛶", tag: 12047 },
  { key: "parasailing", label: "Parasailing",      icon: "🪂", tag: 20235 },
  { key: "private",     label: "Private & Luxury", icon: "✨",       tag: 11938 },
  { key: "historical",  label: "Historical Tours", icon: "🏛", tag: 12029 },
  { key: "water",       label: "Water Tours",      icon: "🚤", tag: 20255 },
  { key: "walking",     label: "Walking Tours",    icon: "🚶", tag: 13030 },
  { key: "theme",       label: "Theme Parks",      icon: "🎢", tag: 11909 },
  { key: "museums",     label: "Museums & Tickets",icon: "🎫", tag: 21514 },
  { key: "adventure",   label: "Adventure Tours",  icon: "🧗", tag: 22046 },
  { key: "airboat",     label: "Airboat Tours",    icon: "💨", tag: 11968 },
  { key: "nature",      label: "Nature & Wildlife",icon: "🐦", tag: 11903 },
];
export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

// The horizontal rail: "All" + 11 catalogs + a demand chip. hide-empty at render
// prunes any chip with 0 products in the active market (Walking is 0 across all
// 5 FL markets today, so it self-hides). Default selection = "all".
export const SELLING_OUT_KEY = "sellout";
export const DEFAULT_CHIP = "all";
export const DISPLAY_CHIPS = [
  { key: "all", label: "All", icon: "◎" },
  ...CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon })),
  { key: SELLING_OUT_KEY, label: "Selling out", icon: "🔥" },
];

// LIKELY_TO_SELL_OUT is the closest thing Viator exposes to a "best seller" /
// demand flag (there is no literal BEST_SELLER). It drives the "🔥 Selling out"
// chip + a per-card badge.
export function isSellingOut(flags) {
  return Array.isArray(flags) && flags.includes("LIKELY_TO_SELL_OUT");
}

// Pure map: one raw Viator /products/search product -> a wf_experiences row
// (minus categories[], which the cron accumulates across the per-tag pulls).
// product_url passes straight through from the API — never constructed here.
export function productToRow(p, destId, city) {
  if (!p || !p.productCode || !p.productUrl) return null;
  const img = (() => { try { const v = p.images && p.images[0] && p.images[0].variants; if (!Array.isArray(v) || !v.length) return null; const pick = v.find((x) => x && x.width >= 300 && x.width <= 600) || v[Math.min(2, v.length - 1)]; return pick && pick.url ? pick.url : null; } catch { return null; } })();
  const durMin = (() => { try { const d = p.duration && (p.duration.fixedDurationInMinutes || p.duration.variableDurationToMinutes); return typeof d === "number" ? d : null; } catch { return null; } })();
  const flags = Array.isArray(p.flags) ? p.flags.filter((f) => typeof f === "string").slice(0, 12) : [];
  return {
    product_code: p.productCode,
    provider: "viator",
    dest_id: String(destId),
    city,
    title: String(p.title || "").slice(0, 200),
    product_url: p.productUrl,
    image: img,
    rating: p.reviews && typeof p.reviews.combinedAverageRating === "number" ? Math.round(p.reviews.combinedAverageRating * 10) / 10 : null,
    reviews: p.reviews && typeof p.reviews.totalReviews === "number" ? p.reviews.totalReviews : 0,
    from_price: (() => { try { const pr = p.pricing && p.pricing.summary && p.pricing.summary.fromPrice; return typeof pr === "number" ? Math.round(pr) : null; } catch { return null; } })(),
    duration_min: durMin,
    flags,
    selling_out: isSellingOut(flags),
  };
}

// rating-first, log-review-volume tiebreak (same curve as the parked engine).
// Orders the affiliate rail only — never Score or placement.
export function rankExperiences(items) {
  return items.slice().sort((a, b) => {
    const ra = (a.rating || 0) * 12 + Math.log2(1 + (a.reviews || 0));
    const rb = (b.rating || 0) * 12 + Math.log2(1 + (b.reviews || 0));
    return rb - ra;
  });
}

// display duration string from minutes (UI helper; row stores the int).
export function fmtDuration(min) {
  if (typeof min !== "number" || min <= 0) return null;
  return min >= 60 ? Math.round(min / 60) + "h" : min + "m";
}
