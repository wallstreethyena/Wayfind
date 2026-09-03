// lib/instagramGraph.js — Instagram, the way that does not get us blocked.
//
// THE PROBLEM THIS REPLACES (owner, 2026-09-03: "how do we get around
// Instagram's blocks on automated reads"). Every attempt to read instagram.com
// programmatically has failed the same way and always will:
//
//   * robots.txt disallows it, so our fetchers refuse the URL before a request
//     is even made — that is the "Instagram blocks automated reads" we keep
//     hitting during research;
//   * the undocumented JSON shapes (?__a=1, /p/<code>/?__a=1) were removed in
//     2021-2022 and now answer a login wall;
//   * scraping the HTML violates Meta's Platform Terms, and the enforcement is
//     an IP/account ban — a real business risk for a company whose whole
//     product is a public web app.
//
// There is no clever loophole here, and looking for one is the trap. There IS
// a sanctioned API that returns exactly what the owner asked for — public
// posts ranked by engagement — and it is free:
//
//   1. HASHTAG SEARCH (/ig_hashtag_search -> /{id}/top_media). Meta ranks
//      top_media BY ENGAGEMENT, so "#sarasotaevents top media" is literally
//      "the popular posts about Sarasota events". Returns like_count and
//      comments_count. Hard limit: 30 UNIQUE hashtags per rolling 7 days per
//      IG account, so lib/instagramSources.js keeps the tag list short and
//      rotates deliberately rather than accidentally.
//   2. BUSINESS DISCOVERY (business_discovery.username(<handle>)). Reads any
//      PUBLIC business/creator account's recent media with like_count and
//      comments_count. This is the one that matters most for Wayfind: the
//      farms, breweries, parks and venues announce their fall festivals on
//      their own grid, days before any calendar or ticketing API has them.
//
// ONE HONEST LIMIT, STATED UP FRONT: the owner asked for "likes and shares".
// The Graph API does not expose shares (or saves) for anyone else's media —
// those live only in /insights on media YOU own. So engagementScore() ranks on
// likes + comments, which are the two public signals that exist. Nothing here
// pretends to a share count, because inventing one would be the same class of
// lie as a fabricated event date.
//
// SHIPS DARK, exactly like lib/affiliates.js: every function returns null/[]
// until IG_GRAPH_TOKEN and IG_BUSINESS_ACCOUNT_ID exist, so this costs nothing
// and renders nothing until the credentials land. See docs/INSTAGRAM_SETUP.md.
import { credential } from "./envPlaceholder.js";

export const IG_API_VERSION = "v21.0";
const GRAPH = "https://graph.facebook.com/" + IG_API_VERSION;

// The 7-day rolling cap Meta enforces per IG user on /ig_hashtag_search.
export const HASHTAG_WEEKLY_LIMIT = 30;

export function igToken() { return credential(process.env.IG_GRAPH_TOKEN); }
export function igUserId() { return credential(process.env.IG_BUSINESS_ACCOUNT_ID); }
export function igConfigured() { return !!(igToken() && igUserId()); }

const MEDIA_FIELDS = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count";

