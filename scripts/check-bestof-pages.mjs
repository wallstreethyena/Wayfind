#!/usr/bin/env node
// scripts/check-bestof-pages.mjs — linkable best-of pages behind seo_bestof_pages.
// A page that would render with zero items fails. Flag off must not change
// sitemap output. /budget stays noindex.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

let fails = 0;
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error("FAIL: " + msg); }
}

const P = await import(path.join(root, "lib/bestOfPages.js"));
const now = new Date("2026-11-04T15:00:00Z"); // Wednesday; this weekend is Fri 6–Sun 8 Nov 2026

function event(over) {
  return {
    event_id: "e1",
    event_name: "Riverwalk market",
    event_status: "scheduled",
    source_tier: 1,
    verification_confidence: "high",
    card_hook: "A Saturday market on the river.",
    city: "Tampa",
    state: "FL",
    start_date: "2026-11-07",
    end_date: "2026-11-07",
    is_free: true,
    place_id: "ChIJy6ESWITDwogReu72OLauRMM",
    venue: "Curtis Hixon Waterfront Park",
    ...over,
  };
}

// 1. Sunset spots come from Sarasota guide copy. Hours that merely end at
//    sunset are not a sunset spot. A known guide note is.
const hoursOnly = { g: { region: "Sarasota", picks: [{ name: "Myakka River State Park", placeId: "ChIJxaeEtGVMw4gRd5SI3lZDqnY", tip: "Open 8am to sunset." }] } };
ok(P.sunsetSpotItems(hoursOnly).length === 0, "closing time '8am to sunset' is not a sunset spot");
const one = { g: { region: "Sarasota", picks: [{ name: "The Bay Park", placeId: "ChIJLZ2vzRxBw4gRMOtW0ArhBhw", blurb: "Boardwalks, a lawn, and the best free sunset in the city." }] } };
const spot = P.sunsetSpotItems(one);
ok(spot.length === 1 && spot[0].href === "/places/ChIJLZ2vzRxBw4gRMOtW0ArhBhw" && /sunset/i.test(spot[0].detail), "a Sarasota guide note that names sunset becomes a place link");
ok(P.sunsetSpotItems({ g: { region: "Tampa", picks: one.g.picks } }).length === 0, "a Tampa guide is not the Sarasota sunset page");
const elsewhere = { g: { region: "Sarasota", picks: [{ name: "Gulf Drive Cafe", placeId: "ChIJJWCbj5kRw4gRYkZ7QJ-L91s", blurb: "On the sand in Bradenton Beach, and the sunset drink." }] } };
ok(P.sunsetSpotItems(elsewhere).length === 1, "Bradenton Beach is on Anna Maria, so a sunset note there belongs on this page");
const live = P.sunsetSpotItems();
ok(live.length >= 15 && live.length <= 20, "the live sunset list is about 10–15 spots (got " + live.length + ")");
ok(new Set(live.map((i) => i.placeId)).size === live.length, "one row per place");
ok(live.every((i) => /sunset/i.test(i.detail) && i.href.startsWith("/places/") && i.name && i.source), "every sunset row is a place link whose note already says sunset, with a data source");
ok(live.some((i) => /siesta/i.test(i.name)), "Siesta is in the live list");
ok(live.some((i) => /lido/i.test(i.name)), "Lido is in the live list");
ok(live.some((i) => /bean point|coquina|gulf drive/i.test(i.name)), "Anna Maria is in the live list");
ok(live.some((i) => /venice|sharky/i.test(i.name)), "Venice is in the live list");
ok(live.some((i) => /longboat|dry dock/i.test(i.name)), "Longboat Key is in the live list");
ok(live.some((i) => /nokom/i.test(i.name)), "Nokomis is in the live list");
ok(!live.some((i) => /myakka|blue tequila|waterfrontoo|fort hamer/i.test(i.name)), "hours, a menu window, a drink name, and inland Parrish stay off the page");
ok(P.sunsetPageModel(hoursOnly) === null, "a sunset page with zero spots is not a page");
const sunsetModel = P.sunsetPageModel();
ok(sunsetModel && sunsetModel.items.length === live.length && sunsetModel.title === "Best sunset spots in Sarasota" && sunsetModel.path === "/best/sunset-spots/sarasota", "sunset page model matches the live spots");

// 2. Free-this-weekend template, Tampa and Sarasota, from event rows only.
const good = event();
const sarasota = event({ event_id: "e2", event_name: "Bayfront lawn music", city: "Sarasota", place_id: "ChIJ7wa-IxRAw4gRnwt6LGL2yeM", start_date: "2026-11-06", end_date: "2026-11-08", venue: "Bayfront Park" });
const rows = [
  good,
  sarasota,
  event({ event_id: "paid", is_free: false, event_name: "Paid concert" }),
  event({ event_id: "later", start_date: "2026-11-20", end_date: "2026-11-20", event_name: "Next month" }),
  event({ event_id: "noplace", place_id: "", event_name: "No place" }),
  event({ event_id: "bradenton", city: "Bradenton", event_name: "Bradenton free" }),
  event({ event_id: "untrusted", verification_confidence: "low", event_name: "Untrusted free" }),
];
const tampa = P.freeWeekendItems(rows, "Tampa", now);
ok(tampa.items.length === 1 && tampa.items[0].name === "Riverwalk market" && tampa.items[0].href.startsWith("/places/"), "Tampa keeps the one free in-weekend event that links to a place");
ok(tampa.start === "2026-11-06" && tampa.end === "2026-11-08", "this weekend is the existing Friday–Sunday window");
const srq = P.freeWeekendItems(rows, "Sarasota", now);
ok(srq.items.length === 1 && srq.items[0].name === "Bayfront lawn music", "the same template fills Sarasota from that city's rows");
ok(P.freeWeekendItems([], "Tampa", now).items.length === 0, "no rows means no items");
ok(P.freeWeekendPageModel([], "tampa", now) === null, "a free-weekend page with zero items is not a page");
ok(P.freeWeekendPageModel(rows, "orlando", now) === null, "orlando is not this template");
const freeModel = P.freeWeekendPageModel(rows, "tampa", now);
ok(freeModel && freeModel.title === "Free things to do this weekend in Tampa" && freeModel.items.length === 1, "Tampa model is the free-weekend template");
ok(!/wayfindScore|editorial_score|toDisplayScore/.test(strip(read("lib/bestOfPages.js"))), "best-of selection must not read a score");

