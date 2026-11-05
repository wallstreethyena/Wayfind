#!/usr/bin/env node
// scripts/test-promote-ledger-sim.mjs — the promotion cron's LEDGER behaviour,
// asserted on the CALL: the real GET handler of app/api/cron/promote-index runs
// against an in-memory ledger that reproduces public.wf_spend_take /
// public.wf_spend_refund exactly (same (month, sku) key, `used + n <= cap`,
// `cap = p_cap` on a take, `greatest(used - n, 0)` on a refund) and a scripted
// Google Places Details endpoint. NO network: every fetch is answered here.
//
// WHAT IT PROVES (2026-11-05 lane closeout, follow-up to #2124):
//   * a daily-quota 429 gives back exactly the grant that call took, under the
//     SKU it was taken under (details_pro for CORE, details_enterprise for RATING);
//   * a 429 on a retry (after a 5xx took its own grant) refunds exactly one, the
//     429's, never the 5xx grant and never twice;
//   * the rest of the batch is parked without taking a grant, so nothing else
//     needs a refund (no duplicate refunds);
//   * a successful call keeps its grant (legitimate consumption is preserved);
//   * a refused grant makes no Google call and is never refunded.
import { register } from "node:module";
register("./lib/nodeResolveHook.mjs", import.meta.url);

