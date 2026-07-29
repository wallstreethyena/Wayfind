// app/api/cron/cuisine-classify/route.js — keeps cuisine current, and re-checks
// the rows it was least sure about.
//
// Two jobs, one route:
//   NEW      rows with cuisine_checked_at IS NULL — never classified.
//   RECHECK  rows classified below LOW_CONFIDENCE, or older than RECHECK_DAYS.
//            A 0.55 editorial-prose hit is a guess worth revisiting once the
//            place has a fuller editorial or Google adds a type; a 0.9 types[]
//            hit is not.
//
// COSTS NOTHING METERED. Every signal is already stored: google_types[], the
// name, and wf_editorial prose. No Places call, no model call. That is why this
// can run hourly without a budget conversation.
//
// THE RULE: cuisine is a FILTER over inventory we already hold, never a query.
// This route reads rows and writes labels. It never composes a search.
// scripts/check-cuisine-never-queried.mjs fails the build if that changes.
//
// TONIGHT'S LESSONS, APPLIED (see #440 / #446 / #447):
//   - every failure logs its REASON, so a broken run is not a silent 200;
//   - a caught failure is distinguishable from a legitimate "unclassifiable" —
//     the former is an error with a reason string, the latter is a stored outcome;
//   - it pulses to wf_job_pulse, so a run that processes rows and classifies NONE
//     of them registers as an incident in /api/cron/job-watch instead of looking
//     healthy behind an HTTP 200. atlas-build did exactly that for five days.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sbEnv } from "../../../../lib/serverCache";
import { classifyCuisine, LOW_CONFIDENCE } from "../../../../lib/cuisine";
import { recordPulse } from "../../../../lib/jobPulse";

const RECHECK_DAYS = 30;
const MAX_ROWS = 500;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "200", 10) || 200, MAX_ROWS));
  const s = sbEnv();
  if (!s || !s.url || !s.key) {
    // Absent configuration fails LOUDLY. A silent idle return here would look
    // identical to "nothing to classify", which is the exact conflation that hid
    // a five-day outage.
    console.error("[cuisine] no Supabase service env — cannot classify. This is a config failure, not an empty queue.");
    await recordPulse("cuisine-classify", { attempted: 0, succeeded: 0, note: "no supabase service env" });
    return Response.json({ ok: false, error: "no supabase service env" }, { status: 200 });
  }
  const H = { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json" };
  const rest = async (p, init) => {
    const r = await fetch(`${s.url}/rest/v1/${p}`, { ...(init || {}), headers: { ...H, ...(init?.headers || {}) }, cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.status === 204 ? null : r.json();
  };

  const stale = new Date(Date.now() - RECHECK_DAYS * 864e5).toISOString();
  let rows = [], mode = "new", failure = null;
  try {
    // NEW first — a place with no label at all is worse than one with a weak label.
    rows = await rest(`wf_inventory?select=place_id,name,google_types,primary_type&category=eq.food&cuisine_checked_at=is.null&limit=${limit}`);
    if (!rows.length) {
      mode = "recheck";
      rows = await rest(
        `wf_inventory?select=place_id,name,google_types,primary_type&category=eq.food` +
        `&or=(cuisine_confidence.lt.${LOW_CONFIDENCE},cuisine_checked_at.lt.${stale})&limit=${limit}`);
    }
  } catch (e) {
    failure = `select failed: ${String(e && e.message).slice(0, 160)}`;
  }

  if (failure) {
    // A FETCH failure and an empty queue are different facts and must not report
    // the same way.
    console.error(`[cuisine] ${failure}`);
    await recordPulse("cuisine-classify", { attempted: 0, succeeded: 0, note: failure });
    return Response.json({ ok: false, error: failure }, { status: 200 });
  }
  if (!rows.length) {
    await recordPulse("cuisine-classify", { attempted: 0, succeeded: 0, note: "nothing new and nothing stale" });
    return Response.json({ ok: true, done: true, note: "nothing new and nothing stale" });
  }

  // The editorial hook is a real signal we already own; fetch it for this batch only.
  let edById = new Map();
  try {
    const ids = rows.map((r) => `"${r.place_id}"`).join(",");
    const eds = await rest(`wf_editorial?select=place_id,hook,why_here&place_id=in.(${ids})`);
    edById = new Map((eds || []).map((e) => [e.place_id, [e.hook, e.why_here].filter(Boolean).join(" ")]));
  } catch (e) {
    // Not fatal — types[] and the name still classify. But SAY it happened,
    // because a quietly degraded run that reports success is the failure shape.
    console.warn(`[cuisine] editorial signal unavailable this run: ${String(e && e.message).slice(0, 120)}`);
  }

  const now = new Date().toISOString();
  const updates = [];
  const outcomes = { classified: 0, unclassifiable: 0, vetoed: 0, "generic-only": 0, "no-name": 0 };
  for (const r of rows) {
    const res = classifyCuisine({ ...r, editorial: edById.get(r.place_id) || "" });
    const key = /^vetoed/.test(res.reason) ? "vetoed" : res.reason;
    outcomes[key] = (outcomes[key] || 0) + 1;
    updates.push({
      place_id: r.place_id, cuisines: res.cuisines,
      cuisine_confidence: res.cuisines.length ? res.confidence : null,
      cuisine_sources: res.sources, cuisine_reason: res.reason, cuisine_checked_at: now,
    });
  }

  let written = 0, writeErr = null;
  try {
    for (let i = 0; i < updates.length; i += 200) {
      await rest("wf_inventory?on_conflict=place_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(updates.slice(i, i + 200)),
      });
      written += Math.min(200, updates.length - i);
    }
  } catch (e) {
    writeErr = `write failed: ${String(e && e.message).slice(0, 160)}`;
    console.error(`[cuisine] ${writeErr}`);
  }

  // succeeded = rows that got a LABEL, not rows written. A run that writes 200
  // rows of "unclassifiable" has processed everything and produced nothing, and
  // that must be visible as such. Same distinction as published-vs-written in
  // atlas-build, which is the one that took five days to notice.
  const labelled = outcomes.classified + (outcomes["generic-only"] || 0);
  await recordPulse("cuisine-classify", {
    attempted: rows.length,
    succeeded: labelled,
    note: writeErr || (labelled === 0 ? `0 labelled of ${rows.length} (mode=${mode})` : null),
  });

  return Response.json({ ok: !writeErr, mode, processed: rows.length, written, labelled, outcomes, error: writeErr });
}
