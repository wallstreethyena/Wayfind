// scripts/test-like-rerank.mjs — a like that moves the number moves the rank.
//
// Owner, 2026-09-30, live: after the owner's like, Ryan's Coffee House showed
// a 9.4 Curator's pick at #6, still BELOW Scooter's Coffee's 9.2 at #5. The
// badge updated; the order did not.
//
// ROOT CAUSE: every lawful sort memoises `governed_score` on the row. The like
// path rebuilds the row with `{ ...place, wfScore: bumped }`, which copied the
// stale enumerable `governed_score` and dropped byTopRated's non-enumerable
// freshness fingerprint — so every later sort trusted the PRE-like number
// while PlaceCard's chip recomputed from wfScore. Shown != sorted.
//
// This locks: (1) the restamp at the one choke point (stampOwnerPick), across
// the browse, Top-rated and lawful sorts; (2) unlike restores; (3) the rail
// settle moves only the changed card; (4) the wiring on every surface the
// like reaches.
import { readFileSync } from "fs";
import { stampOwnerPick } from "../lib/ownerBump.js";
import { byTopRated, rankByConditions } from "../lib/ranking.js";
import { lawfulSort, restampGoverned, settleRescored, rescoredIds, governedScoreOf } from "../lib/lawfulOrder.js";

