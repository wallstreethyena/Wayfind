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
ok(ranked.includes("./CollectionHero"), "RankedExperiencePage imports CollectionHero");
// Comments are stripped first: this file's own header comment explains where the
// <header> WENT, and matching that would be a false FAIL that invites someone to
// weaken the assertion instead of reading it.
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
ok(!/<header/.test(strip(ranked)), "RankedExperiencePage no longer declares its own <header> — it delegates, or the two heroes drift");
ok(!ranked.includes("/brand/wayfind-wordmark-transparent-v2.png"), "the wordmark lives in exactly one place");
ok(expScreen.includes("../CollectionHero"), "screens/Experience.js imports CollectionHero — this is THE in-app collection look");
ok(/<CollectionHero\b/.test(expScreen), "screens/Experience.js renders CollectionHero");
ok(/wordmark=\{false\}/.test(expScreen), "the in-app hero suppresses the wordmark — the app topbar already carries the logo one row above, and a second one over the photo is the 'logo blocking the save button' bug");

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
}

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
