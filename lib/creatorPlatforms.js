// lib/creatorPlatforms.js — platform presentation constants (color/label),
// split out of lib/creatorVideos.js (2026-09-02, WO9 bundle fix).
//
// WHY THIS IS ITS OWN FILE. app/components/CreatorCardMark.js (eager on "/" —
// it renders the creator badge on every place card) only ever needed these
// two small lookup tables. But ES module bundling is per-FILE, not
// per-export: importing PLATFORM from lib/creatorVideos.js pulled the whole
// ~2,400-line curated video registry (~56KB gz) into the homepage's eager
// bundle right alongside it, module-level literal and all. Moving the two
// constants here means CreatorCardMark can take just them, and
// lib/creatorVideos.js's own registry only ships to whoever actually asks for
// it (see lib/creatorSignals.js and scripts/check-bundle.mjs's history for
// the fuller story).
//
// lib/creatorVideos.js re-exports both names unchanged for every other
// existing importer (Detail.js, SocialFind.js, etc.) — this split changes
// nothing about where PLATFORM/PLATFORM_RGB live conceptually, only which
// file's bytes a given importer has to accept to get them.
export const PLATFORM = {
  tiktok: { label: "TikTok", color: "#FF0050" },
  instagram: { label: "Instagram", color: "#E1306C" },
  youtube: { label: "YouTube", color: "#FF0000" },
  facebook: { label: "Facebook", color: "#1877F2" },
  // v6.95 (owner: "for facebook also and tiktok instagram and even x we need
  // to fetch from everywhere") — white, not a "brand blue," because that's
  // X's own actual mark on a dark surface (their dark-mode UI is white on
  // black); every other platform here gets a saturated hue that reads at a
  // glance, and white still reads clean for pill text/borders/glow without
  // pretending X has a color it doesn't.
  x: { label: "X", color: "#FFFFFF" },
};

// v6.93 — the "r,g,b" triplet twin of PLATFORM[x].color, for CSS custom
// properties (box-shadow can't take a #hex through a var() directly). Kept
// as a literal map, not computed at runtime, so it can never drift silently
// out of sync with a hand-checked value — 4 platforms, cheap to keep exact.
export const PLATFORM_RGB = {
  tiktok: "255,0,80",
  instagram: "225,48,108",
  youtube: "255,0,0",
  facebook: "24,119,242",
  x: "255,255,255",
};
