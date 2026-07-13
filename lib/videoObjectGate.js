// lib/videoObjectGate.js — SERVER-ONLY. VideoObject rich-result schema is DEFERRED
// (owner decision, 2026-07-13): Wayfind does NOT download, cache, self-host, or
// commit a creator's TikTok video frame/thumbnail solely to manufacture a durable
// thumbnailUrl. The clean route is a creator's written permission or a
// creator-supplied original — never scraping or re-hosting a platform's media.
//
// This module is the eligibility CONTRACT + per-video provenance store, so that if
// Phase 2b is ever built, the emitter MUST call videoObjectEligible() and emit a
// VideoObject ONLY when every condition is genuinely true. Nothing here is wired
// into rendering today, and NO VideoObject / og:video / video-sitemap markup ships.
//
// A video is eligible for VideoObject ONLY when ALL are true:
//   1. permissionStatus === "granted" — the creator has given written permission
//      (or supplied the original), recorded in permissionRecord.
//   2. thumbnailRights is "licensed" | "creator-supplied" AND thumbnailUrl is a
//      real, representative frame at a STABLE self-served URL (not an expiring CDN
//      link), with a refresh strategy in thumbnailRefresh.
//   3. renderedWithoutClick === true — the video is present in the rendered page
//      without a tap. Today's tap-to-load facade is CWV-friendly but does NOT
//      qualify for video indexing, so it stays false.
//   4. verified === true — player, thumbnail, attribution, and permission were
//      hand-checked.
//   5. Operational (not derivable in code, tracked in verifiedNote): the page
//      passes Google's Rich Results Test and is monitored in Search Console.

export const VIDEO_PROVENANCE = {
  "spinning-coffee-bradenton": {
    sourceUrl: "https://www.tiktok.com/@cindy.selects/video/7661821646973586702",
    creatorHandle: "cindy.selects",
    permissionStatus: "none",        // none | requested | granted
    permissionRecord: null,           // link/id of the written permission, once granted
    thumbnailRights: "none",          // none | licensed | creator-supplied
    thumbnailUrl: null,               // stable, self-served, representative frame
    thumbnailRefresh: null,           // refresh/expiry strategy once a thumbnail exists
    renderedWithoutClick: false,      // tap-to-load facade -> false (not video-indexable)
    verified: false,
    verifiedNote: null,
    lastVerified: null,
  },
  // Facebook /share/r/ reel: link-out only, no on-page player, no video id -> this
  // is a normal external social link and is NEVER eligible for VideoObject.
  "mai-kai-fort-lauderdale": {
    sourceUrl: "https://www.facebook.com/share/r/1EPX6DN118/",
    creatorHandle: null,
    permissionStatus: "none",
    permissionRecord: null,
    thumbnailRights: "none",
    thumbnailUrl: null,
    thumbnailRefresh: null,
    renderedWithoutClick: false,
    verified: false,
    verifiedNote: "Facebook link-out only; not a video on our page.",
    lastVerified: null,
  },
};

// The gate. Returns false for every video today (no permission on record). When
// Phase 2b is built, the VideoObject emitter MUST gate on this.
export function videoObjectEligible(key) {
  const r = VIDEO_PROVENANCE[key];
  if (!r) return false;
  return (
    r.permissionStatus === "granted" &&
    (r.thumbnailRights === "licensed" || r.thumbnailRights === "creator-supplied") &&
    typeof r.thumbnailUrl === "string" && r.thumbnailUrl.length > 0 &&
    r.renderedWithoutClick === true &&
    r.verified === true
  );
}
