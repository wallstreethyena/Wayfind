// Execute Fall's real render boundary and usePagedRail hook with deterministic
// React lifecycle, clock, observer and response fixtures. No network is used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as railPage from "../../lib/railPage.js";
import { railItemIdentity } from "../../lib/eventOccurrenceIdentity.js";
import * as christmasCardCopy from "../../lib/christmasCardCopy.js";
import * as visitFacts from "../../lib/eventVisitFacts.js";
import * as lawfulOrder from "../../lib/lawfulOrder.js";
import { applyCuratorPicks } from "../../lib/curatorPicks.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import * as railVisibility from "../../lib/railVisibility.js";
import { withMoviesRail } from "../../lib/moviesRailSlot.js";
import { toDisplayScore } from "../../lib/score.js";
import { partnerTicketLabel } from "../../lib/partnerCopy.js";
import { ownedPlacePhotoSrc } from "../../lib/placePhoto.js";

const componentFile = new URL("../../app/components/FallIntentRails.js", import.meta.url);
const hookFile = new URL("../../app/components/usePagedRail.js", import.meta.url);
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

function lifecycle() {
  const slots = [];
  let cursor = 0, changed = false, pending = [];
  const useMemo = (fn, deps) => {
    const i = cursor++;
    if (!slots[i] || !sameDeps(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
    return slots[i].value;
  };
  return {
    hooks: {
      useMemo,
      useCallback: (fn, deps) => useMemo(() => fn, deps),
      useRef: (value) => { const i = cursor++; return slots[i] || (slots[i] = { current: value }); },
      useState: (initial) => {
        const i = cursor++;
        if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
        return [slots[i].value, (next) => {
          const value = typeof next === "function" ? next(slots[i].value) : next;
          if (!Object.is(value, slots[i].value)) { slots[i].value = value; changed = true; }
        }];
      },
      useEffect: (fn, deps) => {
        const i = cursor++;
        if (!slots[i] || !sameDeps(slots[i].deps, deps)) {
          const previous = slots[i];
          slots[i] = { deps, cleanup: null };
          pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
        }
      },
    },
    render(fn) {
      for (let turns = 0; turns < 20; turns++) {
        cursor = 0; changed = false; pending = [];
        const tree = fn();
        for (const effect of pending) effect();
        if (!changed) return tree;
      }
      throw new Error("Fall paging fixture did not settle after 20 renders");
    },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function evaluate(source, filename, require, ReactFixture, Observer) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(code, { exports, require, React: ReactFixture, console, Date, URLSearchParams, AbortController, IntersectionObserver: Observer }, { filename });
  return exports;
}

function elements(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, type));
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props?.children, type)];
}

