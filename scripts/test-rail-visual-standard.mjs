#!/usr/bin/env node

// One rendered contract for every horizontal discovery shelf: compact copy on
// the left, an honest count and accessible paging controls on the right, and a
// content-free loading state. Consumer checks below prevent a rail from moving
// its controls back outside the shared heading while still passing component
// tests in isolation.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const COMPONENTS = join(REPO, "app/components");
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props));
const load = async (name) => loadComponent(join(COMPONENTS, name), REPO);
const headingMarkup = (html) => {
  const start = html.indexOf('<header class="wf-rail-heading">');
  if (start < 0) return "";
  const end = html.indexOf("</header>", start);
  return end < 0 ? "" : html.slice(start, end + 9);
};

// Render the real shared components. This catches broken JSX, missing exports,
// and DOM placement errors that source matching cannot see.
const { default: RailHeading } = await load("RailHeading.js");
const { RailNav } = await load("RailCard.js");
const { default: RailLoading } = await load("RailLoading.js");

const pagedHeading = render(RailHeading, {
  title: "Late-night favorites",
  description: "Independent local places open after dark.",
  children: createElement(RailNav, { railId: "night", count: 19, total: 19, loaded: 10, unit: "verified options" }),
});
const pagedHeader = headingMarkup(pagedHeading);
ok(pagedHeader.includes("Late-night favorites") && pagedHeader.includes("Independent local places open after dark."), "RailHeading renders its title and deck inside the shared header");
ok(pagedHeader.includes("<b>10</b> of <b>19</b>"), "a partially loaded rail says 10 of 19 inside its heading");
equal((pagedHeader.match(/<button\b/g) || []).length, 2, "a navigable rail renders exactly two buttons");
ok(pagedHeader.includes('type="button"') && pagedHeader.includes('aria-label="Previous verified options"') && pagedHeader.includes('aria-label="Next verified options"'), "both rail controls are typed and accessibly named");

const staticHeading = render(RailHeading, {
  title: "Best Breakfast",
  description: "The strongest spots for a real breakfast.",
  children: createElement(RailNav, { railId: "breakfast", count: 7, unit: "ranked places" }),
});
ok(headingMarkup(staticHeading).includes("<b>7</b> ranked places"), "a static rail preserves its claimed count and unit inside the heading");
equal(render(RailNav, { railId: "solo", count: 1, total: 1, loaded: 1, unit: "verified option" }), "", "the established solo baseline remains: RailNav renders nothing below two cards");
const soloHeading = render(RailHeading, { title: "One good option", children: createElement(RailNav, { railId: "solo", count: 1, total: 1 }) });
ok(headingMarkup(soloHeading).includes("One good option") && !soloHeading.includes("<button"), "a solo heading keeps its title without paging controls");

const loadingHtml = render(RailLoading, { label: "Loading Family adventures" });
ok(loadingHtml.includes('role="status"') && loadingHtml.includes('aria-busy="true"'), "RailLoading exposes a live busy status");
ok(loadingHtml.includes("Family adventures"), "RailLoading names the rail being loaded");
ok(!/<img\b|<picture\b|wf-place-card-img|📍|wf-wordmark-pin/.test(loadingHtml), "RailLoading's actual markup contains no place image or map pin");
ok(!/wf-rail-nav|wf-rail-nav-btn/.test(loadingHtml), "RailLoading does not promise carousel controls before cards exist");

// Render real consumers with small, deterministic inventories. These checks
// prove the shared assembly is wired into the actual rail components.
const { default: SummerPicksRails } = await load("SummerPicksRails.js");
const summerHtml = render(SummerPicksRails, {
  city: "Test City",
  rails: [{ id: "sports", title: "Summer games", deck: "Live competition nearby.", cards: [
    { kind: "event-node", id: "s1", node: createElement("article", null, "Game one") },
    { kind: "event-node", id: "s2", node: createElement("article", null, "Game two") },
  ] }],
});
const summerHeader = headingMarkup(summerHtml);
ok(summerHeader.includes("Summer games") && summerHeader.includes("Live competition nearby.") && summerHeader.includes("2</b> ranked options"), "SummerPicksRails keeps title, deck, and count in RailHeading");

const breakfastPlaces = [
  { id: "b1", name: "Sunrise Breakfast", primaryType: "breakfast_restaurant", rating: 4.8, reviews: 900 },
  { id: "b2", name: "Morning Brunch", primaryType: "brunch_restaurant", rating: 4.7, reviews: 700 },
];
const { default: BreakfastRails } = await load("BreakfastRails.js");
const breakfastHtml = render(BreakfastRails, { places: breakfastPlaces, city: "Test City" });
const breakfastHeader = headingMarkup(breakfastHtml);
ok(breakfastHeader.includes("Best Breakfast") && breakfastHeader.includes("The strongest spots for a real breakfast.") && breakfastHeader.includes("2</b> ranked places"), "BreakfastRails renders its static count in the shared heading");

