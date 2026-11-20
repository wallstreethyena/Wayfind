// Booking-CTA integrity, Phase 4 (BOOKING_INTEGRITY_DIAGNOSIS.md) —
// self-healing re-verification. A VerifiedOffer's "live" status is a claim
// about the world (this product is still commissionable and bookable) that
// can silently go stale: Viator can delist or sell out a product without
// Wayfind hearing about it, and a place with no recent visitors would never
// naturally re-trigger /api/viator/tours or /go to catch that. This sweep
// re-checks every LIVE offer past its expiry (lib/verifiedOffers.js
// REVERIFY_TTL_MS) and, if it no longer clears the hard invariant,
// suppresses it proactively — instead of waiting for a fixed-cadence owner
// notice, the record heals itself on the next run.
//
// THE SILENT-SUCCESS GAP (closed 2026-09-09). public.verified_offers was
// never applied to production (supabase/migrations/*_wf_verified_offers.sql
// fixes that) while this route's only persistence dependency,
// lib/verifiedOfferStore.js, degrades every failure to []/false/no-op by
// design — correct for its user-facing callers, wrong here: a missing table
// and "nothing was stale" were indistinguishable, both reading as
// { ok: true, checked: 0 }. This route now tells those apart explicitly, on
// every terminal path, same jobCannotRun/jobFailed contract as
// app/api/cron/revenue-heartbeat (lib/jobFail.js):
//   dependency missing  -- no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY at all
//                           -> jobCannotRun, 503, does not attempt work
//   query failed         -- credentials present but the read itself failed
//                           (e.g. the table still is not there) -> jobFailed, 500
//   genuinely zero work  -- the query ran; there was nothing past expiry
//                           -> normal 200 completion, pulsed attempted:0
// A wf_job_pulse row is recorded on EVERY one of those paths (lib/jobPulse.js
// recordPulse), so app/api/cron/job-watch can see this job the same way it
// already sees revenue-heartbeat.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { resolveVerified } from "../../../../lib/bookingResolver.js";
import { getFanoutCount, getStaleLiveOffersStatus, persistOffer, suppressOffer } from "../../../../lib/verifiedOfferStore.js";
import { credential } from "../../../../lib/envPlaceholder.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { evaluateOfferHealthTransition, EVIDENCE_STRENGTH, OFFER_HEALTH_STATUS } from "../../../../lib/commerceHealth.js";
import { ingestClippOfferEvidence } from "../../../../lib/clippOffers.js";
import { runClippDurableSweep, recordClippExecutionReceipt } from "../../../../lib/clippDurableStore.js";

const JOB = "verify-offers";
const CLIPP_JOB = "verify-offers:clipp";

// OPERATIONAL BOUNDARY (C3):
// Direct datacenter / serverless fetches to https://www.clipp.com/* are blocked by
// Akamai WAF with HTTP 403 (`EVIDENCE_STRENGTH.INCONCLUSIVE`). Therefore, this cron
// NEVER fabricates unauthenticated serverless fetches against clipp.com and NEVER treats
// an HTTP 403 as either `SOLD_OUT` or `ACTIVE`. Instead, Clipp live page evidence is
// harvested by an authenticated browser-session worker or partner feed and ingested via
// `verifyClippEvidenceBatch`, `runClippDurableSweep`, or `POST /api/cron/verify-offers`.
export function verifyClippEvidenceBatch(
  evidenceBatch = [],
  { now = new Date(), verificationMode = "automated_batch", persist = true } = {}
) {
  const items = Array.isArray(evidenceBatch) ? evidenceBatch : [];
  const summary = {
    checked: 0,
    active: 0,
    quarantined: 0,
    recovered: 0,
    inconclusive: 0,
    skipped: 0,
    verificationMode,
    results: [],
  };

  for (const item of items) {
    if (!item || typeof item !== "object") {
      summary.skipped++;
      continue;
    }
    const { offerId, ...probeInput } = item;
    const res = ingestClippOfferEvidence(
      offerId,
      { ...probeInput, verificationMode: probeInput.verificationMode || verificationMode },
      { now, persist }
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
      verificationMode: probeInput.verificationMode || verificationMode,
    });
  }

  if (persist && typeof recordClippExecutionReceipt === "function") {
    const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
    summary.receipt = recordClippExecutionReceipt({
      recordedAt: nowIso,
      mode: "verify_clipp_evidence_batch",
      verificationMode,
      attempted: summary.checked,
      succeeded: summary.active + summary.quarantined,
      failed: summary.inconclusive,
      checked: summary.checked,
      active: summary.active,
      quarantined: summary.quarantined,
      recovered: summary.recovered,
      inconclusive: summary.inconclusive,
      note: `clipp:batch mode=${verificationMode} active=${summary.active} quarantined=${summary.quarantined} recovered=${summary.recovered} inconclusive=${summary.inconclusive}`,
    });
  }

  return summary;
}

