import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";

import { splitBreakfastRails } from "../lib/breakfastRails.js";
import { composeLunchBreakRails, LUNCH_BREAK_RAILS } from "../lib/lunchBreakRails.js";
import { composeWorthEatingRails, WORTH_EATING_RAILS } from "../lib/worthEatingRails.js";
import { railRenderState, RAIL_RENDER_STATE, visibleRails } from "../lib/railVisibility.js";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { transformSync } = require("next/dist/build/swc");

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

// Load the real JSX components through Next's own compiler, then verify the
// user-visible output. This exercises the component boundary rather than
// inferring behavior from source text.
const defaultJsLoader = Module._extensions[".js"];
Module._extensions[".js"] = (module, filename) => {
  if (!filename.includes("/Wayfind/")) return defaultJsLoader(module, filename);
  const transformed = transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      target: "es2020",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });
  module._compile(transformed.code, filename);
};

try {
  const emptyRenderCases = [
    ["BreakfastRails", { places: [] }],
    ["LunchBreakRails", { places: [] }],
    ["WorthEatingRails", { places: [] }],
    ["SummerPicksRails", { rails: [{ id: "sports", title: "Sports Events", deck: "Games", cards: [] }], city: "Test City" }],
  ];
  for (const [name, props] of emptyRenderCases) {
    const Component = require(`../app/components/${name}.js`).default;
    assert.equal(
      renderToStaticMarkup(React.createElement(Component, props)),
      "",
      `${name} must render no heading, deck, navigation, or rail for healthy empty input`,
    );
  }
  const SummerPicksRails = require("../app/components/SummerPicksRails.js").default;
  const pendingMarkup = renderToStaticMarkup(React.createElement(SummerPicksRails, {
    city: "Test City",
    rails: [{ id: "sports", title: "Sports Events", deck: "Games", pending: true, cards: [] }],
  }));
  assert.match(pendingMarkup, /Sports Events/, "a pending rail keeps its heading while inventory loads");
  assert.match(pendingMarkup, /role="status"/, "a pending rail renders an accessible loading status");
  assert.doesNotMatch(pendingMarkup, /wf-rail-exploding/, "a pending rail does not render an empty carousel");

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

  const { TodayEntertainmentRail } = require("../app/components/TodayDiscoveryRails.js");
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
} finally {
  Module._extensions[".js"] = defaultJsLoader;
}

console.log("empty rail visibility: 16 behavioral, 18 component render, and 3 event wiring assertions passed");
