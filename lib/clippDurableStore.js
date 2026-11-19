// lib/clippDurableStore.js — Server-only Durable Persistence, Hydration, Execution
// Receipts, and Permitted Evidence Producer for the Clipp Commerce Lifecycle (C3).
//
// WHY THIS MODULE IS SEPARATE FROM lib/clippOffers.js:
// `lib/clippOffers.js` and `lib/coupons.js` are imported by client-rendered
// components (`"use client"`), so importing `node:fs`, `node:path`, or
// `lib/serverCache.js` inside them would break client bundling or trip the
// homepage bundle guard. This server-only module registers a synchronous/async
// persistence adapter with `lib/clippOffers.js` and owns:
//   1. Durable multi-process file persistence (`process.env.WF_CLIPP_EVIDENCE_STORE_PATH`)
//      and serverless cache persistence (`wf_places_cache` key `clipp_offer_evidence_v1`,
//      guarded by `lib/productionWriteFirewall.js`).
//   2. Schema-validated hydration into `lib/clippOffers.js` and `lib/partnerOfferHolds.js`
//      on cold start across fresh processes/requests.
//   3. Durable Clipp-specific execution receipts (`verify-offers:clipp`).
//   4. The permitted Clipp evidence producer (`produceClippOfferEvidence`), reading
//      real Chrome audit snapshots (`CLIPP_EVIDENCE_SNAPSHOT_PATH`), permitted partner
//      feeds (`CLIPP_EVIDENCE_FEED_URL`), or polite non-evasive HTTP probes without
//      ever spoofing headers or bypassing Cloudflare/Akamai WAF.

import fs from "node:fs";
import path from "node:path";
import { cget, cset, cdel } from "./serverCache.js";
import {
  EVIDENCE_STRENGTH,
  evaluateClippOfferFreshness,
} from "./commerceHealth.js";
import {
  CLIPP_MARKETS,
  CLIPP_MERCHANT_OFFERS,
  QUARANTINED_CLIPP_OFFERS,
  CLIPP_AUDIT_AS_OF,
  CLIPP_LAST_MANUAL_AUDIT_AT,
  CLIPP_AUDIT_EXPIRY,
  CLIPP_VERIFICATION_MODE,
  registerClippPersistenceAdapter,
  exportClippRuntimeSnapshot,
  applyClippRuntimeSnapshot,
  ingestClippOfferEvidence,
  clippOfferById,
  quarantinedClippOfferById,
} from "./clippOffers.js";

export const CLIPP_CACHE_KEY = "clipp_offer_evidence_v1";
const CLIPP_CACHE_TTL_MS = 30 * 86400 * 1000;
const MAX_RECEIPTS = 50;

const _ALL_KNOWN_CLIPP_OFFERS = [
  ...CLIPP_MARKETS,
  ...CLIPP_MERCHANT_OFFERS,
  ...QUARANTINED_CLIPP_OFFERS,
];
const _KNOWN_BY_ID = new Map(_ALL_KNOWN_CLIPP_OFFERS.map((o) => [o.offerId, o]));

let _lastHydratedFilePath = null;
let _lastHydratedMtimeMs = 0;
let _lastAsyncHydratedAt = 0;
let _durableReceipts = [];
let _inHydrate = false;

function resolveStoreFilePath(overridePath) {
  const raw =
    overridePath !== undefined
      ? overridePath
      : process.env.WF_CLIPP_EVIDENCE_STORE_PATH;
  const trimmed = String(raw || "").trim();
  return trimmed ? path.resolve(trimmed) : null;
}

/**
 * Synchronously hydrate runtime Clipp evidence overlays and execution receipts
 * from `WF_CLIPP_EVIDENCE_STORE_PATH` when configured. Automatically invoked by
 * `clippOfferById`, `quarantinedClippOfferById`, and `listActiveClippOffers` via
 * the registered persistence adapter so fresh processes observe durable state.
 */
