// scripts/test-curator-picks.mjs — the owner's like moves the number AND the
// rank on every surface, for every visitor, and survives races. All by CALL
// through the production functions (lib/curatorPicks.js, lib/curatorPicksServer.js,
// lib/ownerBump.js, lib/lawfulOrder.js, lib/railRank.js, the rail composers).
//
// Owner, 2026-10-01: "Completion means the new score actually controls the
// correct placement across every applicable surface, without losing bonuses,
// breaking other sort modes, or reverting to stale state."
import { readFileSync } from "fs";
import {
  applyCuratorPicks, applyCuratorPicksRanked, getCuratorPicks, mergeServerSet, noteSessionOwner,
  beginCuratorToggle, settleCuratorToggle, trackCuratorWrite, curatorVerdictFromLikes,
  __resetCuratorPicksForTest,
} from "../lib/curatorPicks.js";
import { applyCuratorPicksServer } from "../lib/curatorPicksServer.js";
import { stampOwnerPick } from "../lib/ownerBump.js";
import { lawfulSort, governedScoreOf } from "../lib/lawfulOrder.js";
import { byTopRated } from "../lib/ranking.js";
import { railScoreOf, byWayfindScore } from "../lib/railRank.js";
import { composeWorthEatingRails } from "../lib/worthEatingRails.js";
import { toDisplayScore } from "../lib/score.js";

