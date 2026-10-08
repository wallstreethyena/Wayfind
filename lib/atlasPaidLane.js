// lib/atlasPaidLane.js - the Atlas editorial writer's OWN, owner-capped spend lane.
//
// WAYFIND_GATE stays "free" for everything else. This lane lets ONLY
// app/api/cron/atlas-build spend, and only when BOTH flags are valid:
//   ATLAS_PAID_ENABLED=1
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

export function atlasPaidLane(env = process.env) {
  if (String(env.ATLAS_PAID_ENABLED || "").trim() !== "1") return null;
  const raw = String(env.ATLAS_MONTH_PLACE_CAP || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const cap = Number(raw);
  if (!Number.isSafeInteger(cap)) return null;
  return { cap, searchSku: ATLAS_SEARCH_SKU, anthropicSku: ATLAS_ANTHROPIC_SKU };
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