export function ensureDurableClippEvidenceHydratedSync({
  force = false,
  storePath,
} = {}) {
  if (_inHydrate) return { hydrated: false, reentrant: true };
  const fp = resolveStoreFilePath(storePath);
  if (!fp) return { hydrated: false, source: "none" };

  _inHydrate = true;
  try {
    if (!fs.existsSync(fp)) {
      if (_lastHydratedFilePath === fp && _lastHydratedMtimeMs > 0) {
        applyClippRuntimeSnapshot({ overlays: {} }, { replace: true });
        _durableReceipts = [];
        _lastHydratedMtimeMs = 0;
        return { hydrated: true, source: "file_cleared", applied: 0, rejected: 0 };
      }
      return { hydrated: false, source: "missing_file" };
    }

    const stat = fs.statSync(fp);
    if (
      !force &&
      _lastHydratedFilePath === fp &&
      stat.mtimeMs === _lastHydratedMtimeMs
    ) {
      return {
        hydrated: true,
        cached: true,
        source: "file",
        receipts: _durableReceipts.length,
      };
    }

    const rawText = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(rawText);
    const snapRes = applyClippRuntimeSnapshot(parsed, { replace: true });
    _durableReceipts = Array.isArray(parsed?.receipts)
      ? parsed.receipts.slice(-MAX_RECEIPTS)
      : [];
    _lastHydratedFilePath = fp;
    _lastHydratedMtimeMs = stat.mtimeMs;

    return {
      hydrated: true,
      source: "file",
      applied: snapRes.applied,
      rejected: snapRes.rejected,
      receipts: _durableReceipts.length,
    };
  } catch (e) {
    return {
      hydrated: false,
      source: "file_error",
      error: String((e && e.message) || e).slice(0, 200),
    };
  } finally {
    _inHydrate = false;
  }
}

/**
 * Synchronously persist current runtime Clipp evidence overlays and execution
 * receipts to `WF_CLIPP_EVIDENCE_STORE_PATH` when configured.
 */
export function persistDurableClippEvidenceSync(
  snapshot = null,
  { receipt = null, storePath } = {}
) {
  if (receipt && typeof receipt === "object") {
    _durableReceipts = [..._durableReceipts.slice(-(MAX_RECEIPTS - 1)), receipt];
  }
  const snap = snapshot || exportClippRuntimeSnapshot();
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...snap,
    receipts: [..._durableReceipts],
  };

  const fp = resolveStoreFilePath(storePath);
  if (!fp) {
    return { persisted: false, source: "memory_only", payload };
  }

  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, fp);
    try {
      const st = fs.statSync(fp);
      _lastHydratedFilePath = fp;
      _lastHydratedMtimeMs = st.mtimeMs;
    } catch {}
    return { persisted: true, source: "file", path: fp, payload };
  } catch (e) {
    return {
      persisted: false,
      source: "file_error",
      error: String((e && e.message) || e).slice(0, 200),
      payload,
    };
  }
}

export function clearDurableClippEvidenceSync({ storePath } = {}) {
  _durableReceipts = [];
  _lastHydratedMtimeMs = 0;
  const fp = resolveStoreFilePath(storePath);
  if (fp && fs.existsSync(fp)) {
    try {
      fs.unlinkSync(fp);
    } catch {}
  }
  return { cleared: true };
}

/**
 * Asynchronously hydrate durable Clipp evidence from either `WF_CLIPP_EVIDENCE_STORE_PATH`
 * or the shared serverless cache (`wf_places_cache` key `clipp_offer_evidence_v1`).
 */
