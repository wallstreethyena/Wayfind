#!/usr/bin/env node
// Exercise the published guide catalog and the server-rendered visitor copy.
// No network or credentials are used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { GUIDES } from "../lib/guides.js";
import { FIELD_ARTICLES, STRAWBERRY_FESTIVAL_ARTICLE } from "../lib/floridaFieldArticles.js";
import { FIELD_IMAGES } from "../lib/fieldGuideImages.js";
import { guideHero, GUIDE_IMAGE_BRIEFS } from "../lib/guideHero.js";
import { guideImageProblems } from "../lib/guideImagePolicy.js";
import { guideRegions } from "../lib/guideIndex.js";
import { currentGuides } from "../lib/guideLifecycle.js";
import { buildSearchCatalog } from "../lib/searchCatalog.js";
import { guideCardPhoto } from "../lib/guideCardPhoto.js";
import { resolveGuideHeroSource } from "../lib/heroSource.js";
import { heroCardModel } from "../lib/heroCard.js";
import { SITE_URL } from "../lib/site.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guidePage = path.join(root, "app/guides/[slug]/page.js");
const route = await loadComponent(guidePage, root, { sourceOverrides: new Map([
  [guidePage, readFileSync(guidePage, "utf8").replace('from "next/navigation"', 'from "next/navigation.js"')],
]) });
const components = await loadComponent(path.join(root, "app/components/FloridaFieldArticle.js"), root);
const docs = buildSearchCatalog({ today: "2026-11-27" });
const hub = guideRegions(currentGuides(GUIDES, "2026-11-27")).flatMap((group) => group.guides);
const places = [
  ["la-segunda-bakery-ybor-seminole-heights", "5150 N. Florida Avenue"],
  ["black-point-wildlife-drive-merritt-island", "did not establish that Black Point was open"],
  ["ding-darling-wildlife-drive-sanibel", "except Friday"],
  ["john-gorrie-museum-apalachicola", "46 Sixth Street"],
  ["gainesville-hawthorne-state-trail-boulware-springs", "mile 1.8"],
  ["renningers-mount-dora-antique-flea-market", "Friday office hours are for market business"],
  ["kermits-key-lime-pie-key-west", "200 Elizabeth Street"],
  ["st-augustine-lighthouse-with-kids", "44 inches"],
];
assert.deepEqual(Object.keys(FIELD_ARTICLES).sort(), places.map(([slug]) => slug).sort());
assert.deepEqual(Object.keys(GUIDES).filter((s) => GUIDES[s].fieldArticle).sort(), Object.keys(FIELD_ARTICLES).sort());
function page(element) { return new JSDOM(renderToStaticMarkup(element)).window.document; }

function verifyPhoto(document, image) {
  const figure = document.querySelector("figure[data-full-frame]");
  assert.ok(figure, "the complete documentary photograph must be displayed");
  const img = figure.querySelector("img");
  assert.equal(img.getAttribute("src"), image.src);
  assert.equal(img.alt, image.alt);
  assert.equal(img.width, image.width);
  assert.equal(img.height, image.height);
  assert.ok(figure.textContent.includes(image.caption));
  assert.ok([...figure.querySelectorAll("a")].some((a) => a.href === image.source && a.textContent.includes(image.credit)));
  assert.ok([...figure.querySelectorAll("a")].some((a) => a.href === image.licenseUrl && a.textContent.includes(image.license)));
}

function verifyArticle(document, article) {
  for (const [heading, ...paragraphs] of article.sections) {
    assert.ok([...document.querySelectorAll("h2, h3")].some((h) => h.textContent === heading));
    for (const text of paragraphs) assert.ok([...document.querySelectorAll("p")].some((p) => p.textContent === text));
  }
  for (const [name, value] of article.facts) {
    const fact = [...document.querySelectorAll("dt")].find((dt) => dt.textContent === name);
    assert.equal(fact?.nextElementSibling?.textContent, value);
  }
  for (const [label, href] of [...article.sources, ...article.related, ["Find the starting point on a map", article.directions]]) {
    assert.ok([...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === href && a.textContent === label), label);
  }
  assert.ok(document.querySelector('a[href="/about"]').textContent.includes("Gabriel Pereira"));
  assert.ok(!/Private editorial review|Editorial handoff|Proposed byline|Publication gate/i.test(document.body.textContent));
}

