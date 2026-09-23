// app/api/cron/weekend-picks/route.js — "Weekend Picks Near You": Wayfind's
// first push-notification use case (owner Gabe, 2026-09-23).
//
// THE ONE RULE THAT MATTERS MOST HERE: this must never mass send unless Gabe
// has explicitly turned it on. WEEKEND_PICKS_PUSH_ENABLED gates the ENTIRE
// route, and that check runs before ANY Supabase read, before any recordPulse
// write, before touching APNs at all — a disabled flag must cost nothing and
// risk nothing, not even a database round trip. That is deliberately unlike
// every other cron in this directory (see lib/jobPulse.js's header on why a
// pulse belongs on every terminal path) — the exemption is intentional and is
// recorded in scripts/check-cron-pulse-coverage.mjs's KNOWN_UNPULSED list with
// this same reasoning, not an oversight.
//
// WEEKEND_PICKS_ALLOWLIST (comma-separated user ids and/or device ids), when
// set, restricts a run to exactly those recipients — the safe way to test
// against a handful of real devices before ever widening to "everyone with a
// registered iOS token." Recipients are capped at MAX_RECIPIENTS regardless,
// so a run can never exceed a bounded blast radius even with the flag on and
// no allowlist.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { apnsConfigured, sendPushBatch } from "../../../../lib/apns.js";
import { allIosTokens, deleteToken } from "../../../../lib/pushTokens.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";

const JOB = "weekend-picks";
const MAX_RECIPIENTS = 5000;

const TITLE = "Weekend Picks Near You";
const BODY = "Your weekend picks are ready. See what is worth doing near you.";
const URL_PATH = "/";

// ISO 8601 week, e.g. "2026-W39" — one collapse id per calendar week, so a
// retried or re-triggered run for the same weekend replaces the earlier
// notification on the device rather than stacking a second one.
export function isoWeekString(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function parseAllowlist(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const ids = s.split(",").map((v) => v.trim()).filter(Boolean);
  return ids.length ? ids : null;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  // See header: this is the never-mass-send-unless-enabled gate, and it must
  // fire before any DB or network call.
  if (process.env.WEEKEND_PICKS_PUSH_ENABLED !== "1") {
    return Response.json({ ok: true, skipped: "disabled" }, { headers: { "cache-control": "no-store" } });
  }

  if (!apnsConfigured()) return jobCannotRun(JOB, "APNs is not configured (APNS_TEAM_ID/APNS_KEY_ID/APNS_AUTH_KEY)");

  const allowlist = parseAllowlist(process.env.WEEKEND_PICKS_ALLOWLIST);

  let tokenRows;
  try {
    tokenRows = await allIosTokens({ limit: MAX_RECIPIENTS, allowlist });
  } catch (e) {
    return jobFailed(JOB, "failed to read device_push_tokens: " + String((e && e.message) || e).slice(0, 160));
  }

  if (!tokenRows.length) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: allowlist ? "no recipients matched the allowlist" : "no registered iOS tokens" });
    return Response.json({ ok: true, sent: 0, failed: 0, invalidRemoved: 0 }, { headers: { "cache-control": "no-store" } });
  }

  const payload = {
    title: TITLE,
    body: BODY,
    url: URL_PATH,
    collapseId: `weekend-${isoWeekString(new Date())}`,
  };

  let invalidRemoved = 0;
  const results = await sendPushBatch(
    tokenRows.map((r) => r.token),
    payload,
    {
      concurrency: 10,
      onInvalid: async (token) => {
        invalidRemoved++;
        try { await deleteToken(token); } catch (e) {}
      },
    }
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  await recordPulse(JOB, { attempted: results.length, succeeded: sent, failed, note: `invalidRemoved=${invalidRemoved}` });

  return Response.json({ ok: true, sent, failed, invalidRemoved }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req) {
  return GET(req);
}
