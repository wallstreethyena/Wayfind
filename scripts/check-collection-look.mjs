// scripts/check-collection-look.mjs — v6.47. The owner's rule, verbatim:
// "i want these expereince pages all of the pages that are shareble to look
// like the styule from image 1" (image 1 = /trending-now) and "i want that to
// be the universal look for those".
//
// Universal only holds if there is exactly ONE hero component and every
// collection surface renders it. Two failure modes this locks down, both of
// which are silent — the build stays green and the pages just quietly diverge:
//
//   1. Someone re-inlines a <header> hero into a caller. Now /trending-now and
//      the in-app experience screen drift apart one style tweak at a time,
//      which is exactly the state v6.47 was written to end.
//   2. Someone adds a hook to CollectionHero. It is mounted from SERVER pages
//      (app/best-beaches/[metro]/page.js renders RankedExperiencePage without
//      "use client"), so a useState there is a build-time error in production
//      and nothing here would catch it first.
//
// It also locks the CHIP fix in the same release (owner: "the little experience
// chip are also not workign i used to be able to click on them and open a
// page"), including the nested-anchor constraint that makes the fix subtle: a
// TOUR row in ThingsToDoList IS an <a>, so a link-chip inside one would be
// invalid HTML that React renders and browsers silently reparent.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-collection-look: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => { try { return readFileSync(new URL("../" + rel, import.meta.url), "utf8"); } catch (e) { fail(`${rel} is missing — this guardrail is anchored to a file that no longer exists`); return ""; } };

const hero = read("app/components/CollectionHero.js");
const ranked = read("app/components/RankedExperiencePage.js");
const expScreen = read("app/components/screens/Experience.js");
const ttd = read("app/components/ThingsToDoList.js");
const hookDetail = read("app/components/sheets/HookDetail.js");
const iconic = read("app/components/IconicPlaceCard.js");

