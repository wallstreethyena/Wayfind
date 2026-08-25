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
// the SAME cache-first getPlaceDetails path the rest of the site uses (so a
// row another surface refreshed costs nothing here), and a Google outage
// degrades to "rows stay stale one more hour", never to invented content.
//
// check-cron-honesty: a failed run answers non-2xx via jobFailed; an
// unconfigured run answers jobCannotRun. No failure hides behind a 200.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { getPlaceDetails } from "../../../../lib/placeDetails";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

// Refresh anything older than this. Below the 30-day matcher ceiling on
// purpose: rows are renewed BEFORE they expire, so the trend surface never
// sees a gap between "stale" and "refreshed".
const REFRESH_AFTER_DAYS = 25;
const PARALLEL = 5;

export async function GET(req) {
  // COST GUARD (2026-08-25): WAYFIND_GATE=shut stops ALL metered Google spend.
  if (gateShut() || gateFree()) return NextResponse.json({ skipped: "gate " + (gateShut() ? "shut" : "free: scheduled re-buys stay off inside the free tier") });
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("inventory-refresh", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(120, Number(u.searchParams.get("limit")) || 40));
  const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * 86400000).toISOString();

  const { data: rows, error } = await db
    .from("wf_inventory")
    .select("place_id, metro, refreshed_at")
    .lt("refreshed_at", cutoff)
    .order("refreshed_at", { ascending: true })
    .limit(limit);
  if (error) return jobFailed("inventory-refresh", "stale-row select failed: " + error.message);
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

  let refreshed = 0, failed = 0;
  const queue = [...rows];
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      try {
        const d = await getPlaceDetails(row.place_id);
        if (!d || !d.id) { failed++; continue; }
        const nowIso = new Date().toISOString();
        const patch = {
          google_types: Array.isArray(d.types) ? d.types : [],
          status: d.businessStatus || null,
          refreshed_at: nowIso,
          last_verified_at: nowIso,
        };
        // Only overwrite the photo when Google actually returned one — a
        // missing photo on one refresh must not blank a card that had one.
        if (d.photoRef) patch.photo_ref = d.photoRef;
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
  await recordPulse("inventory-refresh", { attempted: rows.length, succeeded: refreshed, failed, note: `scanned ${rows.length}` });
  return Response.json({ ok: true, refreshed, failed, scanned: rows.length });
}
