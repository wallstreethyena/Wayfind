import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  HOME_AFFILIATE_ACTIVITY_COUNT,
  HOME_AFFILIATE_ACTIVITY_FETCH_LIMIT,
  HOME_AFFILIATE_ACTIVITY_RADIUS_MI,
  homeAffiliateActivities,
} from "../lib/homeAffiliateActivities.js";
import { experienceWayfindScore } from "../lib/experiencesData.js";

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const rail = readFileSync(new URL("../app/components/HomeAffiliateActivityRail.js", import.meta.url), "utf8");

assert.equal(HOME_AFFILIATE_ACTIVITY_COUNT, 30, "the homepage promises a real 30-card ranked window");
assert.ok(HOME_AFFILIATE_ACTIVITY_FETCH_LIMIT > HOME_AFFILIATE_ACTIVITY_COUNT, "the fetch has headroom for invalid rows");
assert.equal(HOME_AFFILIATE_ACTIVITY_RADIUS_MI, 120, "the copy and query share the explicit 120-mile scope");

const item = (n, extra = {}) => ({
  code: "P" + n,
  title: "Activity " + n,
  url: "https://www.viator.com/tours/x/d0-0P" + n + "?pid=P00000000",
  image: "https://images.example.com/" + n + ".jpg",
  rating: 4 + n / 100,
  reviews: n * 10,
  ...extra,
});
const source = Array.from({ length: 40 }, (_, i) => item(i + 1));
const selected = homeAffiliateActivities([
  ...source,
  item(99, { code: "", title: "Missing identity" }),
  item(98, { image: null, title: "Missing image" }),
  item(97, { url: "https://www.viator.com/tours/no-attribution", title: "Missing pid" }),
  item(40, { title: "Duplicate product" }),
]);
assert.equal(selected.length, 30, "invalid rows cannot thin a healthy 30-card source pool");
assert.equal(new Set(selected.map((row) => row.code)).size, 30, "the rail contains 30 unique exact products");
assert.ok(selected.every((row, i, rows) => i === 0 || experienceWayfindScore(rows[i - 1]) >= experienceWayfindScore(row)), "the visible order is Wayfind score order");

assert.match(home, /limit:\s*String\(HOME_AFFILIATE_ACTIVITY_FETCH_LIMIT\)/, "the homepage requests the ranked headroom window");
assert.match(home, /mi:\s*String\(HOME_AFFILIATE_ACTIVITY_RADIUS_MI\)/, "the homepage asks for the explicit activity radius");
assert.match(home, /homeAffiliateActivities\(j\?\.items\)/, "the response crosses the identity/image eligibility gate");
assert.match(home, /<HomeAffiliateActivityRail/, "the old singleton is replaced by the full rail");
assert.doesNotMatch(home, /pickHomeExp|const \[homeExp/, "the rotating singleton contract is gone");

assert.match(rail, /<RailCard[\s\S]*photo=\{item\.image\}[\s\S]*title=\{item\.title\}/, "every affiliate result uses the actual shared Wayfind RailCard component");
assert.match(rail, /<RailNav[^>]*railId=\{RAIL_ID\}/, "the rail exposes an accurate option count and arrows");
assert.match(rail, /<RailDots[^>]*railId=\{RAIL_ID\}/, "the rail shows the shared swipe affordance");
assert.match(rail, /<ViatorCommerceLink[\s\S]*t=\{item\}[\s\S]*rank=\{rank\}/, "every card uses the exact-product tracked deep link");
assert.match(rail, /surface="home_affiliate_activity_rail"/, "affiliate attribution has its own measurable surface");
assert.match(rail, /score=\{score\}/, "the shared card renders the ranked Wayfind score");
assert.match(rail, /ctaNode=\{\(/, "the tracked affiliate CTA occupies the shared card's normal CTA slot");
assert.match(rail, /Partner link\. Wayfind may earn a commission; rankings never change\./, "commercial disclosure and ranking independence remain explicit");

const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const HomeAffiliateActivityRail = (await loadComponent(
  fileURLToPath(new URL("../app/components/HomeAffiliateActivityRail.js", import.meta.url)),
  repo,
)).default;
const html = renderToStaticMarkup(createElement(HomeAffiliateActivityRail, {
  items: selected,
  contentId: "Parrish",
  onLog: () => {},
}));
assert.equal((html.match(/data-offer=/g) || []).length, 30, "the real component renders all 30 exact-product links");
assert.equal((html.match(/<article class="wf-place-card wf-rail-card"/g) || []).length, 30, "all 30 rendered products use the actual shared Wayfind card");
assert.equal((html.match(/wf-place-card-book wf-rail-card-cta/g) || []).length, 30, "all 30 booking links use the shared full-width card CTA");
assert.match(html, /30<\/b> ranked options/, "the rendered count tells the truth");
assert.match(html, /provider=viator&amp;offer=/, "rendered hrefs use the server-owned exact-product redirect");

console.log("test-home-bookable: ok");
