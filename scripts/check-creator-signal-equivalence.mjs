// scripts/check-creator-signal-equivalence.mjs — 2026-09-07.
//
// lib/creatorSignalsData.generated.js changed encoding (pretty-printed object
// literals -> compact positional tuples with a 0-sentinel and an interned
// PLATFORMS table; see scripts/gen-creator-signals.mjs's header). This guard
// is the proof that the change is REPRESENTATION ONLY: every consumer of the
// lean mirror — lib/creatorBoost.js (reachOf, hasCreatorVideoAt,
// creatorBoostFor), lib/trendSignal.js (creatorCountFor, corroborationTrend,
// via lib/lawfulOrder.js's governedScoreOf on every ranked row app-wide),
// and app/components/CreatorCardMark.js's creatorHeads() (reached from
// app/home.js and app/components/RailCard.js) — computes IDENTICAL answers
// before and after, for the WHOLE curated corpus, not a sample.
//
// METHOD. Two independent systems, run side by side on the SAME real curated
// data (lib/creatorVideos.js's __CURATED_FOR_CODEGEN__):
//
//   OLD  — a from-scratch reference re-implementation of
//          lib/creatorVideos.js's actual resolver algorithm (same norm, same
//          cityMatches, same renderable, same two-pass place_id/name
//          resolution, same tiebreak), running directly over the FULL
//          registry's raw video objects (url, creator, platform, reach).
//          This file never imports anything from lib/creatorSignals.js for
//          the OLD side — it is a clean-room mirror, not a call-through.
//
//   NEW  — the REAL lib/creatorSignals.js (via its exported buildLeanResolver
//          factory and its default-instance exports), lib/creatorBoost.js,
//          lib/trendSignal.js, lib/lawfulOrder.js and
//          app/components/CreatorCardMark.js — production code, unmodified
//          by this guard.
//
// Every assertion compares an OLD-computed answer to a NEW-computed answer on
// the same probe place. Where the two systems' PURE downstream math is
// identical either way (wayfindScore, governedWayfindScore, computeTrendSignal,
// evidenceBoost, reachOf, meetsCreatorFloor), this guard imports and calls the
// REAL ones on both sides rather than re-deriving them, so only the part that
// actually changed — the resolver + its data encoding — is under test.
//
// SYNTHETIC FIXTURES, THROUGH THE REAL PIPELINE. A few of the required
// control cases (an entry whose videos are ALL staged; a staged video with a
// blank/whitespace url) do not exist in the CURRENT registry (v8.43 moved
// every staged entry out to lib/creatorVideosStaged.js — see
// scripts/test-creator-corroboration.mjs §9). Rather than fabricate a
// separate mirror of the encode/decode logic for those, this guard calls
// buildLeanCurated() (scripts/gen-creator-signals.mjs, the REAL encoder — it
// now accepts an optional CURATED override for exactly this reason) and
// buildLeanResolver() (lib/creatorSignals.js, the REAL decoder/resolver
// factory) directly on small synthetic CURATED-shaped arrays. That runs the
// PRODUCTION encode+decode+resolve code end to end on cases the committed
// data doesn't currently exercise, instead of asserting on a copy of it.
//
// RED-PROOFS. Five required failure modes are each proven detectable: a
// broken variant of the relevant computation is built (from the same real or
// synthetic fixtures) and asserted to DISAGREE with the correct value. This
// never mutates real module state — ESM bindings are read-only to importers,
// and there is no live production code to "restore" — it runs a second,
// intentionally-wrong, self-contained computation on the same inputs and
// shows the mismatch the equality assertions above would have caught.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLeanCurated } from "./gen-creator-signals.mjs";
import {
  buildLeanResolver,
  creatorVideosFor as newCreatorVideosFor,
  creatorCountFor as newCreatorCountFor,
} from "../lib/creatorSignals.js";
import {
  reachOf, creatorBoostFor, hasCreatorVideoAt, meetsCreatorFloor, evidenceBoost,
} from "../lib/creatorBoost.js";
import { computeTrendSignal, corroborationTrend, CORROBORATION_MIN_CREATORS } from "../lib/trendSignal.js";
import { governedScoreOf } from "../lib/lawfulOrder.js";
import { wayfindScore, governedWayfindScore } from "../lib/wayfindScore.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

