#!/usr/bin/env node
// scripts/check-owner-bump.mjs — THE GOD BUMP: 0.7, EVERYWHERE, AND VISIBLE.
//
// v8.90 (owner, 2026-08-29): "make sure that every like button pressed by the
// account gabrielpereira@me.com receive the god bump which should be 0.7 bump
// in the score so a 8.0 would now be a 8.7 globally everywhere. Make sure the
// god bump works everywhere and there is a guard for that so every new place
// card has that feature in the future and they have it now."
//
// He asked for the guard by name, and this is it. Three properties:
//
//   1. THE ARITHMETIC. 8.0 -> 8.7 on the badge, which is +7 on the internal
//      0-100 scale. EXECUTED end to end through the real functions —
//      withOwnerBump then toDisplayScore — because "0.7" is a claim about what
//      the reader SEES, and the two scales are exactly where this goes wrong
//      (lib/landing.js once shipped a formula that mixed them; see the header
//      of lib/wayfindScore.js for what that cost on the ad landing pages).
//
//   2. EVERYWHERE MEANS ONE PLACE. `withMemberSignal` in app/home.js is the
//      single choke point where the server's like aggregate meets a place
//      object, and the rail is HANDED that same function as
//      `applyMemberSignal` rather than deriving its own. So the bump is one
//      line and reaches every ranked surface. A second implementation would be
//      the parallel-matcher mistake this repo has paid for more than once, so
//      the count is asserted.
//
//   3. AND IT IS DISCLOSED. This is the half that is not a preference.
//      The Wayfind Score is sold to the reader as unbought — the top-10 sheet's
//      own copy says "No ads, no paid placement, just what consistently earns
//      it", and the sponsored-card rule is "money buys the position, never the
//      number". A bump nobody can see makes both of those sentences false.
//
//      It does not have to be invisible: `_members.ownerPick` is the SAME flag
//      that already paints the gold "Curator's pick" treatment on the card. So
//      the two are locked together here — the bump may not be applied on a
//      condition the card does not also mark. The owner's taste may move the
//      number; it may not move it silently.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withOwnerBump, isOwnerPick, OWNER_BUMP, OWNER_BUMP_DISPLAY, SCORE_CEILING } from "../lib/ownerBump.js";
import { toDisplayScore } from "../lib/score.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. THE ARITHMETIC THE OWNER ASKED FOR, ON THE BADGE ─────────────────────
// His sentence, executed: "a 8.0 would now be a 8.7".
ok(toDisplayScore(withOwnerBump(80, true)) === 8.7,
  `an 8.0 becomes an 8.7 on the badge (got ${toDisplayScore(withOwnerBump(80, true))}) — the owner's own example, run through withOwnerBump and toDisplayScore rather than asserted`);
ok(toDisplayScore(withOwnerBump(80, false)) === 8,
  "…and an 8.0 the owner has NOT liked is still an 8.0");
ok(OWNER_BUMP_DISPLAY === 0.7 && OWNER_BUMP === 7,
  `the bump is 0.7 on the badge and 7 internally (got ${OWNER_BUMP_DISPLAY} / ${OWNER_BUMP}) — Wayfind stores 0-100 and shows /10, and writing 0.7 in internal points would be a 0.07 on the badge, i.e. invisible`);

// A ladder, so the rule is proven as a rule and not at one value.
for (const [base, want] of [[52, 5.9], [70, 7.7], [80, 8.7], [88, 9.5], [93, 10]]) {
  ok(toDisplayScore(withOwnerBump(base, true)) === want,
    `${toDisplayScore(base)} -> ${want} with the owner's like (got ${toDisplayScore(withOwnerBump(base, true))})`);
}

// ── 2. THE CEILING, AND THE NULL ────────────────────────────────────────────
ok(withOwnerBump(96, true) === SCORE_CEILING,
  `a 9.6 is clamped to 10.0, not 10.3 (got ${toDisplayScore(withOwnerBump(96, true))}) — 10 is the top of the scale the badge draws and the top of what isValidScore accepts`);
ok(withOwnerBump(100, true) === 100, "…and a 10 stays a 10");
ok(withOwnerBump(null, true) === null,
  "a NULL base stays NULL — an unrated place shows \"Score pending\", and a bump on a phantom 0 is the fake 0.1/10 badge lib/score.js's header exists for");
for (const junk of [undefined, NaN, Infinity, "80", {}]) {
  const out = withOwnerBump(junk, true);
  ok(out === junk || Number.isNaN(out),
    `garbage passes through untouched rather than becoming a number (${String(junk)} -> ${String(out)}) — this runs inside every list map`);
}

