// Daily owner briefing plus the existing OSM cache warm and dated reminders.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { resolveOverride } from "../../../lib/envAudit.js";
import { gatherOwnerBriefing, sendOwnerBriefingEmail, withBriefingOperations } from "../../../lib/commandCenter/briefing.js";
import { dayStr } from "../../../lib/commandCenter/time.js";

const CANON = "https://www.gowayfind.com";

async function warmOsm() {
  try {
    const { LANDING_CITIES } = await import("../../../lib/landingCities.js");
    const cities = Object.values(LANDING_CITIES);
    let live = 0, cached = 0, missed = 0;
    for (let index = 0; index < cities.length; index += 4) {
      const batch = await Promise.all(cities.slice(index, index + 4).map(async (city) => {
        try {
          const response = await fetch(`${CANON}/api/outdoors?lat=${city.lat.toFixed(4)}&lng=${city.lng.toFixed(4)}&radius=27359`, { cache: "no-store", signal: AbortSignal.timeout(5500) });
          if (!response.ok) return "miss";
          const data = await response.json();
          return data.counts && data.counts.osm !== "unavailable" ? (data.counts.osmFrom === "cached" ? "cached" : "live") : "miss";
        } catch { return "miss"; }
      }));
      for (const result of batch) result === "live" ? live++ : result === "cached" ? cached++ : missed++;
    }
    return { live, cached, missed, total: cities.length };
  } catch { return null; }
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
