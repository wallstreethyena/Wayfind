#!/usr/bin/env node
/**
 * check-guide-card — the guide card is its own look, the place card is not.
 *
 * OWNER REQUEST (2026-10-07), home rails "Showing Local Guides": no chip
 * bubbles on a guide card; the TITLE is the centre of attention and is never
 * compressed or cut off (no ellipsis, no line clamp); guide cards look a little
 * different from place cards; and every guide card shows a real PICTURE, not
 * the blank monogram tile the first-pick-has-no-photo case used to produce.
 * PROTECTED RULE: every PLACE card keeps the one standard RailCard look.
 *
 * This RENDERS the components (jsxLoad), it does not grep them, except for the
 * CSS rule, which can only be read as text here.
 *
 * Asserts:
 *   1. a plain place RailCard (no variant) is BYTE-IDENTICAL to the fixture
 *      captured from the pre-change component, and never carries wf-guide-card
 *   2. a rendered guide card: wf-guide-card present, NO chips element, the full
 *      (longest) title text present in .wf-place-card-name, no inline clamp
 *   3. the .wf-guide-card CSS removes the clamp (display:block, line-clamp
 *      unset, overflow visible) and carries no numeric line-clamp
 *   4. the photo ladder: hero beats pick beats place photo beats monogram, the
 *      hero img and its (c) credit really render, and under a guide
 *      photo-policy filter a Google-backed rung is blanked, never shown
 *   5. every guide in lib/guides.js resolves to a real photo (none is monogram)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };

const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
const GuideDiscoveryCard = (await loadComponent(path.join(ROOT, "app/components/GuideDiscoveryCard.js"), ROOT)).default;
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const { guideCardPhoto } = await import("../lib/guideCardPhoto.js");
const { GUIDES } = await import("../lib/guides.js");
const { GUIDE_CARD_PHOTOS } = await import("../lib/guideCardPhotoIndex.js");

const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);
const slugs = Object.keys(GUIDES);
ok(slugs.length > 50, `positive control: ${slugs.length} guides loaded from lib/guides.js`);
const guideOf = (slug) => ({ slug, ...GUIDES[slug] });
const clean = (t) => String(t || "").replace(/\s*[–—]\s*/g, ", ").replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

// ── 1. PLACE CARD: byte-identical, never a guide ────────────────────────────
const placeProps = { photo: "/api/photo?place=x&w=640", title: "Mazzaro's Italian Market", eyebrow: "Italian market", score: 8.7, facts: ["St. Petersburg", "$$"], chips: [{ key: "a", icon: "📍", label: "Gulfport" }], take: "Worth the trip for the cannoli.", cta: { label: "Get tickets", href: "/api/x/go", external: false }, href: "/p/abc" };
const placeHtml = html(h(RailCard, placeProps));
const fixture = readFileSync(path.join(ROOT, "scripts/fixtures/rail-card-place.pre-guide-variant.html"), "utf8").replace(/\n$/, "");
ok(placeHtml === fixture, "a place RailCard rendered WITHOUT variant differs from the pre-change fixture (scripts/fixtures/rail-card-place.pre-guide-variant.html): the place card look must not change");
ok(!placeHtml.includes("wf-guide-card"), "a place RailCard carries wf-guide-card");
ok(html(h(RailCard, { ...placeProps, variant: "other" })) === fixture, "an unknown variant value changed the place card markup (only variant=\"guide\" may)");