// ---------------------------------------------------------------- the hero
// 1) It is the ONE hero: it owns the <header>, the scrim, and the wordmark.
ok(/<header style=\{\{ position: "relative", height/.test(hero), "CollectionHero owns the <header> element");
ok(hero.includes("linear-gradient(180deg, rgba(4,8,16,.25) 0%, rgba(4,8,16,.55) 55%, #040810 100%)"), "CollectionHero keeps the scrim that lets white type sit on ANY photo — without it a bright hero image makes the headline unreadable");
ok(hero.includes("/brand/wayfind-wordmark-transparent-v2.png"), "CollectionHero renders the official wordmark asset (brand rule: the PNG master, never a text lookalike)");

// 2) Hook-free. Server pages mount it; a hook here fails the production build,
// not this check — so catch it here, cheaply, first.
ok(!/\buse(State|Effect|Ref|Memo|Callback|Reducer|Context|LayoutEffect)\s*\(/.test(hero), "CollectionHero stays hook-free — server-rendered pages (best-beaches, trending) mount it directly");
ok(!/^"use client"/m.test(hero), "CollectionHero is not client-only — it must render from server components too");

// 3) The defaults are the /trending-now look. Every prop added for the in-app
// variant must render NOTHING when unset, or extracting the header silently
// restyled five live pages.
for (const [prop, dflt] of [["height", "300"], ["radius", "0"], ["bleed", "null"], ["maxWidth", "680"], ["wordmark", "true"]]) {
  ok(new RegExp(`${prop} = ${dflt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(hero), `CollectionHero's ${prop} still defaults to ${dflt} — the standalone share pages depend on the default being the old inline markup`);
}
ok(/\{topRight \|\| null\}/.test(hero) && /\{cta \|\| null\}/.test(hero), "the added slots render null when unset, so callers that do not opt in are byte-unchanged");

// ------------------------------------------------------- one hero, no copies
// 4) Nobody re-inlines it. RankedExperiencePage and the in-app screen must
// DELEGATE, never own, the hero markup.
ok(ranked.includes("./EditorialLandingHero"), "RankedExperiencePage imports the shared editorial hero");
// Comments are stripped first: this file's own header comment explains where the
// <header> WENT, and matching that would be a false FAIL that invites someone to
// weaken the assertion instead of reading it.
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
ok(!/<header/.test(strip(ranked)), "RankedExperiencePage no longer declares its own <header> — it delegates, or the two heroes drift");
ok(!ranked.includes("/brand/wayfind-wordmark-transparent-v2.png"), "the wordmark lives in exactly one place");
ok(expScreen.includes("../EditorialLandingHero"), "screens/Experience.js imports the shared editorial hero");
ok(/<EditorialLandingHero\b/.test(expScreen), "screens/Experience.js renders EditorialLandingHero");
ok(/prefix="wf-experience-editorial"/.test(expScreen), "the in-app hero owns a separate prefix so beach styling remains untouched");

// 4b) v6.75: the Occasions SHEET was the last surface still wearing the old
// chrome (SheetHero's icon tile + 22px title). It wears CollectionHero now, so
// "the Wayfind look" means one thing on screens AND sheets.
//
// TWO reachability findings, and the second one corrects the first.
//
// 1. The sheet believed to be the last hold-out was "All experiences" in
//    app/home.js. It was UNREACHABLE — `setAllExpOpen(true)` appeared zero times
//    and the state was never exposed through ctx. Deleted, not restyled.
// 2. Occasions was then chosen BECAUSE it looked reachable: Menu.js has a
//    `setMenuSheet("experiences")` button. But that button lives inside the
//    `menuSheet === "menu"` block, and NOTHING sets menuSheet to "menu".
//    `menuSheet` only ever becomes "pick" (app/home.js) or "experiences" (from
//    inside the dead "menu" block) — so five of MenuSheet's six sub-states
//    could not be opened. Four of them (menu, community, explore, weather) were
//    deleted; `experiences` was kept because it is the converted surface and its
//    entry point is an open product question (docs/KIMI_QUEUE.md).
//
// So this surface is CORRECTLY STYLED AND CURRENTLY UNREACHABLE, and that is
// stated rather than asserted: pinning "it is dead" would fail the moment
// someone wires the entry point, which is the outcome we want.
//
// The lesson is the one in CLAUDE.md, one level up: proving an entry point
// EXISTS is not proving it is reachable. Reachability is transitive, and a
// grep for the setter stops after one hop.
{
  const menu = read("app/components/sheets/Menu.js");
  ok(menu.includes("../CollectionHero"), "sheets/Menu.js imports CollectionHero — the Occasions sheet renders the universal hero, not the old SheetHero");
  const occ = menu.slice(menu.indexOf('menuSheet === "experiences"'));
  const occBlock = occ.slice(0, occ.indexOf('menuSheet === "weather"') >= 0 ? occ.indexOf('menuSheet === "weather"') : 2600);
  ok(occBlock.length > 400, `the Occasions block parsed to ${occBlock.length} chars — the slice is wrong, so the assertions below would be vacuous`);
  ok(/<CollectionHero\b/.test(occBlock), "the Occasions sheet renders CollectionHero");
  ok(!/<SheetHero\b/.test(occBlock), "the Occasions sheet no longer renders SheetHero — two heroes on one surface is the drift this file exists to stop");
  ok(/wordmark=\{false\}/.test(occBlock), "the Occasions hero suppresses the wordmark, same reason as the in-app screens");
  // Sheet geometry: the grabber owns the top edge, so a negative TOP bleed
  // would slide the photo under it.
  const bleed = occBlock.match(/bleed="([^"]+)"/);
  ok(!!bleed, "the Occasions hero declares a bleed — without it the hero sits inside the sheet's 16px padding and reads as a card, not a hero");
  ok(/^0\s/.test(bleed[1]), `the Occasions hero's bleed starts at 0, not a negative top (found "${bleed[1]}") — the sheet's grabber owns that edge`);
  // CONTENT unchanged: this was a styling conversion, and swapping the tile set
  // is a separate product decision.
  ok(/INTENTS\.map\(/.test(occBlock), "the Occasions sheet still renders the INTENTS tiles — converting the chrome must not quietly change which tiles the surface offers");
  ok(/Surprise Me/.test(occBlock), "the Surprise Me tile survives the restyle");
  ok(/Pick an occasion and the feed reshapes around it\./.test(occBlock), "the Occasions subtitle copy is unchanged");
  // The four unreachable sub-states stay deleted.
  for (const dead of ["menu", "community", "explore", "weather"]) {
    ok(!new RegExp(`menuSheet === "${dead}"`).test(menu), `the unreachable "${dead}" sub-state stays deleted — nothing ever set menuSheet to it, so it rendered for nobody`);
  }
  ok(!/SheetHero/.test(menu), "SheetHero is gone from Menu.js — its last three callers were the deleted blocks");
  // The Occasions sheet currently has NO reachable setter (the one that existed
  // lived inside the deleted "menu" block). That is tracked as a product
  // question in docs/KIMI_QUEUE.md, not asserted here: pinning "it is dead"
  // would fail the moment an entry point is wired, which is the goal.
  ok(/experiences/.test(read("docs/KIMI_QUEUE.md")), "docs/KIMI_QUEUE.md still carries the entry-point question for the experiences chooser — a styled surface with no door is only acceptable while something is tracking it");
  // The deleted sheet stays deleted.
  const home2 = read("app/home.js");
  ok(!/allExpOpen/.test(home2), "the unreachable All-experiences sheet stays deleted — it was rendered but had no code path that could ever set its state to true");
}

// 5) The old flat header is actually GONE, not merely bypassed. A leftover
// 30px title block would render a second headline under the hero.
ok(!/fontSize: 30, fontWeight: 800, color: C\.text/.test(expScreen), "the pre-v6.47 flat 30px title block is removed from screens/Experience.js");

// 6) Every control the flat header carried still exists. A restyle that
// silently drops Share / See-on-map / Save-to-lists is a regression, not a
// restyle — and each is one line, so each is one line away from vanishing.
ok(/Share this list/.test(expScreen) && /shareLink\(/.test(expScreen), "Share survives the restyle, promoted to the hero CTA");
ok(/setMapListOverride\(/.test(expScreen), "See-on-map survives the restyle");
ok(/saveHookList\(/.test(expScreen) && /toggleHookLike\(/.test(expScreen), "Save-to-lists survives the restyle");
ok(/setScreen\("suggested"\)/.test(expScreen), "Back survives the restyle");

// 7) The standalone collections still route through the same shell.
for (const f of ["app/components/TrendingNowClient.js", "app/components/IntentPageClient.js"]) {
  ok(read(f).includes("RankedExperiencePage"), `${f} still renders RankedExperiencePage — that is how /trending-now, /date-night, /family and /hidden-gems inherit the look`);
}

// ------------------------------------------------------------- the chips
// 8) The chips are LINKS, not inert spans wearing a "›".
ok(ttd.includes('href={"/?exp=" + expKey}'), 'ThingsToDoList chips are real links into ?exp= collections (they rendered a "›" and did nothing before v6.47)');
ok(hookDetail.includes('href={"/?exp=" + b.key}'), "HookDetail badges are real links into ?exp= collections");

// 9) …and every chip key resolves. app/home.js's ?exp= handler falls through to
// openExperience(k), which no-ops on an unknown key — a dead link that LOOKS
// alive is worse than the inert span we replaced.
{
  const home = read("app/home.js");
  // BOUND the window to the handler's own if/else chain, which terminates at the
  // `else { openExperience(k); }` fallthrough. An unbounded slice-to-EOF would
  // let an unrelated `k === "…"` anywhere later in home.js satisfy the lookup —
  // a false PASS, which is the dangerous direction (cf. the after(marker, 800)
  // window that let check-geo-gated-boosts drift in wave 2).
  const expStart = home.indexOf('const k = sp.get("exp");');
  ok(expStart >= 0, "the ?exp= deep-link handler is still in app/home.js");
  const expEnd = home.indexOf("openExperience(k);", expStart);
  ok(expEnd > expStart, "the ?exp= handler still falls through to openExperience(k) for unrecognized keys");
  const expBlock = home.slice(expStart, expEnd);
  // Same bounding discipline for the EXPERIENCES lookup: `^\s*foo: {` matched
  // against all of home.js would hit any object literal in 8k lines.
  const expMapStart = home.indexOf("const EXPERIENCES = {");
  ok(expMapStart >= 0, "the EXPERIENCES map is still declared in app/home.js");
  const expMap = home.slice(expMapStart, home.indexOf("\n};", expMapStart));

  const keys = [...ttd.matchAll(/expKey="([a-z]+)"/g)].map((m) => m[1]);
  const catExp = ttd.match(/^const CAT_EXP = \{([^}]*)\}/m);
  ok(!!catExp, "ThingsToDoList still declares CAT_EXP — the category→collection mapping the chips link through");
  const mapped = [...catExp[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  ok(keys.length + mapped.length > 0, "the chip keys are still discoverable — if this parses to nothing the loop below asserts nothing");
  // HookDetail links b.key straight through, and b.key comes from
  // experienceBadges() in home.js — so every key that function can emit is now a
  // user-visible destination and has to resolve too.
  const ebStart = home.indexOf("function experienceBadges(");
  ok(ebStart >= 0, "experienceBadges is still in app/home.js — HookDetail's badge links are built from its keys");
  const ebBody = home.slice(ebStart, home.indexOf("\n}", ebStart));
  const badgeKeys = [...ebBody.matchAll(/q\.add\("([a-z]+)"\)/g)].map((m) => m[1]);
  ok(badgeKeys.length >= 15, "experienceBadges still emits its badge keys through q.add — if this parses to nothing the loop below asserts nothing");

  for (const k of [...new Set([...keys, ...mapped, ...badgeKeys])]) {
    ok(new RegExp(`^\\s*${k}:\\s*\\{`, "m").test(expMap) || new RegExp(`\\bk === "${k}"`).test(expBlock), `?exp=${k} resolves — it is either an EXPERIENCES key or explicitly handled by the deep-link switch`);
  }

  // 9b) IconicPlaceCard (the /best-of, /tonight and other intent-page card —
  // 2026-08-02, owner: "I need the cards to look like the cards from the main
  // menu") gets the SAME chip-key-resolves protection, mirroring 9) above
  // rather than importing from it: IconicPlaceCard owns its own
  // experienceTags() adaptation of experienceBadges() for the same reason
  // ThingsToDoList and HookDetail own theirs (see that function's header
  // comment in IconicPlaceCard.js). Its q.add() keys must resolve exactly like
  // every other surface's, and its EXP_META table (the icon/label it can
  // actually render) must not silently drift ahead of what q.add() can emit —
  // a key with no metadata would render "undefined undefined ›".
  const iconicEbStart = iconic.indexOf("export function experienceTags(");
  ok(iconicEbStart >= 0, "IconicPlaceCard.js still declares experienceTags() — the intent-page cards' chip source");
  const iconicEbBody = iconic.slice(iconicEbStart, iconic.indexOf("\nexport default", iconicEbStart));
  const iconicKeys = [...iconicEbBody.matchAll(/q\.add\("([a-z]+)"\)/g)].map((m) => m[1]);
  ok(iconicKeys.length >= 10, "IconicPlaceCard.js's experienceTags still emits keys through q.add — if this parses to nothing the loops below assert nothing");
  for (const k of new Set(iconicKeys)) {
    ok(new RegExp(`^\\s*${k}:\\s*\\{`, "m").test(expMap) || new RegExp(`\\bk === "${k}"`).test(expBlock), `IconicPlaceCard ?exp=${k} resolves — it is either an EXPERIENCES key or explicitly handled by the deep-link switch`);
  }
  const metaStart = iconic.indexOf("const EXP_META = {");
  ok(metaStart >= 0, "IconicPlaceCard.js still declares EXP_META — the icon/label table its chips render from");
  const metaBlock = iconic.slice(metaStart, iconic.indexOf("\n};", metaStart));
  for (const k of new Set(iconicKeys)) {
    ok(new RegExp(`^\\s*${k}:\\s*\\{`, "m").test(metaBlock), `IconicPlaceCard's EXP_META carries an entry for "${k}" — every key experienceTags can emit must have a real icon/label or the chip renders blank`);
  }
}

// 9c) THE NESTED-INTERACTIVE CONSTRAINT for IconicPlaceCard: the whole <li> is
// onClick={openCard} (navigate to the detail page), same shape as
// ThingsToDoList's <div role="button">. A chip tap must stopPropagation or it
// both fires the chip's own navigation AND falls through to openCard.
ok(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\);\s*\n\s*e\.preventDefault\(\);\s*\n\s*if \(onBadge\)/.test(iconic), "IconicPlaceCard's experience-tag chips stopPropagate + preventDefault before navigating, same pattern as its Save/Like/Dislike/Share buttons");

// 10) THE NESTED-ANCHOR CONSTRAINT. A tour row is itself an <a href> to the
// booking URL. An <a> inside an <a> is invalid HTML: browsers reparent it, the
// booking link breaks, and nothing errors. So the linkable chip must be gated
// on the row NOT being a tour.
ok(/isTour\s*\n?\s*\?\s*<span style=\{chipDead\}>Tour/.test(ttd), "the tour row's category chip stays a plain <span> — the tour card IS an anchor, so a link-chip there would nest anchors");
ok(/linkable=\{!isTour\}/.test(ttd), "the Crowd-favorite chip is only linkable on non-tour rows, same nested-anchor reason");
ok(/if \(!linkable \|\| !expKey\) return <span/.test(ttd), "Chip degrades to an inert span rather than emitting an anchor when it is not allowed to link");

// 11) Both chip links stop propagation. The place row is a <div role="button">
// whose onClick opens the detail sheet; without this the tap navigates AND
// opens a sheet behind it.
ok(/onClick=\{\(e\) => \{ e\.stopPropagation\(\);/.test(ttd), "ThingsToDoList chip links stopPropagation so the card's own onClick does not also fire");
ok(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(hookDetail), "HookDetail badge links stopPropagation for the same reason");

console.log(`check-collection-look: OK — ${pass} assertions (one hero everywhere; the experience chips are live links that cannot nest anchors)`);