// ── 3. THE FLAG HAS ONE DOOR ────────────────────────────────────────────────
// The bump reads the server-produced aggregate. A place object built anywhere
// else — a fixture, a client-side merge, an import — must not be able to mint
// itself the owner's endorsement.
ok(isOwnerPick({ _members: { ownerPick: true } }) === true, "the owner's pick is read from the server's _members aggregate");
ok(isOwnerPick({ ownerPick: true }) === false,
  "…and a TOP-LEVEL ownerPick is ignored — otherwise any object could claim the bump, and ownerId is server-only precisely so it cannot");
ok(isOwnerPick({ _members: { ownerPick: "yes" } }) === false, "…and only a real boolean true counts");
ok(isOwnerPick(null) === false && isOwnerPick({}) === false, "total over garbage");

// ── 4. ONE IMPLEMENTATION, AT THE ONE CHOKE POINT ───────────────────────────
{
  const home = strip(readFileSync(join(ROOT, "app/home.js"), "utf8"));
  ok(/import \{ withOwnerBump \} from "\.\.\/lib\/ownerBump\.js"/.test(home),
    "weaker check (source): app/home.js imports the rule rather than restating the arithmetic");
  const uses = (home.match(/withOwnerBump\(/g) || []).length;
  ok(uses === 1,
    `withOwnerBump is CALLED exactly once in app/home.js (found ${uses}) — a second call site is a second place for the two to drift, and the whole point of "globally everywhere" is that there is one`);
  // …and that one call is inside withMemberSignal, which is what makes it
  // global: the rail is handed this function rather than deriving its own.
  const fn = home.match(/function withMemberSignal\(list, sig\)[\s\S]{0,1400}?\n\}/);
  ok(!!fn, "positive control: withMemberSignal is still found under its known shape");
  ok(!!fn && /withOwnerBump\(nudged, g\.ownerPick === true\)/.test(fn[0]),
    "the bump is applied inside withMemberSignal — the single point where the server's like aggregate meets a place object");
  ok(/applyMemberSignal=\{withMemberSignal\}/.test(home),
    "…and the rail drop is HANDED that same function, so the rail cannot end up with an unbumped copy of the rule");

  // Nobody else may add seven points to a score.
  const bad = [];
  for (const rel of ["app/home.js", "lib/railSelect.js", "lib/railsData.js", "lib/memberSignals.js", "app/components/IconicPlaceCard.js", "app/components/RailCard.js"]) {
    const src = strip(readFileSync(join(ROOT, rel), "utf8"));
    if (/(wfScore|score)\s*\+\s*7\b/.test(src) || /\+\s*0\.7\b/.test(src)) bad.push(rel);
  }
  ok(bad.length === 0,
    `no surface hand-rolls the bump (found in ${bad.join(", ") || "none"}) — the number lives in lib/ownerBump.js so changing it changes it everywhere`);
}

// ── 5. THE BUMP IS DISCLOSED — THE HALF THAT IS NOT A PREFERENCE ────────────
// One flag drives BOTH the number and the mark. If the card's gold treatment
// ever stops reading `_members.ownerPick`, a reader can be shown a bumped score
// with nothing on the card to explain it, and the product's own claim about the
// score ("no ads, no paid placement, just what consistently earns it") becomes
// false. That is why this is a build failure and not a note.
{
  const card = strip(readFileSync(join(ROOT, "app/components/IconicPlaceCard.js"), "utf8"));
  ok(/const isCuratorPick = !!\(place\._members && place\._members\.ownerPick\)/.test(card),
    "the card's Curator's-pick mark is driven by the SAME flag as the bump — one condition, so a bumped number always arrives with the mark that explains it");
  ok(/is-curator-pick/.test(card),
    "…and that mark reaches the DOM as a class the stylesheet can paint");
  const css = strip(readFileSync(join(ROOT, "app/components/css.js"), "utf8"));
  ok(/\.wf-place-card\.is-curator-pick/.test(css),
    "…and the stylesheet actually paints it — a class nothing styles is not a disclosure");
}

console.log(`\ncheck-owner-bump: ${fail ? "FAIL" : "OK"} — ${pass} assertions; the owner's own example (8.0 -> 8.7) EXECUTED through withOwnerBump + toDisplayScore, a five-step ladder, the 10.0 ceiling, the null-stays-null rule, the single-door flag, exactly ONE call site at the one choke point every ranked surface routes through, and the disclosure lock that stops the number moving silently.`);
process.exit(fail ? 1 : 0);