const getKey = () => credential(process.env["VIATOR_API_KEY"]);

async function searchFreetext(term) {
  const KEY = getKey();
  if (!KEY || !term) return { ok: false, results: [] };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch("https://api.viator.com/partner/search/freetext", {
      method: "POST",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "exp-api-key": KEY, "Accept": "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" },
      body: JSON.stringify({ searchTerm: term, currency: "USD", searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 5 } }] }),
    });
    if (!res.ok) return { ok: false, results: [], status: res.status };
    const data = await res.json();
    const results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    return { ok: true, results };
  } catch (e) {
    return { ok: false, results: [], error: String((e && e.message) || e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req) {
  // v5.43-style fail-closed guard (app/api/cron/route.js): an unset secret
  // must never leave this route publicly triggerable.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  let clipp = null;
  if (typeof runClippDurableSweep === "function") {
    let liveProbe = false;
    try {
      liveProbe = new URL(req.url).searchParams.get("liveProbe") === "1";
    } catch {}
    clipp = await runClippDurableSweep({ now: new Date(), liveProbe });
    if (clipp) {
      await recordPulse(CLIPP_JOB, {
        attempted: clipp.attempted,
        succeeded: clipp.succeeded,
        failed: clipp.failed,
        note: clipp.note,
      });
    }
  }

  const status = await getStaleLiveOffersStatus(30);
  if (status.dependencyMissing) return jobCannotRun(JOB, status.error);
  if (!status.ok) return jobFailed(JOB, status.error);

  const stale = status.rows;
  const results = { checked: 0, stillLive: 0, suppressed: 0, upstreamError: 0, writeError: 0, skippedNoName: 0 };

  if (stale.length === 0) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "idle: no live offers past expiry" });
    return Response.json({ ok: true, job: JOB, ...results, ...(clipp ? { clipp } : {}) });
  }

  for (const row of stale) {
    results.checked++;
    if (!row.place_name) { results.skippedNoName++; continue; } // pre-Phase-4 rows without stored context; ages out on its own via TTL going forward
    const term = row.region && !String(row.place_name).toLowerCase().includes(String(row.region).split(",")[0].toLowerCase())
      ? `${row.place_name} ${String(row.region).split(",")[0]}`
      : row.place_name;
    const search = await searchFreetext(term);
    if (!search.ok) {
      results.upstreamError++;
      const transition = evaluateOfferHealthTransition({
        currentStatus: OFFER_HEALTH_STATUS.ACTIVE,
        currentFailureCount: Number(row.failure_count || 0),
        probeResult: { status: OFFER_HEALTH_STATUS.UNVERIFIED, evidence: EVIDENCE_STRENGTH.WEAK, reason: "upstream_error" },
      });
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "verify-offers", placeId: row.place_id, productCode: row.product_code, decision: "upstream_error", healthStatus: transition.nextStatus, failureCount: transition.failureCount })); } catch (e) {}
      continue; // don't suppress on a transient upstream failure -- only an explicit re-score decides that
    }
    const candidate = search.results.find((r) => r && (r.productCode === row.product_code || r.productUrl === row.product_url));
    const fanoutByCode = {};
    if (candidate) {
      const key = candidate.productCode || candidate.productUrl;
      fanoutByCode[key] = await getFanoutCount("viator", candidate.productCode || candidate.productUrl);
    }
    const offer = candidate
      ? resolveVerified({ id: row.place_id, name: row.place_name }, [candidate], { region: row.region, kind: row.kind, fanoutByCode, placeId: row.place_id })
      : null;
    if (offer) {
      const transition = evaluateOfferHealthTransition({
        currentStatus: OFFER_HEALTH_STATUS.ACTIVE,
        currentFailureCount: Number(row.failure_count || 0),
        probeResult: { status: OFFER_HEALTH_STATUS.ACTIVE, evidence: EVIDENCE_STRENGTH.STRONG, reason: "reverified_live" },
      });
      if (!(await persistOffer(offer))) { results.writeError++; continue; }
      results.stillLive++;
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "verify-offers", placeId: row.place_id, productCode: row.product_code, confidence: offer.confidence, decision: "reverified_live", healthStatus: transition.nextStatus })); } catch (e) {}
    } else {
      const transition = evaluateOfferHealthTransition({
        currentStatus: OFFER_HEALTH_STATUS.ACTIVE,
        currentFailureCount: Number(row.failure_count || 0),
        probeResult: {
          status: candidate ? OFFER_HEALTH_STATUS.WRONG_PRODUCT : OFFER_HEALTH_STATUS.EXPIRED,
          evidence: EVIDENCE_STRENGTH.STRONG,
          reason: candidate ? "reverify_failed_threshold" : "product_no_longer_found",
        },
      });
      if (!(await suppressOffer(row.place_id, row.product_provider, row.product_code))) { results.writeError++; continue; }
      results.suppressed++;
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "verify-offers", placeId: row.place_id, productCode: row.product_code, decision: candidate ? "reverify_failed_threshold" : "product_no_longer_found", healthStatus: transition.nextStatus })); } catch (e) {}
    }
  }

  // succeeded = rows re-verification reached a definitive conclusion for
  // (still live, or correctly suppressed); failed = rows an upstream error
  // stopped from reaching one -- distinct from skippedNoName, legacy rows
  // this sweep cannot rebuild a search term for, which is data age, not a
  // failure this run had.
  await recordPulse(JOB, {
    attempted: results.checked,
    succeeded: results.stillLive + results.suppressed,
    failed: results.upstreamError + results.writeError,
    note: results.writeError ? `${results.writeError} write(s) not confirmed; ${results.upstreamError} upstream error(s)` : results.upstreamError ? `${results.upstreamError} upstream error(s) during re-verification` : null,
  });

  return Response.json(
    { ok: results.writeError === 0, job: JOB, ...results, ...(clipp ? { clipp } : {}) },
    { status: results.writeError ? 500 : 200 }
  );
}

export async function POST(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const now = body?.now ? new Date(body.now) : new Date();
  const summary =
    typeof runClippDurableSweep === "function"
      ? await runClippDurableSweep({
          evidenceBatch: body?.clippEvidence,
          snapshotPath: body?.snapshotPath,
          feedUrl: body?.feedUrl,
          liveProbe: body?.liveProbe === true,
          verificationMode: body?.verificationMode,
          source: body?.source,
          observedAt: body?.observedAt,
          isFixture: body?.isFixture === true,
          storePath: body?.storePath,
          now,
        })
      : verifyClippEvidenceBatch(body?.clippEvidence || [], {
          now,
          verificationMode: body?.verificationMode || "automated_batch",
        });

  await recordPulse(CLIPP_JOB, {
    attempted: summary.attempted ?? summary.checked,
    succeeded: summary.succeeded ?? summary.active + summary.quarantined,
    failed: summary.failed ?? summary.inconclusive,
    note: summary.note || "clipp_evidence_batch",
  });

  return Response.json({
    ok: true,
    job: CLIPP_JOB,
    mode: summary.mode || "clipp_evidence_batch",
    ...summary,
  });
}


