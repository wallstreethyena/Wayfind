// v4.59 — Core Web Vitals monitor. Runs hourly via Vercel cron; each run
// tests ONE page (rotating by hour through the homepage, guide index, all
// guides, and all culture pages) against Google's PageSpeed Insights API
// (mobile), and stores the lab metrics in Supabase (table cwv_runs). A full
// sweep of all ~20 pages completes daily. Manual mode: /api/cron/cwv?url=...
// Requires PAGESPEED_API_KEY in the environment; without it, responds idle.
export const runtime = "nodejs";
export const maxDuration = 60;

import { GUIDES } from "../../../../lib/guides";
import { CULTURE } from "../../../../lib/culture";
import { SITE_URL } from "../../../../lib/site";

function pageList() {
  return [
    SITE_URL + "/",
    SITE_URL + "/guides",
    ...Object.keys(GUIDES).map((s) => SITE_URL + "/guides/" + s),
    ...Object.keys(CULTURE).map((m) => SITE_URL + "/culture/" + m),
  ];
}

export async function GET(req) {
  // v5.43 (RLS review L1): same fail-closed guard as /api/cron — this route
  // had none, so anyone could burn the PageSpeed API quota on demand.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });
  const KEY = (process.env["PAGESPEED_API_KEY"] || "").trim();
  if (!KEY) return Response.json({ idle: true, reason: "no PAGESPEED_API_KEY" });

  const { searchParams } = new URL(req.url);
  const pages = pageList();
  const manual = (searchParams.get("url") || "").trim();
  const idx = new Date().getUTCHours() % pages.length;
  const target = manual && manual.startsWith(SITE_URL) ? manual : pages[idx];

  const psi = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" + encodeURIComponent(target)
    + "&strategy=mobile&category=performance&key=" + encodeURIComponent(KEY)
    + "&fields=" + encodeURIComponent("lighthouseResult/categories/performance/score,lighthouseResult/audits/largest-contentful-paint/numericValue,lighthouseResult/audits/cumulative-layout-shift/numericValue,lighthouseResult/audits/total-blocking-time/numericValue,lighthouseResult/audits/server-response-time/numericValue");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);
  try {
    const res = await fetch(psi, { signal: ctrl.signal });
    if (!res.ok) return Response.json({ ok: false, target, psiStatus: res.status });
    const data = await res.json();
    const a = (data.lighthouseResult && data.lighthouseResult.audits) || {};
    const num = (k) => { try { const v = a[k] && a[k].numericValue; return typeof v === "number" ? Math.round(v * 1000) / 1000 : null; } catch { return null; } };
    const row = {
      url: target,
      strategy: "mobile",
      perf_score: (() => { try { const s = data.lighthouseResult.categories.performance.score; return typeof s === "number" ? Math.round(s * 100) : null; } catch { return null; } })(),
      lcp_ms: num("largest-contentful-paint"),
      cls: num("cumulative-layout-shift"),
      tbt_ms: num("total-blocking-time"),
      ttfb_ms: num("server-response-time"),
    };
    // Store via Supabase REST (anon key, RLS insert policy on cwv_runs).
    const sbUrl = (process.env["NEXT_PUBLIC_SUPABASE_URL"] || "").trim();
    const sbKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] || process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || "").trim();
    let stored = false;
    if (sbUrl && sbKey) {
      try {
        const ins = await fetch(sbUrl + "/rest/v1/cwv_runs", {
          method: "POST",
          headers: { apikey: sbKey, Authorization: "Bearer " + sbKey, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(row),
        });
        stored = ins.ok;
      } catch (e) {}
    }
    const alert = (row.lcp_ms != null && row.lcp_ms > 2500) || (row.cls != null && row.cls > 0.1) || (row.tbt_ms != null && row.tbt_ms > 300);
    return Response.json({ ok: true, ...row, stored, overThreshold: alert });
  } catch (e) {
    return Response.json({ ok: false, target, error: String(e && e.message || e).slice(0, 120) });
  } finally {
    clearTimeout(timer);
  }
}
