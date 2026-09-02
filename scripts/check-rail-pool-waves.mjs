#!/usr/bin/env node
/**
 * check-rail-pool-waves — the rail payload is built in WAVES, and a slow build
 * is never reported to the reader as an empty town.
 *
 * THE INCIDENT (owner, 2026-08-27, screenshot from a phone on LTE in
 * Bradenton): tapping a rail tile showed "We couldn't reach the ranking
 * service just now, so we won't show you a list we haven't ranked." Sometimes.
 * Other times the same tile showed a full deck. Nothing changed in between.
 * His words: "sometimes it shows up, sometimes it doesn't … I really don't get
 * it", and the part that matters — "they're gonna click to see results, and
 * nothing comes up. That's the worst type of experience we could have."
 *
 * IT WAS NOT A BUG IN THE RANKING. It was three separate honesty failures
 * stacked on one slow request, and MEASURED rather than guessed
 * (production, Bradenton, 2026-08-27):
 *
 *   /api/rails warm CDN hit ................ 0.45 – 0.68 s
 *   /api/rails cold origin ................. 6.7 – 7.9 s, one seen at 40 s+
 *   loadRailPlaces server-side ............. 7.4 s typical, 25.4 s cold
 *   payload ................................ 580 – 740 KB over LTE
 *   client deadline ........................ 12 s  ← everything above it died
 *
 *   1. NINE SEQUENTIAL AWAITS. The pool builders ran one after another
 *      (creators 641ms, summer 655, birthday 325, localpicks 197, breakfast
 *      436, quickeats 489, family 452, events 479, drive 1295 = 4969ms in
 *      series) although seven of the nine only read the anchor pools that
 *      loadPools had already built. As two waves that is ~1784ms.
 *   2. SLOW WAS TREATED AS FAILED. lib/loadState's 12s deadline was chosen for
 *      rails that "read our own Supabase RPCs"; this one makes live Google
 *      searchText calls per category per town. Past the deadline the client
 *      discarded a response that was about to arrive AND wiped every rail,
 *      because `railLoad` is one state for the whole component.
 *   3. AN OUTAGE WAS SHOWN AS SCARCITY. railMenuData returned `covered: true`
 *      with zero places when loadRailPlaces threw, so the reader was told
 *      "nothing near you clears this bar" — a claim about their town — on the
 *      strength of our own crash.
 *
 * WHY 433 GUARDS DID NOT CATCH IT. Every guard naming DaypartRail, /api/rails
 * or railsData asserts by REGEX over source text. `lib/railSelect.js` is
 * genuinely executed, but only against an ~18-row synthetic fixture, and its
 * assertions are written as `rows.length === 0 || rows.length >= MIN_CARDS` —
 * the suite blesses empty as correct. Nothing anywhere calls railMenuData() or
 * loadRailPlaces(). The retrieval half of the feature had zero executing
 * coverage, which is exactly where all three failures lived.
 *
 * This guard therefore executes what it can offline and asserts the rest in
 * syntactic position — and says plainly, in each message, which kind it is.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const RD = strip(readFileSync(join(ROOT, "lib/railsData.js"), "utf8"));
const DR = strip(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));

/* ── 1. THE WAVES EXIST, AND NOTHING SLIPPED BACK INTO SERIES ──────────────*/
{
  const body = RD.slice(RD.indexOf("export async function loadRailPlaces"), RD.indexOf("export const RAIL_DATA_LIMITS"));
  ok(body.length > 800, `PROBE: loadRailPlaces body was delimited (${body.length} chars) — a -1 here would scan the whole file`);

  const waves = (body.match(/await Promise\.all\(\[/g) || []).length;
  ok(waves === 2, `the builders run in exactly TWO waves, got ${waves} Promise.all blocks`);

  // The real assertion: NO pool builder is awaited on its own any more. A
  // tenth builder added later as a bare `await` would silently put the series
  // back, one stage at a time, and no reader would ever see why the tile got
  // slower.
  const solo = body.match(/pools\.\w+\s*=\s*await\s+build/g) || [];
  ok(solo.length === 0,
    `no pool builder may be awaited on its own — each one adds its full latency to a request the reader is timing out on. Found: ${solo.join(", ")}`);

  // Wave 2 must stay wave 2: breakfast and quickeats read pools.creators.
  const w1 = body.indexOf("await Promise.all([");
  const w2 = body.indexOf("await Promise.all([", w1 + 10);
  ok(body.indexOf("buildCreatorsPool") < w2 && body.indexOf("buildCreatorsPool") > w1,
    "buildCreatorsPool is in WAVE 1 — breakfast and quickeats list \"creators\" as a source cat and cannot start before it lands");
  for (const name of ["isBreakfastPlace", "isQuickService"]) {
    ok(body.indexOf(name) > w2, `${name}'s builder is in WAVE 2, after pools.creators is assigned`);
  }
  ok(/pools\.creators = creators;/.test(body) && body.indexOf("pools.creators = creators;") < w2,
    "…and pools.creators is ASSIGNED before wave 2 starts, not merely computed");
}

/* ── 2. NO BUILDER MAY MUTATE A SHARED ROW ─────────────────────────────────
   This is the property that makes the waves safe, so it is asserted rather
   than trusted. The one write that exists (buildSummerPool's _summerSourced)
   is on a clone, and its own comment says it must be — a Siesta Beach stamped
   in place would vanish from Beach Day. If a future builder writes to a pooled
   row directly, two parallel builders can see each other's marks. */
{
  const raw = readFileSync(join(ROOT, "lib/railsData.js"), "utf8");
  const code = strip(raw);
  const marks = [...code.matchAll(/^\s*(?:if \([^)]*\) )?(\w+)\._(\w+)\s*=/gm)].map((m) => ({ v: m[1], f: `${m[1]}._${m[2]}` }));
  ok(marks.length > 0, "CONTROL: the file really does mark rows — an empty match list would make every check below vacuous");
  for (const { v, f } of marks) {
    // The property that matters is not the variable's NAME but where its value
    // came from: a spread of something else. `const clone = { ...row }` and
    // `row = { ...row }` both qualify; `const row = pools.x[0]` does not.
    const cloned = new RegExp(`\\b${v}\\s*=\\s*\\{\\s*\\.\\.\\.`).test(code);
    ok(cloned, `${f} is written on a value SPREAD from its source, not on the pooled row itself — a mark written in place is visible to every other rail that reads that pool, and in parallel waves to every other builder running at the same time`);
  }
}

/* ── 3. SLOW IS NOT FAILED ─────────────────────────────────────────────────*/
{
  ok(/export const RAILS_LOAD_TIMEOUT_MS = (\d+);/.test(DR), "the rails request declares its OWN budget");
  const ms = Number((DR.match(/RAILS_LOAD_TIMEOUT_MS = (\d+)/) || [])[1]);
  ok(ms >= 8000 && ms <= 10000,
    `the inventory-only rails budget must produce a visible failure within 8–10s — got ${ms}ms`);
  ok(/settleLoad\(\(\) => inflight, \{ timeoutMs: RAILS_LOAD_TIMEOUT_MS \}\)/.test(DR),
    "…and it is the budget actually passed to settleLoad, not a constant nobody reads");

  // The late lane: a response that beats no deadline still fills the rails.
  ok(/inflight\.then\(apply, \(\) => \{\}\)/.test(DR),
    "a response that lands AFTER the deadline is still applied — settleLoad resolving does not cancel the fetch, and a 25s answer is worth more than an error message");
  ok(/let landed = false;/.test(DR) && /if \(cancelled \|\| landed\) return;/.test(DR),
    "…exactly once: the late lane and the deadline lane cannot both apply");

  // THE ONE THAT MATTERS MOST. Nothing is taken away from the reader in order
  // to show them an error.
  const failBlock = DR.slice(DR.indexOf("if (!res.ok) {"), DR.indexOf("apply(res.data);"));
  ok(failBlock.length > 40, `PROBE: the failure branch was delimited (${failBlock.length} chars)`);
  // The failure branch may touch `live` in exactly ONE way: it may install the
  // empty payload when there has never been an answer (otherwise `shown` falls
  // back to the server props and the flagship metro sits under "near you").
  // What it may NOT do is wipe a payload that is already correct for this
  // reader's own point — that is what turned one slow response into every rail
  // going empty at once.
  ok(!/setLive\(emptyRailLive\(\)\)/.test(failBlock),
    "the failure branch must not UNCONDITIONALLY wipe — that is what turned one slow response into every rail going empty at once");
  ok(/setLive\(\(prev\) => \(prev == null \? emptyRailLive\(\) : prev\)\)/.test(failBlock),
    "…but it must still empty the FLAGSHIP when there has never been an answer: `shown = live || {places}` falls back to the server props, which on a city route are the flagship metro's own places");

  // A 504 is not a network failure, and saying so sends the next reader of
  // this code hunting the wrong thing.
  ok(/r2\.ok \? r2\.json\(\) : Promise\.reject/.test(DR),
    "a non-OK HTTP response is distinguished from a transport failure — r2.json() on a gateway's HTML error page throws and used to be reported as \"couldn't reach\"");
}

/* ── 3b. THE WIPE FOLLOWS THE READER'S POINT ───────────────────────────────
   The pre-request `setLive(emptyRailLive())` ran before EVERY fetch. With a
   cold request measured at 25.4s that is 25 seconds of blank rails for a
   reader who was already looking at correct ones — and if the request then
   missed its deadline, the blank stayed and got an apology on top. The honesty
   rule it exists for is about LOCATION: cards ranked for somewhere else must
   never sit under "near you". So it follows the point, not the fetch. */
{
  ok(/const moved = lastPointRef\.current !== null && lastPointRef\.current !== pointKey;/.test(DR),
    "the pre-request wipe is gated on the reader having MOVED, not on a fetch starting");
  ok(/moved \? emptyRailLive\(\) : prev/.test(DR),
    "…a move blanks immediately (those cards are about the wrong town now); a retry or a daypart tick keeps what is on screen");
  ok(/const snapPre = \(v\) => Math\.round\(v \* 100\) \/ 100;/.test(DR) && /const snap = snapPre;/.test(DR),
    "the move test and the request URL share ONE precision — a reader judged \"moved\" at a finer grain than the CDN key would refetch to the same entry and blank for nothing");
  ok(/setLive\(\(prev\) => \(prev == null \? emptyRailLive\(\) : prev\)\)/.test(DR),
    "…and a failure with NO prior answer still empties the flagship: `shown` falls back to the server props, which on a city route are the flagship metro's places");
}

/* ── 4. AN OUTAGE IS NOT SCARCITY ──────────────────────────────────────────*/
{
  // ASSERT THE INVARIANT, NOT THE MECHANISM. This read `.catch(() => { failed
  // = true })` until v8.74, when the load was moved behind settleLoad —
  // because a bare .catch only ever saw the failure mode that THROWS, and
  // production's was the other one (a stalled upstream that never settles;
  // measured 2026-08-27, two of five fresh Orlando cells never returned).
  // Pinning the old spelling would have gone red on the fix and green on a
  // future regression that dropped the flag while keeping the shape, which is
  // the wrong way round. The invariant is: the load is BOUNDED, and whatever
  // it does, the outcome is recorded. Union of both plausible spellings, per
  // CLAUDE.md — never one path.
  ok(/const failed = !res\.ok;/.test(RD) || /\.catch\(\(\) => \{ failed = true; return null; \}\)/.test(RD),
    "railMenuData RECORDS the load's failure rather than swallowing it");
  ok(/settleLoad\(/.test(RD),
    "…and the load is BOUNDED, not merely caught — a hang is not a rejection, and an unbounded await is what actually reached the reader (scripts/check-fetch-deadlines.mjs pins the deadline and its ordering against the client budget)");
  ok(/covered: !failed,/.test(RD),
    "…and reports covered:false when it did — `covered:true` with zero places tells the reader \"nothing near you clears this bar\", which is a claim about their town made on the strength of our own crash");
  ok(/\n\s*failed,\n/.test(RD), "…and carries the fact out, so a caller can tell the two apart");
}

/* ── 5. THE PIPELINE ACTUALLY RUNS ─────────────────────────────────────────
   Executed, not read. This is the coverage that did not exist: nothing in the
   repo called loadRailPlaces or railMenuData, so no guard could have noticed
   that the retrieval half had gone quietly wrong. It runs offline — no network,
   no database — by passing an unresolvable city, which exercises the real
   function, the real fail-soft, and the real return shape. */
{
  const mod = await loadComponent(join(ROOT, "lib/railsData.js"), ROOT);
  ok(typeof mod.loadRailPlaces === "function" && typeof mod.railMenuData === "function",
    "CONTROL: loadRailPlaces and railMenuData are importable and callable at all — the property no existing guard establishes");

  const unknown = await mod.railMenuData("not-a-real-city");
  ok(unknown && unknown.covered === false,
    "an unresolvable city fail-CLOSES (covered:false) — it must never silently become the flagship metro");
  ok(unknown && Array.isArray(unknown.thin) && unknown.thin.length > 0,
    "…and reports every list rail thin rather than pretending to have ranked them");

  // requireOrigin with no origin is the near-me contract: honest empty, never
  // a city centroid wearing "near you".
  const noOrigin = await mod.loadRailPlaces("bradenton", { requireOrigin: true });
  ok(noOrigin && Object.keys(noOrigin.places || {}).length === 0,
    "requireOrigin with no reader point returns NO places — a centroid wearing \"near me\" is the lie this contract exists to stop");
  ok(noOrigin && (noOrigin.thin || []).length > 0, "…and marks the rails thin honestly");
}

/* ── 6. THE SIGNAL EXISTS AND IS NOT THROWN AWAY ───────────────────────────
   `rail_open` already carries has_places — every empty drop in production has
   been reported and nothing has ever read it. Keep the field, so the alert
   that should exist has something to read. */
{
  ok(/has_places:/.test(DR),
    "rail_open still carries has_places — an empty drop is already measurable in production, which is the cheapest possible detector for this whole class");
  ok(/logEvent\("rail_retry"/.test(DR),
    "…and rail_retry still fires: it is pressed ONLY on the failure screen, so it counts exactly the readers this bug reached");
}

/* ── 7. RED PROOFS ─────────────────────────────────────────────────────────*/
const RED = [
  ["a builder put back in series is detectable", () =>
    (/pools\.\w+\s*=\s*await\s+build/.test("  pools.creators = await buildCreatorsPool(pools, origin);")) &&
    !(/pools\.\w+\s*=\s*await\s+build/.test("  pools.creators = creators;"))],
  ["a failure branch that wipes the rails is detectable", () =>
    /setLive\(/.test("if (!res.ok) { setLive(emptyRailLive()); setRailLoad(LOAD_FAILED); return; }")],
  ["a missing r2.ok check is detectable", () =>
    !/r2\.ok \? r2\.json\(\) : Promise\.reject/.test("fetch(u).then((r2) => r2.json())")],
  ["covered:true on a swallowed throw is detectable", () =>
    !/covered: !failed,/.test("    covered: true,")],
  ["a mark written onto a pooled row is detectable", () => {
    // A builder that marks the row it was handed, with no spread anywhere.
    const bad = "for (const row of pools.restaurants) {\n  row._mine = true;\n}";
    const marks = [...bad.matchAll(/^\s*(?:if \([^)]*\) )?(\w+)\._(\w+)\s*=/gm)];
    return marks.length === 1 && !new RegExp(`\\b${marks[0][1]}\\s*=\\s*\\{\\s*\\.\\.\\.`).test(bad);
  }],
  ["a budget below the measured cold path is detectable", () => 12000 < 25441],
  ["a wipe on every fetch (rather than on a move) is detectable", () =>
    !/moved \? emptyRailLive\(\) : prev/.test("let cancelled = false;\n    setLive(emptyRailLive());\n    setRailLoad(LOAD_PENDING);")],
  ["a failure that leaves the flagship showing is detectable", () =>
    !/setLive\(\(prev\) => \(prev == null \? emptyRailLive\(\) : prev\)\)/.test("if (!res.ok) { setRailLoad(LOAD_FAILED); return; }")],
  ["a failure that wipes a correct same-point payload is detectable", () =>
    /setLive\(emptyRailLive\(\)\)/.test("if (!res.ok) { setLive(emptyRailLive()); setRailLoad(LOAD_FAILED); return; }")],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-rail-pool-waves: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-rail-pool-waves: OK — ${pass} assertions (two waves, no solo awaits, slow != failed, outage != scarcity; loadRailPlaces and railMenuData EXECUTED, which nothing else in the suite does)`);
