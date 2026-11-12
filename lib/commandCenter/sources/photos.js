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
import { breakerOpen } from "../../providerHealth.js";
import { GOOGLE_PHOTOS_QUOTA_PROVIDER, photoQuotaBreakerDetails } from "../../placePhotoServe.js";

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
        const r = await fetchImpl(`${s.url}/rest/v1/wf_photo_outcome_daily?day=in.(${today},${yesterday})&select=day,class,n,updated_at`, {
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
    const latest = (match) => {
      const times = (Array.isArray(rows) ? rows : []).filter(r => Number(r?.n) > 0 && match(r.class)).map(r => Date.parse(r.updated_at)).filter(Number.isFinite);
      return times.length ? new Date(Math.max(...times)).toISOString() : null;
    };
    return { source: srcOk(NAME, { confidence: "measured" }), data: {
      today: byDay(today), yesterday: byDay(yesterday), todayKey: today, yesterdayKey: yesterday,
      latestSuccessfulResponseAt: latest(cls => cls === "response-served"),
      latestGoogleSuccessAt: latest(cls => cls === "ok"),
      latestRefusalAt: latest(cls => cls === "response-refused" || /^ledger-(?:cap|denied|timeout|http|unconfigured)$/.test(cls) || cls === "quota-open" || /^(?:(?:place-lookup-failed|fresh-failed|stale-heal-failed):)?(?:quota|key-denied)$/.test(cls)),
    } };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}

// Is Google's per-day photo quota breaker OPEN right now? (2026-10-14: quota ran
// out at 6:02 PM ET, the breaker held until Pacific midnight, every Google-only
// card showed the fallback tile all evening and the whole-day ratio alert stayed
// quiet.) Reads the same breaker row placePhotoServe trips. Fail-soft: any read
// problem is data:null (no alert), never a throw. Read the persisted expiry;
// legacy rows use the short-lookup or daily-media hold that wrote them.
export async function photoQuotaBreaker(opts = {}) {
  const read = opts.breakerOpenImpl || breakerOpen;
  try {
    const row = await read(GOOGLE_PHOTOS_QUOTA_PROVIDER);
    if (!row || !row.kind) return { source: srcOk("Google photo quota breaker", { confidence: "measured" }), data: { open: false } };
    const hold = photoQuotaBreakerDetails(row);
    if (!hold) return { source: srcError("Google photo quota breaker", "breaker row has no usable timestamp"), data: null };
    return { source: srcOk("Google photo quota breaker", { confidence: "measured" }), data: { open: true, ...hold } };
  } catch (e) {
    return { source: srcError("Google photo quota breaker", e && e.message), data: null };
  }
}
