// scripts/check-intent-hero-fits.mjs — locks the two declarations that keep
// PremiumIntentHero's mobile panel INSIDE the hero it is drawn in.
//
// What shipped, and why nobody saw it: the mobile rule set
// `grid-template-columns:1fr`. A bare `1fr` is `minmax(auto,1fr)`, and that
// `auto` floor is min-content — so the pill row's `white-space:nowrap` pushed
// the single column to 424px inside a 284px hero. `.wf-intent-hero` carries
// `overflow:hidden`, so the extra ~140px was CLIPPED IN SILENCE:
// document.scrollWidth stayed at the viewport width, no scrollbar appeared,
// and nothing in the build or the guard suite objected. On a 320px phone the
// H1 read "The best things t", the primary CTA read "Personalize my shortlis"
// and the location chip read "ANN / ISLAN". A third of the conversion surface,
// invisible, for the life of the component.
//
// The measurement that exposed it: `.wf-intent-title`'s content box reported
// 376px at 320, 360 AND 390px viewports. A content box that does not change
// with the viewport is not responding to the viewport — that identical triple
// is the fingerprint of a min-content floor, and it is what any future
// investigation should look for first.
//
// Two things are locked here, and they are one fix, not two:
//
//   1. The mobile column keeps a ZERO floor (`minmax(0,...)`), like the
//      desktop rule on the same component already does. Without it the panel
//      escapes the hero again.
//   2. The mobile H1 size stays FLUID. A fixed px size cannot fit every
//      title, because the box it has to fit is 234px at 320px wide and 674px
//      at 760px — the width of the media query's own range. The clamp's floor
//      is what makes the narrowest case fit; a fixed value is what put five
//      lines in a three-line-looking box.
//
// This is a source check, not a render check: it is cheap, it runs in the
// prebuild with no browser, and it fails on the exact edit that would
// reintroduce either half. The self-test at the bottom proves it rejects the
// pre-fix source rather than passing everything it is shown.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-intent-hero-fits: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const REL = "app/components/PremiumIntentHero.js";
let src;
try {
  src = readFileSync(new URL("../" + REL, import.meta.url), "utf8");
} catch (e) {
  fail(`${REL} is missing — this guard is anchored to a file that no longer exists`);
}

// ------------------------------------------------------------ the mobile block
// Everything below is asserted against the @media(max-width:760px) body only.
// Asserting against the whole file would let a desktop-only `minmax(0,1fr)`
// satisfy a mobile requirement, which is precisely the bug: the desktop rule
// was correct the entire time.
const mq = src.match(/@media\(max-width:760px\)\{([\s\S]*?)\n\s*\}\n/);
ok(!!mq, "the @media(max-width:760px) block is still present and parseable — the mobile layout is what this guard is about");
const mobile = mq[1];
ok(mobile.length > 200, `the mobile block parsed to only ${mobile.length} chars — the regex is matching something other than the real block, so every assertion below would be vacuous`);

