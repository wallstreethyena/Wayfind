// app/api/cron/instagram-scout/route.js — the Instagram lead scout.
//
// Owner, 2026-09-03: "we need to be able to find more local events and places
// that have fall festivities. I want the videos that have a good amount of
// likes and shares."
//
// WHAT THIS IS. Two sanctioned Graph API reads (lib/instagramGraph.js), on a
// pinned list of Suncoast venues and a rotating hashtag slice
// (lib/instagramSources.js), writing LEADS into wf_social_candidates. It reads
// only public business/creator accounts through Meta's own endpoints — no
// scraping, no robots.txt violation, nothing that can get the account banned.
//
// WHAT IT DELIBERATELY IS NOT. It never writes wf_events and never renders. An
// Instagram caption is evidence that an event may exist; it is not proof of a
// date. Every lead is verified against the organiser before it becomes a card —
// the same rule that de-dated HorsePower for Kids on 2026-09-03.
//
// SHIPS DARK. Without IG_GRAPH_TOKEN + IG_BUSINESS_ACCOUNT_ID this returns
// { configured: false } and makes zero network calls, exactly like the Viator
// and GetYourGuide builders in lib/affiliates.js. See docs/INSTAGRAM_SETUP.md
// for the one-time setup that lights it up.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { igConfigured, igToken, hashtagIdUrl, hashtagMediaUrl, businessDiscoveryUrl, toCandidate, rankCandidates, IG_UNCONFIGURED_REASON } from "../../../../lib/instagramGraph.js";
import { IG_HANDLES, hashtagsForWeek } from "../../../../lib/instagramSources.js";
import { qualifySocialPost, observedCount, sourceRetryDue, safeSocialJson } from "../../../../lib/socialQualification.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { normalizedSocialHandle } from "../../../../lib/socialIdentity.js";
import { reserveFreeProviderCall } from "../../../../lib/providerMeter.js";

const DEADLINE_MS = 8000;
const GRAPH_WORKERS = 6;

async function mapConcurrent(items, width, work) {
  const rows = Array.isArray(items) ? items : [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, width), rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      await work(rows[index], index);
    }
  }));
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

async function getJson(db, url, capability, observedAt) {
  const meter = await reserveFreeProviderCall(db, capability, { now: observedAt });
  if (!meter.allowed) return { ok: false, error: `provider_meter_${meter.reason}`, body: null };
  return safeSocialJson(url, { timeoutMs: DEADLINE_MS, headers: { authorization: `Bearer ${igToken()}` } });
}

