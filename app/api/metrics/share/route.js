// Part 4 — the one number to watch. GET /api/metrics/share?days=30 aggregates the
// events table into share_rate / open_rate / return_rate and says whether we beat
// the 2% share-rate bar. Owner-facing: if CRON_SECRET (or METRICS_SECRET) is set,
// require ?key=. Read-only, aggregate counts only (no PII in the response).
import { computeShareMetrics, SHARE_EVENTS } from "../../../../lib/shareMetrics.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function GET(req) {
  const secret = process.env.METRICS_SECRET || process.env.CRON_SECRET;
  const { searchParams } = new URL(req.url);
  if (secret && searchParams.get("key") !== secret) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const s = sb();
  if (!s) return Response.json({ ok: false, reason: "no_store" }, { status: 503 });

  const days = Math.max(1, Math.min(180, Number(searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const H = { apikey: s.key, Authorization: `Bearer ${s.key}` };

  // Exact count for an action over the window (read from the content-range header,
  // so no rows are transferred).
  async function count(action) {
    try {
      const r = await fetch(`${s.url}/rest/v1/events?action=eq.${encodeURIComponent(action)}&created_at=gte.${encodeURIComponent(since)}&select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" });
      const m = (r.headers.get("content-range") || "").match(/\/(\d+)\s*$/);
      return m ? Number(m[1]) : 0;
    } catch (e) { return 0; }
  }
  // Distinct devices that opened a shared card (return_rate denominator).
  async function shareVisitors() {
    try {
      const r = await fetch(`${s.url}/rest/v1/events?action=eq.${SHARE_EVENTS.open}&created_at=gte.${encodeURIComponent(since)}&select=device_id&limit=100000`, { headers: H, cache: "no-store" });
      if (!r.ok) return 0;
      const rows = await r.json();
      return new Set((rows || []).map((x) => x.device_id).filter(Boolean)).size;
    } catch (e) { return 0; }
  }

  const [sessions, shares, opens, returns, visitors] = await Promise.all([
    count(SHARE_EVENTS.session), count(SHARE_EVENTS.share), count(SHARE_EVENTS.open), count(SHARE_EVENTS.return), shareVisitors(),
  ]);

  const metrics = computeShareMetrics({ sessions, shares, opens, shareVisitors: visitors, returns });
  return Response.json({ ok: true, window_days: days, since, ...metrics });
}
