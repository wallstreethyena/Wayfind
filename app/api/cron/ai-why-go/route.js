// app/api/cron/ai-why-go/route.js — writes the short "why go" blurb for event
// pages that have no hand-written why_go (owner, 2026-11-27). See
// lib/eventWhyGo.js for the contract.
//
// Fail-closed CRON_SECRET Bearer auth. The ONLY caller of the why_go OpenAI
// lane: page views read the stored blurb and never call a model. Each run
// handles a small batch (soonest events first, Christmas listings first),
// skips anything already written for the same facts, and stops early when the
// lane, the account cap or the breaker says no. Every terminal path reports a
// wf_job_pulse row.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { recordPulse } from "../../../../lib/jobPulse.js";
import { fetchCuratedEvents } from "../../../../lib/curatedEvents.js";
import { christmasEventPageRow } from "../../../../lib/christmasEventPage.js";
import { withTampaPassFacts } from "../../../../lib/eventPageImage.js";
import { generateWhyGo, whyGoEvidence, whyGoCacheKey } from "../../../../lib/eventWhyGo.js";
import { cgetMany } from "../../../../lib/serverCache.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

const JOB = "ai-why-go";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 60;
const STOP_REASONS = new Set(["no_key", "breaker_open", "account_cap", "blocked", "billing", "quota"]);
const XMAS_RX = /christmas|holiday|lights|santa|nutcracker|parade|winter|snow|jingle|noel|yule|hanukkah|kwanzaa/i;

/** Which rows still need a blurb, best first. PURE (exported for the lock test). */
export function whyGoQueue(rows, today) {
  return (Array.isArray(rows) ? rows : [])
    .filter((e) => e && e.slug && e.state === "FL" && !(typeof e.why_go === "string" && e.why_go.trim()))
    .filter((e) => !e.end_date || e.end_date >= today)
    .filter((e) => whyGoEvidence(e))
    .map((e) => ({ e, xmas: XMAS_RX.test([e.event_name, e.category, ...(Array.isArray(e.tags) ? e.tags : [])].join(" ")) }))
    .sort((a, b) => (a.xmas === b.xmas ? String(a.e.start_date || "").localeCompare(String(b.e.start_date || "")) : a.xmas ? -1 : 1))
    .map((x) => x.e);
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.parseInt(url.searchParams.get("limit") || "", 10) || DEFAULT_LIMIT));
  const today = siteTodayStr();
  let attempted = 0, written = 0, cached = 0, rejected = 0, failed = 0, stopReason = null;
  try {
    const rows = await fetchCuratedEvents({ fresh: true, upcomingFrom: today });
    const pageRows = rows.map((row) => withTampaPassFacts(christmasEventPageRow(row, row.slug) || row)).filter(Boolean);
    const queue = whyGoQueue(pageRows, today);
    // One cache query per 60 keys tells us which listings already have a blurb
    // for their current facts, instead of one read per listing every run.
    const keyOf = (e) => whyGoCacheKey(e.slug, whyGoEvidence(e));
    const done = new Set();
    for (let i = 0; i < queue.length; i += 60) {
      const hits = await cgetMany(queue.slice(i, i + 60).map(keyOf));
      for (const k of hits.keys()) done.add(k);
    }
    cached = queue.filter((e) => done.has(keyOf(e))).length;
    for (const e of queue.filter((x) => !done.has(keyOf(x)))) {
      if (attempted >= limit) break;
      const res = await generateWhyGo(e);
      if (res.ok && res.cached) { cached += 1; continue; }
      attempted += 1;
      if (res.ok) { written += 1; continue; }
      if (res.reason === "rejected") { rejected += 1; continue; }
      failed += 1;
      if (STOP_REASONS.has(res.reason)) { stopReason = res.reason; break; }
    }
    const prefix = stopReason === "billing" ? "billing: " : stopReason === "quota" ? "quota: " : "";
    const note = (prefix + `queue=${queue.length}; written=${written}; cached=${cached}; rejected=${rejected}; failed=${failed}` + (stopReason ? `; stopped=${stopReason}` : "")).slice(0, 200);
    // A run that only found already-written blurbs is healthy work, not a dead run.
    const succeeded = written + cached + rejected;
    await recordPulse(JOB, { attempted: attempted + cached, succeeded, failed, note });
    return Response.json(
      { ok: failed === 0 || written > 0, job: JOB, queue: queue.length, written, cached, rejected, failed, stopReason },
      { status: failed > 0 && written === 0 && cached === 0 ? 503 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    const msg = String((err && err.message) || err || "why-go-failed").slice(0, 140);
    await recordPulse(JOB, { attempted: Math.max(1, attempted), succeeded: written, failed: failed + 1, note: "FAILED: " + msg });
    return Response.json({ ok: false, job: JOB, error: "why_go_failed" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
