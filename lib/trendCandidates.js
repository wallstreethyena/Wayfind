// lib/trendCandidates.js — the lifecycle a newly discovered Google Place ID
// walks before it is allowed to be a card, and the gate at the end of it.
//
// A PLACE DISCOVERED BY A TREND IS NOT A PLACE WAYFIND HAS VETTED. Google
// returned it for a text query; that is all we know. It might be in the wrong
// metro, permanently closed, a retail store that sells the equipment rather than
// a venue that offers the activity, or a duplicate of a row we already own under
// a different name. Publishing on discovery would mean the trend feed can put
// arbitrary businesses on Wayfind's surfaces, which is precisely the authority
// a search result must never have.
//
// So the states below are not bookkeeping — each one is a specific question that
// has to be answered YES before the next is even asked, and every failure state
// is a distinct answer. Collapsing them into a boolean is what makes a pipeline
// impossible to debug: "rejected: 412" tells nobody whether to fix the query,
// the classifier, or the metro bounds.

/** Forward progress. Index order IS the required order — no state may be skipped. */
export const STATES = [
  "discovered",           // Google returned a Place ID for a controlled query
  "identity_resolved",    // Place ID resolves to a real, singular, non-duplicate place
  "geo_verified",         // coordinates are real and inside the metro we searched
  "category_classified",  // Wayfind category + types assigned by the existing classifier
  "operational_verified", // business is OPERATIONAL and content is fresh
  "trend_match_verified", // the concept that caused the search actually matches it
  "editorial_pending",    // handed to the existing Atlas queue
  "editorial_verified",   // Atlas produced a VERIFIED row
  "card_ready",           // every gate in cardReadyGate() passes
  "published",            // visible to a reader
];

/** Terminal or parked outcomes. Each names a different remedy. */
export const FAILURE_STATES = {
  wrong_geo: "resolved outside the metro that was searched",
  wrong_category: "classified into a category the concept does not allow",
  product_not_place: "a retailer/product listing, not a venue offering the experience",
  duplicate: "same Google Place ID (or same venue) already in inventory",
  permanently_closed: "businessStatus is CLOSED_PERMANENTLY",
  temporary_or_uncertain: "temporarily closed or status unknown",
  insufficient_evidence: "no evidence the venue actually offers the concept",
  editorial_failed: "Atlas produced a row that failed verification",
  trend_stale: "the topic that discovered it expired before it could publish",
  excluded: "matched an existing Wayfind exclusion rule",
  needs_review: "classification uncertain — parked for a human",
};

export const isFailureState = (s) => Object.prototype.hasOwnProperty.call(FAILURE_STATES, s);

/**
 * Legal transition check. Forward one step at a time, or sideways into any
 * failure state at any point.
 *
 * REFUSING TO SKIP IS THE POINT. A candidate that jumps `discovered` →
 * `card_ready` has skipped geo, category and editorial verification, and the
 * only way that happens is a bug or a hand-written UPDATE. Either way the answer
 * is to refuse, loudly, rather than to publish something unverified.
 */
export function canTransition(from, to) {
  if (isFailureState(to)) return { ok: true, reason: `→ failure state ${to}: ${FAILURE_STATES[to]}` };
  if (isFailureState(from)) {
    // Recovery is allowed only back to the START of verification, never into the
    // middle — whatever failed has to be re-proven, not assumed.
    if (to === "discovered") return { ok: true, reason: "re-entering the pipeline from a failure state" };
    return { ok: false, reason: `cannot go from failure state "${from}" to "${to}" — re-enter at "discovered"` };
  }
  const i = STATES.indexOf(from), j = STATES.indexOf(to);
  if (i === -1) return { ok: false, reason: `"${from}" is not a known state` };
  if (j === -1) return { ok: false, reason: `"${to}" is not a known state` };
  if (j === i + 1) return { ok: true, reason: `${from} → ${to}` };
  if (j <= i) return { ok: false, reason: `"${to}" does not advance from "${from}"` };
  return { ok: false, reason: `cannot skip from "${from}" to "${to}" — ${STATES.slice(i + 1, j).join(", ")} would go unverified` };
}

