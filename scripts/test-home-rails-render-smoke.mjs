#!/usr/bin/env node
/**
 * test-home-rails-render-smoke — actually RENDER the home rails, don't grep them.
 *
 * THE INCIDENT THIS EXISTS FOR (2026-08-09, deploy-blocking class). The Top 40
 * rail landed in #684 with one character missing:
 *
 *     const load = (id) =        // the '>' of the arrow was gone
 *       id === "eat" ? ... : ...
 *
 * That parses. `(id) = <ternary>` is an assignment expression, so the ternary is
 * evaluated the moment the component body runs — against an `id` that was never
 * declared. Every render of BestNearby threw
 *     ReferenceError: id is not defined
 * and Vercel's prerender of "/" failed, which left `main` UNDEPLOYABLE: the merge
 * succeeded, so every subsequent PR would have failed to deploy too.
 *
 * WHY EVERYTHING ELSE WAS GREEN, and why this is a RENDER and not another grep:
 *   295 guards     all read source as TEXT. check-top40-rail asserted the sort,
 *                  the dedupe, the disclosure and the CTA — every one of those
 *                  strings was present and correct. None of them called anything.
 *   next build     compiled it. Webpack has no opinion about an unbound
 *                  identifier; it is legal JavaScript right up until it runs.
 *   LOCAL next build  passed, because "/" is not prerendered without the real
 *                  env keys — the failure only appears where the page is
 *                  statically generated. A green local build was not evidence.
 *
 * Same lesson as test-detail-render-smoke, on a different surface: the only
 * thing that separates "the source looks right" from "the component works" is
 * calling it. So this calls it.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { selectPlacePhotoRef } from "../lib/placePhoto.js";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const load = (rel) => loadComponent(fileURLToPath(new URL("../" + rel, import.meta.url)), REPO);

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const CENTER = { lat: 27.5864, lng: -82.4257 };
const WEATHER = { temp: 88, label: "Clear", sunset: null };

// Missing-card imagery may hydrate only from the same Google place. Exact IDs
// win; a name-only result from another city is refused even if it has a photo.
{
  const target = { place_id: "ChIJ-target", name: "P J's Sandwich Shop", lat: 27.5, lng: -82.5 };
  const exact = { id: "ChIJ-target", displayName: { text: "PJ Sandwich" }, location: { latitude: 28.1, longitude: -81.3 }, photos: [{ name: "places/ChIJ-target/photos/exact" }] };
  const wrongCity = { id: "ChIJ-other", displayName: { text: "P J's Sandwich Shop" }, location: { latitude: 40.7, longitude: -74.0 }, photos: [{ name: "places/ChIJ-other/photos/wrong" }] };
  ok(selectPlacePhotoRef([wrongCity, exact], target) === "places/ChIJ-target/photos/exact",
    "missing imagery hydrates from the exact Google Place ID");
  ok(selectPlacePhotoRef([wrongCity], target) === null,
    "an exact-name venue in the wrong city cannot donate its photo");
}

// Every prop shape the home page really passes, including the empty and the
// absent ones — a rail that only survives the happy path is a rail that breaks
// on the first reader whose location has no coverage.
const CASES = [
  ["full props", { center: CENTER, weather: WEATHER, events: [], videoPlaces: [], onOpenPlace: () => {}, onLog: () => {} }],
  ["no center yet (first paint, before geolocation resolves)", { center: null, weather: null, events: [], videoPlaces: [], onOpenPlace: () => {}, onLog: () => {} }],
  ["no callbacks wired", { center: CENTER, weather: WEATHER, events: [], videoPlaces: [] }],
  ["null events + null videoPlaces", { center: CENTER, weather: WEATHER, events: null, videoPlaces: null, onOpenPlace: () => {}, onLog: () => {} }],
];

const BestNearby = (await load("app/components/BestNearby.js")).default;
for (const [label, props] of CASES) {
  let html = null;
  let err = null;
  try { html = renderToStaticMarkup(createElement(BestNearby, props)); } catch (e) { err = e; }
  ok(!err, `BestNearby renders with ${label} — threw: ${err && err.message}`);
  // A component that renders to nothing would pass a mere "did not throw", so
  // assert it produced the panel the home page depends on.
  if (!err) ok(typeof html === "string" && html.length > 0, `BestNearby produced markup with ${label}, not an empty string`);
}

// The shared rail card, rendered in both the shapes the three rails use: a
// place (a real Wayfind Score) and an event (no score, a when badge instead).
const RailCard = (await load("app/components/RailCard.js")).default;
const RAIL_CASES = [
  ["a place card (score, facts, chips, actions)", {
    photo: "/x.jpg", title: "Smoke Test Place", eyebrow: "Fine dining", rank: 1, score: 9.4,
    facts: ["8.7k reviews", "Open"], award: { tone: 1, icon: "1", label: "Top food pick" },
    chips: [{ key: "c", icon: "🎬", label: "Creator video" }], onOpen: () => {}, onShare: () => {},
  }],
  ["an event card (NO score, a when badge)", {
    photo: "/x.jpg", title: "Smoke Test Event", eyebrow: "Comedy", rank: 2,
    when: { label: "TONIGHT", value: "8:50 PM", tone: "now" }, facts: ["A Venue"],
    cta: { label: "Get tickets ↗", href: "/x", external: true }, onOpen: () => {},
  }],
  ["the bare minimum — title only, every enrichment absent", { title: "Just A Title" }],
  ["no title at all (must render nothing, not throw)", {}],
];
for (const [label, props] of RAIL_CASES) {
  let err = null;
  try { renderToStaticMarkup(createElement(RailCard, props)); } catch (e) { err = e; }
  ok(!err, `RailCard renders with ${label} — threw: ${err && err.message}`);
}

// v7.05 — THE FOUR INTENT RAILS. IntentRailBody is the newest member of the
// menu and the one with the most ways to throw at render time: it reads an
// INTENT_PAGES entry, an IntersectionObserver, a module-level pool and six
// optional callbacks, and it is server-rendered before any of the browser APIs
// exist. Rendering it in plain node is the only check that proves the SSR path
// is clean — the exact gap that let the #684 ReferenceError reach production.
const IntentRailBody = (await load("app/components/IntentRail.js")).default;
const INTENT_CASES = [
  ["hidden-gems with a centre and every callback", {
    intent: "hidden-gems", href: "/hidden-gems", label: "Hidden gems", unit: "hidden gems",
    active: true, center: CENTER, weather: WEATHER, city: "Parrish, FL",
    onOpenPlace: () => {}, onLog: () => {}, onExperience: () => {},
    isSaved: () => false, liked: {}, disliked: {}, onSave: () => {}, onLike: () => {}, onDislike: () => {}, onShare: () => {},
  }],
  ["tonight, collapsed and with no centre yet", { intent: "tonight", href: "/tonight", unit: "picks for tonight", active: false, center: null, weather: null }],
  ["worth-the-drive with no callbacks wired at all", { intent: "worth-the-drive", href: "/worth-the-drive", unit: "day trips", active: true, center: CENTER }],
  ["budget", { intent: "budget", href: "/budget", unit: "low-cost picks", active: true, center: CENTER, weather: WEATHER }],
  ["an intent that does not exist (must render nothing, not throw)", { intent: "no-such-intent", active: true, center: CENTER }],
];
for (const [label, props] of INTENT_CASES) {
  let err = null;
  try { renderToStaticMarkup(createElement(IntentRailBody, props)); } catch (e) { err = e; }
  ok(!err, `IntentRailBody renders with ${label} — threw: ${err && err.message}`);
}

// And the menu with a creator slot in it: the creator row is no longer a
// sibling of BestNearby, it is a React element handed to it, so a change that
// broke that hand-off would take the whole panel down rather than one row.
{
  let err = null;
  try {
    renderToStaticMarkup(createElement(BestNearby, {
      center: CENTER, weather: WEATHER, events: [], videoPlaces: [],
      city: "Parrish, FL", creatorSlot: createElement("div", null, "creator row"),
      onOpenPlace: () => {}, onLog: () => {},
    }));
  } catch (e) { err = e; }
  ok(!err, `BestNearby renders with a creatorSlot element — threw: ${err && err.message}`);
}

// Events are a first-class accordion answer again. The slot is built once in
// home.js and rendered once by BestNearby, so restoring it cannot duplicate the
// event rail elsewhere in the menu.
{
  const withEvents = renderToStaticMarkup(createElement(BestNearby, {
    center: CENTER, weather: WEATHER, events: [], videoPlaces: [],
    eventsSlot: createElement("div", { "data-smoke-events": "1" }, "events rail"),
    onOpenPlace: () => {}, onLog: () => {},
  }));
  const without = renderToStaticMarkup(createElement(BestNearby, {
    center: CENTER, weather: WEATHER, events: [], videoPlaces: [],
    eventsSlot: null, onOpenPlace: () => {}, onLog: () => {},
  }));
  ok(withEvents.includes("Events Near You") && without.includes("Events Near You"),
    "the Events Near You accordion row is present with or without loaded event data");
  ok((withEvents.match(/data-smoke-events="1"/g) || []).length === 1,
    "the provided events rail renders exactly once inside its accordion row");
  const home = readFileSync(path.join(REPO, "app/home.js"), "utf8");
  ok(/const eventsRailSlot\s*=/.test(home) && /setScreen\("events"\)/.test(home),
    "event discovery remains connected through home.js and its full Events screen");
}

if (fail.length) {
  console.error("test-home-rails-render-smoke: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`test-home-rails-render-smoke: OK — ${pass} assertions; BestNearby, RailCard and IntentRailBody were CALLED across ${CASES.length + RAIL_CASES.length + INTENT_CASES.length + 1} prop shapes, which is the only check that separates "the source reads right" from "the component runs"`);
