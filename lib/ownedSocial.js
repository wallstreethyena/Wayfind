// lib/ownedSocial.js — Wayfind's OWN Instagram posts on the Trending surface.
//
// THE REQUIREMENT (owner, 2026-11-12): every eligible Reel or carousel that
// Wayfind publishes on @gowayfind.app must appear under the TRENDING NOW
// poster, with zero silent misses. "Eligible social assets missing from
// Trending" must stay 0, and a miss must be DETECTED, not noticed by hand.
//
// WHAT WAS BROKEN. Nothing tracked Wayfind's own posts at all: lib/creatorVideos.js
// is a hand-edited list of OTHER creators' Reels, and the Instagram Graph adapter
// (lib/instagramGraph.js) ships dark with no credentials. So 100% of Wayfind's
// Reels and carousels were missing from Trending, and nothing could notice.
//
// THE PIPELINE (docs/owned-social-pipeline.md):
//   source (Metricool now, Instagram Graph once IG_GRAPH_TOKEN lands)
//   -> wf_owned_social (one row per post, keyed by shortcode, exclusion reasons stored)
//   -> /api/owned-social (selectShelf: every live eligible post, newest first, no cap)
//   -> TrendingRails "Seen on Wayfind" shelf
//   -> /api/cron/owned-social reconciles the served list against the table and
//      pulses `owned-social-reconcile`; job-watch pages on a failed streak.
//
// POLICY FOR OWNED CONTENT (decided 2026-11-12): its own shelf, "Seen on
// Wayfind", at the top of Trending. Guaranteed inclusion while LIVE, newest
// first, and it never competes for a slot on the five earned shelves, so it
// can neither starve nor be starved by earned trends. The catalog is unlimited
// but visitors receive it in pages (SHELF_PAGE_SIZE) so the shelf never ships
// hundreds of posts to a phone. LIVE means relevant_until has not passed (a
// dated guide), or the post is evergreen place content, or it is younger than
// LIVE_WINDOW_DAYS. An expired post stays in the table and is
// accounted for (bucket E, reason "expired"), matching the owner's rule that
// guides for past events move out of live listings without being deleted.
//
// PURE: no I/O, no env. scripts/test-owned-social-reconcile.mjs executes it.

export const OWNED_HANDLE = "gowayfind.app";
export const LIVE_WINDOW_DAYS = 45;
/** Cards per request; the shelf fetches the next page as the visitor swipes. */
export const SHELF_PAGE_SIZE = 12;
export const SHELF_PAGE_MAX = 24;
/** The ingestion source must have run within this many hours, or the shelf may be missing new posts. */
export const INGEST_MAX_AGE_HOURS = 36;
export const SHELF_FORMATS = Object.freeze(["reel", "carousel"]);
export const EXCLUSION_REASONS = Object.freeze([
  "format_single_image", "brand_promo_no_discovery", "ad_creative", "companion_duplicate",
  "not_florida", "owner_excluded", "rights_restricted", "deleted_on_instagram",
]);
export const BUCKETS = Object.freeze({
  A: "present_and_correct",
  B: "present_but_misassociated",
  C: "ingested_not_trending",
  D: "missing_from_wayfind",
  E: "excluded_with_reason",
  F: "broken_needs_repair",
});