const creatorPlaces = [
  { id: "c1", name: "Creator One", governed_score: 94, rating: 4.8, reviews: 500, creatorSources: [{ handle: "local.guide", platform: "instagram" }] },
  { id: "c2", name: "Creator Two", governed_score: 91, rating: 4.7, reviews: 400, creatorSources: [{ handle: "local.guide", platform: "instagram" }] },
];
const { default: CreatorPicksRails } = await load("CreatorPicksRails.js");
const creatorHtml = render(CreatorPicksRails, { places: creatorPlaces, city: "Test City" });
const creatorHeader = headingMarkup(creatorHtml);
ok(creatorHeader.includes("@local.guide’s picks") && creatorHeader.includes("near Test City") && creatorHeader.includes("2</b> creator picks"), "CreatorPicksRails renders creator copy and its count in the shared heading");

// Fall's content section is intentionally private and the exported component
// starts from an effect-driven empty state on the server. Validate its direct
// JSX wiring instead of pretending an SSR loading shell exercises that branch.
const { default: FallIntentRails } = await load("FallIntentRails.js");
equal(render(FallIntentRails, { active: false }), "", "FallIntentRails remains inert when its poster is closed");
const fallSource = readFileSync(join(COMPONENTS, "FallIntentRails.js"), "utf8");
const nestedNav = /<RailHeading\b[^>]*>[\s\S]*?<RailNav\s[\s\S]*?<\/RailHeading>/;
ok(nestedNav.test("<RailHeading title={rail.title}><RailNav railId={railId} /></RailHeading>"), "POSITIVE CONTROL: the nested-navigation probe recognizes known-good JSX");
ok(nestedNav.test(fallSource), "FallIntentRails nests its loaded-state RailNav in RailHeading");
ok(/loaded=\{items\.length\}/.test(fallSource), "FallIntentRails exposes the loaded window separately from its total count");

// Adoption boundary: only *Rails.js modules that expose heading/deck JSX are
// in scope. Container modules with no rail heading are deliberately ignored.
const headingProbe = /<(?:RailHeading|h[1-6])\b|className=["']wf-rail-deck["']/;
ok(headingProbe.test('<h2>Known heading</h2>'), "POSITIVE CONTROL: the adoption probe recognizes a heading");
const railFiles = readdirSync(COMPONENTS).filter((name) => /Rails\.js$/.test(name));
let adopted = 0;
for (const name of railFiles) {
  const source = readFileSync(join(COMPONENTS, name), "utf8");
  if (!headingProbe.test(source)) continue;
  adopted += 1;
  ok(/import RailHeading from ["']\.\/RailHeading["'];/.test(source), `${name} exposes rail copy through the shared RailHeading import`);
  ok(!/<h[1-6]\b/.test(source), `${name} does not retain a standalone JSX heading`);
  for (const match of source.matchAll(/<RailNav\s/g)) {
    const open = source.lastIndexOf("<RailHeading", match.index);
    const close = source.indexOf("</RailHeading>", match.index);
    ok(open >= 0 && close > match.index, `${name} keeps each RailNav inside RailHeading controls`);
  }
}
ok(adopted >= 10, `the adoption sweep exercised the current Rails.js heading inventory (found ${adopted})`);

// Lock the shared CSS decisions, scoped to the rail rules so unrelated card
// truncation styles do not create false failures.
const css = readFileSync(join(COMPONENTS, "css.js"), "utf8");
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(escaped + "\\{([^}]*)\\}"))?.[1] || "";
};
const headingCss = rule(".wf-rail-heading");
const titleCss = rule(".wf-rail-heading h2");
const deckCss = rule(".wf-rail-deck");
const counterCss = rule(".wf-rail-nav-hint");
ok(/display:none/.test(rule(".wf-rail-heading-controls:empty")), "a solo rail reserves no empty controls column");
ok(/font-family:var\(--wf-sans/.test(headingCss) && /font-weight:850/.test(titleCss), "the shared heading uses the Wayfind sans stack and a bold title");
ok(/flex-wrap:wrap/.test(headingCss) && /overflow-wrap:anywhere/.test(titleCss) && /overflow-wrap:anywhere/.test(deckCss), "heading rows and long title/deck copy wrap safely");
ok(!/text-overflow:ellipsis|white-space:nowrap/.test(titleCss + deckCss), "shared rail title and deck copy are never ellipsized or forced onto one line");
ok(/font-variant-numeric:tabular-nums/.test(counterCss), "the rail counter uses stable tabular numerals");

const rgb = (hex) => hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255);
const luminance = (hex) => rgb(hex).map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const counterColor = counterCss.match(/color:(#[A-Fa-f0-9]{6})/)?.[1];
ok(counterColor && contrast(counterColor, "#0B0E15") >= 7, `the tabular counter color has high contrast on the rail surface (${counterColor || "missing"})`);
const menuCss = readFileSync(join(COMPONENTS, "railMenuCss.js"), "utf8");
ok(!/wf8CardDrop|wf8MenuIn/.test(css + menuCss), "neither cards nor their parent menu restore the retired drop animation");

console.log(`rail visual standard: ${checks} rendered, wiring, adoption, and CSS assertions passed`);