let pass = 0;
const fail = (m) => { console.error("test-curator-picks: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const ids = (list) => list.map((p) => p.id).join(",");
const shown = (p) => toDisplayScore(governedScoreOf(p));
const fresh = () => { __resetCuratorPicksForTest(); };
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── 1. CROSSING A NEIGHBOUR: the bumped card moves above it, rank labels follow.
{
  fresh();
  // Scooter's 9.1 vs Ryan's 9.0. Top-rated memoises governed_score on the rows first.
  let rows = [
    { id: "scooters", name: "Scooter's", wfScore: 91, reviews: 276, distMi: 12.6 },
    { id: "ryans", name: "Ryan's", wfScore: 90, reviews: 205, distMi: 7 },
  ].sort(byTopRated);
  ok(ids(rows) === "scooters,ryans", "baseline: 9.1 ranks #1, 9.0 ranks #2");
  mergeServerSet(["ryans"]);
  rows = applyCuratorPicks(rows).slice().sort(byTopRated);
  const rank = Object.fromEntries(rows.map((p, i) => [p.id, i + 1]));
  ok(ids(rows) === "ryans,scooters", "the liked 9.0→9.2 ranks above the 9.1 (got " + ids(rows) + ")");
  ok(rank.ryans === 1 && rank.scooters === 2, "rank labels follow position: Ryan's #1, Scooter's #2");
  ok(shown(rows[0]) === 9.2 && rows[0]._members.ownerPick === true, "the card shows 9.2 and carries the disclosed Curator's-pick mark");
  ok(ids(lawfulSort(rows)) === "ryans,scooters", "lawfulSort (browse default) agrees");
}

// ── 2. UNLIKE reverses only the owner adjustment; likes never stack; bonuses survive.
{
  fresh();
  // A creator-video row: shown = base + 0.2. The verdict is RECORDED on the row.
  const base = { id: "vid", name: "Video spot", wfScore: 88, reviews: 120, distMi: 3, creator_video: true };
  const before = governedScoreOf({ ...base });
  ok(before === 90, "creator video adds +0.2 on top of the 8.8 base (got " + before + ")");
  const liked = stampOwnerPick({ ...base, governed_score: before }, true);
  ok(liked.wfScore === 95 && liked.governed_score === 97, "like: 8.8 base +0.7 band → 9.5, plus the video +0.2 → shown 9.7 (got " + liked.governed_score + ")");
  const twice = stampOwnerPick(stampOwnerPick(liked, true), true);
  ok(twice.wfScore === 95 && twice.governed_score === 97, "liking repeatedly never stacks the bump");
  const viaJson = JSON.parse(JSON.stringify(liked));
  const unliked = stampOwnerPick(viaJson, false);
  ok(unliked.wfScore === 88 && unliked.governed_score === 90, "unlike after a JSON round trip restores 8.8 base and 9.0 shown — the video bonus is kept (got " + unliked.governed_score + ")");
  ok(unliked._members.ownerPick === false, "…and the Curator's-pick mark is cleared");
  // A spread copy that lost the memo still recomputes WITH the bonus.
  const copy = { ...liked }; delete copy.governed_score;
  ok(governedScoreOf(copy) === 97, "a copy without the memo recomputes the same 9.7 (creator_video travels on the row)");
}

// ── 3. SERVER rail rows (rating-only, stamped with a city-resolved video verdict)
//      get the bump on the server, survive JSON, and unlike exactly on the client.
{
  fresh();
  const row = { id: "rail", name: "Rail spot", rating: 4.6, reviews: 300, distance_mi: 4, creator_video: true };
  row.governed_score = governedScoreOf(row);
  const g0 = row.governed_score;
  const [served] = JSON.parse(JSON.stringify(applyCuratorPicksServer([row], ["rail"])));
  ok(served._members.ownerPick === true && served.governed_score > g0, "server applies the pick before serving (" + g0 + " → " + served.governed_score + ")");
  ok(served.governed_score === served.wfScore + 2, "the server-side bump keeps the +0.2 video bonus (wfScore " + served.wfScore + ", shown " + served.governed_score + ")");
  ok(railScoreOf(served) === served.governed_score, "railScoreOf (what rails sort AND print) is the bumped shown score");
  mergeServerSet([]);
  const [after] = applyCuratorPicks([served]);
  ok(after._members.ownerPick === false && after.governed_score === g0, "client unlike restores the exact original shown score (" + after.governed_score + " vs " + g0 + ")");
  ok(applyCuratorPicksServer([row], null)[0] === row, "unknown server pick set (null) leaves rows untouched");
}

// ── 4. MIRROR rows (shapers that set wfScore === governed_score) never double-count.
{
  const mirror = { id: "m", wfScore: 92, governed_score: 92, creator_video: true, distMi: 2 };
  const b = stampOwnerPick(mirror, true);
  ok(b.wfScore === 94 && b.governed_score === 94, "a mirror row stays a mirror: 9.2 → 9.4, the video is not added twice (got " + b.governed_score + ")");
  ok(stampOwnerPick(b, false).governed_score === 92, "…and unlike returns it to 9.2");
}

// ── 5. SCORE THRESHOLDS + CAPS: a newly eligible place enters; non-score order holds.
{
  fresh();
  const it = (id, rating, reviews) => ({ id, name: id, rating, reviews, primary_type: "italian_restaurant", types: ["italian_restaurant", "restaurant"] });
  const pool = [it("a", 4.6, 300), it("b", 4.4, 60), it("low", 4.3, 40)];
  const railOf = (rows) => (composeWorthEatingRails(rows).find((r) => r.id === "italian-pizza") || { places: [] }).places;
  ok(!ids(railOf(pool)).includes("low"), "control: a 7.8 sits below Worth Eating's 8.0 floor and is not in the rail");
  mergeServerSet(["low"]);
  const curated = applyCuratorPicks(pool);
  const rail = railOf(curated);
  ok(ids(rail).includes("low"), "the owner's pick lifts it to 9.3 and it ENTERS the rail (got " + ids(rail) + ")");
  ok(rail[0].id === "low" && toDisplayScore(railScoreOf(rail[0])) === 9.3, "…at #1, printing the number it sorts by (9.3)");
  // Top-N cut AFTER the bump: a #4 that is picked enters a top-3.
  const four = [{ id: "w", wfScore: 93 }, { id: "x", wfScore: 92 }, { id: "y", wfScore: 91 }, { id: "z", wfScore: 85 }];
  mergeServerSet(["z"]);
  const top3 = applyCuratorPicks(four).slice().sort(byWayfindScore).slice(0, 3);
  ok(ids(top3) === "w,x,z", "a picked 8.5→9.2 enters a top-3 cut (got " + ids(top3) + ")");
  // Distance order is a non-score contract: scores update, order does not.
  const near = [{ id: "n1", wfScore: 80, distMi: 1 }, { id: "n2", wfScore: 90, distMi: 2 }, { id: "n3", wfScore: 70, distMi: 3 }];
  mergeServerSet(["n3"]);
  const nearAfter = applyCuratorPicks(near);
  ok(ids(nearAfter) === "n1,n2,n3" && nearAfter[2].wfScore === 85, "a distance-ordered list keeps its order and shows the updated score");
  // Ranked settle on a score-ordered server list moves only the changed card.
  const ranked = [{ id: "r1", governed_score: 95 }, { id: "r2", governed_score: 93 }, { id: "r3", governed_score: 91 }, { id: "r4", governed_score: 88, wfScore: 88 }];
  mergeServerSet(["r4"]);
  ok(ids(applyCuratorPicksRanked(ranked)) === "r1,r4,r2,r3", "a server-ordered rail settles the picked 8.8→9.5 to #2 and leaves the rest in order");
}

// ── 6. CONTROLS: pending stays pending; ceiling; ties; members are not owners.
{
  fresh();
  const pending = { id: "p", name: "No rating" };
  mergeServerSet(["p"]);
  const [pp] = applyCuratorPicks([pending]);
  ok(pp.wfScore == null && governedScoreOf(pp) == null, "an unrated place stays Score pending — the pick never mints a number");
  const [top] = applyCuratorPicks([{ id: "p", wfScore: 99 }]);
  ok(top.wfScore === 100, "a 9.9 is clamped to 10.0, never 10.1");
  const same = [{ id: "a1", wfScore: 90 }];
  ok(applyCuratorPicks(same) === same, "rows not in the set are returned as the SAME array (no churn)");
  fresh();
  const seq = beginCuratorToggle("m1", true);
  ok(getCuratorPicks().has("m1") === false, "an ordinary member's tap shows NO curator bump — the client never decides ownership");
  settleCuratorToggle("m1", seq, "off");
  ok(getCuratorPicks().has("m1") === false, "…and the server's 'off' verdict keeps it off");
  ok(curatorVerdictFromLikes({ counts: {}, owner: {} }, "q") === "off" && curatorVerdictFromLikes(null, "q") === "unknown" && curatorVerdictFromLikes({ error: "x" }, "q") === "unknown",
    "a failed/malformed read is 'unknown', never 'not picked'");
}

// ── 7. RACES: latest tap wins; stale settles ignored; cached reads cannot undo.
{
  fresh();
  noteSessionOwner(true);
  const s1 = beginCuratorToggle("r", true);
  ok(getCuratorPicks().has("r") === true, "owner session: the like shows in the same turn (optimistic)");
  const s2 = beginCuratorToggle("r", false);
  ok(getCuratorPicks().has("r") === false, "a rapid unlike shows immediately");
  ok(settleCuratorToggle("r", s1, "on") === false && getCuratorPicks().has("r") === false, "the FIRST tap's late 'on' answer is ignored — it cannot overwrite the newer unlike");
  ok(settleCuratorToggle("r", s2, "off") === true && getCuratorPicks().has("r") === false, "the latest tap settles");
  // Confirmed like vs a cached (stale) server set that still says 'not picked'.
  const s3 = beginCuratorToggle("r", true);
  settleCuratorToggle("r", s3, "on");
  mergeServerSet([]);
  ok(getCuratorPicks().has("r") === true, "a cached pick-set read that predates the like cannot undo the confirmed pick");
  mergeServerSet(["r"]);
  ok(getCuratorPicks().has("r") === true, "…and once the server agrees, it stays picked from the server's own set");
  // Unknown verdict: keep the write's outcome; failed write → prior state.
  const s4 = beginCuratorToggle("u", true);
  settleCuratorToggle("u", s4, "unknown", true);
  ok(getCuratorPicks().has("u") === true, "write landed, verdict unreadable → the like stands (never reverted by a flaky read)");
  const s5 = beginCuratorToggle("v", true);
  settleCuratorToggle("v", s5, "unknown", false);
  ok(getCuratorPicks().has("v") === false, "write FAILED, verdict unreadable → back to the prior (not picked) state");
}

// ── 8. trackCuratorWrite by CALL: fresh=1 verdict read, failure path, out-of-order.
{
  fresh();
  noteSessionOwner(true);
  const urls = [];
  let answer = { counts: { t: 50 }, owner: { t: true } };
  globalThis.fetch = async (u) => { urls.push(String(u)); return { ok: true, json: async () => answer }; };
  trackCuratorWrite("t", true, Promise.resolve({ error: null }), null, false);
  await tick(); await tick(); await tick();
  ok(urls.some((u) => /\/api\/signals\/likes\?ids=t&fresh=1$/.test(u)), "the post-write verdict read skips both route caches (fresh=1)");
  ok(getCuratorPicks().has("t") === true, "the confirmed 'on' verdict is applied");
  // A failed write whose verdict read also fails → prior.
  globalThis.fetch = async () => { throw new Error("offline"); };
  trackCuratorWrite("f", true, Promise.resolve({ error: { message: "denied" } }), null, false);
  await tick(); await tick(); await tick();
  ok(getCuratorPicks().has("f") === false, "a failed write with no readable verdict returns to the prior state");
  // Out-of-order: tap A (like) resolves AFTER tap B (unlike).
  let releaseA;
  const slowA = new Promise((r) => { releaseA = r; });
  answer = { counts: {}, owner: {} };
  globalThis.fetch = async () => ({ ok: true, json: async () => answer });
  trackCuratorWrite("o", true, slowA, null, false);
  trackCuratorWrite("o", false, Promise.resolve({ error: null }), null, true);
  await tick(); await tick(); await tick();
  answer = { counts: { o: 50 }, owner: { o: true } }; // a stale answer for the older tap
  releaseA({ error: null });
  await tick(); await tick(); await tick();
  ok(getCuratorPicks().has("o") === false, "the older like's late reconcile cannot overwrite the newer unlike");
}

// ── 8b. SERVER READ IS ISR-SAFE: page renders never get a no-store read or a
//       shorter revalidate than the page's own; the endpoint gets its own 60s.
{
  const { loadOwnerPickIds, __resetCuratorPicksServerForTest, PAGE_SAFE_REVALIDATE_S } = await import("../lib/curatorPicksServer.js");
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key"; process.env.WF_OWNER_USER_ID = "owner-test-id";
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push(init || {}); return { ok: true, json: async () => [{ place_id: "a" }, { place_id: "a" }, { place_id: "b" }] }; };
  __resetCuratorPicksServerForTest();
  const page = await loadOwnerPickIds({ fetchImpl });
  ok(page && page.join(",") === "a,b", "the server pick read returns de-duplicated place ids");
  ok(seen[0].cache !== "no-store" && seen[0].next && seen[0].next.revalidate === PAGE_SAFE_REVALIDATE_S && PAGE_SAFE_REVALIDATE_S >= 3600,
    "a page-path read uses the data cache at >= the homepage's 3600s — it can neither opt a page into dynamic rendering nor shorten its schedule");
  await loadOwnerPickIds({ fetchImpl, revalidate: 60 });
  ok(seen.length === 2 && seen[1].next.revalidate === 60, "the public endpoint reads past the page path's warm cache at its own 60s");
  await loadOwnerPickIds({ fetchImpl, fresh: true });
  ok(seen[2].cache === "no-store", "the owner's own fresh read skips every cache");
  const failing = async () => ({ ok: false, json: async () => [] });
  __resetCuratorPicksServerForTest();
  ok((await loadOwnerPickIds({ fetchImpl: failing })) === null, "a failed read is UNKNOWN (null), never an empty pick set");
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.WF_OWNER_USER_ID;
}

// ── 9. WIRING: every surface that ranks by score applies the pick before its
//      sort/slice; the server set never reaches the browser bundle.
{
  const home = read("app/home.js");
  for (const setter of ["setPlaces", "setExpPlaces", "setSuggested", "setHomeTodo", "setDetail", "setHookDetail"]) {
    ok(new RegExp("useEffect\\(\\(\\) => \\{ " + setter + "\\(\\(cur\\) => [^\\n]{0,140}applyCuratorPicks\\(").test(home), "home curation effect covers " + setter);
  }
  ok(/const cuisineList = \(label\) => Ranking\.rankByConditions\(intentPool\(\)/.test(home) && /cs\.list \|\| cuisineList\(cs\.label\)/.test(home),
    "the cuisine sheet ranks at render from the curated pools (a pick can enter its top 10)");
  const surfaces = {
    "app/components/DaypartRail.js": /applyCuratorPicks\(signed, curator\)/,
    "app/components/BreakfastRails.js": /useCuratedRows\(/,
    "app/components/WorthEatingRails.js": /useCuratedRows\(/,
    "app/components/LunchBreakRails.js": /useCuratedRows\(/,
    "app/components/NightOutRails.js": /useCuratedRows\(/,
    "app/components/DateNightRails.js": /useCuratedRows\(/,
    "app/components/BirthdayRails.js": /useCuratedRows\(/,
    "app/components/TodayDiscoveryRails.js": /useCuratedRows\(/,
    "app/components/FallIntentRails.js": /applyCuratorPicks\(/,
    "app/components/ExplodingNearby.js": /applyCuratorPicksRanked\(/,
    "app/components/ThingsToDoList.js": /applyCuratorPicks\(/,
    "app/components/ThemeParkRail.js": /useCuratedRows\(/,
    "app/components/FamilyDayPage.js": /useCuratedRows\(/,
    "app/components/IntentPageClient.js": /useCuratedRows\(/,
    "app/components/TrendingNowClient.js": /useCuratedRows\(/,
    "app/components/screens/Map.js": /applyCuratorPicks\(/,
  };
  for (const [f, rx] of Object.entries(surfaces)) ok(rx.test(read(f)), f + " applies the curator pick before ranking");
  for (const f of ["app/components/BreakfastRails.js", "app/components/WorthEatingRails.js", "app/components/LunchBreakRails.js", "app/components/NightOutRails.js", "app/components/DateNightRails.js", "app/components/BirthdayRails.js", "app/components/TodayDiscoveryRails.js"]) {
    const src = read(f);
    ok(/toDisplayScore\(railScoreOf\(/.test(src) && !/toDisplayScore\(wayfindScore\(/.test(src), f + " prints railScoreOf — the number it sorts by — not the raw rating score");
  }
  const serverFeeds = ["lib/railsData.js", "app/api/lunch-break/route.js", "app/api/night-out/route.js", "app/api/birthday/route.js", "app/api/date-night/route.js", "app/api/today-discovery/route.js", "app/api/events/fall/route.js", "lib/familyDayData.js", "lib/themeParksServer.js"];
  for (const f of serverFeeds) ok(/applyCuratorPicksServer\(/.test(read(f)) && /loadOwnerPickIds\(/.test(read(f)), f + " applies the pick server-side before compose/cap");
  ok(/applyCuratorPicksServer\(resolved, ownerPickIds\)/.test(read("lib/guidePlaceRails.js")) && /resolveGuidePlaceRail\(railConfig, railInventory, ownerPickIds\)/.test(read("app/guides/[slug]/page.js")),
    "guide place rails apply the pick before their order is decided");
  // Client bundles never import the server loader (it carries the service key path).
  const clientFiles = ["app/home.js", ...Object.keys(surfaces), "lib/curatorPicks.js", "lib/cardActions.js"];
  for (const f of clientFiles) ok(!/curatorPicksServer/.test(read(f)), f + " does not import the server pick loader");
  ok(/curatorAfterWrite\(place\.id, !wasLiked, next\.write, wasLiked\)/.test(read("lib/cardActions.js")), "standalone cards (cardActions) reconcile the owner verdict after the like write");
  const route = read("app/api/signals/curator-picks/route.js");
  ok(!/searchParams/.test(route), "the pick-set route reads NO query params — the owner is env-only");
}

console.log(`test-curator-picks: OK — ${pass} assertions (crossing re-rank + rank labels, unlike/no-stack/creator bonus through JSON, server rails, mirror rows, thresholds + caps + non-score order, pending/ceiling/member controls, race + stale-cache + failure contract, 16 surfaces + 7 server feeds wired)`);
