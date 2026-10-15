// lib/commandCenter/sources/photoQuota.js — how much of GOOGLE'S per-day photo
// quota is spent, and how fast (2026-10-15). READ-ONLY PostgREST counts against
// our own Supabase; it never calls Google and never touches any quota.
//
// WHAT COUNTS: wf_photo_purchase rows with ledger_reason='granted' since Pacific
// midnight (Google's quota day), REGARDLESS of upstream. A granted request that
// Google then failed or timed out can still be metered against the daily quota,
// so counting only upstream='ok' would under-report and warn late. Over-counting
// a little is the safe direction for an early warning.
//
// Fail-soft: the day total failing => data:null (no alert, no throw). Every other
// field degrades to null on its own. Bounded: 4s per request.
import { srcOk, srcError, srcMissing } from "../respond.js";
import { sbAdmin } from "../supabaseAdmin.js";
import { ledgerMonth } from "../../photoCoverage.js";
import { googleQuotaDayStart, PHOTO_PURCHASE_SPIKE_MIN } from "../../googlePhotoQuota.js";

const NAME = "Google photo daily quota (wf_photo_purchase)";
const TIMEOUT_MS = 4000;
const ROW_CAP = 5000;

export async function photoGoogleQuota(opts = {}) {
  const s = opts.sb || sbAdmin(opts.env);
  if (!s) return { source: srcMissing(NAME, "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment."), data: null };
  const now = opts.now ? new Date(opts.now) : new Date();
  const fetchImpl = opts.fetchImpl || fetch;
  const headers = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const get = async (path, extra) => {
    const r = await fetchImpl(`${s.url}/rest/v1/${path}`, { headers: { ...headers, ...(extra || {}) }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r || !r.ok) throw new Error(`${path.split("?")[0]} -> HTTP ${r && r.status}`);
    return r;
  };
  const count = async (path) => {
    const r = await get(`${path}&limit=1`, { Prefer: "count=exact" });
    const n = Number(String(r.headers.get("content-range") || "").split("/")[1]);
    if (!Number.isFinite(n)) throw new Error("no count in content-range");
    return n;
  };
  const rows = async (path) => { const j = await (await get(path)).json(); if (!Array.isArray(j)) throw new Error("bad rows"); return j; };
  const soft = async (fn) => { try { return await fn(); } catch { return null; } };

  const dayStart = googleQuotaDayStart(now);
  const dayIso = encodeURIComponent(dayStart.toISOString());
  const hourIso = encodeURIComponent(new Date(now.getTime() - 3600000).toISOString());
  const month = ledgerMonth(now); // wf_spend_ledger months are UTC
  const granted = "wf_photo_purchase?select=id&ledger_reason=eq.granted";
  try {
    const used = await count(`${granted}&ts=gte.${dayIso}`);
    const [lastHour, reqLastHour, capRows, ledger] = await Promise.all([
      soft(() => count(`${granted}&ts=gte.${hourIso}`)),
      soft(() => count(`wf_photo_purchase?select=id&ts=gte.${hourIso}`)),
      // Buckets that hit the per-visitor cap today: distinct hashes among visitor-cap refusals.
      soft(() => rows(`wf_photo_purchase?select=bucket_hash&ledger_reason=eq.visitor-cap&ts=gte.${dayIso}&limit=${ROW_CAP}`)),
      soft(() => rows(`wf_spend_ledger?sku=eq.photos&month=eq.${month}&select=used,cap&limit=1`)),
    ]);
    let topUa = null, distinctBuckets = null;
    if (lastHour != null && lastHour >= PHOTO_PURCHASE_SPIKE_MIN) {
      const hr = await soft(() => rows(`wf_photo_purchase?select=ua_class,bucket_hash&ledger_reason=eq.granted&ts=gte.${hourIso}&limit=${ROW_CAP}`));
      if (hr) {
        const ua = new Map(), bk = new Set();
        for (const r of hr) { const k = (r && r.ua_class) || "unknown"; ua.set(k, (ua.get(k) || 0) + 1); if (r && r.bucket_hash) bk.add(r.bucket_hash); }
        const top = [...ua.entries()].sort((a, z) => z[1] - a[1])[0];
        topUa = top ? { ua_class: top[0], n: top[1] } : null;
        distinctBuckets = bk.size;
      }
    }
    const led = ledger && ledger[0] ? ledger[0] : null;
    return {
      source: srcOk(NAME, { confidence: "measured" }),
      data: {
        dayStartPT: dayStart.toISOString(),
        used, lastHour, reqLastHour,
        visitorBucketsAtCap: capRows ? new Set(capRows.map((r) => r && r.bucket_hash).filter(Boolean)).size : null,
        monthUsed: led && Number.isFinite(Number(led.used)) ? Number(led.used) : null,
        monthCap: led && Number.isFinite(Number(led.cap)) ? Number(led.cap) : null,
        topUa, distinctBuckets,
      },
    };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}
