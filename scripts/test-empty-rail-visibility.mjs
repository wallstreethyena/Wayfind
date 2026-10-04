import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

import { splitBreakfastRails } from "../lib/breakfastRails.js";
import { composeLunchBreakRails, LUNCH_BREAK_RAILS } from "../lib/lunchBreakRails.js";
import { composeWorthEatingRails, WORTH_EATING_RAILS } from "../lib/worthEatingRails.js";
import { railRenderState, RAIL_RENDER_STATE, visibleRails } from "../lib/railVisibility.js";

assert.equal(railRenderState([]), RAIL_RENDER_STATE.HIDDEN, "a resolved empty rail must render no shell");
assert.equal(railRenderState([], { loading: true }), RAIL_RENDER_STATE.LOADING, "an in-flight empty rail must keep loading UI");
assert.equal(railRenderState([], { error: true }), RAIL_RENDER_STATE.ERROR, "a failed empty rail must keep its outage UI");
assert.equal(
  railRenderState([], { loading: true, error: true }),
  RAIL_RENDER_STATE.ERROR,
  "a failure must not be disguised by an empty or stale loading state",
);
assert.equal(
  railRenderState([{ id: "known-card" }], { error: true }),
  RAIL_RENDER_STATE.CONTENT,
  "already-renderable inventory must remain available after a pagination failure",
);

const definitions = [
  { id: "empty-a", cards: [] },
  { id: "kept", cards: [{ id: "card-1" }] },
  { id: "empty-b", cards: [] },
];
const shown = visibleRails(definitions, "cards");
assert.deepEqual(shown.map((rail) => rail.id), ["kept"], "only rails with cards belong in the render plan");
assert.equal(shown[0], definitions[1], "filtering must preserve the API rail object and stable id");
assert.equal(definitions.length, 3, "filtering must not delete API rail definitions used by paging");
assert.deepEqual(visibleRails(null, "cards"), [], "an absent optional rail collection renders nothing");

const breakfast = splitBreakfastRails([]);
assert.equal(breakfast.length, 2, "Breakfast keeps both API rail definitions");
assert.deepEqual(visibleRails(breakfast, "places"), [], "Breakfast renders no shells for a healthy empty pool");

const lunch = composeLunchBreakRails([]);
assert.equal(lunch.length, LUNCH_BREAK_RAILS.length, "Lunch Break keeps every API rail definition");
assert.deepEqual(visibleRails(lunch, "places"), [], "Lunch Break renders no shells for a healthy empty pool");

const worthEating = composeWorthEatingRails([]);
assert.equal(worthEating.length, WORTH_EATING_RAILS.length, "Worth Eating keeps every API rail definition");
assert.deepEqual(visibleRails(worthEating, "places"), [], "Worth Eating renders no shells for a healthy empty pool");

const lunchWithOneMatch = composeLunchBreakRails([{ id: "burger-1", name: "Harbor Burger", primaryType: "hamburger_restaurant", rating: 4.8, reviews: 500 }]);
assert.deepEqual(
  visibleRails(lunchWithOneMatch, "places").map((rail) => rail.id),
  ["burgers"],
  "a matching card renders its rail without reviving empty siblings",
);

