// app/api/cron/events-link-health/route.js — the nightly CONTENT sweep of
// every outbound URL wf_events can publish (2026-09-02, hijacked-domain
// incident: fruitvillegrove.com answered 200 as an Indonesian togel site).
//
// Walks upcoming/open events oldest-checked-first, FETCHES the ticket URL and
// the event URL, classifies the body with lib/linkQuarantine
// .classifyOutboundPage, and writes link_ok / link_verdict / link_checked_at /
// link_final_url. lib/curatedEvents.eventOutboundUrl publishes nothing for a
// link_ok=false row, so a destination that turns bad goes dark within one
// sweep instead of shipping to a phone. Bad verdicts also land in
// wf_link_verdicts (so /api/outbound/verdict knows). It must NOT write
// wf_broken_links: that is a read-only VIEW over active wf_deals rows
// (link_ok is false), so a POST of an event row is an insert into wf_deals and
// fails 23502 (affiliate_url NOT NULL) -> HTTP 400 "persistence error:
// broken-400" on every night with a darkened event (2026-10-14). Had the
// columns lined up it would have minted a bogus deal. The durable record of a
// darkened event is wf_events.link_ok=false + link_verdict (read by
// lib/curatedEvents) and the wf_link_verdicts row.
//
// Fail-CLOSED auth (same contract as cron/experiences-link-health).
// Fail-SOFT everything else: "unknown" (5xx/429/403/timeout) marks nothing
// bad — a bot wall is our problem, never the venue's. Never throws a 500.
import { sbEnv } from "../../../../lib/serverCache.js";
import { probeAndClassify } from "../../../../lib/linkProbe.js";
import { hostOfUrl, isBadVerdict, dedupeVerdictRows } from "../../../../lib/linkQuarantine.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { eventRowLinkDepth } from "../../../../lib/eventDeepLink.js";
import { summarizeLinkHealthPulse, unknownSince, daysBetween, STUCK_DAYS } from "../../../../lib/eventLinkPulse.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "events-link-health";

// A single bad probe on a previously-good link is a strike, not a verdict:
// two consecutive bad sweeps before a row goes dark — EXCEPT "hijacked",
// which is authoritative on first sight (gambling copy does not flicker).
const BAD_AFTER_STRIKES = 2;

function currentManualVerification(row, url, today) {
  const all = row && row.link_manual_verifications;
  const item = all && typeof all === "object" ? all[String(url || "")] : null;
  const reviewBy = item && typeof item.review_by === "string" ? item.review_by : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy) || reviewBy < today) return null;
  return item;
}

