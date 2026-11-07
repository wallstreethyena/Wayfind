// Daily owner briefing plus the existing OSM cache warm and dated reminders.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { resolveOverride } from "../../../lib/envAudit.js";
import { gatherOwnerBriefing, sendOwnerBriefingEmail, withBriefingOperations } from "../../../lib/commandCenter/briefing.js";
import { dayStr } from "../../../lib/commandCenter/time.js";

const CANON = "https://www.gowayfind.com";

// One market at a time: overpass-api.de grants each IP two query slots, and
// the old 4-wide fan-out (each racing two hosts) starved itself into 429s, so
// every market came back unavailable. The route's cron-only warm mode spends
// up to WARM_BUDGET_MS on one Overpass slot and only reports "live" once the
// result is saved. Markets already fresh answer from cache in ~100ms, so
// coverage accumulates day over day; whatever the time box leaves for
// tomorrow is reported as deferred, never as unavailable.
const WARM_DEADLINE_MS = 38000;
const WARM_BUDGET_MS = 15000;
async function warmOsm(startedAt = Date.now()) {
  try {
    const secret = process.env.CRON_SECRET;
    const { LANDING_CITIES } = await import("../../../lib/landingCities.js");
    const cities = Object.values(LANDING_CITIES);
    let live = 0, cached = 0, stale = 0, missed = 0, deferred = 0;
    for (const city of cities) {
      const left = WARM_DEADLINE_MS - (Date.now() - startedAt);
      if (left < 5000) { deferred++; continue; }
      const budget = Math.min(WARM_BUDGET_MS, left - 1500);
      let result = "miss";
      try {
        const response = await fetch(`${CANON}/api/outdoors?lat=${city.lat.toFixed(4)}&lng=${city.lng.toFixed(4)}&radius=27359&warm=1&budget=${budget}`, { cache: "no-store", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(budget + 1500) });
        if (response.ok) {
          const data = await response.json();
          result = data.osm === "live" ? "live" : data.osm === "cached" ? "cached" : data.osm === "stale" ? "stale" : "miss";
        }
      } catch {}
      if (result === "live") live++; else if (result === "cached") cached++; else if (result === "stale") stale++; else missed++;
    }
    return { live, cached, stale, missed, deferred, total: cities.length };
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
