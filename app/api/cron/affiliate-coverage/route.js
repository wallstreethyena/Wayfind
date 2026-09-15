// app/api/cron/affiliate-coverage/route.js — AFFILIATE COVERAGE WATCH.
//
// THE LEAK THIS CLOSES (owner, 2026-09-15). The Fall in Florida Howl-O-Scream
// card opened buschgardens.com instead of the commissioned Undercover Tourist
// ticket. Two separate faults, and this job watches the second one:
//   1. a code fault — the fall route treated link_ok=null as dead
//      (fixed in lib/eventTicketDeals.js isServableDeal, locked by
//      scripts/check-affiliate-coverage.mjs);
//   2. a DATA fault — wf_events rows get added for parks a partner already
//      sells (Christmas Town, SeaWorld Christmas Celebration, Holidays at
//      LEGOLAND were all live with no mapping) and NOTHING notices, because
//      lib/eventTicketDeals.js is hand-pinned by event id and a build-time
//      guard cannot read the table. A new row at a sellable merchant renders
//      the organizer's site as its only CTA forever, unless a human happens
//      to look.
//
// So this reads the live table nightly, runs every future event through
// lib/affiliateLibrary.js eventAffiliateCoverage(), and reports the rows in
// the UNMAPPED state — a partner sells admission to that merchant and nobody
// has decided which product (event ticket / park admission / none) the card
// should carry. It never mutates wf_events or the registry: the mapping stays
// a product-integrity decision a human makes in lib/eventTicketDeals.js.
//
// NOT A NEW ALERT PATH. Same pattern as app/api/cron/revenue-heartbeat: the
// pulse goes through recordPulse (lib/jobPulse.js) and app/api/cron/job-watch
// delivers. The unit of work this job exists to produce is ONE clean coverage
// verdict, so attempted=1 and succeeded=1 only when no event sits in the leak
// state; a run that found leaks succeeded at 0, and job-watch emails after
// DEAD_RUN_THRESHOLD consecutive such runs with the note naming the events.
// That is the honest reading — a verdict with leaks in it is not the thing
// this job is for — and it is what makes a data-side gap reach the owner
// instead of sitting in a report nobody opens.
//
// CRON_SECRET-gated like every other cron here. Read-only against wf_events
// (service role, because RLS hides nothing here but the anon key is a legacy
// JWT that 401s — see lib/commerceProviders.js); the only write is the pulse.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { eventAffiliateCoverage, COVERAGE } from "../../../../lib/affiliateLibrary.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

const JOB = "affiliate-coverage";
const EVENT_COLUMNS = "event_id,event_name,start_date,end_date,event_status,official_ticket_url,official_event_url,event_page_url";

/**
 * Pure: shape the pulse row from a coverage tally. Exported so the guard can
 * execute the incident rule instead of reading it.
 */
export function coveragePulseRow(tally) {
  const unmapped = Array.isArray(tally.unmapped) ? tally.unmapped : [];
  const ids = unmapped.map((c) => c.eventId).join(", ");
  const note = unmapped.length
    ? `leak: ${unmapped.length} sellable event(s) with no affiliate mapping — ${ids}`
    : `clean: ${tally.mapped} mapped, ${tally.sellableNoPath} sellable-no-ut-path, ${tally.noPartner} no-partner`;
  return { attempted: 1, succeeded: unmapped.length ? 0 : 1, failed: unmapped.length, note: note.slice(0, 200) };
}

/** Pure: tally every row by coverage state. */
export function tallyCoverage(rows) {
  const tally = { mapped: 0, unmapped: [], sellableNoPath: 0, noPartner: 0, noUrl: 0, sellableNoPathIds: [] };
  for (const row of Array.isArray(rows) ? rows : []) {
    const c = eventAffiliateCoverage(row);
    if (c.status === COVERAGE.MAPPED) tally.mapped++;
    else if (c.status === COVERAGE.UNMAPPED) tally.unmapped.push(c);
    else if (c.status === COVERAGE.SELLABLE_NO_UT_PATH) { tally.sellableNoPath++; tally.sellableNoPathIds.push(c.eventId); }
    else if (c.status === COVERAGE.NO_PARTNER) tally.noPartner++;
    else tally.noUrl++;
  }
  return tally;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun(JOB, "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  const db = createClient(url, svc, { auth: { persistSession: false } });

  // Future or running events only: a mapping for a run that has ended earns
  // nothing and would only pad the count. siteTodayStr, never a UTC slice.
  const today = siteTodayStr();
  const { data, error } = await db.from("wf_events")
    .select(EVENT_COLUMNS)
    .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
    .neq("event_status", "cancelled")
    .limit(5000);
  if (error) return jobFailed(JOB, "wf_events read failed: " + String(error.message || error).slice(0, 120));

  const rows = Array.isArray(data) ? data : [];
  const tally = tallyCoverage(rows);
  const pulseRow = coveragePulseRow(tally);
  const pulsed = await recordPulse(JOB, pulseRow);

  return Response.json({
    ok: true,
    job: JOB,
    today,
    scanned: rows.length,
    mapped: tally.mapped,
    unmapped: tally.unmapped.map((c) => ({ event_id: c.eventId, merchant: c.merchant.key, url: c.url, admission_deal: c.merchant.admission.offerId })),
    sellable_no_ut_path: tally.sellableNoPathIds,
    no_partner: tally.noPartner,
    no_url: tally.noUrl,
    pulse: { ...pulseRow, recorded: pulsed },
    note: "delivery is via the existing app/api/cron/job-watch pulse alert, not a new alert path",
  }, { headers: { "Cache-Control": "no-store" } });
}
