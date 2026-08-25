// lib/spendGate.js - the ONE switch that stops ALL metered Google Places spend.
// Set WAYFIND_GATE=shut in Vercel env (no code change) and every paid call site
// (details, text search, nearby, photos, refresh-ahead, crons, city unlock)
// serves cache / owned inventory / fallback art instead of paying Google.
// /api/places/search keeps its own identical local copy (predates this file).
// Flip back by clearing the var. Owner order 2026-08-25: shut until revenue.
export function gateShut() {
  return String(process.env.WAYFIND_GATE || "").trim().toLowerCase() === "shut";
}
