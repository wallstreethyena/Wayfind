// scripts/check-brand-derivatives.mjs — the two static brand images on the home
// page's critical path stay off it.
//
// THE INCIDENT THIS ENCODES (measured on production, 2026-08-12). The home
// page's LCP element was /brand/wayfind-default-hero-adobestock-289023289.jpeg
// — 1600x1066, 473KB, no srcSet, no modern format — painted into a card that is
// 93% of a column at most 960px wide, and fetched at TOP priority because the
// element carries loading="eager" fetchPriority="high". The header wordmark was
// a 167KB PNG painted at 151x39. Together, ~640KB of unavoidable first-visit
// bytes to render about 40KB worth of pixels.
//
// The repair is committed AVIF/WebP derivatives at the widths the elements
// actually paint (scripts/build-brand-derivatives.mjs). What makes it fragile
// is that EVERY PART of it is silently reversible:
//
//   1. Someone re-points the <img src> at the .jpeg "so it works without the
//      derivatives" and the 473KB comes straight back — invisibly, because the
//      page still looks identical.
//   2. Someone deletes public/brand/opt/ as "generated output that shouldn't be
//      committed" and the hero 404s.
//   3. Someone adds a <source type="image/jpeg"> or moves the srcSet around and
//      the <img> ends up naming the original again.
//
// (3) is the subtle one and it deserves its own paragraph. React hoists a
// <link rel=preload> for an eager, high-priority image by reading the <img>
// element — NOT its <source> siblings. So if the img names the .jpeg, the
// browser preloads all 473KB at top priority regardless of what the <picture>
// eventually resolves to, and every derivative becomes pure added weight. The
// img must name a webp. That is not a style preference; it is the mechanism.
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

let pass = 0;
const fail = (m) => { console.error("check-brand-derivatives: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(p("app/home.js"), "utf8");
const css = readFileSync(p("app/components/css.js"), "utf8");

// ─── 1. the derivatives exist and are committed ─────────────────────────────
const HERO_W = [460, 760, 1120, 1600];
for (const w of HERO_W) {
  for (const ext of ["avif", "webp"]) {
    const rel = `public/brand/opt/hero-${w}.${ext}`;
    ok(existsSync(p(rel)), `${rel} is missing — run \`npm i --no-save sharp && node scripts/build-brand-derivatives.mjs\` and COMMIT the output. These are static brand assets; they are committed on purpose (see that script's header).`);
  }
}
for (const ext of ["avif", "webp"]) {
  ok(existsSync(p(`public/brand/opt/wordmark-400.${ext}`)), `public/brand/opt/wordmark-400.${ext} is missing`);
}

// ─── 2. every candidate is smaller than the original it replaces ────────────
// A derivative that is BIGGER than the source means the encode settings were
// changed to something lossless-ish and the whole exercise is now a regression.
const HERO_SRC = statSync(p("public/brand/wayfind-default-hero-adobestock-289023289.jpeg")).size;
for (const w of HERO_W) {
  for (const ext of ["avif", "webp"]) {
    const n = statSync(p(`public/brand/opt/hero-${w}.${ext}`)).size;
    ok(n < HERO_SRC, `hero-${w}.${ext} is ${(n / 1024).toFixed(1)}KB, which is not smaller than the ${(HERO_SRC / 1024).toFixed(1)}KB original — re-check the encode settings in scripts/build-brand-derivatives.mjs`);
  }
}
// The smallest candidate is the one a phone actually downloads, and it is the
// number the whole change was made for. 60KB is a deliberately loose ceiling:
// it is currently ~15KB, and this only has to catch a change of KIND.
const SMALLEST = statSync(p("public/brand/opt/hero-460.avif")).size;
ok(SMALLEST < 60 * 1024, `hero-460.avif is ${(SMALLEST / 1024).toFixed(1)}KB — the phone-width LCP candidate has grown by an order of magnitude`);

// ─── 3. THE MECHANISM: the <img> may never name the original ────────────────
const card = home.slice(home.indexOf("function DiscoveryHeroCard"), home.indexOf("function HeroRail"));
ok(card.includes("<picture>"), "the home hero must render a <picture> — a bare <img> cannot offer AVIF");
const img = (card.match(/<img[^>]*fetchPriority="high"[^>]*\/>/s) || [""])[0];
ok(!!img, "the home hero's eager <img> moved or changed shape — re-point this assertion before shipping");
ok(!/\.jpeg|\.jpg/.test(img),
  "the home hero's <img> names the original JPEG again. React hoists the fetchPriority=\"high\" preload off the <img>, NOT off the <source>s — so this alone re-downloads the full-size original at top priority on every first visit and makes every derivative dead weight.");
ok(/src="\/brand\/opt\/hero-\d+\.webp"/.test(img), "the hero <img> src must be a committed webp derivative");
ok(/srcSet="[^"]*hero-460\.webp 460w/.test(img), "the hero <img> must carry the full webp srcSet, so narrow viewports get the narrow file");
ok(/<source type="image\/avif"/.test(card), "the AVIF set must be offered via <source>, where it cannot become the preload target");
ok(/sizes=\{HERO_ART_SIZES\}/.test(card) && card.match(/sizes=\{HERO_ART_SIZES\}/g).length === 2,
  "both the <source> and the <img> must carry the SAME sizes value — one of them guessing differently is how a phone downloads the 1600px candidate");
ok(/const HERO_ART_SIZES = "\(max-width:899px\) 93vw, \(max-width:1179px\) 744px, \d+px"/.test(home),
  "HERO_ART_SIZES must keep naming the real breakpoints (899/1179) the CSS uses — a sizes value that disagrees with the layout picks the wrong file at every width");

// ─── 4. the <picture> may not change the card's geometry ───────────────────
ok(css.includes(".wf-discovery-visual picture{position:absolute;inset:0;display:block}"),
  "an inline <picture> contributes a line box above the copy. It must be taken out of flow, or wrapping an <img> that was already absolutely positioned silently makes the hero card taller.");

// ─── 5. the wordmark keeps its PNG fallback AND its modern set ─────────────
ok(/background-image:url\("\/brand\/wayfind-wordmark-transparent-v2\.png"\);background-image:image-set\(/.test(css),
  "the wordmark must declare the PNG FIRST and then override with image-set() — engines that cannot parse type() drop the second declaration and need the first one to still be there");
ok(/image-set\(url\("\/brand\/opt\/wordmark-400\.avif"\) type\("image\/avif"\),url\("\/brand\/opt\/wordmark-400\.webp"\) type\("image\/webp"\)\)/.test(css),
  "the wordmark image-set must offer avif then webp, each with an explicit type()");
ok((css.match(/wayfind-wordmark-transparent-v2/g) || []).length === 1,
  "the image-set must NOT name the PNG again — test-brand.mjs counts this string exactly once across the homepage shell");

console.log(`check-brand-derivatives: OK — ${pass} assertions (the ${(HERO_SRC / 1024).toFixed(0)}KB hero and the 167KB wordmark are both off the critical path; the eager <img> cannot name the original, which is what the preload actually reads)`);
