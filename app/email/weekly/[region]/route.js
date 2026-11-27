// GET /email/weekly/<region> — this week's weekly email, as a web page
// (2026-11-27). It is the "View in your browser" link in every issue and the
// preview the owner approves before sending is turned on. Public content
// only: no subscriber data, and the unsubscribe link here is the generic
// page (each real email carries its reader's own link). Not indexed.
import { issueFor, weeklyIssueData } from "../../../../lib/newsletterServer.js";
import { isoWeek, normalizeRegion } from "../../../../lib/newsletter.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const key = normalizeRegion(params && params.region);
  const headers = { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" };
  if (!key) return new Response("Not found", { status: 404, headers: { ...headers, "content-type": "text/plain" } });
  const now = new Date();
  const issue = issueFor(await weeklyIssueData(key, now), { week: isoWeek(now) });
  if (!issue) {
    return new Response("<!doctype html><title>Wayfind</title><p style=\"font-family:sans-serif;padding:24px\">Nothing to show for this area this week.</p>", { status: 200, headers: { ...headers, "cache-control": "public, s-maxage=600" } });
  }
  return new Response(issue.html, { status: 200, headers: { ...headers, "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
