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
// wf_link_verdicts (so /api/outbound/verdict knows) and wf_broken_links (so
// the existing job-watch surface pages the owner).
//
// Fail-CLOSED auth (same contract as cron/experiences-link-health).
// Fail-SOFT everything else: "unknown" (5xx/429/403/timeout) marks nothing
// bad — a bot wall is our problem, never the venue's. Never throws a 500.
import { sbEnv } from "../../../../lib/serverCache.js";
import { probeAndClassify } from "../../../../lib/linkProbe.js";
import { hostOfUrl, isBadVerdict } from "../../../../lib/linkQuarantine.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A single bad probe on a previously-good link is a strike, not a verdict:
// two consecutive bad sweeps before a row goes dark — EXCEPT "hijacked",
// which is authoritative on first sight (gambling copy does not flicker).
const BAD_AFTER_STRIKES = 2;

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
  if (!s) return Response.json({ ok: false, error: "no supabase service env" });
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "120", 10) || 120, 1), 300);
  const today = siteTodayStr(); // venue-local (US Eastern) — CLAUDE.md gotcha, never a UTC slice
  // Rows that can still be served: not ended. Oldest-checked first, never-
  // checked before everything. ~230 live URLs finish in two nights at 120.
  const sel = `${s.url}/rest/v1/wf_events?select=event_id,event_name,venue,official_ticket_url,official_event_url,event_page_url,link_ok,link_verdict`
    + `&or=(end_date.is.null,end_date.gte.${today})`
    + `&or=(official_ticket_url.not.is.null,official_event_url.not.is.null,event_page_url.not.is.null)`
    + `&order=link_checked_at.asc.nullsfirst&limit=${limit}`;
  let rows;
  try {
    const r = await fetch(sel, { headers: h, cache: "no-store" });
    if (!r.ok) return Response.json({ ok: false, error: `select-${r.status}` });
    rows = await r.json();
  } catch { return Response.json({ ok: false, error: "select-fetch-error" }); }
  if (!Array.isArray(rows) || !rows.length) return Response.json({ ok: true, checked: 0 });

  const results = await pool(rows.map((row) => async () => {
    const names = [row.event_name, row.venue].filter(Boolean);
    const urls = [row.official_ticket_url, row.official_event_url, row.event_page_url].filter(Boolean);
    const per = [];
    for (const url of urls) per.push({ url, ...(await probeAndClassify(url, names)) });
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
  const patch = async (eventId, body) => {
    const r = await fetch(`${s.url}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(body), cache: "no-store",
    });
    return r.ok ? null : `patch-${r.status}`;
  };
  const verdictRows = [];
  const brokenRows = [];
  let err = null;
  const flagged = [];

  for (const { row, per, worst } of results) {
    for (const p of per) {
      if (p.verdict === "unknown") continue;
      verdictRows.push({ url: p.url, host: hostOfUrl(p.url) || "", verdict: p.verdict, reason: p.reason, title: p.title || null, final_url: p.finalUrl || null, expected: [row.event_name, row.venue].filter(Boolean).join(" | "), checked_at: nowIso });
    }
    if (worst.verdict === "unknown") { counts.unknown++; err = err || await patch(row.event_id, { link_checked_at: nowIso }); continue; }
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
      brokenRows.push({ provider: "wf_events", title: row.event_name, category: "event-link", subcategory: worst.verdict, dest_url: worst.url, affiliate_url: null, http_status: worst.status || 0, fail_count: BAD_AFTER_STRIKES, last_checked_at: nowIso });
    } else {
      counts.strike++;
      err = err || await patch(row.event_id, { link_verdict: `strike:${worst.verdict}`, link_checked_at: nowIso, link_final_url: worst.finalUrl || null });
    }
  }

  if (verdictRows.length) {
    const r = await fetch(`${s.url}/rest/v1/wf_link_verdicts?on_conflict=url`, {
      method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(verdictRows), cache: "no-store",
    });
    if (!r.ok) err = err || `verdicts-${r.status}`;
  }
  if (brokenRows.length) {
    const r = await fetch(`${s.url}/rest/v1/wf_broken_links`, {
      method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(brokenRows), cache: "no-store",
    });
    if (!r.ok) err = err || `broken-${r.status}`;
  }

  return Response.json({ ok: !err, error: err, checked: rows.length, ...counts, flagged }, { headers: { "Cache-Control": "no-store" } });
}