let pass = 0;
let redProofs = 0;
const fail = (m) => { console.error("check-creator-signal-equivalence: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

/**
 * A red-proof: build a deliberately WRONG value from the same fixture the
 * correct assertions used, and prove it disagrees with the correct value —
 * i.e. that the equality checks above are not vacuous and really would have
 * failed had the real code regressed this way.
 */
const redProve = (brokenValue, correctValue, label) => {
  const b = JSON.stringify(brokenValue);
  const c = JSON.stringify(correctValue);
  if (b === c) {
    fail(`RED-PROOF DID NOT DETECT A BUG: ${label} — broken value (${b}) equals the correct value; the equivalence assertions would NOT have caught this regression`);
  }
  redProofs += 1;
  console.log(`  red-proof OK — ${label} (broken=${b}, correct=${c})`);
};

// ═══════════════════════════════════════════════════════════════════════════
// § 0. THE REAL CURATED CORPUS
// ═══════════════════════════════════════════════════════════════════════════
const registryMod = await import("../lib/creatorVideos.js");
const CURATED = registryMod.__CURATED_FOR_CODEGEN__;
ok(Array.isArray(CURATED) && CURATED.length > 200,
  `loaded the real curated corpus (${Array.isArray(CURATED) ? CURATED.length : "not an array"}) — a failed import would make every assertion below vacuous`);

// ═══════════════════════════════════════════════════════════════════════════
// § 1. THE OLD REFERENCE RESOLVER — clean-room, over the FULL registry
// ═══════════════════════════════════════════════════════════════════════════
const oldNorm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
function oldCityMatches(place, locName, city) {
  if (!city) return true;
  const hay = oldNorm([place && place.city, place && place.address, locName].filter(Boolean).join(" "));
  return hay.includes(oldNorm(city));
}
function oldRenderable(videos) {
  return (videos || []).filter((v) => v && typeof v.url === "string" && v.url.trim().length > 0);
}
function buildOldIndex(curated) {
  const byPlaceId = new Map();
  const byName = [];
  for (const e of curated) {
    if (e.placeId && !byPlaceId.has(String(e.placeId))) byPlaceId.set(String(e.placeId), e);
    if (e.match && e.match.name) {
      const cnm = oldNorm(e.match.name);
      if (cnm) byName.push({ e, cnm, len: cnm.length });
    }
  }
  return { byPlaceId, byName };
}
function oldResolveEntry(index, place, locName) {
  if (!place) return null;
  const pid = place.id != null ? String(place.id) : "";
  if (pid) {
    const hit = index.byPlaceId.get(pid);
    if (hit) return hit;
  }
  const nm = oldNorm(place.name);
  if (!nm) return null;
  let best = null, bestScore = 0;
  for (const idx of index.byName) {
    const at = nm.indexOf(idx.cnm);
    if (at < 0) continue;
    const score = (at === 0 ? 1000 : 0) + idx.len;
    if (score <= bestScore) continue;
    if (!oldCityMatches(place, locName, idx.e.match.city)) continue;
    best = idx.e; bestScore = score;
  }
  return best;
}
function oldVideosFor(index, place, locName) {
  const e = oldResolveEntry(index, place, locName);
  return e ? oldRenderable(e.videos) : [];
}
function oldCreatorCountFor(index, place, locName) {
  const seen = new Set();
  for (const v of oldVideosFor(index, place, locName)) if (v && v.creator) seen.add(oldNorm(v.creator));
  return seen.size;
}
function oldApplyCorroboration(index, p, locName) {
  if (!p || typeof p !== "object") return;
  if (p.kind === "experience") return;
  if (p.trending) return;
  const sig = computeTrendSignal({ corroborationCreators: oldCreatorCountFor(index, p, locName) });
  if (!sig.trending) return;
  p.trending = true;
  p.trend_reason = sig.trendReason;
}
const oldNum = (v) => (typeof v === "number" && isFinite(v) ? v : null);
function oldGovernedScoreOf(index, p, locName) {
  if (!p) return null;
  if (Number.isFinite(p.governed_score)) return p.governed_score;
  oldApplyCorroboration(index, p, locName);
  const dist = oldNum(p.distMi) != null ? oldNum(p.distMi) : oldNum(p.distance_mi);
  if (p.wfScore != null) {
    const video = oldVideosFor(index, p, locName).length > 0;
    return governedWayfindScore(p.wfScore, { hasCreatorVideo: video, distanceMi: dist, trending: !!p.trending });
  }
  const base = wayfindScore(p.rating, p.reviews);
  if (base == null) return null;
  const video = p.creator_video === true || oldVideosFor(index, p, locName).length > 0;
  return governedWayfindScore(base, { hasCreatorVideo: video, distanceMi: dist, trending: !!p.trending });
}

const OLD_INDEX = buildOldIndex(CURATED);

// ═══════════════════════════════════════════════════════════════════════════
// § 2. CORPUS-WIDE EQUIVALENCE — every entry, both resolution passes
// ═══════════════════════════════════════════════════════════════════════════
function expectedVideoField(oldV) {
  return {
    creator: oldV.creator || null,
    platform: oldV.platform || null,
    reach: (typeof oldV.reach === "number" && oldV.reach !== 0) ? oldV.reach : null,
  };
}
function assertVideosMatch(oldVideos, newVideos, label) {
  ok(oldVideos.length === newVideos.length,
    `${label}: video count matches (old ${oldVideos.length}, new ${newVideos.length})`);
  const n = Math.min(oldVideos.length, newVideos.length);
  for (let i = 0; i < n; i++) {
    const exp = expectedVideoField(oldVideos[i]);
    const got = newVideos[i];
    ok(got.creator === exp.creator, `${label}: video[${i}].creator matches ("${got.creator}" vs "${exp.creator}")`);
    ok(got.platform === exp.platform, `${label}: video[${i}].platform matches ("${got.platform}" vs "${exp.platform}")`);
    ok(got.reach === exp.reach, `${label}: video[${i}].reach matches (${got.reach} vs ${exp.reach})`);
  }
}

// Fixed synthetic quality so creatorBoostFor is comparable across the whole
// corpus purely on VIDEO EVIDENCE (both floor-passing and not, mixed below).
const Q_ABOVE_FLOOR = { rating: 4.6, reviews: 500 };

let probedByPlaceId = 0, probedByName = 0;
for (const e of CURATED) {
  if (e.placeId) {
    probedByPlaceId += 1;
    const probe = { id: e.placeId, name: "‡ guard non-matching name ‡", address: "Nowhere, ZZ", ...Q_ABOVE_FLOOR };
    const oldV = oldVideosFor(OLD_INDEX, probe);
    const newV = newCreatorVideosFor(probe);
    assertVideosMatch(oldV, newV, `placeId probe "${e.key}"`);
    ok((oldV.length > 0) === hasCreatorVideoAt(probe), `placeId probe "${e.key}": hasCreatorVideoAt matches`);
    ok(reachOf(oldV) === reachOf(newV), `placeId probe "${e.key}": reachOf matches (${reachOf(oldV)} vs ${reachOf(newV)})`);
    ok(oldCreatorCountFor(OLD_INDEX, probe) === newCreatorCountFor(probe), `placeId probe "${e.key}": creatorCountFor matches`);
    const oldBoost = oldV.length > 0 && meetsCreatorFloor(probe)
      ? evidenceBoost(wayfindScore(probe.rating, probe.reviews), reachOf(oldV)) : 0;
    ok(oldBoost === creatorBoostFor(probe), `placeId probe "${e.key}": creatorBoostFor matches (${oldBoost} vs ${creatorBoostFor(probe)})`);
  }
  if (e.match && e.match.name) {
    probedByName += 1;
    const city = e.match.city || "";
    const probe2 = { name: e.match.name, address: city, city, ...Q_ABOVE_FLOOR };
    const oldV2 = oldVideosFor(OLD_INDEX, probe2, city);
    const newV2 = newCreatorVideosFor(probe2, city);
    assertVideosMatch(oldV2, newV2, `name probe "${e.key}"`);
    const oldCorrob = computeTrendSignal({ corroborationCreators: oldCreatorCountFor(OLD_INDEX, probe2, city) });
    const newCorrob = corroborationTrend({ ...probe2 }, city);
    ok(newCorrob.trending === oldCorrob.trending, `name probe "${e.key}": corroborationTrend.trending matches`);
    ok(newCorrob.trend_reason === (oldCorrob.trending ? oldCorrob.trendReason : null),
      `name probe "${e.key}": corroborationTrend.trend_reason matches`);
  }
}
ok(probedByPlaceId > 100, `probed a real number of placeId entries (${probedByPlaceId})`);
ok(probedByName > 300, `probed a real number of name entries (${probedByName})`);
console.log(`§2 corpus-wide equivalence: OK — ${probedByPlaceId} placeId probes, ${probedByName} name probes, ${pass} assertions so far`);

// ═══════════════════════════════════════════════════════════════════════════
// § 3. EXPLICIT TRICKY CONTROLS — one assertion block per control
// ═══════════════════════════════════════════════════════════════════════════

// ── a live video with NO creator (mai-kai-fort-lauderdale) ─────────────────
{
  const probe = { name: "Mai-Kai", city: "Fort Lauderdale", address: "Fort Lauderdale" };
  const v = newCreatorVideosFor(probe, "Fort Lauderdale");
  ok(v.length === 1 && v[0].creator === null, "CONTROL — unattributed live video: creator decodes to null, not a fabricated handle");
  ok(newCreatorCountFor(probe, "Fort Lauderdale") === 0, "CONTROL — unattributed video contributes 0 to creatorCountFor (counts for nothing)");
  ok(hasCreatorVideoAt(probe) === true, "CONTROL — but it STILL counts as \"has a video\" for the ranking boost");
}

// ── a live video with NULL reach (spinning-coffee-bradenton) ───────────────
{
  const probe = { id: "ChIJIQGDwpgXw4gRxIJcGmjtyK4" };
  const v = newCreatorVideosFor(probe);
  ok(v.length === 1 && v[0].reach === null, "CONTROL — null reach decodes to null, not 0-as-a-value");
  ok(reachOf(v) === 0, "CONTROL — reachOf() of a null-reach-only video array is 0 (its max-starts-at-0 floor), same as before");
}

// ── multiple videos from the SAME creator (cococello-st-petersburg) ────────
{
  const probe = { name: "Cococello", city: "St. Petersburg", address: "St. Petersburg" };
  const v = newCreatorVideosFor(probe, "St. Petersburg");
  ok(v.length === 2, "CONTROL — cococello-st-petersburg really does carry 2 videos (fixture sanity)");
  ok(newCreatorCountFor(probe, "St. Petersburg") === 1, "CONTROL — 2 posts by ONE creator count as 1 creator, not 2");
  const { creatorHeads } = await loadComponent(fileURLToPath(new URL("../app/components/CreatorCardMark.js", import.meta.url)), REPO);
  const heads = creatorHeads(v);
  ok(heads.length === 1, "CONTROL — CreatorCardMark.creatorHeads() also shows ONE face for one creator's two posts");
}

// ── multiple INDEPENDENT creators (atomic-cat-st-petersburg) ───────────────
{
  const probe = { id: "ChIJSbDatOjnwogRLPoi6_FtJrM" };
  ok(newCreatorCountFor(probe, "St. Petersburg") >= 2, "CONTROL — atomic-cat-st-petersburg has 2+ distinct creators");
  const trend = corroborationTrend(probe, "St. Petersburg");
  ok(trend.trending === true && typeof trend.trend_reason === "string",
    "CONTROL — 2+ independent creators fires corroboration/trending, with a disclosed reason");
}

// ── a staged video with blank url — never counts (synthetic; none in the
//    committed data any more, see scripts/test-creator-corroboration.mjs §9) ─
const SYN_STAGED_ONLY = {
  key: "syn-staged-only", placeId: "SYN-STAGED-PID",
  match: { name: "Synthetic Staged Cafe", city: "Testville" },
  videos: [
    { platform: "tiktok", url: "", creator: "ghostcreator", reach: 9999 },
    { platform: "instagram", url: "   ", creator: "ghostcreator2", reach: 8888 }, // whitespace-only — must ALSO not count
  ],
};
// ── an entry whose videos are ALL staged — still indexed, still returns [] ──
// Paired with a SHORTER, live-video entry whose name is a SUBSTRING of the
// staged one's, so "still indexed" is actually load-bearing: if the
// all-staged entry were dropped from the index, this probe would fall
// through to the shorter competitor and wrongly return ITS video instead of
// the correct empty result.
const SYN_ALL_STAGED_LONG = {
  key: "syn-all-staged-long", placeId: null,
  match: { name: "Synthetic Staged Bistro Deluxe", city: "Testville" },
  videos: [
    { platform: "tiktok", url: "", creator: "staged1" },
    { platform: "instagram", url: "", creator: "staged2" },
  ],
};
const SYN_SHORT_LIVE_COMPETITOR = {
  key: "syn-short-live-competitor", placeId: null,
  match: { name: "Bistro", city: "Testville" },
  videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@realcreator/video/1", creator: "realcreator", reach: 500 }],
};
const SYN_ZERO_REACH = {
  key: "syn-zero-reach", placeId: "SYN-ZERO-PID",
  match: { name: "Synthetic Zero Reach Diner", city: "Testville" },
  videos: [{ platform: "tiktok", url: "https://x.example/zero", creator: "zeroreacher", reach: 0 }],
};
const SYN_FALSY_PLATFORM = {
  key: "syn-falsy-platform", placeId: "SYN-FALSY-PID",
  match: { name: "Synthetic Falsy Platform Spot", city: "Testville" },
  videos: [{ platform: "", url: "https://x.example/falsy", creator: "noplatformcreator" }],
};
const SYN_CURATED = [SYN_STAGED_ONLY, SYN_ALL_STAGED_LONG, SYN_SHORT_LIVE_COMPETITOR, SYN_ZERO_REACH, SYN_FALSY_PLATFORM];

// Run the REAL production encode (buildLeanCurated) and REAL production
// decode/resolve (buildLeanResolver) end to end over this synthetic corpus —
// not a mirror of the logic, the actual functions scripts/gen-creator-signals.mjs
// and lib/creatorSignals.js export.
const synLean = await buildLeanCurated(SYN_CURATED);
const synResolver = buildLeanResolver(synLean.entries, synLean.platforms);
const synOldIndex = buildOldIndex(SYN_CURATED);

{
  const probe = { id: "SYN-STAGED-PID" };
  const oldV = oldVideosFor(synOldIndex, probe);
  const newV = synResolver.creatorVideosFor(probe);
  ok(oldV.length === 0 && newV.length === 0,
    "CONTROL — a staged video (blank OR whitespace-only url) never counts, in either system");
  ok(synResolver.hasCreatorVideoAtLean(probe) === false, "CONTROL — …and hasCreatorVideoAtLean agrees");
}
{
  const probe = { name: "Synthetic Staged Bistro Deluxe", city: "Testville", address: "Testville" };
  const oldV = oldVideosFor(synOldIndex, probe, "Testville");
  const newV = synResolver.creatorVideosFor(probe, "Testville");
  ok(oldV.length === 0, "CONTROL — OLD: an all-staged entry still WINS the name contest (its own full name beats the shorter substring) and correctly returns []");
  ok(newV.length === 0, "CONTROL — NEW: same — the all-staged entry is NOT dropped from the index, so it still wins and still returns [], never falling through to the shorter live competitor");
  // Prove the "still indexed" half directly: the competitor's OWN name still
  // resolves to the competitor (the index isn't broken generally), only the
  // longer staged name's own probe is what must resolve to emptiness.
  const competitorProbe = { name: "Bistro", city: "Testville", address: "Testville" };
  ok(synResolver.creatorVideosFor(competitorProbe, "Testville").length === 1,
    "CONTROL — the shorter live competitor is still independently reachable by its own name");
}
{
  const probe = { id: "SYN-ZERO-PID" };
  const newV = synResolver.creatorVideosFor(probe);
  ok(newV.length === 1 && newV[0].reach === null,
    "DECISION — a genuine reach of 0 decodes to null (collapsed with the sentinel) — documented in scripts/gen-creator-signals.mjs's header");
  ok(reachOf(newV) === reachOf(oldVideosFor(synOldIndex, probe)),
    "DECISION — …and reachOf() agrees regardless (0 and null both leave a max-starting-at-0 unchanged), so no consumer can tell the difference");
}
{
  const probe = { id: "SYN-FALSY-PID" };
  const newV = synResolver.creatorVideosFor(probe);
  ok(newV[0].platform === null, "CONTROL — a falsy source platform decodes back to null (the \"\" PLATFORMS entry round-trips to falsy)");
  const { creatorHeads } = await loadComponent(fileURLToPath(new URL("../app/components/CreatorCardMark.js", import.meta.url)), REPO);
  const heads = creatorHeads(newV);
  ok(heads[0].platform === "tiktok", "CONTROL — …and creatorHeads()'s `v.platform || \"tiktok\"` default fires identically to a decoded null");
}

// ── exact place_id beats an available (misleading) name match ──────────────
// ── longest valid name match wins (prefix over substring) ──────────────────
// ── wrong-city name collision is rejected ───────────────────────────────────
// All three use the real "PASTA" / "Borti Pasta Bar" collision, deliberately
// ordered in the registry so a first-match-wins bug would misattribute it
// (see lib/creatorVideos.js's own comment on the pair).
const BORTI_PID = "ChIJy5C9Qk2x2YgRe4lg1zuS8iA";
const PASTA_PID = "ChIJN_06nHi32YgRySCC7mR6HUM";
{
  const probe = { id: BORTI_PID, name: "PASTA", address: "Miami" }; // misleading name, real id
  const oldV = oldVideosFor(OLD_INDEX, probe);
  const newV = newCreatorVideosFor(probe);
  ok(oldV.length === 1 && oldV[0].reach === 2400 && newV.length === 1 && newV[0].reach === 2400,
    "CONTROL — exact place_id (Borti) wins over an available, misleading name match (PASTA) — both systems agree");
}
{
  const probe = { name: "Borti Pasta Bar", address: "Miami" };
  const oldV = oldVideosFor(OLD_INDEX, probe, "Miami");
  const newV = newCreatorVideosFor(probe, "Miami");
  ok(oldV.length === 1 && oldV[0].reach === 2400 && newV.length === 1 && newV[0].reach === 2400,
    "CONTROL — longest valid name match wins: \"Borti Pasta Bar\" resolves to Borti (prefix), not to the shorter \"PASTA\" it contains — both systems agree");
}
{
  const probe = { name: "Borti Pasta Bar", address: "Orlando" }; // right name, WRONG city
  const oldV = oldVideosFor(OLD_INDEX, probe, "Orlando");
  const newV = newCreatorVideosFor(probe, "Orlando");
  ok(oldV.length === 0 && newV.length === 0,
    "CONTROL — a wrong-city name collision is rejected by the city gate in both systems (Borti is Miami-only)");
}
console.log(`§3 explicit tricky controls: OK — ${pass} assertions so far`);

// ═══════════════════════════════════════════════════════════════════════════
// § 4. creatorHeads() — CreatorCardMark's own dedupe rule, per video
// ═══════════════════════════════════════════════════════════════════════════
{
  const { creatorHeads } = await loadComponent(fileURLToPath(new URL("../app/components/CreatorCardMark.js", import.meta.url)), REPO);
  // Atomic Cat: two DIFFERENT creators -> two heads, original casing kept,
  // first-occurrence order preserved.
  const acVideos = newCreatorVideosFor({ id: "ChIJSbDatOjnwogRLPoi6_FtJrM" });
  const acOldVideos = oldVideosFor(OLD_INDEX, { id: "ChIJSbDatOjnwogRLPoi6_FtJrM" });
  const newHeads = creatorHeads(acVideos).map((h) => ({ handle: h.handle, platform: h.platform }));
  const oldHeads = creatorHeads(acOldVideos).map((h) => ({ handle: h.handle, platform: h.platform }));
  ok(JSON.stringify(newHeads) === JSON.stringify(oldHeads),
    `creatorHeads() agrees old vs new for atomic-cat-st-petersburg (${JSON.stringify(newHeads)} vs ${JSON.stringify(oldHeads)})`);
  ok(newHeads.length === 2, "atomic-cat-st-petersburg really has 2 distinct heads");
}
console.log(`§4 creatorHeads equivalence: OK — ${pass} assertions so far`);

// ═══════════════════════════════════════════════════════════════════════════
// § 5. RANKED-LIST EQUIVALENCE — governedScoreOf, two representative lists
// ═══════════════════════════════════════════════════════════════════════════
function assertSameOrder(rowsForNew, rowsForOld, locName, label) {
  const newScored = rowsForNew.map((p) => ({ id: p.id || p.name, score: governedScoreOf(p, locName) }));
  const oldScored = rowsForOld.map((p) => ({ id: p.id || p.name, score: oldGovernedScoreOf(OLD_INDEX, p, locName) }));
  for (let i = 0; i < newScored.length; i++) {
    ok(newScored[i].score === oldScored[i].score,
      `${label}: governedScoreOf("${newScored[i].id}") matches (${newScored[i].score} vs ${oldScored[i].score})`);
  }
  const newOrder = newScored.slice().sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)).map((r) => r.id);
  const oldOrder = oldScored.slice().sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)).map((r) => r.id);
  ok(JSON.stringify(newOrder) === JSON.stringify(oldOrder),
    `${label}: ranked ORDER matches (${JSON.stringify(newOrder)} vs ${JSON.stringify(oldOrder)})`);
}
const clone = (rows) => rows.map((r) => ({ ...r }));

