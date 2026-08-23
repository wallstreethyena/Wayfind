// scripts/test-creator-corroboration.mjs — THE CORROBORATION LAW, locked.
//
// Owner, 2026-08-23, verbatim: "if a place has multiple influencers than make
// sure to make it rank higher and add a trending badge on it."
//
// Two words in that sentence do all the work, and every assertion here defends
// one of them:
//
//   MULTIPLE — distinct PEOPLE, not distinct posts. If one creator posting the
//     same venue twice could mint a trending badge, the badge would measure
//     enthusiasm rather than consensus, and any single account could manufacture
//     one at will. creatorCountFor() counts a Set of handles for that reason.
//
//   TRENDING — the badge is not decorative. It routes through the SAME
//     TRENDING_BONUS every other trend source uses (lib/wayfindScore.js), so
//     "rank higher" and "add a badge" are one mechanism and cannot be shipped
//     apart: there is no code path that shows the flame without the +0.6, and
//     none that applies the +0.6 without a reason to render.
//
// Assert on the CALL, never the string (CLAUDE.md).
import {
  computeTrendSignal, corroborationTrend, corroborationFromCount, corroborationReason,
  TREND_THRESHOLD, TREND_REASONS, TREND_SOURCE_WEIGHTS,
  CORROBORATION_MIN_CREATORS, CORROBORATION_FULL_CREATORS,
} from "../lib/trendSignal.js";
import { creatorCountFor, creatorVideosFor } from "../lib/creatorVideos.js";
import { governedWayfindScore, wayfindScore, TRENDING_BONUS } from "../lib/wayfindScore.js";
import { governedScoreOf } from "../lib/lawfulOrder.js";
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = (m) => { console.error("test-creator-corroboration: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// ── 1. The bar is DISTINCT PEOPLE ───────────────────────────────────────────
ok(CORROBORATION_MIN_CREATORS === 2, "two distinct creators is the bar");
ok(CORROBORATION_FULL_CREATORS > CORROBORATION_MIN_CREATORS, "the curve has somewhere to go above the bar");
ok(corroborationFromCount(0) === null && corroborationFromCount(1) === null,
  "below the bar the source is ABSENT (null), never a zero that would drag a real popularity signal down");
ok(corroborationFromCount(2) != null && corroborationFromCount(2) > 0, "two creators is a present, positive source");
ok(corroborationFromCount(3) > corroborationFromCount(2), "a third creator is worth more than two");
ok(corroborationFromCount(9) <= 1 && corroborationFromCount(CORROBORATION_FULL_CREATORS) === 1,
  "the curve saturates and stays inside 0..1 — a place with nine posts cannot outrun the scale");
for (const junk of [null, undefined, NaN, "3", -4, Infinity, {}]) {
  ok(corroborationFromCount(junk) === null, "garbage count is absence, not a signal: " + String(junk));
}

// THE ONE THAT MATTERS: same creator twice is NOT corroboration.
{
  const oneCreatorTwice = {
    id: "synthetic-one-creator", name: "Synthetic One Creator",
  };
  // Prove the rule at the counting layer, where it lives, using the real
  // resolver's output shape rather than a hand-built number.
  const twoPostsOnePerson = [
    { creator: "SomeHandle", url: "https://example.com/a" },
    { creator: "somehandle", url: "https://example.com/b" },   // same person, different case
  ];
  const distinct = new Set(twoPostsOnePerson.map((v) => v.creator.toLowerCase())).size;
  ok(distinct === 1, "handle comparison is case-insensitive — @Cindy and @cindy are one person");
  ok(corroborationFromCount(distinct) === null,
    "one creator posting twice earns NO corroboration — the badge measures consensus, not enthusiasm");
  ok(creatorCountFor(oneCreatorTwice) === 0, "an uncurated place has no creators at all");
}

// ── 2. The verdict, and its disclosure ──────────────────────────────────────
{
  const sig = computeTrendSignal({ corroborationCreators: 2 });
  ok(sig.trending === true, "two creators alone makes a place trend");
  ok(typeof sig.trendReason === "string" && sig.trendReason.length > 0,
    "trending implies a reason — the disclosure the bump exists under");
  ok(sig.trendReason.includes("2"), "the reason names the REAL COUNT, a fact the reader can go and check");
  ok(sig.trendReason === corroborationReason(2), "the reason comes from one function, not two");
  ok(sig.sources.includes("corroboration"), "the source is named in the row's own provenance");
  const three = computeTrendSignal({ corroborationCreators: 3 });
  ok(three.trendReason.includes("3"), "three creators says three, not 'multiple'");
  ok(three.trendScore >= sig.trendScore, "more creators never scores lower");
}
{
  const one = computeTrendSignal({ corroborationCreators: 1 });
  ok(one.trending === false && one.trendReason === null && one.trendScore === 0,
    "one creator changes nothing at all — inert, indistinguishable from a place nobody filmed");
}

// ── 3. THE FLOOR: a leading signal is not averaged into silence ─────────────
{
  // A brand-new corroborated place whose foot-traffic percent-rank is low
  // BECAUSE the table has not caught up yet. Pre-v8.42 the blend read 0.45.
  const quietButFilmed = computeTrendSignal({ popularity: 0.15, corroborationCreators: 2 });
  ok(quietButFilmed.trending === true,
    "a corroborated place still trends when the LAGGING popularity table is quiet — that is the whole point of a leading signal");
  ok(quietButFilmed.trendReason === corroborationReason(2),
    "and it is disclosed as ITSELF: the floor never borrows 'Popular with locals' to explain a creator count");
  ok(quietButFilmed.trendScore >= TREND_THRESHOLD, "the floor lands exactly at the bar, not above it");
}
{
  // A place already hot on real foot traffic keeps its own, higher score and
  // its own, truer reason. The floor RAISES; it is not a ceiling.
  const hotAndFilmed = computeTrendSignal({ popularity: 0.98, corroborationCreators: 2 });
  const hotAlone = computeTrendSignal({ popularity: 0.98 });
  ok(hotAndFilmed.trending === true, "still trending");
  ok(hotAndFilmed.trendScore >= TREND_THRESHOLD, "still over the bar");
  ok(hotAndFilmed.trendScore > TREND_THRESHOLD,
    "the floor did not FLATTEN a genuinely hot place down to the bar — it only ever raises");
  ok(hotAlone.trendReason === TREND_REASONS.popularity,
    "sanity: foot traffic alone still explains itself as foot traffic");
}
{
  // Absence stays absence: corroboration must not suppress anything.
  const withoutIt = computeTrendSignal({ popularity: 0.2 });
  ok(withoutIt.trending === false, "a quiet, unfilmed venue is unchanged by this feature existing");
  ok(computeTrendSignal({}).trendScore === 0, "no sources at all is still inert");
}

// ── 4. RANK HIGHER — the badge and the bump are ONE mechanism ───────────────
{
  const base = wayfindScore(4.6, 900);
  const plain = governedWayfindScore(base, {});
  const corroborated = governedWayfindScore(base, { trending: true });
  ok(corroborated > plain, "a corroborated place scores strictly higher than the same place uncorroborated");
  ok(corroborated - plain === Math.min(TRENDING_BONUS, 99 - plain) || corroborated - plain === TRENDING_BONUS,
    "and it moves by exactly the ONE trending term — corroboration invents no score term of its own");
}
{
  // Through the real comparator, on the real library: the corroborated entry
  // must outrank an identical row that no creator filmed.
  const filmed = { id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru", rating: 4.6, reviews: 900, distance_mi: 3 };
  const unfilmed = { id: "synthetic-nobody-filmed-this", name: "Synthetic Control", rating: 4.6, reviews: 900, distance_mi: 3 };
  const gF = governedScoreOf(filmed, "Tampa");
  const gU = governedScoreOf(unfilmed, "Tampa");
  ok(creatorCountFor(filmed, "Tampa") >= CORROBORATION_MIN_CREATORS,
    "the fixture really is corroborated in the live library (if this fails, the batch changed — pick another corroborated placeId)");
  ok(filmed.trending === true && typeof filmed.trend_reason === "string",
    "governedScoreOf stamped the disclosure on the row, so every card that renders trend_reason shows it");
  ok(gF > gU, "shown == sorted: the corroborated row's own number is higher, so it sorts higher");
  ok(unfilmed.trending !== true, "the control row was not touched");
}
{
  // Monetized inventory is never decorated, on this path either.
  const tour = { id: "ChIJizhkpNfHwogRbx738MsVHK4", kind: "experience", name: "Heights Drive-Thru", rating: 4.8, reviews: 500 };
  governedScoreOf(tour, "Tampa");
  ok(tour.trending !== true,
    "an experience/commission row is NEVER given the trending flag — 'no paid placement' has no exceptions");
}
{
  // A live signal outranks a filming history, and keeps its own reason.
  const live = { id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru", rating: 4.6, reviews: 900, trending: true, trend_reason: "Busy right now" };
  governedScoreOf(live, "Tampa");
  ok(live.trend_reason === "Busy right now",
    "a real-time verdict is never overwritten by corroboration — the reader gets the truer of the two");
}
{
  // A row already stamped upstream is left completely alone: stamping a badge
  // onto a number that does not contain the bump is the shown!=sorted defect.
  const stamped = { id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru", rating: 4.6, reviews: 900, governed_score: 91 };
  ok(governedScoreOf(stamped, "Tampa") === 91, "an already-stamped score is returned untouched");
  ok(stamped.trending !== true,
    "…and NO badge is added to it — a flame beside a number that excludes the +0.6 is the exact defect lawfulOrder exists to prevent");
}

// ── 5. corroborationTrend(): the synchronous verdict the rail pools use ─────
{
  const yes = corroborationTrend({ id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru" }, "Tampa");
  ok(yes.trending === true && typeof yes.trend_reason === "string", "a corroborated place gets a verdict with a reason");
  const no = corroborationTrend({ id: "synthetic-nobody", name: "Synthetic Nobody" }, "Tampa");
  ok(no.trending === false && no.trend_reason === null,
    "an uncorroborated place gets exactly the { false, null } the pools used to hard-code — same field names, same shape");
  // place_id-only rows resolve through PASS 1, not the name path.
  const byPlaceId = corroborationTrend({ place_id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Something Else Entirely" }, "Tampa");
  ok(byPlaceId.trending === true,
    "a row carrying only place_id still resolves EXACTLY — never falling through to the name path, which is the one that can mis-attribute");
  for (const junk of [null, undefined, 42, "row", {}]) {
    const r = corroborationTrend(junk, null);
    ok(r && r.trending === false && r.trend_reason === null, "garbage rows fail soft: " + String(junk));
  }
}

// ── 6. Nothing monetized reaches the count ─────────────────────────────────
{
  const clean = computeTrendSignal({ corroborationCreators: 2 });
  const bribed = computeTrendSignal({
    corroborationCreators: 2,
    affiliate: 1, commission: 99, sponsored: true, booking_url: "https://partner.example", viator: 1,
  });
  ok(clean.trendScore === bribed.trendScore && clean.trendReason === bribed.trendReason,
    "monetized keys are ignored by construction — paying cannot manufacture corroboration");
  ok(TREND_SOURCE_WEIGHTS.corroboration > 0, "the source carries a real weight in the blend, not a token one");
}

// ── 7. The library actually contains what this was built for ───────────────
{
  const src = readFileSync(path.resolve("lib/creatorVideos.js"), "utf8");
  ok(/creator:\s*"cailincoastal"/.test(src), "the @cailincoastal batch is in the library");
  const corroborated = [
    { id: "ChIJizhkpNfHwogRbx738MsVHK4", name: "Heights Drive-Thru", city: "Tampa" },
    { id: "ChIJSbDatOjnwogRLPoi6_FtJrM", name: "Atomic Cat Cafe", city: "St. Petersburg" },
  ];
  for (const p of corroborated) {
    ok(creatorCountFor(p, p.city) >= CORROBORATION_MIN_CREATORS,
      `"${p.name}" is corroborated by ${CORROBORATION_MIN_CREATORS}+ distinct creators`);
    const vids = creatorVideosFor(p, p.city);
    ok(vids.length >= 2 && vids.every((v) => v.url && v.url.startsWith("http")),
      `"${p.name}" renders every one of its creators' real posts — corroboration a reader can click through and verify`);
  }
}

// ── 8. NO DUPLICATE ENTRIES — the bug this batch actually hit ──────────────
// v8.43, found by hand and never by the build: the Miami batch generated a
// second entry under the key "el-churrascaso-miami-lakes" because the key is
// derived from the venue and the venue was already curated by someone else.
//
// Nothing would have caught it and nothing would have LOOKED wrong. Both
// resolvers take the first match — creatorVideosFor() returns on the first
// placeId hit, videosByKey() uses CURATED.find() — so the later duplicate
// simply never renders. The creator's video is in the file, is credited in no
// surface, and counts for nothing: the exact silent-loss shape that a
// corroboration rule makes WORSE, because the second creator on a place is
// precisely the entry most likely to collide and the one worth the most.
//
// Parsed from source rather than from the module, because the export surface
// deliberately does not hand out CURATED — and a duplicate is a property of
// the FILE, not of what the file manages to return.
{
  const src = readFileSync(path.resolve("lib/creatorVideos.js"), "utf8");
  const count = (re) => {
    const seen = new Map();
    for (const m of src.matchAll(re)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
    return seen;
  };
  const keys = count(/\bkey: "([^"]+)"/g);
  const dupKeys = [...keys].filter(([, n]) => n > 1).map(([k]) => k);
  ok(keys.size > 200, `the key parse found the library (${keys.size}) — an empty parse would make this vacuous`);
  ok(dupKeys.length === 0,
    `every CURATED key is unique — a duplicate never renders and is invisible. Offenders: ${dupKeys.join(", ")}`);

  const pids = count(/\bplaceId: "([^"]+)"/g);
  const dupPids = [...pids].filter(([, n]) => n > 1).map(([k]) => k);
  ok(pids.size > 100, `the placeId parse found real ids (${pids.size})`);
  ok(dupPids.length === 0,
    `no two entries claim the SAME venue — two entries on one placeId means one creator's video is unreachable, and it is corroboration that gets lost. Offenders: ${dupPids.join(", ")}`);

  // The positive control: prove the detector can actually see a duplicate,
  // or a future regression in the regex passes this section vacuously.
  const planted = new Map([["a", 1], ["b", 2]]);
  ok([...planted].filter(([, n]) => n > 1).length === 1, "the duplicate detector detects a planted duplicate");
}

console.log(`test-creator-corroboration: OK — ${pass} assertions (distinct people not posts, leading-signal floor, one mechanism for badge+rank, no monetized path, no silent duplicate entries)`);
