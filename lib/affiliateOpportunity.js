// lib/affiliateOpportunity.js — a monetization opportunity seen AGAIN is new
// information.
//
// THE DEFECT THIS REPLACES (owner's affiliate deep-link audit, 2026-09-08).
// app/api/cron/atlas-build wrote the opportunity queue with
//
//     POST /rest/v1/wf_affiliate_opportunities?on_conflict=place_id
//     Prefer: resolution=ignore-duplicates
//
// and `ignore-duplicates` SKIPS an existing row rather than updating it. Every
// re-sighting of a place already in the queue was discarded: `hits` frozen,
// `last_seen_at` frozen, `resolved_at` never cleared. Measured on production:
// 63 rows, all at hits = 1, all with first_seen_at = last_seen_at = 2026-08-21.
// It looked like a queue nothing had happened to. It was a queue nothing COULD
// happen to.
//
// The increment has to be atomic and server-side — a read-modify-write across
// the network loses increments the moment two Atlas categories overlap — so the
// whole batch goes through one RPC:
// supabase/migrations/20260909_wf_affiliate_opportunity_seen.sql.
//
// WHY THIS LIVES IN lib/ AND USES db.rpc() RATHER THAN A RAW fetch. The route
// that calls it uses raw PostgREST fetches throughout, so the obvious thing was
// another raw fetch. But scripts/check-rpc-schema-contract.mjs — the guard that
// exists BECAUSE #1153 shipped a 5-argument caller against a 3-argument
// production function — discovers call sites by matching `db.rpc(` / `supabase.rpc(`
// under app/ and lib/ only. A raw fetch to /rest/v1/rpc/... is invisible to it.
// Writing this as a lib helper with a literal name and a literal argument object
// is what puts the new RPC under that guard's protection, and it is worth more
// than matching the neighbouring style.
//
// FAIL-SOFT, like recordPulse: the opportunity queue is a revenue worklist, not
// a correctness dependency. A failure here must never take down an Atlas run.
// It returns what happened so the caller can report EFFECTS rather than
// attempts — the previous code set `opps = oppRows.length`, the count of rows it
// sent, which stayed truthful-looking at 63 while the database was accepting
// none of them.
import { createClient } from "@supabase/supabase-js";
import { sbEnv } from "./serverCache.js";

/** Shape one Atlas candidate into a queue row. Unknown fields are dropped. */
export function toOpportunityRow(place, { reason, suggestedPartner, surface = null } = {}) {
  const placeId = String((place && place.place_id) || "").trim();
  if (!placeId) return null;
  return {
    place_id: placeId,
    name: place.name || null,
    category: place.category || null,
    reason: reason || null,
    suggested_partner: suggestedPartner || null,
    surface,
  };
}

/**
 * Record a batch of sightings.
 *
 * @returns {{ok: boolean, inserted: number, incremented: number, reopened: number, seen: number, reason: string|null}}
 *          `seen` is inserted + incremented: rows the DATABASE acted on, never
 *          the number sent. Every count is 0 on any failure path.
 */
export async function recordAffiliateOpportunities(rows, { client = null } = {}) {
  const clean = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.place_id || "").trim());
  const none = { ok: false, inserted: 0, incremented: 0, reopened: 0, seen: 0, reason: null };
  if (!clean.length) return { ...none, ok: true, reason: "nothing to record" };

  let db = client;
  if (!db) {
    const s = sbEnv();
    if (!s) return { ...none, reason: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" };
    db = createClient(s.url, s.key, { auth: { persistSession: false } });
  }

  try {
    const { data, error } = await db.rpc("wf_affiliate_opportunity_seen", { p_rows: clean });
    if (error) return { ...none, reason: String(error.message || error).slice(0, 200) };
    // `returns table` comes back as an array. A malformed body is a failure, not
    // an empty success — the ownedPool rule: we must not report "0 recorded" when
    // what actually happened is "we could not tell".
    const r = Array.isArray(data) ? data[0] : data;
    if (!r || typeof r !== "object") return { ...none, reason: "wf_affiliate_opportunity_seen returned no result row" };
    if (![r.inserted, r.incremented, r.reopened].every((v) => Number.isSafeInteger(v) && v >= 0) || r.reopened > r.incremented) {
      return { ...none, reason: "wf_affiliate_opportunity_seen returned invalid counters" };
    }
    const inserted = r.inserted;
    const incremented = r.incremented;
    const reopened = r.reopened;
    return { ok: true, inserted, incremented, reopened, seen: inserted + incremented, reason: null };
  } catch (e) {
    return { ...none, reason: String((e && e.message) || e).slice(0, 200) };
  }
}
