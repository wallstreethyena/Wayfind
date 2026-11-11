// Daily owner briefing plus the existing OSM cache warm and dated reminders.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { resolveOverride } from "../../../lib/envAudit.js";
import { gatherOwnerBriefing, sendOwnerBriefingEmail, withBriefingOperations } from "../../../lib/commandCenter/briefing.js";
import { dayStr } from "../../../lib/commandCenter/time.js";

const CANON = "https://www.gowayfind.com";

// OSM parks / beaches / piers: refreshed in-process by the shared regional
// warm (lib/osmRegional.js) — no HTTP self-call, so a firewall challenge on
// our own domain cannot masquerade as a provider outage. The result carries
// one status per REGION (refreshed / cached / stale / unavailable / deferred,
// summing to the region total) plus the sanitized per-attempt log.
async function warmOsm() {
  try {
    const { warmRegions } = await import("../../../lib/osmRegional.js");
    const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
    const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return await warmRegions(url && key ? { url, key } : null, { holder: "cron-" + Date.now(), deadlineMs: 38000, perAttemptMs: 18000 });
  } catch (e) {
    // A thrown warm is still reported: every region not attempted.
    let total = 0;
    try { total = (await import("../../../lib/osmRegional.js")).REGIONS.length; } catch {}
    return { unit: "region", total, refreshed: 0, cached: 0, stale: 0, unavailable: 0, deferred: total, regions: {}, error: String((e && e.message) || e).slice(0, 160) };
  }
}

function reminders(dateKey) {
  const monthDay = dateKey.slice(5);
  const notes = [];
  if (monthDay === "11-01") notes.push("Giveaway draw day: run supabase/giveaway-draw.sql and announce the winner.");
  if (["01-15", "04-15", "07-15", "10-15"].includes(monthDay)) notes.push("Quarterly awards refresh: verify Michelin, Beard, and local award lists, then update lib/gems.js.");
  return notes;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization") || "";
  if (!secret || authorization !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

  const now = new Date();
  const [baseBriefing, osmWarm] = await Promise.all([
    gatherOwnerBriefing(now, { timeoutMs: 9000 }),
    warmOsm(),
  ]);
  const notes = reminders(dayStr(now));
  const briefing = withBriefingOperations(baseBriefing, { osmWarm, notes });
  const recipient = resolveOverride("DIGEST_EMAIL");
  const sender = resolveOverride("WF_ALERT_FROM");
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const invalidAddress = recipient.status === "malformed" || sender.status === "malformed";
  const delivery = invalidAddress
    ? { ok: false, status: 503, reason: "email_address_malformed", id: null }
    : await sendOwnerBriefingEmail({ briefing, apiKey, from: sender.value, to: recipient.value, timeoutMs: 10000 });

  return Response.json({
    ok: delivery.ok,
    emailed: delivery.ok,
    emailId: delivery.id,
    emailError: delivery.ok ? null : { reason: delivery.reason, note: delivery.note || null, conflict: !!delivery.conflict },
    briefing,
    notes,
    osmWarm,
  }, { status: delivery.ok ? 200 : delivery.status || 502 });
}