const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,40}$/;
const PERMALINK_RE = /^https:\/\/(?:www\.)?instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})\/?(?:[?#].*)?$/;

/** { kind, shortcode } from any Instagram post URL, or null. */
export function parsePermalink(url) {
  const m = String(url || "").trim().match(PERMALINK_RE);
  if (!m) return null;
  return { kind: m[1] === "p" ? "p" : "reel", shortcode: m[2] };
}

/** The one canonical permalink the table stores (and the CHECK constraint accepts). */
export function canonicalPermalink(format, shortcode) {
  if (!SHORTCODE_RE.test(String(shortcode || ""))) return null;
  return `https://www.instagram.com/${format === "reel" ? "reel" : "p"}/${shortcode}/`;
}

/** Metricool / Graph media type -> our format. */
export function formatOf(type) {
  const t = String(type || "").toUpperCase();
  if (/REEL|VIDEO|CLIPS/.test(t)) return "reel";
  if (/CAROUSEL/.test(t)) return "carousel";
  if (/IMAGE/.test(t)) return "image";
  return null;
}

/** "20261111150244" (Metricool, UTC) or an ISO string -> ISO string, or null. */
export function toIso(ts) {
  const s = String(ts || "").trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const d = new Date(s);
  return s && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/**
 * A short display title from a caption's first line: no emoji, hashtags,
 * mentions or dashes (owner style rule), at most 60 characters on a word
 * boundary. Used only when no classified title exists yet.
 */
export function deriveTitle(caption) {
  const first = String(caption || "").split(/\n/).map((l) => l.trim()).find((l) => l.replace(/[^A-Za-z0-9]/g, "").length >= 3) || "";
  let t = first
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\w.]+/g, " ")
    .replace(/[\u2010-\u2015-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s'’&,.!?:$%+/()]/gu, " ")
    .replace(/\s+/g, " ").trim();
  if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, "").replace(/[,.:;!?\s]+$/, "");
  return t || null;
}

/**
 * One source record -> a canonical row (the shape wf_owned_social stores).
 * `fields` may carry the classification (title, eligibility, reason ...).
 * Returns null when the record cannot identify a post.
 */
export function normalizeAsset(record, { source, fields = {} } = {}) {
  if (!record) return null;
  const parsed = parsePermalink(record.permalink || record.url);
  if (!parsed) return null;
  const format = formatOf(record.media_type || record.type) || (parsed.kind === "reel" ? "reel" : null);
  if (!format) return null;
  const row = {
    shortcode: parsed.shortcode,
    permalink: canonicalPermalink(format, parsed.shortcode),
    format,
    lifecycle: record.lifecycle || "published",
    published_at: toIso(record.timestamp || record.published_at),
    caption: record.caption != null ? String(record.caption).slice(0, 4000) : null,
    cover_source_url: record.thumbnail_url || record.media_url || record.cover_source_url || null,
    source,
    source_media_id: record.id != null ? String(record.id) : null,
    eligibility: "eligible",
    exclusion_reason: null,
    ...fields,
  };
  if (!row.title) row.title = deriveTitle(row.caption);
  // Single photos are out of scope for the Trending shelf; record why instead of dropping them.
  if (row.format === "image" && row.eligibility === "eligible") {
    row.eligibility = "excluded";
    row.exclusion_reason = "format_single_image";
  }
  return row;
}

function dayDiff(fromIso, todayStr) {
  const a = Date.parse(String(fromIso || "").slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(String(todayStr) + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

/** Why a row is NOT on the shelf, or null when it must be. */
export function shelfBlocker(row, todayStr) {
  if (!row) return "no_row";
  if (row.lifecycle !== "published") return "not_published";
  if (row.eligibility !== "eligible") return "excluded:" + (row.exclusion_reason || "no_reason");
  if (!SHELF_FORMATS.includes(row.format)) return "format";
  // A dated guide expires on its date, evergreen or not.
  if (row.relevant_until) {
    if (String(row.relevant_until) < String(todayStr)) return "expired";
    return null;
  }
  // Evergreen place content stays live past the window while it is useful.
  if (row.evergreen === true) return null;
  const age = dayDiff(row.published_at, todayStr);
  if (age == null) return "no_publish_date";
  if (age > LIVE_WINDOW_DAYS) return "expired";
  return null;
}

/** Every live eligible post, newest first, one card per shortcode. Never capped. */
export function selectShelf(rows, todayStr) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row || seen.has(row.shortcode)) continue;
    if (shelfBlocker(row, todayStr) !== null) continue;
    seen.add(row.shortcode);
    out.push(row);
  }
  out.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
  return out;
}

/** The public card shape /api/owned-social serves. */
export function toShelfItem(row) {
  return {
    shortcode: row.shortcode,
    permalink: row.permalink,
    format: row.format,
    title: cleanDisplayTitle(row.title, row),
    city: row.city || null,
    published_at: row.published_at || null,
    relevant_until: row.relevant_until || null,
    cover: row.cover_url || null,
    links: safeWayfindLinks(row.wayfind_links),
  };
}

/** One page of the shelf: { items, total, next_offset }. */
export function shelfPage(rows, todayStr, { offset = 0, limit = SHELF_PAGE_SIZE } = {}) {
  const all = selectShelf(rows, todayStr);
  const lim = Math.max(1, Math.min(SHELF_PAGE_MAX, Number(limit) || SHELF_PAGE_SIZE));
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const items = all.slice(off, off + lim).map(toShelfItem);
  return { items, total: all.length, next_offset: off + lim < all.length ? off + lim : null };
}

// Internal phrases that leaked into a few published captions. They must never
// become a title on Wayfind; the original Instagram post is left untouched.
const LEAKED_PHRASES = [
  /here it is with [^:]*:/gi, /main carousel caption/gi, /comment \w+ (?:and|&) i'?ll send[^.!?]*[.!?]?/gi,
  /which one are you doing first\??/gi, /drop (?:the|your) number\.?/gi, /link in bio\.?/gi,
  /https?:\/\/\S+/gi, /\bwww\.\S+/gi,
];
const FORMAT_WORD = { reel: "Reel", carousel: "Carousel" };

/**
 * The title a visitor sees: leaked internal phrases, URLs, emoji and dashes
 * removed, at most 60 characters. Deterministic. Falls back to
 * "Wayfind Reel, <city>" when nothing usable is left.
 */
export function cleanDisplayTitle(title, row = {}) {
  let t = String(title || "");
  for (const re of LEAKED_PHRASES) t = t.replace(re, " ");
  t = t.replace(/[\u2010-\u2015-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s'’&,.!?:$%+/()]/gu, " ")
    .replace(/\s+/g, " ").replace(/^[\s,.:;!?]+|[\s,:;]+$/g, "").trim();
  if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, "").replace(/[,.:;!?\s]+$/, "");
  if (t.replace(/[^A-Za-z]/g, "").length >= 4) return t;
  const kind = "Wayfind " + (FORMAT_WORD[row.format] || "post");
  return row.city ? `${kind}, ${row.city}` : kind;
}

/** Only same-site Wayfind links survive: /florida-events/<slug> or /p/<id>. */
export function safeWayfindLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.filter((l) => l && typeof l.label === "string" && l.label.trim() && typeof l.href === "string"
    && /^\/(?:florida-events\/[a-z0-9-]{3,120}|p\/[A-Za-z0-9_-]{8,200})$/.test(l.href))
    .slice(0, 4).map((l) => ({ label: l.label.trim().slice(0, 60), href: l.href }));
}

/** What makes a stored row unusable on a card, or null. */
export function rowDefect(row) {
  if (!row) return "no_row";
  if (!SHORTCODE_RE.test(String(row.shortcode || ""))) return "bad_shortcode";
  if (row.permalink !== canonicalPermalink(row.format, row.shortcode)) return "bad_permalink";
  if (row.eligibility === "excluded" && !EXCLUSION_REASONS.includes(row.exclusion_reason)) return "excluded_without_reason";
  if (row.eligibility === "eligible" && row.lifecycle === "published" && !row.title) return "no_title";
  if (row.wayfind_links != null && !Array.isArray(row.wayfind_links)) return "bad_links";
  return null;
}

/**
 * THE RECONCILIATION. Every source post lands in exactly one bucket.
 *
 *   sourceAssets  what the source of truth says Wayfind published (Metricool / Graph)
 *   rows          what wf_owned_social holds
 *   served        what /api/owned-social actually served (the shelf)
 *
 * missing = C + D + F; the invariant is missing === 0.
 */
export function reconcile({ sourceAssets = [], rows = [], served = [], todayStr }) {
  const byCode = new Map();
  for (const r of rows) if (r && r.shortcode) byCode.set(r.shortcode, r);
  const servedCount = new Map();
  for (const s of served) if (s && s.shortcode) servedCount.set(s.shortcode, (servedCount.get(s.shortcode) || 0) + 1);

  const assets = [];
  const sourceCodes = new Set();
  for (const a of sourceAssets) {
    const code = a && (a.shortcode || (parsePermalink(a.permalink) || {}).shortcode);
    if (!code || sourceCodes.has(code)) continue;
    sourceCodes.add(code);
    assets.push({ shortcode: code, format: a.format || null, published_at: a.published_at || null });
  }
  // Rows the source never mentioned still count: a row ingested from another
  // source (manual, Graph) must also be on the shelf when it is live.
  for (const r of rows) if (r && r.shortcode && !sourceCodes.has(r.shortcode)) {
    sourceCodes.add(r.shortcode);
    assets.push({ shortcode: r.shortcode, format: r.format, published_at: r.published_at });
  }

  const results = [];
  let eligibleLive = 0;
  for (const a of assets) {
    const row = byCode.get(a.shortcode);
    const shown = servedCount.get(a.shortcode) || 0;
    let bucket, why;
    if (!row) { bucket = "D"; why = "not in wf_owned_social"; }
    else {
      if (shelfBlocker(row, todayStr) === null) eligibleLive++;
      const defect = rowDefect(row);
      const blocker = shelfBlocker(row, todayStr);
      if (defect) { bucket = "F"; why = defect; }
      else if (shown > 1) { bucket = "F"; why = "duplicate_card"; }
      else if (blocker === null && shown === 1) { bucket = "A"; why = "on shelf"; }
      else if (blocker === null) { bucket = "C"; why = "live and eligible but not served"; }
      else if (shown >= 1) { bucket = "F"; why = "served but should not be (" + blocker + ")"; }
      else { bucket = "E"; why = blocker; }
    }
    results.push({ shortcode: a.shortcode, format: (row && row.format) || a.format, bucket, why });
  }
  // A served card that matches no row at all is broken too (stale cache, wrong id).
  for (const code of servedCount.keys()) if (!byCode.has(code)) {
    results.push({ shortcode: code, format: null, bucket: "F", why: "served card with no row" });
  }

  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  for (const r of results) counts[r.bucket]++;
  const byFormat = (fmt) => results.filter((r) => r.format === fmt).length;
  return {
    results,
    counts,
    inspected: results.length,
    reels: byFormat("reel"),
    carousels: byFormat("carousel"),
    eligibleLive,
    missing: counts.C + counts.D,
    broken: counts.F,
    ok: counts.C === 0 && counts.D === 0 && counts.F === 0,
  };
}

/**
 * Is ingestion fresh enough to trust? Fails when the newest post the source
 * knows about is newer than anything ingested, or when the last successful
 * ingest is older than INGEST_MAX_AGE_HOURS.
 */
export function ingestionFreshness({ lastIngestAt, newestSourcePublishedAt = null, newestRowPublishedAt = null, now = Date.now() }) {
  const last = Date.parse(lastIngestAt || "");
  if (!Number.isFinite(last)) return { ok: false, why: "no successful ingest on record" };
  const ageH = (now - last) / 3600000;
  if (ageH > INGEST_MAX_AGE_HOURS) return { ok: false, why: `last ingest ${Math.round(ageH)}h ago (limit ${INGEST_MAX_AGE_HOURS}h)` };
  if (newestSourcePublishedAt && (!newestRowPublishedAt || String(newestSourcePublishedAt) > String(newestRowPublishedAt))) {
    return { ok: false, why: "source has a newer post than wf_owned_social" };
  }
  return { ok: true, why: null, ageHours: Math.round(ageH * 10) / 10 };
}

/** The one-line pulse note job-watch shows when the invariant breaks. */
export function reconcileNote(rec, fresh) {
  const parts = [`missing=${rec.missing}`, `broken=${rec.broken}`, `on_shelf=${rec.counts.A}`, `excluded=${rec.counts.E}`];
  if (fresh && !fresh.ok) parts.push("stale_ingest: " + fresh.why);
  const bad = rec.results.filter((r) => r.bucket === "C" || r.bucket === "D" || r.bucket === "F").slice(0, 5);
  if (bad.length) parts.push("first: " + bad.map((r) => `${r.shortcode}(${r.why})`).join(", "));
  return parts.join(" · ");
}
