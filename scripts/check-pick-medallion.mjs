// scripts/check-pick-medallion.mjs — v6.48. Owner, verbatim:
// "i also don't like the way tht ewayfind pick lookswe should make it a
//  circular bade so it fits and make ti loo nice isntead of the rectanlge"
//
// Two separate things are locked here, and the second one is the reason this
// file exists at all.
//
//   (1) THE LOOK. The "Wayfind Pick" seal is one 34px champagne medallion,
//       rendered identically on the home PlaceCard and on the rank-1
//       ThingsToDoList row. Two hand-maintained copies of a badge drift; a
//       shared geometry assertion is what keeps them one design.
//
//   (2) THE PLACEMENT, which is a CSS contract, not a taste call. The obvious
//       implementation — wrap the photo in a position:relative <div> and hang
//       the medallion off it — SILENTLY BREAKS THE CARD. app/components/css.js
//       sizes the thumbnail through a DIRECT-CHILD selector:
//
//         .wf-place-card-layout{display:grid!important;
//                               grid-template-columns:var(--wf-place-card-media) …}
//         .wf-place-card-layout>img{width:96px!important;height:100%!important;…}
//         @media …{.wf-place-card-layout>img{width:88px!important}}   (narrow)
//         @media …{.wf-place-card-layout>img{width:108px!important}}  (desktop)
//
//       A wrapper orphans all three `>img` rules at once and the photo
//       collapses to its intrinsic size at every breakpoint. The build stays
//       green. Nothing throws. So this check asserts the wrapper is absent and
//       the CSS rules it depends on are still there — if someone deletes the
//       CSS the wrapper ban becomes pointless, and if someone adds the wrapper
//       the CSS stops matching. Both halves or neither.
//
//   (3) THE OWNER-PICK SUPPRESSION. An owner-selected place uses the existing
//       in-flow award credential. The generic editorial medallion must remain
//       suppressed or one card communicates the same endorsement twice.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-pick-medallion: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => { try { return readFileSync(new URL("../" + rel, import.meta.url), "utf8"); } catch (e) { fail(`${rel} is missing — this guardrail is anchored to a file that no longer exists`); return ""; } };

const home = read("app/home.js");
const ttd = read("app/components/ThingsToDoList.js");
const css = read("app/components/css.js");
const kit = read("app/components/kit.js");

// ------------------------------------------------------------ bounded window
// Everything below reads PlaceCard's body ONLY. An unbounded search of a
// 9k-line file is how a guardrail turns into a false PASS: some unrelated
// `borderRadius: "50%"` elsewhere would satisfy the medallion assertions while
// the card itself renders nothing.
const cardStart = home.indexOf("function PlaceCard({");
ok(cardStart >= 0, "app/home.js still declares function PlaceCard — this guardrail is pinned to it");
const cardEnd = home.indexOf("\nexport default function Page(", cardStart);
ok(cardEnd > cardStart, "the declaration that terminates PlaceCard's window (export default function Page) is still present — without a real end marker every assertion below would read the rest of the file");
const card = home.slice(cardStart, cardEnd);

// ------------------------------------------------------------- (1) the gate
// WIDENED during the v6.48 rebase onto main. This originally pinned the exact
// literal `!!curatedFor(p) && (...)`, which collided head-on with the older,
// independently-tested rule in test-curator-boost: an OWNER pick must suppress
// the generic editorial pick, so one card never wears two "this is a pick"
// badges. That suppression used to live on the meta-row chip the medallion
// replaced, and moving the chip dropped the term — which would have shipped the
// owl seal (bottom-left) and the medallion (top-left) on the same card. Not
// overlapping, so it would not have LOOKED broken, just duplicated.
//
// So the assertions now check the three things that actually matter — editorial
// source, score gate, and owner-pick suppression — instead of one exact string.
// Same intent, no longer breaks the moment a term is legitimately added.
ok(/const isWayfindPick = [^;]*curatedFor\(p\)/.test(card),
  "PlaceCard still derives isWayfindPick from curatedFor — the seal is editorial, not automatic");
ok(/const isWayfindPick = [^;]*pickEligibleByScore\(dispScore\)/.test(card),
  "isWayfindPick stays score-gated, so a curated-but-weak place never wears it (see test-score-band: pick blocked on yellow/red)");
ok(/const isWayfindPick = [^;]*!isCuratorPick/.test(card),
  "an owner pick suppresses the medallion — otherwise a card that is both owner-picked and curated wears the owl seal AND the medallion (test-curator-boost enforces the same rule from the other side)");