// 3. Rendering zero items fails. A real model renders ItemList and place links.
const articleMod = await loadComponent(path.join(root, "app/best/BestOfArticle.js"), root);
const Article = articleMod.default;
const render = (model) => renderToStaticMarkup(React.createElement(Article, { model }));
ok(render(null) === "" && render({ title: "Empty", items: [] }) === "", "a render with zero items produces no page");
const html = render(sunsetModel);
ok(/"@type":"ItemList"/.test(html), "the page emits ItemList JSON-LD");
ok(new RegExp('"numberOfItems":' + sunsetModel.items.length).test(html), "numberOfItems matches the rendered list");
ok(!/"numberOfItems":0/.test(html), "ItemList is never zero");
ok((html.match(/href="\/places\//g) || []).length === sunsetModel.items.length, "every item links to a place page");
ok((html.match(/<h1[\s>]/g) || []).length === 1, "one H1");
ok(!/[★☆]|\b\d(?:\.\d)?\s*\/\s*10\b/.test(html), "the best-of page does not print a score");
const freeHtml = render(freeModel);
ok(/href="\/places\/ChIJy6ESWITDwogReu72OLauRMM"/.test(freeHtml) && /Riverwalk market/.test(freeHtml) && /"@type":"ItemList"/.test(freeHtml), "the free-weekend template renders the event and its place link");

// 4. Flag off does not change sitemap output. Flag on adds only pages that
//    have items. A non-boolean truthy enabled value stays off.
const base = [
  { url: "https://www.gowayfind.com/guides" },
  { url: "https://www.gowayfind.com/places" },
];
const off = P.bestOfSitemapRows("https://www.gowayfind.com", { enabled: false, events: rows, now });
ok(off.length === 0 && JSON.stringify([...base, ...off]) === JSON.stringify(base), "flag off leaves sitemap output unchanged");
ok(P.bestOfSitemapRows("https://www.gowayfind.com", { enabled: "true", events: rows, now }).length === 0, "only boolean true enables sitemap rows");
const on = P.bestOfSitemapRows("https://www.gowayfind.com", { enabled: true, events: rows, now });
ok(on.some((r) => r.url === "https://www.gowayfind.com/best/sunset-spots/sarasota"), "flag on lists the sunset page");
ok(on.some((r) => r.url === "https://www.gowayfind.com/best/free-this-weekend/tampa"), "flag on lists Tampa free-this-weekend when it has items");
ok(on.some((r) => r.url === "https://www.gowayfind.com/best/free-this-weekend/sarasota"), "flag on lists Sarasota free-this-weekend when it has items");
const onEmpty = P.bestOfSitemapRows("https://www.gowayfind.com", { enabled: true, events: [], guides: hoursOnly, cards: [], now });
ok(!onEmpty.some((r) => r.url.includes("/best/")), "flag on with zero items adds no best-of URLs");
ok(P.bestOfRouteDecision({ flagOn: false, model: sunsetModel }) === "not-found", "flag off 404s even when the model has items");
ok(P.bestOfRouteDecision({ flagOn: true, model: null }) === "not-found", "flag on with no model 404s");
ok(P.bestOfRouteDecision({ flagOn: true, model: sunsetModel }) === "render", "flag on with items renders");

const sm = strip(read("app/sitemap.js"));
ok(/bestOfSitemapRows\(/.test(sm) && /seoFlagOn\(/.test(sm), "sitemap asks the flag before appending best-of rows");
ok(!/sunset-spots|free-this-weekend/.test(sm), "sitemap.js has no best-of URL except through bestOfSitemapRows");
const page = read("app/best/[topic]/[city]/page.js");
ok(/alternates:\s*\{\s*canonical:\s*url\s*\}/.test(page), "best-of metadata sets a canonical URL");
ok(/robots:\s*\{\s*index:\s*true\b/.test(page), "best-of routes are indexable when they render");
ok(/bestOfRouteDecision\(/.test(page) && /notFound\(/.test(page), "the route 404s unless the decision is render");
ok(/index:\s*false/.test(read("app/budget/page.js")), "/budget stays noindex");
ok(/index:\s*false/.test(read("app/best-of/page.js")), "/best-of stays noindex");

if (fails) {
  console.error(`check-bestof-pages: ${fails} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`check-bestof-pages: OK (${checks} checks; zero items do not render, flag off leaves the sitemap unchanged)`);
