// lib/atlasPaidLane.js - the Atlas editorial writer's OWN, owner-capped spend lane.
//
// WAYFIND_GATE stays "free" for everything else. This lane lets ONLY
// app/api/cron/atlas-build spend, and only when BOTH flags are valid:
//   ATLAS_PAID_ENABLED=1 (or =dry: dry-sample requests only, see atlasPaidLane)
//   ATLAS_MONTH_PLACE_CAP=<positive integer>   (max places per month)
// Missing / malformed / "01" / "1.5" / "0" -> null -> today's skip behaviour.
//
// The lane makes ZERO Google calls: sources come from Claude's web_search/web_fetch tools.
// Each place takes one grant on each of two SEPARATE ledger rows (never the shared
// details_enterprise / anthropic_requests rows, so Atlas cannot starve other
// features and they cannot starve Atlas). Both are capped at the same number.
import { readFileSync } from "node:fs";
import path from "node:path";

export const ATLAS_SEARCH_SKU = "atlas_web_search";
export const ATLAS_ANTHROPIC_SKU = "atlas_anthropic_requests";

// Default model for the lane when ATLAS_MODEL is unset (web tools need a current model).
export const ATLAS_LANE_MODEL = "claude-sonnet-5-5";

// Dollar ceiling for dry-sample runs (ATLAS_DRY_USD_CAP): positive decimal, default
// $1.00, hard max $5.00. Malformed / zero / negative -> the $1.00 default (never higher).
export const ATLAS_DRY_USD_DEFAULT = 1.0;
export const ATLAS_DRY_USD_MAX = 5.0;
export function dryUsdCap(env = process.env) {
  const raw = String(env.ATLAS_DRY_USD_CAP || "").trim();
  if (!raw) return ATLAS_DRY_USD_DEFAULT;
  if (!/^(?:\d+|\d*\.\d+)$/.test(raw)) return ATLAS_DRY_USD_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return ATLAS_DRY_USD_DEFAULT;
  return Math.min(n, ATLAS_DRY_USD_MAX);
}

// ATLAS_PAID_ENABLED=1   -> mode "full": the lane serves every plain build request.
// ATLAS_PAID_ENABLED=dry -> mode "dry": the route activates the lane ONLY for ?dry=1, so
//                           the hourly cron / retry / refresh keep today's free-gate skip.
// anything else          -> null (fail closed).
export function atlasPaidLane(env = process.env) {
  const flag = String(env.ATLAS_PAID_ENABLED || "").trim();
  if (flag !== "1" && flag !== "dry") return null;
  const raw = String(env.ATLAS_MONTH_PLACE_CAP || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const cap = Number(raw);
  if (!Number.isSafeInteger(cap)) return null;
  return { cap, mode: flag === "dry" ? "dry" : "full", dryCapUsd: dryUsdCap(env), searchSku: ATLAS_SEARCH_SKU, anthropicSku: ATLAS_ANTHROPIC_SKU };
}

// Owner-supplied ordered list of place_ids. Tolerant: ignores non-arrays, junk
// entries and duplicates; keeps order. Only id-shaped strings survive, which also
// makes them safe to splice into a PostgREST in.() filter.
export function loadPriorityIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id) || seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  return out;
}

// Reads data/atlas/priority-place-ids.json with fs (a static JSON import needs the
// `with { type: "json" }` attribute under plain node; next.config.js traces the file
// into the atlas-build lambda). Missing/unparseable -> [] -> normal selection.
export function readPriorityIds() {
  try {
    return loadPriorityIds(JSON.parse(readFileSync(path.join(process.cwd(), "data", "atlas", "priority-place-ids.json"), "utf8")));
  } catch { return []; }
}
