// scripts/check-creator-registry-bundle-wall.mjs — WO9, 2026-09-02.
//
// scripts/check-bundle.mjs ("Homepage bundle ratchet") failed at 494.1KB gz
// against its 492KB budget. Root cause: lib/creatorBoost.js and
// lib/trendSignal.js — both imported eagerly on "/" via lib/lawfulOrder.js
// (used by lib/ranking.js and lib/sources.js, the ranked-list machinery
// every list on the app uses, client and server) — imported
// creatorVideosFor/creatorCountFor from lib/creatorVideos.js, which pulled
// its whole ~56KB-gz curated-video registry (every video url, caption ref,
// address) into the eager bundle for a boolean and a reach number. Same
// story for app/home.js's own direct import, app/components/RailCard.js's
// badge, and app/components/CreatorCardMark.js's PLATFORM/PLATFORM_RGB
// constants.
//
// The fix: lib/creatorSignals.js + lib/creatorPlatforms.js, lean mirrors
// that answer the SAME questions (has a video, how many creators, which
// platform) without the url-heavy bytes. This guard is the "bundle wall" —
// same pattern as scripts/check-sponsored-places.mjs's own bundle-wall
// section — pinning the import EDGES so a future edit can't quietly wire
// the heavy path back in and only be caught by check-bundle.mjs's byte
// count, which explains nothing about WHY it grew.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");

let failures = 0;
const ok = (cond, msg) => {
  if (!cond) { console.error("check-creator-registry-bundle-wall: FAIL — " + msg); failures++; }
};

const HOME = read("app/home.js");
const BOOST = read("lib/creatorBoost.js");
const TREND = read("lib/trendSignal.js");
const RAIL_CARD = read("app/components/RailCard.js");
const CARD_MARK = read("app/components/CreatorCardMark.js");

