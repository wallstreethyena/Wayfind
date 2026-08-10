// lib/trendRights.js — trend import cadence and freshness policy.
//
// This module originally carried a Semrush approval gate. The owner explicitly
// removed that product decision: importing an export, using its trend signal,
// and displaying the resulting topic treatment do not require a separate
// approval reference in Wayfind. There is therefore no rights mode, ticket
// reference, capability matrix, or hidden off switch here.
//
// The operational safeguards remain: cadence is explicit, stale data expires,
// metered discovery has a separate budget, source rows stay server-only, and
// the trend term never changes the displayed Wayfind Score.

/** The only two cadences. Each carries its own staleness ceiling. */
export const CADENCES = {
  // Exploding Topics surfaces EMERGING trends — a signal that moves over weeks,
  // not hours. Weekly is the recommended starting cadence, and 8 days is one
  // week plus a day of slack so a Monday export is not stale on the next Monday
  // morning before the human gets to it.
  weekly: { maxAgeDays: 8, label: "weekly" },
  // Supported if the owner later chooses to export by hand every day. A shorter
  // ceiling is the whole point of choosing it.
  daily: { maxAgeDays: 2, label: "daily" },
};

/** Raised when required trend configuration is absent or unknown. */
export class TrendConfigError extends Error {
  constructor(variable, detail) {
    super(`${variable} ${detail}`);
    this.name = "TrendConfigError";
    this.variable = variable;
  }
}

function readEnv(name, env) {
  const src = env || (typeof process !== "undefined" ? process.env : {}) || {};
  const raw = src[name];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * The configured import cadence and its staleness ceiling. Throws naming the
 * variable when absent or unknown.
 *
 * Cadence declares how often a human is expected to re-export, and therefore
 * how long a snapshot may be trusted. An implicit default here would mean
 * nobody ever decided.
 */
export function importCadence(env) {
  const v = readEnv("EXPLODING_TOPICS_IMPORT_CADENCE", env);
  if (!v) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_IMPORT_CADENCE",
      `is not set. There is no default — set it to one of: ${Object.keys(CADENCES).join(" | ")}. ` +
        `Start with "weekly": Exploding Topics measures emerging interest over weeks, and a daily manual ` +
        `export cadence nobody sustains produces a permanently stale snapshot.`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(CADENCES, v)) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_IMPORT_CADENCE",
      `is "${v}", which is not a recognised cadence. Valid values: ${Object.keys(CADENCES).join(" | ")}.`
    );
  }
  return { cadence: v, ...CADENCES[v] };
}

/**
 * Snapshot freshness. Returns the decay factor the ordering term uses AND the
 * stale verdict the operator surface reads.
 *
 * `freshnessFactor` decays LINEARLY from 1 at import to 0 at the cadence
 * ceiling. It is not a cliff on purpose: a snapshot one hour past its ceiling
 * and one hour before it are the same quality of evidence, and a step function
 * there would make the boost jump discontinuously for no measured reason.
 *
 * A stale snapshot returns factor 0 AND stale:true. Callers must treat those as
 * one fact — zero boost and no label. "Stale" is an OPERATOR incident (the human
 * stopped exporting), never a quiet product state.
 */
export function snapshotFreshness(observedAtMs, nowMs, cadenceCfg) {
  const maxAgeMs = cadenceCfg.maxAgeDays * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs)) {
    return { ageDays: null, freshnessFactor: 0, stale: true, reason: "snapshot has no usable observation date" };
  }
  const ageMs = nowMs - observedAtMs;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  // A snapshot dated in the FUTURE is corrupt, not fresh. Trusting it would let
  // a bad export date pin freshness at 1.0 forever.
  if (ageMs < 0) {
    return { ageDays, freshnessFactor: 0, stale: true, reason: "snapshot observation date is in the future — the export is not trustworthy" };
  }
  if (ageMs >= maxAgeMs) {
    return {
      ageDays,
      freshnessFactor: 0,
      stale: true,
      reason: `snapshot is ${ageDays.toFixed(1)}d old, past the ${cadenceCfg.maxAgeDays}d ceiling for ${cadenceCfg.label} cadence — a new export is required`,
    };
  }
  return { ageDays, freshnessFactor: Math.max(0, Math.min(1, 1 - ageMs / maxAgeMs)), stale: false, reason: null };
}
