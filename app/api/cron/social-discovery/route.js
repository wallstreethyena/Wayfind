export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { reserveFreeProviderCall } from "../../../../lib/providerMeter.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import {
  SOCIAL_SEARCH_PROVIDER, boundedQueryCount, normalizeIndexedBatch, plannedSocialQueries, qualifiedCandidateRows,
  readAcquisitionInventory, resolveDiscoveryLocations, searchIndexedShorts,
  runInstagramProfileSourceProof, socialSearchKey, sourceEvidenceRows, verifySerpFreeInventory,
} from "../../../../lib/socialAcquisition.js";

const headers = { "cache-control": "no-store" };

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode !== null && mode !== "source-proof") {
    return Response.json({ error: "unsupported_mode" }, { status: 400, headers });
  }
  const db = admin();
  if (!db) return Response.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers });
  const key = socialSearchKey();
  if (mode === "source-proof") {
    const proof = await runInstagramProfileSourceProof(db, key);
    return Response.json({ ...proof, mode: "source_proof", publication_enabled: false,
      acquisition_writes: 0, paid_calls: 0,
      spend_status: proof.free_plan_verified ? "free_plan_verified" : "not_attempted_or_unverified",
      estimated_spend_usd: proof.free_plan_verified ? 0 : null }, { status: proof.ok ? 200 : 503, headers });
  }
  const requested = boundedQueryCount(new URL(req.url).searchParams.get("queries") || 2);
  const free = await verifySerpFreeInventory(key, requested);
  if (!free.ok) {
    // PARKED, NOT AN INCIDENT (2026-09-09). "unconfigured" (no SERPAPI_KEY) and
    // "not_zero_cost_plan" (the account exists but SerpAPI is no longer free)
    // are both permanent, owner-decided states, not transient errors — the
    // same class lib/popularity.js already parks Yelp/Foursquare for, and that
    // instagram-scout ships dark for. Recording attempted=1/failed=1 here paged
    // job-watch once a day forever for a query that was never going to run
    // without the owner choosing to pay (see OWNER'S FREE-FIRST RULE in
    // lib/popularity.js). attempted=0/succeeded=0/failed=0, with no billing:/
    // quota: prefix, reads as IDLE under lib/jobPulse.classifyHealth. A
    // genuinely transient check failure (bad account response, or a network/
    // timeout error) still records as a real failure below, and
    // insufficient_free_inventory — the plan is free, the quota just ran out —
    // stays a real, actionable failure too.
    const parked = free.reason === "unconfigured" || free.reason === "not_zero_cost_plan";
    await recordPulse("social-discovery", parked
      ? { attempted: 0, succeeded: 0, failed: 0, note: `parked_${free.reason}` }
      : { attempted: 1, succeeded: 0, failed: 1, note: `configuration: ${free.reason}` });
    return Response.json({ ok: parked, idle: parked, configured: free.reason !== "unconfigured", reason: free.reason,
      free_calls: 0, paid_calls: 0, publication_enabled: false }, { status: parked ? 200 : 503, headers });
  }

  const day = siteTodayStr(new Date());
  const plans = plannedSocialQueries(day, requested);
  const discoveries = [], errors = [];
  let freeCalls = 0, rawResults = 0;
  for (const plan of plans) {
    const meter = await reserveFreeProviderCall(db, "indexed_short_video_search", { provider: SOCIAL_SEARCH_PROVIDER, now: Date.now() });
    if (!meter.allowed) { errors.push({ query_key: plan.key, reason: `provider_meter_${meter.reason}` }); break; }
    const result = await searchIndexedShorts(key, plan.query);
    freeCalls++;
    if (!result.ok) { errors.push({ query_key: plan.key, reason: result.reason }); continue; }
    rawResults += result.results.length;
    discoveries.push(...normalizeIndexedBatch(result.results, plan));
  }

  const unique = [...new Map(discoveries.map((row) => [row.discovery_id, row])).values()];
  let resolved = unique;
  try {
    const inventory = await readAcquisitionInventory(db, plans.map((plan) => plan.region), { signal: AbortSignal.timeout(20000) });
    resolved = resolveDiscoveryLocations(unique, inventory, { now: Date.now() });
  } catch {
    errors.push({ query_key: "location", reason: "candidate_location_resolution_failed" });
  }
  let written = 0, candidateRows = [];
  if (resolved.length) {
    const observedAt = Date.now();
    const now = new Date(observedAt).toISOString();
    const { data: creators, error: creatorError } = await db.from("wf_social_creators")
      .select("platform,handle,status,evidence_url,reviewed_at,expires_at,canonical_place_id");
    if (creatorError) errors.push({ query_key: "qualification", reason: "creator_registry_read_failed" });
    else {
      candidateRows = qualifiedCandidateRows(resolved, creators || [], { now: observedAt });
      const qualifiedIds = new Set(candidateRows.map((row) => row.media_id));
      resolved = resolved.map((row) => qualifiedIds.has(row.media_id)
        ? { ...row, qualification_status: "qualified", qualification_reason: candidateRows.find((candidate) => candidate.media_id === row.media_id)?.qualification_reason || row.qualification_reason }
        : row);
    }
    const rows = resolved.map(({ identity_confidence, ...row }) => ({ ...row, last_seen_at: now }));
    const { error } = await db.from("wf_social_discoveries").upsert(rows, { onConflict: "discovery_id", ignoreDuplicates: false });
    if (error) {
      await recordPulse("social-discovery", { attempted: freeCalls, succeeded: 0, failed: 1, note: "private discovery write failed" });
      return Response.json({ ok: false, error: "discovery_write_failed", free_calls: freeCalls,
        paid_calls: 0, publication_enabled: false }, { status: 503, headers });
    }
    written = rows.length;
    const evidence = sourceEvidenceRows(resolved, observedAt);
    if (evidence.length) {
      const { error: evidenceError } = await db.from("wf_source_evidence")
        .upsert(evidence, { onConflict: "entity_type,entity_id,field_name,evidence_hash", ignoreDuplicates: false });
      if (evidenceError) errors.push({ query_key: "evidence", reason: "source_evidence_write_failed" });
    }
    if (candidateRows.length) {
      const { error: candidateError } = await db.from("wf_social_candidates")
        .upsert(candidateRows.map((row) => ({ ...row, last_seen_at: now })), { onConflict: "media_id", ignoreDuplicates: false });
      if (candidateError) errors.push({ query_key: "qualification", reason: "candidate_write_failed" });
    }
  }

  const seasonal = resolved.filter((row) => row.seasonal_evidence.length);
  const trendOnly = seasonal.filter((row) => row.qualification_status === "trend_only");
  const locationCandidates = seasonal.filter((row) => row.identity_status === "candidate");
  await recordPulse("social-discovery", { attempted: freeCalls, succeeded: written, failed: errors.length,
    note: `private links:${written}; seasonal:${seasonal.length}; trend_only:${trendOnly.length}; cards:0; paid:$0` });
  return Response.json({ ok: errors.length === 0, mode: "private_discovery", publication_enabled: false,
    queries_planned: plans.length, free_plan_verified: true, free_calls: freeCalls,
    free_calls_remaining_before_run: free.remaining, paid_calls: 0, estimated_spend_usd: 0,
    raw_results: rawResults, social_links: resolved.length, seasonal_links: seasonal.length,
    trend_only: trendOnly.length, location_candidates: locationCandidates.length,
    location_candidate_rate: seasonal.length ? Math.round(locationCandidates.length * 1000 / seasonal.length) / 10 : 0,
    card_candidates: candidateRows.length, published_cards: 0, written, errors }, { headers });
}
