// Receipts explain the number actually calculated. They do not claim that an
// article or an AI opinion caused a score, nor retain licensed review content.
import { isOwnerPick, withOwnerBump } from "./ownerBump.js";

const valid = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
const identity = (p) => String(p?.id || p?.place_id || "");
export function scoreReceipt(p, base, score, steps, origin) {
  if (!valid(base) || !valid(score) || score === 0) return null;
  let start = base;
  const terms = [];
  // Only disclose an owner adjustment when the actual pre-bump input survived.
  // The owner flag alone is not evidence that THIS number includes the bump.
  if (origin === "stored" && isOwnerPick(p) && valid(p._wfScoreRaw)
      && withOwnerBump(p._wfScoreRaw, true) === base) {
    start = p._wfScoreRaw;
    terms.push({ key: "curator", delta: base - start, value: base });
  }
  return { version: 1, placeId: identity(p), score, start, origin, steps: [...terms, ...steps] };
}

const LABELS = {
  creator: "Curated creator video",
  distance: "More than 17 miles away",
  trending: "Trending signal (capped)",
  curator: "Wayfind curator recommendation",
  bounds: "Rounding and score ceiling",
};

// Validate at display time, including identity and arithmetic. An upstream
// cached score without a receipt remains unexplained, never reconstructed.
export function readableScoreReceipt(p) {
  const r = p?.score_explanation;
  if (!r || r.version !== 1 || !r.placeId || r.placeId !== identity(p)
      || !valid(r.start) || !valid(r.score) || r.score === 0 || r.score !== p.governed_score
      || !["stored", "reviews"].includes(r.origin) || !Array.isArray(r.steps)
      || r.steps.length > 5) return null;
  let value = r.start;
  const seen = new Set();
  for (const step of r.steps) {
    if (!step || !Object.hasOwn(LABELS, step.key) || seen.has(step.key)
        || !Number.isFinite(step.delta) || !Number.isFinite(step.value)
        || Math.abs(value + step.delta - step.value) > 1e-8) return null;
    seen.add(step.key);
    value = step.value;
  }
  if (Math.abs(value - r.score) > 1e-8) return null;
  return { ...r, steps: r.steps.map((s) => ({ ...s, label: LABELS[s.key] })) };
}
