// scripts/test-image-health-report.mjs — the imageHealth block of /api/health/photos.
//
// HERMETIC, CALL-based: lib/imageHealth.computeImageHealth is INVOKED with a fake
// fetch that answers known counts per PostgREST path; every field is asserted on the
// return value. Also: fail-soft (one endpoint 500 -> only that field null), no
// request ever targets googleapis, nothing but GET (read-only), counts are bounded
// (limit=1 + count=exact), and the real route returns the block (route executed).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeImageHealth, siteMidnightIso } from "../lib/imageHealth.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

const NOW = new Date("2026-10-14T15:00:00Z"); // 11:00 EDT -> site day 2026-10-14, midnight = 04:00Z
const S = { url: "https://sb.test", key: "k" };

// path-substring -> count. Order matters: most specific first.
const COUNTS = [
  ["wf_inventory?select=place_id,wf_place_photo!inner", 30],
  ["photo_ref=not.is.null", 900],
  ["wf_inventory?", 1000],
  ["wf_place_photo?", 120],
  ["status=eq.open", 11], ["status=eq.unresolved", 22], ["status=eq.recovered", 33], ["status=eq.budget_blocked", 4],
  ["last_error=like.reopened*", 5],
  ["hero_image=not.like./*", 17],
  ["hero_image_kind=is.null", 40],
  ["hero_image_kind=eq.event", 60], ["hero_image_kind=eq.venue", 25],
  ["start_date=gte.2026-10-14", 8],
  ["hero_image=not.is.null", 125],
  ["wf_events?", 200],
];
const ROWS = [
  ["wf_spend_ledger?sku=eq.photos", [{ used: 700, cap: 950 }]],
  ["wf_photo_purchase?", [
    { ledger_reason: "granted", idempotency_key: "a" }, { ledger_reason: "granted", idempotency_key: "a" },
    { ledger_reason: "granted", idempotency_key: "b" }, { ledger_reason: "visitor-cap", idempotency_key: "c" },
    { ledger_reason: "cap", idempotency_key: "d" }, { ledger_reason: null, idempotency_key: "e" },
  ]],
  ["sku=like.pv:*", [{ used: 5, cap: 5 }, { used: 2, cap: 5 }, { used: 9, cap: 5 }]],
  ["wf_photo_outcome_daily?", [
    { class: "ok", n: 50 }, { class: "free-photo-preferred", n: 7 }, { class: "gate-shut", n: 3 }, { class: "visitor-cap", n: 2 },
    { class: "not-page-request", n: 9 }, { class: "quota-open", n: 1 }, { class: "ledger-cap", n: 4 },
    { class: "quota", n: 6 }, { class: "server", n: 2 }, { class: "network", n: 1 }, { class: "key-denied", n: 1 },
    { class: "fresh-failed:quota", n: 3 }, { class: "fresh-failed:server", n: 2 },
  ]],
];

function makeFetch({ fail = [] } = {}) {
  const log = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    log.push({ url: u, method: (init && init.method) || "GET", headers: init.headers || {}, signal: !!init.signal });
    const path = u.replace("https://sb.test/rest/v1/", "");
    if (fail.some((x) => path.includes(x))) return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) };
    const isCount = (init.headers || {}).Prefer === "count=exact";
    if (isCount) {
      const hit = COUNTS.find(([k]) => path.includes(k));
      if (!hit) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
      return { ok: true, status: 206, headers: { get: (h) => (h.toLowerCase() === "content-range" ? `0-0/${hit[1]}` : null) }, json: async () => [] };
    }
    const hit = ROWS.find(([k]) => path.includes(k));
    if (!hit) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => hit[1] };
  };
  return { f, log };
}

// ── midnight helper: EDT and EST both resolve to the Eastern day start
eq(siteMidnightIso(new Date("2026-10-14T15:00:00Z")), "2026-10-14T04:00:00.000Z", "EDT midnight is 04:00Z");
eq(siteMidnightIso(new Date("2026-12-14T15:00:00Z")), "2026-12-14T05:00:00.000Z", "EST midnight is 05:00Z");
eq(siteMidnightIso(new Date("2026-10-15T02:00:00Z")), "2026-10-14T04:00:00.000Z", "02:00Z is still the 14th Eastern");

