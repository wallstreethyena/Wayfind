// scripts/gen-creator-signals.mjs — regenerates lib/creatorSignalsData.generated.js
// from lib/creatorVideos.js's curated registry (WO9, 2026-09-02).
//
// WHAT THIS IS FOR. lib/creatorVideos.js is the single source of truth for
// curated creator videos, url included — and stays that way; nothing here
// hand-duplicates its data. But lib/creatorBoost.js and lib/trendSignal.js
// (imported, transitively, by lib/lawfulOrder.js, used by EVERY ranked list
// app-wide) only ever need three things per video: platform, creator handle,
// and reach — plus whether it's "live" (renderable() gates on a non-empty
// url; staged entries carry url:""). Importing creatorVideosFor from
// lib/creatorVideos.js for that pulled the whole ~56KB-gz file — every url,
// every address, every displayName — into the eager "/" bundle, because ES
// module bundling is per-FILE, not per-export.
//
// This script strips CURATED down to exactly those fields (url replaced with
// a `live` boolean — the only thing about it any ranking/matching call site
// ever actually branches on) and writes the result as its own small data
// file. lib/creatorSignals.js (hand-written, not generated) then re-derives
// the SAME matching index (BY_PLACE_ID / BY_NAME / cityMatches) that
// lib/creatorVideos.js builds, over this lean data, so the two modules can
// never disagree about which places match.
//
// Run manually after any edit to CURATED in lib/creatorVideos.js:
//   node scripts/gen-creator-signals.mjs
// scripts/check-creator-signals-fresh.mjs (wired into guards.txt) fails the
// guard suite if the committed generated file is stale.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const OUT_PATH = repoRoot + "lib/creatorSignalsData.generated.js";

export async function buildLeanCurated() {
  const mod = await import("../lib/creatorVideos.js?t=" + Date.now());
  const CURATED = mod.__CURATED_FOR_CODEGEN__;
  if (!Array.isArray(CURATED)) throw new Error("lib/creatorVideos.js did not export __CURATED_FOR_CODEGEN__ as an array");
  return CURATED.map((e) => ({
    key: e.key,
    placeId: e.placeId || null,
    match: e.match ? { name: e.match.name || null, city: e.match.city || null } : null,
    videos: (e.videos || []).map((v) => ({
      platform: v.platform || null,
      creator: v.creator || null,
      reach: typeof v.reach === "number" ? v.reach : null,
      live: typeof v.url === "string" && v.url.trim().length > 0,
    })),
  }));
}

export function renderModule(lean) {
  const header =
`// lib/creatorSignalsData.generated.js — GENERATED FILE. Do not hand-edit.
// Regenerate with: node scripts/gen-creator-signals.mjs
// Source of truth: lib/creatorVideos.js CURATED (__CURATED_FOR_CODEGEN__).
// scripts/check-creator-signals-fresh.mjs fails the guard suite if this file
// drifts from that source. See scripts/gen-creator-signals.mjs for why this
// exists: the lean mirror lib/creatorBoost.js and lib/trendSignal.js read
// instead of the full ~56KB-gz curated registry.
export const LEAN_CURATED = `;
  return header + JSON.stringify(lean, null, 2) + ";\n";
}

async function main() {
  const lean = await buildLeanCurated();
  writeFileSync(OUT_PATH, renderModule(lean), "utf8");
  console.log(`gen-creator-signals: wrote ${lean.length} entries to lib/creatorSignalsData.generated.js`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
