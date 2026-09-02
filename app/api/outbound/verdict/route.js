// /api/outbound/verdict — "may the app render THIS external link?" (2026-09-02,
// hijacked-domain incident.)
//
// The detail sheet's "Website" button comes from Google's websiteUri — a
// destination nobody at Wayfind has ever read. Google kept fruitvillegrove.com
// on Fruitville Grove's record long after the domain became an Indonesian
// gambling site. This route fetches the page server-side, classifies its
// CONTENT (lib/linkQuarantine.classifyOutboundPage), caches the verdict in
// wf_link_verdicts for 14 days, and answers { ok } — the client renders the
// button only on ok:true. Same-origin POST, rate-limited in middleware.js
// (it fetches third-party pages on request: an anti-abuse guard, not a cost
// gate — there is no metered upstream).
//
// Fail-CLOSED for the link, fail-SOFT for the app: any error answers
// { ok:false } (no button) with a 200, never a 500.
import { NextResponse } from "next/server";
import { sbEnv } from "../../../../lib/serverCache.js";
import { probeAndClassify } from "../../../../lib/linkProbe.js";
import { hostOfUrl, isBadVerdict, isQuarantinedHost } from "../../../../lib/linkQuarantine.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const TTL_MS = 14 * 24 * 3600 * 1000;
const BAD_TTL_MS = 3 * 24 * 3600 * 1000; // re-check a bad verdict sooner: sites get cleaned
const UNKNOWN_TTL_MS = 24 * 3600 * 1000;  // a bot wall / timeout: try again tomorrow, not per open
const NO_STORE = { "Cache-Control": "no-store" };

function answer(ok, verdict, source) {
  return NextResponse.json({ ok, verdict, source }, { status: 200, headers: NO_STORE });
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 2048) : "";
  const names = Array.isArray(body.names) ? body.names.filter((n) => typeof n === "string").map((n) => n.slice(0, 120)).slice(0, 4) : [];
  const host = hostOfUrl(url);
  if (!host) return answer(false, "invalid", "input");
  if (isQuarantinedHost(host)) return answer(false, "hijacked", "quarantine-ledger");

  const s = sbEnv();
  const h = s ? { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" } : null;

  // 1. cache
  if (h) {
    try {
      const r = await fetch(`${s.url}/rest/v1/wf_link_verdicts?url=eq.${encodeURIComponent(url)}&select=verdict,checked_at&limit=1`, { headers: h, cache: "no-store" });
      if (r.ok) {
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0];
        if (row && row.verdict) {
          const age = Date.now() - Date.parse(row.checked_at || 0);
          const bad = isBadVerdict(row.verdict);
          const ttl = row.verdict === "unknown" ? UNKNOWN_TTL_MS : bad ? BAD_TTL_MS : TTL_MS;
          if (age < ttl) return answer(!bad, row.verdict, "cache");
        }
      }
    } catch {}
  }

  // 2. probe + classify
  let c;
  try { c = await probeAndClassify(url, names, { timeoutMs: 6000 }); }
  catch { return answer(false, "error", "probe"); }

  // 3. persist (best effort). "unknown" (bot wall / 5xx / timeout) is stored
  // so the next open does not re-probe immediately. It answers ok:true —
  // a Cloudflare wall is OUR reading problem, and until 2026-09-02 every
  // website button rendered unread; only a page we READ and found bad
  // (hijacked / parked / dead / soft-404 / offsite) removes the button.
  if (h) {
    try {
      await fetch(`${s.url}/rest/v1/wf_link_verdicts?on_conflict=url`, {
        method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, cache: "no-store",
        body: JSON.stringify([{ url, host, verdict: c.verdict, reason: c.reason, title: c.title || null, final_url: c.finalUrl || null, expected: names.join(" | ") || null, checked_at: new Date().toISOString() }]),
      });
    } catch {}
  }
  return answer(!isBadVerdict(c.verdict), c.verdict, "probe");
}
