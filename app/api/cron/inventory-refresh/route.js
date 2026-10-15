import { gateShut, gateFree } from "../../../../lib/spendGate";
// app/api/cron/inventory-refresh/route.js — keep wf_inventory's Google content
// inside the 30-day freshness ceiling, a few rows at a time.
//
// WHY THIS EXISTS (v8.12, owner report 2026-08-18: "the exploding trends do
// not have the 20 top trending items"). lib/trendMatch.matchConcept refuses
// any row whose refreshed_at is older than MAX_CONTENT_AGE_DAYS (30 — the
// Google ToS content ceiling, the same rule lib/placeDetails caches under).
// Measured that day: manatee-sarasota's 187 rows were last refreshed
// 2026-07-13 — 36 days — so EVERY row failed the gate and the owner's top-20
// trend surface had a matcher, a taxonomy and an inventory and still served
// nothing. Freshness is a pipeline, not a one-time import.
//
// SHAPE: hourly trickle, stalest-first, bounded by ?limit (default 40). A
// metro's whole book cycles well inside the window at ~40/hour, refreshes ride
// the SAME cache-first details path the rest of the site uses, and a Google
// outage degrades to "rows stay stale one more hour", never to invented
// content. 2026-10-14: a row is re-dated only by when Google actually returned
// its content (lib/inventoryRefreshPatch.js); a cached copy is never dated now.
//
// check-cron-honesty: a failed run answers non-2xx via jobFailed; an
// unconfigured run answers jobCannotRun. No failure hides behind a 200.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { getPlaceDetailsDated } from "../../../../lib/placeDetails";
import { inventoryRefreshPatch, refreshSlice, REFRESH_WINDOW_SLOTS } from "../../../../lib/inventoryRefreshPatch.js";
import { recordPulse, budgetGateNote } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

// Refresh anything older than this. Below the 30-day matcher ceiling on
// purpose: rows are renewed BEFORE they expire, so the trend surface never
// sees a gap between "stale" and "refreshed".
const REFRESH_AFTER_DAYS = 25;
const PARALLEL = 5;

export async function GET(req) {
  // COST GUARD (2026-08-25): WAYFIND_GATE=shut stops ALL metered Google spend.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  // 2026-10-14 — THE GATE SKIP IS NOW VISIBLE. This refresher renews the Google
  // coordinates the map may draw (30-day window, lib/coordProvenance.js). While
  // the gate is not open it does nothing, which is the owner's spend decision —
  // but it used to return BEFORE recordPulse, so wf_job_pulse showed no
  // inventory-refresh row at all after 2026-08-25 and a ~50-day stall read as
  // "no data". It now pulses an idle 0/0/0 run labelled "budget limit reached:
  // paid generation disabled" (never a paging incident; lib/jobPulse.js
  // budgetGateNote), AFTER the auth check so an anonymous GET cannot write rows.
  if (gateShut() || gateFree()) {
    const mode = gateShut() ? "shut" : "free";
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: budgetGateNote(mode, "map coordinates are not being renewed; Google-sourced pins age out of the 30-day window") });
    return Response.json({ skipped: "gate " + (mode === "shut" ? "shut" : "free: scheduled re-buys stay off inside the free tier"), gate: mode });
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("inventory-refresh", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(120, Number(u.searchParams.get("limit")) || 40));
  const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * 86400000).toISOString();

  // 2026-10-14 — skip rows a refresh must not touch: excluded rows are never
  // served, and locked (owner-verified) rows carry owner coordinates a Google
  // patch must not overwrite; permanently closed places have nothing to renew.
  // Then take this hour's slice of the stalest window (refreshSlice), so a row
  // that cannot be renewed never wedges the head of the queue.
  const { data: windowRows, error } = await db
    .from("wf_inventory")
    .select("place_id, metro, refreshed_at")
    .lt("refreshed_at", cutoff)
    .or("excluded.is.null,excluded.eq.false")
    .or("locked.is.null,locked.eq.false")
    .or("status.is.null,status.neq.CLOSED_PERMANENTLY")
    .order("refreshed_at", { ascending: true })
    .limit(limit * REFRESH_WINDOW_SLOTS);
  if (error) return jobFailed("inventory-refresh", "stale-row select failed: " + error.message);
  const rows = refreshSlice(windowRows || [], limit, Math.floor(Date.now() / 3600000));
  if (!rows || !rows.length) {
    // v8.29.12 — recordPulse is (job, opts). This passed `db` as the JOB, so
    // String(db) filed every inventory-refresh pulse under the literal job name
    // "[object Object]" — which is exactly what the production pulse table
    // contained. The opts keys were wrong too ({refreshed, failed, scanned}
    // instead of {attempted, succeeded, note}), so attempted and succeeded were
    // always 0. Net effect: the hourly job that keeps 7,800 rows fresh has been
    // invisible to job-watch, the very monitor built to catch a job that
    // succeeds at nothing. Two wrong arguments, five weeks of blindness.
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, note: "nothing stale" });
    return Response.json({ ok: true, refreshed: 0, note: "nothing older than " + REFRESH_AFTER_DAYS + "d" });
  }

  let refreshed = 0, failed = 0, notLive = 0;
  const queue = [...rows];
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      try {
        // 2026-10-14 — NEVER EXTEND BY BUMPING (lib/inventoryRefreshPatch.js):
        // the row is dated by WHEN GOOGLE RETURNED the content (a live fetch =
        // now; a cached copy = its recorded write time) and carries that
        // content's lat/lng. Undated or not-newer content is no refresh: the
        // row is left alone and ages out of the map's 30-day window honestly.
        // Same single details read as before: no added provider calls.
        const dated = await getPlaceDetailsDated(row.place_id);
        const patch = inventoryRefreshPatch(row.place_id, dated, Date.now(), row.refreshed_at);
        if (!patch) { notLive++; continue; }
        const { error: upErr } = await db.from("wf_inventory").update(patch).eq("place_id", row.place_id);
        if (upErr) failed++; else refreshed++;
      } catch (e) {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  // All-failed is an outage (Google or DB), not a quiet success.
  if (refreshed === 0 && failed > 0) return jobFailed("inventory-refresh", `0/${rows.length} rows refreshed (${failed} failures)`);
  await recordPulse("inventory-refresh", { attempted: rows.length, succeeded: refreshed, failed, note: `scanned ${rows.length}; ${notLive} left as-is (no newer dated Google content, never re-dated)` });
  return Response.json({ ok: true, refreshed, failed, notLive, scanned: rows.length });
}