ok(/\{isWayfindPick && \(/.test(card),
  "the medallion is actually RENDERED. isWayfindPick was defined-but-unused for one commit during v6.48 and the badge silently disappeared from every card — an unused const is legal JS, so nothing but this line catches it");

// ------------------------------------------------------ (2) the placement
// The medallion must appear BEFORE the layout div, i.e. as a child of the card
// root (which is position:relative), never inside the grid.
const medIdx = card.indexOf("{isWayfindPick && (");
const layoutIdx = card.indexOf('<div className="wf-place-card-layout"');
ok(layoutIdx > 0, "PlaceCard still renders .wf-place-card-layout");
ok(medIdx < layoutIdx,
  "the medallion is a child of the CARD ROOT, outside .wf-place-card-layout — inside the grid it would become a third grid item and shove the content column sideways");
ok(/position: "absolute", top: 8, left: 8/.test(card),
  "the medallion is pinned TOP-left over the media column. Bottom-anchored is the v6.44 bug that put the curator mark on top of the Save button");
// THE TAP MUST FALL THROUGH. The card root is a role="button" whose onClick
// opens the detail sheet. The medallion is decoration sitting on top of it, so
// it must carry NO handler of its own — with no onClick and no
// stopPropagation, a tap on the badge bubbles to onDetail and behaves exactly
// like a tap on the photo. (Solving this with pointer-events:none would work
// for the tap but kill the hover title, which is the only place a sighted
// mouse user learns what ✦ PICK means. Handler-free is the better trade, and
// this asserts it stays that way.)
{
  const med = card.slice(medIdx, layoutIdx);
  ok(!/onClick|onPointer|onMouseDown|stopPropagation/.test(med),
    "the medallion carries no event handler — it is decoration on a role=button card, and any handler here would either swallow the tap that opens the detail sheet or need a stopPropagation that does the same thing");
}

// THE WRAPPER BAN. In the photo branch, FallbackImg must be the FIRST element
// child of .wf-place-card-layout, with nothing but whitespace and comments in
// between. Asserting "…{p.photo ? <FallbackImg" alone is not enough: prepending
// `<div className="whatever">` on the same line leaves that substring intact
// and the check passes while the photo is orphaned. So walk from the end of the
// layout's own opening tag and require the very next thing to be the branch.
const layoutBlock = card.slice(layoutIdx, card.indexOf('<div className="wf-place-card-content"', layoutIdx));
ok(layoutBlock.length > 0 && !layoutBlock.includes("wf-place-card-content"), "the layout window terminates at the content column");
{
  const openTagEnd = layoutBlock.indexOf(">");
  ok(openTagEnd > 0, ".wf-place-card-layout's opening tag is parseable — if this does not find a '>' the assertion below reads nothing and would pass vacuously");
  const firstChild = layoutBlock
    .slice(openTagEnd + 1)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")   // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "")        // block comments
    .trimStart();
  // RE-POINTED v8.13.3 (owner: "I don't want any of the place cards not to
  // have an image"): the branch condition widened to
  // {(p.photo || cardMarketFallback) ? <FallbackImg …} — the stock-scene last
  // rung of the photo ladder (components/marketPhoto.js). The WRAPPER BAN this
  // block exists for is unchanged: the branch is still the first child, and
  // FallbackImg is still unwrapped, so '.wf-place-card-layout>img' matches.
  ok(firstChild.startsWith("{(p.photo || cardMarketFallback)"),
    `the thumbnail branch is the FIRST child of .wf-place-card-layout — found ${JSON.stringify(firstChild.slice(0, 60))} instead. Any wrapper element orphans the '.wf-place-card-layout>img' sizing rules and the photo collapses at all three breakpoints`);
  ok(/^\{\(p\.photo \|\| cardMarketFallback\)\s*\n?\s*\?\s*<FallbackImg /.test(firstChild),
    "…and that branch renders an UNWRAPPED <FallbackImg>, so the direct-child selector still matches the real <img>");
}
ok(!/<div className="wf-place-card-thumb"/.test(card),
  "no .wf-place-card-thumb wrapper — that was the first (broken) v6.48 attempt at hosting this medallion");

// …and the CSS those rules live in is still the direct-child form, at all three
// breakpoints. Ban + rules are one contract; neither half is meaningful alone.
ok(/\.wf-place-card-layout>img\{width:96px!important;height:100%!important/.test(css), "css.js keeps the base `.wf-place-card-layout>img` sizing rule (96px)");
ok(/\.wf-place-card-layout>img\{width:88px!important\}/.test(css), "css.js keeps the narrow-breakpoint `>img` override (88px)");
ok(/\.wf-place-card-layout>img\{width:108px!important\}/.test(css), "css.js keeps the desktop-breakpoint `>img` override (108px)");
ok(/\.wf-place-card\{[^}]*position:relative/.test(css),
  "the card root is still position:relative — it is the containing block the medallion is absolutely positioned against, and without it the badge escapes to the nearest positioned ancestor");

// ---------------------------------------------- (3) the old chip is really gone
// Comments are stripped first. The replacement comment left at the old site
// deliberately NAMES the chip it replaced so the next reader knows where the
// badge went — matching that would be a false FAIL, and a false FAIL invites
// someone to weaken the assertion rather than read it.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cardCode = strip(card);
ok(!/★ Wayfind Pick/.test(cardCode),
  'the old "★ Wayfind Pick" text chip is removed from PlaceCard. Left in place it renders a second, rectangular seal in the meta row — the exact thing the owner asked us to replace');
ok(!/Wayfind Pick/.test(cardCode.slice(cardCode.indexOf('className="wf-place-card-meta"'), cardCode.indexOf('className="wf-place-card-highlights"'))),
  "nothing named Wayfind Pick is back in the wrap-prone .wf-place-card-meta row (reviews / price / open / distance). That row is flexWrap, which is why the pill dropped to its own line on narrow cards");

// ------------------------------------------------- (1b) one design, two surfaces
// ThingsToDoList's rank-1 medallion is the reference implementation. Assert the
// geometry MATCHES rather than merely exists, so a tweak to one surface that is
// not mirrored fails here instead of shipping two different seals.
for (const [re, what] of [
  [/width: 34, height: 34, borderRadius: "50%"/, "34px circle"],
  [/background: "radial-gradient\(circle at 50% 26%, rgba\(232,201,122,\.3\), rgba\(8,11,17,\.86\) 74%\)"/, "champagne radial fill"],
  [/border: `1\.5px solid \$\{CHAMPAGNE\.base\}`/, "1.5px CHAMPAGNE.base ring"],
  [/backdropFilter: "blur\(4px\)"/, "4px backdrop blur"],
  [/boxShadow: MEDALLION_SHADOW/, "shared MEDALLION_SHADOW token (never an inlined literal — an inlined shadow is exactly how two copies of one seal start to drift)"],
  [/fontSize: 12, lineHeight: 1 \}\}>✦</, "the ✦ glyph at 12px"],
  [/fontSize: 6\.5, fontWeight: 900, letterSpacing: "\.09em", lineHeight: 1 \}\}>PICK</, "the PICK wordmark at 6.5/900/.09em"],
]) {
  ok(re.test(card), `PlaceCard's medallion keeps the ${what}`);
  ok(re.test(ttd), `ThingsToDoList's medallion keeps the ${what} — the two surfaces must stay one design`);
}
// …and the token both surfaces reference actually exists and is imported. A
// bare `boxShadow: MEDALLION_SHADOW` against an undeclared identifier is a
// ReferenceError at RENDER time, not at build time — the page compiles, ships,
// and blows up in the browser on the first curated card. (That is not
// hypothetical: it is the exact half-finished state this extraction passed
// through.) Assert the declaration and both imports.
ok(/^export const MEDALLION_SHADOW = "/m.test(kit),
  "kit.js exports MEDALLION_SHADOW — both medallions reference it, and an undeclared identifier here is a runtime ReferenceError that the production build does not catch");
