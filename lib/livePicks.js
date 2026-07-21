// lib/livePicks.js — Live Picks ranking.
//
// HONEST popularity: the Ticketmaster Discovery API exposes NO demand / sales / popularity
// number, so we rank on the REAL signals we actually have —
//   category priority (Concerts > Festivals > Comedy > Broadway > Shows)
//   + proximity + on-sale availability + date proximity
// with FIRST-PARTY demand (event_open / tickets_out from public.events, keyed by
// meta.id = "tm_<id>") as a LIGHT BOOST when present. First-party volume is sparse today
// (tens of events), so it can only nudge — it strengthens automatically as traffic grows.
//
// Ticket demand, Google Trends, search volume, social engagement, and artist/venue popularity
// are NOT available from any wired source. They are intentionally OMITTED, never fabricated.
// Pure + deterministic; unit-tested by scripts/test-live-picks.mjs.

export const LIVE_PICKS_DEFAULTS = {
  maxRadiusMi: 60,
  windowDays: 30, // only consider events within this horizon
  weights: { category: 100, proximity: 25, availability: 15, dateProximity: 20, demand: 10 },
};

// Vision priority order. Sports is excluded here (it has its own rail).
const CATEGORY_RANK = { concert: 5, festival: 4, comedy: 3, broadway: 2, show: 1 };

export function categorize(ev) {
  const seg = (ev.segment || "").toLowerCase();
  const genre = (ev.genre || "").toLowerCase();
  const name = (ev.name || "").toLowerCase();
  if (seg.includes("sports")) return "sports";
  if (/festival|\bfest\b|night market/.test(name) || genre.includes("festival")) return "festival";
  if (seg.includes("music")) return "concert";
  if (seg.includes("arts") || seg.includes("theat")) {
    if (genre.includes("comedy")) return "comedy";
    if (/musical|broadway|theatre|theater|opera|ballet/.test(genre) || /broadway/.test(name)) return "broadway";
    return "show";
  }
  return "show";
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
function proximityScore(distMi, maxR) {
  if (distMi == null) return 0.4;
  if (distMi > maxR) return 0;
  return Math.max(0, 1 - distMi / maxR);
}
function availabilityScore(ev) {
  const s = (ev.status || "").toLowerCase();
  if (s === "cancelled" || s === "canceled") return -1;
  if (s === "offsale") return 0;
  return ev.price || s === "onsale" ? 1 : 0.6;
}
function dateProximityScore(ev, todayStr, windowDays) {
  if (!ev.date || !todayStr) return 0.3;
  const d = Date.parse(ev.date + "T00:00:00"), t = Date.parse(todayStr + "T00:00:00");
  if (isNaN(d) || isNaN(t)) return 0.3;
  const days = Math.round((d - t) / 86400000);
  if (days < 0) return 0;
  if (days > windowDays) return 0.1;
  return 1 - days / windowDays;
}
function demandBoost(ev, demandMap) {
  if (!demandMap || !ev.id) return 0;
  const id = ev.id.startsWith("tm_") ? ev.id : "tm_" + ev.id;
  const d = demandMap[id];
  if (!d) return 0;
  return Math.min(1, ((d.opens || 0) + 2 * (d.ticketOuts || 0)) / 10);
}

export function scoreEvent(ev, ctx = {}, cfg = {}) {
  const c = { ...LIVE_PICKS_DEFAULTS, ...cfg }, w = c.weights;
  const category = categorize(ev);
  if (category === "sports") return { ...ev, category, score: -Infinity, excluded: "sports-rail" };
  const avail = availabilityScore(ev);
  if (avail < 0) return { ...ev, category, score: -Infinity, excluded: "cancelled" };
  const distanceMi = distanceOf(ev, ctx);
  const score =
    (CATEGORY_RANK[category] || 0) * w.category +
    proximityScore(distanceMi, c.maxRadiusMi) * w.proximity +
    avail * w.availability +
    dateProximityScore(ev, ctx.todayStr, c.windowDays) * w.dateProximity +
    demandBoost(ev, ctx.demandMap) * w.demand;
  return { ...ev, category, distanceMi: distanceMi == null ? null : Math.round(distanceMi * 10) / 10, score: Math.round(score * 100) / 100 };
}

// events: the normalized list from /api/events (lib/eventsPipeline). ctx: {center,todayStr,demandMap}.
export function rankLivePicks(events, ctx = {}, cfg = {}) {
  const scored = (events || [])
    .map((e) => scoreEvent(e, ctx, cfg))
    .filter((e) => e.score !== -Infinity)
    .sort((a, b) => b.score - a.score);
  return { hero: scored[0] || null, rail: scored.slice(1), all: scored };
}
