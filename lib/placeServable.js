// lib/placeServable.js — APPROVE THE PLACE WHOSE EDITORIAL IS ACTUALLY RETURNED.
//
// Owner, 2026-09-05, reviewing b840e2e0: "The gate approves the supplied ID or
// first matching name, but later fallback code can select an Atlas or static
// recommendation using other names. The status check must apply to the actual
// place whose editorial is returned."
//
// He is right and this is the important correction. The previous version ran ONE
// gate up front on the request's id, or on the FIRST name that matched
// inventory. But /api/editorial's tier 3 iterates EVERY name candidate and
// returns whichever Atlas card matches — a card keyed to a DIFFERENT place than
// the one approved. An event carrying "Van Wezel" plus a venue alias could clear
// the gate on the first name and be served a card for the second. Checking one
// identity and serving another is not a gate, it is a coincidence.
//
// So the model is per-candidate: every tier resolves the editorial it is about
// to return to a CANONICAL place, and asks approvePlace() about THAT place.
//
// THREE MORE CORRECTIONS FROM THE SAME REVIEW:
//
// 1. `excluded` IS A SEPARATE COLUMN. wf_inventory has BOTH `status` (text) and
//    `excluded` (boolean). The old gate selected only `status`, so an
//    OPERATIONAL row with excluded = true would have been approved. Measured
//    2026-09-05: 0 such rows today and 16 with status='EXCLUDED' — so this is a
//    LATENT hole, not a live one, and it is covered by a synthetic fixture
//    because production has no instance to point at.
// 2. A MALFORMED RESPONSE IS NOT "NO ROW". The old code let any non-array or
//    unparseable body fall through as found:false, which for a name lookup
//    reached the allow-unverified branch and served editorial. Anything that is
//    not a well-formed array of row objects is now an ERROR, and errors refuse.
// 3. "WE CANNOT VERIFY IT" IS NOT "IT IS SAFE". The old UNVERIFIABLE_NAME_ONLY
//    branch served editorial for a name inventory does not know. The owner's
//    rule stands: preserve the handwritten content, resolve its identity, and
//    WITHHOLD the recommendation while that identity is unverified. The content
//    in lib/editorial.js is not deleted — it is retained and used for identity
//    resolution, and simply not served until the place resolves.
//
// FAIL CLOSED EVERYWHERE. Unknown, unresolved, malformed, errored, missing: all
// refuse. The only "yes" is a resolved place that is OPERATIONAL and not
// excluded.
//
// NEVER CACHED. cache: "no-store" on every lookup. Caching a safety check
// reproduces the bug this file exists to close — an answer computed while the
// place was open, replayed after it shut.

import { isOperational as statusIsOperational } from "./businessStatus.js";

export const SERVABLE = "servable";
export const REFUSED_STATUS = "refused-status";
export const REFUSED_EXCLUDED = "refused-excluded";
export const REFUSED_NO_STATUS = "refused-no-status";
export const REFUSED_UNKNOWN_PLACE = "refused-unknown-place";
export const REFUSED_UNRESOLVED_IDENTITY = "refused-unresolved-identity";
export const REFUSED_LOOKUP_FAILED = "refused-lookup-failed";
export const REFUSED_MALFORMED = "refused-malformed";

/**
 * Servable for GATE purposes: status present AND operational.
 * lib/businessStatus.isOperational treats a MISSING status as operational —
 * correct when filtering a place list ("no status is not evidence of closure"),
 * wrong in a gate. That case is real: 3 of 20,086 rows have a null status.
 */
export function statusServable(status) {
  const s = String(status == null ? "" : status).trim();
  if (!s) return false;
  return statusIsOperational(s);
}

function creds() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return base && anon ? { base, anon } : null;
}

// A row is usable only if it is a plain object carrying the fields we asked for.
// A string, a number, null, or an error envelope ({"message": "..."} — which
// PostgREST returns on a bad query and which json() parses happily) is MALFORMED,
// not "no such place".
function readRows(body) {
  if (!Array.isArray(body)) return { malformed: true, rows: [] };
  for (const r of body) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return { malformed: true, rows: [] };
    if (!("status" in r)) return { malformed: true, rows: [] };
  }
  return { malformed: false, rows: body };
}

