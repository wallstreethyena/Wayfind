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
const EXP = readFileSync(path.join(REPO, "app/components/ExplodingNearby.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const COLLAPSE = readFileSync(path.join(REPO, "lib/railCollapse.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
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
   Exploding owns its supplied-list/local-inventory request while older rows load
   through ensureLoaded(). Both paths are pinned: an open answer whose request
   never starts is an empty box that merely looks broken. */
ok(/const ensureLoaded\s*=\s*\(/.test(CODE), "the fetch is factored into ensureLoaded()");
const mountEffect = CODE.match(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}, \[open,/);
ok(!!mountEffect, "an effect keyed on `open` drives lazy fetches for the existing sections");
ok(!!mountEffect && /ensureLoaded\(open\)/.test(mountEffect[1]),
  "that effect calls ensureLoaded(open) — otherwise an opened legacy section can stay empty");
ok(!!mountEffect && /isFinite\(center\.lat\)/.test(mountEffect[1]),
  "it waits for a real centre before fetching — an unconditional mount fetch would fire one request per visitor with lat=undefined");
// RE-POINTED 2026-08-16. This asserted that the mounted <ExplodingNearby>
// only loads while its section is open — a real rule about not firing a
// third-party-backed request for a collapsed section. The component is no
// longer mounted (see the removal note in app/components/BestNearby.js), so
// there is nothing to gate. What must NOT happen is the component coming back
// WITHOUT that gate, so the rule is kept in its conditional form: if it is
// mounted at all, it is still gated on the section being open.
ok(!/<ExplodingNearby[\s/>]/.test(CODE) || /<ExplodingNearby[\s\S]{0,180}active=\{sectionOpen\("exploding"\)\}/.test(CODE),
  "if the Exploding Nearby loader is mounted at all, it still only activates while its section is open");
ok(/if \(!active \|\| !center \|\| !Number\.isFinite\(center\.lat\) \|\| !Number\.isFinite\(center\.lng\)\) return;/.test(EXP),
  "the Exploding request waits for both an open section and a real location");
// v8.25 re-point (owner: "the exploding trends always take so long to
// load"): the call gained an onPartial stream so batch 1 renders in ~1.5s
// instead of after the whole walk. Same resolver, same inputs — the
// assertion follows the call shape and now also demands the stream.
ok(/loadProvidedTrendList\(\{\s*center, city, signal: ctrl\.signal,/.test(EXP) && /onPartial: \(body\) =>/.test(EXP),
  "the default-open answer resolves the supplied trend list against current local inventory, streamed batch by batch");

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
// v8 (2026-08-15) — WHAT THIS SECTION MEASURES NOW.
//
// The two CONTENT surfaces the ranked list had to lead were the events rail and
// the promo hero deck. The deck is gone (its eight cards are eight of the
// fifteen in <DaypartRail>), and the events rail moved into the menu as section
// nine of BestNearby back in v7.06 — so it renders INSIDE the answer rather
// than after it, which is why the old `iBest < iEvents` probe now reads -1.
//
// The v6.58 measurement stands and is asserted below in its true form: nothing
// that ADVERTISES Wayfind may sit above the ranked answer. What sits above it is
// NAVIGATION — the rail, the six category tiles, the discovery rail — which is
// the class the owner explicitly hoisted in v6.62 and v6.65. The difference,
// and the reason the rail belongs in that class rather than the deck's: picking
// a rail card drops eight ranked place cards in place, so it PRODUCES an answer
// instead of pointing at one.
const iRail = HOME.indexOf("{railMenuBand}");
const iCatMenu = HOME.indexOf("<CategoryMenu nav activeCat=");
const iMenu = HOME.indexOf("const discoveryMenu");
const iMenuUse = HOME.indexOf("{discoveryMenu}");
// v8.87 — re-anchored to the thunk. The slot left BestNearby's ninth section
// for the component body and is now handed to <DaypartRail eventsSlot>, where
// it opens as the events tile's drop — which is the first time it rendered at
// all. See scripts/check-events-rail-renders.mjs.
const iEventsSlot = HOME.indexOf('const eventsRailSlot = (mode = "events") => {');
const iTopbar = HOME.indexOf('className="wf-topbar"');
const iScrollArea = HOME.indexOf('className="wf-scrollarea"');

// RE-POINTED v8.8 (owner, 2026-08-18, screenshots: "the menus here should all
// be moved to the amazon rail cards categories … the menus should only show
// when the cards is clicked"). <BestNearby> — the Top-40 accordion, the eight
// section shells, the creator shelf and the events slot — no longer renders on
// "/". The rail's fifteen tiles are the ONE menu, and picking a card drops the
// ranked place cards in place, in one tap — which is the v6.58 answer-first
// rule re-housed, not repealed: the answer is still one gesture from the first
// screen, and nothing that advertises Wayfind sits above it. What flips is the
// direction of this assertion: BestNearby mounted again is now the regression
// (a second, stacked copy of the menu — the duplication the owner has been
// photographing since v8.2). Same treatment TodaysBest got in v6.46 and
// ExplodingNearby in v8.6.
ok(iBest === -1, "the BestNearby accordion is mounted on the homepage again — a second, stacked copy of the rail menu (owner removed it 2026-08-18)");
ok(iRail > -1, "PROBE: the rail band is rendered in the feed (if this is -1 the comparisons below prove nothing)");
ok(iCatMenu > -1, "the six categories still render — as the header tab strip (<CategoryMenu nav ...>). A -1 here used to SATISFY the ordering assertion below");
ok(iMenuUse > -1, "the shortcut row still renders — as the header's Shortcuts panel");
ok(iEventsSlot > -1, "PROBE: the events rail is still built (v8.87: in the component body, handed to the rail menu as the events tile's drop)");
ok(iTopbar > -1 && iScrollArea > iTopbar, `PROBE: the header subtree is delimited (topbar ${iTopbar} < scrollarea ${iScrollArea})`);

// BOTH CONTROLS LIVE IN THE HEADER, above the entire feed at every width.
// That is strictly stronger than the old "above <BestNearby> inside the same
// column": nothing in the feed can now be reordered above them at all.
ok(iCatMenu > iTopbar && iCatMenu < iScrollArea, `the six categories render inside the header (${iCatMenu}), above the whole feed — owner 2026-08-15, and it still satisfies v6.62's "add this to the top of the page"`);
ok(iMenuUse > iTopbar && iMenuUse < iScrollArea, `the shortcut row renders inside the header (${iMenuUse}), above the whole feed — owner directive 2026-08-08 is unchanged, only its position is`);
// v8.8: with the accordion unmounted, "leads the feed" means the rail band is
// the first content element after the header — both header controls precede
// it, and it precedes the guide bridge that now opens the in-feed column.
ok(iRail > iScrollArea, `the rail band renders in the feed, below the header (${iRail} vs scrollarea ${iScrollArea})`);
ok(iCatMenu < iRail && iMenuUse < iRail, "…and both navigation controls still precede the rail (they live in the header)");
ok((HOME.match(/discoveryMenu\}/g) || []).length === 1,
  "the discovery rail renders from exactly ONE site — it used to sit in three mutually exclusive events-state branches, which is how it ended up below the fold in every one of them. v8.2: that one site is the header panel");

// AND NOTHING ELSE MAY. This is the v6.58 rule stated as what it always meant:
// a stranger meets an answer, not an advert for us. The promo deck was the
// advert, and it must not come back — above the answer or anywhere.
ok(!/<HeroRail>/.test(HOME), "the promo hero deck is back — a stranger must meet an answer, not an advert for us (v6.58)");
ok(!/function DiscoveryHeroCard\(/.test(HOME), "…including its orientation card");
// The rail is navigation only if it OPENS onto ranked places. If it ever
// becomes a row of pictures that merely navigate away, it has become the deck.
{
  const RAIL = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
  ok(/<IconicPlaceCard/.test(RAIL),
    "the rail must drop REAL ranked place cards when a card is picked — without that it is the promo deck with better art");
  ok(/href=\{href\}/.test(RAIL) && /e\.preventDefault\(\)/.test(RAIL),
    "…and every tile must be a real <a href> that a crawler can follow, intercepted only for a plain left click");
}

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
// v7.06 — THE RULE INVERTED, by owner directive (2026-08-09): "no verified hook
// means render nothing". Until now the eat row read
// why={toHookLine(...) || reasonLine(...)} and the things-to-do row read
// why={reasonLine([r.subtitle])}, on the older principle that a row must never
// LOSE text. That principle is exactly what put a generic engine reason — one
// true of fifty other places — under a card whose whole job is to say why THIS
// one. The place rows now render the verified editorial line or nothing at all.
//
// The invariant this section protects is unchanged in substance: every row list
// still routes `why` through a GOVERNED source and nothing generic is invented.
// What changed is WHICH source governs WHICH list. All three halves are
// asserted, because dropping any one of them is a real regression:
// v6.68: the ranked lists moved onto RailCard, whose editorial slot is named
// `take` (RailCard.js) rather than `why`. The prop is the only thing that
// changed — the law below is #689's, unweakened: a PLACE row renders the
// verified hook or nothing, and a TOUR keeps its supplier subtitle.
const hookWhy = [...BN.matchAll(/take=\{toHookLine\(/g)].length;
ok(hookWhy >= 2, `both PLACE row lists render the verified editorial line (found ${hookWhy}, expected 2: eat, things-to-do)`);
// The fallback that the law forbids. This is the assertion that would have gone
// red on the old code, and it is what keeps the filler from creeping back.
const fallbackWhy = [...BN.matchAll(/take=\{[^}]*toHookLine\([^}]*\|\|/g)].length;
ok(fallbackWhy === 0, `no place row falls back from the editorial line to generic filler (found ${fallbackWhy}) — "no verified hook means render nothing"`);
// ...but a TOUR is not a place. A Viator product has no wf_editorial row, so a
// hook it can never have must not blank the supplier subtitle it legitimately
// does have. reasonLine still governs that one list.
const tourWhy = [...BN.matchAll(/take=\{reasonLine\(/g)].length;
ok(tourWhy >= 1, `the tours row still renders its supplier subtitle through reasonLine (found ${tourWhy}) — a product with no editorial row must not be blanked`);
ok(/function Row\(\{[^}]*\bwhy\b/.test(BN), "Row accepts a `why` prop");
ok(/\{why \? \(/.test(BN), "Row renders the why line conditionally — a place with no reason must not get an empty div");

/* §C — the clip. The expanded panel is overflow:hidden with a hard maxHeight
   tuned to the pre-reason row. Taller rows silently lose the bottom of the
   list: no error, no warning, nothing in a diff. */
ok(/const ROW_MAX_H = (\d+);/.test(BN), "the row height budget is a named constant");
const rowMax = Number((BN.match(/const ROW_MAX_H = (\d+);/) || [])[1]);
ok(rowMax >= 96, `ROW_MAX_H is at least 96 (got ${rowMax}) — 64 was the pre-reason row and a two-line why adds ~32px, so the last rows get clipped`);
ok(/maxHeight: isOpen \? \(sdef\.maxHeight \|\| 10 \* ROW_MAX_H \+ 220\)/.test(BN), "ordinary panels compute maxHeight from ROW_MAX_H while the three-card answer may declare a larger named budget");

// ═══════════════════════════════════════════════════════════════════════════
// v7.10 — ONE IMMEDIATE ANSWER, THEN OPTIONAL PATHS.
//
// Exploding Near You replaces the old time-of-day/count headline. It opens to
// three substantial trend answers; every existing discovery path underneath
// starts closed and retains its real query/card treatment when opened.
// ═══════════════════════════════════════════════════════════════════════════
{
  // Reuses the module-level BN, which already strips {/* JSX comments */} with
  // the NARROW pattern this repo learned the hard way (a greedy /* */ strip
  // once deleted 158KB of live code from app/home.js because regex literals
  // contain "/*"). Re-reading raw would make every assertion below match this
  // file's own explanatory comments — which is exactly how the "old eyebrow is
  // gone" check first failed: the only remaining occurrence was in a comment
  // describing its removal.

  // ── the answer and exact hierarchy ──
  // ── RE-POINTED 2026-08-16, and this is what moved. ──────────────────────
  //
  // These three used to pin Exploding Trends Near You as the first section:
  // its exact descriptor literal, its h2, and its position ahead of the Top
  // 40. The section is GONE — not demoted, removed — because it could only
  // ever render its own error. EXPLODING_TOPICS_IMPORT_CADENCE was set in no
  // environment and all three wf_trend_* tables held zero rows, so
  // /api/trends/nearby answered 503 on every request and every visitor in
  // every metro read "Trend recommendations are temporarily unavailable" in
  // the first slot of the homepage, opened by default.
  //
  // THE INVARIANT THESE WERE WRITTEN FOR SURVIVES INTACT: the reader gets ONE
  // immediate answer at the top, as a real heading, before any optional path.
  // Only the identity of that answer changed — The Best Around You inherits
  // the slot, the h2 and the open-by-default state. So these are re-aimed at
  // the answer section rather than deleted, and a new assertion below makes
  // the removal itself explicit so nobody restores the old order by reflex.
  ok(/sdef\.heading[\s\S]{0,100}<h2[^>]*>[\s\S]{0,80}\{sdef\.label\}<\/h2>/.test(BN),
     "the leading answer renders as an h2 — it is the page's real heading, not decorative text");
  ok(/const TOP40_SECTION = \{[^}]*\bheading: true\b/.test(BN),
     "The Best Around You carries heading: true — otherwise the h2 branch above is dead code and the page's leading section has no heading element at all");
  ok(!/<SectionShell sdef=\{EXPLODING_SECTION\}/.test(BN) && !/<ExplodingNearby[\s/>]/.test(BN),
     "the Exploding Trends section is still absent — it may only come back with a real snapshot behind it (scripts/check-trend-section-honesty.mjs holds that gate)");
  const iBestRender = BN.indexOf("<SectionShell sdef={TOP40_SECTION}");
  const iMappedRender = BN.indexOf("{SECTIONS.map((sdef)");
  ok(iBestRender > -1 && iBestRender < iMappedRender,
     "The Best Around You renders first and the mapped discovery rows follow");
  ok(/const TOP40_SECTION = \{ id: "best", label: "The Best Around You", sub: "Ten answers, zero tabs: the highest Wayfind Scores near you\. No paid placement\."/.test(BN),
     "the existing Top 40 behavior is preserved under the approved Best Around You name");
  const sectionBlock = BN.slice(BN.indexOf("const SECTIONS = ["), BN.indexOf("const trendsBody"));
  const expectedSections = [
    ["Actually Worth Eating", "Endless reviews or one honest answer — ranked for this hour, not for advertisers."],
    ["The 30-Minute Break", "Half the break dies deciding. The best quick, counter-serve food near you — already ranked."],
    ["What Should We Do Today?", "Ends the 'I don't know, you pick' spiral: real plans, ranked for right now."],
    ["Places You'd Never Find", "Loved by the few who've found them, missed by the big lists — and near you."],
    ["Locals Know", "Not a listicle: creators who actually went, matched to places near you."],
    ["Tonight's Move", "Plans that fit tonight's hours — not somebody's reheated weekend list."],
    ["Worth the Drive", "An hour in the car has to earn itself. These are the ones that do."],
    ["Events Near You", "Stop finding out the day after: concerts, shows and one-nighters near you."],
  ];
  const actualSections = [...sectionBlock.matchAll(/\{ id: "[a-z]+", label: "([^"]+)", sub: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
  ok(JSON.stringify(actualSections) === JSON.stringify(expectedSections),
     `the eight optional rows use the exact approved order, names and support lines (got ${JSON.stringify(actualSections)})`);
  const collapsedDecl = COLLAPSE.match(/DEFAULT_COLLAPSED_RAILS\s*=\s*(\[[^;]+\])/);
  let collapsedDefaults = [];
  try { collapsedDefaults = collapsedDecl ? JSON.parse(collapsedDecl[1]) : []; } catch (e) {}
  // RE-POINTED with the same move. The rule was never "exploding is open" —
  // it was "EXACTLY ONE primary section is open for a new visitor, and it is
  // the answer". Written as a named exclusion, it would have gone GREEN the
  // moment exploding was removed while every remaining id stayed in the list,
  // which is a homepage of nothing but closed headers. So it now asserts the
  // property directly: the answer is open, everything below it is closed.
  ok(!collapsedDefaults.includes("best"),
     "The Best Around You must be open for a new visitor — it is the one immediate answer, and with Exploding removed it is the only thing standing between the reader and a page of closed accordion headers");
  ok(["eat", "quickbite", "todo", "gems", "creators", "events", "tonight", "drive"].every((id) => collapsedDefaults.includes(id)),
     "every optional discovery path below the answer still starts collapsed");
  // v7.29 — THIS USED TO PARSE A HAND-COPIED ARRAY LITERAL out of the inline
  // script and compare it to lib/railCollapse.js. That is a drift DETECTOR for a
  // duplication that did not need to exist. app/layout.js now interpolates the
  // constants directly, so the two cannot disagree, and what is worth asserting
  // is that it still does — a future edit that pastes a literal back in would
  // restore the drift silently, and the old assertion would have passed on it.
  const layout = readFileSync(path.join(REPO, "app/layout.js"), "utf8");
  const prepaint = (layout.match(/<script dangerouslySetInnerHTML=\{\{ __html: `\(function\(\)\{try\{var r=localStorage[^`]*`/) || [""])[0];
  ok(!!prepaint, "the pre-paint rail-collapse script is still an inline template literal in app/layout.js");
  for (const name of ["RAILS_COLLAPSED_KEY", "RAILS_COLLAPSED_ATTR", "DEFAULT_COLLAPSED_RAILS", "DEFAULT_COLLAPSED_RAILS_DESKTOP", "RAILS_DESKTOP_MQ"]) {
    ok(prepaint.includes("${" + name + (name === "DEFAULT_COLLAPSED_RAILS" ? "" : "") + "}") || prepaint.includes("${JSON.stringify(" + name + ")}"),
       `the pre-paint script reads ${name} from lib/railCollapse.js instead of restating it — a pasted literal is how the pre-paint default and React's default drift apart`);
  }
  ok(/import \{[^}]*DEFAULT_COLLAPSED_RAILS_DESKTOP[^}]*\} from "\.\.\/lib\/railCollapse"/.test(layout),
     "app/layout.js imports the collapse constants it interpolates");
  // The desktop default is DERIVED from the phone default, so the only thing a
  // reader on a wide screen can get that a phone reader cannot is a rail that
  // was explicitly named as open. Exploding must still never be in either —
  // and since 2026-08-16 it is in neither because it does not exist.
  const desktopOpenDecl = COLLAPSE.match(/RAILS_OPEN_ON_DESKTOP\s*=\s*(\[[^;]+\])/);
  let desktopOpen = [];
  try { desktopOpen = desktopOpenDecl ? JSON.parse(desktopOpenDecl[1]) : []; } catch (e) {}
  ok(desktopOpen.length > 0 && desktopOpen.every((id) => collapsedDefaults.includes(id)),
     "every rail opened by default on desktop is one the phone default closes — otherwise the desktop list is not a derivation of the phone list, it is a second hand-maintained one");
  ok(/DEFAULT_COLLAPSED_RAILS_DESKTOP = DEFAULT_COLLAPSED_RAILS\.filter/.test(COLLAPSE),
     "the desktop collapsed set is derived from the phone set by filter, so a rail shipped next month is closed by default on both");
  // The open direction of the pre-paint has to expire, or the accordion loses
  // its transition forever after hydration. See WF_RAIL_COLLAPSED_CSS.
  ok(/:not\(\[data-wf-rails-ready\]\)/.test(readFileSync(path.join(REPO, "app/components/css.js"), "utf8")),
     "the pre-paint OPEN rule is scoped to :not([data-wf-rails-ready]) so it stops overriding React's inline max-height once the real state is committed");
  ok(/markRailsReady\(\)/.test(readFileSync(path.join(REPO, "app/components/BestNearby.js"), "utf8")),
     "something raises the ready marker — without it the !important open rule never expires");
  ok(!/Nearby, right now/.test(BN),
     "the old eyebrow is gone — it described the section instead of answering the question");

  // ── every number and claim in the cards is real ──
  ok(!/\b30 places\b/.test(BN) && !/See all 30\b/.test(BN),
     "no hard-coded result count survives from the mockup — the mockup said 30, the engine says what it says");
  // SUPERSEDED with the head-of-three (owner, 2026-08-09). The label used to
  // read "See all 10 ranked near you" because the list showed three of ten; the
  // rail shows all ten, so the link now offers what is genuinely BEYOND them.
  // The invariant is the one that mattered: the number in the label is computed
  // from the rendered list, never typed.
  ok(/"Search past these " \+ list\.length/.test(BN),
     "the more-link counts the real list, so it can never over-promise");
  ok(/Trend momentum selects experiences\. Wayfind Score ranks places\. No paid placement\./.test(EXP),
     "the trend/score boundary and integrity line ship with the answer, not buried in a footer");

  // ── THE LIST IS NOT CUT ANY MORE (owner, 2026-08-09) ──
  // SUPERSEDES the head-of-three. "No longer place the 10 restriction on these
  // lists… the top 10 should be sufficient." The three assertions that used to
  // live here pinned HEAD_COUNT = 3, both lists slicing to it, and the see-all
  // that expanded them. All three described a VERTICAL list, where three rows
  // was what fit above the fold. The lists are rails now: one card is visible
  // at a time whatever the length, so the slice bought no vertical space and
  // cost seven ranked picks. What is worth pinning is the replacement promise —
  // the reader sees every row the engine returned, and there is a real route to
  // more.
  ok(!/HEAD_COUNT/.test(BN),
     "the head-of-three is gone, constant and all — a leftover HEAD_COUNT is how a slice quietly comes back");
  ok((BN.match(/<RailNav railId=\{sdef\.id\} count=\{list\.length\}/g) || []).length === 1,
     "the rail's count is list.length — the number stated is the number rendered, so it can never over-promise");
  ok(/list\.map\(\(p, i\) =>/.test(BN) && /list\.map\(\(r, i\) =>/.test(BN) && !/list\.slice\(/.test(BN),
     "BOTH ranked lists (eat and things-to-do) render the WHOLE list — and no list.slice( survives anywhere in the file");
  {
    // The way to more must be a page that exists. A "search past these 10" that
    // 404s is worse than no link at all: it breaks trust at the exact moment
    // someone has decided the ranking is worth following.
    const mores = [...BN.matchAll(/href=\{sdef\.id === "eat" \? "([^"]+)" : "([^"]+)"\}/g)];
    ok(mores.length === 1, `the two ranked sections share ONE more-link expression (found ${mores.length})`);
    for (const h of (mores[0] || []).slice(1)) {
      ok(existsSync(path.join(REPO, "app", h.replace(/^\//, ""), "page.js")),
         `the more-link "${h}" resolves to a real page (app${h}/page.js)`);
    }
  }

  // ── SUPERSEDED: the mood row is gone (owner, 2026-08-09) ──
  // "This shows what we need to remove now that the menu has been updated."
  // The four chips (Right now / Date night / Family / Hidden gems) lived inside
  // the FOOD section and pointed at routes that are now SECTIONS OF THIS MENU a
  // few rows below — so they had become a second, worse navigation to
  // destinations already on screen, nested inside one of the sections they
  // competed with.
  //
  // The assertion that mattered is kept and re-pointed rather than deleted: the
  // menu's own section list must still name only intents that resolve to a real
  // page, because a dead end here is a dead end at the exact moment someone has
  // decided to trust the ranking. This is the stronger version of the old check
  // — it covers every intent rail that remains in the experiment hierarchy.
  const intents = [...BN.matchAll(/intent: "([a-z-]+)", href: "([^"]+)"/g)];
  ok(intents.length === 4, `the menu's four intent sections declare their destinations exactly once (found ${intents.length}, expected 4)`);
  // Red-prove of 2026-08-11: intent: "quick-bite", href: "/budget" passed the
  // count check. The heading and the destination are ONE promise — bind them.
  for (const [, intent, href] of intents) {
    ok(href === "/" + intent, `menu section for "${intent}" links its own page (got ${href})`);
  }
  for (const [, intent, href] of intents) {
    ok(existsSync(path.join(REPO, "app", href.replace(/^\//, ""), "page.js")),
       `section "${intent}" points at a real page (app${href}/page.js)`);
  }
  ok(/onBudget=\{\(\) =>[\s\S]{0,220}goIntent\("\/budget"\)/.test(HOME),
     "Big fun, small budget remains reachable through the existing discovery menu after leaving the primary accordion");
  ok(/const eventsRailSlot\s*=/.test(HOME) && /setScreen\("events"\)/.test(HOME) && /id: "events"[\s\S]{0,180}slot: "events"/.test(BN),
     "event discovery is restored as a primary accordion row and keeps its existing all-events destination");
  ok(!/Or change the mood/.test(BN),
     "the in-section mood chips are gone — the menu IS the mood switcher now");

  // v8.4 (owner, 2026-08-16): the weather card and "Deals near you" come off
  // the homepage at EVERY width. HomeAside itself is deliberately kept — the
  // component and its dealTiers wiring are intact — but "/" must neither
  // render nor eagerly import it. AGENTS.md §7 is the reason this is pinned at
  // all: a 3-way merge keeps someone else's newer copy of a block that a
  // change was meant to remove, which is how the taste editor nearly shipped
  // back after being explicitly deleted.
  ok(!/<HomeAside[\s/>]/.test(HOME),
     "the homepage renders <HomeAside> again — the weather card and Deals were removed from \"/\" at every width (owner, 2026-08-16). Deals stays reachable through the Coupons tab, which owns the vetted card and the attribution.");
  ok(!/import\s+HomeAside\s+from/.test(HOME),
     "the removed HomeAside is still an eager homepage dependency — unmounted code must not consume first-load JS");

  // ═════════════════════════════════════════════════════════════════════════
  // v8.2 (owner, 2026-08-15) — A COLLAPSED SECTION IS NOT A MENU ROW.
  //
  // Nine closed rows sat under the rail listing the same nine titles the rail's
  // own cards carry: lib/rails.js declares trending / best / eat / break /
  // today / gems / locals / tonight / drive under those exact names. The
  // accordion had become a second copy of the navigation directly beneath it.
  //
  // The SECTIONS stay, the data stays, and the reader's collapse preference
  // stays (owner, 2026-08-09: "keep only the menus they want expanded… that way
  // they can research it faster") — a closed section simply renders nothing
  // instead of rendering a row that says its name.
  // ═════════════════════════════════════════════════════════════════════════
  ok(/style=\{\{ display: isOpen \? "block" : "none",/.test(BN),
     "a collapsed section is display:none — otherwise the nine closed name rows come back as a second copy of the rail's own card titles");
  // DISPLAY, NOT AN UNMOUNT. "/" is ISR-cached, so one HTML document carrying the
  // phone default reaches every reader; a section removed from the tree could
  // only be corrected after hydration, and every section that differed would pop
  // in or out. That is the 0.4938 CLS shape test-layout-shift §5 exists for.
  ok(!/\{\s*isOpen\s*&&\s*<SectionShell/.test(BN) && !/if \(!isOpen\) return null/.test(BN),
     "the section is HIDDEN, never unmounted — an unmounted section cannot be corrected before first paint on an ISR-cached page");

  // The pre-paint half. The attribute can only ever name what is CLOSED, so the
  // open direction needs its own rule, and it must expire once React's inline
  // styles are correct or the accordion loses its transition forever.
  {
    const CSS = readFileSync(path.join(REPO, "app/components/css.js"), "utf8");
    ok(/html\[data-wf-rails~="\$\{id\}"\] \[data-wf-section="\$\{id\}"\]\{display:none!important\}/.test(CSS),
       "the pre-paint rule hides a closed section from FIRST PAINT — without it the row flashes on screen before React can hide it");
    ok(/:not\(\[data-wf-rails-ready\]\):not\(\[data-wf-rails~="\$\{id\}"\]\) \[data-wf-section="\$\{id\}"\]\{display:block!important\}/.test(CSS),
       "…and the OPEN direction too, scoped so it expires — the attribute only ever names what is closed");
    // Every id the reader can collapse needs BOTH rules, or that one section
    // flashes. quickbite was missing from RAIL_IDS entirely until v8.2.
    const sectionIds = [...CODE.matchAll(/\{\s*id:\s*"([a-z]+)"\s*,\s*label:/g)].map((m) => m[1]);
    const railIds = JSON.parse((COLLAPSE.match(/RAIL_IDS = (\[[^\]]+\])/) || [, "[]"])[1]);
    ok(sectionIds.length >= 8, `PROBE: the section ids were read (${sectionIds.length})`);
    for (const id of sectionIds) {
      ok(railIds.includes(id),
         `section "${id}" is not in RAIL_IDS, so css.js emits no pre-paint rule for it and it is the one section that flashes on every load`);
    }
  }

  // THE EMPTY FEED. With closed sections hidden rather than listed, a reader who
  // has collapsed everything gets the rail and then a blank page. That is a real
  // stored state, not a corner case — the note above applyCollapsedAttr in
  // lib/railCollapse.js records the owner's OWN set as every section closed.
  ok(/const allSectionsClosed = !\[/.test(BN),
     "the component knows when every section is closed");
  ok(/\.\.\.SECTIONS\.map\(\(sd\) => sd\.id\)/.test(BN),
     "…and derives that from the SECTIONS array, so a section added next month is counted without editing a second list");
  ok(/\{allSectionsClosed \? \(/.test(BN),
     "…and renders something when it is true — silence under the rail is indistinguishable from a broken build");
  ok(/You have closed every list\./.test(BN),
     "…and says so in words rather than leaving an empty column");
  ok(/onClick=\{restoreSections\}/.test(BN) && /const restoreSections = \(\) => \{/.test(BN),
     "…and offers the way back. Without it, hiding closed sections makes collapsing a one-way door");
  ok(/writeCollapsed\(\[\]\)/.test(BN),
     "restoring PERSISTS — a reset that only touches React state is undone by the next reload, which reads storage");
}

// ═══════════════════════════════════════════════════════════════════════════
// v6.97b — THE REST OF THE APPROVED SCROLL: creator finds get their own row,
// the guides finally get linked from home, and the six categories move below
// the answer instead of being the first thing a stranger has to solve.
//
// RESTORED in v6.98. This entire block shipped in #631 and was DELETED by
// #632 — a PR about creator photo consent, which touched none of the code
// below. Sixteen assertions went with it and the suite stayed green, because
// a guard that checks less still passes. check-guard-integrity.mjs catches
// assertions written BELOW the report; nothing caught assertions removed
// outright. The TDZ rule at the bottom is the one that took the home page
// down once already, and it has been unprotected since 2026-08-06.
//
// SUPERSEDED in part by v6.62 (2026-08-08, owner: "add this to the top of
// the page", re: the category row). The categories-below-the-answer ORDER
// assertion below is now categories-ABOVE-the-answer — a direct, explicit
// reversal, not a regression. Everything else in this block (BestNearby
// before CreatorFinds, the shared videoPlaces array, the TDZ rule, the
// bridge) is untouched; only the categories' position moved.
// ═══════════════════════════════════════════════════════════════════════════
{
  const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // ── order on the page: categories, then the answer, then creators ──
  // Anchor on the TAG, not on whichever prop happened to come first: #634
  // added `category=` to <BestNearby> and this restored assertion went red on
  // the very first run, which is the same pin-the-literal-source fragility
  // that broke four guards this week. The claim is about ORDER, not props.
  // RE-POINTED v8.8 (owner, 2026-08-18): <BestNearby> and its <CreatorFinds>
  // slot both left "/" — the rail's fifteen tiles are the one menu, its
  // `locals` tile is the creator surface (sourced from the registry itself in
  // lib/railsData.js buildCreatorsPool, which reaches MORE of the library than
  // the old shelf's pool-filter ever did), and its drop is the one-tap ranked
  // answer. The order claims below collapse into: neither accordion surface
  // may remount, and the categories tab strip still leads everything.
  const iBestNearby = HOME.indexOf("<BestNearby ");
  const iFinds = HOME.indexOf("<CreatorFinds items=");
  const iCats = HOME.indexOf("<CategoryMenu nav activeCat=");
  ok(iBestNearby === -1, "the BestNearby accordion is mounted on the homepage again (owner removed it 2026-08-18: 'the menus should only show when the cards is clicked')");
  ok(iFinds === -1, "the CreatorFinds shelf is mounted standalone on the homepage again — the locals rail tile is the creator surface now, and a second shelf is the stacked-menu duplication the owner removed");
  ok(!/import\s+BestNearby\s+from/.test(HOME), "the unmounted BestNearby accordion still consumes homepage first-load JS");
  ok(!/import\s+CreatorFinds\s+from/.test(HOME), "the unmounted CreatorFinds shelf still consumes homepage first-load JS");
  ok(iCats > 0, "the six categories still render as the header tab strip (v6.62's 'add this to the top of the page' still satisfied)");
  // …and the creator inventory the shelf carried still reaches the reader:
  // the locals rail is registry-sourced, asserted where that code lives
  // (scripts/check-rail-source-reachable.mjs pins pools:["creators"] and
  // lib/railsData.js buildCreatorsPool).
  {
    const RD = readFileSync(path.join(REPO, "lib/railsData.js"), "utf8");
    // v8.73 — the builders moved into two Promise.all waves (the cold /api/rails
    // path was measured at 25.4s against the client's 12s deadline, which is how
    // a tapped rail came back empty). The invariant here is untouched and still
    // the point: with the CreatorFinds shelf unmounted, the locals rail is the
    // only surface carrying the creator library, so the pool must still be BUILT
    // and still be ASSIGNED. Asserted in both halves — a builder called inside a
    // wave whose result is never assigned to pools.creators would leave the rail
    // empty exactly as if it had been deleted, and would pass a one-half check.
    ok(/buildCreatorsPool\(pools, origin\)/.test(RD),
       "the creator surface is gone from BOTH homes — the shelf is unmounted AND the rail's creators pool is no longer built. One of them must carry the library.");
    ok(/pools\.creators\s*=\s*creators;/.test(RD),
       "…and the built pool is assigned to pools.creators — a result computed and dropped is the same empty rail with a longer request");
  }

  // ── THE TDZ RULE, learned the hard way ──
  // useMemo evaluates its dependency ARRAY on the first render, so a hook that
  // reads a `const` declared further down throws "Cannot access before
  // initialization" and takes the whole page down. `check:jsx` passes on it —
  // tsc does not model temporal dead zones. This shipped-blocking bug was
  // caught by hand; this assertion is why it cannot come back.
  const iMemo = HOME.indexOf("const videoPlaces = useMemo(");
  ok(iMemo > 0, "videoPlaces is memoised");
  for (const dep of ["suggested", "places", "locName"]) {
    const iDecl = HOME.indexOf(`const [${dep},`);
    ok(iDecl > 0 && iDecl < iMemo,
       `"${dep}" is declared BEFORE the videoPlaces useMemo that depends on it — a later declaration is a temporal-dead-zone crash on first render, and tsc does not see it`);
  }

  // ── the bridge ──
  ok(/<LocalEdit center=\{locResolved \? center : null\}/.test(HOME) || /<LocalEdit center=\{center\}/.test(HOME), "the home screen links to the guides — they pull traffic from Google and dead-end without this");
  const LE = readFileSync(path.join(REPO, "app/components/LocalEdit.js"), "utf8");
  // v7.29: the pure half (radius, read time, the geo filter) moved to
  // lib/localEdit.js so the SERVER can build the index and the guide corpus
  // stops shipping in the homepage bundle. Same properties, asserted where the
  // code that owns them now lives — plus one new assertion that the corpus
  // cannot creep back into the client component.
  const LEL = readFileSync(path.join(REPO, "lib/localEdit.js"), "utf8");
  // Line-anchored so a PROSE mention of lib/guides.js in a comment (there are
  // several, and they are load-bearing documentation) is not read as an import.
  ok(!/^import[^\n]*from ["'][^"']*\/guides(Summer2026)?(\.js)?["']/m.test(LE + "\n" + LEL),
     "neither the client component nor its pure half imports the guide CORPUS — the homepage renders three titles and must not ship every intro, blurb, tip and FAQ answer to do it");
  ok(/if \(!rows\.length\) return null;/.test(LE),
     "LocalEdit renders NOTHING when no guide covers the reader's area — a 'local edit' heading over guides from three hours away is a false claim");
  const radius = Number((LEL.match(/LOCAL_EDIT_RADIUS_MI = (\d+)/) || [])[1]);
  ok(radius > 0 && radius <= 120, `the local radius is real and bounded (${radius} mi)`);
  ok(/export function readMinutes/.test(LEL) && /WORDS_PER_MIN/.test(LEL),
     "read time is COMPUTED from the guide's own body — a hand-typed '5 min' is a number nobody ever updates");
  ok(/g\.teaser/.test(LEL) && !/teaser:\s*"/.test(LE + LEL),
     "the teaser is the guide's OWN teaser, not new copy written here that can drift from what the article delivers");

  // ── the creator row ──
  const CF = readFileSync(path.join(REPO, "app/components/CreatorFinds.js"), "utf8");
  // 2026-08-07: the empty-state guard, updated for registry-hydrated cards. The
  // row now renders the nearest city's SCOUTED spots when the pool is empty
  // (owner: "I don't see creators on Sarasota"), so the null-return condition
  // gained `!scouted.length`. The invariant is unchanged: render NOTHING only
  // when there is genuinely nothing — no local find, no registry spots, and no
  // bridge.
  // v7.07 (#690) — REGISTRY SPOTS ARE NO LONGER A FALLBACK. scoutedSpots()
  // returned [] unless the pool was completely empty, so a reader with three
  // pool finds saw three cards while the registry held twenty more inside the
  // same 25 miles. The owner reported exactly that: "the finds from local
  // creators still only displaying 2, I asked for 20." The shelf was thin
  // because of a BRANCH, not because of coverage — "the limiter is the place
  // pool, not the library." mergeCreatorInventory() merges both into ONE
  // inventory.
  //
  // The invariant is unchanged and is what is asserted; it is strictly STRONGER
  // now, because `inventory` covers pool and registry rows together where the
  // old condition needed two separate terms to say the same thing.
  ok(/if \(!visibleInventory\.length && !bridge\) return null;/.test(CF),
     "the creator row renders nothing ONLY when there is no inventory at all (pool or registry) AND no bridge — an empty 'your differentiator' shelf advertises the absence");
  ok(/mergeCreatorInventory\(\{ pool: items, byCity/.test(CF),
     "the row builds ONE inventory from the pool and the registry together, rather than treating the registry as an empty-pool fallback");
  // v7.08 (owner screenshot: "Circles Waterfront" AND "Circles Waterfront
  // Restaurant" as cards 7+8 of one rail). EXECUTED, not grepped: the merge
  // must treat a registry spot whose name is a token-boundary root of a pool
  // place (or vice versa) as the SAME venue and keep the pool row only —
  // while short single-token registry roots ("Ryan") must NOT swallow
  // unrelated pool names sharing a first word.
  {
    const { mergeCreatorInventory: mci, sameVenueName } = await import("../lib/creatorFinds.js");
    ok(sameVenueName("Circles Waterfront", "Circles Waterfront Restaurant") === true, "suffixed venue name reads as the same venue");
    ok(sameVenueName("Ryan", "Ryan's Pizza") === false, "a short single-token root never swallows an unrelated business");
    const merged = mci({
      pool: [{ p: { id: "g1", name: "Circles Waterfront Restaurant", distMi: 3, rating: 4.6, reviews: 8700 }, creator: "secretsoftampabay" }],
      byCity: [{ city: "Apollo Beach", distMi: 4, spots: [{ key: "circles-apollo", name: "Circles Waterfront" }, { key: "other-spot", name: "Finn's Dockside Bar & Grill" }] }],
      radiusMi: 25, max: 20,
    });
    const circles = merged.filter((r) => /circles/i.test(r.kind === "pool" ? r.row.p.name : r.spot.name));
    ok(circles.length === 1 && circles[0].kind === "pool", `one venue renders ONE card and the measured pool row wins (got ${circles.length})`);
    ok(merged.some((r) => r.kind === "registry" && /finn/i.test(r.spot.name)), "a genuinely different registry spot in the same city still joins the shelf");
  }
  // …and the component holds the id-level net for whatever names miss: a
  // hydrated registry spot resolving to an id already on the shelf never
  // renders twice.
  ok(/_seenEntryIds\.has\(id\)\) return false;/.test(CF), "the visible list drops a second entry carrying an id the shelf already holds (post-hydration same-venue net)");
  // 2026-08-07 (owner: pin placeholders "not what I wanted"): the scouted cards
  // resolve REAL venue photos. Locked by structure — the search route now
  // returns photo_ref, and the component hydrates + renders it.
  {
    const searchRoute = readFileSync(path.join(REPO, "app/api/places/search/route.js"), "utf8");
    ok(/photo_ref: photoRef/.test(searchRoute) && /p\.photos\[0\]\.name/.test(searchRoute),
      "the places/search route surfaces photo_ref (first photo resource name) so a caller can render a venue photo without a second round-trip");
    // v7.07: renamed resolveScoutedPhoto -> resolveScoutedPlace when it started
    // also returning the rating/review pair behind the card's Wayfind Score —
    // same call, same endpoint, one more field read off the same response.
    ok(/resolveScoutedPlace\(/.test(CF) && /\/api\/places\/search\?q=/.test(CF),
      "CreatorFinds resolves each scouted spot's photo through the cached search endpoint");
    // v7.07 (#690) — the resolver went from a photo lookup to a full hydrator:
    // the SAME cached call now also returns the real types, rating and price
    // the FIELD_MASK was already being billed for. Types are what lib/dining.js
    // needs to name a cuisine, and without them a cuisine filter over scouted
    // spots would have nothing behind it. A looked-up number is not an invented
    // one — that is the whole distinction the registry/pool split turns on.
    ok(/types: Array\.isArray\(first\.types\)/.test(CF) && /first\.userRatingCount/.test(CF) && /signals\.rating/.test(CF),
      "…and normalizes both cached-inventory and raw-Google response shapes, keeping the real types, rating and review count behind the Wayfind Score");
    // v7.02: the row renders the shared RailCard, so the <img> moved out of
    // this file. FOLLOW THE CODE — assert both halves of the invariant across
    // the two files rather than deleting the protection: CreatorFinds hands
    // the resolved photo to the card, and the card renders a real <img> when
    // it has one and a placeholder tile only when it does not.
    const RC = readFileSync(path.join(REPO, "app/components/RailCard.js"), "utf8");
    // v7.07 (#690) — the hydrated PLACE, not a photo-only map. `h` is the
    // resolved Google place or null, and that SAME null decides every optional
    // field on the card: photo, score and facts. That is the honesty rule in
    // one variable — a card shows what was resolved and omits what was not.
    ok(/photo=\{\(h && h\.photo\) \|\| null\}/.test(CF),
      "…and hands that resolved photo to the card (the placeholder shows only while loading or on a genuine miss)");
    ok(/score=\{h && h\.rating \? toDisplayScore\(governedWayfindScore\(wayfindScore\(h\.rating, h\.reviews\), \{ hasCreatorVideo: true \}\)\) : null\}/.test(CF),
      "…a registry card scores ONLY when the lookup returned a real rating — an unresolved spot carries no score, never a zero or a guess");
    // 2026-09-01: named venue cards must not share category stock. A real
    // <img> renders only when the caller resolved that venue's own photo;
    // otherwise the branded monogram is the honest state.
    ok(/\{photo\s*\n?\s*\?\s*<img/.test(RC) && /src=\{photo\}/.test(RC) && /wf-place-card-monogram/.test(RC),
      "…and RailCard renders only the resolved venue photo, with a branded monogram on a genuine miss");
    ok(/\/api\/photo\?ref=/.test(CF) && /REF_RX\.test\(ref\)/.test(CF),
      "the photo goes through the guarded /api/photo proxy with a shape-checked ref — never a bare Google URL");
    ok(/center=\{center\}/.test(HOME) || /center: center/.test(HOME),
      "home.js passes the viewer center to CreatorFinds so the photo search is location-biased");
  }
  // Tests the PROPERTY (does it read a video thumbnail field?), not the word.
  // The first version grepped for "thumbnail" in raw source and failed on this
  // component's own comment explaining that it never uses one — the same
  // comment-matching mistake that bit the "old eyebrow is gone" check.
  ok(/p\.photo/.test(CF) && !/\bv\.thumbnail\b|videos\[0\]\.thumbnail/.test(CF),
     "cards use the PLACE's own photo and never read a video thumbnail field (the never-re-host rule)");
  ok(/PLATFORM\[v\.platform\]/.test(CF), "the platform badge comes from the single PLATFORM source, so a new platform is covered automatically");

  // ── v6.98 COVERAGE: one card is worse than none ──
  // The row was built for empty and for full, never for ONE. A reader in
  // Parrish got a single orphan card with dead space beside it, which reads as
  // a broken feature rather than as thin coverage. RANKING_AND_FEATURING_SPEC
  // §4 already ruled: below three, offer the nearest covered metro instead of
  // rendering a thin local list.
  //
  // The rule is EXECUTED here, not grepped. That is why it lives in lib/ — a
  // grep proves a constant exists, only a run proves the rule holds.
  const CFL = await import(new URL("../lib/creatorFinds.js", import.meta.url).href);
  // Executed, not grepped: scoutedSpots is pure logic in lib/, so prove it.
  {
    const byCity = [{ city: "Sarasota", distMi: 4, spots: [
      { key: "a", name: "Marie Selby Botanical Gardens", city: "Sarasota", video: { platform: "tiktok", creator: "thefloridaqueenie_" } },
      { key: "b", name: "Perspire Sauna Studio", city: "Sarasota", video: { platform: "tiktok", creator: "theerynlalonde" } },
      { key: "c", name: "Quiero Coffee", city: "Sarasota", video: { platform: "instagram", creator: "tampaiman" } },
    ] }];
    const br = CFL.bridgeCity(byCity, 0);
    const spots = CFL.scoutedSpots(byCity, br, 0);
    ok(spots.length === 3 && spots[0].name === "Marie Selby Botanical Gardens",
      `an empty pool renders the city's 3 real scouted spots, not a lone arrow (got ${spots.map((s) => s.name).join(", ")})`);
    ok(CFL.scoutedSpots(byCity, br, 5).length === 0,
      "when the pool ALREADY has finds (rowCount>0), the with-photo path is untouched — no registry fallback");
    ok(CFL.scoutedSpots(byCity, null, 0).length === 0, "no bridge -> no scouted fallback");
    ok(CFL.scoutedSpots(null, br, 0).length === 0, "no byCity -> no scouted fallback (fail-closed)");
  }
  ok(CFL.CREATOR_FINDS_MIN >= 2 && CFL.CREATOR_FINDS_MIN <= 4, `the thin-row threshold is real and small (${CFL.CREATOR_FINDS_MIN})`);
  ok(CFL.CREATOR_BRIDGE_MAX_MI > 0 && CFL.CREATOR_BRIDGE_MAX_MI <= 120, `"worth the drive" is bounded (${CFL.CREATOR_BRIDGE_MAX_MI} mi)`);

  const FAR = { city: "Faraway", spots: [1, 2, 3], distMi: CFL.CREATOR_BRIDGE_MAX_MI + 1 };
  const THIN = { city: "Thintown", spots: [1], distMi: 5 };
  const DEEP = { city: "Deepcity", spots: [1, 2, 3, 4, 5], distMi: 30 };
  const NOCOORD = { city: "Unplaced", spots: [1, 2, 3], distMi: null };

  ok(CFL.bridgeCity([THIN, DEEP], 1) && CFL.bridgeCity([THIN, DEEP], 1).city === "Deepcity",
     "ONE local find bridges to the nearest city that actually has depth — this is the Parrish case the owner reported, and the whole reason this rule exists");
  ok(CFL.bridgeCity([DEEP], CFL.CREATOR_FINDS_MIN) === null,
     "a healthy row is left alone — the bridge appears only BELOW the threshold, never as permanent furniture");
  ok(CFL.bridgeCity([THIN], 1) === null,
     "it never points at a city as thin as the one the reader is standing in — sending someone thirty miles for one card is the same disappointment, one town over");
  ok(CFL.bridgeCity([FAR], 0) === null,
     `a city past ${CFL.CREATOR_BRIDGE_MAX_MI} mi is a different trip, not a suggestion`);
  ok(CFL.bridgeCity([NOCOORD], 0) === null,
     "a city with no coordinates is SKIPPED, never guessed at — same fail-closed rule as beachMilesFrom()");
  ok(CFL.bridgeCity(undefined, 0) === null && CFL.bridgeCity(null, 1) === null,
     "no city data at all is not a crash and not a claim");
  const picked = CFL.bridgeCity([DEEP], 0);
  ok(picked && picked.count === DEEP.spots.length,
     "the count printed is that city's OWN spot total — never arithmetic against what the reader is already looking at, which is the kind of number that goes subtly wrong");

  // ── orderFinds is DISTANCE-FIRST (2026-08-07, owner screenshot from
  // Updated owner rule: every sheet is highest displayed Wayfind Score first.
  // Distance can break a tie but can never put a lower visible score above a
  // higher one. Proven by CALLING the real sorter.
  {
    const near = { p: { name: "PJ Sandwich", distMi: 2, wfScore: 80 } };
    const farBig = { p: { name: "Spinning Coffee", distMi: 11, wfScore: 95 } };
    const noDist = { p: { name: "Mystery", wfScore: 99 } };
    const o1 = CFL.orderFinds([farBig, noDist, near]).map((x) => x.p.name);
    ok(o1.join("|") === "Mystery|Spinning Coffee|PJ Sandwich", `the LOCAL row is highest displayed score first (got ${o1.join(" > ")})`);
    ok(o1[0] === "Mystery", "unknown distance does not erase a real higher score — distance is a tie-break only");
    const sameBandA = { p: { name: "A", distMi: 3, wfScore: 90 } };
    const sameBandB = { p: { name: "B", distMi: 5, wfScore: 95 } };
    const o2 = CFL.orderFinds([sameBandA, sameBandB]).map((x) => x.p.name);
    ok(o2[0] === "B", "within one distance band the higher score still wins (95 beats 90)");
    ok(Number.isFinite(CFL.CREATOR_FINDS_BAND_MI) && CFL.CREATOR_FINDS_BAND_MI >= 5 && CFL.CREATOR_FINDS_BAND_MI <= 15,
      `the band width is a sane constant (${CFL.CREATOR_FINDS_BAND_MI} mi) — raw-mile sorting would let GPS jitter reshuffle the row`);
  }

  // ── displayName beats the matcher root on every browse surface (2026-08-07:
  // the sheet showed a Parrish place literally named "Ryan" — the deliberately
  // shortened MATCH root leaking into the UI as a label). Proven by calling
  // the real builder over the real registry.
  {
    const CV = await import(new URL("../lib/creatorVideos.js", import.meta.url).href);
    const groups = CV.spotsByCity({ lat: 27.5864, lng: -82.4257 }); // Parrish
    const all = groups.flatMap((g) => g.spots.map((x) => x.name));
    ok(all.length > 10, `the browse builder returns real inventory (${all.length} spots) — an empty walk would make the next check vacuous`);
    ok(!all.includes("Ryan"), "no spot renders under the bare matcher root \"Ryan\" — displayName carries the human label");
    ok(all.includes("Ryan's Coffee House"), "…and the Parrish coffee house appears under its actual name");
  }

  // The distance decides; it is never SHOWN. lib/creatorVideos.js says in its
  // own comment that CITY_COORDS is for sorting and is "never shown to a
  // user" — a "35 mi" label built from a city centroid would break that and
  // claim a precision the data cannot back up.
  ok(!/milesLabel\(|\+ " mi"|`\$\{[^}]*distMi[^}]*\} mi`/.test(CF),
     "the row never renders a distance — city centroids sort, they do not measure, and lib/creatorVideos.js promises they are never shown");
  // v7.02 corollary: the cards now share the /best-of card's facts row, and
  // that row DOES print a distance elsewhere. The ban above still holds here
  // because the two card kinds in this row are not the same: pool rows carry a
  // measured distMi, registry rows carry a city centroid, and one facts row
  // cannot tell them apart at render time. So neither prints one.
  ok(/function cardFacts\(/.test(CF) && !/ mi"/.test(CF),
     "cardFacts() builds this row's meta from reviews / price / open-closed only — no distance string is assembled anywhere in it");
  ok(/Creators in \$\{bridge\.city\}/.test(CF) && /poolCount \|\| registryRows\.length \? "Finds from local creators"/.test(CF),
     "with no local find the heading names the city the finds are ACTUALLY in — 'local' is a claim, and another city's spots are not the reader's");
  // RE-POINTED v8.8: the CreatorFinds row left "/" with the accordion (owner,
  // 2026-08-18) — its home wiring (`byCity={socialFindByCity}`, the
  // setSocialFind browse bridge) went with the render site, so there is no
  // home-side prop to pin. The invariant that mattered — ONE derivation of the
  // registry per surface — survives where the surfaces are: the SocialFind
  // sheet still reads the socialFindByCity memo, and the rail's creators pool
  // reads spotsByCity(origin) server-side. What must not come back is a
  // standalone CreatorFinds shelf, asserted in the order block above.
  ok(/const socialFindByCity = useMemo\(\(\) => spotsByCity\(center\)/.test(HOME),
     "the spotsByCity memo left home.js — the SocialFind sheet now derives the registry some other way, which is the two-derivations drift this line exists to stop");
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
console.log(`check-home-answer-first: ${pass} assertions passed (default section "${decl[2]}", ${ids.length} sections, rail is the one menu — accordion unmounted, v8.8)`);
