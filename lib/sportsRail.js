// lib/sportsRail.js — Sports rail: compact league cards under Live Picks, sorted by the SAME
// honest signals as Live Picks (proximity + date + on-sale + first-party demand boost), NOT by
// date alone. No fabricated popularity — Ticketmaster exposes none.
//
// LEAGUE MAPPING: TM `genre` gives the SPORT (Baseball/Football/Soccer/Hockey/Basketball); the
// specific LEAGUE (MLB/NFL/MLS/NHL/NBA/College) lives in `classifications[0].subGenre`, which the
// current /api/events route does not yet capture. This module uses `ev.subGenre` when present and
// falls back to genre + name heuristics — add subGenre to the events route for exact leagues.
// Pure + deterministic; unit-tested by scripts/test-sports-rail.mjs.

export const SPORTS_DEFAULTS = {
  maxRadiusMi: 75,
  windowDays: 45,
  weights: { proximity: 30, availability: 15, dateProximity: 25, demand: 15 },
};

const SPORT_BY_GENRE = { baseball: "Baseball", football: "Football", soccer: "Soccer", hockey: "Hockey", basketball: "Basketball" };
const LEAGUE_PATTERNS = [
  [/\bmlb\b|major league baseball/i, "MLB"],
  [/\bnfl\b/i, "NFL"],
  [/\bmls\b|major league soccer/i, "MLS"],
  [/\bnhl\b/i, "NHL"],
  [/\bnba\b/i, "NBA"],
  [/ncaa|college/i, "College"],
  [/premier league|la ?liga|uefa|fifa|international friendly/i, "Soccer"],
];

export function isSports(ev) { return /sport/i.test(ev.segment || ""); }

export function leagueOf(ev) {
  const hay = `${ev.subGenre || ""} ${ev.genre || ""} ${ev.name || ""}`;
  for (const [re, label] of LEAGUE_PATTERNS) if (re.test(hay)) return label;
  const g = (ev.genre || "").toLowerCase();
  return SPORT_BY_GENRE[g] || (ev.genre || "Sports");
}

function haversineMi(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function distanceOf(ev, ctx) {
  if (ev.distanceMi != null) return ev.distanceMi;
  if (ctx?.center && ev.lat != null && ev.lng != null) return haversineMi(ctx.center.lat, ctx.center.lng, ev.lat, ev.lng);
  return null;
}
function proximityScore(d, maxR) { if (d == null) return 0.4; if (d > maxR) return 0; return Math.max(0, 1 - d / maxR); }
function availabilityScore(ev) { const s = (ev.status || "").toLowerCase(); if (s === "cancelled" || s === "canceled") return -1; if (s === "offsale") return 0; return ev.price || s === "onsale" ? 1 : 0.6; }
function dateProximityScore(ev, todayStr, windowDays) {
  if (!ev.date || !todayStr) return 0.3;
  const d = Date.parse(ev.date + "T00:00:00"), t = Date.parse(todayStr + "T00:00:00");
  if (isNaN(d) || isNaN(t)) return 0.3;
  const days = Math.round((d - t) / 86400000);
  if (days < 0) return 0; if (days > windowDays) return 0.1; return 1 - days / windowDays;
}
function demandBoost(ev, demandMap) {
  if (!demandMap || !ev.id) return 0;
  const id = ev.id.startsWith("tm_") ? ev.id : "tm_" + ev.id;
  const d = demandMap[id];
  return d ? Math.min(1, ((d.opens || 0) + 2 * (d.ticketOuts || 0)) / 10) : 0;
}

export function scoreSport(ev, ctx = {}, cfg = {}) {
  const c = { ...SPORTS_DEFAULTS, ...cfg }, w = c.weights;
  const avail = availabilityScore(ev);
  if (avail < 0) return { ...ev, league: leagueOf(ev), score: -Infinity, excluded: "cancelled" };
  const distanceMi = distanceOf(ev, ctx);
  const score =
    proximityScore(distanceMi, c.maxRadiusMi) * w.proximity +
    avail * w.availability +
    dateProximityScore(ev, ctx.todayStr, c.windowDays) * w.dateProximity +
    demandBoost(ev, ctx.demandMap) * w.demand;
  return { ...ev, league: leagueOf(ev), distanceMi: distanceMi == null ? null : Math.round(distanceMi * 10) / 10, score: Math.round(score * 100) / 100 };
}

// Returns { cards: sorted compact cards, byLeague: {league:[...]} }. Sorted by honest signals, NOT date.
export function rankSports(events, ctx = {}, cfg = {}) {
  const cards = (events || [])
    .filter(isSports)
    .map((e) => scoreSport(e, ctx, cfg))
    .filter((e) => e.score !== -Infinity)
    .sort((a, b) => b.score - a.score);
  const byLeague = {};
  for (const c of cards) (byLeague[c.league] ||= []).push(c);
  return { cards, byLeague };
}