export async function ensureDurableClippEvidenceHydrated({
  force = false,
  storePath,
} = {}) {
  const fp = resolveStoreFilePath(storePath);
  if (fp) {
    return ensureDurableClippEvidenceHydratedSync({ force, storePath: fp });
  }
  if (!force && Date.now() - _lastAsyncHydratedAt < 30000) {
    return { hydrated: true, cached: true, source: "server_cache" };
  }
  _lastAsyncHydratedAt = Date.now();
  try {
    const hit = await cget(CLIPP_CACHE_KEY, { staleMs: CLIPP_CACHE_TTL_MS });
    if (hit && hit.v && typeof hit.v === "object") {
      const snapRes = applyClippRuntimeSnapshot(hit.v, { replace: true });
      if (Array.isArray(hit.v.receipts)) {
        _durableReceipts = hit.v.receipts.slice(-MAX_RECEIPTS);
      }
      return {
        hydrated: true,
        source: "server_cache",
        applied: snapRes.applied,
        rejected: snapRes.rejected,
        receipts: _durableReceipts.length,
      };
    }
  } catch {}
  return { hydrated: false, source: "none" };
}

/**
 * Asynchronously persist durable Clipp evidence to `WF_CLIPP_EVIDENCE_STORE_PATH`
 * (if set) AND `wf_places_cache` (`cset` guarded by `evaluateProductionWrite`).
 */
export async function persistDurableClippEvidence({
  receipt = null,
  storePath,
} = {}) {
  const syncRes = persistDurableClippEvidenceSync(exportClippRuntimeSnapshot(), {
    receipt,
    storePath,
  });
  try {
    await cset(CLIPP_CACHE_KEY, syncRes.payload, CLIPP_CACHE_TTL_MS);
    _lastAsyncHydratedAt = Date.now();
  } catch {}
  return {
    persisted: true,
    filePersisted: syncRes.persisted,
    payload: syncRes.payload,
  };
}

export async function clearDurableClippEvidence({ storePath } = {}) {
  clearDurableClippEvidenceSync({ storePath });
  try {
    await cdel(CLIPP_CACHE_KEY);
  } catch {}
  return { cleared: true };
}

export function recordClippExecutionReceipt(receipt = {}, { storePath } = {}) {
  ensureDurableClippEvidenceHydratedSync({ storePath });
  const entry = {
    job: "verify-offers:clipp",
    recordedAt: new Date().toISOString(),
    ...receipt,
  };
  persistDurableClippEvidenceSync(exportClippRuntimeSnapshot(), {
    receipt: entry,
    storePath,
  });
  return entry;
}

export function getClippExecutionReceipts({ storePath } = {}) {
  ensureDurableClippEvidenceHydratedSync({ storePath });
  return [..._durableReceipts];
}

function normalizeObservedItem(raw, defaultVerificationMode = "automated_snapshot", defaultSource = "permitted_snapshot") {
  if (!raw || typeof raw !== "object") return null;
  const offerId = String(raw.offerId || "").trim();
  if (!offerId || !_KNOWN_BY_ID.has(offerId)) return null;
  const base = _KNOWN_BY_ID.get(offerId);

  if (typeof raw.html === "string" || (raw.status && raw.evidence && raw.httpStatus === undefined)) {
    return {
      ...raw,
      offerId,
      verificationMode: raw.verificationMode || defaultVerificationMode,
      source: raw.source || defaultSource,
    };
  }

  const httpStatus = Number.isFinite(Number(raw.httpStatus)) ? Number(raw.httpStatus) : 200;
  const finalUrl = raw.finalUrl || raw.dest || base.dest;
  let html = "";
  if (httpStatus === 200) {
    const titleText = raw.title || `${base.merchant || base.city || offerId} ${base.area || base.city || "Florida"}, FL`;
    if (raw.hasSoldOut === true || raw.classification?.status === "SOLD_OUT") {
      html = `<html><head><title>${titleText}</title></head><body>THIS DEAL IS SOLD OUT</body></html>`;
    } else if (raw.hasAlmostGone === true && raw.kind !== "market" && base.merchant) {
      html = `<html><head><title>${titleText}</title></head><body>Almost Gone Add to Cart Buy Now</body></html>`;
    } else {
      html = `<html><head><title>${titleText}</title></head><body>Add to Cart Buy Now</body></html>`;
    }
  }

  return {
    offerId,
    httpStatus,
    finalUrl,
    html,
    observedAt: raw.observedAt || null,
    verificationMode: raw.verificationMode || defaultVerificationMode,
    source: raw.source || defaultSource,
  };
}

