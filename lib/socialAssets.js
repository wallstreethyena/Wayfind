// Wayfind's canonical social content model (owner brief, 2026-11-12). Server only.
//
// One SocialAsset per published post, whatever it is about:
//   { id: "ig:<shortcode>", platform, permalink, format: reel|carousel|image,
//     publishedMs, owner, owned, caption, kind: discovery|brand,
//     twinOf, seasons, metrics, entities: [{ type, id }], sources: [...] }
//
// Entity types: event | place | guide | page | post (a discovery post that
// covers several plans and has no single subject: it stands for itself).
// Nothing here requires a place_id. Surfing Santas (an event on a beach) is
// an event asset, the same as Gaylord Palms (a place) is a place asset.
//
// Sources, merged by permalink so the same post is ONE asset:
//   1. Wayfind's own Instagram (@gowayfind.app): data/social/wayfind-instagram.json,
//      synced from Metricool (the scheduled reconciliation task), compiled into
//      lib/wayfindSocialAssets.generated.js.
//   2. Creator posts attached to places (lib/creatorVideos.js CURATED).
//   3. Creator posts attached to events (lib/eventSocial.js EXACT_EVENT_POSTS).
//
// The publish time of an Instagram post is read from its shortcode (the
// media id carries a millisecond timestamp), so every post has a reliable
// date without any API call. Verified to the second against Metricool.
import { WAYFIND_SOCIAL } from "./wayfindSocialAssets.generated.js";
import { __CURATED_FOR_CODEGEN__ as CURATED } from "./creatorVideos.js";
import { __EVENT_SOCIAL_FOR_GUARDS__ as EVENT_POSTS } from "./eventSocial.js";
import { isIndependentCreator } from "./creatorIndependence.js";

// Handle fold (same shape as creatorIndependence's own normalisation).
const normHandle = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

export const WAYFIND_HANDLE = "gowayfind.app";

const IG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const IG_EPOCH_MS = 1314220021721;

/** The shortcode of an Instagram post or reel URL, or null. */
export function igShortcode(url) {
  const m = /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{6,})/.exec(String(url || ""));
  return m ? m[1] : null;
}

/** Publish time (ms) encoded in an Instagram shortcode, or null. */
export function igPublishedMs(code) {
  if (!code || !/^[A-Za-z0-9_-]{6,14}$/.test(code)) return null;
  let id = 0n;
  for (const ch of code) {
    const i = IG_ALPHABET.indexOf(ch);
    if (i < 0) return null;
    id = id * 64n + BigInt(i);
  }
  const ms = Number(id >> 23n) + IG_EPOCH_MS;
  return Number.isFinite(ms) && ms > Date.UTC(2015, 0, 1) && ms < Date.UTC(2100, 0, 1) ? ms : null;
}

