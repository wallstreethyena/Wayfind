// scripts/gen-creator-signals.mjs — regenerates lib/creatorSignalsData.generated.js
// from lib/creatorVideos.js's curated registry (WO9, 2026-09-02; compacted
// 2026-09-07 for a second bundle-size pass).
//
// WHAT THIS IS FOR. lib/creatorVideos.js is the single source of truth for
// curated creator videos, url included — and stays that way; nothing here
// hand-duplicates its data. But the EAGER "/" consumers — lib/creatorBoost.js
// (reachOf, hasCreatorVideoAt), lib/trendSignal.js (creatorCountFor, via
// lib/lawfulOrder.js's governedScoreOf, called on every ranked row app-wide)
// and app/components/CreatorCardMark.js's creatorHeads() (reached from
// app/home.js and app/components/RailCard.js) — only ever need, PER VIDEO:
// platform, creator handle, and reach. None of them need the url, the
// caption, the address, or the display name. Importing creatorVideosFor from
// lib/creatorVideos.js for that pulled the whole ~56KB-gz file — every url,
// every address, every displayName — into the eager "/" bundle, because ES
// module bundling is per-FILE, not per-export.
//
// WHY PER-VIDEO RECORDS, NOT AN AGGREGATE. It would be tempting to collapse
// each entry's videos down to {hasLive, maxReach, creatorCount} — but two of
// the five eager consumers dedupe creators by DIFFERENT rules:
//   • lib/trendSignal.js's creatorCountFor() dedupes by norm() — lowercase,
//     NFKD-normalized, non-alphanumerics collapsed to spaces, trimmed.
//   • CreatorCardMark's creatorHeads() dedupes by handle.trim().toLowerCase()
//     — no NFKD, no punctuation folding — and it needs the ORIGINAL handle
//     casing and the platform, per video, to render an avatar + a name.
// "food.by.tiana" and "foodbytiana" are two creators under trim/lowercase but
// one creator under norm(). An aggregate can only encode ONE of those two
// answers, so it would be silently wrong for whichever consumer disagrees.
// This file keeps ONE RECORD PER LIVE VIDEO and only re-encodes each field —
// lossless for both dedupe rules, computed downstream exactly as before.
//
// THE COMPACT ENCODING. Two exports:
//
//   export const PLATFORMS = [...];   // distinct platform strings, first-seen
//   export const LEAN_CURATED = [...]; // one positional tuple per curated entry
//
//   entry tuple:  [ placeId || 0, matchName || 0, matchCity || 0, videos ]
//   video tuple:  [ creator || 0, platformIndex, reach == null ? 0 : reach ]
//
// `0` is the "absent" sentinel in every string/nullable-number slot: every
// real placeId/name/city/creator is a non-empty string, and JSON round-trips
// the number 0 and a string distinctly, so `lib/creatorSignals.js` can tell
// "field absent" apart from any real value with a plain `=== 0` check — no
// value ever collides with its own sentinel.
//
// reach's sentinel doubles up `null` and a genuine `0`, on purpose: every
// consumer that reads reach (lib/creatorBoost.js's reachOf(), which takes the
// MAX over a video array starting from 0) already treats "no reach recorded"
// and "recorded reach of exactly 0" identically — a 0 can never raise a max
// that starts at 0. No consumer here distinguishes the two, so this loses
// nothing real.
//
// PLATFORMS is an interning table so a handful of repeated strings ("tiktok",
// "instagram", "facebook") aren't spelled out on every one of ~390 videos.
// It MUST include "" whenever any live video has a falsy platform, so that
// video's index decodes back to "" (falsy) — round-tripping through
// creatorHeads()'s `v.platform || "tiktok"` default exactly as a decoded
// `null` used to.
//
// `key` is dropped entirely: the lean resolver indexes on placeId and
// match.name only (see lib/creatorSignals.js), never on the entry key.
//
// ONLY LIVE VIDEOS ARE EMITTED (a real, non-empty `url` in the source
// registry) — same rule lib/creatorVideos.js's own renderable() applies, same
// reason: a mid-curation entry must never count as "has a video" for the
// ranking boost. Because of this, the old `live` boolean per video is gone —
// it would always be `true` now, so it is implied instead of stored. An entry
// whose videos are ALL staged still gets an ENTRY TUPLE with an empty videos
// array — it is not dropped from LEAN_CURATED — because it must still occupy
// its slot in the resolver's placeId/name index (see lib/creatorSignals.js's
// header for why dropping it would be a live ranking-attribution change).
//
// Serialized with plain JSON.stringify(x) — compact, not `null, 2` — because
// the pretty-printing alone cost ~450 bytes gz for no reader: this file is
// generated, never hand-read, and scripts/check-creator-registry-bundle-wall.mjs
// asserts it stays compact so the saving can't silently regress.
//
// Run manually after any edit to CURATED in lib/creatorVideos.js:
//   node scripts/gen-creator-signals.mjs
// scripts/check-creator-signals-fresh.mjs (wired into guards.txt) fails the
// guard suite if the committed generated file is stale.
// scripts/check-creator-signal-equivalence.mjs (wired into guards.txt) proves
// this encoding produces IDENTICAL ranking/card behaviour to the original
// full-registry resolver, entry by entry, across the whole curated corpus.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const OUT_PATH = repoRoot + "lib/creatorSignalsData.generated.js";