// ── 2. GUIDE CARD: no chips, full title, guide class, no clamp ──────────────
const longest = [...slugs].sort((a, b) => GUIDES[b].title.length - GUIDES[a].title.length)[0];
const g = guideOf(longest);
g.mins = 7;
const guideHtml = html(h(GuideDiscoveryCard, { guide: g }));
ok(/class="wf-place-card wf-rail-card[^"]*\bwf-guide-card\b/.test(guideHtml), "guide card root lacks wf-guide-card");
ok(!guideHtml.includes("wf-place-card-highlights"), "guide card renders a chips row (wf-place-card-highlights): chip bubbles are not allowed on a guide card");
ok(!/📍|>\s*#\s/.test(guideHtml.replace(/<img[^>]*>/g, "")), "guide card still shows region/topic chip glyphs");
const nameMatch = /<div class="wf-place-card-name"([^>]*)>(.*?)<\/div>/.exec(guideHtml);
ok(!!nameMatch, "guide card has no .wf-place-card-name element (positive control for the title assertions)");
ok(!!nameMatch && nameMatch[2] === esc(clean(g.title)), `guide card title is not the FULL title: got "${nameMatch && nameMatch[2]}" want "${esc(clean(g.title))}"`);
ok(!!nameMatch && !/style=|clamp/.test(nameMatch[1]), "guide card title carries an inline style or clamp attribute");
ok(!/[…]|\.\.\./.test(nameMatch ? nameMatch[2] : "…"), "guide card title text contains an ellipsis");
ok(!guideHtml.includes("wf-place-card-score"), "guide card renders the score/READ badge box that offsets the title (READ time rides in the tag)");
ok(guideHtml.includes("Local guide · 7 min read"), "guide card tag lacks 'Local guide · N min read'");
ok(/class="wf-place-card-category">Local guide/.test(guideHtml), "guide card lacks the Local guide tag");
ok(!/Directions/i.test(guideHtml), "guide card has a Directions button");
ok(guideHtml.includes('href="/guides/' + g.slug + '"') && guideHtml.includes(">Read the guide<"), "guide card lost its link or 'Read the guide' button");

// ── 3. CSS: the guide rule removes the clamp ────────────────────────────────
const CSS = String(WF_PLACE_CARD_CSS || "").replace(/\/\*[\s\S]*?\*\//g, "");
const nameRule = /\.wf-place-card\.wf-guide-card \.wf-place-card-name\{([^}]*)\}/.exec(CSS);
ok(!!nameRule, "css.js has no `.wf-place-card.wf-guide-card .wf-place-card-name` rule");
const body = nameRule ? nameRule[1].replace(/\s+/g, "") : "";
ok(/display:block!important/.test(body), "guide title rule does not force display:block (the -webkit-box clamp would stay active)");
ok(/-webkit-line-clamp:unset!important/.test(body), "guide title rule does not unset -webkit-line-clamp");
ok(/overflow:visible!important/.test(body), "guide title rule does not set overflow:visible");
ok(!/line-clamp:\d/.test(body) && !/text-overflow:ellipsis/.test(body), "guide title rule re-introduces a numeric line-clamp or ellipsis");
ok(/\.wf-place-card\.wf-guide-card\{[^}]*border-top:3px solid #F97316/.test(CSS), "guide card lacks its distinct orange top rule");
ok(/\.wf-place-card\.wf-guide-card \.wf-place-card-category\{[^}]*background:#F97316/.test(CSS), "guide card lacks the filled Local guide tag");

// ── 4. PHOTO LADDER ─────────────────────────────────────────────────────────
const heroSlug = slugs.find((s) => GUIDE_CARD_PHOTOS[s] && GUIDE_CARD_PHOTOS[s].hero && GUIDE_CARD_PHOTOS[s].hero.kind !== "illustrative");
ok(!!heroSlug, "positive control: some guide has a hero in the card photo index");
const heroArt = guideCardPhoto(guideOf(heroSlug), { id: "ChIJ_fake_place_id_0123456789" });
ok(heroArt.rung === "hero" && heroArt.src === GUIDE_CARD_PHOTOS[heroSlug].hero.src, "ladder did not prefer the hero over a matched place photo");
{
  const synthetic = { x: { hero: null, pick: { src: "/guides/picks/x/a.webp", credit: "A. Author", href: "https://example.org/a", position: "50% 50%" } } };
  const a = guideCardPhoto({ slug: "x", placeIds: ["ChIJN1t_tDeuEmsRUsoyG83frY4"] }, null, synthetic);
  ok(a.rung === "pick" && a.src === "/guides/picks/x/a.webp" && a.credit === "A. Author" && a.creditHref === "https://example.org/a", "ladder did not use the credited curated pick photo when there is no hero");
}
{
  const hero = { src: "/guides/verified/stock.webp", credit: "S. Tock", href: "https://example.org/s", position: "50% 50%", kind: "illustrative" };
  const pick = { src: "/guides/picks/y/b.webp", credit: "B. Author", href: "https://example.org/b", position: "50% 50%" };
  const both = guideCardPhoto({ slug: "y" }, null, { y: { hero, pick } });
  ok(both.rung === "pick" && both.src === pick.src, "an ILLUSTRATIVE hero outranked a real curated pick photo");
  const alone = guideCardPhoto({ slug: "y", placeIds: ["ChIJN1t_tDeuEmsRUsoyG83frY4"] }, null, { y: { hero, pick: null } });
  ok(alone.rung === "illustrative-hero" && alone.src === hero.src, "an illustrative hero with no pick photo lost to the place photo or monogram");
}
const placeOnly = guideCardPhoto({ slug: "no-such-guide", placeIds: ["ChIJN1t_tDeuEmsRUsoyG83frY4"] });
ok(placeOnly.rung === "place" && /^\/api\/photo\?place=/.test(placeOnly.src), "ladder did not fall back to the place photo");
const nothing = guideCardPhoto({ slug: "no-such-guide" });
ok(nothing.rung === "monogram" && !nothing.src, "ladder returned a photo for a guide with nothing (monogram is the last resort only)");
const heroHtml = html(h(GuideDiscoveryCard, { guide: guideOf(heroSlug) }));
ok(heroHtml.includes(`src="${esc(GUIDE_CARD_PHOTOS[heroSlug].hero.src)}"`), "guide card with a hero does not render the hero <img>");
ok(!heroHtml.includes("wf-place-card-monogram"), "guide card with a hero still shows the monogram");
ok(GUIDE_CARD_PHOTOS[heroSlug].hero.credit && heroHtml.includes("wf-place-card-photo-attr"), "guide card with a credited hero renders no credit badge");
{
  // The real PhotoPolicyProvider: Google-backed rungs are blanked, owned rungs survive.
  const Policy = (await loadComponent(path.join(ROOT, "scripts/lib/guideCardPolicyHarness.js"), ROOT)).default;
  const heroPolicy = html(h(Policy, { guide: guideOf(heroSlug) }));
  ok(heroPolicy.includes(`src="${esc(GUIDE_CARD_PHOTOS[heroSlug].hero.src)}"`), "hero photo disappeared inside a guide photo-policy context");
  const placePolicy = html(h(Policy, { guide: { slug: "no-such-guide", title: "X", placeIds: ["ChIJN1t_tDeuEmsRUsoyG83frY4"] } }));
  ok(!placePolicy.includes("/api/photo"), "a Google-backed place photo rendered inside a guide photo-policy context");
  const noPolicy = html(h(GuideDiscoveryCard, { guide: { slug: "no-such-guide", title: "X", placeIds: ["ChIJN1t_tDeuEmsRUsoyG83frY4"] } }));
  ok(noPolicy.includes("/api/photo"), "positive control: outside the policy the place-photo rung renders");
}

// ── 5. COVERAGE ─────────────────────────────────────────────────────────────
const monograms = slugs.filter((s) => !guideCardPhoto(guideOf(s)).src);
const rungs = {};
for (const s of slugs) { const r = guideCardPhoto(guideOf(s)).rung; rungs[r] = (rungs[r] || 0) + 1; }
ok(monograms.length === 0, `${monograms.length} guide(s) resolve to the monogram: ${monograms.join(", ")}`);
for (const s of slugs) {
  const a = guideCardPhoto(guideOf(s));
  if (a.rung === "hero" || a.rung === "pick" || a.rung === "illustrative-hero") ok(!!a.credit, `${s}: ${a.rung} photo has no credit`);
}

if (failures.length) {
  console.error(`check-guide-card: ${failures.length} FAILED (${pass} passed)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-guide-card: ok (${pass} assertions; ${slugs.length} guides, photo rungs ${JSON.stringify(rungs)}, 0 monograms; place RailCard byte-identical to fixture)`);
