// app/api/health/photos/route.js — CAN A READER GET A REAL PHOTO RIGHT NOW,
// AND HOW MANY PLACES CANNOT?
//
// Auth shape from app/api/internal/social/trends/route.js (CRON_SECRET
// bearer). Amendment A5: always Cache-Control: no-store, and this never
// launches Chromium — it is a plain database read, kept fast enough to poll.
//
// STATUS CODES: a queue-threshold breach is a REAL-BUT-EXPECTED data
// condition, not an operational failure — September's exhausted photos
// ledger means ~1,000 open rows all month, by design, and that is the KNOWN,
// owner-accepted state this whole lane exists to make VISIBLE, not something
// a health poller should read as "down". 503 is reserved for this endpoint
// being unable to answer the question at all (missing Supabase config, a
// failed read — including wf_photo_repair_queue not existing yet on this
// environment) or unauthenticated (401). A breached queue threshold is 200
// with `ok:false` and a `reason` string in the body — a caller that only
// checks the HTTP status will not cry wolf on a condition the owner already
// knows about; a caller that reads the body still sees the breach.
//
// NO SPEND, NO GOOGLE. No import of lib/spendGate.js, no reference to the
// Places media host (googleapis dot com/v1/.../media) anywhere in this file
// — scripts/test-photo-protection.mjs case 9 checks this file by name. Never
// echoes a photo URL or a key — a health surface describes, it does not
// redistribute.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { computePhotoCoverage, computePhotoRunway } from "../../../../lib/photoCoverage";
import { describePhotoRunway, photosPaidConfigured } from "../../../../lib/photoRunwayTruth";
import { siteTodayStr } from "../../../../lib/siteTime";

function sbEnvHere() {
  const raw = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw || !key) return null;
  return { url: /^https?:\/\//i.test(raw) ? raw : "https://" + raw, key };
}

async function count(s, path) {
  const r = await fetch(`${s.url}/rest/v1/${path}`, {
    headers: { apikey: s.key, Authorization: "Bearer " + s.key, Prefer: "count=exact", Range: "0-0" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  const n = Number((r.headers.get("content-range") || "").split("/")[1]);
  if (!Number.isFinite(n)) throw new Error(`${path} -> no count in content-range`);
  return n;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const s = sbEnvHere();
  if (!s) return Response.json({ error: "unconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const month = siteTodayStr().slice(0, 7);
  let activeWithRef, openRows, unresolvedRows, recoveries7d, lastPulse, lastRepairPulses, photoAllowanceRows;
  try {
    [activeWithRef, openRows, unresolvedRows, recoveries7d, lastPulse, lastRepairPulses, photoAllowanceRows] = await Promise.all([
      count(s, "wf_inventory?select=place_id&status=eq.OPERATIONAL&or=(excluded.is.null,excluded.is.false)&photo_ref=not.is.null"),
      count(s, "wf_photo_repair_queue?select=place_id&status=in.(open,budget_blocked)"),
      count(s, "wf_photo_repair_queue?select=place_id&status=eq.unresolved"),
      count(s, `wf_photo_repair_queue?select=place_id&status=eq.recovered&updated_at=gte.${encodeURIComponent(sevenDaysAgo)}`),
      fetch(`${s.url}/rest/v1/wf_job_pulse?job=eq.photo-monitor&select=note,ran_at&order=ran_at.desc&limit=1`, {
        headers: { apikey: s.key, Authorization: "Bearer " + s.key },
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${s.url}/rest/v1/wf_job_pulse?job=eq.photo-repair&select=note,ran_at&order=ran_at.desc&limit=2`, {
        headers: { apikey: s.key, Authorization: "Bearer " + s.key },
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${s.url}/rest/v1/wf_spend_ledger?sku=eq.photos&month=eq.${month}&select=used,cap&limit=1`, {
        headers: { apikey: s.key, Authorization: "Bearer " + s.key },
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
  } catch (e) {
    return Response.json({ error: "read_failed", detail: String((e && e.message) || e) }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const pulseRow = Array.isArray(lastPulse) && lastPulse[0];
  const pctMatch = pulseRow && /placeholder-rate\s+(\d+)%/.exec(String(pulseRow.note || ""));
  const repairNotes = (Array.isArray(lastRepairPulses) ? lastRepairPulses : []).map((r) => ({ note: r.note, ranAt: r.ran_at }));
  const runway = computePhotoRunway(repairNotes);
  const paidEnabled = photosPaidConfigured({
    gate: process.env.WAYFIND_GATE,
    paid: process.env.WAYFIND_PHOTOS_PAID,
    cap: process.env.GOOGLE_PHOTOS_MONTH_CAP,
  });
  const allowance = Array.isArray(photoAllowanceRows) && photoAllowanceRows[0] ? photoAllowanceRows[0] : null;
  const runwayTruth = describePhotoRunway({ runway, allowance, paidEnabled });
  const coverage = computePhotoCoverage({ activeWithRef, openRows, unresolvedRows, recoveries7d });

  const threshold = Math.max(50, activeWithRef * 0.05);
  const ok = openRows === 0 || openRows < threshold;
  const reason = ok ? null : `openRows (${openRows}) at or above threshold (${Math.round(threshold)}, = max(50, 5% of ${activeWithRef} active refs))`;

  return Response.json(
    {
      surface: "place-photos",
      ok,
      reason,
      activeWithRef: coverage.activeWithRef,
      openRows: coverage.openRows,
      unresolvedRows: coverage.unresolvedRows,
      recoveries7d: coverage.recoveries7d,
      placeholderRatePctLastRun: pctMatch ? Number(pctMatch[1]) : null,
      lastMonitorRunAt: pulseRow ? pulseRow.ran_at : null,
      paidPhotosEnabled: runwayTruth.paidEnabled,
      allowanceUsed: runwayTruth.allowanceUsed,
      allowanceCap: runwayTruth.allowanceCap,
      burn24h: runwayTruth.burn24h,
      runwayDays: runwayTruth.runwayDays,
      runway: runwayTruth.text,
      checkedAt: new Date().toISOString(),
    },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
