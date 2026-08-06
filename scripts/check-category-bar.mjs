#!/usr/bin/env node
/**
 * check-category-bar — the K3 bar, and the rollback that needs no deploy.
 *
 * The work order (wayfind-k3-category-bar-work-order-2026-08-06.md) was approved
 * on one hard condition from the owner: "if i want to go back i need you to be
 * ready for it." Three levels of rollback were designed in, and the cheapest two
 * are only real if something asserts them:
 *
 *   1. NEXT_PUBLIC_WF_CATEGORY_BAR unset or "off" -> the old CategoryMenu
 *      renders, unchanged, with no code change. (The work order said "no
 *      redeploy". That is wrong and the comment in app/home.js records why:
 *      NEXT_PUBLIC_* is inlined at build time, so a flip needs a deploy — it
 *      just does not need a revert or a merge.)
 *   2. CategoryMenu is not deleted and keeps its other call sites, so the flag
 *      always has something known-good to fall back TO.
 *
 * The rest of the assertions are the honesty rules — a count is never guessed,
 * an empty category is never advertised — and the two motion rules that are
 * about phone performance rather than taste.
 *
 * PHASE 2 IS NOT ASSERTED HERE YET. Work-order guard 3 ("a category tap never
 * unmounts the ranked list") is the actual bounce fix and has not shipped: the
 * feed still renders BestNearby under {!browseCat && ...}. Asserting it now
 * would be asserting a thing that is false. It goes in the same commit that
 * makes it true, and this comment is the record that it is owed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
let pass = 0;
const fail = (m) => { console.error("check-category-bar: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const HOME = read("app/home.js");
const BAR = read("app/components/CategoryBar.js");

/* ── 1. THE KILL SWITCH ─────────────────────────────────────────────────── */
ok(/NEXT_PUBLIC_WF_CATEGORY_BAR/.test(HOME),
   "app/home.js reads NEXT_PUBLIC_WF_CATEGORY_BAR — without the env var there is no no-deploy rollback, which is the condition the work order was approved on");
ok(/WF_CATEGORY_BAR\s*\?/.test(HOME),
   "the flag GATES the render (a ternary at the call site) rather than merely being read — a flag nothing branches on is decoration");
ok(/WF_CATEGORY_BAR\s*=\s*String\(process\.env\.NEXT_PUBLIC_WF_CATEGORY_BAR[^)]*\)[^=]*===\s*"on"/.test(HOME),
   'the flag is OPT-IN ("on"), so an unset or misspelled value falls back to the old bar rather than shipping the new one by accident');