ok(/MEDALLION_SHADOW[^\n]*\} from "\.\/components\/kit"/.test(home),
  "app/home.js imports MEDALLION_SHADOW from the kit");
ok(/MEDALLION_SHADOW[^\n]*\} from "\.\/kit"/.test(ttd),
  "ThingsToDoList.js imports MEDALLION_SHADOW from the kit");
// The A/B that chose this value: on bright sand and neon-orange thumbnails the
// old single black blur left the gold ring with nothing to sit against. The
// near-black 1px hairline is what holds the edge on ANY photo, and the inset
// top bevel is what makes the disc read as struck rather than printed. A future
// simplification that drops either one undoes the reason the token exists.
ok(/0 0 0 1px rgba\(4,8,16,\.55\)/.test(kit),
  "MEDALLION_SHADOW keeps its near-black 1px outer hairline — without it the champagne ring dissolves into bright photos (verified by screenshot A/B across five backgrounds)");
ok(/inset 0 7px 9px -7px rgba\(255,255,255,\.35\)/.test(kit),
  "MEDALLION_SHADOW keeps its inset top bevel — the layer that makes the seal read as struck metal instead of a flat printed dot");

ok(/role="img" aria-label="Wayfind Pick"/.test(card) && /role="img" aria-label="Wayfind Pick"/.test(ttd),
  'both medallions expose role="img" with an aria-label — the ✦/PICK glyphs are aria-hidden, so without the label a screen reader announces nothing at all');
ok(/title="Wayfind Pick — /.test(card) && /title="Wayfind Pick — /.test(ttd),
  "both medallions carry a hover title explaining what the seal means — a bare ✦ is not self-describing");

console.log(`check-pick-medallion: OK — ${pass} assertions (one 34px champagne seal on both surfaces; positioned against the card root so the grid's >img sizing contract survives)`);
