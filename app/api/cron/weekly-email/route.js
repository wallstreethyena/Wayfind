// app/api/cron/weekly-email/route.js — Wayfind's weekly things-to-do email
// (owner order 2026-11-27). Runs Thursday morning, Eastern.
//
// THE ONE RULE THAT MATTERS MOST HERE (same as weekend-picks): this must never
// mail anyone unless the owner has explicitly turned it on. WEEKLY_EMAIL_ENABLED
// must be the literal "1", and that check runs before ANY Supabase read, any
// recordPulse write, or any Resend call. A disabled flag costs nothing and
// risks nothing. This early return is the one deliberate unpulsed path,
// recorded in scripts/check-cron-pulse-coverage.mjs KNOWN_UNPULSED.
//
// WEEKLY_EMAIL_ALLOWLIST (comma separated addresses), when set, restricts a run
// to exactly those subscribers: the safe first send. Every run is capped at
// MAX_PER_RUN messages regardless, and each subscriber is mailed at most once
// per ISO week (wf_newsletter_subscribers.last_sent_week), so a retried or
// doubled cron can never send the same issue twice.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { sbEnv } from "../../../../lib/serverCache.js";
import { dueSubscribers, markSent, sendWeeklyBatch, issueFor, weeklyIssueData } from "../../../../lib/newsletterServer.js";
import { isoWeek, NEWSLETTER_REGIONS, normalizeEmail } from "../../../../lib/newsletter.js";

const JOB = "weekly-email";
const MAX_PER_RUN = 2000;
const BATCH = 100;

export function parseEmailAllowlist(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const list = s.split(",").map(normalizeEmail).filter(Boolean);
  return list.length ? new Set(list) : null;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  // See header: the never-mail-unless-enabled gate, before any DB or network call.
  if (process.env.WEEKLY_EMAIL_ENABLED !== "1") {
    return Response.json({ ok: true, skipped: "disabled" }, { headers: { "cache-control": "no-store" } });
  }

  if (!sbEnv()) return jobCannotRun(JOB, "Supabase is not configured (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)");
  if (!String(process.env.RESEND_API_KEY || "").trim()) return jobCannotRun(JOB, "RESEND_API_KEY is not configured");

  const allow = parseEmailAllowlist(process.env.WEEKLY_EMAIL_ALLOWLIST);
  const now = new Date();
  const week = isoWeek(now);
  let attempted = 0, sent = 0;
  const skippedRegions = [];
  try {
    for (const { key } of NEWSLETTER_REGIONS) {
      if (attempted >= MAX_PER_RUN) break;
      let subs = await dueSubscribers(key, week, MAX_PER_RUN - attempted);
      if (allow) subs = subs.filter((s) => allow.has(s.email));
      if (!subs.length) continue;
      const data = await weeklyIssueData(key, now);
      if (!issueFor(data, { week })) { skippedRegions.push(key); continue; } // nothing real this week: send nothing
      for (let i = 0; i < subs.length && attempted < MAX_PER_RUN; i += BATCH) {
        const chunk = subs.slice(i, i + BATCH);
        attempted += chunk.length;
        const ids = await sendWeeklyBatch(chunk, data, week);
        if (ids.length) {
          await markSent(ids, week);
          sent += ids.length;
        }
      }
    }
  } catch (e) {
    return jobFailed(JOB, String((e && e.message) || e).slice(0, 200));
  }
  await recordPulse(JOB, { attempted, succeeded: sent, note: skippedRegions.length ? `no picks this week: ${skippedRegions.join(",")}` : null });
  return Response.json({ ok: true, week, attempted, sent, skippedRegions, allowlist: !!allow }, { headers: { "cache-control": "no-store" } });
}
