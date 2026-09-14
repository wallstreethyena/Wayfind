#!/usr/bin/env node
// scripts/check-owner-bump.mjs — THE GOD BUMP: BANDED, EVERYWHERE, AND VISIBLE.
//
// Size is banded from the PRE-BUMP shown score (owner, 2026-09-14):
//   ≤ 8.0  → +1.5  (7.5 → 9.0, 8.0 → 9.5)
//   8.1–9.0 → +0.6 (8.1 → 8.7, 9.0 → 9.6)
//   > 9.0  → +0.2  (9.2 → 9.4)
// The old rule was a flat +0.7 (8.0 → 8.7, 8.1 → 8.8). Mechanism unchanged.
//
// He asked for the guard by name, and this is it. Three properties:
//
//   1. THE ARITHMETIC. The owner's examples, EXECUTED end to end through the
//      real functions — withOwnerBump then toDisplayScore — because the
//      bands are a claim about what the reader SEES, and the two scales are
//      exactly where this goes wrong (lib/landing.js once shipped a formula
//      that mixed them; see the header of lib/wayfindScore.js).
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
import { withOwnerBump, isOwnerPick, stampOwnerPick, ownerBumpScoreRaw, ownerBumpPoints, OWNER_BUMP_LEQ_80, OWNER_BUMP_81_TO_90, OWNER_BUMP_ABOVE_90, SCORE_CEILING } from "../lib/ownerBump.js";
import { isOwnerEmail, isOwnerSession, ownerUserIds, OWNER_ACCOUNT_EMAIL } from "../lib/ownerIdentity.js";
import { memberDelta } from "../lib/ranking.js";
import { toDisplayScore } from "../lib/score.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. THE ARITHMETIC THE OWNER ASKED FOR, ON THE BADGE ─────────────────────
ok(OWNER_BUMP_LEQ_80 === 15 && OWNER_BUMP_81_TO_90 === 6 && OWNER_BUMP_ABOVE_90 === 2,
  `the bands are 15 / 6 / 2 internal (got ${OWNER_BUMP_LEQ_80} / ${OWNER_BUMP_81_TO_90} / ${OWNER_BUMP_ABOVE_90}) — Wayfind stores 0-100 and shows /10`);
ok(ownerBumpPoints(80) === 15 && ownerBumpPoints(81) === 6 && ownerBumpPoints(90) === 6 && ownerBumpPoints(91) === 2,
  "band choice is from the pre-bump shown score: ≤8.0 → 15, 8.1–9.0 → 6, >9.0 → 2");
ok(toDisplayScore(withOwnerBump(80, false)) === 8,
  "…and an 8.0 the owner has NOT liked is still an 8.0");

// His examples, executed — not restated as comments.
for (const [base, want] of [[75, 9.0], [80, 9.5], [81, 8.7], [90, 9.6], [92, 9.4]]) {
  ok(toDisplayScore(withOwnerBump(base, true)) === want,
    `${toDisplayScore(base)} liked → ${want} (got ${toDisplayScore(withOwnerBump(base, true))})`);
}

// ── 2. THE CEILING, AND THE NULL ────────────────────────────────────────────
ok(withOwnerBump(99, true) === SCORE_CEILING,
  `a 9.9 is clamped to 10.0, not 10.1 (got ${toDisplayScore(withOwnerBump(99, true))}) — 10 is the top of the scale the badge draws and the top of what isValidScore accepts`);
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