// 1) The column needs a zero floor.
const col = mobile.match(/\.wf-intent-hero\{[^}]*grid-template-columns:([^;}]+)/);
ok(!!col, "the mobile .wf-intent-hero rule still declares grid-template-columns — if it stopped, the desktop two-column rule leaks into mobile");
const cols = col[1].trim();
ok(!/^1fr$/.test(cols), `mobile grid-template-columns is a bare \`${cols}\`. That is minmax(auto,1fr), whose min-content floor blew the panel to 424px inside a 284px hero and clipped a third of it away in silence. Use minmax(0,1fr).`);
ok(/minmax\(\s*0\s*,/.test(cols), `mobile grid-template-columns is \`${cols}\` — it must carry an explicit 0 floor (minmax(0,...)) so the pill scroller cannot push the column past the hero. The desktop rule on this same component already does this.`);

// 2) The H1 size stays fluid across the query's whole range.
const t = mobile.match(/\.wf-intent-title\{([^}]*)\}/);
ok(!!t, "the mobile .wf-intent-title rule is still present");
const title = t[1];
const fs = title.match(/font-size:([^;}]+)/);
ok(!!fs, "the mobile .wf-intent-title still sets font-size — without it the 42-67px desktop clamp applies on a 234px box");
const size = fs[1].trim();
ok(!/^\d+(\.\d+)?px$/.test(size), `mobile .wf-intent-title font-size is a fixed \`${size}\`. One fixed value cannot fit a 234px box (320px viewport) and a 674px box (760px viewport) — 39px put five lines in this box. Use clamp().`);
ok(/^clamp\(/.test(size), `mobile .wf-intent-title font-size is \`${size}\` — it must be a clamp() so the floor guarantees the narrowest case fits`);

// The clamp floor is the load-bearing number: it is what the longest real
// title is measured against at 320px. Assert it is actually small enough to
// have been measured rather than guessed up toward the old fixed value.
const floor = size.match(/^clamp\(\s*(\d+(?:\.\d+)?)px/);
ok(!!floor, `the clamp floor in \`${size}\` must be an absolute px value — a relative floor cannot be reasoned about against a known content box`);
const floorPx = parseFloat(floor[1]);
ok(floorPx <= 22.5, `the clamp floor is ${floorPx}px. Measured against .wf-intent-title's own 234px content box at 320px, the longest string that actually renders ("The best things to do—without the endless search.") needs <=22.5px to hold two lines. A higher floor silently reintroduces the overflow.`);
ok(floorPx >= 14, `the clamp floor is ${floorPx}px, which is below the 14px readability floor — fitting the text is not worth making it unreadable; shorten the title instead`);

// ------------------------------------------------------------ the clip itself
// `overflow:hidden` on the hero is what made the bug silent. It is legitimate
// (it keeps the photo inside the border radius), so it stays — but it means
// nothing else may rely on overflow being visible to be seen.
ok(/\.wf-intent-hero\{[^}]*overflow:hidden/.test(src), "the hero still clips with overflow:hidden — this guard's two assertions above are the only thing standing between that clip and invisible content");

// ------------------------------------------------------------------ self-test
// A guard that cannot fail is decoration. Re-run the two size/column checks
// against the exact source that shipped and require both to reject it.
const preFix = `
        @media(max-width:760px){
          .wf-intent-hero{grid-template-columns:1fr;min-height:0;border-radius:24px}
          .wf-intent-title{font-size:39px;letter-spacing:-1.35px;margin-bottom:14px}
          .wf-intent-proof{display:flex;overflow-x:auto}
        }
`;
const pm = preFix.match(/@media\(max-width:760px\)\{([\s\S]*?)\n\s*\}\n/);
if (!pm) fail("self-test: the pre-fix fixture no longer parses — the fixture and the real regex have drifted apart, so the self-test proves nothing");
const pmb = pm[1];
const pcol = (pmb.match(/\.wf-intent-hero\{[^}]*grid-template-columns:([^;}]+)/) || [])[1];
const psize = ((pmb.match(/\.wf-intent-title\{([^}]*)\}/) || [])[1] || "").match(/font-size:([^;}]+)/);
if (!pcol || !psize) fail("self-test: could not read the pre-fix column/size — the fixture is not exercising the same parse path as the real check");
if (!/^1fr$/.test(pcol.trim())) fail("self-test: the bare-1fr rule did NOT reject `" + pcol.trim() + "` — the column check is not load-bearing");
if (!/^\d+(\.\d+)?px$/.test(psize[1].trim())) fail("self-test: the fixed-px rule did NOT reject `" + psize[1].trim() + "` — the font-size check is not load-bearing");
pass += 2;

console.log(`check-intent-hero-fits: OK — ${pass} assertions (mobile column keeps a 0 floor so the panel cannot escape the hero's overflow:hidden; H1 stays fluid with a floor measured against the real 234px box; self-test rejected the source that shipped)`);
