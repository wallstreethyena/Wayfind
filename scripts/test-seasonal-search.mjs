import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { SEASONAL_SEARCH_HUBS, seasonalSearchHub, seasonalSearchSections, seasonalHubsForGuide } from "../lib/seasonalSearch.js";
import { GUIDES } from "../lib/guides.js";

const root = process.cwd();
const { default: Hub, seasonalSearchMetadata } = await loadComponent(path.join(root, "app/components/SeasonalSearchHub.js"), root);
assert.equal(SEASONAL_SEARCH_HUBS.length, 4);
assert.equal(new Set(SEASONAL_SEARCH_HUBS.map((h) => h.slug)).size, 4);
assert.equal(seasonalSearchHub("missing"), null);
assert.throws(() => seasonalSearchMetadata("missing"));
assert.throws(() => seasonalSearchSections(SEASONAL_SEARCH_HUBS[0], ""));
for (const hub of SEASONAL_SEARCH_HUBS) {
  const metadata = seasonalSearchMetadata(hub.slug);
  assert.equal(metadata.alternates.canonical, "https://www.gowayfind.com/" + hub.slug);
  assert.equal(metadata.robots.index, true);
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  const html = renderToStaticMarkup(React.createElement(Hub, { slug: hub.slug, today: "2026-10-09" }));
  assert.equal((html.match(/<h1\b/g) || []).length, 1, hub.slug + " has one rendered H1");
  assert.ok(html.includes(hub.intro.replace(/'/g, "&#x27;")), hub.slug + " has crawlable introduction");
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const collection = schema["@graph"].find((item) => item["@type"] === "CollectionPage");
  assert.equal(collection.url, metadata.alternates.canonical);
  for (const section of seasonalSearchSections(hub, "2026-10-09")) {
    assert.ok(html.includes('id="' + section.id + '"'));
    for (const link of section.links) {
      assert.ok(html.includes('href="' + link.href + '"'), "visible link: " + link.href);
      if (link.href.startsWith("/guides/")) {
        const slug = link.href.slice(8);
        assert.ok(GUIDES[slug] || existsSync(path.join(root, "app", link.href, "page.js")), "real guide: " + slug);
      }
    }
  }
  const future = renderToStaticMarkup(React.createElement(Hub, { slug: hub.slug, today: "2027-02-01" }));
  for (const section of hub.sections) for (const link of section.links) {
    if (link.endsOn && link.endsOn < "2027-02-01") assert.ok(!future.includes('href="' + link.href + '"'), "expired edition removed: " + link.href);
  }
  assert.ok(!future.includes("countdown to 2027"), "expired NYE announcement is not promoted");
}
const fall = SEASONAL_SEARCH_HUBS[0];
assert.ok(seasonalSearchSections(fall, "2026-11-30")[0].links.some((l) => l.href.includes("fall-festivals")));
assert.ok(!seasonalSearchSections(fall, "2026-12-01")[0].links.some((l) => l.href.includes("fall-festivals")));
assert.ok(seasonalHubsForGuide("florida-holiday-nights-out-2026").some((h) => h.slug === "christmas-in-florida"));
assert.equal(seasonalHubsForGuide("unrelated-guide").length, 0);
const sitemap = readFileSync("app/sitemap.js", "utf8");
assert.match(sitemap, /SEASONAL_SEARCH_HUBS\.map/);
assert.match(sitemap, /return \[\.\.\.core, \.\.\.seasonal,/);
for (const file of ["app/layout.js", "app/guides/page.js", "app/guides/[slug]/page.js"]) assert.match(readFileSync(file, "utf8"), /<SeasonalSearchNav[\s/>]/);
console.log("PASS: four rendered seasonal hubs, real guide destinations, canonical/schema parity, expiration boundaries and discovery links");
