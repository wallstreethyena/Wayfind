// scripts/test-local-store.mjs — the storage budget, EXECUTED.
//
// THE BUG (owner, 2026-08-09, on a phone): "I had collapsed all of the menus,
// then navigated to my favorites, and when I went back to the home screen the
// menus were not like I left them."
//
// Measured on production in that browser: localStorage held 5,242,875
// characters against a 5,242,880 quota — five characters under the ceiling. So
// every localStorage.setItem in this app was throwing QuotaExceededError, and
// all 54 of them are wrapped in a silent try/catch. The collapsed set was
// written, refused, and gone on the next navigation, with nothing on screen to
// say so. The same was true of favorites, likes, dislikes, the chosen
// location and clipped coupons.
//
// 99% of that budget was CACHE. The reader's own data was under 10 KB.
//
// So this guard runs lib/localStore.js's planner against THE REAL CENSUS of
// that store, byte for byte, and asserts the two things that have to hold:
// the store comes back under budget, and NOTHING the reader owns is what buys
// the room. A regression here is not a slow page; it is a product that
// silently forgets.
import { planSweep, capMapToBudget, familyOf, isDisposable, stampOf, DISPOSABLE, CACHE_BUDGET_CHARS, QCACHE_BUDGET_CHARS, QUOTA_CHARS } from "../lib/localStore.js";
import { readFileSync } from "fs";
import path from "path";

