// lib/morningPicks.js — Morning Picks: one premium coffee/café card, shown only before 11:00
// LOCAL time. Honest selection from the existing Google Places layer: real Google `rating` +
// proximity + open-now. No fabricated popularity — those are the only real signals used.
//
// Time gate is LOCATION-LOCAL: pass the location's IANA timezone (the app can read it from the
// weather API's `timezone` with timezone=auto, or a lat/lng→tz lookup). Falls back to the site
// timezone (America/New_York) when none is provided. Pure + deterministic; unit-tested by
// scripts/test-morning-picks.mjs.

const SITE_TZ = "America/New_York";
const MORNING_CUTOFF = 11; // before 11:00 local

export function localHour(now = new Date(), tz = SITE_TZ) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
    return Number(p.find((x) => x.type === "hour").value);
  } catch { return now.getHours(); }
}
export function isMorning(now = new Date(), tz = SITE_TZ, cutoff = MORNING_CUTOFF) {
  return localHour(now, tz) < cutoff;
}

const CAFE_TYPES = new Set(["cafe", "coffee_shop", "bakery"]);
export function isCafe(place) {
  const types = Array.isArray(place.types) ? place.types.map((t) => String(t).toLowerCase()) : [];
  if (types.some((t) => CAFE_TYPES.has(t))) return true;
  return /coffee|caf[eé]|espresso|roaster|roastery/i.test(place.name || "");
}

// Story headlines (vision): tell a story, never "Best Coffee" / "Top Cafe".
export const MORNING_HEADLINES = [
  "Start your morning somewhere worth remembering.",
  // NOT "today's best coffee" — Wayfind has no source that ranks cafés, and the
  // §3 brief bans that exact superlative. Story line, no unearned claim.
  "Wayfind found today's coffee worth the detour.",
  "Skip Starbucks today.",
  "Your next favorite café is probably here.",
  "The morning's better with a great cup nearby.",
];
function hashSeed(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
export function storyHeadline(place, seed) {
  const key = String(seed ?? place?.place_id ?? place?.name ?? "wayfind");
  return MORNING_HEADLINES[hashSeed(key) % MORNING_HEADLINES.length];
}

function haversineMi(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function distanceOf(p, ctx) {
  if (p.distanceMi != null) return p.distanceMi;
  if (ctx?.center && p.lat != null && p.lng != null) return haversineMi(ctx.center.lat, ctx.center.lng, p.lat, p.lng);
  return null;
}
function scoreCafe(p, ctx, maxR) {
  const rating = typeof p.rating === "number" ? p.rating / 5 : 0.6; // real Google rating
  const dist = distanceOf(p, ctx);
  const prox = dist == null ? 0.4 : dist > maxR ? 0 : 1 - dist / maxR;
  const open = p.openNow === true ? 0.15 : 0;
  return rating * 0.6 + prox * 0.4 + open;
}

// getMorningPick(places, ctx): ctx = { now, tz, center, maxRadiusMi }.
export function getMorningPick(places, ctx = {}) {
  const now = ctx.now || new Date();
  const tz = ctx.tz || SITE_TZ;
  if (!isMorning(now, tz)) return { show: false, reason: "after 11:00 local" };
  const maxR = ctx.maxRadiusMi ?? 15;
  const cafes = (places || []).filter(isCafe)
    .map((p) => ({ ...p, distanceMi: distanceOf(p, ctx), _s: scoreCafe(p, ctx, maxR) }))
    .filter((p) => p.distanceMi == null || p.distanceMi <= maxR)
    .sort((a, b) => b._s - a._s);
  if (!cafes.length) return { show: false, reason: "no café nearby" };
  const place = cafes[0];
  return { show: true, place, headline: storyHeadline(place), cta: "Explore Morning Picks →" };
}