let pass = 0;
const fail = (m) => { console.error("test-promote-ledger-sim: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eq = (g, w, m) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail(`${m}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); pass++; };

process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_stub";
process.env.GOOGLE_MAPS_SERVER_KEY = "g_stub";
process.env.CRON_SECRET = "cron_stub";
delete process.env.WAYFIND_PROMOTE_PAID;
delete process.env.PROMOTE_DETAILS_MONTH_CAP;

// ── the world ───────────────────────────────────────────────────────────────
export function makeWorld({ dbMonth, ledger = {}, places, google, monthCap = 7500, batchLimit = 50 }) {
  const w = { dbMonth, ledger: new Map(Object.entries(ledger)), googleCalls: [], takes: [], refunds: [], places, google, monthCap, batchLimit };
  w.row = (sku, month = w.dbMonth) => w.ledger.get(month + "|" + sku) || null;
  w.fetch = async (url, init = {}) => {
    const u = String(url);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.startsWith("https://places.googleapis.com/v1/places/")) {
      const id = decodeURIComponent(u.split("/places/")[1]);
      const mask = (init.headers || {})["X-Goog-FieldMask"];
      w.googleCalls.push({ id, mask });
      const script = w.google[id] || [];
      const step = script.length ? script.shift() : 200;
      if (step === 200) return json({ id, displayName: { text: "Place " + id }, location: { latitude: 27.95, longitude: -82.46 }, types: ["cafe"], primaryType: "cafe", businessStatus: "OPERATIONAL", formattedAddress: "1 Main St, Tampa, FL", photos: [] });
      const body = step === 429 ? "Quota exceeded for quota metric 'GetPlaceRequest' and limit 'GetPlaceRequest per day' of service 'places.googleapis.com'" : "UNAVAILABLE";
      return { ok: false, status: step, text: async () => body, json: async () => ({}) };
    }
    if (u.includes("/rest/v1/rpc/wf_spend_take")) {
      const { p_sku, p_cap } = JSON.parse(init.body); const n = 1;
      const k = w.dbMonth + "|" + p_sku;
      if (!w.ledger.has(k)) w.ledger.set(k, { used: 0, cap: p_cap });
      const r = w.ledger.get(k);
      const granted = r.used + n <= p_cap;
      if (granted) { r.used += n; r.cap = p_cap; }
      w.takes.push({ sku: p_sku, cap: p_cap, granted });
      return json(granted);
    }
    if (u.includes("/rest/v1/rpc/wf_spend_refund")) {
      const { p_sku, p_n } = JSON.parse(init.body);
      const r = w.ledger.get(w.dbMonth + "|" + p_sku);
      w.refunds.push({ sku: p_sku, n: p_n });
      if (!r || !(p_n >= 1 && p_n <= 10)) return json(false);
      r.used = Math.max(r.used - p_n, 0);
      return json(true);
    }
    if (u.includes("/rest/v1/rpc/wf_promotion_claim")) {
      const out = w.places.splice(0, JSON.parse(init.body).p_limit);
      return json(out.map((p) => ({ place_id: p.id, metro: "tampa", name: "Place " + p.id })));
    }
    if (u.includes("/rest/v1/wf_spend_ledger?")) {
      const month = /month=eq\.([0-9-]+)/.exec(u)[1];
      const sku = decodeURIComponent(/sku=eq\.([^&]+)/.exec(u)[1]);
      const r = w.ledger.get(month + "|" + sku);
      return json(r ? [{ used: r.used, cap: r.cap }] : []);
    }
    if (u.includes("/rest/v1/wf_place_ids?")) {
      return json(w.placesIndex.map((p) => ({ place_id: p.id, signals: p.rated ? { rating: 4.5, reviews: 120 } : { rating: null, reviews: 0 } })));
    }
    if (u.includes("/rest/v1/wf_promote_config?") && (!init.method || init.method === "GET")) {
      return json([{ batch_limit: w.batchLimit, auto: false, month_cap: w.monthCap }]);
    }
    if (u.includes("/rest/v1/wf_promote_metros?")) return json([], 500);
    return json([]);
  };
  w.placesIndex = [...places];
  return w;
}

const { GET } = await import("../app/api/cron/promote-index/route.js");
export async function runCron(w, mode = "free") {
  process.env.WAYFIND_GATE = mode;
  const realFetch = globalThis.fetch;
  globalThis.fetch = w.fetch;
  const warn = console.warn; const log = console.log; console.warn = () => {}; console.log = () => {};
  try {
    const res = await GET(new Request("https://wayfind.test/api/cron/promote-index", { headers: { authorization: "Bearer cron_stub" } }));
    return await res.json();
  } finally { globalThis.fetch = realFetch; console.warn = warn; console.log = log; delete process.env.WAYFIND_GATE; }
}
const M = new Date().toISOString().slice(0, 7);
// 0. Control: the real handler's auth gate. No secret -> 401, and no grant or Google call happens.
{
  const w = makeWorld({ dbMonth: M, ledger: {}, places: [{ id: "z", rated: true }], google: {} });
  process.env.WAYFIND_GATE = "free"; const realFetch = globalThis.fetch; globalThis.fetch = w.fetch;
  const res = await GET(new Request("https://wayfind.test/api/cron/promote-index"));
  globalThis.fetch = realFetch; delete process.env.WAYFIND_GATE;
  eq([res.status, w.takes.length, w.googleCalls.length], [401, 0, 0], "0: an unauthorized call is refused before any ledger grant or Google request");
}
const sum = (arr, sku) => arr.filter((x) => x.sku === sku && (x.granted === undefined || x.granted)).reduce((a, x) => a + (x.n || 1), 0);

// 1. Rated place, 429 on the first call: one Pro grant taken, one Pro refund, the rest parked with no grant.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_pro"]: { used: 100, cap: 4800 } },
    places: [{ id: "a", rated: true }, { id: "b", rated: true }, { id: "c", rated: false }], google: { a: [429] } });
  const out = await runCron(w);
  eq([out.quota, out.quotaParked], ["quota_daily", 3], "1: the route's own response reports the daily quota and parks all three places");
  eq(w.googleCalls.map((c) => c.id), ["a"], "1: only the first place reaches Google; the rest are parked after the 429");
  eq(sum(w.takes, "details_pro"), 1, "1: exactly one Pro grant was taken");
  eq(w.refunds, [{ sku: "details_pro", n: 1 }], "1: exactly one Pro refund, nothing for the parked places");
  eq(w.row("details_pro").used, 100, "1: the Pro row is back where it started (the 429 was unbilled)");
}
// 2. Unrated place buys the rating mask, 429: the refund goes to details_enterprise, not Pro.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_enterprise"]: { used: 10, cap: 950 }, [M + "|details_pro"]: { used: 100, cap: 4800 } },
    places: [{ id: "u", rated: false }, { id: "v", rated: true }], google: { u: [429] } });
  await runCron(w);
  ok(w.googleCalls[0].mask.includes("rating"), "2: the unrated place was asked with the rating mask");
  eq(w.refunds, [{ sku: "details_enterprise", n: 1 }], "2: the refund goes back under details_enterprise, the SKU the grant was taken under");
  eq([w.row("details_enterprise").used, w.row("details_pro").used], [10, 100], "2: both rows unchanged after the unbilled call");
}
// 3. 5xx then 429 on the retry: two grants taken, only the 429's grant is refunded (one refund, never two).
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_pro"]: { used: 0, cap: 4800 } },
    places: [{ id: "r", rated: true }], google: { r: [503, 429] } });
  await runCron(w);
  eq(w.googleCalls.length, 2, "3: one 5xx answer and one retry reached Google");
  eq(sum(w.takes, "details_pro"), 2, "3: the retry took its own grant");
  eq(w.refunds.length, 1, "3: exactly one refund (the 429), never a duplicate");
  eq(w.row("details_pro").used, 1, "3: one grant stays counted (the 5xx's, whose billing this lane does not assume)");
}
// 4. Success keeps its grant; no refund on a billed answer.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_pro"]: { used: 5, cap: 4800 } },
    places: [{ id: "s1", rated: true }, { id: "s2", rated: true }], google: {} });
  await runCron(w);
  eq(w.refunds.length, 0, "4: a billed (200) answer is never refunded");
  eq(w.row("details_pro").used, 7, "4: two successful calls keep two grants (legitimate consumption preserved)");
}
// 5. Exhausted Pro row: the grant is refused, Google is never called, nothing is refunded.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_pro"]: { used: 4800, cap: 4800 } },
    places: [{ id: "x", rated: true }, { id: "y", rated: true }], google: {} });
  await runCron(w);
  eq(w.googleCalls.length, 0, "5: no grant, no Google call");
  eq(w.refunds.length, 0, "5: a refused grant is never refunded");
  eq(w.row("details_pro").used, 4800, "5: the row never goes past its cap");
}
eq(pass, 18, "every case ran (red-proved 2026-11-05: deleting `await refundToLedger(requestSku, 1)` from the route fails case 1)");

console.log(`test-promote-ledger-sim: OK (${pass} checks: 429 refunds by SKU, retry 429 refunds once, parked places take no grant, billed answers keep their grant, refused grants make no call)`);
