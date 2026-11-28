// app/api/events/this-week/route.js - the homepage "This week in Florida" strip, as JSON.
//
// WHY THIS EXISTS (2026-11-27, premium polish pass): app/page.js is ISR
// (revalidate = 3600) and `next build` never reads the database, so every
// deploy shipped a homepage whose strip had no events, and it stayed blank
// until the page regenerated about an hour later. ThisWeekEvents now asks this
// route when the server HTML carried fewer than two events, so a reader never
// sees the strip missing after a deploy.
//
// It is the SAME read as the homepage: thisWeekEventsForHome (one cached
// Supabase read, tag "curated-events", no metered upstream), with the
// Christmas hub card prepended under the same rule as app/page.js (only when
// the dated strip already has two events).
//
// SELF-HEAL: when this route finds a full strip, the page HTML that sent the
// reader here was stale, so it marks "/" for regeneration (revalidatePath). The
// next visitor then gets the strip in the server HTML. At most once per ten
// minutes per server instance, and the route sits behind the same-origin +
// per-IP guard in middleware.js, so it cannot be used to churn the page.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { thisWeekEventsForHome } from "../../../../lib/thisWeekEventsServer.js";
import { christmasHubStripCard } from "../../../../lib/christmasHubCard.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

const HEAL_EVERY_MS = 10 * 60 * 1000;
let lastHealAt = 0;

export async function GET() {
  const today = siteTodayStr();
  const rows = await thisWeekEventsForHome(today);
  const hub = christmasHubStripCard(today);
  const events = hub && rows.length >= 2 ? [hub, ...rows] : rows;
  const full = rows.length >= 2;
  if (full && Date.now() - lastHealAt > HEAL_EVERY_MS) {
    lastHealAt = Date.now();
    try { revalidatePath("/"); } catch {}
  }
  return Response.json({ events }, {
    headers: {
      // A full strip is good for five minutes at the CDN; an empty answer
      // (a real outage or a quiet week) is retried after one minute.
      "Cache-Control": full ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=60",
    },
  });
}