// ── 4. ONE IMPLEMENTATION — stampOwnerPick IS THE MUTATOR ───────────────────
{
  const home = strip(readFileSync(join(ROOT, "app/home.js"), "utf8"));
  ok(/import \{ stampOwnerPick \} from "\.\.\/lib\/ownerBump\.js"/.test(home),
    "weaker check (source): app/home.js imports stampOwnerPick rather than restating the arithmetic");
  ok(!/isOwnerAccount|ownerIdentity|OWNER_ACCOUNT_EMAIL/.test(home),
    "the client does not hardcode the founder email or UUID — ownerPick is server-derived");
  ok(!/withOwnerBump\(/.test(home),
    "app/home.js does not call withOwnerBump directly — the arithmetic stays inside stampOwnerPick so like + list load cannot drift");
  const fn = home.match(/function withMemberSignal\(list, sig\)[\s\S]{0,2200}?\n\}/);
  ok(!!fn, "positive control: withMemberSignal is still found under its known shape");
  ok(!!fn && /stampOwnerPick\([\s\S]{0,80}g\.ownerPick === true\)/.test(fn[0]),
    "the bump is applied inside withMemberSignal via stampOwnerPick — the list-load choke point");
  ok(!!fn && /g\.ownerPick === true \? base : nudged/.test(fn[0]),
    "an owner pick uses the raw base (then the banded bump), not memberDelta stacked on top");
  ok(/applyMemberSignal=\{withMemberSignal\}/.test(home),
    "…and the rail drop is HANDED that same function, so the rail cannot end up with an unbumped copy of the rule");
  ok(/function patchOwnerPick\(/.test(home) && /stampOwnerPick\(pl, ownerPick\)/.test(home) && /stampOwnerPick\(cur, ownerPick\)/.test(home),
    "the like path stamps the same function onto the feed AND the open detail sheet");
  const tog = home.match(/function toggleLike\([\s\S]{0,2200}?function /);
  ok(!!tog, "positive control: toggleLike is still found under its known shape");
  ok(!!tog && /if \(user && likesSessionOwner\) patchOwnerPick\(p\.id, nowLiked\)/.test(tog[0]),
    "toggleLike stamps card + sheet in the same click when the server has already said this session is the owner");
  ok(!!tog && tog[0].indexOf("patchOwnerPick") < tog[0].indexOf("refreshOwnerPick"),
    "…and that stamp runs before the post-write refetch, so the score does not wait on a refresh");
  ok(/fetchPlaceById\(placeId\)/.test(home) && /withMemberSignal\(\[p\], sig\)/.test(home),
    "/p/{id} runs fetchPlaceById through withMemberSignal so the sheet is not stuck on the raw score");
  ok(/function refreshOwnerPick\(/.test(home) && /fresh: true/.test(home),
    "refreshOwnerPick cache-busts then stamps from the server owner map");
  ok(/lRes\.sessionOwner === true/.test(home) && /likesSessionOwner = true/.test(home),
    "the client caches the server's sessionOwner flag — it does not decide owner from an email or UUID");
  const route = strip(readFileSync(join(ROOT, "app/api/signals/likes/route.js"), "utf8"));
  ok(/isOwnerSession\(sessionUser, OWNER_ID\(\)\)/.test(route),
    "the likes route CALLS isOwnerSession — sessionOwner is server-derived");
  ok(/if \(sessionOwner\) body\.sessionOwner = true/.test(route),
    "…and only a true sessionOwner leaves the route (never cached onto a public visitor response)");

  // Nobody else may hand-roll the banded bump.
  const bad = [];
  for (const rel of ["app/home.js", "lib/railSelect.js", "lib/railsData.js", "lib/memberSignals.js", "app/components/IconicPlaceCard.js", "app/components/RailCard.js"]) {
    const src = strip(readFileSync(join(ROOT, rel), "utf8"));
    if (/(wfScore|_wfScoreRaw)\s*\+\s*(15|6|2|7)\b/.test(src) || /\+\s*1\.5\b/.test(src) || /\+\s*0\.7\b/.test(src)) bad.push(rel);
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

// ── 6. LIKE PATH + DETAIL SHEET, EXECUTED ───────────────────────────────────
{
  ok(isOwnerEmail(OWNER_ACCOUNT_EMAIL) === true, "the founder email is recognized server-side");
  ok(isOwnerEmail("GabrielPereira@me.com") === true, "…case-insensitively");
  ok(isOwnerEmail("someone@else.com") === false, "any other email cannot mint the bump");
  ok(isOwnerEmail(null) === false && isOwnerEmail("") === false, "total over absence");
  ok(isOwnerSession({ id: "u-founder", email: OWNER_ACCOUNT_EMAIL }, "") === true,
    "a signed-in founder session is recognized from the email door");
  ok(isOwnerSession({ id: "env-uuid", email: "someone@else.com" }, "env-uuid") === true,
    "…and from the env UUID door");
  ok(isOwnerSession({ id: "u-other", email: "someone@else.com" }, "env-uuid") === false,
    "any other signed-in session is not the owner");
  ok(isOwnerSession(null, "env-uuid") === false && isOwnerSession({ email: OWNER_ACCOUNT_EMAIL }, "") === false,
    "a session without an id cannot mint sessionOwner");
  ok(ownerUserIds("", { id: "u-founder", email: OWNER_ACCOUNT_EMAIL }, {}, []).includes("u-founder"),
    "missing WF_OWNER_USER_ID still matches the signed-in session email");
  ok(ownerUserIds("", { id: "u-other", email: "someone@else.com" }, {}, []).length === 0,
    "a non-founder session cannot mint ownerPick");
  ok(ownerUserIds("", null, { "u-founder": OWNER_ACCOUNT_EMAIL }, ["u-founder"]).includes("u-founder"),
    "auth-user email on a like row is the second door");
  ok(ownerUserIds("env-uuid", { id: "u-founder", email: OWNER_ACCOUNT_EMAIL }, {}, []).includes("env-uuid")
    && ownerUserIds("env-uuid", { id: "u-founder", email: OWNER_ACCOUNT_EMAIL }, {}, []).includes("u-founder"),
    "env UUID and session email are additive, not either-or");

  const d = memberDelta({ likes: 50 });
  ok(d === 1.2, `owner-weighted likes produce memberDelta ${d} (the +0.12 we must NOT stack)`);
  const liked = stampOwnerPick({ id: "x", wfScore: 81, _members: { authors: 0, warnAuthors: 0 } }, true);
  ok(liked.wfScore === 87 && toDisplayScore(liked.wfScore) === 8.7,
    `8.1 becomes 8.7 on the badge after stampOwnerPick (got ${toDisplayScore(liked.wfScore)}) — +0.6 only, not +0.6+${d / 10}`);
  ok(liked.wfScore !== 81 + d + 6,
    "the displayed bump is not raw + memberDelta + band");
  ok(liked._members.ownerPick === true, "…and the same stamp sets ownerPick so the mark travels with the number");
  const likedTwice = stampOwnerPick(liked, true);
  ok(likedTwice.wfScore === 87,
    `stamping twice does not stack (got ${likedTwice.wfScore}) — uses _wfScoreRaw, not the already-bumped 8.7`);
  const unliked = stampOwnerPick(likedTwice, false);
  ok(unliked.wfScore === 81 && unliked._members.ownerPick === false,
    "unlike restores the pre-bump number and clears the mark");

  const pending = stampOwnerPick({ id: "y", wfScore: null, rating: null, reviews: 0 }, true);
  ok(pending.wfScore == null && pending._members.ownerPick === true,
    "a null/unrated base stays null (no fake bump) but the like still registers as ownerPick");

  const fromRating = stampOwnerPick({ id: "z", wfScore: null, rating: 4.5, reviews: 58 }, true);
  ok(fromRating.wfScore != null && fromRating.wfScore === withOwnerBump(ownerBumpScoreRaw({ rating: 4.5, reviews: 58 }), true),
    "a rated place with a null stored score still moves — the card already showed the computed number");
  ok(stampOwnerPick({ id: "z", wfScore: null, rating: 4.5, reviews: 58 }, false).wfScore == null,
    "…and the non-owner path does not mint that computed score (ranking stays honest)");

  // Already-bumped number must not pick a smaller band on the next like.
  const low = stampOwnerPick({ id: "lo", wfScore: 80 }, true);
  ok(low.wfScore === 95 && low._wfScoreRaw === 80, "8.0 liked → 9.5 and remembers raw 80");
  ok(stampOwnerPick(low, true).wfScore === 95, "liking the 9.5 again does not drop into the +0.2 band");

  const detail = strip(readFileSync(join(ROOT, "app/components/sheets/Detail.js"), "utf8"));
  ok(/<PlaceScoreChip p=\{detail\}/.test(detail),
    "the detail sheet paints PlaceScoreChip on the opened place — the same number as the card, including Score pending");
  ok(/isOwnerPick\(detail\)/.test(detail) && /Curator's pick/.test(detail),
    "…and a founder like shows the Curator's pick mark on that same row");
  ok(/fill=\{liked\[detail\.id\] \? "currentColor" : "none"\}/.test(detail),
    "the detail thumbs-up fills when liked — the owner can see the like registered");
}

console.log(`\ncheck-owner-bump: ${fail ? "FAIL" : "OK"} — ${pass} assertions; 7.5→9.0, 8.0→9.5, 8.1→8.7, 9.0→9.6, 9.2→9.4 EXECUTED; unlike restores raw; like twice still one bump; stampOwnerPick is idempotent; sessionOwner door works; client has no hardcoded identity; detail sheet shows the score + like state; null stays null.`);
process.exit(fail ? 1 : 0);
