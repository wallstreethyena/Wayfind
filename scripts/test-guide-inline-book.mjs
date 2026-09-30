#!/usr/bin/env node
/**
 * test-guide-inline-book — locks the "guide-inline-book-v1" experiment
 * (lib/guideInlineBook.js, app/guides/[slug]/GuidePickDecision.js).
 *
 * Every assertion CALLS the real code (CLAUDE.md "assert on the call"):
 *   1. offer choice — the real chooseInlineOffer over fixture inventory: word
 *      match only, link-checked, rating/review/price floors, most-reviewed wins,
 *      and null (never a loosened match) when nothing qualifies.
 *   2. assignment — deterministic, ~50/50, independent of explore-bridge-v1.
 *   3. SEO / control invariance — the real component is RENDERED to static
 *      markup: server output and the control arm are the invisible sentinel
 *      only (no copy, no link), so indexed HTML is unchanged.
 *   4. treatment — the real view renders the cue and ONE offer whose href is
 *      our own /api/commerce/go redirect (never a partner domain).
 *   5. one tap, one commerce event — the real click handler is invoked with a
 *      spy at window.posthog.capture and the recorded events are counted.
 *   6. mounting — page.js renders <GuidePickDecision inside the picks loop,
 *      gated by inlineBookConfig (structural; the page itself needs live data).
 *
 * Red-prove: `node scripts/test-guide-inline-book.mjs --red-prove` re-runs
 * checks 1 and 5 against in-memory mutations (the quality floor removed; a
 * doubled commerce emit) and requires both to FAIL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const lib = await import("../lib/guideInlineBook.js");
const exp = await import("../lib/experiment.js");
const SLUG = "things-to-do-orlando-not-theme-parks";
const img = "https://media.example/p.jpg";
const inventory = [
  { code: "5039P5", provider: "viator", title: "One-Hour Airboat Ride Near Orlando", rating: 4.8, reviews: 905, fromPrice: 66, duration: "1h", image: img },
  { code: "42627P1", provider: "viator", title: "90 minute Everglades Airboat Tour near Orlando Florida", rating: 4.8, reviews: 1372, fromPrice: 67, duration: "2h", image: img },
  { code: "DEAD1", provider: "viator", title: "Airboat Mega Tour", rating: 5, reviews: 9000, fromPrice: 50, image: img, link_ok: false },
  { code: "THIN1", provider: "viator", title: "Tiny Airboat Ride", rating: 5, reviews: 12, fromPrice: 30, image: img },
  { code: "LOW1", provider: "viator", title: "Budget Airboat Ride", rating: 4.1, reviews: 4000, fromPrice: 20, image: img },
  { code: "NOPRICE", provider: "viator", title: "Airboat Sunset", rating: 4.9, reviews: 3000, image: img },
  { code: "BOAT1", provider: "viator", title: "Winter Park Scenic Boat Tour", rating: 5, reviews: 20000, fromPrice: 25, image: img },
];

function checkOfferChoice(choose) {
  const best = choose(inventory, "airboat");
  ok(best && best.offerId === "42627P1", `offer: most-reviewed qualifying airboat wins (got ${best && best.offerId})`);
  ok(best && best.fromPrice === 67 && best.rating === 4.8 && best.reviews === 1372 && best.duration === "2h", "offer: carries price, rating, reviews and duration for the decision line");
  ok(choose(inventory.filter((r) => /Scenic Boat/.test(r.title)), "airboat") === null, "offer: 'airboat' never matches a plain 'Boat' title — no loosened match");
  ok(choose(inventory.filter((r) => ["DEAD1", "THIN1", "LOW1", "NOPRICE"].includes(r.code)), "airboat") === null, "offer: dead links, <100 reviews, <4.5 rating and missing price are all refused");
  ok(choose(inventory, undefined) === null && choose([], "airboat") === null, "offer: no rule or no inventory → null, never a search");
}
checkOfferChoice(lib.chooseInlineOffer);

// 2. assignment
let t = 0, same = 0;
for (let i = 0; i < 20000; i++) {
  const v = lib.inlineBookVariant("id-" + i);
  if (v === "treatment") t++;
  if (v === exp.variantForId("id-" + i, exp.EXPERIMENT_KEY)) same++;
}
ok(t > 9600 && t < 10400, `assignment: ~50/50 over 20k ids (treatment=${t})`);
ok(same > 9600 && same < 10400, `assignment: independent of ${exp.EXPERIMENT_KEY} (agreement=${same}, expect ~50%)`);
ok(lib.inlineBookVariant("stable-id") === lib.inlineBookVariant("stable-id") && lib.inlineBookVariant(null) === null, "assignment: deterministic; no id → no arm");
ok(/-v\d+$/.test(lib.GUIDE_INLINE_BOOK_KEY), "assignment: key is versioned");
ok(lib.inlineBookConfig(SLUG, 0)?.book?.match === "airboat" && lib.inlineBookConfig(SLUG, 3) === null && lib.inlineBookConfig("some-other-guide", 0) === null, "scope: only picks 1–3 of the Orlando guide are in the test");

// 3–5. the real component
globalThis.window = undefined;
const mod = await loadComponent(path.join(REPO, "app/guides/[slug]/GuidePickDecision.js"), REPO);
const ssr = renderToStaticMarkup(createElement(mod.default, { slug: SLUG, pickIndex: 0 }));
ok(/data-guide-exp-sentinel="1"/.test(ssr) && !/Best for|commerce\/go|<a[\s>]/.test(ssr), "SEO: server HTML is the invisible sentinel only — no copy, no link");
const config = lib.inlineBookConfig(SLUG, 0);
const offer = lib.chooseInlineOffer(inventory, "airboat");
const control = renderToStaticMarkup(createElement(mod.GuidePickDecisionView, { config, variant: "control", offer, slug: SLUG, pickIndex: 0 }));
ok(!/Best for|commerce\/go/.test(control), "control arm: nothing but the sentinel renders");
const treat = renderToStaticMarkup(createElement(mod.GuidePickDecisionView, { config, variant: "treatment", offer, slug: SLUG, pickIndex: 0 }));
const hrefs = [...treat.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
ok(/Best for:/.test(treat) && /Book an airboat ride near Orlando/.test(treat) && /from \$67/.test(treat) && /★ 4\.8 \(1,372\)/.test(treat), "treatment: cue + offer with price and rating render");
ok(hrefs.length === 1 && hrefs[0].startsWith("/api/commerce/go?") && new URL(hrefs[0], "https://x.test").searchParams.get("offer") === "42627P1" && new URL(hrefs[0], "https://x.test").searchParams.get("provider") === "viator", `treatment: exactly one link, to our own redirect (got ${JSON.stringify(hrefs)})`);
ok(/rel="sponsored noopener nofollow"/.test(treat) && /commission/.test(treat), "treatment: sponsored rel + inline commission disclosure");
ok(/separate operator from the pick above/.test(treat) && !/Boggy Creek/.test(treat), "treatment: the offer says it is a different operator and never claims the pick's venue");
const comp = readFileSync(path.join(REPO, "app/guides/[slug]/GuidePickDecision.js"), "utf8");
ok(/if \(exposed\.current\) return;[\s\S]{0,400}setOffer\(chosen\)/.test(comp), "no layout shift: an offer that resolves after pick 1 was seen is dropped before setOffer (structural — the effect needs a browser)");
const noOffer = renderToStaticMarkup(createElement(mod.GuidePickDecisionView, { config, variant: "treatment", offer: null, slug: SLUG, pickIndex: 0 }));
ok(/Best for:/.test(noOffer) && !/<a[\s>]/.test(noOffer), "treatment without a qualifying offer: cue only, no link");

function runClick(handler) {
  const captured = [];
  globalThis.window = { posthog: { capture: (event, props) => captured.push([event, props]) }, navigator: { userAgent: "Mozilla/5.0 (iPhone)", webdriver: false }, localStorage: { getItem: () => null, setItem() {} } };
  const anchor = { href: "" };
  const href = handler({ offer, slug: SLUG, pickIndex: 0, city: "Orlando", anchor, win: globalThis.window });
  globalThis.window = undefined;
  return { captured, href, anchor };
}
function checkClick(handler) {
  const { captured, href, anchor } = runClick(handler);
  const commerce = captured.filter(([e]) => e === "commerce_cta_clicked");
  const product = captured.filter(([e]) => e === "guide_pick_book_clicked");
  ok(commerce.length === 1, `click: exactly ONE commerce_cta_clicked (got ${commerce.length})`);
  ok(product.length === 1 && product[0][1].pick === 1 && product[0][1].variant === "treatment", "click: one guide_pick_book_clicked with pick + variant");
  const c = commerce[0] && commerce[0][1];
  ok(c && c.surface === "guide_pick_inline" && c.experiment_id === "guide-inline-book-v1" && c.variant === "treatment" && c.offer_id === "42627P1" && c.click_id, "click: commerce event carries surface, experiment, variant, offer and click id");
  ok(href && anchor.href === href && new URL(href, "https://x.test").searchParams.get("click_id") === (c && c.click_id), "click: the anchor is re-pointed at our redirect with the SAME click id the event recorded");
}
checkClick(mod.onInlineOfferClick);

// 6. mounting
const page = readFileSync(path.join(REPO, "app/guides/[slug]/page.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const loop = page.slice(page.indexOf("g.picks.map((pick, i)"), page.indexOf("g.picks.map((pick, i)") + 4000);
ok(/inlineBookConfig\(params\.slug, i\)\s*\?\s*<GuidePickDecision[\s/>]/.test(loop), "mount: page.js renders <GuidePickDecision inside the picks loop, gated by inlineBookConfig");
ok((page.match(/<GuidePickDecision[\s/>]/g) || []).length === 1, "mount: rendered in exactly one place");

// red-prove
if (process.argv.includes("--red-prove")) {
  const before = pass, beforeFail = fail.length;
  // Mutation A: the rating/review quality floor deleted from the REAL module
  // source (imports rewritten to absolute URLs so it loads on its own).
  const src = readFileSync(path.join(REPO, "lib/guideInlineBook.js"), "utf8");
  const target = ".filter((row) => Number(row.rating) >= INLINE_OFFER_MIN_RATING && Number(row.reviews) >= INLINE_OFFER_MIN_REVIEWS)";
  if (!src.includes(target)) { console.error("test-guide-inline-book: red-prove mutation target missing — update the mutation"); process.exit(1); }
  const loosened = src.replace(target, "")
    .replace('"./experiment.js"', JSON.stringify(new URL("../lib/experiment.js", import.meta.url).href))
    .replace('"./intentPartnerPicks.js"', JSON.stringify(new URL("../lib/intentPartnerPicks.js", import.meta.url).href));
  const mutated = await import("data:text/javascript;base64," + Buffer.from(loosened).toString("base64"));
  console.log("test-guide-inline-book: mutation A applied (quality floor removed)");
  checkOfferChoice(mutated.chooseInlineOffer);
  const loosenedFailed = fail.length > beforeFail;
  const mid = fail.length;
  checkClick((args) => { const href = mod.onInlineOfferClick(args); args.win.posthog.capture("commerce_cta_clicked", {}); return href; });
  const doubledFailed = fail.length > mid;
  fail.length = beforeFail; pass = before;
  // The doubled-emit mutation above captures on a window already torn down by
  // runClick, so run it with a live window to be sure the mutation applied.
  const captured = [];
  globalThis.window = { posthog: { capture: (e) => captured.push(e) }, navigator: { userAgent: "x" }, localStorage: { getItem: () => null, setItem() {} } };
  mod.onInlineOfferClick({ offer, slug: SLUG, pickIndex: 0, city: "Orlando", anchor: {}, win: globalThis.window });
  globalThis.window.posthog.capture("commerce_cta_clicked");
  const mutationApplied = captured.filter((e) => e === "commerce_cta_clicked").length === 2;
  globalThis.window = undefined;
  if (!loosenedFailed || !doubledFailed || !mutationApplied) { console.error(`test-guide-inline-book: RED-PROVE FAILED (loosened=${loosenedFailed}, doubled=${doubledFailed}, applied=${mutationApplied})`); process.exit(1); }
  console.log("test-guide-inline-book: red-prove OK — a removed quality floor and a doubled commerce emit both fail");
}

if (fail.length) {
  for (const m of fail) console.error("test-guide-inline-book: FAIL — " + m);
  process.exit(1);
}
console.log(`test-guide-inline-book: OK — ${pass} assertions (offer choice, 50/50 assignment, SSR/control invariance, treatment link = own redirect, one tap = one commerce event, mounted once)`);