/**
 * Permitted Clipp Evidence Producer (C3 P1).
 *
 * Never spoofs browser fingerprints, never uses headless evasion, and never attempts
 * to bypass Cloudflare/Akamai WAF. Produces evidence from:
 *   1. An explicit or env-configured Chrome/operator observation snapshot file
 *      (`snapshotPath || process.env.CLIPP_EVIDENCE_SNAPSHOT_PATH`).
 *   2. An explicit or env-configured permitted JSON feed URL
 *      (`feedUrl || process.env.CLIPP_EVIDENCE_FEED_URL`).
 *   3. Optional polite standard HTTP GET probes (`liveProbe === true`) with honest
 *      `User-Agent: WayfindVerify/1.0`, classifying any HTTP 403 as `INCONCLUSIVE`.
 */
export async function produceClippOfferEvidence({
  offerIds,
  snapshotPath,
  feedUrl,
  fetchImpl,
  liveProbe = false,
  now = new Date(),
} = {}) {
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const targetFilter =
    Array.isArray(offerIds) && offerIds.length > 0 ? new Set(offerIds.map(String)) : null;

  // 1. Permitted snapshot file (from operator Chrome producer or scheduled local Chrome run)
  const resolvedSnapPath = String(
    snapshotPath || process.env.CLIPP_EVIDENCE_SNAPSHOT_PATH || ""
  ).trim();
  if (resolvedSnapPath && fs.existsSync(resolvedSnapPath)) {
    const parsed = JSON.parse(fs.readFileSync(resolvedSnapPath, "utf8"));
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.clippEvidence)
      ? parsed.clippEvidence
      : Array.isArray(parsed?.offers)
      ? parsed.offers
      : [];
    const vMode =
      parsed?.verificationMode ||
      (parsed?.source === "manual_mac_chrome_observation" ? "manual" : "automated_snapshot");
    const items = list
      .map((item) => normalizeObservedItem(item, vMode, parsed?.source || "permitted_snapshot"))
      .filter((item) => item && (!targetFilter || targetFilter.has(item.offerId)));
    return {
      ok: true,
      mode: "permitted_snapshot",
      verificationMode: vMode,
      observedAt: parsed?.observedAt || nowIso,
      items,
    };
  }

  // 2. Permitted remote partner/worker JSON feed
  const resolvedFeedUrl = String(
    feedUrl || process.env.CLIPP_EVIDENCE_FEED_URL || ""
  ).trim();
  if (resolvedFeedUrl) {
    const doFetch = fetchImpl || globalThis.fetch;
    try {
      const res = await doFetch(resolvedFeedUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "WayfindVerify/1.0",
        },
      });
      if (!res.ok) {
        return {
          ok: false,
          mode: "permitted_feed_error",
          verificationMode: "automated_feed",
          httpStatus: res.status,
          items: [],
        };
      }
      const parsed = await res.json();
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.results)
        ? parsed.results
        : Array.isArray(parsed?.clippEvidence)
        ? parsed.clippEvidence
        : [];
      const vMode = parsed?.verificationMode || "automated_feed";
      const items = list
        .map((item) => normalizeObservedItem(item, vMode, "permitted_feed"))
        .filter((item) => item && (!targetFilter || targetFilter.has(item.offerId)));
      return {
        ok: true,
        mode: "permitted_feed",
        verificationMode: vMode,
        observedAt: parsed?.observedAt || nowIso,
        items,
      };
    } catch (e) {
      return {
        ok: false,
        mode: "permitted_feed_error",
        verificationMode: "automated_feed",
        error: String((e && e.message) || e).slice(0, 200),
        items: [],
      };
    }
  }

  // 3. Polite non-evasive HTTP GET probe (403 -> INCONCLUSIVE, never mutates holds or timestamps)
  if (liveProbe === true || typeof fetchImpl === "function") {
    const doFetch = fetchImpl || globalThis.fetch;
    const targets = _ALL_KNOWN_CLIPP_OFFERS.filter(
      (o) => !targetFilter || targetFilter.has(o.offerId)
    );
    const items = [];
    for (const offer of targets) {
      try {
        const res = await doFetch(offer.dest, {
          method: "GET",
          redirect: "follow",
          cache: "no-store",
          headers: {
            "User-Agent": "WayfindVerify/1.0",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        const html = res.status === 200 ? await res.text() : "";
        items.push({
          offerId: offer.offerId,
          httpStatus: res.status,
          finalUrl: res.url || offer.dest,
          html,
          observedAt: nowIso,
          verificationMode: "automated_http_probe",
          source: "polite_http_probe",
        });
      } catch {
        items.push({
          offerId: offer.offerId,
          httpStatus: 0,
          finalUrl: offer.dest,
          html: "",
          observedAt: nowIso,
          verificationMode: "automated_http_probe",
          source: "polite_http_probe",
        });
      }
    }
    return {
      ok: true,
      mode: "polite_http_probe",
      verificationMode: "automated_http_probe",
      observedAt: nowIso,
      items,
    };
  }

  // 4. Default scheduled serverless sweep when no external snapshot/feed is configured:
  // audits durable state and baseline freshness without fabricating network fetches.
  return {
    ok: true,
    mode: "baseline_freshness_audit",
    verificationMode: CLIPP_VERIFICATION_MODE,
    observedAt: nowIso,
    items: [],
  };
}

/**
 * Execute a full Clipp verification sweep: hydrate durable state, produce or ingest
 * evidence batch, compute baseline + runtime health summary, persist updated overlays,
 * and record a durable `verify-offers:clipp` execution receipt.
 */
export async function runClippDurableSweep({
  evidenceBatch,
  snapshotPath,
  feedUrl,
  fetchImpl,
  liveProbe = false,
  verificationMode,
  storePath,
  now = new Date(),
} = {}) {
  await ensureDurableClippEvidenceHydrated({ storePath });
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = nowDate.toISOString();

  let producer;
  if (Array.isArray(evidenceBatch) && evidenceBatch.length > 0) {
    const vMode = verificationMode || "automated_batch";
    producer = {
      ok: true,
      mode: "supplied_evidence_batch",
      verificationMode: vMode,
      observedAt: nowIso,
      items: evidenceBatch
        .map((item) => normalizeObservedItem(item, vMode, "supplied_evidence_batch") || item)
        .filter(Boolean),
    };
  } else {
    producer = await produceClippOfferEvidence({
      snapshotPath,
      feedUrl,
      fetchImpl,
      liveProbe,
      now: nowDate,
    });
  }

  const effectiveMode =
    verificationMode || producer.verificationMode || CLIPP_VERIFICATION_MODE;

  const summary = {
    checked: 0,
    active: 0,
    quarantined: 0,
    recovered: 0,
    inconclusive: 0,
    skipped: 0,
    results: [],
  };

  for (const item of producer.items || []) {
    if (!item || typeof item !== "object") {
      summary.skipped++;
      continue;
    }
    const { offerId, ...probeInput } = item;
    const res = ingestClippOfferEvidence(
      offerId,
      { ...probeInput, verificationMode: effectiveMode },
      { now: nowDate, persist: false }
    );
    if (!res.ok) {
      summary.skipped++;
      summary.results.push({ offerId: offerId || null, ok: false, reason: res.reason });
      continue;
    }
    summary.checked++;
    if (res.classification.evidence === EVIDENCE_STRENGTH.INCONCLUSIVE) {
      summary.inconclusive++;
    } else if (res.transition.quarantined) {
      summary.quarantined++;
    } else if (res.transition.serveable) {
      summary.active++;
      if (res.transition.transition === "restored_from_quarantine") {
        summary.recovered++;
      }
    }
    summary.results.push({
      offerId: res.offerId,
      ok: true,
      status: res.transition.nextStatus,
      serveable: res.transition.serveable,
      quarantined: res.transition.quarantined,
      transition: res.transition.transition,
      evidence: res.classification.evidence,
      reason: res.transition.reason,
      verificationMode: effectiveMode,
    });
  }

  // Evaluate overall catalogue health at `nowDate`
  let catalogueActive = 0;
  let catalogueQuarantined = 0;
  let catalogueExpired = 0;
  for (const known of _ALL_KNOWN_CLIPP_OFFERS) {
    const q = quarantinedClippOfferById(known.offerId);
    if (q) {
      catalogueQuarantined++;
      continue;
    }
    const live = clippOfferById(known.offerId, { now: nowDate });
    if (live) {
      catalogueActive++;
    } else {
      const f = evaluateClippOfferFreshness(known, {
        now: nowDate,
        auditExpiry: CLIPP_AUDIT_EXPIRY,
        auditBaseline: known.verifiedAt || CLIPP_AUDIT_AS_OF,
      });
      if (f.hardExpired) catalogueExpired++;
      else catalogueQuarantined++;
    }
  }

  const hasBatch = summary.checked > 0;
  const attempted = hasBatch ? summary.checked : _ALL_KNOWN_CLIPP_OFFERS.length;
  const succeeded = hasBatch
    ? summary.active + summary.quarantined
    : catalogueExpired > 0
    ? 0
    : catalogueActive + catalogueQuarantined;
  const failed = hasBatch ? summary.inconclusive : catalogueExpired;
  const note = hasBatch
    ? `clipp:${producer.mode} mode=${effectiveMode} active=${summary.active} quarantined=${summary.quarantined} recovered=${summary.recovered} inconclusive=${summary.inconclusive}`
    : `clipp:${producer.mode} mode=${effectiveMode} active=${catalogueActive} quarantined=${catalogueQuarantined} expired=${catalogueExpired} expiry=${CLIPP_AUDIT_EXPIRY}`;

  const receipt = {
    job: "verify-offers:clipp",
    recordedAt: nowIso,
    mode: producer.mode,
    verificationMode: effectiveMode,
    attempted,
    succeeded,
    failed,
    checked: summary.checked,
    active: hasBatch ? summary.active : catalogueActive,
    quarantined: hasBatch ? summary.quarantined : catalogueQuarantined,
    recovered: summary.recovered,
    inconclusive: summary.inconclusive,
    catalogueActive,
    catalogueQuarantined,
    catalogueExpired,
    auditExpiry: CLIPP_AUDIT_EXPIRY,
    lastManualAuditAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    note,
  };

  await persistDurableClippEvidence({ receipt, storePath });

  return {
    ok: true,
    job: "verify-offers:clipp",
    mode: producer.mode,
    verificationMode: effectiveMode,
    attempted,
    succeeded,
    failed,
    note,
    ...summary,
    catalogue: {
      total: _ALL_KNOWN_CLIPP_OFFERS.length,
      active: catalogueActive,
      quarantined: catalogueQuarantined,
      expired: catalogueExpired,
      auditExpiry: CLIPP_AUDIT_EXPIRY,
      lastManualAuditAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    },
    receipt,
  };
}

// Register adapter with lib/clippOffers.js and perform initial sync hydration on server import.
registerClippPersistenceAdapter({
  hydrateSync: ensureDurableClippEvidenceHydratedSync,
  persistSync: persistDurableClippEvidenceSync,
  clearSync: clearDurableClippEvidenceSync,
});
ensureDurableClippEvidenceHydratedSync();
