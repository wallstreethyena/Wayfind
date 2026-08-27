#!/usr/bin/env node
/**
 * scripts/check-drop-photo-window.mjs — the drop may hold unlimited CARDS and
 * a bounded number of PHOTOS.
 *
 * THE CRASH, measured on production 2026-08-27 at an iPhone 14 viewport, from
 * ONE tap on "Actually Worth Eating":
 *
 *     189  place cards rendered
 *     189  <img loading="eager">
 *     189  downloaded and decoded
 *     257.4 MB  of decoded bitmap
 *
 * iOS Safari kills a content process that crosses its memory limit and shows
 * "A problem repeatedly occurred". That is the owner's screenshot, taken one
 * minute after his screenshot of this same rail loading. Not a slow rail — the
 * tab dying, on the first surface anyone sees.
 *
 * IT WAS SELF-INFLICTED, BY THE SAME HAND ON THE SAME DAY, and that is the
 * reason this file exists rather than a one-line fix:
 *
 *   - v8.70 (#985) found a REAL bug: `loading="lazy"` never fires inside
 *     .wf8-pcrail — measured, 8 in-view cards, 2294px of scroll, 0 images —
 *     so lazy there means NEVER and the drop was a wall of blank grey boxes.
 *     It fixed it by opting every card in the drop out of lazy.
 *   - scripts/check-rail-drop-images.mjs was written in the same PR. It asserts
 *     the drop opts out and that nothing else does. It is a good guard and it
 *     is still green on the code that crashed the tab, because it never asked
 *     HOW MANY CARDS THE DROP HOLDS.
 *   - and it holds a lot on purpose: the owner removed every card ceiling,
 *     twice, and scripts/check-no-card-cap.mjs enforces that there is no MAX.
 *
 * Two rules, each correct on its own — a product decision and a measured
 * browser fact — that multiply into a quarter of a gigabyte. Nothing in 436
 * guards was looking at the product of two invariants, which is the general
 * lesson worth keeping: a guard that pins one half of a multiplication cannot
 * see the other half growing.
 *
 * SO WHAT THIS PINS is the shape of the resolution: the ceiling goes on the
 * PHOTOS and never on the cards. Every place the reader earned stays ranked,
 * scrollable and counted; what is bounded is how many hold a decoded bitmap at
 * once. Any future edit that re-couples them — eager on every card again, or a
 * cap on the cards to make the memory fit — fails here.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const RAW = readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8");
const SRC = strip(RAW);

/* ── 1. THE MEMORY BOUND, IN BYTES ─────────────────────────────────────────
   Asserted as a number a reviewer can check against the measurement, not as
   "there is a window". 189 images cost 257.4 MB, i.e. ~1.36 MB decoded each
   at the sizes this card requests. The window's worst case must stay far
   under any iPhone's content-process budget. */
{
  const mB = SRC.match(/export const PHOTO_WINDOW_BACK\s*=\s*(\d+)/);
  const mA = SRC.match(/export const PHOTO_WINDOW_AHEAD\s*=\s*(\d+)/);
  ok(!!mB && !!mA, "both window bounds are declared (the declaration, not the bare name)");
  const back = mB ? Number(mB[1]) : NaN, ahead = mA ? Number(mA[1]) : NaN;
  // ~3.4 cards are visible at once (--wf8-pcvis in railMenuCss).
  const worst = back + ahead + 4;
  const MB_PER_IMAGE = 257.4 / 189;
  const worstMB = worst * MB_PER_IMAGE;
  ok(worstMB < 60,
    `the widest the photo window can ever be is ${worst} cards ≈ ${worstMB.toFixed(0)} MB of decoded bitmap — measured at ${MB_PER_IMAGE.toFixed(2)} MB/image on production. The version that crashed iOS Safari held 189 images and 257.4 MB`);
  ok(back >= 4 && ahead >= 8,
    `…and wide enough on both sides (${back} back / ${ahead} ahead) that an ordinary swipe past ~3.4 visible cards never outruns it and sees a monogram`);
}