const REPO = process.cwd();
let pass = 0;
const fail = (m) => { console.error("test-local-store: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(path.join(REPO, p), "utf8");

// ── THE CENSUS ──────────────────────────────────────────────────────────────
// Taken from www.gowayfind.com on 2026-08-09 with the store wedged. Sizes are
// key.length + value.length, exactly what the quota counts. Timestamps are
// synthetic and ordered, because the census recorded sizes rather than ages —
// the ORDER is what the eviction rules are being tested on.
const T0 = 1786200000000;
const CENSUS = [
  ["wfq_v1", 4189930, T0 + 900],
  ["wf_shared_items", 132265, 0],
  ["wf_sug_27.586_-82.426_d_none_dry", 96192, T0 + 10],
  ["wf_sug_28.400_-81.500_d_none_dry", 95964, T0 + 20],
  ["wf_sug_27.586_-82.426_l_none_dry", 95410, T0 + 30],
  ["wf_sug_27.340_-82.530_n_none_dry", 95351, T0 + 40],
  ["wf_sug_28.400_-81.500_n_none_dry", 94759, T0 + 50],
  ["wf_sug_27.340_-82.530_l_none_dry", 94724, T0 + 60],
  ["wf_sug_27.586_-82.426_n_none_dry", 93535, T0 + 70],
  ["wf_todo_27.586_-82.426", 82103, T0 + 80],
  ["wf_todo_28.400_-81.500", 57767, T0 + 90],
  ["wf_todo_27.340_-82.530", 46600, T0 + 100],
  ["wf_insights_v3", 6379, 0],
  ["wf_hooks_v1_n_A|B|C", 5662, T0 + 110],
  ["wf_liked_items", 5624, 0],
  ["wf_hooks_v1_e_A|B|C", 5203, T0 + 120],
  ["wf_hooks_v1_n_D|E|F", 5102, T0 + 130],
  ["wf_hooks_v1_a_A|B|C", 5008, T0 + 140],
  ["wf_hooks_v1_n_G|H|I", 4936, T0 + 150],
  ["wf_hooks_v1_n_J|K|L", 4868, T0 + 160],
  ["wf_hooks_v1_n_M|N|O", 4822, T0 + 170],
  ["wf_hooks_v1_a_D|E|F", 4792, T0 + 180],
  ["wf_hooks_v1_n_P|Q|R", 4227, T0 + 190],
  ["wf_insights_v2", 2969, 0],
  ["wf_insights_v4", 1653, 0],
  ["wf_lines_v4", 1346, 0],
  ["wf_coupons", 724, 0],
  ["wf_shared_base", 719, 0],
  ["wf_authlog", 671, 0],
  ["wf_cultground_v1", 639, 0],
  ["wf_taste_local", 365, 0],
  ["wf_signals", 346, 0],
  ["wf_taste_v1", 250, 0],
  ["wf_intent_copy_last", 141, 0],
  ["wf_center", 114, 0],
  ["wayfind_lists", 89, 0],
  ["wf_gw_pop", 62, 0],
  ["wf_revgeo|27.59|-82.43", 61, T0 + 200],
  ["wf_revgeo|28.40|-81.50", 59, T0 + 210],
  ["wf_revgeo|27.34|-82.53", 59, T0 + 220],
  ["wf_exp_id", 45, 0],
  ["wf_liked_base", 44, 0],
  ["wf_device", 29, 0],
  ["wf_intro_seen", 26, 0],
  ["wf_rails_collapsed", 26, 0],
  ["wf_disliked_items", 19, 0],
  ["wf_disliked_base", 18, 0],
  ["wf_reservations", 17, 0],
  ["wf_personalize", 16, 0],
  ["wf_fav_base", 13, 0],
  ["wf_visits", 12, 0],
].map(([key, chars, ts]) => ({ key, chars, ts }));

const censusTotal = CENSUS.reduce((n, r) => n + r.chars, 0);
ok(censusTotal > 5_000_000, `the census reproduces a wedged store (${censusTotal} chars)`);
ok(censusTotal <= QUOTA_CHARS, "…and does not exceed the quota it was measured against");

// ── THE READER'S DATA IS NEVER THE PRICE ────────────────────────────────────
// The single assertion this whole file exists for. Everything the reader chose
// or created — a saved list, a thumb, a clipped coupon, the town they picked,
// the rails they closed — must survive a sweep of a completely full store.
const OWNED = ["wayfind_lists", "wf_liked_items", "wf_disliked_items", "wf_shared_items",
  "wf_shared_base", "wf_liked_base", "wf_disliked_base", "wf_fav_base", "wf_coupons",
  "wf_reservations", "wf_center", "wf_taste_local", "wf_taste_v1", "wf_personalize",
  "wf_signals", "wf_rails_collapsed", "wf_device", "wf_intro_seen", "wf_exp_id",
  "wf_gw_pop", "wf_visits", "wf_authlog", "wf_intent_copy_last"];
for (const k of OWNED) ok(!isDisposable(k), `${k} is the reader's, not a cache — it can never be swept`);

const plan = planSweep(CENSUS);
for (const k of plan.drop) ok(isDisposable(k), `sweep dropped ${k}, which is NOT a declared cache — the reader lost something they chose`);
for (const k of OWNED) ok(plan.drop.indexOf(k) === -1, `${k} survived the sweep of a full store`);

// ── AND IT ACTUALLY MAKES ROOM ──────────────────────────────────────────────
ok(plan.after < plan.before, "the sweep frees space");
const cacheAfter = CENSUS.filter((r) => familyOf(r.key))
  .filter((r) => plan.drop.indexOf(r.key) === -1)
  .reduce((n, r) => {
    const t = plan.trim.find((x) => x.key === r.key);
    return n + (t ? Math.min(r.chars, t.budget) : r.chars);
  }, 0);
ok(cacheAfter <= CACHE_BUDGET_CHARS, `cache fits its budget after the sweep (${cacheAfter} <= ${CACHE_BUDGET_CHARS})`);
ok(plan.after < QUOTA_CHARS * 0.6, `the store lands well clear of the ceiling (${plan.after} of ${QUOTA_CHARS}) — a preference written a second later must not race the quota again`);

// ── THE QUERY CACHE IS SHRUNK, NOT THROWN AWAY ──────────────────────────────
// It is 80% of the budget and it is also the only cache that costs real money
// to rebuild: every entry is a Google Text Search already paid for.
ok(plan.drop.indexOf("wfq_v1") === -1, "wfq_v1 is never deleted outright — the searches in it have already been billed");
const qtrim = plan.trim.find((t) => t.key === "wfq_v1");
ok(!!qtrim, "…it is TRIMMED instead");
ok(qtrim.budget === QCACHE_BUDGET_CHARS, "…to its declared byte budget");
ok(QCACHE_BUDGET_CHARS < 4_189_930 / 2, "…which is a real reduction against the 4,189,930 characters measured, not a rounding");

// ── AN ENTRY CAP IS A BOUND ON THE WRONG UNIT ───────────────────────────────
// This is the actual defect. lib/google.js capped the cache at 80 ENTRIES. The
// census says an entry is ~80KB, so that cap authorises 6.4MB — larger than the
// whole 5MB quota, which is why it could never be what stopped the growth.
{
  const g = read("lib/google.js");
  const m = /QCACHE_MAX\s*=\s*(\d+)/.exec(g);
  ok(!!m, "lib/google.js still declares QCACHE_MAX");
  const perEntry = Math.round(4_189_930 / 52); // measured: 52 entries, 4,189,930 chars
  ok(Number(m[1]) * perEntry > QUOTA_CHARS,
    `the entry cap alone authorises ${Number(m[1]) * perEntry} chars, more than the ${QUOTA_CHARS}-char quota — which is why a BYTE budget had to exist`);
  // ASSERT THE LIVE CONDITION, NOT ITS PRESENCE. The first version of this
  // block tested /QCACHE_BUDGET_CHARS/ against the file and passed happily with
  // the comparison rewritten to `if (false)` — the identifier was still there,
  // on the import line. That is decoration, and this repo has been bitten by it
  // before. What has to be true is that qwrite hands the map to the bound, so
  // the bound is EXECUTED below and the call site is asserted unconditionally:
  // there is no `if` left for a saboteur to falsify.
  ok(/setLocal\(QCACHE_KEY, capMapToBudget\(all, QCACHE_BUDGET_CHARS\)\)/.test(g),
    "qwrite writes the cache through capMapToBudget — an unconditional call, so the byte bound cannot be switched off and still look present");
}

// ── THE BYTE BOUND, EXECUTED ────────────────────────────────────────────────
// Rebuild the measured cache — 52 entries, ~80KB each, 4.19MB — and prove the
// function actually returns something that fits.
{
  const big = {};
  for (let i = 0; i < 52; i++) big["cat|q" + i + "|27.59,-82.43|32000"] = { t: T0 + i, v: "x".repeat(80_500) };
  const rawLen = JSON.stringify(big).length;
  ok(rawLen > 4_000_000, `the rebuilt cache reproduces the measured weight (${rawLen} chars)`);
  const out = capMapToBudget(big, QCACHE_BUDGET_CHARS);
  ok(out.length <= QCACHE_BUDGET_CHARS, `capMapToBudget returns a value that FITS (${out.length} <= ${QCACHE_BUDGET_CHARS})`);
  ok(JSON.parse(out) && Object.keys(JSON.parse(out)).length > 0,
    "…and keeps some of the cache rather than emptying it — every entry in there is a Google search already paid for");
  const kept = Object.keys(JSON.parse(out));
  const keptIdx = kept.map((k) => Number(/q(\d+)\|/.exec(k)[1]));
  ok(Math.min(...keptIdx) > 0, "…and the oldest entries are the ones that went");
  ok(keptIdx.indexOf(51) > -1, "…while the newest survived");
  // Total over garbage, same as everything else here.
  ok(capMapToBudget(null, 100) === "{}" && capMapToBudget([1, 2], 100) === "{}" && capMapToBudget("x", 100) === "{}",
    "capMapToBudget refuses anything that is not a map");
  ok(capMapToBudget({ a: { t: 1, v: 1 } }, 1_000_000) === JSON.stringify({ a: { t: 1, v: 1 } }),
    "…and leaves a map that already fits completely alone");
}

// ── DEAD SCHEMA VERSIONS ────────────────────────────────────────────────────
// wf_insights_v2 and v3 sat next to v4 for months. Nothing read them and
// nothing was ever going to remove them.
ok(plan.drop.indexOf("wf_insights_v2") > -1 && plan.drop.indexOf("wf_insights_v3") > -1,
  "dead insight epochs are dropped");
ok(plan.drop.indexOf("wf_insights_v4") === -1, "…and the live one is kept");
ok(plan.drop.indexOf("wf_lines_v4") === -1, "the only lines epoch present is the live one, so it stays");

// ── PER-FAMILY CAPS, OLDEST FIRST ───────────────────────────────────────────
// The unbounded dimension: wf_sug_ keys are minted per (lat3, lng3, daypart,
// intent, wet), so lat/lng at 3 decimals is a new ~95KB key every 110 metres
// the reader travels.
{
  const fam = DISPOSABLE.find((f) => f.id === "sug");
  const left = CENSUS.filter((r) => fam.rx.test(r.key) && plan.drop.indexOf(r.key) === -1);
  ok(left.length <= fam.keep, `wf_sug_ is capped at ${fam.keep} keys (kept ${left.length} of 7)`);
  const oldestKept = Math.min(...left.map((r) => r.ts));
  const newestDropped = Math.max(...CENSUS.filter((r) => fam.rx.test(r.key) && plan.drop.indexOf(r.key) > -1).map((r) => r.ts));
  ok(newestDropped < oldestKept, "…and it evicts the OLDEST, never the freshest");
}
{
  const fam = DISPOSABLE.find((f) => f.id === "todo");
  const left = CENSUS.filter((r) => fam.rx.test(r.key) && plan.drop.indexOf(r.key) === -1);
  ok(left.length <= fam.keep, `wf_todo_ is capped at ${fam.keep} keys`);
}

// ── TOTAL OVER GARBAGE ──────────────────────────────────────────────────────
// localStorage is user-writable; another tab, an extension or a half-finished
// write can leave anything at all in it.
for (const junk of [null, undefined, 0, "x", {}, [null], [{ key: 5 }], [{ key: "a", chars: "NaN" }]]) {
  const p = planSweep(junk);
  ok(Array.isArray(p.drop) && Array.isArray(p.trim), "planSweep survives " + JSON.stringify(junk));
  for (const k of p.drop) ok(isDisposable(k), "…and still never names a non-cache");
}
ok(planSweep([]).drop.length === 0, "an empty store needs no sweep");
ok(planSweep(CENSUS.filter((r) => !familyOf(r.key))).drop.length === 0,
  "a store holding ONLY the reader's data is swept of nothing at all — the sweeper cannot 'make room' by deleting the thing it exists to protect");

// ── stampOf READS THE HEAD, NOT THE WHOLE VALUE ─────────────────────────────
// Learning one number must not cost a JSON.parse of four megabytes.
ok(stampOf('{"ts":1786232584648,"places":[]}') === 1786232584648, "stampOf reads a `ts` stamp");
ok(stampOf('{"t":1786232584648,"v":[]}') === 1786232584648, "…and a `t` stamp");
ok(stampOf("not json") === 0 && stampOf(null) === 0 && stampOf(12) === 0, "…and returns 0 for anything else");
ok(stampOf('{"pad":"' + "x".repeat(600) + '","ts":1786232584648}') === 0,
  "…and deliberately looks only at the head of the value, so a huge entry costs a slice and not a parse");

// ── THE WRITE PATHS ─────────────────────────────────────────────────────────
{
  const rc = read("lib/railCollapse.js");
  ok(/setLocal\(RAILS_COLLAPSED_KEY,/.test(rc),
    "the collapsed set is written through setLocal — the bare setItem it replaced is exactly what the owner watched fail");
  ok(!/localStorage\.setItem\(RAILS_COLLAPSED_KEY/.test(rc), "…and the old silent write is gone, not merely bypassed");
}
{
  const ls = read("lib/likeSignal.js");
  ok(/function writeLS\(key, obj\) \{ setLocal\(/.test(ls),
    "likes and dislikes write through setLocal — the thumbs are the only ranking feedback this app gets");
}
{
  const home = read("app/home.js");
  ok(/sweepLocal\(\)/.test(home) && /import \{ setLocal, sweepLocal \}/.test(home),
    "home.js sweeps on mount — a store that is ALREADY full has no successful write left to bound, so the reclaim cannot wait for one");
  // The bound is not "some writes"; it is that no PREFERENCE key is written
  // with a bare, silent setItem any more.
  const PREF = ["wayfind_lists", "wayfind_trips", "wf_shared_items", "wf_disliked_items",
    "wf_hook_likes", "wf_drive_votes", "wf_coupons", "wf_reservations", "wf_center",
    "wf_taste_local", "wf_taste_v1", "wf_personalize", "wf_signed_up", "wf_fav_base",
    "wf_signals", "wf_event_signals"];
  for (const k of PREF) {
    ok(!new RegExp('localStorage\\.setItem\\("' + k + '"').test(home),
      `${k} is no longer written with a bare localStorage.setItem — that write cannot report its own failure`);
  }
  ok(PREF.every((k) => !new RegExp('localStorage\\.setItem\\("' + k + '"').test(home)), "…all of them");
}

// ── THE DECLARATION IS THE CONTRACT ─────────────────────────────────────────
ok(DISPOSABLE.length >= 8, "every cache family the app writes is declared");
for (const f of DISPOSABLE) {
  ok(f.rx instanceof RegExp && typeof f.id === "string", `${f.id} declares a matcher`);
  ok(f.map ? typeof f.budget === "number" : f.keep >= 1, `${f.id} declares a bound (byte budget for a map cache, key cap otherwise)`);
  ok(!f.rx.global, `${f.id}'s matcher is not /g — a stateful regex would make familyOf() return different answers on alternate calls`);
}
ok(familyOf("wayfind_lists") === null && familyOf("wf_rails_collapsed") === null,
  "familyOf refuses to claim the reader's keys");

console.log(`test-local-store: OK — ${pass} assertions (a full store swept back under budget; every byte reclaimed is cache, none of it the reader's)`);
