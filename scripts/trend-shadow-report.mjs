#!/usr/bin/env node
// trend-shadow-report — SHADOW MODE for Wayfind Trend Score V1 on the place
// shelves. Read only; changes nothing users see.
//
// The live Trending Now place pool (/api/rails?rail=trending) is still ranked
// by the current rule (quality index + trend flag). This report re-ranks that
// same pool with V1 (lib/trendEngine.js) and prints how the two orders
// differ, so a cutover is decided on evidence (docs/trending-model-v1.md,
// "Cutover"). The social shelf already runs on V1.
//
//   node scripts/trend-shadow-report.mjs [lat] [lng]
// Velocity uses Wayfind's own first-party events when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are in the environment; without them V1 sees no
// momentum and the report says so.
import { rankTrendCandidates, TREND_MODEL_VERSION } from "../lib/trendEngine.js";

const lat = Number(process.argv[2] || 28.54), lng = Number(process.argv[3] || -81.38);
const nowMs = Date.now();
const today = new Date(nowMs - 5 * 3600000).toISOString().slice(0, 10); // US Eastern, close enough for a report

const res = await fetch(`https://www.gowayfind.com/api/rails?rail=trending&lat=${lat}&lng=${lng}&limit=48`, { signal: AbortSignal.timeout(20000) });
const body = await res.json();
const places = Object.values((body.data && body.data.places) || {}).flat().filter((p) => p && p.id);
const seen = new Set();
const pool = places.filter((p) => !seen.has(p.id) && seen.add(p.id));
if (!pool.length) { console.error("trend-shadow-report: the live trending pool is empty"); process.exit(1); }

let velocity = new Map(), velocityNote = "no Supabase credentials: V1 sees no momentum";
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { velocityByPlace } = await import("../lib/trendingSocialServer.js");
  velocity = await velocityByPlace(pool.map((p) => p.id), nowMs, AbortSignal.timeout(20000));
  velocityNote = `first-party velocity for ${velocity.size} of ${pool.length} places`;
}

const cands = pool.map((p) => ({
  kind: "place", id: p.id,
  entity: { type: "place", id: p.id, name: p.name, city: p.city, lat: p.lat, lng: p.lng, photo: p.photoRef ? "x" : null, verified: p.status === "OPERATIONAL", href: "/p/" + p.id },
  signals: { ...(velocity.get(p.id) || {}) },
}));
const { ranked } = rankTrendCandidates(cands, { today, nowMs, origin: { lat, lng } });
const top = 12;
const curTop = new Set(pool.slice(0, top).map((p) => p.id));
const v1Top = new Set(ranked.slice(0, top).map((c) => c.id));
const overlap = [...curTop].filter((id) => v1Top.has(id)).length;

console.log(`trend-shadow-report (${TREND_MODEL_VERSION}) at ${lat},${lng}: ${pool.length} places in the live pool; ${velocityNote}`);
console.log(`top-${top} overlap current vs V1: ${overlap}/${top}`);
console.log("rank  current                                   V1 (score, why)");
for (let i = 0; i < Math.min(top, pool.length); i++) {
  const c = ranked[i];
  const why = c.trend.receipt.filter((r) => r.points).map((r) => `${r.key}${r.points > 0 ? "+" : ""}${r.points}`).join(" ");
  console.log(`${String(i + 1).padStart(4)}  ${(pool[i].name || "").slice(0, 40).padEnd(40)}  ${(c.entity.name || "").slice(0, 34)} (${c.trend.score}; ${why}) [was #${pool.findIndex((p) => p.id === c.id) + 1}]`);
}
