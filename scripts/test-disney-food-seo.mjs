// scripts/test-disney-food-seo.mjs — the Disney food guide keeps what makes it
// findable and useful (owner 2026-11-23: "come up whenever someone searches for
// Disney food", and make the flow and conversion as strong as possible).
// Renders the REAL page (jsxLoad) and checks:
//   - search title and description carry "Disney Christmas food 2026" and fit
//     Google's display (title <= 60, description <= 160 characters);
//   - the answer comes first: a table row for every treat and the festival;
//   - ItemList and Event structured data describe only what the page shows
//     (every ItemList url is an anchor on the page; Event dates are printed);
//   - the park ticket card is the registered, tracked CityPASS row, marked sponsored;
//   - the Christmas in Florida hub links to the guide.
// --red-prove: an ItemList entry pointing at a missing anchor must fail.
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { DISNEY_FOOD_SLUG, DISNEY_FOOD_STOPS, DISNEY_HOLIDAY_FOOD_GUIDES, EPCOT_FESTIVAL } from "../lib/guidesDisneyHolidayFood2026.js";
import { christmasCityGuides } from "../lib/christmasCityGuides.js";

const guide = DISNEY_HOLIDAY_FOOD_GUIDES[DISNEY_FOOD_SLUG];
const { default: Page } = await loadComponent(path.resolve("app/guides/disney-world-holiday-food-guide-2026/page.js"), process.cwd());
const html = renderToStaticMarkup(React.createElement(Page));
const doc = new JSDOM(html).window.document;

export function seoProblems(doc) {
  const problems = [];
  const lds = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
  const list = lds.find((d) => d["@type"] === "ItemList");
  const event = lds.find((d) => d["@type"] === "Event");
  if (!list) problems.push("no ItemList");
  else {
    if (list.itemListElement.length !== DISNEY_FOOD_STOPS.length + EPCOT_FESTIVAL.booths.length) problems.push("ItemList count does not match the page");
    for (const item of list.itemListElement) {
      const id = decodeURIComponent(String(item.url).split("#")[1] || "");
      if (!id || !doc.getElementById(id)) problems.push("ItemList url without an anchor on the page: " + item.url);
    }
  }
  if (!event) problems.push("no Event");
  else if (event.startDate !== "2026-11-27" || event.endDate !== "2026-12-30" || !doc.body.textContent.includes(EPCOT_FESTIVAL.dates)) problems.push("Event dates do not match the printed dates");
  return problems;
}

const red = process.argv.includes("--red-prove");
if (red) {
  const broken = new JSDOM(html).window.document;
  broken.getElementById("booth-norway-cart").removeAttribute("id");
  assert.ok(seoProblems(broken).some((p) => p.includes("booth-norway-cart")), "red-prove: a missing anchor must be caught");
  const noDates = new JSDOM(html.split(EPCOT_FESTIVAL.dates).join("soon")).window.document;
  assert.ok(seoProblems(noDates).some((p) => p.includes("Event dates")), "red-prove: unprinted Event dates must be caught");
  console.log("test-disney-food-seo --red-prove: OK — a structured-data entry without its anchor, and Event dates not on the page, both fail");
  process.exit(0);
}

assert.ok(/Disney Christmas Food 2026/.test(guide.title) && guide.title.length <= 60, "search title targets the query and fits: " + guide.title.length);
assert.ok(/Christmas food/.test(guide.description) && /EPCOT Festival of the Holidays/.test(guide.description) && guide.description.length <= 160, "description targets the query and fits: " + guide.description.length);
assert.match(doc.querySelector("h1").textContent, /Disney World Christmas food guide 2026/);
assert.equal(doc.querySelectorAll("h1").length, 1);
const rows = doc.querySelectorAll("table tbody tr");
assert.ok(rows.length >= DISNEY_FOOD_STOPS.length + 1, "answer table lists every treat and the festival");
for (const stop of DISNEY_FOOD_STOPS) assert.ok(doc.querySelector(`table a[href="#${stop.id}"]`), "answer table links " + stop.id);
assert.deepEqual(seoProblems(doc), []);
const card = doc.querySelector('[data-deal-card="cpn-citypass-orlando"]');
assert.ok(card && /\/api\/commerce\/go\?/.test(card.getAttribute("href")) && /sponsored/.test(card.getAttribute("rel") || ""), "park ticket card is the tracked, sponsored CityPASS row");
assert.ok(/may earn a commission/.test(doc.body.textContent), "affiliate disclosure on the page");
// The ticket card is server HTML: importing the client GuideDealCards island here
// reshuffled the chunks the homepage loads and broke the deploy budget (2026-11-23).
const fs = await import("node:fs");
assert.ok(!/GuideDealCards/.test(fs.readFileSync("app/guides/disney-world-holiday-food-guide-2026/page.js", "utf8").replace(/\/\/.*$/gm, "")), "ticket card stays server rendered (no GuideDealCards import)");
assert.ok(christmasCityGuides("2026-11-23").flatMap((g) => g.links).some((l) => l.href === "/guides/" + DISNEY_FOOD_SLUG), "Christmas in Florida hub links the guide");
console.log("test-disney-food-seo: OK — title " + guide.title.length + " chars, answer table, " + (DISNEY_FOOD_STOPS.length + EPCOT_FESTIVAL.booths.length) + " ItemList entries anchored, festival Event matches, tracked ticket card, hub link");
