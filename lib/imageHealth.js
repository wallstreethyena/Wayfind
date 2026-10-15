// lib/imageHealth.js — "how healthy are our images right now?" as ONE read-only
// block, so nobody needs a manual audit. Pure aggregation over PostgREST counts.
//
// READ ONLY. No writes, no Google, no spend: every request is a GET against the
// project's own Supabase REST host (the test proves none targets googleapis).
// Counts use `Prefer: count=exact` + `limit=1` and read content-range — never a
// whole-table pull. Every field is fail-soft: a failed/timed-out read makes THAT
// field null and never throws, so one broken table cannot blank the report.
import { siteTodayStr } from "./siteTime.js";
import { ledgerMonth } from "./photoCoverage.js";

const TIMEOUT_MS = 4000;
const ROW_CAP = 10000; // purchases / visitor buckets are grouped from one bounded read

/** UTC instant of the Eastern (site) midnight that starts the site day of `now`. */
export function siteMidnightIso(now = new Date()) {
  const today = siteTodayStr(now);
  const [y, m, d] = today.split("-").map(Number);
  for (const h of [4, 5]) {
    const c = new Date(Date.UTC(y, m - 1, d, h));
    if (siteTodayStr(c) === today && siteTodayStr(new Date(c.getTime() - 1)) !== today) return c.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d, 5)).toISOString();
}

