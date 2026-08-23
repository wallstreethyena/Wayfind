// scripts/check-lands-on-results.mjs — a control that swaps the feed TAKES THE
// READER TO IT, and there is only one implementation of doing so.
//
// WHY THIS EXISTS. The owner has now reported the same defect three times, from
// three different controls, over three days:
//   2026-08-20  "when I click on any of the amazon rail cards the place cards
//                expand but the view remains on the amazon rail cards ... the
//                user might think that nothing happened. I asked you multiple
//                times."               -> scripts/check-shell-scroll.mjs
//   2026-08-23  "when i click on stays the page does not go to the area where
//                the place cards are displayed below the amazon rail card —
//                this is something that was happening in other areas of the
//                menu."                -> this file
//
// check-shell-scroll.mjs holds the MECHANISM rule (never steer through
// `window` in a shell whose feed scrolls inside a div). It cannot catch what
// happened next, because the nav's landing used the right API and still did
// nothing: it measured in a single frame, and the reset effect that zeroes the
// scroller on a filter change cancelled it. So this file holds the BEHAVIOUR
// rule — every control that replaces the feed lands the reader on it, through
// lib/landOnResults.js and not through a fourth hand-rolled copy.
//
// It also pins the screen-name check that found the Itinerary category row
// dispatching to a screen that does not exist.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let checks = 0;
const fails = [];
const ok = (cond, msg) => { checks += 1; if (!cond) fails.push(msg); };

const read = (f) => readFileSync(join(ROOT, f), "utf8");
// Full-line comments are prose ABOUT the rule, and this repo has matched its own
// explanatory comment instead of the code at least four times. Strip them first.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("//"))
  .join("\n");