async function pool(thunks, limit) {
  const out = []; let i = 0;
  async function worker() { while (i < thunks.length) { const idx = i++; out[idx] = await thunks[idx](); } }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return out;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const sp = new URL(req.url).searchParams;
  const manual = sp.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return new Response("unauthorized", { status: 401 });
  }
  const s = sbEnv();
  if (!s) {
    try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 1, note: "cannot run: no supabase service env" }); } catch (e) {}
    return Response.json({ ok: false, error: "no supabase service env" });
  }
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "120", 10) || 120, 1), 300);
  const today = siteTodayStr(); // venue-local (US Eastern) — CLAUDE.md gotcha, never a UTC slice
  // Rows that can still be served: not ended. Oldest-checked first, never-
  // checked before everything. ~230 live URLs finish in two nights at 120.
  const sel = `${s.url}/rest/v1/wf_events?select=event_id,event_name,venue,official_ticket_url,official_event_url,event_page_url,link_ok,link_verdict,link_manual_verifications`
    + `&or=(end_date.is.null,end_date.gte.${today})`
    + `&or=(official_ticket_url.not.is.null,official_event_url.not.is.null,event_page_url.not.is.null)`
    + `&order=link_checked_at.asc.nullsfirst&limit=${limit}`;
  let rows;
  try {
    const r = await fetch(sel, { headers: h, cache: "no-store" });
    if (!r.ok) {
      try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 1, note: `unavailable: wf_events read failed (HTTP ${r.status})`.slice(0, 200) }); } catch (e) {}
      return Response.json({ ok: false, error: `select-${r.status}` });
    }
    rows = await r.json();
  } catch {
    try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 1, note: "unavailable: wf_events read did not complete" }); } catch (e) {}
    return Response.json({ ok: false, error: "select-fetch-error" });
  }
  if (!Array.isArray(rows) || !rows.length) {
    try { await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: "healthy idle: no events due for link checking" }); } catch (e) {}
    return Response.json({ ok: true, checked: 0 });
  }

  const results = await pool(rows.map((row) => async () => {
    const names = [row.event_name, row.venue].filter(Boolean);
    const urls = [row.official_ticket_url, row.official_event_url, row.event_page_url].filter(Boolean);
    const per = [];
    for (const url of urls) {
      // Some organizer/ticket hosts are not machine-verifiable. A real browser
      // review may bridge that exact URL for a SHORT period. It is never
      // host-wide, never permanent, and expires back into normal probing.
      const manual = currentManualVerification(row, url, today);
      if (manual) {
        per.push({ url, verdict: "alive", reason: "manual-browser-verification", finalUrl: url, status: 200, manual: true });
        continue;
      }
      per.push({ url, ...(await probeAndClassify(url, names)) });
    }
    // The row's verdict is its WORST publishable link: a hijacked event URL
    // darkens the row even if the ticket URL is fine — the card would
    // otherwise fall through to the event URL the moment the ticket link
    // lapses. "unknown" never outranks a real answer.
    const rank = { hijacked: 5, parked: 4, dead: 3, soft404: 3, offsite: 2, unknown: 0, alive: 1 };
    const worst = per.reduce((a, b) => (rank[b.verdict] > rank[a.verdict] ? b : a), per[0]);
    return { row, per, worst };
  }), 6);

  const nowIso = new Date().toISOString();
  const counts = { alive: 0, bad: 0, strike: 0, unknown: 0 };
  let stuck = 0;
  const patch = async (eventId, body) => {
    const r = await fetch(`${s.url}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(body), cache: "no-store",
    });
    return r.ok ? null : `patch-${r.status}`;
  };
  const verdictRows = [];
  let err = null;
  const flagged = [];

  for (const { row, per, worst } of results) {
    for (const p of per) {
      if (p.verdict === "unknown") continue;
      verdictRows.push({ url: p.url, host: hostOfUrl(p.url) || "", verdict: p.verdict, reason: p.reason, title: p.title || null, final_url: p.finalUrl || null, expected: [row.event_name, row.venue].filter(Boolean).join(" | "), checked_at: nowIso });
    }
    if (worst.verdict === "unknown") {
      // Inconclusive is a skip, never a verdict. Track HOW LONG a row has been
      // unreadable ("unknown:YYYY-MM-DD" = first seen) so a permanent wall is
      // escalated instead of hiding. A bad/strike state is never overwritten.
      counts.unknown++;
      const held = row.link_ok === false || (row.link_verdict || "").startsWith("strike:");
      const since = unknownSince(row.link_verdict) || today;
      if (daysBetween(since, today) > STUCK_DAYS) stuck++;
      err = err || await patch(row.event_id, held ? { link_checked_at: nowIso } : { link_verdict: `unknown:${since}`, link_checked_at: nowIso });
      continue;
    }
    if (!isBadVerdict(worst.verdict)) {
      counts.alive++;
      err = err || await patch(row.event_id, { link_ok: true, link_verdict: "alive", link_checked_at: nowIso, link_final_url: worst.finalUrl || null });
      continue;
    }
    const authoritative = worst.verdict === "hijacked" || worst.verdict === "parked";
    const secondStrike = row.link_ok === false || (row.link_verdict || "").startsWith("strike:");
    if (authoritative || secondStrike) {
      counts.bad++;
      flagged.push({ event: row.event_id, url: worst.url, verdict: worst.verdict, reason: worst.reason });
      err = err || await patch(row.event_id, { link_ok: false, link_verdict: worst.verdict, link_checked_at: nowIso, link_final_url: worst.finalUrl || null });
    } else {
      counts.strike++;
      err = err || await patch(row.event_id, { link_verdict: `strike:${worst.verdict}`, link_checked_at: nowIso, link_final_url: worst.finalUrl || null });
    }
  }

  if (verdictRows.length) {
    // One row per url. A single upsert batch that names the same url twice
    // (196 of 1,020 live events publish the SAME url as ticket and event link)
    // makes Postgres abort the whole statement ("ON CONFLICT DO UPDATE command
    // cannot affect row a second time") and PostgREST answers 500 - so nothing
    // was persisted from 2026-10-02 on.
    const uniq = dedupeVerdictRows(verdictRows);
    const r = await fetch(`${s.url}/rest/v1/wf_link_verdicts?on_conflict=url`, {
      method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(uniq), cache: "no-store",
    });
    if (!r.ok) err = err || `verdicts-${r.status}`;
  }
  // 2026-10-22 owner directive: every live event's button must land on THAT
  // event. A front-page or calendar link is never darkened (a shallow link
  // beats none), but it is counted and named here every night so job-watch
  // surfaces it instead of it shipping unseen. Read-only; one light select.
  const shallow = [];
  try {
    const all = await fetch(`${s.url}/rest/v1/wf_events?select=event_id,official_ticket_url,official_event_url,event_page_url`
      + `&event_status=in.(scheduled,unannounced,postponed)&or=(end_date.gte.${today},and(end_date.is.null,start_date.gte.${today}))&limit=5000`,
      { headers: h, cache: "no-store" });
    if (all.ok) {
      for (const r of await all.json()) {
        const d = eventRowLinkDepth(r);
        if (d !== "deep") shallow.push({ event: r.event_id, depth: d });
      }
    }
  } catch (e) {}

  try {
    const pulse = summarizeLinkHealthPulse({ rows: rows.length, ...counts, stuck, err });
    await recordPulse(JOB, { attempted: pulse.attempted, succeeded: pulse.succeeded, failed: pulse.failed, note: [pulse.note, shallow.length ? `${shallow.length} live event(s) not deep-linked (e.g. ${shallow.slice(0, 3).map((x) => x.event).join(", ")})` : null].filter(Boolean).join("; ") || null });
  } catch (e) {}
  return Response.json({ ok: !err, error: err, checked: rows.length, ...counts, stuck, flagged, notDeepLinked: shallow }, { headers: { "Cache-Control": "no-store" } });
}
