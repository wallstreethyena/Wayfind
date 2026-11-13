// lib/attributionHygiene.js — Deterministic synthetic-row predicates & analytical exclusion
// for revenue attribution tables (`wf_viator_clicks`, `wf_tp_clicks`).
//
// Why analytical exclusion ships BEFORE any destructive table cleanup (Mission 4):
//   1. Revenue attribution carries a higher deletion bar than ordinary test data.
//   2. Stopping the writer + excluding synthetic rows analytically guarantees all
//      reporting, reconcilers, and operator dashboards read clean customer truth
//      immediately, with zero risk of deleting a real click.

import crypto from "node:crypto";

/**
 * Exact deterministic predicate identifying synthetic `wf_viator_clicks` fixture rows.
 * Every guard-leaked row in production carries `offer_id = '1234P5'` from
 * `https://www.viator.com/tours/Orlando/Airboat/d827-1234P5` (not a real Viator tour;
 * Orlando's destination ID is d663, and 1234P5 is the repo's hardcoded guard fixture).
 */
export function isSyntheticViatorClickRow(row) {
  if (!row || typeof row !== "object") return false;
  const offerId = String(row.offer_id || "").trim();
  const campaign = String(row.placement_campaign || "").trim();
  const surface = String(row.surface || "").trim().toLowerCase();
  const contentId = String(row.content_id || "").trim();

  if (offerId.toUpperCase() === "1234P5") return true;
  if (/^(?:guardtest|fixture|test_offer)[-_]/i.test(offerId)) return true;
  if (/(?:^|-)1234p5$/i.test(campaign) || /\bguardtest\b/i.test(campaign)) return true;
  if (surface === "qa") return true;
  if (/^(?:guardtest|claude-verify|codex-verify|synthetic-probe)/i.test(contentId)) return true;
  return false;
}

/**
 * Exact deterministic predicate identifying synthetic `wf_tp_clicks` QA rows
 * (e.g., `surface = 'qa'`, `content_id = 'claude-verify-20260923'`).
 */
export function isSyntheticTravelpayoutsClickRow(row) {
  if (!row || typeof row !== "object") return false;
  const offerId = String(row.offer_id || "").trim();
  const surface = String(row.surface || "").trim().toLowerCase();
  const contentId = String(row.content_id || "").trim();

  if (surface === "qa") return true;
  if (/^(?:1234P5|guardtest|fixture|test_offer)/i.test(offerId)) return true;
  if (/^(?:guardtest|claude-verify|codex-verify|synthetic-probe)/i.test(contentId)) return true;
  return false;
}

/**
 * PostgREST query filter fragment excluding synthetic `wf_viator_clicks` rows analytically.
 */
export const VIATOR_CLEAN_CLICKS_POSTGREST_FILTER =
  "offer_id=neq.1234P5&surface=neq.qa";

export const VIATOR_SYNTHETIC_FIXTURE_POSTGREST_FILTER = "offer_id=eq.1234P5";

/**
 * PostgREST query filter fragment excluding synthetic `wf_tp_clicks` rows analytically.
 */
export const TP_CLEAN_CLICKS_POSTGREST_FILTER = "surface=neq.qa";

export function filterCleanViatorClicks(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => !isSyntheticViatorClickRow(r));
}

export function filterCleanTravelpayoutsClicks(rows) {
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => !isSyntheticTravelpayoutsClickRow(r),
  );
}

/**
 * Compute deterministic SHA-256 digest over a sorted list of `click_token`s
 * for archive-before-delete verification (Mission 4).
 */
export function hashClickTokenSet(tokens) {
  const sorted = [...new Set((tokens || []).map((t) => String(t || "").trim()).filter(Boolean))].sort();
  const h = crypto.createHash("sha256");
  for (const t of sorted) {
    h.update(t, "utf8");
    h.update("\n", "utf8");
  }
  return {
    count: sorted.length,
    sha256: h.digest("hex"),
  };
}
