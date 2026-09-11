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

const JOB = "verify-offers";

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

  const status = await getStaleLiveOffersStatus(30);
  if (status.dependencyMissing) return jobCannotRun(JOB, status.error);
  if (!status.ok) return jobFailed(JOB, status.error);

  const stale = status.rows;
  const results = { checked: 0, stillLive: 0, suppressed: 0, upstreamError: 0, skippedNoName: 0 };

  if (stale.length === 0) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "idle: no live offers past expiry" });
    return Response.json({ ok: true, job: JOB, ...results });
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
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "verify-offers", placeId: row.place_id, productCode: row.product_code, decision: "upstream_error" })); } catch (e) {}
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
      await persistOffer(offer);
      results.stillLive++;
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "verify-offers", placeId: row.place_id, productCode: row.product_code, confidence: offer.confidence, decision: "reverified_live" })); } catch (e) {}
    } else {
      await suppressOffer(row.place_id, row.product_provider, row.product_code);
      results.suppressed++;
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "verify-offers", placeId: row.place_id, productCode: row.product_code, decision: candidate ? "reverify_failed_threshold" : "product_no_longer_found" })); } catch (e) {}
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
    failed: results.upstreamError,
    note: results.upstreamError ? `${results.upstreamError} upstream error(s) during re-verification` : null,
  });

  return Response.json({ ok: true, job: JOB, ...results });
}