/* ── 2. THE BOUND IS ON PHOTOS, NEVER ON CARDS ─────────────────────────────
   The tempting wrong fix is a card cap. The owner removed every card ceiling
   twice; check-no-card-cap.mjs is the guard that holds him to it, and this
   assertion states the same rule from the memory side so nobody "fixes" the
   crash by quietly reintroducing one. */
{
  ok(/place=\{inWin \? p : photoless\(p\)\}/.test(SRC),
    "a card OUTSIDE the window renders without its photo — the bound is on bitmaps, not on how many places the reader may see");
  ok(/eagerMedia=\{inWin\}/.test(SRC),
    "…and only cards inside the window load eagerly");
  ok(!/\beagerMedia\s*$|\beagerMedia\s*\/>|\beagerMedia\s+[a-z]/m.test(SRC.replace(/eagerMedia=\{inWin\}/g, "")),
    "…with no bare `eagerMedia` left anywhere — that spelling is the unconditional one that shipped 189 eager images");
  ok(/dropList\.map\(/.test(SRC), "PROBE: the drop still maps its FULL list — a slice() here would be a card cap wearing a different name");
  ok(!/dropList\.slice\(0,\s*\d+\)\.map\(/.test(SRC),
    "…and does not truncate it. Fixing a memory bug by showing fewer places would take the owner's own product rule away to pay for my regression");
}

/* ── 3. THE WINDOW ACTUALLY FOLLOWS THE READER ─────────────────────────────
   A window pinned at 0 bounds memory and re-creates v8.70's bug for every card
   past the first screen: blank forever, because lazy never fires here. */
{
  const i = SRC.indexOf("setPcWin(");
  ok(i > -1, "PROBE: the window is actually written somewhere — a -1 makes the rest vacuous");
  const block = SRC.slice(Math.max(0, i - 900), i + 900);
  // SCOPED TO THE WINDOW'S OWN EFFECT. Tested against the whole file this
  // passed with my listener deleted, because useScrollEnds has a scroll
  // listener of its own — a guard answering a question I was not asking
  // (CLAUDE.md). Caught by red-proving; the assertion below is the corrected
  // one, and it goes red when THIS effect stops listening.
  // TWO TRAPS IN ONE LINE, both found while red-proving this file:
  //
  //  1. Scoped to the whole file, this passed with my listener DELETED —
  //     useScrollEnds has a scroll listener of its own. Answering a question I
  //     was not asking (CLAUDE.md). Hence `block`, not `SRC`.
  //  2. `removeEventListener("scroll", sync)` CONTAINS
  //     `addEventListener("scroll", sync)` as a substring, so the obvious
  //     regex passes on a cleanup-only file. Hence the lookbehind.
  //
  // And a third, in the red-prove rather than the guard: the first sabotage
  // used `.replace(old, new, 1)` on a string that appears TWICE in
  // DaypartRail.js, so it deleted useScrollEnds' listener and left this one
  // alone — a mutation that applied to the wrong target reads exactly like a
  // guard that correctly passed. CLAUDE.md's rule, met in the wild: prove the
  // mutation hit the site you meant.
  ok(/(?<![a-zA-Z])addEventListener\("scroll",\s*sync/.test(block),
    "the window is driven by the drop's OWN scroll listener — the window IS the loading mechanism, so it has to move, or every card past the first screen is blank forever (v8.70's bug, returning for the tail)");
  ok(/el\.scrollLeft/.test(block) && /clientWidth/.test(block),
    "…computed from the scroller's real position and width, not from a counter");
  ok(/prev\.lo === lo && prev\.hi === hi \? prev :/.test(block),
    "…and it returns the SAME object when the bounds have not moved. useScrollEnds documents why: a fresh object per scroll event re-rendered this whole component at ~60fps and is the 'jumpy and glitchy' report of 2026-08-20");
  ok(/removeEventListener\("scroll",\s*sync/.test(block), "…and that listener is removed on cleanup");
}

/* ── 4. THE PHOTOLESS TWIN IS STABLE ───────────────────────────────────────
   A fresh object for every out-of-window card on every scroll tick would
   re-render the entire drop continuously — trading a memory bug for a jank
   bug. */
{
  const i = SRC.indexOf("const photoless =");
  ok(i > -1, "PROBE: the photoless helper exists");
  const fn = SRC.slice(i, i + 420);
  ok(/WeakMap/.test(SRC), "the twins are memoized in a WeakMap — keyed on the row, so a new payload's old twins are collectable");
  ok(/m\.get\(row\)/.test(fn) && /m\.set\(row,/.test(fn),
    "…and looked up before being built, so a card outside the window gets the SAME object every render");
  ok(/photo: null/.test(fn) && /photoRef: null/.test(fn) && /photo_ref: null/.test(fn),
    "…with every photo field cleared — photoUrl() reads photoRef, photo_ref AND photo, so missing one leaves the image loading anyway");
}

/* ── 5. THE CARD STILL HAS SOMETHING TO SHOW ───────────────────────────────*/
{
  const card = readFileSync(join(ROOT, "app/components/IconicPlaceCard.js"), "utf8");
  ok(/wf-place-card-monogram/.test(card),
    "a photoless card renders its monogram — an existing designed state, not an empty box. Without this the fix would trade a crash for the blank grey v8.70 removed");
  ok(/photoUrl\(place\)\s*\n?\s*\?/.test(card) || /\{photoUrl\(place\)/.test(card),
    "…chosen by whether the row actually carries a photo, which is exactly what the twin removes");
}

/* ── 6. RED PROOFS ─────────────────────────────────────────────────────────*/
const MB = 257.4 / 189;
const RED = [
  ["the pre-fix 189-image drop is over the bound", () => 189 * MB > 60],
  ["a window widened past the memory bound is detectable", () => !((10 + 200 + 4) * MB < 60)],
  ["a bare unconditional eagerMedia is detectable", () => {
    const fake = '<IconicPlaceCard place={p}\n eagerMedia\n mediaPriority="high" />';
    return /\beagerMedia\s*$/m.test(fake);
  }],
  ["a card cap sneaking in as the fix is detectable", () => {
    return /dropList\.slice\(0,\s*\d+\)\.map\(/.test("dropList.slice(0, 24).map((p, i) => {");
  }],
  ["a window that never moves is detectable", () => {
    const fake = "const [pcWin] = useState({ lo: 0, hi: 28 });";
    return !/addEventListener\("scroll"/.test(fake);
  }],
  ["an unstable twin is detectable", () => {
    const fake = "const photoless = (row) => ({ ...row, photo: null });";
    return !/m\.get\(row\)/.test(fake);
  }],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-drop-photo-window: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-drop-photo-window: OK — ${pass} assertions (photos bounded to ~${Math.round((10 + 18 + 4) * MB)}MB of bitmap, cards unbounded; the window follows the scroll and its twins are stable)`);
