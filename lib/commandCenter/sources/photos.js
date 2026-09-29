// lib/commandCenter/sources/photos.js — is Wayfind actually SERVING place
// photos? Reads the per-day outcome counters /api/photo writes
// (wf_photo_outcome_daily, lib/photoOutcomes.js; `day` is the venue-local ET
// day) for today and yesterday.
//
// WHY (2026-09-28): from Sep 24 to Sep 28 every uncached photo request ended
// `ledger-denied` — 299 to 1,472 a day, ZERO `ok` — after the photo-cap env
// var was edited on Sep 23. Cards went blank site-wide for five days and no
// alert fired, because nothing watched this table. The health endpoint
// (/api/health/photos) already read it, but only when someone opened it.
//
// Same direct service-role REST read /api/health/photos uses (a single
// aggregate table with no per-user data), not a wf_cc_* RPC, so the alert
// works without a migration.
import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";
import { sbAdmin } from "../supabaseAdmin.js";
import { siteTodayStr } from "../../siteTime.js";

const NAME = "Place photo serving (wf_photo_outcome_daily)";

export async function photoServing(opts = {}) {
  const s = opts.sb || sbAdmin(opts.env);
  if (!s) return { source: srcMissing(NAME, "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment."), data: null };
  const now = opts.now || new Date();
  const today = siteTodayStr(now);
  const yesterday = siteTodayStr(new Date(now.getTime() - 86400000));
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const rows = await memTTL("photoserving:" + today, 10 * 60 * 1000, async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetchImpl(`${s.url}/rest/v1/wf_photo_outcome_daily?day=in.(${today},${yesterday})&select=day,class,n`, {
          headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store", signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`wf_photo_outcome_daily ${r.status}`);
        return await r.json();
      } finally { clearTimeout(timer); }
    });
    const byDay = (d) => {
      const out = {};
      for (const row of Array.isArray(rows) ? rows : []) if (row && row.day === d) out[row.class] = (out[row.class] || 0) + (Number(row.n) || 0);
      return out;
    };
    return { source: srcOk(NAME, { confidence: "measured" }), data: { today: byDay(today), yesterday: byDay(yesterday), todayKey: today, yesterdayKey: yesterday } };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}