export function assetIdFor(platform, url) {
  if (platform === "instagram" || /instagram\.com/.test(String(url || ""))) {
    const code = igShortcode(url);
    return code ? "ig:" + code : null;
  }
  const clean = String(url || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  return clean ? String(platform || "web") + ":" + clean : null;
}

function igFormat(url) {
  return /\/(?:reel|reels|tv)\//.test(String(url || "")) ? "reel" : "post";
}

// Seasons that are running on a given site day (YYYY-MM-DD).
export function activeSeasons(today) {
  const md = String(today || "").slice(5, 10);
  const out = [];
  if (md >= "11-01" || md <= "01-06") out.push("christmas");
  if (md >= "09-15" && md <= "10-31") out.push("halloween");
  if (md >= "09-01" && md <= "11-30") out.push("fall");
  return out;
}

/**
 * Every social asset Wayfind knows about, merged by permalink. Pure apart
 * from the module data; `extraOwned` lets a caller add rows synced after the
 * last deploy (wf_owned_social, when present: lib/trendingSocialServer.js).
 */
export function allSocialAssets({ extraOwned = [] } = {}) {
  const byId = new Map();
  const put = (asset) => {
    if (!asset || !asset.id) return;
    const prev = byId.get(asset.id);
    if (!prev) { byId.set(asset.id, asset); return; }
    // Same post from a second source: one asset, entities and sources merged.
    const seen = new Set(prev.entities.map((e) => e.type + ":" + e.id));
    for (const e of asset.entities) if (!seen.has(e.type + ":" + e.id)) prev.entities.push(e);
    prev.sources = [...new Set([...prev.sources, ...asset.sources])];
    prev.seasons = [...new Set([...(prev.seasons || []), ...(asset.seasons || [])])];
    if (asset.owned) { prev.owned = true; prev.owner = WAYFIND_HANDLE; }
    // A synced row is newer than the committed snapshot: its lifecycle,
    // exclusion and stored cover win.
    if (asset.sources.includes("owned-db")) {
      // The table is authoritative for a post it holds, both ways: it can
      // exclude a post the snapshot listed, or reinstate one.
      prev.status = asset.status || "published";
      prev.kind = asset.kind; prev.kindReason = asset.kindReason;
      prev.excludedReason = asset.excludedReason || null;
      prev.twinOf = asset.twinOf || null;
      if (asset.coverUrl) prev.coverUrl = asset.coverUrl;
      if (asset.entities.length) prev.entities = asset.entities.slice();
    }
  };

  for (const row of [...((WAYFIND_SOCIAL && WAYFIND_SOCIAL.assets) || []), ...extraOwned]) {
    const code = igShortcode(row.permalink);
    const id = row.id || (code ? "ig:" + code : null);
    put({
      id, platform: "instagram", permalink: row.permalink,
      format: row.format || igFormat(row.permalink),
      publishedMs: igPublishedMs(code) ?? (row.published_at ? Date.parse(row.published_at) : null),
      owner: WAYFIND_HANDLE, owned: true,
      caption: row.caption || "", kind: row.kind === "brand" ? "brand" : "discovery", kindReason: row.kind_reason || null,
      twinOf: row.twin_of || null, seasons: Array.isArray(row.seasons) ? row.seasons.slice() : [],
      metrics: row.metrics || {}, city: row.city || null,
      entities: (row.entities || []).filter((e) => e && e.type && e.id).map((e) => ({ type: e.type, id: String(e.id) })),
      sources: [row.source || "owned-snapshot"],
      // A synced row can be scheduled or a draft (CREATED/SCHEDULED); only a
      // published post may appear publicly.
      status: row.status || "published",
      excludedReason: row.excluded_reason || null,
      coverUrl: row.cover_url || null,
    });
  }

  for (const entry of CURATED || []) {
    for (const v of entry.videos || []) {
      if (!v || !v.url) continue;
      const id = assetIdFor(v.platform, v.url);
      const code = v.platform === "instagram" ? igShortcode(v.url) : null;
      const entity = entry.placeId ? { type: "place", id: entry.placeId } : { type: "creator-key", id: entry.key };
      put({
        id, platform: v.platform || "web", permalink: v.url, format: v.platform === "instagram" ? igFormat(v.url) : "video",
        publishedMs: igPublishedMs(code), owner: v.creator || null, owned: false,
        caption: v.caption || "", kind: "discovery", twinOf: null, seasons: Array.isArray(v.seasons) ? v.seasons.slice() : [],
        metrics: {}, city: (entry.match && entry.match.city) || null, placeName: (entry.match && entry.match.name) || entry.displayName || null,
        entities: [entity], sources: ["creator-place"],
      });
    }
  }

  for (const [eventId, posts] of Object.entries(EVENT_POSTS || {})) {
    for (const [creator, url] of posts || []) {
      const platform = /instagram\.com/.test(url) ? "instagram" : /tiktok\.com/.test(url) ? "tiktok" : "web";
      const code = platform === "instagram" ? igShortcode(url) : null;
      put({
        id: assetIdFor(platform, url), platform, permalink: url, format: platform === "instagram" ? igFormat(url) : "video",
        publishedMs: igPublishedMs(code), owner: creator || null, owned: false, caption: "", kind: "discovery",
        twinOf: null, seasons: [], metrics: {}, city: null,
        entities: [{ type: "event", id: String(eventId).replace(/^wfc:/, "") }], sources: ["creator-event"],
      });
    }
  }
  return [...byId.values()];
}

/** Is this post's creator independent of what it shows (lib/creatorIndependence.js)? */
export function isIndependentAsset(asset) {
  if (!asset || asset.owned || !asset.owner) return false;
  return isIndependentCreator(normHandle(asset.owner));
}

/**
 * Social eligibility BEFORE timing: which assets belong in the Trending pool
 * at all. Timing (window, live event, season) is the engine's
 * trendEligibility. Returns { ok, reason }.
 *   brand_post          our own app promo, meme or team post: not a discovery
 *   twin_of:<id>        the animated Reel of a carousel: the carousel stands for both
 *   not_published:<s>   a synced row that is scheduled or a draft
 *   excluded:<reason>   the ingestion table excluded it with a reason
 *   no_publish_date     unreadable permalink
 */
export function socialAssetEligibility(asset) {
  if (!asset) return { ok: false, reason: "missing" };
  if (asset.status && asset.status !== "published") return { ok: false, reason: "not_published:" + asset.status };
  if (asset.publishedMs == null) return { ok: false, reason: "no_publish_date" };
  if (asset.kind === "brand") return { ok: false, reason: "brand_post" };
  if (asset.excludedReason) return { ok: false, reason: "excluded:" + asset.excludedReason };
  if (asset.twinOf) return { ok: false, reason: "twin_of:" + asset.twinOf };
  return { ok: true, reason: null };
}

/**
 * The seasonal "Seen from local creators" rail (Christmas page), from the
 * social model rather than the place registry alone: creator posts tagged
 * with the season on PLACES, plus creator posts on EVENTS that are listed in
 * this season's collection. Surfing Santas is an event on a beach with no
 * place record; it belongs here exactly like a place reel does.
 * listings: the season's listing rows ({ id|event_id, title|event_name, city }).
 */
export function seasonalSocialPosts(season, listings, placePosts) {
  const out = [];
  const seen = new Set();
  const push = (post) => {
    const id = assetIdFor(post.platform, post.url);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(post);
  };
  for (const p of placePosts || []) push(p);
  const byId = new Map();
  for (const row of listings || []) {
    const id = row && (row.event_id || row.id);
    if (id) byId.set(String(id), row);
  }
  for (const [rawId, posts] of Object.entries(EVENT_POSTS || {})) {
    const eventId = String(rawId).replace(/^wfc:/, "");
    const row = byId.get(eventId);
    if (!row) continue;
    for (const [creator, url] of posts || []) {
      const platform = /instagram\.com/.test(url) ? "instagram" : /tiktok\.com/.test(url) ? "tiktok" : "web";
      push({ key: "event:" + eventId, name: row.title || row.event_name || eventId, city: row.city || null, metro: null, placeId: null, eventId, category: "Events", platform, url, creator: creator || null });
    }
  }
  return out;
}