// Use the shared real-component loader, including its CSS-module boundary.
// GuideRailCollection imports GuideFigure: styles are data, never JavaScript.
// No rail, wrapper, card or guide component is mocked by this render test.
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const components = new Map();
let summerGraph;
const emptyRenderCases = [
  ["BreakfastRails", { places: [] }],
  ["LunchBreakRails", { places: [] }],
  ["WorthEatingRails", { places: [] }],
  ["SummerPicksRails", { rails: [{ id: "sports", title: "Sports Events", deck: "Games", cards: [] }], city: "Test City" }],
];
for (const [name, props] of emptyRenderCases) {
  const module = await loadComponent(fileURLToPath(new URL(`../app/components/${name}.js`, import.meta.url)), repoRoot, {
    onGraph: (graph) => { if (name === "SummerPicksRails") summerGraph = graph; },
  });
  components.set(name, module);
  const Component = module.default;
  assert.equal(
    renderToStaticMarkup(React.createElement(Component, props)),
    "",
    `${name} must render no heading, deck, navigation, or rail for healthy empty input`,
  );
}
const SummerPicksRails = components.get("SummerPicksRails").default;
const pendingMarkup = renderToStaticMarkup(React.createElement(SummerPicksRails, {
  city: "Test City",
  rails: [{ id: "sports", title: "Sports Events", deck: "Games", pending: true, cards: [] }],
}));
assert.match(pendingMarkup, /Sports Events/, "a pending rail keeps its heading while inventory loads");
assert.match(pendingMarkup, /role="status"/, "a pending rail renders an accessible loading status");
assert.match(pendingMarkup, /class="wf-place-card wf-place-card-sk" aria-hidden="true"/, "a pending rail reserves the shared card geometry with decorative skeletons");
assert.doesNotMatch(pendingMarkup, /data-rail=|class="wf-rail-nav"|role="region"/, "a pending rail does not expose an empty content carousel or paging controls");

const failedMarkup = renderToStaticMarkup(React.createElement(SummerPicksRails, {
  city: "Test City",
  rails: [{ id: "sports", title: "Sports Events", deck: "Games", failed: true, cards: [] }],
}));
assert.match(failedMarkup, /role="alert"/, "a failed rail stays distinguishable from healthy empty inventory");
assert.doesNotMatch(failedMarkup, /wf-rail-exploding/, "a failed rail does not render an empty carousel");

const eventMarkup = renderToStaticMarkup(React.createElement(SummerPicksRails, {
  city: "Test City",
  rails: [{ id: "sports", title: "Sports Events", deck: "Games", cards: [{ kind: "event", id: "game-1", name: "Home Match", dest: "/events/game-1" }] }],
}));
assert.match(eventMarkup, /Home Match/, "a raw sports event renders through the shared event card");
assert.match(eventMarkup, /\/events\/game-1/, "a raw sports event keeps its truthful destination");

const eventNodeMarkup = renderToStaticMarkup(React.createElement(SummerPicksRails, {
  city: "Test City",
  rails: [{ id: "sports", title: "Sports Events", deck: "Games", cards: [{ kind: "event-node", id: "game-2", node: React.createElement("article", null, "Pre-rendered game") }] }],
}));
assert.match(eventNodeMarkup, /Pre-rendered game/, "a homepage event node stays renderable in its injected slot");

const { TodayEntertainmentRail } = await loadComponent(fileURLToPath(new URL("../app/components/TodayDiscoveryRails.js", import.meta.url)), repoRoot);
assert.equal(
  renderToStaticMarkup(React.createElement(TodayEntertainmentRail, { eventSurface: { pending: false, failed: false, byRail: { entertainment: [] } } })),
  "",
  "Today entertainment hides its full shell after a healthy empty result",
);
const todayPending = renderToStaticMarkup(React.createElement(TodayEntertainmentRail, { eventSurface: { pending: true, byRail: {} } }));
assert.match(todayPending, /role="status"/, "Today entertainment preserves its loading state");
const todayFailed = renderToStaticMarkup(React.createElement(TodayEntertainmentRail, { eventSurface: { failed: true, byRail: {} } }));
assert.match(todayFailed, /role="alert"/, "Today entertainment preserves an explicit provider failure");
const twelveEvents = Array.from({ length: 12 }, (_, index) => ({ id: `event-${index + 1}`, name: `Event ${index + 1}`, dest: `/events/${index + 1}` }));
const todayEvents = renderToStaticMarkup(React.createElement(TodayEntertainmentRail, { eventSurface: { byRail: { entertainment: twelveEvents } } }));
assert.match(todayEvents, /Event 10/, "Today entertainment renders the combined ranked event rail");
assert.doesNotMatch(todayEvents, /Event 11/, "Today entertainment enforces its top-ten presentation cap");
const todayNode = renderToStaticMarkup(React.createElement(TodayEntertainmentRail, {
  eventSurface: { byRail: { entertainment: [React.createElement("article", { key: "live-node" }, "Interactive concert card")] } },
}));
assert.match(todayNode, /Interactive concert card/, "Today entertainment preserves the homepage interactive event node");