/**
 * THE CARD-READY GATE. Returns { ready, failures[] } — every failing condition,
 * not just the first, so one pass tells an operator everything a candidate needs
 * rather than one thing per re-run.
 *
 * `require` lets a surface state its own extra needs (imagery, price band)
 * without this function growing a per-surface branch.
 */
export function cardReadyGate(candidate, opts) {
  const { nowMs = Date.now(), require: req = {}, maxContentAgeDays = 30 } = opts || {};
  const f = [];
  const c = candidate || {};

  if (!c.place_id || String(c.place_id).length < 6) f.push("no valid Google Place ID");
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) f.push("coordinates are missing or invalid");
  if (!c.metro) f.push("no metro assigned");
  else if (c.expected_metro && c.metro !== c.expected_metro) f.push(`metro mismatch: resolved "${c.metro}", searched "${c.expected_metro}"`);
  if (!c.category) f.push("no Wayfind category");
  else if (Array.isArray(c.allowed_categories) && c.allowed_categories.length && !c.allowed_categories.includes(c.category)) {
    f.push(`category "${c.category}" is not permitted for concept "${c.concept_key}"`);
  }

  const status = String(c.status || "").toUpperCase();
  if (status !== "OPERATIONAL") f.push(`business status is "${c.status || "unknown"}", not OPERATIONAL`);

  const refreshed = Date.parse(c.refreshed_at || "");
  if (!Number.isFinite(refreshed)) f.push("no content-refresh timestamp — freshness cannot be established");
  else if ((nowMs - refreshed) / 86400000 > maxContentAgeDays) {
    f.push(`Google content is ${((nowMs - refreshed) / 86400000).toFixed(0)}d old, past the ${maxContentAgeDays}d limit`);
  }

  // VERIFIED editorial, not merely present. An Atlas row carrying issues is a
  // parked draft; publishing it is the exact failure the atlas-build header
  // documents (525 rows written, 0 publishable).
  if (!c.editorial) f.push("no editorial row");
  else if (c.editorial.verified !== true) {
    f.push(`editorial is not verified${Array.isArray(c.editorial.issues) && c.editorial.issues.length ? ` (${c.editorial.issues.slice(0, 3).join(", ")})` : ""}`);
  }

  if (!c.trend_match_active) f.push("no active trend match (the topic expired or was denied)");
  if (c.needs_review === true) f.push("needs_review is set — a human has not confirmed the classification");
  if (c.excluded === true) f.push("row is excluded by an existing Wayfind rule");

  // AGENTS.md §12 — a mismatched CTA is worse than no CTA.
  if (!c.cta_kind) f.push("no resolved CTA");
  else if (Array.isArray(c.allowed_cta_kinds) && c.allowed_cta_kinds.length && !c.allowed_cta_kinds.includes(c.cta_kind)) {
    f.push(`CTA "${c.cta_kind}" does not match this place type`);
  }

  if (req.photo && !c.photo_ref) f.push("this surface requires imagery and there is no photo reference");
  if (req.rating && !(Number.isFinite(c.rating) && Number.isFinite(c.reviews))) f.push("this surface requires rating/review signals and they are absent");
  if (req.priceBand && !Number.isFinite(c.price_level)) f.push("this surface requires a known price band and it is absent");

  return { ready: f.length === 0, failures: f, state: f.length === 0 ? "card_ready" : c.state || "editorial_verified" };
}

/**
 * Reconcile a discovered place against existing inventory BEFORE any write.
 *
 * Locked rows are never overwritten — supabase/places-inventory.sql exists partly
 * because an owner correction was once re-clobbered by a re-run, and a trend
 * pipeline is exactly the sort of automated writer that would do it again.
 */
export function reconcileCandidate(discovered, existingById) {
  const existing = existingById && existingById.get ? existingById.get(discovered.place_id) : null;
  if (!existing) return { action: "insert", place_id: discovered.place_id, reason: "no existing row for this Place ID" };
  if (existing.locked === true) {
    return { action: "skip", place_id: discovered.place_id, reason: "existing row is locked (owner-corrected) — never overwritten" };
  }
  return {
    action: "update_provenance_only", place_id: discovered.place_id,
    // Discovering a place we already own is a SUCCESS for the gap report and a
    // NO-OP for the inventory row: we record which topic found it, and change
    // nothing a human or an earlier classifier decided.
    reason: "already in inventory — recording discovery provenance without touching classification",
  };
}