for (const [slug, decision] of places) {
  const guide = GUIDES[slug], article = FIELD_ARTICLES[slug], image = guideHero(slug);
  const expectedUrl = SITE_URL + "/guides/" + slug;
  assert.equal(docs.filter((doc) => doc.href === "/guides/" + slug).length, 1);
  assert.equal(hub.filter((g) => g.slug === slug).length, 1);
  assert.deepEqual(guideImageProblems(image, GUIDE_IMAGE_BRIEFS[slug]), []);
  assert.equal(guideCardPhoto({ slug }).src, image.src);
  assert.equal(guideCardPhoto({ slug }).fullFrame, true);
  assert.equal(readFileSync(path.join(root, "public", image.src)).length, image.bytes);
  const params = { slug };
  assert.ok(route.generateStaticParams().some((entry) => entry.slug === slug));
  const meta = await route.generateMetadata({ params });
  assert.equal(meta.alternates.canonical, expectedUrl);
  assert.equal(meta.title, guide.seoTitle + " | Wayfind");
  assert.equal(meta.openGraph.title, guide.seoTitle);
  assert.equal(meta.robots.index, true);
  const dom = page(await route.default({ params }));
  assert.equal(dom.querySelectorAll("h1").length, 1);
  assert.equal(dom.querySelector("h1").textContent, guide.title);
  assert.ok(dom.body.textContent.includes(decision), slug);
  assert.ok(dom.querySelector('[data-guide-conversion="hero"]').getAttribute("href") === guide.officialAction.href);
  assert.ok(dom.body.textContent.includes("may earn a commission"));
  const ld = [...dom.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
  const schema = ld.find((item) => item["@type"] === "Article");
  assert.equal(schema.mainEntityOfPage, expectedUrl);
  assert.equal(schema.image.url, SITE_URL + image.src);
  assert.equal(schema.author.name, "Gabriel Pereira");
  assert.equal(ld.find((s) => s["@type"] === "BreadcrumbList").itemListElement.at(-1).item, expectedUrl);
  assert.ok(schema.datePublished.startsWith(guide.published));
  const anchors = [...dom.querySelectorAll('nav[aria-label="In this guide"] a')];
  assert.equal(anchors.length, article.sections.length + 3);
  for (const anchor of anchors) assert.ok(dom.getElementById(anchor.hash.slice(1)));
  verifyArticle(dom, article);
  verifyPhoto(dom, image);
  const source = resolveGuideHeroSource(SITE_URL, slug);
  const socialTitle = new URL(meta.openGraph.images[0].url).searchParams.get("t");
  assert.equal(socialTitle, guide.shareTitle || guide.title);
  const card = heroCardModel({ kind: "guide", title: socialTitle, fullFrameCredit: source.fullFrameCredit });
  assert.equal(card.fullFrameCredit, image.credit + " · " + image.license);
  assert.ok(card.fitted && card.lines.length > 0, slug + " fits its branded card");
}

await assert.rejects(() => route.default({ params: { slug: "missing-field-guide-fixture" } }), /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
const event = STRAWBERRY_FESTIVAL_ARTICLE;
assert.equal(event.slug, "florida-strawberry-festival-2027");
assert.equal(GUIDES[event.slug], undefined);
assert.ok(!docs.some((d) => d.href === "/guides/" + event.slug));
const eventDom = page(React.createElement(components.EventFieldArticle, { article: event }));
assert.equal(eventDom.querySelector("#visit-guide h2").textContent, event.title);
assert.equal(eventDom.querySelectorAll('h1,script[type="application/ld+json"]').length, 0);
assert.ok(eventDom.body.textContent.includes("$54 with one official parking space"));
verifyArticle(eventDom, event);
verifyPhoto(eventDom, FIELD_IMAGES[event.slug]);
// Removing an actual rendered attribution or substituting a figure from another
// place must fail the very same assertions as a release.
const creditless = eventDom.cloneNode(true);
creditless.querySelector('figure a').remove();
assert.throws(() => verifyPhoto(creditless, FIELD_IMAGES[event.slug]), assert.AssertionError);
assert.throws(() => verifyPhoto(eventDom, FIELD_IMAGES[places[0][0]]), assert.AssertionError);
console.log("Florida field articles: 8 searchable guides and one existing event enrichment, exact photos, sources, bylines, directions and social credits verified.");
