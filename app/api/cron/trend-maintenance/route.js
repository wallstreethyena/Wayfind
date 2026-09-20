// Native research maintenance when CSV mode is unconfigured. The original
// CSV cadence, spending validation and maintenance remain in this handler.
import { recordPulse } from "../../../../lib/jobPulse";
import { sbEnv } from "../../../../lib/serverCache";
import { importCadence, snapshotFreshness, TrendConfigError } from "../../../../lib/trendRights";
import { TREND_EVENTS } from "../../../../lib/trendTelemetry";
import { nativeMaintenance } from "../../../../lib/trendSources/nativeEngine.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const JOB = "trend-maintenance";

/** Hard cap on metered searches per run. Required config — no default. */
function searchesPerRun() {
  const raw = (process.env.EXPLODING_TOPICS_MAX_SEARCHES_PER_RUN || "").trim();
  if (!raw) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_MAX_SEARCHES_PER_RUN",
      "is not set. This job spends metered Google Places quota; it will not choose its own budget. Set an explicit integer (start with 5)."
    );
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 50) {
    throw new TrendConfigError("EXPLODING_TOPICS_MAX_SEARCHES_PER_RUN", `is "${raw}", which is not an integer in 0..50`);
  }
  return n;
}

export async function GET(req) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Native collection has no CSV and never reserves or spends Places quota.
  // An explicitly configured CSV installation still follows its original path.
  if (!process.env.EXPLODING_TOPICS_IMPORT_CADENCE) {
    try {
      const result = await nativeMaintenance(sbEnv());
      await recordPulse(JOB, { attempted: result.idle ? 0 : 1,
        succeeded: result.ok && !result.idle ? 1 : 0, note: result.note });
      return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const detail = /^[a-z0-9:_-]{1,90}$/.test(String(error?.message)) ? error.message : "native-maintenance-failed";
      await recordPulse(JOB, { attempted: 1, succeeded: 0, note: "NATIVE FAILED: " + detail });
      return Response.json({ ok: false, error: detail }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }

  // Required legacy configuration remains before any legacy work.
  let cadence, maxSearches;
  try {
    cadence = importCadence();
    maxSearches = searchesPerRun();
  } catch (e) {
    const detail = e instanceof TrendConfigError ? `${e.variable}: ${e.message}` : String(e && e.message);
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "CONFIG: " + detail.slice(0, 150) });
    return Response.json({ ok: false, error: "configuration", detail, event: TREND_EVENTS.CSV_VALIDATION_FAILED }, { status: 503 });
  }

  const s = sbEnv();
  if (!s || !s.url || !s.key) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "no supabase service env" });
    return Response.json({ ok: false, error: "no supabase service env" }, { status: 503 });
  }
  const svcH = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };
  const out = {
    ok: true, job: JOB, cadence: cadence.cadence, maxSearches,
    snapshot: null, expired: 0, rematched: 0,
    discovery: { attempted: 0, completed: 0, failed: 0, actualCalls: 0, completion: null, partialReason: null },
    candidates: { accepted: 0, rejected: 0 }, editorialQueued: 0, events: [],
  };

  // Native rows must not replace a manually imported snapshot in this selector.
  let snap = null, selectorError = null;
  try {
    const r = await fetch(
      `${s.url}/rest/v1/wf_trend_snapshots?source_mode=neq.wayfind_native_v1&status=in.(complete,partial)&order=observed_at.desc&limit=1`,
      { headers: svcH, cache: "no-store" }
    );
    if (!r.ok) selectorError = `snapshot select http ${r.status}`;
    else { const j = await r.json(); snap = Array.isArray(j) && j.length ? j[0] : null; }
  } catch (e) { selectorError = "snapshot select threw"; }
  if (selectorError) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "SELECTOR UNREACHABLE: " + selectorError });
    return Response.json({ ok: false, error: "selector-unreachable", detail: selectorError }, { status: 503 });
  }
  if (!snap) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "no snapshot imported yet — nothing to maintain" });
    return Response.json({ ...out, done: true, note: "no snapshot has been imported; run `npm run trends:import`" });
  }

  const observedMs = Date.parse(snap.observed_at);
  const fresh = snapshotFreshness(observedMs, Date.now(), cadence);
  out.snapshot = {
    id: snap.id, observedAt: snap.observed_at,
    ageDays: fresh.ageDays == null ? null : Number(fresh.ageDays.toFixed(2)),
    stale: fresh.stale, freshnessFactor: Number(fresh.freshnessFactor.toFixed(4)),
  };
  if (fresh.stale) {
    let marked = false, expired = 0;
    try {
      const r = await fetch(`${s.url}/rest/v1/wf_trend_snapshots?id=eq.${snap.id}`, {
        method: "PATCH", headers: { ...svcH, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "stale" }), cache: "no-store",
      });
      marked = r.ok;
      const nowIso = new Date().toISOString();
      const e = await fetch(`${s.url}/rest/v1/wf_trend_place_matches?snapshot_id=eq.${snap.id}&expires_at=gt.${nowIso}`, {
        method: "PATCH", headers: { ...svcH, Prefer: "return=representation" },
        body: JSON.stringify({ expires_at: nowIso, order_boost: 0 }), cache: "no-store",
      });
      if (e.ok) { const j = await e.json(); expired = Array.isArray(j) ? j.length : 0; }
    } catch (err) {}
    out.expired = expired;
    out.events.push(TREND_EVENTS.SNAPSHOT_STALE);
    await recordPulse(JOB, {
      attempted: 1, succeeded: 0,
      note: `SNAPSHOT STALE (${fresh.ageDays == null ? "?" : fresh.ageDays.toFixed(1)}d, ${cadence.cadence} ceiling ${cadence.maxAgeDays}d) — ${expired} matches expired; a new CSV export is required`,
    });
    return Response.json({
      ...out, ok: false, error: "snapshot-stale", detail: fresh.reason,
      remedy: "export a fresh CSV and run `npm run trends:import -- --file <path> --apply`", markedStale: marked,
    }, { status: 503 });
  }
  try {
    const nowIso = new Date().toISOString();
    const r = await fetch(`${s.url}/rest/v1/wf_trend_place_matches?expires_at=lt.${nowIso}&order_boost=gt.0`, {
      method: "PATCH", headers: { ...svcH, Prefer: "return=representation" },
      body: JSON.stringify({ order_boost: 0 }), cache: "no-store",
    });
    if (r.ok) { const j = await r.json(); out.expired += Array.isArray(j) ? j.length : 0; }
  } catch (e) {}

  // Existing paid-discovery drain remains disabled, exactly as before.
  out.discovery.completion = null;
  out.discovery.blockedReason =
    "discovery drain is not enabled: it spends metered quota and has never run. " +
    "Enable only after quota reservation via lib/quotaLedger is wired and an owner has approved queue rows.";
  out.editorialQueued = 0;
  out.editorialNote = "no candidates in editorial_pending (discovery has never run)";
  const attempted = out.expired + out.rematched + out.discovery.attempted;
  const succeeded = out.expired + out.rematched + out.discovery.completed;
  await recordPulse(JOB, { attempted, succeeded,
    note: attempted === 0 ? "fresh snapshot, nothing to expire or rematch" : null });
  out.tookMs = Date.now() - started;
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
