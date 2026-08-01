// lib/envPlaceholder.js — A PLACEHOLDER IS NOT A CREDENTIAL.
//
// WHERE THIS CAME FROM (live-verified 2026-07-31). Six NEXT_PUBLIC_* vars are
// flagged "Sensitive" in the Vercel dashboard, and `vercel env pull` cannot read
// a sensitive value back — it writes the literal string "[SENSITIVE]" instead.
// So sourcing .env.production.local sets NEXT_PUBLIC_VIATOR_PID="[SENSITIVE]",
// and lib/affiliates.js stamped that straight onto every Viator URL:
//
//     https://www.viator.com/tours/x?pid=%5BSENSITIVE%5D&mcid=42383&medium=link
//
// THAT IS WORSE THAN AN UNSET VAR, and it is the VRBO failure wearing a
// configured var's clothes. Unset fails CLOSED — ticketsUrl() returns null, the
// CTA disappears, the slot is freed. A junk value fails OPEN: a working,
// unattributed viator.com link that converts and pays us nothing, while every
// presence check (`(v || "").trim().length > 3`) reports green because
// "[SENSITIVE]" is eleven characters long.
//
// THE RULE: a value that cannot possibly be a real credential is treated exactly
// as if the var were never set, so the degrade path is the one that is visible.
//
// DELIBERATELY EXACT-MATCH, NEVER SUBSTRING. Rejecting a REAL id would take
// revenue to zero silently — the precise failure this file exists to prevent —
// so the list holds only strings no partner would ever issue. The guard suite's
// own fixtures ("P00000000", "P_TEST_000000", "TEST_GYG_PID") must keep working,
// and are asserted to in scripts/check-monetized-degrade.mjs.
//
// This module reads NOTHING from process.env by design: it takes a value and
// classifies it. That keeps it out of the check-env-discipline ratchet and makes
// it trivially testable from either side.

const SENTINELS = new Set([
  "[sensitive]", "sensitive",          // Vercel's own placeholder for a sensitive var
  "changeme", "change_me", "change-me",
  "placeholder", "todo", "tbd", "n/a",
  "undefined", "null", "nan", "unset", "none",
]);
const ANGLED = /^<[^>]*>$/;                                  // <your-pid-here>
const YOURS = /^your[_-]?\w*[_-]?(?:key|id|pid|token|secret)$/i;  // YOUR_API_KEY
const ALL_X = /^x{3,}$/i;                                    // xxxxxx

/**
 * True when `raw` is obviously a stand-in rather than a real credential.
 * Pure; never throws; a non-string is coerced, so undefined/null read as empty
 * (empty is "unset", not "placeholder" — the caller already handles unset).
 */
export function isPlaceholderCredential(raw) {
  const v = String(raw == null ? "" : raw).trim();
  if (!v) return false;
  return SENTINELS.has(v.toLowerCase()) || ANGLED.test(v) || YOURS.test(v) || ALL_X.test(v);
}

/**
 * Read a credential the way every money path should: trimmed, and EMPTY when the
 * value is a placeholder — so `if (!PID) return null` fails closed on junk config
 * exactly as it already does on missing config.
 */
export function credential(raw) {
  const v = String(raw == null ? "" : raw).trim();
  return isPlaceholderCredential(v) ? "" : v;
}
