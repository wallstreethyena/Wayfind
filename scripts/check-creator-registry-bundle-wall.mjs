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

// 2026-10-01: IconicPlaceCard is lazy on "/" (DaypartRail / ThemeParkRail
// next/dynamic) but renders near the fold; pulling the full registry into its
// chunk delayed the first theme-park card. Same lean import as RailCard.
const ICONIC = read("app/components/IconicPlaceCard.js");
ok(/creatorVideosFor[^;]*from\s+["']\.\.\/\.\.\/lib\/creatorSignals\.js["']/.test(ICONIC) && !/from\s+["']\.\.\/\.\.\/lib\/creatorVideos(\.js)?["']/.test(ICONIC),
  "app/components/IconicPlaceCard.js must import creatorVideosFor from lib/creatorSignals.js, never lib/creatorVideos (its badge only needs .creator/.platform)");
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

// 2026-10-01 — THIRD PASS (issue #1480, homepage headroom). IconicPlaceCard is
// a "use client" component that app/page.js reaches through lib/landing.js's
// server-rendered proof block, so it ships in the "/" initial chunk set — and
// it imported the FULL registry for a mark that reads only .creator/.platform.
// That alone put the whole ~34KB-gz registry on "/" (498.3 -> 466.9KB gz when
// it moved to the lean mirror). Assert the TRANSITIVE static import closure,
// not one file: a single new import anywhere under the card would put it back.
import { existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
const stripCode = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const resolveSpec = (from, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = resolvePath(dirname(from), spec);
  for (const c of [base, base + ".js", base + ".mjs", base + "/index.js"]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
};
const staticImports = (file) => {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  const src = stripCode(readFileSync(file, "utf8"));
  let m;
  while ((m = re.exec(src))) { const r = resolveSpec(file, m[1] || m[2]); if (r) out.push(r); }
  return out;
};
const REGISTRY = resolvePath(ROOT, "lib/creatorVideos.js");
const closureOf = (entry) => {
  const seen = new Set([entry]); const parent = new Map(); const q = [entry];
  while (q.length) {
    const f = q.shift();
    for (const r of staticImports(f)) if (!seen.has(r)) { seen.add(r); parent.set(r, f); q.push(r); }
  }
  return { seen, parent };
};
const EAGER_ENTRIES = ["app/components/IconicPlaceCard.js", "app/components/CreatorCardMark.js", "app/components/ProofVeil.js"];
let closureFiles = 0;
for (const e of EAGER_ENTRIES) {
  const { seen, parent } = closureOf(resolvePath(ROOT, e));
  closureFiles += seen.size;
  if (seen.has(REGISTRY)) {
    const chain = []; for (let c = REGISTRY; c; c = parent.get(c)) chain.push(c.replace(ROOT, ""));
    ok(false, e + " statically reaches lib/creatorVideos.js (" + chain.join(" <- ") + ") — it is eager on \"/\" (app/page.js -> lib/landing.js renders it), which ships the whole video registry; use lib/creatorSignals.js");
  }
}
// Positive control: the walker MUST find the registry from a file known to
// import it (SocialFind), or "0 hits" above means nothing.
ok(closureOf(resolvePath(ROOT, "app/components/sheets/SocialFind.js")).seen.has(REGISTRY),
  "closure walker positive control failed: SocialFind.js imports lib/creatorVideos but the walk did not reach it");
const ICONIC = stripCode(read("app/components/IconicPlaceCard.js"));
ok(/import\s*\{[^}]*\bcreatorVideosFor\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/creatorSignals(?:\.js)?["']/.test(ICONIC),
  "IconicPlaceCard must import creatorVideosFor from lib/creatorSignals(.js)");
ok(/creatorVideos\s*=\s*creatorVideosFor\(place\)/.test(ICONIC) && /<CreatorCardMark\s+videos=\{creatorVideos\}/.test(ICONIC),
  "IconicPlaceCard must still resolve creatorVideosFor(place) and render <CreatorCardMark videos={creatorVideos}>");
// CALL, not string: the lean resolver the card now uses must give CreatorCardMark
// the SAME heads as the full registry for every curated place (placeId path
// AND name+city path). creatorHeads reads only .creator/.platform.
{
  const full = await import("../lib/creatorVideos.js");
  const lean = await import("../lib/creatorSignals.js");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const { creatorHeads } = await loadComponent(fileURLToPath(new URL("../app/components/CreatorCardMark.js", import.meta.url)), ROOT.replace(/\/$/, ""));
  ok(typeof creatorHeads === "function", "CreatorCardMark must export creatorHeads (equivalence probe)");
  let probes = 0;
  for (const e of full.__CURATED_FOR_CODEGEN__) {
    const places = [];
    if (e.placeId) places.push({ id: e.placeId, name: "x" });
    if (e.match && e.match.name) places.push({ id: "none", name: e.match.name, city: e.match.city });
    for (const pl of places) {
      probes++;
      const a = JSON.stringify(creatorHeads(full.creatorVideosFor(pl)));
      const b = JSON.stringify(creatorHeads(lean.creatorVideosFor(pl)));
      ok(a === b, "creatorHeads differ full vs lean for " + e.key + ": " + a + " vs " + b);
    }
  }
  ok(probes > 300, "equivalence probe ran on only " + probes + " places — corpus read is broken");
  ok(JSON.stringify(creatorHeads(lean.creatorVideosFor({ id: "ChIJlbfJX1HPwogRvvfHRiaRQkA", name: "x" }))) !== "[]",
    "positive control: lean resolver must find a head for a known curated place_id");
  ok(JSON.stringify(creatorHeads(lean.creatorVideosFor({ id: "nope", name: "Zzz Not A Place" }))) === "[]",
    "negative control: lean resolver must return no heads for an unknown place");
  console.log("check-creator-registry-bundle-wall: IconicPlaceCard/CreatorCardMark/ProofVeil closures (" + closureFiles + " files) never reach lib/creatorVideos.js; " + probes + " lean-vs-full head probes equal");
}

if (failures) process.exit(1);
console.log("check-creator-registry-bundle-wall: OK");
