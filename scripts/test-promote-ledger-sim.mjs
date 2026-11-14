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
  // A world is an independent fixture, including the shared provider cache.
  // Consecutive runs within one world retain its breaker, as production does.
  globalThis.__wfServerCacheMem?.clear();
  const w = { dbMonth, ledger: new Map(Object.entries(ledger)), googleCalls: [], takes: [], refunds: [], dayTakes: [], dayRefunds: [], claims: 0, places, google, monthCap, batchLimit };
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
      // The per-day background counter (lib/spendGate.js BACKGROUND DAILY LINE) rides the same RPC. It is a
      // second row, not a monthly SKU: it is recorded apart so every assertion below stays about the monthly grants.
      (isBackgroundDailySku(p_sku) ? w.dayTakes : w.takes).push({ sku: p_sku, cap: p_cap, granted });
      return json(granted);
    }
    if (u.includes("/rest/v1/rpc/wf_spend_refund")) {
      const { p_sku, p_n } = JSON.parse(init.body);
      const r = w.ledger.get(w.dbMonth + "|" + p_sku);
      (isBackgroundDailySku(p_sku) ? w.dayRefunds : w.refunds).push({ sku: p_sku, n: p_n });
      if (!r || !(p_n >= 1 && p_n <= 10)) return json(false);
      r.used = Math.max(r.used - p_n, 0);
      return json(true);
    }
    if (u.includes("/rest/v1/rpc/wf_promotion_claim")) {
      w.claims++;
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
const { isBackgroundDailySku } = await import("../lib/spendGate.js");
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
  // The day counter moves in step with the monthly row: one tick taken for the one grant, one given back for the unbilled 429.
  eq([w.dayTakes.length, w.dayRefunds.length], [1, 1], "1: the one Pro grant ticked the Pacific day's counter once and the unbilled 429 gave that tick back");
  const again = await runCron(w);
  eq([again.skipped, again.claimed], ["breaker open", 0], "1: a later run in the same world skips while the daily breaker holds");
  eq([w.claims, w.googleCalls.length, w.takes.length, w.refunds.length], [1, 1, 1, 1], "1: the later run adds no claim, provider call, grant or refund");
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
eq(pass, 21, "every case ran (red-proved 2026-11-05: deleting `await refundToLedger(requestSku, 1)` from the route fails case 1)");

// ── PROMOTION'S HALF OF THE ENTERPRISE LINE (#2131), on the CALL ─────────────
// 950 free line -> promotion stops at 475 used. Unrated places past the share
// promote from CORE (Pro), never Enterprise.
//
// 2026-11-11 HUMAN TRAFFIC RESERVE (lib/spendGate.js): the route now declares itself
// BACKGROUND, so a SECOND, tighter ceiling applies inside the same half: promotion
// stops at HUMAN_LINE = 380 used (80% of the 475 visitors can draw) and the last 95
// are visitor-only. The 475 share is unchanged and still binds when it is the lower
// number (it is not, for the Enterprise row, any more). Cases 6, 8, 9 and 10 below
// were re-pinned from used=470/472 (5 and 3 buys up to 475) to used=375/377 (5 and 3
// buys up to 380) with the SAME assertions about what a buy costs and where it lands.
// Case 7 (at/over the share nothing is even asked) is untouched, and 6b/7b are new:
// they pin the reserve itself on the real route.
const HUMAN_LINE = 380;
const unrated = (n, p = "u") => Array.from({ length: n }, (_, i) => ({ id: p + i, rated: false }));
const ent = (w, m = M) => (w.row("details_enterprise", m) || { used: 0 }).used;
// 6. Remaining allowance: 375 used, 10 unrated places -> exactly 5 rating buys, 5 CORE.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_enterprise"]: { used: 375, cap: 950 }, [M + "|details_pro"]: { used: 0, cap: 4800 } }, places: unrated(10), google: {} });
  const out = await runCron(w, "free");
  eq(out.ratingBought, 5, "6: the route's response counts exactly 5 rating buys");
  eq(ent(w), HUMAN_LINE, "6: promotion buys up to the human reserve line and stops at 380 used (the 475 share is a second ceiling)");
  eq(w.googleCalls.filter((c) => c.mask.includes("rating")).length, 5, "6: five rating-mask calls");
  eq(w.row("details_pro").used, 5, "6: the other five promote from CORE on Pro");
}
// 6b. AT the human line (380): no Enterprise take at all, every place promotes from CORE,
//     and the run is not a failure (all five promoted).
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_enterprise"]: { used: HUMAN_LINE, cap: 950 }, [M + "|details_pro"]: { used: 0, cap: 4800 } }, places: unrated(5), google: {} });
  const out = await runCron(w, "free");
  eq([out.ratingBought, ent(w), w.takes.filter((t) => t.sku === "details_enterprise").length], [0, HUMAN_LINE, 0], "6b: at the human line the Enterprise ledger is not asked and nothing is bought");
  eq([out.promoted, w.row("details_pro").used], [5, 5], "6b: the five places still promote from CORE on Pro");
}
// 7. Exhausted share: 475 used -> no Enterprise take at all.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_enterprise"]: { used: 475, cap: 950 } }, places: unrated(4), google: {} });
  await runCron(w, "free");
  eq(w.takes.filter((t) => t.sku === "details_enterprise").length, 0, "7: at the share the Enterprise ledger is not even asked");
  eq(ent(w), 475, "7: the refresh's half is untouched");
}
// 8. OPEN gate mode, month_cap 7,500: the ceiling is still the FREE line's, not month_cap's.
//    Red-proved: with ratingFreeLine = effectiveCap(RATING_SKU, monthCap) all 10 buy (385 used).
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_enterprise"]: { used: 375, cap: 950 } }, places: unrated(10), google: {}, monthCap: 7500 });
  const out = await runCron(w, "open");
  eq(out.ratingBought, 5, "8: open mode: the route's response counts 5 rating buys, not 10");
  eq(ent(w), HUMAN_LINE, "8: open mode stops at the same 380 (the line comes from the free line and the visitor ceiling, never month_cap)");
}
// 9. Retries: a rating buy that 5xx's twice takes three grants; they count toward the share,
//    so the next unrated place cannot buy past it.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_enterprise"]: { used: 377, cap: 950 } },
    places: [{ id: "r0", rated: false }, { id: "r1", rated: false }, { id: "r2", rated: false }], google: { r0: [503, 503, 200] } });
  await runCron(w, "free");
  eq(ent(w), HUMAN_LINE, "9: 377 + three grants for one retried call = 380; no further rating buys");
  eq(w.googleCalls.filter((c) => c.mask.includes("rating")).length, 3, "9: only the retried place used the rating mask");
}
// 10. Month boundary, database first: the DB has rolled to the next month while the app
//     clock has not. The run reads this month's 375 (a stale number) and buys all 10 (the
//     reserve re-reads the same stale month, so it cannot see the new row's count);
//     the grants land on the new month's row. Bounded by the batch and by the share.
{
  const next = new Date(Date.UTC(+M.slice(0, 4), +M.slice(5, 7), 1)).toISOString().slice(0, 7);
  const w = makeWorld({ dbMonth: next, ledger: { [M + "|details_enterprise"]: { used: 375, cap: 950 } }, places: unrated(10), google: {} });
  await runCron(w, "free");
  eq([ent(w, M), ent(w, next)], [375, 10], "10: the old month is untouched; the new month gets the 10 the stale read allowed");
}
// 11. Month boundary, fresh month with no row yet: the usage read finds nothing and the
//     buy FAILS CLOSED (no stars bought, places promote from CORE) until another caller
//     creates the row. Conservative by design; spends nothing on Enterprise.
{
  const w = makeWorld({ dbMonth: M, ledger: { [M + "|details_pro"]: { used: 0, cap: 4800 } }, places: unrated(3), google: {} });
  await runCron(w, "free");
  eq([ent(w), w.row("details_pro").used], [0, 3], "11: no ledger row -> no rating buy, three CORE promotions");
}
// 12. Concurrency (scripts/promote-worker.mjs runs items through pmap). The worker is a
//     CLI, not importable, so this drives the REAL ratingBuyAllowed through the worker's
//     exact pattern with an async ledger, and asserts the worker source uses that pattern.
{
  const { ratingBuyAllowed } = await import("../lib/promoteDetails.js");
  const sim = async (reserveFirst) => {
    let bought = 0, used = 470; const usage = { used: 470, cap: 950 };
    const take = async () => { await new Promise((r) => setTimeout(r, 5)); if (used + 1 > 950) return false; used++; return true; };
    await Promise.all(Array.from({ length: 8 }, async () => {
      if (reserveFirst) {
        const reserved = ratingBuyAllowed(usage, bought, 950); if (reserved) bought++;
        if (reserved && !(await take())) bought--;
      } else if (ratingBuyAllowed(usage, bought, 950) && (await take())) bought++;
    }));
    return used;
  };
  eq(await sim(false), 478, "12: control — check-then-increment across an await lets all 8 concurrent buys through (478)");
  eq(await sim(true), 475, "12: reserve-before-await stops at the share (475) with 8 in flight");
  const { readFileSync } = await import("node:fs");
  const wsrc = readFileSync(new URL("./promote-worker.mjs", import.meta.url), "utf8").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(/const reserved = !hasIndexRating\(sig\) && ratingBuyAllowed\(ratingUsage, ratingBought, ratingFreeLine\);\s*if \(reserved\) ratingBought\+\+;\s*if \(reserved && \(await spendAllowCapped\(RATING_SKU/.test(wsrc),
    "12: STRUCTURAL (the worker is a CLI): the worker reserves the share slot before awaiting the ledger");
  ok(/const ratingFreeLine = freeTierLine\(RATING_SKU\);/.test(wsrc), "12: STRUCTURAL: the worker computes the share from the free line");
}
eq(pass, 40, "every share case ran (37 + the two 6b reserve assertions added 2026-11-11 + the one day-counter tick/refund assertion added 2026-11-12)");

console.log(`test-promote-ledger-sim: OK (${pass} checks: 429 refunds by SKU, retry 429 refunds once, parked places take no grant, billed answers keep their grant, refused grants make no call; promotion's Enterprise share holds at remaining/exhausted/open-mode/retries/both month-boundary directions/8-way concurrency)`);