// ── full happy path, every field
{
  const { f, log } = makeFetch();
  const h = await computeImageHealth(S, { fetchImpl: f, now: NOW });
  eq(h.places, { published: 1000, withGooglePhotoRef: 900, withActiveOwnedPhoto: 120, hardGaps: 70, hardGapsNote: h.places.hardGapsNote }, "places (hardGaps = (1000-900) - 30)");
  eq(h.repairQueue, { open: 11, unresolved: 22, recovered: 33, budget_blocked: 4, reopenedEvidenceGone: 5 }, "repairQueue");
  eq({ ...h.events, rightsRiskNote: 0 }, { total: 200, withImage: 125, noImage: 75, upcomingNoImage: 8, kindEvent: 60, kindVenue: 25, kindUnclassified: 40, rightsRisk: 17, rightsRiskNote: 0 }, "events");
  eq(h.spend.photosLedgerMonthUtc, "2026-10", "ledger labelled UTC month");
  eq(h.spend.siteDay, "2026-10-14", "spend site day is Eastern");
  eq([h.spend.photosLedgerUsed, h.spend.photosLedgerCap], [700, 950], "ledger used/cap");
  eq(h.spend.purchasesToday, { granted: 3, "visitor-cap": 1, cap: 1, "(none)": 1 }, "purchases grouped by ledger_reason");
  eq(h.spend.duplicateGrantedKeys, 1, "only key 'a' was granted twice");
  eq(h.spend.visitorBucketsAtCap, 2, "buckets at/over cap");
  eq(h.outcomesToday, {
    ok: 50, freePhotoPreferred: 7, gateShut: 3, visitorCap: 2, notPageRequest: 9, quotaOpen: 1, ledgerCap: 4,
    providerFailures: { quota: 6, server: 2, network: 1, keyDenied: 1, freshFailed: 5 },
  }, "outcomesToday");
  // read-only / bounded / no Google / purchases windowed from Eastern midnight
  ok(log.length === 20, "positive control: the probe saw the requests");
  ok(log.every((r) => r.method === "GET"), "every request is a GET (nothing written)");
  ok(log.every((r) => !/googleapis|google\.com|places\./i.test(r.url)), "no request targets googleapis/Google");
  ok(log.every((r) => r.url.startsWith("https://sb.test/rest/v1/")), "every request targets the Supabase REST host");
  ok(log.every((r) => r.signal), "every request carries a timeout signal");
  const counted = log.filter((r) => r.headers.Prefer === "count=exact");
  ok(counted.length === 16 && counted.every((r) => /[?&]limit=1$/.test(r.url)), `all ${counted.length} counts are limit=1 + count=exact`);
  ok(log.some((r) => r.url.includes("wf_photo_purchase?ts=gte.2026-10-14T04%3A00%3A00.000Z")), "purchases read since Eastern midnight");
  ok(log.some((r) => r.url.includes("month=eq.2026-10")), "ledger keyed by UTC month");
}

// ── fail-soft: one endpoint 500 -> that field null, others intact
{
  const { f } = makeFetch({ fail: ["wf_photo_repair_queue?select=place_id&status=eq.unresolved", "wf_photo_purchase?"] });
  const h = await computeImageHealth(S, { fetchImpl: f, now: NOW });
  eq(h.repairQueue.unresolved, null, "failed count -> null");
  eq([h.repairQueue.open, h.repairQueue.recovered, h.repairQueue.reopenedEvidenceGone], [11, 33, 5], "sibling queue counts intact");
  eq([h.spend.purchasesToday, h.spend.duplicateGrantedKeys, h.spend.purchasesTodayTruncated], [null, null, null], "purchase-derived fields null");
  eq([h.spend.photosLedgerUsed, h.spend.visitorBucketsAtCap], [700, 2], "other spend fields intact");
  eq(h.places.published, 1000, "places intact");
  eq(h.events.total, 200, "events intact");
  eq(h.outcomesToday.ok, 50, "outcomes intact");
}
{ // a dependency of a derived field fails -> derived is null, not a wrong number
  const { f } = makeFetch({ fail: ["photo_ref=not.is.null"] });
  const h = await computeImageHealth(S, { fetchImpl: f, now: NOW });
  eq([h.places.withGooglePhotoRef, h.places.hardGaps], [null, null], "hardGaps null when its input is unreadable");
  eq(h.places.published, 1000, "published intact");
}
{ // everything down / fetch throws / timeout -> all null, never throws
  const boom = async () => { throw new Error("network down"); };
  const h = await computeImageHealth(S, { fetchImpl: boom, now: NOW });
  eq([h.places.published, h.repairQueue.open, h.events.total, h.spend.photosLedgerUsed, h.outcomesToday], [null, null, null, null, null], "total outage -> nulls, no throw");
}

// ── the REAL route returns the block, keeps its old contract
{
  process.env.CRON_SECRET = "s3cret";
  process.env.SUPABASE_URL = "https://sb.test";
  // The route prefers NEXT_PUBLIC_SUPABASE_URL over SUPABASE_URL. Vercel's build env defines it, which sent
  // the route to the real host, tripped the non-Supabase guard below and returned 503 (production build
  // failed 2026-10-14). Pin it so the test is the same in CI, locally and on Vercel.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sb.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const { f, log } = makeFetch();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (!u.startsWith("https://sb.test/")) throw new Error("route made a non-Supabase request: " + u);
    const path = u.replace("https://sb.test/rest/v1/", "");
    // the route's pre-existing reads (Range-based counts / pulse / ledger) answer generically
    if ((init.headers || {}).Range) return { ok: true, status: 206, headers: { get: () => "0-0/7" }, json: async () => [] };
    if (path.startsWith("wf_job_pulse")) return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
    return f(url, init);
  };
  try {
    const { GET } = await loadComponent(path.join(REPO, "app/api/health/photos/route.js"), REPO);
    const unauth = await GET({ headers: { get: () => null } });
    eq(unauth.status, 401, "auth unchanged: no bearer -> 401");
    const res = await GET({ headers: { get: (h) => (h.toLowerCase() === "authorization" ? "Bearer s3cret" : null) } });
    eq(res.status, 200, "route 200");
    const body = await res.json();
    ok(body.surface === "place-photos" && "activeWithRef" in body && "photoAllowance" in body && "runway" in body, "existing contract fields still present");
    ok(body.imageHealth && body.imageHealth.places.published === 1000 && body.imageHealth.events.total === 200, "route embeds imageHealth");
    ok(log.every((r) => !/googleapis/i.test(r.url)), "route imageHealth made no Google request");
  } finally { globalThis.fetch = realFetch; }
}

console.log(`test-image-health-report: OK — ${n} assertions; computeImageHealth executed against a fake PostgREST (all fields, per-field fail-soft, total outage, GET-only, limit=1 counts, zero googleapis requests) and the real route returns the block with its prior contract intact`);
