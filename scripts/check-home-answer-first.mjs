#!/usr/bin/env node
/**
 * check-home-answer-first — the ranked list must be visible without a tap.
 *
 * THE MEASUREMENT THIS EXISTS FOR (PostHog, 2026-08-05). 259 single-page
 * sessions landed on "/" in 14 days. The MEDIAN one lasted 10 seconds, and 130
 * of them ended inside those 10 seconds. Over the same window `/` bounced 84%
 * of its 373 visitors, while every visitor who got past the first screen went
 * on to view 9.5 pages. The first screen was the whole problem.
 *
 * The cause was structural, not aesthetic: BestNearby — the ranked places, the
 * entire product — mounted with `useState(null)`, so both sections were
 * collapsed, BELOW the events rail and the link grid. `result_count_shown`
 * fired 3,766 times in 30 days for a list almost nobody opened.
 *
 * A default is a one-character change and reads like a preference in a diff,
 * which is exactly how it gets reverted by someone tidying up. This guard
 * makes the revert loud.
 *
 * Assertions are on the MODULE'S OWN EXPORT where possible — importing the
 * component would drag React and the Supabase client into a plain-node guard
 * for no gain, but DEFAULT_SECTION is a plain constant, so it is read by
 * running the module rather than by grepping for it.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const SRC_PATH = path.join(REPO, "app/components/BestNearby.js");
const SRC = readFileSync(SRC_PATH, "utf8");
// Every assertion below must be satisfied by CODE. A comment explaining the
// default is not the default.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the default is a real section, and it is NOT null ───────────────── */
const decl = CODE.match(/export const DEFAULT_SECTION\s*=\s*("([a-z]+)"|null)/);
ok(!!decl, "BestNearby.js exports a DEFAULT_SECTION constant");