export async function buildLeanCurated(curatedOverride) {
  // curatedOverride: an optional CURATED-shaped array to encode directly,
  // instead of reading lib/creatorVideos.js off disk — used ONLY by
  // scripts/check-creator-signal-equivalence.mjs to run this SAME encode
  // logic against synthetic fixtures (a staged-only entry, a two-entry
  // name-collision pair, …) that don't exist in the real registry. Default
  // (no arg) behavior — read the real file — is unchanged, so every existing
  // caller (main() below, scripts/check-creator-signals-fresh.mjs) is
  // unaffected.
  let CURATED = curatedOverride;
  if (!CURATED) {
    const mod = await import("../lib/creatorVideos.js?t=" + Date.now());
    CURATED = mod.__CURATED_FOR_CODEGEN__;
  }
  if (!Array.isArray(CURATED)) throw new Error("lib/creatorVideos.js did not export __CURATED_FOR_CODEGEN__ as an array");

  const platforms = [];
  const platformIndexOf = new Map();
  const indexForPlatform = (p) => {
    const key = p || "";
    let idx = platformIndexOf.get(key);
    if (idx === undefined) {
      idx = platforms.length;
      platformIndexOf.set(key, idx);
      platforms.push(key);
    }
    return idx;
  };

  const entries = CURATED.map((e) => {
    const liveVideos = (e.videos || []).filter((v) => v && typeof v.url === "string" && v.url.trim().length > 0);
    const videos = liveVideos.map((v) => [
      v.creator || 0,
      indexForPlatform(v.platform),
      typeof v.reach === "number" ? v.reach : 0,
    ]);
    return [
      e.placeId || 0,
      (e.match && e.match.name) || 0,
      (e.match && e.match.city) || 0,
      videos,
    ];
  });

  return { platforms, entries };
}

export function renderModule(lean) {
  const header =
`// lib/creatorSignalsData.generated.js — GENERATED FILE. Do not hand-edit.
// Regenerate with: node scripts/gen-creator-signals.mjs
// Source of truth: lib/creatorVideos.js CURATED (__CURATED_FOR_CODEGEN__).
// scripts/check-creator-signals-fresh.mjs fails the guard suite if this file
// drifts from that source. See scripts/gen-creator-signals.mjs for the full
// encoding: PLATFORMS is an interning table, LEAN_CURATED holds one
// positional tuple per curated entry — [placeId||0, matchName||0,
// matchCity||0, videos], videos: [creator||0, platformIndex, reach||0] — with
// 0 as the "field absent" sentinel throughout. lib/creatorSignals.js decodes
// this back into the same {placeId, match:{name,city}, videos:[{creator,
// platform,reach}]} shape the resolver has always worked with. Read instead
// of the full ~56KB-gz curated registry by lib/creatorBoost.js,
// lib/trendSignal.js and app/components/CreatorCardMark.js.
`;
  return header +
    `export const PLATFORMS = ${JSON.stringify(lean.platforms)};\n` +
    `export const LEAN_CURATED = ${JSON.stringify(lean.entries)};\n`;
}

async function main() {
  const lean = await buildLeanCurated();
  writeFileSync(OUT_PATH, renderModule(lean), "utf8");
  console.log(`gen-creator-signals: wrote ${lean.entries.length} entries (${lean.platforms.length} distinct platforms) to lib/creatorSignalsData.generated.js`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
