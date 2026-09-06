// lib/placeServable.js — ONE operational-status check, for EVERY editorial tier.
//
// Owner, 2026-09-05: "Atlas and static editorial bypass the view... An Atlas card
// can return before any database check." He is right, and it was measured, not
// theoretical: of the 264 Atlas cards in data/atlas/editorial-cards.json, FOUR
// already point at places Wayfind does not serve (2 EXCLUDED, 1
// CLOSED_TEMPORARILY, 1 with no wf_inventory row at all). Tier 1 returned those
// before any database call, so gating only the wf_editorial tier fixed the
// smallest of the four paths.
//
// /api/editorial has FOUR tiers and only one of them touched the database:
//   1. Atlas card by place_id      -> returned immediately, no check
//   2. wf_editorial (the view)     -> checked
//   3. Atlas card by exact name    -> no check
//   4. lib/editorial.js, 295 static entries by name -> no check
//
// THE RULE, applied once here so every tier inherits it:
// a recommendation is only shown for a place Wayfind still serves.
//
// IDENTITY, THEN STATUS. A caller may pass an id (the Detail sheet does for a
// place card) or only names (an event carrying a venue name —
// lib/editorialLookup.editorialRequestQuery sets `id` only when detail.id
// exists). So identity is resolved first, then judged:
//
//   id given, OPERATIONAL            -> serve
//   id given, any other status       -> REFUSE (closed, excluded, future)
//   id given, not in inventory       -> REFUSE. An id is a strong identity
//                                       claim; a place we hold no inventory row
//                                       for is not one we serve.
//   no id, name matches inventory,
//        non-OPERATIONAL             -> REFUSE
//   no id, name matches nothing      -> SERVE, and say so. We have no evidence
//                                       the place is closed either, and
//                                       refusing every unverifiable name would
//                                       delete the 295-entry hand-written
//                                       editorial set for no safety gain. This
//                                       is the one residual and it is reported
//                                       by the reason code, never hidden.
//
// FAIL CLOSED ON ERROR. A network failure or a missing key returns "unknown",
// and an id-bearing request treats unknown as refuse. A check that fails open is
// not a check — the whole point is that a closed venue must not be recommended
// because a lookup timed out.
//
// NEVER CACHED. The status lookup is cache: "no-store" on purpose. Caching the
// safety check would reproduce the exact bug this file exists to close: an
// answer computed while the place was open, replayed after it shut.

// REUSE, do not redefine. lib/businessStatus.isOperational is this repo's one
// operational predicate and check-imports flagged a third copy of the name the
// moment I wrote one (lib/businessStatus and lib/nightlifeRail already had it).
// Its rule is `!st || st === "OPERATIONAL"` — a MISSING status is not evidence
// of closure, which is correct for filtering a place list.
//
// A GATE NEEDS THE OPPOSITE FOR MISSING, and that case is real: 3 of 20,086
// wf_inventory rows have a null status (measured 2026-09-05). So the predicate
// is imported and used unchanged for a KNOWN status, and the null case is
// handled explicitly below with its own reason code, rather than by writing a
// fourth isOperational that quietly disagrees with the other three.
import { isOperational as statusIsOperational } from "./businessStatus.js";

/** Reason codes, so a refusal is explainable and testable rather than a bare null. */
export const SERVABLE = "servable";
export const REFUSED_STATUS = "refused-status";
export const REFUSED_UNKNOWN_ID = "refused-unknown-id";
export const REFUSED_LOOKUP_FAILED = "refused-lookup-failed";
export const REFUSED_NO_STATUS = "refused-no-status";
export const UNVERIFIABLE_NAME_ONLY = "unverifiable-name-only";

/**
 * Servable for GATE purposes: the status must be present AND operational.
 * Differs from businessStatus.isOperational deliberately and only on the
 * missing case — see the note at the top of this file.
 */
export function statusServable(status) {
  const s = String(status == null ? "" : status).trim();
  if (!s) return false;                 // unknown is not a green light in a gate
  return statusIsOperational(s);
}

function creds() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return base && anon ? { base, anon } : null;
}

/**
 * Inventory status for one place_id, or null when it cannot be determined.
 * @param {string} id
 * @param {typeof fetch} [fetchImpl] injected in tests
 * @returns {Promise<{found:boolean, status:string|null, errored:boolean}>}
 */
export async function inventoryStatusById(id, fetchImpl) {
  const c = creds();
  const f = fetchImpl || globalThis.fetch;
  if (!c || !id || typeof f !== "function") return { found: false, status: null, errored: true };
  try {
    const r = await f(
      `${c.base}/rest/v1/wf_inventory?select=status&place_id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers: { apikey: c.anon, Authorization: "Bearer " + c.anon }, cache: "no-store" },
    );
    if (!r || !r.ok) return { found: false, status: null, errored: true };
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? { found: true, status: row.status || null, errored: false }
               : { found: false, status: null, errored: false };
  } catch { return { found: false, status: null, errored: true }; }
}

/**
 * Inventory status for an exact place NAME, when no id was supplied.
 * Exact match only — a fuzzy match could refuse the wrong place, or worse,
 * approve one.
 */
export async function inventoryStatusByName(name, fetchImpl) {
  const c = creds();
  const f = fetchImpl || globalThis.fetch;
  const n = String(name || "").trim();
  if (!c || !n || typeof f !== "function") return { found: false, status: null, errored: !c };
  try {
    const r = await f(
      `${c.base}/rest/v1/wf_inventory?select=status&name=eq.${encodeURIComponent(n)}&limit=1`,
      { headers: { apikey: c.anon, Authorization: "Bearer " + c.anon }, cache: "no-store" },
    );
    if (!r || !r.ok) return { found: false, status: null, errored: true };
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? { found: true, status: row.status || null, errored: false }
               : { found: false, status: null, errored: false };
  } catch { return { found: false, status: null, errored: true }; }
}

/**
 * THE GATE every editorial tier passes through.
 * @returns {Promise<{ok:boolean, reason:string, status:string|null}>}
 */
export async function editorialServable({ id, names } = {}, fetchImpl) {
  const theId = String(id || "").trim();
  if (theId) {
    const s = await inventoryStatusById(theId, fetchImpl);
    if (s.errored) return { ok: false, reason: REFUSED_LOOKUP_FAILED, status: null };
    if (!s.found) return { ok: false, reason: REFUSED_UNKNOWN_ID, status: null };
    if (!String(s.status || "").trim()) return { ok: false, reason: REFUSED_NO_STATUS, status: null };
    return statusServable(s.status)
      ? { ok: true, reason: SERVABLE, status: s.status }
      : { ok: false, reason: REFUSED_STATUS, status: s.status };
  }
  for (const n of Array.isArray(names) ? names : []) {
    const s = await inventoryStatusByName(n, fetchImpl);
    if (s.errored) return { ok: false, reason: REFUSED_LOOKUP_FAILED, status: null };
    if (s.found) {
      if (!String(s.status || "").trim()) return { ok: false, reason: REFUSED_NO_STATUS, status: null };
      return statusServable(s.status)
        ? { ok: true, reason: SERVABLE, status: s.status }
        : { ok: false, reason: REFUSED_STATUS, status: s.status };
    }
  }
  // No id, and no name we hold inventory for. Unverifiable, not proven bad.
  return { ok: true, reason: UNVERIFIABLE_NAME_ONLY, status: null };
}