/** Resolve a hashtag (no #) to its Graph id. Null when unconfigured. */
export function hashtagIdUrl(tag) {
  const token = igToken(); const user = igUserId();
  const clean = String(tag || "").replace(/^#/, "").trim().toLowerCase();
  if (!token || !user || !/^[a-z0-9_]{1,60}$/.test(clean)) return null;
  return `${GRAPH}/ig_hashtag_search?user_id=${encodeURIComponent(user)}&q=${encodeURIComponent(clean)}&access_token=${encodeURIComponent(token)}`;
}

/** Meta-ranked top media for a hashtag id. `edge` is top_media or recent_media. */
export function hashtagMediaUrl(hashtagId, edge = "top_media") {
  const token = igToken(); const user = igUserId();
  if (!token || !user || !hashtagId) return null;
  if (edge !== "top_media" && edge !== "recent_media") return null;
  return `${GRAPH}/${encodeURIComponent(hashtagId)}/${edge}?user_id=${encodeURIComponent(user)}&fields=${MEDIA_FIELDS}&access_token=${encodeURIComponent(token)}`;
}

/** Recent public media for another account, by handle. */
export function businessDiscoveryUrl(handle, limit = 12) {
  const token = igToken(); const user = igUserId();
  const clean = String(handle || "").replace(/^@/, "").trim().toLowerCase();
  if (!token || !user || !/^[a-z0-9._]{1,30}$/.test(clean)) return null;
  const n = Math.max(1, Math.min(50, Number(limit) || 12));
  const fields = `business_discovery.username(${clean}){username,followers_count,media_count,media.limit(${n}){${MEDIA_FIELDS}}}`;
  return `${GRAPH}/${encodeURIComponent(user)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
}

// ── ranking ────────────────────────────────────────────────────────────────
// Comments are weighted above likes because a comment is a costlier signal and,
// on event posts, is where "is this still on?" and "what time?" actually live.
// followers normalises a 400-follower farm against a 90k-follower venue so the
// small local account that posts the actual date is not buried.
export function engagementScore(media, followers = 0) {
  const likes = Number(media?.like_count || 0);
  const comments = Number(media?.comments_count || 0);
  const raw = likes + comments * 3;
  const f = Number(followers || 0);
  const rate = f > 0 ? raw / f : 0;
  return Math.round((raw + rate * 5000) * 10) / 10;
}

/** Video-ish media the owner asked to prioritise. */
export function isVideo(media) {
  const t = String(media?.media_type || "").toUpperCase();
  return t === "VIDEO" || t === "REELS";
}

// A caption is evidence only when it carries a DATE or an explicit seasonal
// program. "vibes 🍂" is not an event. This is the same bar the fall pool holds
// places to: a documented offering, not a seasonal-sounding word.
const FALL_WORDS = /pumpkin|fall festival|harvest|corn maze|hayride|haunted|halloween|oktoberfest|trunk[- ]or[- ]treat|trick[- ]or[- ]treat|scare|spooky|fright|apple cider|scarecrow/i;
const DATE_HINT = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+\d{1,2}\b|\bopening (?:day|weekend)\b|\bevery (?:weekend|saturday|sunday|friday)\b|\bthis (?:weekend|saturday|sunday|friday)\b/i;
const TIME_HINT = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

export function captionSignals(caption) {
  const text = String(caption || "");
  return {
    fall: FALL_WORDS.test(text),
    dated: DATE_HINT.test(text),
    timed: TIME_HINT.test(text),
  };
}

/**
 * One Graph media object -> a Wayfind SOCIAL CANDIDATE, or null.
 *
 * A candidate is a LEAD, never a published event: it carries the permalink and
 * the caption so a human (or the curation pass) can verify the date against the
 * organiser before anything reaches a card. Nothing here writes wf_events.
 */
export function toCandidate(media, { source, handle = null, followers = 0, tag = null } = {}) {
  if (!media || !media.id || !media.permalink) return null;
  const sig = captionSignals(media.caption);
  if (!sig.fall) return null;                       // not seasonal -> not a lead
  return {
    media_id: String(media.id),
    source,                                          // "hashtag" | "business_discovery"
    handle: handle ? String(handle).toLowerCase() : null,
    hashtag: tag ? String(tag).toLowerCase() : null,
    permalink: media.permalink,
    media_type: String(media.media_type || ""),
    is_video: isVideo(media),
    caption: String(media.caption || "").slice(0, 2000),
    thumbnail: media.thumbnail_url || media.media_url || null,
    posted_at: media.timestamp || null,
    like_count: Number(media.like_count || 0),
    comments_count: Number(media.comments_count || 0),
    engagement: engagementScore(media, followers),
    has_date: sig.dated,
    has_time: sig.timed,
    // The owner wants the popular VIDEOS first, and among those the ones that
    // actually name a date — a viral clip with no date is a mood board, and a
    // dated post with 40 likes is still a real event.
    lead_score: Math.round((engagementScore(media, followers) * (isVideo(media) ? 1.25 : 1) * (sig.dated ? 1.6 : 1) * (sig.timed ? 1.1 : 1)) * 10) / 10,
  };
}

/** Rank a mixed batch: strongest leads first, dedup by media id. */
export function rankCandidates(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter(Boolean)
    .filter((c) => (seen.has(c.media_id) ? false : (seen.add(c.media_id), true)))
    .sort((a, b) => b.lead_score - a.lead_score);
}