export async function GET(request) {
  // FAIL CLOSED. A missing CRON_SECRET refuses the request rather than running
  // open — an unauthenticated scout would let anyone burn Meta's 30-tags-per-7-
  // days account budget, which is an account-level limit we cannot buy back.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!igConfigured()) {
    // SHIPS DARK, ON PURPOSE (see the header comment). Until 2026-09-09 this
    // recorded attempted=1/succeeded=0, which wf_job_health reads as a DEAD run
    // and job-watch paged the owner every hour for a scout that was never
    // switched on. A deliberately unconfigured job is IDLE, not an incident:
    // attempted=0/succeeded=0/failed=0, and a note with no billing:/quota:
    // prefix (lib/jobPulse.classifyHealth escalates that prefix on the first
    // dead run). The one-time setup that lights it up is unchanged and is
    // documented in docs/INSTAGRAM_SETUP.md.
    await recordPulse("instagram-scout", { attempted: 0, succeeded: 0, failed: 0, note: IG_UNCONFIGURED_REASON });
    return json({ configured: false, ok: true, idle: true, reason: "IG_GRAPH_TOKEN / IG_BUSINESS_ACCOUNT_ID not set — see docs/INSTAGRAM_SETUP.md" }, 200);
  }
  const db = admin();
  if (!db) return json({ configured: true, ok: false, reason: "no service role" }, 503);

  const { searchParams } = new URL(request.url);
  const tagCount = Math.max(0, Math.min(12, Number(searchParams.get("tags") || 8)));
  const perAccount = Math.max(1, Math.min(25, Number(searchParams.get("per") || 12)));

  const candidates = [];
  const errors = [];
  const rejected = {};
  const observedAt = Date.now();
  let inspected = 0;
  let freeCalls = 0;
  const { data: creatorRows, error: creatorError } = await db.from("wf_social_creators")
    .select("platform,handle,status,evidence_url,reviewed_at,expires_at,canonical_place_id")
    .eq("platform", "instagram");
  if (creatorError) return json({ configured: true, ok: false, reason: "creator_registry_read_failed" }, 503);
  const creators = new Map((creatorRows || []).map((row) => [normalizedSocialHandle(row.handle), row]));
  function consider(media, context) {
    inspected++;
    const handle = normalizedSocialHandle(context.handle || media?.username);
    const creatorFollowerCount = context.source === "business_discovery" ? observedCount(context.followers) : null;
    const decision = qualifySocialPost({ ...media, platform: "instagram", handle,
      source: context.source, creator_follower_count: creatorFollowerCount }, { now: observedAt, creator: creators.get(handle) || null });
    if (!decision.eligible) {
      rejected[decision.reason] = (rejected[decision.reason] || 0) + 1;
      return;
    }
    const candidate = toCandidate(media, context);
    if (candidate) candidates.push({
      ...candidate,
      like_count: observedCount(media.like_count), comments_count: observedCount(media.comments_count),
      creator_follower_count: creatorFollowerCount,
      follower_observed_at: creatorFollowerCount === null ? null : new Date(observedAt).toISOString(),
      qualification_policy: decision.policy,
      qualification_reason: decision.reason,
      qualification_evidence: decision.evidence,
      creator_qualified: decision.creator_qualified,
    });
    else rejected.normalization_failed = (rejected.normalization_failed || 0) + 1;
  }

  // ── 1. the venues, by handle ─────────────────────────────────────────────
  // A handle that cannot be resolved is recorded, not retried forever: a wrong
  // or private account costs one call once.
  const { data: health, error: healthError } = await db.from("wf_social_source_health").select("handle,ok,fail_count,last_checked_at");
  if (healthError) return json({ ok: false, reason: "source_health_read_failed" }, 503);
  const skip = new Set((health || []).filter((h) => !sourceRetryDue(h, observedAt)).map((h) => h.handle));

  await mapConcurrent(IG_HANDLES, GRAPH_WORKERS, async (src) => {
    if (skip.has(src.handle)) return;
    const url = businessDiscoveryUrl(src.handle, perAccount);
    if (!url) return;
    const res = await getJson(db, url, "business_discovery", observedAt);
    if (!res.error?.startsWith("provider_meter_")) freeCalls++;
    if (!res.ok) {
      errors.push({ handle: src.handle, error: res.error });
      await db.from("wf_social_source_health").upsert({
        handle: src.handle, ok: false, last_error: res.error,
        fail_count: ((health || []).find((h) => h.handle === src.handle)?.fail_count || 0) + 1,
        last_checked_at: new Date().toISOString(),
      });
      return;
    }
    const bd = res.body?.business_discovery;
    const followers = Number(bd?.followers_count || 0);
    for (const media of bd?.media?.data || []) {
      consider(media, { source: "business_discovery", handle: src.handle, followers });
    }
    await db.from("wf_social_source_health").upsert({
      handle: src.handle, ok: true, last_error: null, fail_count: 0, last_checked_at: new Date().toISOString(),
    });
  });

  // ── 2. the hashtags, Meta-ranked by engagement ───────────────────────────
  // top_media IS the "popular posts" ranking the owner asked for. The weekly
  // slice keeps us inside Meta's 30-unique-tags-per-7-days account cap.
  const tags = hashtagsForWeek(new Date(), tagCount);
  await mapConcurrent(tags, GRAPH_WORKERS, async (tag) => {
    const idUrl = hashtagIdUrl(tag);
    if (!idUrl) return;
    const idRes = await getJson(db, idUrl, "hashtag_search", observedAt);
    if (!idRes.error?.startsWith("provider_meter_")) freeCalls++;
    const hashtagId = idRes.ok ? idRes.body?.data?.[0]?.id : null;
    if (!hashtagId) { errors.push({ hashtag: tag, error: idRes.error || "no id" }); return; }
    const mediaRes = await getJson(db, hashtagMediaUrl(hashtagId, "top_media"), "media_metadata", observedAt);
    if (!mediaRes.error?.startsWith("provider_meter_")) freeCalls++;
    if (!mediaRes.ok) { errors.push({ hashtag: tag, error: mediaRes.error }); return; }
    for (const media of mediaRes.body?.data || []) {
      consider(media, { source: "hashtag", tag });
    }
  });

  // ── 3. persist ───────────────────────────────────────────────────────────
  // last_seen_at moves on every sighting; review_status is never overwritten,
  // so a lead the owner already rejected does not come back as new.
  const ranked = rankCandidates(candidates);
  let written = 0;
  if (ranked.length) {
    const now = new Date().toISOString();
    const rows = ranked.map((c) => ({ ...c, platform: "instagram", last_seen_at: now }));
    const { error } = await db.from("wf_social_candidates")
      .upsert(rows, { onConflict: "media_id", ignoreDuplicates: false });
    if (error) return json({ configured: true, ok: false, reason: error.message, found: ranked.length }, 500);
    written = rows.length;
  }

  await recordPulse("instagram-scout", { attempted: inspected + errors.length, succeeded: inspected, failed: errors.length, note: `metadata inspected:${inspected}; qualified:${written}; source_errors:${errors.length}` });
  return json({
    configured: true, ok: errors.length === 0,
    status: errors.length ? "partial_or_failed" : "completed",
    inspected, rejected, free_provider_calls: freeCalls, paid_provider_calls: 0,
    publication_enabled: false,
    next_stage: "verify_florida_destination",
    handles_read: IG_HANDLES.length - skip.size,
    hashtags_read: tagCount,
    candidates: ranked.length,
    written,
    dated_leads: ranked.filter((c) => c.has_date).length,
    video_leads: ranked.filter((c) => c.is_video).length,
    top: ranked.slice(0, 5).map((c) => ({ handle: c.handle, tag: c.hashtag, score: c.lead_score, likes: c.like_count, video: c.is_video, permalink: c.permalink })),
    errors: errors.slice(0, 10),
  });
}