/* ── 2. THE FALLBACK STILL EXISTS ───────────────────────────────────────── */
ok(/function CategoryMenu\(/.test(HOME),
   "CategoryMenu is still declared — the new bar is an ALTERNATIVE render, not a replacement, or level-1 rollback lands on nothing");
const callSites = (HOME.match(/<CategoryMenu\b/g) || []).length;
ok(callSites >= 2,
   `CategoryMenu still has its call sites (found ${callSites}) — the home feed, the browse row, Itinerary and the Map all share it, and restyling or removing it would silently reshape three screens the work order never mentions`);
ok(/WF_CATEGORY_BAR \? \(([\s\S]{0,400}?)<CategoryBar[\s\S]{0,600}?\) : \(([\s\S]{0,400}?)<CategoryMenu tight/.test(HOME),
   "the flag's FALSE branch renders <CategoryMenu tight ...> — the exact component that renders today, so 'off' is genuinely the current behaviour and not a third state nobody has seen");

/* ── 3. HONESTY: NEVER A GUESSED COUNT, NEVER AN EMPTY ROOM ─────────────── */
// From lib/, not the component: this guard runs under plain node, which cannot
// parse JSX. That constraint is WHY the decisions live outside the render.
const { visibleCats, countLabel, CIRCLE_BASE, CIRCLE_SELECTED } =
  await import(new URL("../lib/categoryTiles.js", import.meta.url).href);

ok(visibleCats([{ id: "food", count: 40 }, { id: "hotels", count: 0 }]).length === 1,
   "a category with a KNOWN zero does not render — the work order's 'do not advertise an empty room'");
ok(visibleCats([{ id: "food" }]).length === 1,
   "a category with an UNKNOWN count still renders — 'we have not counted yet' and 'there is nothing here' are different facts, and conflating them empties the bar while data is in flight");
ok(visibleCats([{ id: "food", count: -3 }]).length === 0, "a negative count is treated as empty, not rendered as a number");
ok(countLabel(0) === null, "a count of 0 renders NOTHING — never the digit 0");
ok(countLabel(undefined) === null, "an absent count renders nothing rather than a placeholder");
ok(countLabel(12, true) === null,
   "a TRUNCATED list yields no count — a row list capped by a query limit gives a floor, not a total, and printing it would be a guess wearing a number's clothes");
ok(countLabel(12) === "12", "a real, complete count does render");

/* ── 4. THE PHOTO SOURCE ────────────────────────────────────────────────── */
const { tilesFrom, TILE_SOURCE, TILE_GLYPH } =
  await import(new URL("../lib/categoryTiles.js", import.meta.url).href);

const tiles = tilesFrom({ food: { photo_ref: "places/x/photos/y" } });
ok(tiles.length >= 5, `every category tile is shaped (got ${tiles.length})`);
const food = tiles.find((t) => t.id === "food");
const family = tiles.find((t) => t.id === "family");
ok(food && typeof food.photoUrl === "string" && food.photoUrl.length > 0, "a category with a ranked row gets a real photo URL");
ok(family && family.photoUrl === null && family.glyph,
   "a category with no ranked row gets its GLYPH and a null photo — never a borrowed photograph from a neighbouring category, which would claim a place is family-friendly because it happened to rank in Activities");
ok(TILE_SOURCE.family === null,
   "family maps to no wf_best_picks category on purpose — wf_inventory carries no family rows (checked live), and the home browse serves it from a live search instead");
ok(tiles.every((t) => t.count === undefined),
   "Phase 1 sets NO counts at all — wf_best_picks returns a capped list and the browse a tap opens is a different source, so any number here would not match the list it opens");
ok(Object.keys(TILE_GLYPH).length >= 6, "every tile has a fallback glyph");

/* ── 5. MOTION — the two rules that are about a mid-range phone ─────────── */
const css = (BAR.match(/transition:[^;}"]+/g) || []).join(" | ");
ok(!/transition:[^;}"]*\bwidth\b/.test(BAR),
   `no transition animates WIDTH (${css.slice(0, 160)}) — width relayouts the entire row every frame on a mid-range phone; the selected state is transform: scale() only`);
ok(/transform:\s*scale\(/.test(BAR), "the selected state IS a transform: scale() — the size moving is what makes this a control rather than a banner");
ok(/grid-template-rows:\s*0fr/.test(BAR) && /grid-template-rows:\s*1fr/.test(BAR),
   "the submenu animates grid-template-rows 0fr -> 1fr, so it opens to a height nobody has to know in advance");
ok(!/max-height:\s*(?!0)/.test(BAR.replace(/max-height:\s*0/g, "")),
   "the submenu does NOT use a magic max-height — that clips the fifth chip the day someone adds one");
ok(/prefers-reduced-motion/.test(BAR),
   "reduced motion is handled — app/layout.js zeroes durations globally, but not transition-delay, which the chip stagger uses");
ok(/transition-delay:\s*calc\(var\(--i\)/.test(BAR), "the chip stagger is a CSS custom-property delay, not a JS timer");
ok(CIRCLE_SELECTED > CIRCLE_BASE, `the selected circle is larger (${CIRCLE_BASE} -> ${CIRCLE_SELECTED})`);

/* ── 6. NO ANIMATION LIBRARY ────────────────────────────────────────────── */
const pkg = JSON.parse(read("package.json"));
const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
const banned = deps.filter((d) => /^(framer-motion|motion|react-spring|@react-spring|gsap|animejs|popmotion|auto-animate|@formkit\/auto-animate)/.test(d));
ok(banned.length === 0,
   `no animation library was added for this (${JSON.stringify(banned)}) — Framer Motion is 30-50KB gzipped against a bundle guarded at 88.6KB shared JS, to reproduce four lines of CSS`);

/* ── 7. THE SUBMENU CONTRACT IS UNCHANGED ───────────────────────────────── */
ok(/SUBFILTERS/.test(BAR),
   "the bar renders the EXISTING SUBFILTERS row — same chips, same queries, same SUB_ALLOW contract in lib/placeFilter.js; it only gained a height transition");

console.log(`check-category-bar: PASS (${pass} assertions)`);
