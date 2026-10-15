// lib/photoVisitorCap.js — a per-visitor, per-day ceiling on PAID photo grants
// (2026-10-14). Live evidence after the page-origin gate shipped: a real Chrome
// (Frankfurt, old UA) still reached the paid lane from rendered pages. A browser
// that runs the page cannot be told from a person by headers, but it CAN be
// bounded: one visitor bucket may buy at most VISITOR_DAILY_CAP photos a day.
//
// No new table and no budget change: it reuses the atomic wf_spend_take ledger
// with a per-visitor-per-day sku (the precedent is lib/eventProviderSpend.js).
// The bucket is bucketHash() (sha256 of a day-salted IP+UA, truncated), so the
// sku changes every day and cannot link a visitor across days.
//
// FAIL-OPEN on purpose and ONLY here: the global photos ledger (10,000 cap, paid
// switch, breaker) still runs right after this, so an unreadable visitor ledger
// must never turn into a blackout for real visitors.
import { takeFromLedgerDetailed } from "./spendGate.js";

// RAISED 80 -> 1500 (owner, 2026-10-15: "I WANT THE PICTURES EVERYWHERE", for
// anyone, signed in or not). At 80 a real person who browses several rails ran
// out within one session and every later card showed "Photo unavailable"
// (live: x-wayfind-photo-result spend-denied while the month sat at 4,003 of
// 10,000). 1500 sits far above any human day and still stops one runaway script
// from draining the month; GOOGLE_PHOTOS_MONTH_CAP remains the real bill guard.
export const VISITOR_DAILY_CAP = 1500;

export function visitorSku(bucket) {
  const b = String(bucket || "");
  return /^[a-f0-9]{16,48}$/.test(b) ? "pv:" + b : "";
}

/**
 * @returns {Promise<{ok:boolean, reason:string}>}  ok:false only with reason "cap".
 */
export async function takeVisitorToken({ bucket, take = takeFromLedgerDetailed, cap = VISITOR_DAILY_CAP } = {}) {
  const sku = visitorSku(bucket);
  if (!sku) return { ok: true, reason: "no-bucket" };
  let r;
  try { r = await take(sku, cap); } catch { return { ok: true, reason: "error-open" }; }
  if (r && r.ok) return { ok: true, reason: "granted" };
  if (r && r.reason === "cap") return { ok: false, reason: "cap" };
  return { ok: true, reason: "error-open" };
}
