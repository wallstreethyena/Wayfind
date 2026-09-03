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
import { igConfigured, hashtagIdUrl, hashtagMediaUrl, businessDiscoveryUrl, toCandidate, rankCandidates } from "../../../../lib/instagramGraph.js";
import { IG_HANDLES, hashtagsForWeek } from "../../../../lib/instagramSources.js";

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

async function getJson(url) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(DEADLINE_MS) });
  const body = await r.json().catch(() => null);
  if (!r.ok || (body && body.error)) {
    const msg = body?.error?.message || `http ${r.status}`;
    return { ok: false, error: String(msg).slice(0, 300) };
  }
  return { ok: true, body };
}

export async function GET(request) {
  // FAIL CLOSED. A missing CRON_SECRET refuses the request rather than running
  // open — an unauthenticated scout would let anyone burn Meta's 30-tags-per-7-
  // days account budget, which is an account-level limit we cannot buy back.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const manual = new URL(request.url).searchParams.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!igConfigured()) {
    return json({ configured: false, reason: "IG_GRAPH_TOKEN / IG_BUSINESS_ACCOUNT_ID not set — see docs/INSTAGRAM_SETUP.md" });
  }
  const db = admin();
  if (!db) return json({ configured: true, ok: false, reason: "no service role" }, 503);

  const { searchParams } = new URL(request.url);
  const tagCount = Math.max(0, Math.min(12, Number(searchParams.get("tags") || 8)));
  const perAccount = Math.max(1, Math.min(25, Number(searchParams.get("per") || 12)));

  const candidates = [];
  const errors = [];

  // ── 1. the venues, by handle ─────────────────────────────────────────────
  // A handle that cannot be resolved is recorded, not retried forever: a wrong
  // or private account costs one call once.
  const { data: health } = await db.from("wf_social_source_health").select("handle,ok,fail_count");
  const skip = new Set((health || []).filter((h) => !h.ok && h.fail_count >= 3).map((h) => h.handle));

  await mapConcurrent(IG_HANDLES, GRAPH_WORKERS, async (src) => {
    if (skip.has(src.handle)) return;
    const url = businessDiscoveryUrl(src.handle, perAccount);
    if (!url) return;
    const res = await getJson(url);
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
      const c = toCandidate(media, { source: "business_discovery", handle: src.handle, followers });
      if (c) candidates.push(c);
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
    const idRes = await getJson(idUrl);
    const hashtagId = idRes.ok ? idRes.body?.data?.[0]?.id : null;
    if (!hashtagId) { errors.push({ hashtag: tag, error: idRes.error || "no id" }); return; }
    const mediaRes = await getJson(hashtagMediaUrl(hashtagId, "top_media"));
    if (!mediaRes.ok) { errors.push({ hashtag: tag, error: mediaRes.error }); return; }
    for (const media of mediaRes.body?.data || []) {
      const c = toCandidate(media, { source: "hashtag", tag });
      if (c) candidates.push(c);
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

  return json({
    configured: true, ok: true,
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
