// scripts/check-score-law.mjs — THE GOVERNING LAW, locked.
//
// Owner directive, verbatim (2026-08-07): "If there is an influencer video, I
// want that to add a zero point seven to the score… if the place is greater
// than seventeen miles away, I want a zero point two deduction… It needs to
// be the governing rule for the Wayfind score… everywhere that we're
// presenting options, it needs to be ranked by the Wayfind score."
//
// This guard exists so the law cannot rot the way its predecessors did: the
// 2026-08-07 Bradenton screenshot showed a chip reading 9.2 rendered BELOW
// two chips reading 9.0, because a hidden per-mile decay reordered the list
// against the number it printed. Every assertion here fails the build on the
// pattern, not the instance.
import { governedWayfindScore, wayfindScore, CREATOR_VIDEO_BONUS, FAR_MILES, FAR_PENALTY, TRENDING_BONUS, TRENDING_CAP } from "../lib/wayfindScore.js";
import { displayedWfScore } from "../lib/creatorBoost.js";
import { byVisibleScore } from "../lib/todaysBest.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-score-law: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── 1. The constants are the owner's numbers, in one place ──────────────────
ok(CREATOR_VIDEO_BONUS === 7, "+0.7 shown: CREATOR_VIDEO_BONUS is 7 on the 0–100 scale");
ok(FAR_MILES === 17 && FAR_PENALTY === 2, "−0.2 shown strictly past 17 miles: FAR_MILES 17, FAR_PENALTY 2");

// ── 2. The arithmetic, on the owner's own examples ──────────────────────────
ok(governedWayfindScore(90, { hasCreatorVideo: true }) === 97, "a 9.0 with a video shows 9.7");
ok(governedWayfindScore(92, { distanceMi: 20 }) === 90, "a 9.2 past 17 miles shows 9.0");
ok(governedWayfindScore(92, { distanceMi: 17 }) === 92, "17.0 exactly is not past 17");
ok(governedWayfindScore(90, { hasCreatorVideo: true, distanceMi: 25 }) === 95, "terms stack: +7 − 2");
ok(governedWayfindScore(98, { hasCreatorVideo: true }) === 100, "clamped at 100");
ok(governedWayfindScore(null, { hasCreatorVideo: true }) === null, "unrated stays null");
ok(governedWayfindScore(90, { distanceMi: null }) === 90, "unknown distance takes no deduction");

// ── 2b. THE TRENDING COMPONENT (owner-approved 2026-08-07) ──────────────────
// +0.6 shown, from REAL demand data only (lib/trendSignal.js — its own guard,
// check-trend-signal.mjs, bans monetized inputs), bounded, and disclosed.
ok(TRENDING_BONUS === 6, "+0.6 shown: TRENDING_BONUS is 6 on the 0–100 scale");
ok(TRENDING_CAP === 99, "the trending term alone may not mint a 10.0 — capped at 99 internal / 9.9 shown");
ok(governedWayfindScore(90, { trending: true }) === 96, "the owner's example: a 9.0 trending shows 9.6");
ok(governedWayfindScore(95, { trending: true }) === 99, "bounded: 9.5 trending caps at 9.9, never 10.1");
ok(governedWayfindScore(96, { trending: false }) === 96, "not trending → no bump");
ok(governedWayfindScore(96, {}) === 96, "absent signal is identical to not trending (fail-soft)");
ok(governedWayfindScore(null, { trending: true }) === null, "unrated stays null — trending cannot invent a score");
ok(governedWayfindScore(98, { hasCreatorVideo: true, trending: true }) === 100,
  "the cap never SUBTRACTS: a 98+video already at 100 keeps 100 when it also trends");
ok(governedWayfindScore(90, { hasCreatorVideo: true, trending: true, distanceMi: 25 }) === 99,
  "terms stack: 90 +7 video −2 far = 95, then trending +6 caps at 99 — trending can never be the term that mints a 10.0");

// Shown == sorted WITH the trending term: byVisibleScore reads r.trending
// (attached by lib/trendSignal.js before the sort) into the same governed
// number the chip renders — a trending 9.0 (→9.6) must outrank a plain 9.4.
{
  const rows = [
    { id: "plain", name: "plain", rating: 4.8, reviews: 4000, distance_mi: 3 },
    { id: "hot", name: "hot", rating: 4.6, reviews: 3000, distance_mi: 3, trending: true, trend_reason: "Trending with locals" },
  ];
  const out = byVisibleScore(rows.map((r) => ({ ...r })));
  const hot = out.find((r) => r.id === "hot");
  ok(hot.governed_score === governedWayfindScore(wayfindScore(4.6, 3000), { trending: true }),
    "the carried governed_score includes the trending bump — the sort key IS the shown number");
  for (let i = 1; i < out.length; i++) {
    ok((out[i - 1].governed_score ?? -Infinity) >= (out[i].governed_score ?? -Infinity),
      "with trending in play the list stays monotonic in the displayed score");
  }
}