// The section ids are declared in the component's SECTIONS array. Derive the
// valid set from there rather than hard-coding it, so renaming a section makes
// this guard follow the code instead of going stale.
const ids = [...CODE.matchAll(/\{\s*id:\s*"([a-z]+)"\s*,\s*label:/g)].map((m) => m[1]);
ok(ids.length >= 2, `found the section ids in SECTIONS (got ${JSON.stringify(ids)})`);
ok(
  !!decl && decl[2] && ids.includes(decl[2]),
  `DEFAULT_SECTION must name a real section — got ${decl ? decl[1] : "nothing"}, valid: ${JSON.stringify(ids)}. ` +
  `null restores the all-collapsed layout that lost half of all visitors inside 10 seconds.`
);

/* ── 2. the state actually uses it ──────────────────────────────────────
   A constant nothing reads is decoration. This is the assertion that catches
   "DEFAULT_SECTION stays, useState(null) comes back" — which would leave the
   guard above green and the product broken. */
ok(
  /useState\(\s*DEFAULT_SECTION\s*\)/.test(CODE),
  "the open-section state is initialised from DEFAULT_SECTION, not from a literal"
);
ok(
  !/const\s*\[\s*open\s*,\s*setOpen\s*\]\s*=\s*useState\(\s*null\s*\)/.test(CODE),
  "the open-section state is NOT useState(null) — that is the exact pre-2026-08-06 regression"
);

/* ── 3. opening by default must actually FETCH ──────────────────────────
   The sections load lazily on toggle. A default-open section whose data never
   loads renders an open, empty box — strictly worse than a collapsed one,
   because it looks broken rather than closed. */
ok(/const ensureLoaded\s*=\s*\(/.test(CODE), "the fetch is factored into ensureLoaded()");
const mountEffect = CODE.match(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}, \[open,/);
ok(!!mountEffect, "an effect keyed on `open` drives the default-open fetch");
ok(!!mountEffect && /ensureLoaded\(open\)/.test(mountEffect[1]),
  "that effect calls ensureLoaded(open) — otherwise the default section opens empty");
ok(!!mountEffect && /isFinite\(center\.lat\)/.test(mountEffect[1]),
  "it waits for a real centre before fetching — an unconditional mount fetch would fire one request per visitor with lat=undefined");

/* ── 4. both loading paths are the same path ────────────────────────────── */
const toggleFn = CODE.slice(CODE.indexOf("const toggle = ("));
ok(/ensureLoaded\(id\)/.test(toggleFn.slice(0, 700)),
  "toggle() loads through ensureLoaded too — two copies of the fetch would drift, and mount is now the common path");

/* ── 5. the before/after read stays interpretable ───────────────────────
   best_nearby_open is the metric this change will be judged on. If the
   default-open fire and a deliberate tap emit identically, the comparison is
   destroyed and the experiment cannot be read. */
ok(
  /best_nearby_open"[\s\S]{0,80}trigger:\s*"tap"/.test(CODE),
  'a deliberate tap emits best_nearby_open with trigger:"tap", so it stays separable from the section that was already open on arrival'
);

/* ── 6. POSITION: the ranked list must LEAD the feed ─────────────────────
   #624 opened the card; it still rendered last, under the events rail, the
   hero carousel and the discovery grid. Opening a thing nobody scrolls to only
   makes the thing nobody scrolls to look better. So the ordering itself is now
   an invariant.

   Asserted by INDEX ORDER in the feed's JSX, which is the only place the
   ordering exists — there is no layout config to read. Comments are stripped
   first, so a comment mentioning BestNearby cannot satisfy it. */
// ONLY the JSX comment form is stripped. A blanket block-comment strip was
// tried first and deleted 158 KB of live code — app/home.js contains regex
// literals and strings holding "/*", so a non-greedy /\/\*...\*\//g runs away
// and every index below silently becomes -1. The probes underneath exist
// because that failure looked exactly like a passing guard until they were
// added.
const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const iBest = HOME.indexOf("<BestNearby center=");
const iEvents = HOME.indexOf("<EventsRailSkeleton />");
// The RENDER SITE in the feed, not the component. A bare "<DiscoveryHeroCard "
// also matches the one inside EventsRailSkeleton, which is DEFINED far earlier
// in the file — so the naive index comparison failed against a definition
// rather than a position in the feed. Index order only means something between
// two things rendered in the same tree.
const iHero = HOME.indexOf("<DiscoveryHeroCard onOpen=");
const iMenu = HOME.indexOf("const discoveryMenu");
const iMenuUse = HOME.indexOf("{discoveryMenu}");

ok(iBest > -1, "app/home.js renders <BestNearby>");
ok(iEvents > -1, "PROBE: the events rail is still in the feed (if this is -1 the comparisons below prove nothing)");
ok(iHero > -1, "PROBE: the promo hero card is still in the feed");
ok(iMenuUse > -1, "PROBE: the discovery grid is still in the feed");

ok(iBest < iEvents, `<BestNearby> renders BEFORE the events rail (${iBest} vs ${iEvents}) — the ranked list leads the feed`);
ok(iBest < iHero, `<BestNearby> renders BEFORE the promo hero card (${iBest} vs ${iHero}) — a stranger meets an answer, not an advert for us`);
ok(iBest < iMenuUse, `<BestNearby> renders BEFORE the discovery grid (${iBest} vs ${iMenuUse}) — results before controls`);

/* It must also sit OUTSIDE the events-present branch. Nested there, a visitor
   with no events nearby saw no ranked list at all — the case where they most
   need something to look at. */
const eventsBranch = HOME.indexOf("foryouEvents && foryouEvents.length > 0");
ok(eventsBranch > -1, "PROBE: the events-present branch exists");
ok(
  iBest < eventsBranch,
  `<BestNearby> is not nested inside the events-present branch (${iBest} vs ${eventsBranch}) — it must render when there are no events nearby too`
);

/* ── 7. THE REASON LINE ────────────────────────────────────────────────
   wf_best_picks returns `reasons text[]` and wf_things_to_do returns
   `subtitle`. Both have always come back over the wire and NEITHER was ever
   rendered — the engine explained every pick to nobody, while the list showed
   a distance and a score and left "why" to the imagination.

   §A RUNS reasonLine over the real shapes the RPC produces, including the ones
   that are not arrays of strings. It is a total function over untrusted data;
   a throw here renders nothing at all. */
// Imported from lib/, not from the component — a plain-node guard cannot
// parse JSX, and pure logic that a guard must EXECUTE belongs in lib/ anyway
// (same reason lib/score.js exists).
const bn = await import(new URL("../lib/reasonLine.js", import.meta.url).href).catch(() => null);

if (bn && typeof bn.reasonLine === "function") {
  const { reasonLine } = bn;
  ok(reasonLine(["Breakfast — right for the hour", "Local favorite — 4.8★ from 1128 reviews"])
     === "Breakfast — right for the hour · Local favorite — 4.8★ from 1128 reviews",
     "reasonLine joins the engine's two reasons into one sentence");
  ok(reasonLine(["Breakfast — right for the hour"]) === "Breakfast — right for the hour",
     "a single reason renders alone, without a dangling separator");
  ok(reasonLine(["a", "b", "c"]) === "a · b",
     "at most TWO reasons — a third cannot fit two lines at 390px, and the row height is load-bearing");
  ok(reasonLine(["x", "x"]) === "x", "a repeated reason is not printed twice");
  ok(reasonLine(["  ", "real"]) === "real", "blank entries are dropped, not rendered as empty separators");
  // Every one of these is a shape the wire can actually produce.
  for (const bad of [null, undefined, [], [null], [""], ["   "], [undefined, null], 42, "str", {}]) {
    let out, threw = false;
    try { out = reasonLine(bad); } catch (e) { threw = true; }
    ok(!threw, `reasonLine(${JSON.stringify(bad)}) does not throw — it runs inside a render`);
    ok(out === null, `reasonLine(${JSON.stringify(bad)}) returns null, not "" — the caller branches on truthiness`);
  }
} else {
  fail.push("could not import reasonLine from lib/reasonLine.js");
}

/* §B — it must actually be PASSED to the row, on every list that has one. A
   perfect formatter nothing calls is decoration. */
const BN = readFileSync(SRC_PATH, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const whyProps = [...BN.matchAll(/why=\{reasonLine\(/g)].length;
ok(whyProps >= 3, `every row list passes why={reasonLine(...)} (found ${whyProps}, expected 3: eat, tours, things-to-do)`);
ok(/function Row\(\{[^}]*\bwhy\b/.test(BN), "Row accepts a `why` prop");
ok(/\{why \? \(/.test(BN), "Row renders the why line conditionally — a place with no reason must not get an empty div");

/* §C — the clip. The expanded panel is overflow:hidden with a hard maxHeight
   tuned to the pre-reason row. Taller rows silently lose the bottom of the
   list: no error, no warning, nothing in a diff. */
ok(/const ROW_MAX_H = (\d+);/.test(BN), "the row height budget is a named constant");
const rowMax = Number((BN.match(/const ROW_MAX_H = (\d+);/) || [])[1]);
ok(rowMax >= 96, `ROW_MAX_H is at least 96 (got ${rowMax}) — 64 was the pre-reason row and a two-line why adds ~32px, so the last rows get clipped`);
ok(/maxHeight: isOpen \? 10 \* ROW_MAX_H/.test(BN), "the panel's maxHeight is computed from ROW_MAX_H, not from a literal");

// ═══════════════════════════════════════════════════════════════════════════
// v6.97 — THE ANSWER HEADLINE, THE HEAD SLICE, AND THE MOOD ROW.
//
// The surface now states an answer before it asks anything: a headline, a real
// count, three results, a way to see the rest, and four moods. Each of those is
// a promise to a reader who has about ten seconds, and each can rot silently.
// ═══════════════════════════════════════════════════════════════════════════
{
  // Reuses the module-level BN, which already strips {/* JSX comments */} with
  // the NARROW pattern this repo learned the hard way (a greedy /* */ strip
  // once deleted 158KB of live code from app/home.js because regex literals
  // contain "/*"). Re-reading raw would make every assertion below match this
  // file's own explanatory comments — which is exactly how the "old eyebrow is
  // gone" check first failed: the only remaining occurrence was in a comment
  // describing its removal.

  // ── the headline ──
  ok(/<h2[^>]*>\s*\{headline\.lead\}/.test(BN.replace(/\n\s*/g, " ")),
     "the answer renders as an h2 — it is the page's real heading, not decorative text");
  ok(/backgroundClip: "text"[\s\S]{0,80}\{headline\.tail\}/.test(BN),
     "…with the time-of-day half carrying the gradient, as approved");
  ok(!/Nearby, right now/.test(BN),
     "the old eyebrow is gone — it described the section instead of answering the question");

  // ── every number in it is real ──
  ok(/const n = openList\.length;/.test(BN),
     "the headline's count comes from the list actually rendered, never a literal");
  ok(/n \? n \+ " places "/.test(BN),
     "the count clause is DROPPED when the list is empty or loading — '0 places scored' is worse than no count");
  ok(!/\b30 places\b/.test(BN) && !/See all 30\b/.test(BN),
     "no hard-coded result count survives from the mockup — the mockup said 30, the engine says what it says");
  ok(/See all \{list\.length\} ranked near you/.test(BN),
     "the see-all label counts the real list, so it can never over-promise");
  ok(/hourLabel\(ctx\.hour\)[\s\S]{0,40}ctx\.dayName/.test(BN),
     "the hour and day come from the same nowContext() the RANKING uses — a headline on a different clock than the sort is a lie about what was ranked");
  ok(/Math\.floor/.test(BN.slice(BN.indexOf("function hourLabel"), BN.indexOf("function hourLabel") + 400)),
     "the hour label is whole-hour — minute precision on a daypart-bucketed ranking claims accuracy the sort does not have");
  ok(/no paid placement/.test(BN), "the integrity line ships with the answer, not buried in a footer");

  // ── the head slice ──
  const head = BN.match(/const HEAD_COUNT = (\d+)/);
  ok(!!head && Number(head[1]) === 3, `HEAD_COUNT is 3 (got ${head && head[1]}) — the approved design shows three above the fold`);
  ok((BN.match(/showAll \? list : list\.slice\(0, HEAD_COUNT\)/g) || []).length === 2,
     "BOTH lists (eat and things-to-do) slice to the head — one that ignored it would push the other's see-all off screen");
  ok(/setShowAll\(false\);/.test(BN.slice(BN.indexOf("const toggle ="), BN.indexOf("const toggle =") + 400)),
     "switching section resets see-all — it is a statement about the list in front of you, not a sticky preference");

  // ── the mood row points at REAL pages ──
  const moodBlock = BN.slice(BN.indexOf("const MOODS = ["), BN.indexOf("];", BN.indexOf("const MOODS = [")));
  const hrefs = [...moodBlock.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  ok(hrefs.length >= 3, `the mood row has real destinations (got ${hrefs.length})`);
  for (const h of hrefs) {
    const dir = path.join(REPO, "app", h.replace(/^\//, ""));
    ok(existsSync(path.join(dir, "page.js")),
       `mood chip "${h}" resolves to a real page (app${h}/page.js) — a chip that 404s is a dead end at the exact moment someone is deciding to trust this`);
  }
  ok(/href: null/.test(moodBlock),
     "the current view renders as SELECTED STATE, not a link to the page the reader is already on");
  ok(/Or change the mood/.test(BN), "the row is labelled, so the chips read as alternatives rather than filters already applied");
}

// THE REPORT MUST BE THE LAST THING BEFORE THE SUMMARY.
//
// It used to sit in the middle of this file. `ok()` here COLLECTS failures
// rather than exiting on the first one (so a run reports everything wrong at
// once, which is the better behaviour) — but that makes placement load-bearing:
// every assertion written below the report was collected into `fail` and then
// never looked at. Nineteen assertions were added in v6.97 and silently
// discarded; the guard cheerfully printed "69 assertions passed" while holding
// nine real failures. Anything appended after this block is invisible.
// scripts/check-guard-integrity.mjs asserts this ordering across the suite.
if (fail.length) {
  console.error(`check-home-answer-first: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-home-answer-first: ${pass} assertions passed (default section "${decl[2]}", ${ids.length} sections, ranked list leads the feed at index ${iBest})`);