// ── 1. THE ONE LANDING EXISTS, AND IT IS A SETTLEMENT ──────────────────────
// Each of these is a piece the previous copies were missing. A landing without
// the observer aims at a layout that has not arrived; one without the abort
// fights the reader; one without the ceiling can hold the viewport forever.
const LAND_FILE = "lib/landOnResults.js";
let land = "";
try { land = read(LAND_FILE); } catch (e) { land = ""; }
ok(land.length > 0, `${LAND_FILE} is missing — it is the one landing every feed-swapping control goes through`);
const landCode = codeOnly(land);
ok(/export\s+function\s+landOnResults\s*\(/.test(landCode), `${LAND_FILE} must export landOnResults()`);
ok(/requestAnimationFrame\s*\(/.test(landCode), `${LAND_FILE}: the first land must wait for the frame the results mount on`);
ok(/new\s+ResizeObserver\s*\(/.test(landCode), `${LAND_FILE}: without a ResizeObserver the landing measures a page that has not grown yet — the exact v8.26 failure`);
for (const ev of ["wheel", "touchmove", "keydown"]) {
  ok(landCode.includes(`"${ev}"`), `${LAND_FILE}: "${ev}" must abort the landing — a landing that fights the reader is worse than none`);
}
ok(/setTimeout\s*\(\s*stop\s*,/.test(landCode), `${LAND_FILE}: a hard ceiling must end the landing even if the feed never stops resizing`);
ok(/scrollIntoView\s*\(\s*\{[^}]*inline:\s*"nearest"/.test(landCode),
   `${LAND_FILE}: scrollIntoView must pin \`inline\` — see check-no-sideways-scroll.mjs (the 2026-08-12 clipped-sheet bug)`);
ok(!/window\s*\.\s*scroll(To|By|Y)\b/.test(landCode),
   `${LAND_FILE}: window.scroll* is a NO-OP in the home shell — see check-shell-scroll.mjs`);

// ── 1b. THE REVEAL MEASURES THE BOX THAT MOVES ─────────────────────────────
// Measured 2026-08-23: with the block landed at the top, the first Food card
// sits at 599px of a 590px SCROLLPORT. window.innerHeight is 844 there — the
// header lives outside the scroller — so a fit test written against the window
// answers "it fits" for a card that is under the fold, and the reveal silently
// never fires. That is the whole reason this resolver exists.
ok(/block:\s*p\.block/.test(landCode) || /block:\s*"end"/.test(landCode),
   `${LAND_FILE}: the reveal needs a second, absolute alignment (block "end") — a relative "nudge a bit more" is computed against a scroll offset that is still animating`);
ok(/function\s+scrollportOf\s*\(/.test(landCode) && /overflowY/.test(landCode),
   `${LAND_FILE}: the fit test must measure the SCROLLING ancestor, not the window`);
ok(/scrollHeight\s*>\s*n\.clientHeight/.test(landCode),
   `${LAND_FILE}: an ancestor only counts as the scrollport when it actually overflows`);

// ── 2. EVERY FEED-SWAPPING CONTROL USES IT ─────────────────────────────────
const home = read("app/home.js");
const homeCode = codeOnly(home);
ok(/import\s*\{\s*landOnResults\s*\}\s*from\s*"\.\.\/lib\/landOnResults"/.test(homeCode),
   "app/home.js must import landOnResults");

// The anchor: declared AND attached. v8.11 shipped a scroll to a ref it never
// declared and took the live page down with a ReferenceError; v8.11.1 fixed it.
// Both halves are pinned so neither can be lost again.
ok(/const\s+browseAnchorRef\s*=\s*useRef\(/.test(homeCode), "app/home.js: browseAnchorRef must be DECLARED (v8.11 shipped a scroll to an undeclared ref and crashed the page)");
ok(/ref=\{browseAnchorRef\}/.test(homeCode), "app/home.js: browseAnchorRef must be ATTACHED to the browse block, or the landing has nothing to aim at");

// The landing helper, and the reset that must stand down while one is running.
ok(/const\s+landOnBrowse\s*=\s*\(\s*\)\s*=>/.test(homeCode), "app/home.js: landOnBrowse() is the shell's single landing call");
ok(/landOnResults\(\s*\(\)\s*=>\s*browseAnchorRef\.current/.test(homeCode), "app/home.js: landOnBrowse must aim at browseAnchorRef, re-read at land time (the node mounts on a later frame)");
ok(/force:\s*true/.test(homeCode), "app/home.js: the nav landing passes force — a category tap must ALWAYS visibly answer");
ok(/reveal:\s*true/.test(homeCode) && /probe:\s*firstBrowseCard/.test(homeCode),
   "app/home.js: the nav landing must REVEAL a real place card — landing the block at the top leaves the first Food card one pixel under the fold on a phone (measured 2026-08-23)");

// THE PROBE SELECTOR IS A CROSS-FILE CONTRACT, so it is asserted against the
// files that actually emit those classes rather than trusted as a string. A
// landing that resolves a grey skeleton is a landing on nothing.
{
  const sel = (homeCode.match(/querySelector\(\s*"(\.wf-place-card[^"]*)"/) || [])[1] || "";
  ok(sel.includes(".wf-place-card"), "app/home.js: the browse probe must look for a place card");
  ok(/:not\(\.wf-place-card-sk\)/.test(sel), "app/home.js: the browse probe must EXCLUDE skeletons — landing on a grey placeholder is landing on nothing");
  const skel = read("app/components/PlaceCardSkeleton.js");
  ok(/className="wf-place-card wf-place-card-sk"/.test(skel),
     "PlaceCardSkeleton no longer emits `wf-place-card wf-place-card-sk` — the browse probe's :not() would stop excluding it");
  ok(/className=\{`wf-place-card\$\{/.test(read("app/components/IconicPlaceCard.js")) || /className=\{`wf-place-card\$\{/.test(homeCode),
     "no place card emits the `wf-place-card` class any more — the browse probe would resolve nothing and the reveal would never fire");
}
ok(/if\s*\(scrollRef\.current\s*&&\s*!landingRef\.current\)\s*scrollRef\.current\.scrollTo\(\{\s*top:\s*0/.test(homeCode),
   "app/home.js: the [cat, sub, vibe, ...] scroll reset must stand down while a landing is in flight — an unconditional top:0 there is what silently cancelled v8.11's jump-to-results");

// The two nav handlers. onNavOpen is the tab (the 2026-08-23 report), onNavSub
// is the sub-chip (v8.11, which never actually fired in production).
const handler = (name) => {
  const i = homeCode.indexOf(name + "={(");
  if (i < 0) return "";
  return homeCode.slice(i, i + 2600);
};
const navOpen = handler("onNavOpen");
const navSub = handler("onNavSub");
ok(navOpen.length > 0, "app/home.js: onNavOpen handler not found — the six category tabs are wired through it");
ok(navSub.length > 0, "app/home.js: onNavSub handler not found — the sub-chip tray is wired through it");
ok(/openBrowse\(/.test(navOpen), "app/home.js: onNavOpen must call openBrowse — tapping a category tab and having the page not move is the whole reported bug");
ok(/landOnBrowse\(\)/.test(navSub), "app/home.js: onNavSub must land the reader on the filtered results");
// openBrowse is the shared entry point; it lands, and it does not toggle.
ok(/const\s+openBrowse\s*=\s*\(id\)\s*=>[\s\S]{0,600}?landOnBrowse\(\)/.test(homeCode),
   "app/home.js: openBrowse must end in landOnBrowse() — it is the one entry point every off-feed menu uses");
ok(!/onCat=\{[^}]*pickBrowse\(/.test(homeCode) && !/gwPopClose\("browse"\);\s*pickBrowse\(/.test(homeCode),
   "app/home.js: a control that means \"take me to this category\" uses openBrowse, never pickBrowse — pickBrowse TOGGLES and would clear the category instead");

// The rail keeps the behaviour and gives up the second copy of the mechanism.
const rail = read("app/components/DaypartRail.js");
const railCode = codeOnly(rail);
ok(/import\s*\{\s*landOnResults\s*\}\s*from\s*"\.\.\/\.\.\/lib\/landOnResults\.js"/.test(railCode),
   "app/components/DaypartRail.js must use the shared landing");
ok(/landOnResults\(\s*\(\)\s*=>\s*menuRef\.current/.test(railCode),
   "app/components/DaypartRail.js: the drop still lands the reader on its picks");
ok(!/new\s+ResizeObserver\s*\(/.test(railCode),
   "app/components/DaypartRail.js: no second settlement implementation — three near-copies of this is how the same bug was reported three times");

// ── 3. NO CONTROL DISPATCHES TO A SCREEN THAT DOES NOT EXIST ───────────────
// Found by this guard on 2026-08-23: the Itinerary category row called
// setScreen("home"). There is no "home" screen — the feed is "suggested" — so
// the tap left the reader on an empty scroller with nothing selected anywhere.
// The known set is DERIVED from the shell's own dispatch, so it cannot drift
// away from what actually renders.
const SCREENS = new Set();
for (const m of homeCode.matchAll(/screen\s*===\s*"([a-z]+)"/g)) SCREENS.add(m[1]);
ok(SCREENS.size >= 8, `screen-name set looks wrong (${SCREENS.size} found) — the derivation, not the callers, is what broke`);
ok(SCREENS.has("suggested"), "the feed screen \"suggested\" must be in the derived set — the probe is broken if it is not");
ok(!SCREENS.has("home"), "\"home\" is a NAV DESTINATION id, not a screen — if it ever becomes one, this guard's headline case is gone and the rule needs rewriting");

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" || n === ".vercel" ? [] : walk(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});
let dispatches = 0;
for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const src = codeOnly(readFileSync(abs, "utf8"));
  for (const m of src.matchAll(/setScreen\(\s*"([a-z]+)"\s*\)/g)) {
    dispatches += 1;
    ok(SCREENS.has(m[1]), `${rel}: setScreen("${m[1]}") dispatches to a screen that does not render — nothing will be on the page`);
  }
}
// A sweep that matched nothing is not a clean sweep; it is a broken probe.
ok(dispatches > 0, "found no literal setScreen(\"...\") calls at all — the sweep did not run");

if (fails.length) {
  for (const m of fails) console.error("check-lands-on-results: FAIL — " + m);
  process.exit(1);
}
console.log(`check-lands-on-results: OK — ${checks} assertions, ${dispatches} screen dispatches, ${SCREENS.size} known screens`);