let pass = 0;
const fail = (m) => { console.error("test-like-rerank: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const ids = (list) => list.map((p) => p.id).join(",");

// Two plain app-shaped rows, near, no creator video, not trending: shown == wfScore.
const mk = () => [
  { id: "scooters", name: "Scooter's Coffee", wfScore: 91, rating: 4.6, reviews: 276, distMi: 12.6 },
  { id: "ryans", name: "Ryan's Coffee House", wfScore: 90, rating: 4.7, reviews: 205, distMi: 7.0 },
];
const like = (list, id, on) => list.map((p) => (p.id === id ? stampOwnerPick(p, on) : p));

// 1. The live repro: Top-rated stamps the rows, THEN the like lands.
{
  let rows = mk().sort(byTopRated);
  ok(ids(rows) === "scooters,ryans", "baseline: 9.1 above 9.0");
  rows = like(rows, "ryans", true);
  const ryan = rows.find((p) => p.id === "ryans");
  ok(ryan.wfScore === 92, "owner like bumps a 9.0 to 9.2 (+0.2 band) — got " + ryan.wfScore);
  ok(ryan.governed_score === 92, "the memoised sort key follows the bump (got " + ryan.governed_score + ") — the stale 90 is the reported bug");
  ok(ids(rows.slice().sort(byTopRated)) === "ryans,scooters", "Top rated: the liked 9.2 now ranks above the 9.1");
  ok(ids(rankByConditions(rows, {})) === "ryans,scooters", "browse default (rankByConditions): the liked card climbs");
  ok(ids(lawfulSort(rows)) === "ryans,scooters", "lawfulSort: the liked card climbs");
  // Unlike restores both the number and the order.
  rows = like(rows, "ryans", false);
  const back = rows.find((p) => p.id === "ryans");
  ok(back.wfScore === 90 && back.governed_score === 90, "unlike restores 9.0 on the chip AND the sort key");
  ok(ids(rows.slice().sort(byTopRated)) === "scooters,ryans", "unlike: the card returns below the 9.1");
  // A second like never stacks.
  rows = like(like(rows, "ryans", true), "ryans", true);
  ok(rows.find((p) => p.id === "ryans").governed_score === 92, "liking twice does not stack the bump or the key");
}

// 2. A lawfulSort-stamped row (no fingerprint at all) also restamps.
{
  let rows = lawfulSort(mk());
  rows = like(rows, "ryans", true);
  ok(ids(lawfulSort(rows)) === "ryans,scooters", "a lawfulSort-memoised row re-ranks after the like");
}

// 3. restampGoverned: no-op when the number did not move; server stamp kept.
{
  const server = { id: "s", wfScore: 80, governed_score: 99 };
  const same = restampGoverned(server, { ...server });
  ok(same.governed_score === 99, "an unchanged wfScore keeps the server's authoritative stamp");
  const unstamped = restampGoverned({ id: "u", wfScore: 80 }, { id: "u", wfScore: 82 });
  ok(!("governed_score" in unstamped), "a row that never had a stamp is left to compute lazily");
  const railRow = { id: "r", wfScore: 80, governed_score: 80, _s: 80, distMi: 2 };
  const moved = restampGoverned(railRow, { ...railRow, wfScore: 87 });
  ok(moved.governed_score === 87 && moved._s === 87, "railsData's `_s` mirror follows the restamp");
}

// 4. A server-stamped rail row with NO wfScore still shows and sorts the bump.
{
  const row = { id: "rail", rating: 4.8, reviews: 400, distance_mi: 3 };
  row.governed_score = governedScoreOf(row);
  const liked = stampOwnerPick(row, true);
  ok(liked.governed_score === liked.wfScore && liked.wfScore > row.governed_score, "rating-only rail row: the bumped number becomes the sort key (" + row.governed_score + " -> " + liked.governed_score + ")");
}

// 5. settleRescored moves ONLY the changed card, and only as far as its number demands.
{
  const r = (id, g) => ({ id, governed_score: g });
  const list = [r("a", 95), r("b", 93), r("c", 91), r("d", 91), r("e", 88)];
  const up = list.map((p) => (p.id === "e" ? { ...p, governed_score: 92 } : p));
  ok(ids(settleRescored(up, ["e"])) === "a,b,e,c,d", "a liked 8.8→9.2 climbs past the 9.1s and stops under the 9.3");
  const down = list.map((p) => (p.id === "b" ? { ...p, governed_score: 91 } : p));
  ok(ids(settleRescored(down, ["b"])) === "a,b,c,d,e", "an unlike to an equal number stops at the tie (keeps surface order)");
  ok(ids(settleRescored(list, [])) === ids(list), "nothing changed → nothing moves");
  // A non-score (distance-ordered) list: only the changed card moves, minimally.
  const near = [r("n1", 80), r("n2", 90), r("n3", 85), r("n4", 70)];
  const bumped = near.map((p) => (p.id === "n4" ? { ...p, governed_score: 86 } : p));
  ok(ids(settleRescored(bumped, ["n4"])) === "n1,n2,n4,n3", "on a non-score list the unrelated rows keep their order");
  ok(rescoredIds(list, up).join(",") === "e", "rescoredIds reports exactly the moved row");
}

// 6. Wiring on every surface the like reaches.
{
  const home = read("app/home.js");
  ok(/restampGoverned\(p, stampOwnerPick\(/.test(home), "withMemberSignal restamps against the ORIGINAL row (the nudge moves wfScore before stampOwnerPick)");
  ok(/function withSignalFields\(row, next\)[\s\S]{0,200}restampGoverned\(/.test(home), "the detail-open overlay restamps the rows it patches");
  ok(!/\{ \.\.\.pl, wfScore: next\.wfScore/.test(home) && !/\{ \.\.\.cur, wfScore: next\.wfScore/.test(home), "no hand-rolled wfScore spread survives in the detail overlay");
  const patch = (home.match(/function patchOwnerPick\([\s\S]*?\n  \}/) || [""])[0];
  ok(/setPlaces\(patch\)/.test(patch) && /setExpPlaces\(patch\)/.test(patch) && /setDetail\(/.test(patch), "patchOwnerPick re-scores the feed, the Experience pool and the open sheet");
  ok(/setHookDetail\(/.test(patch), "patchOwnerPick re-scores an open hook/holiday sheet");
  ok(/setLivePicks\(/.test(patch), "patchOwnerPick publishes the verdict to the rails");
  ok(/livePicks=\{livePicks\}/.test(home) && /applyLivePicks=\{withLivePicks\}/.test(home), "DaypartRail receives the live picks and the parent's decorator");
  const rail = read("app/components/DaypartRail.js");
  ok(/applyLivePicks\(signed, livePicks, _selRaw\)/.test(rail), "DaypartRail applies live picks and settles against its pre-signal order");
  const exp = read("app/components/screens/Experience.js");
  ok(/else list = \[\.\.\.list\]\.sort\(byTopRated\);/.test(exp), "Experience default order is the number on the card, not raw wfScore");
  ok(/return restampGoverned\(place, \{/.test(read("lib/ownerBump.js")), "stampOwnerPick restamps the sort key it just invalidated");
}

console.log(`test-like-rerank: OK — ${pass} assertions (a like moves the number AND the rank, on every surface it reaches)`);
