// lib/fallSkin.js — the CLIENT sliver of the fall pool: exactly what the
// browser bundle needs (the skin date law + the franchise dedupe key), split
// out so importing it does not drag lib/fallPool.js's server-side pool
// definitions (place whys, ticket-deal map) into the homepage chunk. The
// bundle ratchet is why this file exists; lib/fallPool.js re-exports these,
// so there is still exactly ONE definition of each law.

export const FALL_SKIN_END = "2026-11-01";
export function fallSkinLive(todayStr) {
  return typeof todayStr === "string" && todayStr.length === 10 && todayStr <= FALL_SKIN_END;
}

const FRANCHISE_NOISE = new Set(["orlando", "tampa", "bay", "florida", "seaworld", "busch", "gardens", "legoland", "sarasota", "bradenton", "st", "pete", "key", "west", "at", "the"]);
export function eventFranchiseKey(name) {
  const words = String(name || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter((w) => w && !FRANCHISE_NOISE.has(w));
  return words.slice(0, 3).join(" ");
}