export async function checkFallPaging({ componentSource = readFileSync(componentFile, "utf8"), hookSource = readFileSync(hookFile, "utf8") } = {}) {
  let checks = 0;
  const check = (value, message) => { assert.ok(value, message); checks++; };
  const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
  let activeLifecycle, latestPage;
  let now = new Date("2026-10-05T16:00:00Z");
  let source = [], bulkRails = [];
  const requests = [], bulkRequests = [], observers = [];
  const readyUnknownPicks = { ready: false, known: () => false, has: () => false };
  const ReactFixture = { ...React };
  for (const name of ["useMemo", "useCallback", "useRef", "useState", "useEffect"]) ReactFixture[name] = (...args) => activeLifecycle.hooks[name](...args);
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.disconnected = true; }
    intersect(value = true) { if (!this.disconnected) this.callback([{ isIntersecting: value }]); }
  }
  const RailCard = () => null, RailNav = () => null, RailDots = () => null;
  const RailLoading = () => null, GuideRailCollection = () => null, leaf = () => null;
  const hook = evaluate(hookSource, "app/components/usePagedRail.js", (spec) => {
    if (spec === "react") return ReactFixture;
    if (spec.endsWith("railPage.js")) return railPage;
    if (spec.endsWith("posterJson.js")) return { fetchPosterJson: async (url) => {
      requests.push(url);
      const query = new URL(url, "https://local.fixture").searchParams;
      return railPage.pageOneRail([{ id: "farms", cards: source }], query.get("rail"), { page: query.get("page"), size: query.get("size") });
    } };
    throw new Error(`unexpected paging fixture dependency: ${spec}`);
  }, ReactFixture, Observer);
  const componentImports = (spec) => {
    if (spec === "react") return ReactFixture;
    if (/\/RailCard$/.test(spec)) return { default: RailCard, RailNav, RailDots };
    if (/\/RailLoading$/.test(spec)) return { default: RailLoading };
    if (/\/GuideRailCollection$/.test(spec)) return { default: GuideRailCollection };
    if (spec.endsWith("usePagedRail.js")) return { usePagedRail: (...args) => { latestPage = hook.usePagedRail(...args); return latestPage; } };
    if (spec.endsWith("useEventClock.js")) return { default: () => now };
    if (spec.endsWith("curatorPicks.js")) return { applyCuratorPicks, useCuratorPicks: () => readyUnknownPicks };
    if (spec.endsWith("lawfulOrder.js")) return lawfulOrder;
    if (spec.endsWith("eventVisitFacts.js")) return visitFacts;
    if (spec.endsWith("railPage.js")) return railPage;
    if (spec.endsWith("eventOccurrenceIdentity.js")) return { railItemIdentity };
    if (spec.endsWith("christmasCardCopy.js")) return christmasCardCopy;
    if (spec.endsWith("railVisibility.js")) return railVisibility;
    if (spec.endsWith("moviesRailSlot.js")) return { withMoviesRail }; // pure helper, the real one
    if (spec.endsWith("score.js")) return { toDisplayScore };
    if (spec.endsWith("partnerCopy.js")) return { partnerTicketLabel };
    if (spec.endsWith("placePhoto.js")) return { ownedPlacePhotoSrc };
    if (spec.endsWith("siteTime.js")) return { siteTodayStr };
    if (spec.endsWith("siteDayClock.js")) return { useSiteToday: () => siteTodayStr() }; // the midnight-aware date hook; the fixture clock is fixed
    if (spec.endsWith("fallSkin.js")) return { fallSkinLive: () => true };
    if (spec.endsWith("posterJson.js")) return { fetchClassifiedPosterJson: async (url) => {
      bulkRequests.push(url);
      return { today: siteTodayStr(now), rails: bulkRails };
    } };
    return { default: leaf }; // Only visual/telemetry leaves are outside this boundary.
  };
  const component = evaluate(componentSource + "\nexport { FallRailSection };\n", "app/components/FallIntentRails.js", componentImports, ReactFixture, Observer);
  const christmasSource = readFileSync(new URL("../../app/components/ChristmasIntentRails.js", import.meta.url), "utf8");
  const christmas = evaluate(christmasSource + "\nexport { ChristmasRailSection };\n", "app/components/ChristmasIntentRails.js", componentImports, ReactFixture, Observer);
  const event = (id, end_date = "2026-10-31") => ({ kind: "event", id, name: id, start_date: "2026-10-01", end_date, detailHref: `/florida-events/${id}` });
  const rail = (cards) => ({ id: "farms", title: "Fall Farms", cards });
  const mount = (fn) => {
    const state = lifecycle();
    return { render: () => { activeLifecycle = state; return state.render(fn); }, dispose: () => state.dispose() };
  };
  const renderRail = (rows) => mount(() => component.FallRailSection({ rail: rail(rows), lat: 27.3, lng: -82.5 }));
  const cards = (tree) => elements(tree, RailCard);
  const refs = (tree) => cards(tree).filter((card) => typeof card.props.domRef === "function");
  const ids = (tree) => cards(tree).map((card) => card.props.visitFacts?.id || card.props.place?.id);
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const attach = (tree) => {
    equal(refs(tree).length, 1, "one mounted visible card owns the real paging observer");
    refs(tree)[0].props.domRef({ id: refs(tree)[0].key });
    return observers.at(-1);
  };

  // Owner 2026-10-29: a rail shows EVERY option and the counter is the true
  // total. 69 rows mirrors the live Christmas towns-markets rail ("10 OF 12"
  // while the API total was 69). Nothing trickles; nothing is left to fetch.
  source = Array.from({ length: 69 }, (_, i) => event(`normal-${i + 1}`));
  const normal = renderRail(source);
  let tree = normal.render();
  equal(ids(tree), source.map((row) => row.id), "Fall renders every one of the 69 rows in ranked order");
  equal(elements(tree, RailNav)[0].props.loaded, 69, "navigation reports all 69 loaded rows");
  equal(elements(tree, RailNav)[0].props.total, 69, "navigation total is the true card count");
  equal(requests.length, 0, "the bulk seed is complete, so no continuation request is ever made");
  check(!latestPage.hasMore, "the real hook has nothing more to load when every row is seeded");
  normal.dispose();

  // Different occurrences may share a source ID. Browser reconciliation must
  // retain both, with stable keys that identify dates rather than the source.
  const sharedSource = [
    { ...event("same-source"), start_date: "2026-10-06", end_date: "2026-10-06", place_id: "venue" },
    { ...event("same-source"), start_date: "2026-10-07", end_date: "2026-10-07", place_id: "venue" },
  ];
  for (const [label, Section] of [["Fall and Halloween", component.FallRailSection], ["Christmas", christmas.ChristmasRailSection]]) {
    let seed = sharedSource;
    let seedTotal = 2;
    const shared = mount(() => Section({ rail: { ...rail(seed), total: seedTotal }, lat: 27.3, lng: -82.5 }));
    const sharedCards = cards(shared.render());
    equal(sharedCards.length, 2, `${label}: two source-ID-sharing occurrences remain rendered`);
    equal(new Set(sharedCards.map((card) => card.key)).size, 2, `${label}: each rendered occurrence has a different React key`);
    equal(sharedCards.map((card) => card.props.actionItem.id), ["same-source", "same-source"], `${label}: display keys do not rewrite saved or tracked source IDs`);
    equal(sharedCards.map((card) => card.props.href), ["/florida-events/same-source", "/florida-events/same-source"], `${label}: source event routes are preserved`);
    seed = [sharedSource[0]]; seedTotal = 1;
    equal(cards(shared.render())[0].props.visitFacts.start_date, "2026-10-06", `${label}: first one-row generation is visible`);
    seed = [sharedSource[1]];
    equal(cards(shared.render())[0].props.visitFacts.start_date, "2026-10-07", `${label}: same-size seed with the same source ID reseeds when its occurrence changes`);
    shared.dispose();

    source = sharedSource;
    const partial = mount(() => Section({ rail: { ...rail([sharedSource[0]]), total: 2 }, lat: 27.3, lng: -82.5 }));
    tree = partial.render();
    equal(cards(tree).length, 1, `${label}: partial seed starts with one occurrence`);
    await latestPage.fetchMore(); await settle(); tree = partial.render();
    equal(cards(tree).map((card) => card.props.visitFacts.start_date), ["2026-10-06", "2026-10-07"], `${label}: the real pager keeps both occurrences from the arriving page`);
    equal(new Set(cards(tree).map((card) => card.key)).size, 2, `${label}: paged occurrences retain distinct mounted keys`);
    equal(elements(tree, RailNav)[0].props.total, 2, `${label}: the counter still reports the full occurrence total`);
    partial.dispose();
  }

  requests.length = 0;
  source = Array.from({ length: 15 }, (_, i) => i < 4 ? event(`expired-${i}`, "2026-10-04") : i === 5
    ? { kind: "place", id: "selected-place", name: "Selected Place", wfScore: 98 }
    : event(`mixed-${i}`));
  const mixed = renderRail(source); tree = mixed.render();
  equal(ids(tree), source.slice(4).map((row) => row.id), "expired events disappear while the original live event and place slots survive, and every live row shows");
  equal(elements(tree, RailNav)[0].props.total, 11, "navigation subtracts only expired loaded rows from the source total");
  equal(cards(tree).map((card) => card.props.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "visible ranks are contiguous after expiry filtering");
  equal(source.length, 15, "visible filtering does not mutate or truncate the selected source pool");
  mixed.dispose();

  requests.length = 0;
  source = Array.from({ length: 10 }, (_, i) => event(`prior-day-${i}`, "2026-10-04"));
  now = new Date("2026-10-04T16:00:00Z");
  const midnight = renderRail(source); tree = midnight.render();
  equal(cards(tree).length, 10, "same-day events remain visible before the day changes");
  now = new Date("2026-10-05T16:00:00Z"); tree = midnight.render();
  equal(tree, null, "a clock change hides a rail whose mounted rows have all expired");
  equal(refs(tree).length, 0, "zero visible rows never fabricate a sentinel card");
  equal(requests.length, 0, "hiding expired rows does not issue stale continuation requests");
  midnight.dispose();

  const makeBulk = (prefix) => Array.from({ length: 10 }, (_, i) => ({ id: i === 0 ? "farms" : `rail-${i}`, title: `Rail ${i}`, cards: i === 0 ? Array.from({ length: 12 }, (_, n) => event(`${prefix}-${n}`)) : [] }));
  now = new Date("2026-10-04T16:00:00Z"); bulkRails = makeBulk("day-four");
  const collection = mount(() => component.default({ center: { lat: 27.3, lng: -82.5 } }));
  tree = collection.render();
  equal(elements(tree, RailLoading).length, 1, "the first collection generation waits for its bulk payload");
  await settle(); tree = collection.render();
  const oldSections = elements(tree, component.FallRailSection);
  equal(oldSections.length, 10, "a valid bulk payload mounts all ten approved rail definitions");
  equal(oldSections[0].key, "2026-10-04:farms", "the mounted rail seed is scoped to the venue-local date");
  now = new Date("2026-10-05T16:00:00Z"); bulkRails = makeBulk("day-five"); tree = collection.render();
  equal(elements(tree, component.FallRailSection).length, 0, "the prior-day payload cannot render while the new date is loading");
  await settle(); tree = collection.render();
  const newSections = elements(tree, component.FallRailSection);
  equal(newSections[0].key, "2026-10-05:farms", "a fresh day remounts the pager rather than retaining the prior-day seed");
  equal(bulkRequests.length, 2, "the date change makes exactly one fresh bulk request");
  source = bulkRails[0].cards;
  const newDay = renderRail(source); tree = newDay.render();
  equal(ids(tree), source.map((row) => row.id), "the remounted day starts with all of its own rows");
  check(ids(tree).every((id) => id.startsWith("day-five-")), "prior-day row identities cannot leak into the new generation");
  newDay.dispose(); collection.dispose();
  return checks;
}
