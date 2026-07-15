// v6.21 — THE FEED AUDITOR ROBOT. Autonomous inspection of every configured
// business event feed: is it reachable, does it parse, and does every event it
// produces pass the honesty gate (real title, valid future date, resolvable
// URL, real coordinates — no fabricated info). Runs daily via Vercel cron and
// on demand. Produces a per-feed health report the owner can read in the
// function logs, and flags any feed that is unreachable, unparseable, or
// emitting a high share of rejected (suspicious) events.
//
// This is defense-in-depth: the SERVE path (lib/businessFeeds businessEventsFrom)
// already audits every event before it is shown, so nothing false can reach the
// app even between audits. This robot is the early-warning that a feed has gone
// bad, so a business can be contacted or removed before its calendar rots.
export const runtime = "nodejs";
export const maxDuration = 60;

import { getBusinessFeeds, auditFeed } from "../../../../lib/businessFeeds.js";

export async function GET(req) {
  // Same fail-closed guard as the other cron routes.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const manual = new URL(req.url).searchParams.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  const feeds = getBusinessFeeds();
  if (!feeds.length) return Response.json({ idle: true, reason: "no business feeds configured yet", feeds: 0 });

  const now = new Date();
  const reports = await Promise.all(
    feeds.map((f) => auditFeed(f, (u, o) => fetch(u, o), now).catch((e) => ({ name: f.name, url: f.url, ok: false, error: String(e).slice(0, 120) })))
  );

  // A feed needs attention if it is unreachable/unparseable, or if it produced
  // events but the MAJORITY were rejected by the honesty gate (a sign the feed
  // format changed or is publishing junk).
  const flagged = reports.filter((r) => !r.ok || (r.parsed > 0 && r.rejected > r.valid));
  const summary = {
    checkedAt: now.toISOString(),
    feeds: reports.length,
    healthy: reports.filter((r) => r.ok && !(r.parsed > 0 && r.rejected > r.valid)).length,
    flagged: flagged.map((r) => ({ name: r.name, error: r.error, parsed: r.parsed, valid: r.valid, rejected: r.rejected, reasons: r.reasons })),
    reports,
  };

  // Surface in the Vercel function logs where the owner watches trends.
  try { console.log(JSON.stringify({ tag: "business_feed_audit", ...summary })); } catch (e) {}

  return Response.json(summary, { status: 200 });
}
