// lib/trendTelemetry.js — the event vocabulary for the trend pipeline, and the
// property allowlist that keeps it privacy-safe.
//
// ONE VOCABULARY, DECLARED ONCE. Event names invented at call sites drift
// ("trend_badge_shown" vs "trend_badge_impression" vs "badge_impression"), and
// three spellings of one event is the same as no event — every funnel silently
// under-counts and nobody notices, because a missing event looks exactly like a
// thing that did not happen.
//
// PRECISE COORDINATES ARE NOT AN ALLOWED PROPERTY, ANYWHERE. The interesting
// question is "did trend-adjusted cards perform better in Tampa", which a coarse
// metro answers completely. `lat`/`lng` would answer it no better and would
// attach a location trace to every impression. scrubTrendProps() drops them, and
// a guard asserts the allowlist has no location field finer than `metro`.
//
// BADGE IMPRESSIONS ARE NOT SUCCESS. Impressions are a denominator. The metrics
// that decide whether this system earns its place are the ACTION rates measured
// against it — opens, saves, directions, bookings — plus the two honesty
// metrics: wrong-match reports and editorial rejection rate. SUCCESS_METRICS
// below is the list, in the repo, so a later "trend badges are up 40%" report
// can be checked against what was agreed to count.

/** Every event this system may emit. */
export const TREND_EVENTS = {
  // ── Ingestion (server / CLI) ──────────────────────────────────────────────
  CSV_VALIDATION_STARTED: "trend_csv_validation_started",
  CSV_VALIDATION_COMPLETED: "trend_csv_validation_completed",
  CSV_VALIDATION_FAILED: "trend_csv_validation_failed",
  SNAPSHOT_IMPORTED: "trend_snapshot_imported",
  SNAPSHOT_STALE: "trend_snapshot_stale",

  // ── Classification ────────────────────────────────────────────────────────
  TOPIC_ACCEPTED: "trend_topic_accepted",
  TOPIC_REJECTED: "trend_topic_rejected",
  MAPPING_ACCEPTED: "trend_mapping_accepted",
  MAPPING_REJECTED: "trend_mapping_rejected",

  // ── Matching & gaps ───────────────────────────────────────────────────────
  PLACE_MATCHED: "trend_place_matched",
  PLACE_MATCH_REJECTED: "trend_place_match_rejected",
  GAP_CREATED: "trend_inventory_gap_created",

  // ── Discovery ─────────────────────────────────────────────────────────────
  SEARCH_QUEUED: "trend_google_search_queued",
  SEARCH_COMPLETED: "trend_google_search_completed",
  SEARCH_FAILED: "trend_google_search_failed",
  CANDIDATE_ACCEPTED: "trend_candidate_accepted",
  CANDIDATE_REJECTED: "trend_candidate_rejected",

  // ── Editorial ─────────────────────────────────────────────────────────────
  EDITORIAL_QUEUED: "trend_editorial_queued",
  EDITORIAL_VERIFIED: "trend_editorial_verified",
  EDITORIAL_FAILED: "trend_editorial_failed",

  // ── Serving (client) ──────────────────────────────────────────────────────
  BADGE_IMPRESSION: "trend_badge_impression",
  ADJUSTED_CARD_IMPRESSION: "trend_adjusted_card_impression",
  DISCLOSURE_OPENED: "trend_disclosure_opened",
  CARD_OPEN: "trend_card_open",
  CARD_SAVE: "trend_card_save",
  CARD_SHARE: "trend_card_share",
  CARD_DIRECTIONS: "trend_card_directions",
  CARD_BOOKING: "trend_card_booking",
  WRONG_MATCH_REPORTED: "trend_wrong_match_reported",
};

/**
 * The ONLY properties any trend event may carry.
 *
 * Adding a field here is a privacy decision, so it happens in this file, in a
 * diff, rather than at a call site nobody reviews.
 */
export const ALLOWED_PROPS = [
  "topic_id",          // the stable external topic key
  "concept_key",
  "menu_list",
  "metro",             // COARSE. The finest location granularity permitted.
  "snapshot_age_days",
  "match_confidence",
  "boost",
  "baseline_rank",
  "adjusted_rank",
  "rights_mode",
  "reason_code",       // machine-readable, never free prose from a licensed row
  "count",
  "status",
  "shadow",
];

/** Property names that must NEVER appear, whatever a call site tries to pass. */
export const FORBIDDEN_PROPS = ["lat", "lng", "latitude", "longitude", "coords", "precise_location", "address", "ip", "user_id", "email", "raw_row", "topic_name"];

/**
 * Strip a property bag to the allowlist.
 *
 * Returns `{ props, dropped }` — `dropped` is deliberately surfaced rather than
 * silently discarded, so a call site passing something it should not can be
 * caught in dev instead of quietly losing the field and looking like it worked.
 *
 * `topic_name` is forbidden while rights are unconfirmed even though it looks
 * harmless: the topic string is licensed content, and shipping it to a
 * third-party analytics processor is redistribution. `topic_id` carries the same
 * analytical value without the licence question.
 */
export function scrubTrendProps(props) {
  const out = {}, dropped = [];
  for (const [k, v] of Object.entries(props || {})) {
    if (ALLOWED_PROPS.includes(k)) out[k] = v;
    else dropped.push(k);
  }
  return { props: out, dropped };
}

/**
 * The metrics that decide whether this feature is worth keeping.
 *
 * Every entry names its DENOMINATOR, because a rate without one is the shape
 * that lets "impressions are up" masquerade as "the feature works".
 */
export const SUCCESS_METRICS = [
  { metric: "card_open_rate", numerator: "trend_card_open", denominator: "trend_adjusted_card_impression" },
  { metric: "save_rate", numerator: "trend_card_save", denominator: "trend_adjusted_card_impression" },
  { metric: "directions_rate", numerator: "trend_card_directions", denominator: "trend_adjusted_card_impression" },
  { metric: "booking_rate", numerator: "trend_card_booking", denominator: "trend_adjusted_card_impression" },
  { metric: "disclosure_open_rate", numerator: "trend_disclosure_opened", denominator: "trend_badge_impression" },
  { metric: "wrong_match_rate", numerator: "trend_wrong_match_reported", denominator: "trend_place_matched", inverse: true },
  { metric: "editorial_rejection_rate", numerator: "trend_editorial_failed", denominator: "trend_editorial_queued", inverse: true },
  { metric: "search_to_card_coverage", numerator: "trend_candidate_accepted", denominator: "trend_google_search_completed" },
];

/**
 * The comparison that actually answers "did this help".
 *
 * Impression counts cannot answer it: a boosted card is shown MORE by
 * construction, so its raw open count rises even if the boost made the ordering
 * worse. The honest read is the per-impression RATE of a trend-adjusted card
 * against the same surface's unadjusted baseline.
 */
export const EVALUATION_NOTE =
  "Compare per-impression rates of trend-adjusted cards against unadjusted cards on the SAME surface and metro. " +
  "Raw counts rise automatically when a card is boosted up the list and prove nothing.";