function mk(s, fetchImpl) {
  const headers = { apikey: s.key, Authorization: "Bearer " + s.key };
  const get = async (path, extra) => {
    const r = await fetchImpl(`${s.url}/rest/v1/${path}`, { headers: { ...headers, ...(extra || {}) }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r || !r.ok) throw new Error(`${path} -> HTTP ${r && r.status}`);
    return r;
  };
  const count = async (path) => {
    const r = await get(`${path}${path.includes("?") ? "&" : "?"}limit=1`, { Prefer: "count=exact" });
    const n = Number(String(r.headers.get("content-range") || "").split("/")[1]);
    if (!Number.isFinite(n)) throw new Error(`${path} -> no count`);
    return n;
  };
  const rows = async (path) => (await get(path)).json();
  return { count, rows };
}
const soft = async (fn) => { try { return await fn(); } catch { return null; } };
const sub = (a, b) => (a == null || b == null ? null : Math.max(a - b, 0));

/** s = { url, key }. Returns the imageHealth block; never throws. */
export async function computeImageHealth(s, { fetchImpl = fetch, now = new Date() } = {}) {
  const { count, rows } = mk(s, fetchImpl);
  const today = siteTodayStr(now);
  const since = encodeURIComponent(siteMidnightIso(now));
  const month = ledgerMonth(now);
  const PUB = "status=eq.OPERATIONAL&or=(excluded.is.null,excluded.is.false)";
  const IMG = "hero_image=not.is.null&hero_image=neq.";

  const [published, withRef, withOwned, noRefButOwned] = await Promise.all([
    soft(() => count(`wf_inventory?select=place_id&${PUB}`)),
    soft(() => count(`wf_inventory?select=place_id&${PUB}&photo_ref=not.is.null`)),
    soft(() => count("wf_place_photo?select=place_id&status=eq.active")),
    // published, no ref, WITH an active owned photo (inner-joined embed). place_id is
    // wf_place_photo's primary key, so rows == distinct places.
    soft(() => count(`wf_inventory?select=place_id,wf_place_photo!inner(place_id)&wf_place_photo.status=eq.active&${PUB}&photo_ref=is.null`)),
  ]);
  const places = {
    published,
    withGooglePhotoRef: withRef,
    withActiveOwnedPhoto: withOwned,
    hardGaps: sub(sub(published, withRef), noRefButOwned),
    hardGapsNote: "published with no photo_ref, minus those with an active owned photo (embedded inner-join count)",
  };

  const qc = (st) => soft(() => count(`wf_photo_repair_queue?select=place_id&status=eq.${st}`));
  const [qOpen, qUnres, qRec, qBlocked, qReopened] = await Promise.all([
    qc("open"), qc("unresolved"), qc("recovered"), qc("budget_blocked"),
    soft(() => count("wf_photo_repair_queue?select=place_id&last_error=like.reopened*")),
  ]);
  const repairQueue = { open: qOpen, unresolved: qUnres, recovered: qRec, budget_blocked: qBlocked, reopenedEvidenceGone: qReopened };

  const ec = (q) => soft(() => count(`wf_events?select=id&${q}`));
  const [eTotal, eWith, eUpNo, eKindEvent, eKindVenue, eKindNull, eRights] = await Promise.all([
    ec("id=not.is.null"), ec(IMG),
    ec(`start_date=gte.${today}&or=(hero_image.is.null,hero_image.eq.)`),
    ec("hero_image_kind=eq.event"), ec("hero_image_kind=eq.venue"),
    ec(`${IMG}&hero_image_kind=is.null`),
    ec(`${IMG}&hero_image_kind=is.null&hero_image=not.like./*`),
  ]);
  const events = {
    total: eTotal, withImage: eWith, noImage: sub(eTotal, eWith), upcomingNoImage: eUpNo,
    kindEvent: eKindEvent, kindVenue: eKindVenue, kindUnclassified: eKindNull,
    rightsRisk: eRights, rightsRiskNote: "image present, kind null, hero_image not a same-origin '/' path (external hotlink)",
  };

  const [ledgerRows, purchaseRows, pvRows, outcomeRows] = await Promise.all([
    soft(() => rows(`wf_spend_ledger?sku=eq.photos&month=eq.${month}&select=used,cap&limit=1`)),
    soft(() => rows(`wf_photo_purchase?ts=gte.${since}&select=ledger_reason,idempotency_key&limit=${ROW_CAP}`)),
    soft(() => rows(`wf_spend_ledger?sku=like.pv:*&month=eq.${month}&select=used,cap&limit=${ROW_CAP}`)),
    soft(() => rows(`wf_photo_outcome_daily?day=eq.${encodeURIComponent(today)}&select=class,n`)),
  ]);
  const led = Array.isArray(ledgerRows) && ledgerRows[0] ? ledgerRows[0] : null;
  let purchasesToday = null, duplicateGrantedKeys = null;
  if (Array.isArray(purchaseRows)) {
    purchasesToday = {};
    const seen = new Map();
    for (const r of purchaseRows) {
      const reason = (r && r.ledger_reason) || "(none)";
      purchasesToday[reason] = (purchasesToday[reason] || 0) + 1;
      if (reason === "granted" && r.idempotency_key) seen.set(r.idempotency_key, (seen.get(r.idempotency_key) || 0) + 1);
    }
    duplicateGrantedKeys = [...seen.values()].filter((v) => v > 1).length;
  }
  const spend = {
    siteDay: today,
    photosLedgerMonthUtc: month,
    photosLedgerUsed: led && Number.isFinite(Number(led.used)) ? Number(led.used) : null,
    photosLedgerCap: led && Number.isFinite(Number(led.cap)) ? Number(led.cap) : null,
    purchasesToday,
    purchasesTodayTruncated: Array.isArray(purchaseRows) ? purchaseRows.length >= ROW_CAP : null,
    duplicateGrantedKeys,
    visitorBucketsAtCap: Array.isArray(pvRows) ? pvRows.filter((r) => Number(r.cap) > 0 && Number(r.used) >= Number(r.cap)).length : null,
  };

  let outcomesToday = null;
  if (Array.isArray(outcomeRows)) {
    const by = {};
    for (const r of outcomeRows) if (r && typeof r.class === "string") by[r.class] = (by[r.class] || 0) + (Number(r.n) || 0);
    const g = (k) => by[k] || 0;
    outcomesToday = {
      ok: g("ok"), freePhotoPreferred: g("free-photo-preferred"), gateShut: g("gate-shut"), visitorCap: g("visitor-cap"),
      notPageRequest: g("not-page-request"), quotaOpen: g("quota-open"), ledgerCap: g("ledger-cap"),
      providerFailures: {
        quota: g("quota"), server: g("server"), network: g("network"), keyDenied: g("key-denied"),
        freshFailed: Object.entries(by).reduce((a, [k, v]) => (k.startsWith("fresh-failed:") ? a + v : a), 0),
      },
    };
  }

  return { places, repairQueue, events, spend, outcomesToday, checkedAt: new Date(now).toISOString() };
}
