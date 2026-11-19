// Guards the Christmas in Florida city guides and "Good to know" block (2026-11-19).
// The hub must carry crawlable links to every city guide in season, and every
// FAQ answer must be read word for word from a published guide (never written
// on the hub), with the FAQPage markup matching the visible text.
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { CHRISTMAS_CITY_GUIDES, CHRISTMAS_FAQ_PICKS, christmasCityGuides, christmasFaq } from "../lib/christmasCityGuides.js";

const root = process.cwd();
const { default: Section } = await loadComponent(path.join(root, "app/components/ChristmasCityGuides.js"), root);

const all = CHRISTMAS_CITY_GUIDES.flatMap((g) => g.links);
assert.equal(all.length, 25, "22 blog posts + 3 Nov 17 guides");
assert.equal(new Set(all.map((l) => l.href)).size, all.length, "no duplicate links");
for (const link of all) {
  assert.match(link.href, /^(https:\/\/blog\.gowayfind\.com\/[a-z0-9-]+|\/guides\/[a-z0-9-]+)$/, "clean URL, no query or fragment: " + link.href);
  assert.match(link.endsOn, /^\d{4}-\d{2}-\d{2}$/, "every link expires: " + link.href);
}
assert.throws(() => christmasCityGuides(""));
assert.equal(christmasCityGuides("2026-11-19").flatMap((g) => g.links).length, 25);
assert.ok(!christmasCityGuides("2026-12-01").flatMap((g) => g.links).some((l) => l.href.includes("thanksgiving")), "Thanksgiving posts leave after the weekend");
assert.equal(christmasCityGuides("2027-02-01").length, 0, "nothing stale after the season");

const faq = christmasFaq();
assert.equal(faq.length, CHRISTMAS_FAQ_PICKS.length, "every FAQ pick still exists in its guide");
assert.equal(christmasFaq([["florida-snow-and-ice-2026", "Not a real question?"]]).length, 0, "a missing question fails closed");

const html = renderToStaticMarkup(React.createElement(Section, { today: "2026-11-19" }));
for (const link of all) assert.ok(html.includes('href="' + link.href + '"'), "crawlable link: " + link.href);
const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(schema["@type"], "FAQPage");
assert.equal(schema.mainEntity.length, faq.length);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
for (const item of schema.mainEntity) {
  assert.ok(html.includes(esc(item.name)), "visible question: " + item.name);
  assert.ok(html.includes(esc(item.acceptedAnswer.text)), "visible answer for: " + item.name);
}
console.log("test-christmas-city-guides: OK (" + all.length + " links, " + faq.length + " answers)");