// ── 2c. THE DISCLOSURE (the condition the bump exists under) ────────────────
// Every surface that ranks through byVisibleScore renders the 🔥 reason when
// a row carries the bump. Assert the RENDER POSITION (role, not substring):
// a conditional on the row's trending flag emitting the reason.
{
  const bn = readFileSync(path.resolve("app/components/BestNearby.js"), "utf8");
  ok(/\{p\.trending \? <Flame reason=\{p\.trend_reason\} \/> : null\}/.test(bn) &&
     /\{r\.trending \? <Flame reason=\{r\.trend_reason\} \/> : null\}/.test(bn),
    "BestNearby: BOTH ranked row types (eat + todo) render the 🔥 flame off the row's own trending flag");
  ok((bn.match(/<TrendReason r=\{[pr]\} \/>/g) || []).length >= 2,
    "BestNearby: the visible reason renders beside the score chip on both row types");
  const ttd = readFileSync(path.resolve("app/components/ThingsToDoList.js"), "utf8");
  ok(/r\.trending && r\.trend_reason \?/.test(ttd), "ThingsToDoList: the reason chip renders off the row's trending flag");
  ok(/Number\.isFinite\(r\.governed_score\)\s*\n?\s*\? toDisplayScore\(r\.governed_score\)/.test(ttd),
    "ThingsToDoList: the badge shows governed_score — the number that sorted the row — not a re-derived base");
  const tb = readFileSync(path.resolve("app/components/TodaysBest.js"), "utf8");
  ok(/p\.trending && p\.trend_reason \?/.test(tb), "TodaysBest: the reason renders beside the chip");
  const tbl = readFileSync(path.resolve("lib/todaysBest.js"), "utf8");
  ok(/trending: !!r\.trending/.test(tbl), "byVisibleScore passes the row's trending flag into the governed score");
  ok((tbl.match(/await attachTrendSignals\(/g) || []).length >= 2,
    "BOTH fetchers (fetchTodaysBest + fetchThingsToDo) attach the unified signal BEFORE the sort — count, don't grep (one dropped call site must go red)");
}

// ── 2d. THE ROLLOUT SURFACES (2026-08-07, owner: "every sheet and page") ────
// /trending, intent pages and their shared card apply the SAME signal, the
// SAME bump, and the SAME disclosure.
{
  const ipc = readFileSync(path.resolve("app/components/IconicPlaceCard.js"), "utf8");
  ok(/Number\.isFinite\(place\.governed_score\) \? place\.governed_score/.test(ipc),
    "IconicPlaceCard badge prefers governed_score — the number that ranked the row");
  ok(/place\.trending && place\.trend_reason \?/.test(ipc),
    "IconicPlaceCard renders the 🔥 trend reason in its facts row (the disclosure)");
  const tnc = readFileSync(path.resolve("app/components/TrendingNowClient.js"), "utf8");
  ok(/await attachTrendSignals\(withWhy/.test(tnc) && /byVisibleScore\(withWhy\)/.test(tnc),
    "/trending attaches the unified signal and stamps governed_score before render");
  ok(/Number\.isFinite\(r\.governed_score\) \? r\.governed_score/.test(tnc),
    "/trending's Top-rated sort reads the governed score — shown == sorted");
  const ipcl = readFileSync(path.resolve("app/components/IntentPageClient.js"), "utf8");
  ok(/await attachTrendSignals\(flatRows/.test(ipcl), "intent pages attach the signal BEFORE rankRows");
  ok(/r\.trending \? 6 : 0/.test(ipcl), "intent pages' client re-sort carries the same +6 the rank key applied");
  const ip = readFileSync(path.resolve("lib/intentPages.js"), "utf8");
  ok(/r\.trending \? TRENDING_BONUS \/ 10 : 0/.test(ip), "rankRows applies the trending term on its /10 scale");
}
// rankRows, EXECUTED: identical twins, one trending — the trending one leads.
{
  const { rankRows } = await import(path.resolve("lib/intentPages.js").startsWith("/") ? "../lib/intentPages.js" : "../lib/intentPages.js");
  const twin = (id, extra) => ({ id, name: id, rating: 4.6, reviews: 2000, lat: 27.4, lng: -82.6, ...extra });
  const out = rankRows([twin("plain"), twin("hot", { trending: true, trend_reason: "Trending with locals" })], { rating: 4, reviews: 10 });
  ok(out.length === 2 && out[0].id === "hot",
    "rankRows: a trending row outranks its identical twin (and only by the disclosed +0.6)");
}

// ── 2e. THE HOME FEED (2026-08-08, owner: "every sheet and page") ───────────
// The main pool is decorated by attachTrendSignals; the SAME flag must reach
// (a) every placeScore ranking site, (b) the displayed number, (c) the card's
// 🔥 disclosure. Executed where executable, position-asserted where not.
{
  // (b) EXECUTED: the display path carries the trending term…
  ok(displayedWfScore({ id: "t", name: "t", wfScore: 90, trending: true }) === 96,
    "displayedWfScore applies +0.6 to a flagged place — the chip shows what the rank used");
  ok(displayedWfScore({ id: "t", name: "t", wfScore: 90 }) === 90, "no flag → no bump (undecorated objects unchanged)");
  ok(displayedWfScore({ id: "t", name: "t", wfScore: 95, trending: true }) === 99, "…with the 9.9 cap intact on the display path");
  // (a) EXECUTED: placeScore carries the same term…
  const { placeScore } = await import("../lib/rankPlaces.js");
  const HOME_SRC = readFileSync(path.resolve("app/home.js"), "utf8");
  ok(placeScore({ quality: 90, trend: 6 }) - placeScore({ quality: 90 }) === 6,
    "placeScore's trend part is worth exactly the disclosed +6");
  // …and every home ranking site passes it (count, don't grep — one dropped
  // site must go red; mirrors the >=5 creator-video assertion above).
  ok((HOME_SRC.match(/trend: p\.trending \? TRENDING_BONUS : 0/g) || []).length >= 6,
    "all six home.js placeScore sites carry the trend term beside the creator term");
  ok(/await attachTrendSignals\(pool/.test(HOME_SRC), "the home pool is decorated by the ONE unified signal");
  // (c) the card renders the reason, and the hero why-line discloses it
  ok(/p\.trending && p\.trend_reason && \(/.test(HOME_SRC), "the PlaceCard renders the 🔥 reason off the row's own flag");
  ok(/heroPick\.trending && heroPick\.trend_reason/.test(HOME_SRC), "the hero why-line discloses a trending hero");
  const hook = readFileSync(path.resolve("app/components/sheets/HookDetail.js"), "utf8");
  ok(/p\.trending && p\.trend_reason \?/.test(hook), "HookDetail rows (holiday/curated sheets) disclose beside the chip");
}

// ── 2f. LANDING / GUIDES (2026-08-08, patch 4) ──────────────────────────────
// rankedFor (the server ranker behind /go/[city], /culture, /florida, the
// root page and the guide bridges) attaches the unified signal, passes the
// flag into the SAME governed call the parity lock reads, and disclosure
// rides whyLine + the landing template's unified flame.
{
  const land = readFileSync(path.resolve("lib/landing.js"), "utf8");
  ok(/await attachTrendSignals\(pool, \{\}\);/.test(land), "rankedFor attaches the unified signal BEFORE scoring");
  ok(/governedWayfindScore\(q, \{ hasCreatorVideo: hasCreatorVideoAt\(p\), distanceMi: [^}]*trending: !!p\.trending \}\)/.test(land),
    "rankedFor's governed call carries the trending flag");
  ok(/if \(p\.trending && p\.trend_reason\) bits\.push\("🔥 " \+ p\.trend_reason\);/.test(land),
    "whyLine leads with the 🔥 reason — the disclosure that rides every consumer of these rows");
  ok(/const trending = !!\(p\.trending && p\.trend_reason\);/.test(land),
    "the landing template's flame renders off the row's own unified flag (beach-only popularity flame folded in)");
}
// whyLine EXECUTED (via jsxLoad — landing.js carries JSX): a trending row's
// line leads with the reason; a plain row's doesn't.
{
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const { whyLine } = await loadComponent(path.resolve("lib/landing.js"), REPO);
  const hot = whyLine({ rating: 4.8, reviews: 900, distMi: 3.2, trending: true, trend_reason: "Popular with locals" }, "spot");
  ok(hot.startsWith("🔥 Popular with locals"), "whyLine on a trending row starts with the disclosed reason");
  const plain = whyLine({ rating: 4.8, reviews: 900, distMi: 3.2 }, "spot");
  ok(!plain.includes("🔥"), "whyLine on a plain row carries no flame");
}

// ── 2g. MAP + EXPERIENCE POOLS (2026-08-08, patch 5) ────────────────────────
{
  const mapSrc = readFileSync(path.resolve("app/components/screens/Map.js"), "utf8");
  ok(/\+ \(q\.trending \? TRENDING_BONUS : 0\)/.test(mapSrc),
    "the map's pin-selection score carries the disclosed trend term");
  ok(/mp\.trending && mp\.trend_reason \?/.test(mapSrc), "the map preview card discloses the 🔥 reason");
  ok(/p && p\.trending && p\.trend_reason/.test(mapSrc), "the map card chips render the unified flame (beach-only flame folded in)");
  const HOME_SRC2 = readFileSync(path.resolve("app/home.js"), "utf8");
  ok((HOME_SRC2.match(/await attachTrendSignals\(/g) || []).length >= 3,
    "home decorates ALL its pools: the main pool + both experience fetch effects (count, not grep)");
}

// ── 3. Shown == sorted, end to end on the real list ─────────────────────────
{
  const rows = [
    { id: "far-great", rating: 4.9, reviews: 5000, distance_mi: 30, kind: "place" },
    { id: "near-good", rating: 4.6, reviews: 3000, distance_mi: 5, kind: "place" },
    { id: "mid", rating: 4.5, reviews: 5800, distance_mi: 10.5, kind: "place" },
  ];
  const sorted = byVisibleScore(rows);
  ok(sorted.every((r, i) => i === 0 || (sorted[i - 1].governed_score ?? -Infinity) >= (r.governed_score ?? -Infinity)),
    "byVisibleScore renders in governed-score order — a higher chip can never sit below a lower one");
  ok(sorted.every((r) => r.governed_score === governedWayfindScore(wayfindScore(r.rating, r.reviews), { hasCreatorVideo: !!r.creator_video, distanceMi: r.distance_mi })),
    "the carried governed_score IS the law applied to the row's own facts");
}

// ── 4. The display path applies the same law ────────────────────────────────
ok(displayedWfScore({ id: "g", name: "g", wfScore: 90, distMi: 20 }) === 88,
  "displayedWfScore carries the −2 past 17 miles — the chip admits the drive");
ok(displayedWfScore({ id: "g", name: "g", wfScore: 90, distMi: 10 }) === 90, "inside 17 miles the chip is the base");
ok(displayedWfScore({ id: "g", name: "g", wfScore: null }) === null, "'Score pending' contract intact");

// ── 5. The retired models stay retired, by source ───────────────────────────
const TB = readFileSync(path.join(REPO, "lib/todaysBest.js"), "utf8");
ok(!/PROXIMITY_PER_MI/.test(TB), "the per-mile decay is gone from todaysBest — the law's flat −0.2 replaced it");
ok(!/capCreatorHead\(/.test(TB), "no head cap reorders the answer-first list against the governed score");
const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8");
ok(!/\(_d - 4\) \* 1\.3/.test(HOME), "the v4.24 hidden 1.3/mi model is gone from the personalised feed");
ok((HOME.match(/hasCreatorVideoAt\(p\) \? CREATOR_VIDEO_BONUS : 0/g) || []).length >= 5,
  "every home.js ranking site applies the flat law term");
const LANDING = readFileSync(path.join(REPO, "lib/landing.js"), "utf8");
ok(!/Math\.min\(30, \(mi - 4\) \* 1\.3\)/.test(LANDING), "the landing pages' 1.3/mi model is gone");
ok(/governedWayfindScore\(/.test(LANDING), "…and the landing rank runs through the governed score");


// ── THE OWNER'S 2026-08-07 14:47Z SCREENSHOT, AS A FIXTURE ──────────────────
// Six real rows from his Bradenton feed, ratings/reviews/distances as shown:
// the pre-law bundle rendered 9.2s (Rocco's 3.7mi, Yard House 3.4mi) ABOVE
// 9.3s (Two Scoops 20mi, Small Town Creamery 18mi) — the hidden per-mile
// penalty. The law forbids that forever: run his exact case through the REAL
// byVisibleScore and assert the emitted order is monotonic in the displayed
// governed score. If this ever goes red, the inversion he reported is back.
{
  const { byVisibleScore } = await import(path.resolve("lib/todaysBest.js"));
  const shot = [
    { name: "American Honey Creamery", rating: 4.7, reviews: 737, distance_mi: 13 },
    { name: "Rocco's Tacos & Tequila Bar", rating: 4.6, reviews: 7055, distance_mi: 3.7 },
    { name: "Yard House", rating: 4.6, reviews: 2609, distance_mi: 3.4 },
    { name: "Two Scoops", rating: 4.7, reviews: 1477, distance_mi: 20 },
    { name: "Small Town Creamery", rating: 4.7, reviews: 602, distance_mi: 18 },
    { name: "Anna Maria Island Beach Cafe", rating: 4.5, reviews: 900, distance_mi: 18 },
  ];
  const out = byVisibleScore(shot.map((r) => ({ ...r })));
  ok(out.length === shot.length, "the screenshot fixture survives ranking intact (no row dropped)");
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1].governed_score, b = out[i].governed_score;
    ok(a >= b, `screenshot fixture stays monotonic: ${out[i - 1].name} (${a}) may not rank above a HIGHER-scored ${out[i].name} (${b})`);
  }
  const twoScoops = out.find((r) => r.name === "Two Scoops");
  const roccos = out.find((r) => r.name === "Rocco's Tacos & Tequila Bar");
  ok(out.indexOf(twoScoops) < out.indexOf(roccos) === (twoScoops.governed_score > roccos.governed_score),
    "the exact pair he circled (Two Scoops vs Rocco's) orders by the displayed number, whichever way the scores fall");
}

// ── THE CHIP MUST SHOW THE SORTED NUMBER (2026-08-07 root cause) ────────────
// BestNearby ranked every row by byVisibleScore (governed_score) then handed
// the score chip a STRIPPED { rating, reviews } with no distance, so the chip
// recomputed the BASE and a 9.3 base sat below a 9.2 governed. Two locks:
//
// 1. On the screenshot fixture, the DISPLAYED (rounded /10) governed number is
//    non-increasing down the sorted list — i.e. no visible inversion is
//    possible once the chip reads governed_score.
{
  const toDisp = (v) => (v == null ? null : Math.round((v / 10) * 10) / 10);
  const shot = [
    { name: "American Honey Creamery", rating: 4.7, reviews: 737, distance_mi: 13 },
    { name: "Rocco's Tacos & Tequila Bar", rating: 4.6, reviews: 7055, distance_mi: 3.7 },
    { name: "Yard House", rating: 4.6, reviews: 2609, distance_mi: 3.4 },
    { name: "Two Scoops", rating: 4.7, reviews: 1477, distance_mi: 20 },
    { name: "Small Town Creamery", rating: 4.7, reviews: 602, distance_mi: 18 },
  ];
  const out = byVisibleScore(shot.map((r) => ({ ...r })));
  for (let i = 1; i < out.length; i++) {
    const a = toDisp(out[i - 1].governed_score), b = toDisp(out[i].governed_score);
    ok(a >= b, `displayed chip is non-increasing down the sorted list: ${out[i-1].name} shows ${a} then ${out[i].name} shows ${b}`);
  }
}
// 2. The kit chip PREFERS governed_score, and BestNearby's ranked place rows
//    pass the FULL row (which carries it), never a stripped { rating, reviews }.
{
  const kit = readFileSync(path.resolve("app/components/kit.js"), "utf8");
  ok(/Number\.isFinite\(p\.governed_score\)\s*\?\s*p\.governed_score/.test(kit),
    "PlaceScoreChip prefers p.governed_score — the exact number the sort used — over a recompute that can drift from it");
  const bn = readFileSync(path.resolve("app/components/BestNearby.js"), "utf8");
  // The two RANKED place-row chips (eat + todo) must receive the whole row.
  ok((bn.match(/<PlaceScoreChip p=\{p\}/g) || []).length >= 1 && (bn.match(/<PlaceScoreChip p=\{r\}/g) || []).length >= 1,
    "BestNearby's ranked rows pass the full row object to the chip (carrying governed_score + distance), not a stripped pair");
  // The specific regression: a ranked place row must NOT feed the chip a bare
  // { rating: X.rating, reviews: X.reviews } — that strips distance and defeats
  // the governing law. (The Viator EXPERIENCE row legitimately has no wayfind
  // score/distance, so one stripped pair — r.rating/r.reviews on a tour — is
  // allowed; assert there is at most that one.)
  const stripped = (bn.match(/<PlaceScoreChip p=\{\{ rating:/g) || []).length;
  ok(stripped <= 1, `at most the one tour row strips the chip input (got ${stripped}) — a ranked place row that strips it recreates the shown!=sorted inversion`);
}

console.log(`check-score-law: OK — ${pass} assertions (the governing rule: +0.7 creator video, −0.2 past 17mi, shown == sorted, null stays null, ties-only diversity)`);