// List A — Orlando: a mix of place_id-attributed, no-video, near and far.
const listA = [
  { id: "ChIJ1RqNFQB954gR3YpxvP7m-Gs", name: "Jabal Coffee House", rating: 4.6, reviews: 300, distance_mi: 2, kind: "place" },
  { id: "ChIJIQE2BMF954gRRQ97-X89_G0", name: "Dolce", rating: 4.3, reviews: 150, distance_mi: 10, kind: "place" },
  { id: "guard-syn-control-a1", name: "Guard Synthetic Control A1", rating: 4.9, reviews: 1000, distance_mi: 1, kind: "place" },
  { id: "guard-syn-control-a2", name: "Guard Synthetic Control A2", rating: 4.0, reviews: 50, distance_mi: 25, kind: "place" },
];
assertSameOrder(clone(listA), clone(listA), "Orlando", "List A (Orlando)");

// List B — Tampa Bay: corroborated places (2+ creators), a video with an
// unattributed creator (no corroboration boost, still a video boost), and an
// unfilmed control.
const listB = [
  { id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru", rating: 4.6, reviews: 900, distance_mi: 3, kind: "place" },
  { id: "ChIJSbDatOjnwogRLPoi6_FtJrM", name: "Atomic Cat", rating: 4.5, reviews: 400, distance_mi: 5, kind: "place" },
  { name: "Mai-Kai", city: "Fort Lauderdale", rating: 4.7, reviews: 800, distance_mi: 40, kind: "place" },
  { id: "guard-syn-control-b1", name: "Guard Synthetic Control B1", rating: 4.8, reviews: 700, distance_mi: 1, kind: "place" },
];
assertSameOrder(clone(listB), clone(listB), "Fort Lauderdale", "List B (Tampa Bay + Mai-Kai)");
console.log(`§5 ranked-list equivalence: OK — ${pass} assertions so far`);

// ═══════════════════════════════════════════════════════════════════════════
// § 6. RED-PROOFS — prove the equality checks above are not vacuous
// ═══════════════════════════════════════════════════════════════════════════
console.log("§6 red-proofs:");

// RP1 — counting a staged/non-live video.
{
  const correctVideos = synResolver.creatorVideosFor({ id: "SYN-STAGED-PID" });
  const brokenVideos = SYN_STAGED_ONLY.videos.map((v) => ({ creator: v.creator || null, platform: v.platform || null, reach: v.reach ?? null }));
  redProve(brokenVideos.length, correctVideos.length,
    "a resolver that forgot to filter staged (blank-url) videos would show 2 videos instead of the correct 0 for syn-staged-only");
}

// RP2 — summing reach across videos instead of taking the max.
{
  const trVideos = newCreatorVideosFor({ id: "ChIJqZppyNO72YgRGGXMaUINCMM" }); // tres-leches-factory-doral: 6900 + 4572
  const correctReach = reachOf(trVideos);
  const brokenSummedReach = trVideos.reduce((s, v) => s + (typeof v.reach === "number" ? v.reach : 0), 0);
  ok(correctReach === 6900, "sanity: tres-leches-factory-doral's real max reach is 6900 (fixture assumption holds)");
  redProve(brokenSummedReach, correctReach,
    "summing reach across a place's videos instead of taking reachOf()'s max would show 11472 instead of the correct 6900 for tres-leches-factory-doral");
}

// RP3 — counting two posts by one creator as two creators.
{
  const probe = { name: "Cococello", city: "St. Petersburg", address: "St. Petersburg" };
  const correctCount = newCreatorCountFor(probe, "St. Petersburg");
  const brokenPostCount = newCreatorVideosFor(probe, "St. Petersburg").length; // raw video count, not distinct creators
  ok(correctCount === 1, "sanity: cococello-st-petersburg's real distinct-creator count is 1 (fixture assumption holds)");
  redProve(brokenPostCount, correctCount,
    "counting raw VIDEO count instead of DISTINCT creators would show 2 instead of the correct 1 for cococello-st-petersburg (one creator, two posts)");
}

// RP4 — breaking place_id precedence (checking name before place_id).
{
  const probe = { id: BORTI_PID, name: "PASTA", address: "Miami" };
  const correctVideos = newCreatorVideosFor(probe); // PASS 1 (place_id) wins -> Borti's own video, reach 2400
  const correctReach = reachOf(correctVideos);
  // A broken resolver that tries the NAME pass first: "PASTA" matches
  // literally (at===0), so it would return PASTA's video (reach 3400)
  // instead of Borti's (reach 2400), even though a real place_id was given.
  const brokenVideos = newCreatorVideosFor({ name: probe.name, address: probe.address }, "Miami");
  const brokenReach = reachOf(brokenVideos);
  ok(correctReach === 2400, "sanity: Borti's real reach is 2400 (fixture assumption holds)");
  redProve(brokenReach, correctReach,
    "checking the NAME pass before the place_id pass would resolve this probe to PASTA's video (reach 3400) instead of the correct place_id match, Borti's (reach 2400)");
}

// RP5 — dropping the city gate.
{
  const rightProbe = { name: "Borti Pasta Bar", address: "Miami" };
  const wrongCityProbe = { name: "Borti Pasta Bar", address: "Orlando" };
  const correctVideos = newCreatorVideosFor(wrongCityProbe, "Orlando"); // city gate rejects -> []
  // A broken resolver that skips cityMatches() entirely would resolve the
  // wrong-city probe exactly like the right-city one.
  const brokenVideos = newCreatorVideosFor(rightProbe, "Miami");
  ok(correctVideos.length === 0, "sanity: the wrong-city probe really is rejected (fixture assumption holds)");
  redProve(brokenVideos.length, correctVideos.length,
    "skipping the city gate would resolve a Miami-only entry for an Orlando probe just as readily as for a Miami one — 1 video instead of the correct 0");
}

ok(redProofs === 5, `all 5 required red-proofs ran and detected their bug (${redProofs})`);
console.log(`check-creator-signal-equivalence: OK — ${pass} assertions, ${redProofs} red-proofs, ${probedByPlaceId + probedByName} corpus probes`);