// The eager-reachable consumers must import the LEAN modules, never the full
// registry (or, for CreatorCardMark, the platform constants must not come
// from the file that also carries the registry).
ok(/from\s+["']\.\.\/lib\/creatorSignals["']/.test(HOME),
  "app/home.js must import creatorVideosFor from lib/creatorSignals, not lib/creatorVideos");
ok(!/creatorVideosFor[^;]*from\s+["']\.\.\/lib\/creatorVideos["']/.test(HOME),
  "app/home.js must NOT import creatorVideosFor from lib/creatorVideos — that pulls the full ~56KB-gz registry onto the eager \"/\" bundle");

ok(/from\s+["']\.\/creatorSignals\.js["']/.test(BOOST),
  "lib/creatorBoost.js must import creatorVideosFor from ./creatorSignals.js, not ./creatorVideos.js — it runs eagerly app-wide via lib/lawfulOrder.js");
ok(!/from\s+["']\.\/creatorVideos\.js["']/.test(BOOST),
  "lib/creatorBoost.js must NOT import from ./creatorVideos.js");

ok(/creatorCountFor[^;]*from\s+["']\.\/creatorSignals\.js["']/.test(TREND),
  "lib/trendSignal.js must import creatorCountFor from ./creatorSignals.js, not ./creatorVideos.js — corroborationTrend() runs synchronously inside lib/lawfulOrder.js's governedScoreOf(), on every ranked row, app-wide");
ok(!/creatorCountFor[^;]*from\s+["']\.\/creatorVideos\.js["']/.test(TREND),
  "lib/trendSignal.js must NOT import creatorCountFor from ./creatorVideos.js");

ok(/creatorVideosFor[^;]*from\s+["']\.\.\/\.\.\/lib\/creatorSignals\.js["']/.test(RAIL_CARD),
  "app/components/RailCard.js must import creatorVideosFor from lib/creatorSignals.js — it is eager on \"/\" (app/home.js imports RailCard directly) and only needs .creator/.platform, never .url");

ok(/PLATFORM[^;]*from\s+["']\.\.\/\.\.\/lib\/creatorPlatforms["']/.test(CARD_MARK),
  "app/components/CreatorCardMark.js must import PLATFORM/PLATFORM_RGB from lib/creatorPlatforms, not lib/creatorVideos — it is eager on \"/\" and only needs these two small constants");
ok(!/from\s+["']\.\.\/\.\.\/lib\/creatorVideos["']/.test(CARD_MARK),
  "app/components/CreatorCardMark.js must NOT import from lib/creatorVideos");

// app/home.js's own display-only creator-finds computations (which DO need
// the full url-carrying registry) must live in the already-lazy sheet, not
// be precomputed eagerly on every homepage render.
ok(!/const\s+videoHeroPlaces\s*=\s*useMemo/.test(HOME),
  "app/home.js must not precompute videoHeroPlaces (moved to app/components/sheets/SocialFind.js, the only reader)");
ok(!/const\s+socialFindByCity\s*=\s*useMemo/.test(HOME),
  "app/home.js must not precompute socialFindByCity (moved to app/components/sheets/SocialFind.js)");
const SOCIAL_FIND = read("app/components/sheets/SocialFind.js");
ok(/const\s+videoHeroPlaces\s*=\s*useMemo/.test(SOCIAL_FIND),
  "app/components/sheets/SocialFind.js (next/dynamic, ssr:false) must compute videoHeroPlaces itself");
ok(/creatorVideosFor[^;]*from\s+["']\.\.\/\.\.\/\.\.\/lib\/creatorVideos["']/.test(SOCIAL_FIND),
  "app/components/sheets/SocialFind.js may freely import the FULL lib/creatorVideos — it is already next/dynamic(ssr:false), off the eager path");

// 2026-09-07 — SECOND PASS: the lean mirror itself got a compact ENCODING
// (positional tuples + a sentinel + a platform-interning table), not just a
// lean field set. The invariant this guard exists to hold widened along with
// it: it is no longer enough that the eager path avoids the full registry —
// it must consume ONLY the generated compact signal module, and that
// generated module must actually STAY compact, or the whole second saving
// regresses silently the next time someone "helpfully" reformats it.
ok(/from\s+["']\.\/creatorSignals\.js["']/.test(BOOST) && /from\s+["']\.\/creatorSignals\.js["']/.test(TREND),
  "the eager ranking path (lib/creatorBoost.js, lib/trendSignal.js) must consume ONLY the generated compact signal module (lib/creatorSignals.js), never lib/creatorVideos.js directly");

const GENERATED = read("lib/creatorSignalsData.generated.js");
ok(/export const PLATFORMS = \[/.test(GENERATED) && /export const LEAN_CURATED = \[/.test(GENERATED),
  "lib/creatorSignalsData.generated.js exports PLATFORMS and LEAN_CURATED — the compact tuple encoding scripts/gen-creator-signals.mjs writes");
// COMPACTNESS, asserted directly rather than trusted: a pretty-printed
// LEAN_CURATED (JSON.stringify(x, null, 2)) alone cost ~450 bytes gz for
// nothing — no human reads a generated file — and nothing else here would
// catch a reformat that silently gave that back. Two independent signals:
// no indentation before a LEAN_CURATED entry, and the whole array sits on
// very few lines relative to its entry count (a pretty-printed array spends
// several lines PER entry; a compact one spends a small constant number of
// lines total, regardless of corpus size).
ok(!/\n {2,}\[/.test(GENERATED) && !/\n {2,}"/.test(GENERATED.split("export const LEAN_CURATED")[1] || ""),
  "lib/creatorSignalsData.generated.js is NOT pretty-printed — LEAN_CURATED must be emitted as compact JSON.stringify(x), not JSON.stringify(x, null, 2), or the saving this guard exists to protect regresses silently");
const leanLines = GENERATED.split("\n").length;
ok(leanLines < 20,
  `lib/creatorSignalsData.generated.js is ${leanLines} lines for a ${(GENERATED.match(/\],\[/g) || []).length + 1}+ -entry corpus — a compact encoding stays on a handful of lines regardless of corpus size; this many lines means something is no longer compact`);

if (failures) process.exit(1);
console.log("check-creator-registry-bundle-wall: OK");