const todaySource = fs.readFileSync(new URL("../app/components/TodayDiscoveryRails.js", import.meta.url), "utf8");
assert.match(todaySource, /mode: "today-entertainment"/, "Today standalone pages request the combined concert and comedy fallback");
assert.match(todaySource, /eventsSlot\("today-entertainment", selectPosterEvents\)/, "Today consumes the homepage event slot only for its combined rail");
assert.match(todaySource, /<TodayEntertainmentRail eventSurface=\{eventSurface\}/, "Today mounts one combined event rail alongside its existing place rails");
// Drive the exact context module in Summer's compiled dependency graph. A
// separately compiled context would falsely test an empty provider forever.
const contextPath = fileURLToPath(new URL("../app/components/GuideDiscoveryContext.js", import.meta.url));
assert(summerGraph.has(contextPath), "the real guide context is reachable from the rail component");
const { GuideDiscoveryContext } = await import(summerGraph.get(contextPath));
const guide = {
  slug: "fixture-local-guide", title: "Covered local guide", region: "Test City", placeIds: ["covered-place"],
  image: { src: "/fixture-guide.jpg", credit: "Fixture photographer", creditHref: "https://example.test/credit" },
};
const renderWithGuide = (rails) => renderToStaticMarkup(React.createElement(GuideDiscoveryContext.Provider, { value: [guide] },
  React.createElement(SummerPicksRails, { city: "Test City", rails })));
const placeRails = [
  { id: "covered", title: "Covered places", cards: [{ kind: "place", id: "covered-place", name: "Covered Place" }] },
  { id: "other", title: "Other places", cards: [{ kind: "place", id: "other-place", name: "Other Place" }] },
];
const guidedMarkup = renderWithGuide(placeRails);
assert.equal((guidedMarkup.match(/data-guide-discovery=/g) || []).length, 1, "a covered place renders one actual guide card");
assert.match(guidedMarkup, /data-guide-figure="card"/, "the guide's CSS-module figure dependency really renders");
assert.match(guidedMarkup, /href="https:\/\/example.test\/credit"/, "the actual guide keeps its separate credit link");
assert.equal((guidedMarkup.match(/data-rail=/g) || []).length, 2, "the guide wrapper preserves both original place rails");
assert.match(guidedMarkup, /Covered Place/);
assert.match(guidedMarkup, /Other Place/);
assert.equal(renderWithGuide([{ ...placeRails[0], cards: [] }]), "", "guide context cannot revive a healthy empty rail shell");
const guidedPending = renderWithGuide([{ ...placeRails[0], pending: true, cards: [] }]);
assert.match(guidedPending, /role="status"/, "guide context preserves the real pending rail");
assert.doesNotMatch(guidedPending, /data-guide-discovery=/, "pending inventory cannot invent guide relevance");
const unrelatedMarkup = renderWithGuide([{ ...placeRails[0], cards: [{ kind: "place", id: "unrelated", name: "Unrelated Place" }] }]);
assert.match(unrelatedMarkup, /Unrelated Place/);
assert.doesNotMatch(unrelatedMarkup, /data-guide-discovery=/, "unrelated place identity cannot authorize a guide");
const guidedEvent = renderWithGuide([{ ...placeRails[0], cards: [{ kind: "event", id: "covered-place", name: "Covered ID concert", dest: "/events/concert" }] }]);
assert.match(guidedEvent, /Covered ID concert/);
assert.doesNotMatch(guidedEvent, /data-guide-discovery=/, "event identity cannot authorize a place guide");

console.log("empty rail visibility: original behavioral/render/event wiring controls and real guide/CSS-module positive and negative controls passed");