const SELECT = "select=place_id,status,excluded";

async function query(path, fetchImpl) {
  const c = creds();
  const f = fetchImpl || globalThis.fetch;
  if (!c || typeof f !== "function") return { errored: true, malformed: false, rows: [] };
  try {
    const r = await f(`${c.base}${path}`, {
      headers: { apikey: c.anon, Authorization: "Bearer " + c.anon },
      cache: "no-store",
    });
    if (!r || !r.ok) return { errored: true, malformed: false, rows: [] };
    let body;
    try { body = await r.json(); } catch { return { errored: false, malformed: true, rows: [] }; }
    const parsed = readRows(body);
    return { errored: false, malformed: parsed.malformed, rows: parsed.rows };
  } catch { return { errored: true, malformed: false, rows: [] }; }
}

/** The inventory row for a place_id, if any. */
export async function lookupById(placeId, fetchImpl) {
  const id = String(placeId || "").trim();
  if (!id) return { errored: false, malformed: false, rows: [] };
  return query(`/rest/v1/wf_inventory?${SELECT}&place_id=eq.${encodeURIComponent(id)}&limit=1`, fetchImpl);
}

/** The inventory row for an EXACT place name. Exact only — a fuzzy match could
 *  approve the wrong place, which is the failure this whole file is about. */
export async function lookupByName(name, fetchImpl) {
  const n = String(name || "").trim();
  if (!n) return { errored: false, malformed: false, rows: [] };
  return query(`/rest/v1/wf_inventory?${SELECT}&name=eq.${encodeURIComponent(n)}&limit=1`, fetchImpl);
}

function judge(row) {
  if (row.excluded === true) return { ok: false, reason: REFUSED_EXCLUDED, status: row.status || null };
  if (!String(row.status || "").trim()) return { ok: false, reason: REFUSED_NO_STATUS, status: null };
  return statusServable(row.status)
    ? { ok: true, reason: SERVABLE, status: row.status }
    : { ok: false, reason: REFUSED_STATUS, status: row.status };
}

/**
 * APPROVE ONE CANONICAL PLACE, by its place_id. This is what every tier calls
 * about the place it is about to serve — never about the place the request
 * happened to name.
 * @returns {Promise<{ok:boolean, reason:string, status:string|null}>}
 */
export async function approvePlace(placeId, fetchImpl) {
  const id = String(placeId || "").trim();
  if (!id) return { ok: false, reason: REFUSED_UNRESOLVED_IDENTITY, status: null };
  const r = await lookupById(id, fetchImpl);
  if (r.errored) return { ok: false, reason: REFUSED_LOOKUP_FAILED, status: null };
  if (r.malformed) return { ok: false, reason: REFUSED_MALFORMED, status: null };
  if (!r.rows.length) return { ok: false, reason: REFUSED_UNKNOWN_PLACE, status: null };
  return judge(r.rows[0]);
}

/**
 * Resolve a NAME to a canonical place and approve it. Used by the tiers whose
 * content is keyed by name (the Atlas name index and the handwritten set) when
 * no place_id is carried by the content itself.
 * An unresolved name REFUSES: "we cannot verify it" does not establish that
 * recommending it is safe.
 */
export async function approveByName(name, fetchImpl) {
  const r = await lookupByName(name, fetchImpl);
  if (r.errored) return { ok: false, reason: REFUSED_LOOKUP_FAILED, status: null };
  if (r.malformed) return { ok: false, reason: REFUSED_MALFORMED, status: null };
  if (!r.rows.length) return { ok: false, reason: REFUSED_UNRESOLVED_IDENTITY, status: null };
  return judge(r.rows[0]);
}

/**
 * Approve a CANDIDATE: prefer the place_id the content itself carries (an Atlas
 * card knows its own placeId), and fall back to resolving its name. The point is
 * that the identity judged is the identity SERVED.
 */
export async function approveCandidate({ placeId, name } = {}, fetchImpl) {
  if (String(placeId || "").trim()) return approvePlace(placeId, fetchImpl);
  return approveByName(name, fetchImpl);
}
