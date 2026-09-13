#!/usr/bin/env node
// Exercise EventSectionNav's hooks with a tiny DOM and MutationObserver stub.
// This calls the transpiled component, so the checks cover the real state and
// effect logic while remaining deterministic in plain Node (no browser needed).
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = fs.readFileSync(new URL("../app/components/EventSectionNav.js", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

class ElementStub {
  constructor(tagName, { id = "", label = "", hidden = false } = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.hidden = hidden;
    this.dataset = label ? { eventSection: label } : {};
    this.focusCalls = [];
    this.wrap = null;
    this.open = false;
  }

  closest(selector) {
    return selector === ".wf-event-wrap" ? this.wrap : null;
  }

  focus(options) {
    this.focusCalls.push(options);
  }
}

const eventWrap = new ElementStub("div");
eventWrap.children = [];
eventWrap.querySelectorAll = (selector) => {
  assert.equal(selector, "[data-event-section][id]", "nav queries event sections by the data contract");
  return eventWrap.children.filter((element) => element.id && element.dataset.eventSection);
};

const outsideSection = new ElementStub("section", { id: "outside", label: "Outside this event" });
const byId = (id) => [...eventWrap.children, outsideSection].find((element) => element.id === id) || null;
const documentStub = { getElementById: byId };

let observers = [];
let disconnects = 0;
class MutationObserverStub {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    this.target = null;
    this.options = null;
    observers.push(this);
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
  }
  disconnect() {
    this.disconnected = true;
    disconnects += 1;
  }
  trigger() {
    if (!this.disconnected) this.callback([]);
  }
}

// A small synchronous hook runner. It implements only the React surface this
// component uses, including functional state updates and [] effect lifetime.
const hookSlots = [];
let hookIndex = 0;
let pendingRender = false;
let renderCount = 0;
let effectQueue = [];
let tree = null;
const navElement = new ElementStub("nav");
const rerender = () => { pendingRender = true; };
const ReactStub = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } };
  },
  useRef(initialValue) {
    const slot = hookSlots[hookIndex] || { current: initialValue };
    hookSlots[hookIndex] = slot;
    hookIndex += 1;
    return slot;
  },
  useState(initialValue) {
    const slot = hookSlots[hookIndex] || { value: initialValue };
    hookSlots[hookIndex] = slot;
    hookIndex += 1;
    return [slot.value, (nextValue) => {
      const next = typeof nextValue === "function" ? nextValue(slot.value) : nextValue;
      if (next !== slot.value) {
        slot.value = next;
        rerender();
      }
    }];
  },
  useEffect(effect, deps) {
    const slot = hookSlots[hookIndex] || { deps: undefined, cleanup: null, ran: false };
    hookSlots[hookIndex] = slot;
    hookIndex += 1;
    const changed = !slot.ran || !deps || !slot.deps || deps.length !== slot.deps.length || deps.some((dep, i) => !Object.is(dep, slot.deps[i]));
    if (changed) {
      slot.effect = effect;
      slot.deps = deps;
      slot.ran = true;
      effectQueue.push(slot);
    }
  },
};

const moduleExports = {};
vm.runInNewContext(code, {
  exports: moduleExports,
  require: (specifier) => {
    if (specifier === "react") return ReactStub;
    throw new Error(`unexpected import in EventSectionNav: ${specifier}`);
  },
  React: ReactStub,
  MutationObserver: MutationObserverStub,
  document: documentStub,
  console,
}, { filename: "app/components/EventSectionNav.js" });
const EventSectionNav = moduleExports.default;
check(typeof EventSectionNav === "function", "EventSectionNav transpiles and exports a component");

function render() {
  hookIndex = 0;
  effectQueue = [];
  tree = EventSectionNav();
  renderCount += 1;
  tree.props.ref.current = navElement;
  navElement.wrap = eventWrap;
}
function flushEffectsAndRenders() {
  const initialEffects = effectQueue;
  effectQueue = [];
  for (const slot of initialEffects) slot.cleanup = slot.effect() || null;
  while (pendingRender) {
    pendingRender = false;
    render();
    const nextEffects = effectQueue;
    effectQueue = [];
    for (const slot of nextEffects) slot.cleanup = slot.effect() || null;
  }
}
function notifyMutation() {
  assert.equal(observers.length, 1, "one observer watches the event wrapper");
  observers[0].trigger();
  flushEffectsAndRenders();
}
function links() {
  const children = tree.props.children;
  return Array.isArray(children) ? children : children ? [children] : [];
}

render();
check(tree.props.hidden === true, "the navigation starts hidden when the event has no rendered sections");
flushEffectsAndRenders();
check(tree.props.hidden === true, "an initially empty event remains hidden after the first effect scan");
check(observers[0].target === eventWrap, "the observer is attached to the closest .wf-event-wrap");
check(observers[0].options.subtree && observers[0].options.childList && observers[0].options.attributes, "streamed children and section attributes are observed");
check(observers[0].options.attributeFilter.join(",") === "hidden,id,data-event-section", "only section visibility and identity attributes are observed");

const stays = new ElementStub("section", { id: "event-stays", label: "Where to stay" });
const video = new ElementStub("section", { id: "event-video", label: "Watch the guide" });
const hiddenPlanning = new ElementStub("section", { id: "event-planning", label: "Planning details", hidden: true });
const unmarked = new ElementStub("section", { id: "unmarked" });
// outsideSection is discoverable by document.getElementById but is deliberately
// not a child of this event wrapper; a second event on the page must not leak
// into this event's navigation.
eventWrap.children = [unmarked, stays, video, hiddenPlanning];
notifyMutation();
check(tree.props.hidden === false, "navigation appears when streamed sections arrive");
check(links().length === 2, "only visible sections in the event wrapper become links");
check(links().map((link) => link.props.href).join(",") === "#event-stays,#event-video", "stays and video links preserve rendered section order");
check(links().map((link) => link.props.children).join("|") === "Where to stay|Watch the guide", "link labels come from data-event-section");
check(!links().some((link) => link.props.href === "#event-planning" || link.props.href === "#outside"), "hidden and outside-wrapper sections are not advertised");

// Render the actual component's resulting element tree with React as well as
// exercising its hooks: this catches broken anchor and navigation markup.
function toReact(element) {
  if (Array.isArray(element)) return element.map(toReact);
  if (!element || typeof element !== "object") return element;
  const { children, ref, ...props } = element.props;
  return React.createElement(element.type, props, toReact(children));
}
const rendered = renderToStaticMarkup(toReact(tree));
assert.match(rendered, /<nav[^>]+aria-label="Explore this event"/);
assert.match(rendered, /href="#event-stays"/);
assert.match(rendered, /href="#event-video"/);
checks += 3;

const rendersBeforeSameScan = renderCount;
notifyMutation();
check(renderCount === rendersBeforeSameScan, "an unchanged MutationObserver scan does not rerender the nav");

video.id = "event-video-updated";
video.dataset.eventSection = "Watch the updated guide";
notifyMutation();
check(links().length === 2 && links()[1].props.href === "#event-video-updated" && links()[1].props.children === "Watch the updated guide", "id and label attribute mutations update the matching link");

stays.hidden = true;
video.hidden = true;
eventWrap.children = [stays, video, hiddenPlanning];
notifyMutation();
check(tree.props.hidden === true && links().length === 0, "removing or hiding stays and video hides an empty navigation");

const details = new ElementStub("details", { id: "event-details", label: "Read the details" });
eventWrap.children = [details];
notifyMutation();
const detailsLink = links()[0];
check(detailsLink.props.href === "#event-details", "a details section receives an anchor link");
detailsLink.props.onClick();
check(details.open === true, "clicking a details anchor opens the target details element");
check(details.focusCalls.length === 1 && details.focusCalls[0]?.preventScroll === true, "clicking an anchor focuses its target without an extra scroll");

const rendersBeforeCleanup = renderCount;
for (const slot of hookSlots) if (slot && slot.cleanup) slot.cleanup();
check(disconnects === 1 && observers[0].disconnected, "unmount cleanup disconnects the MutationObserver");
eventWrap.children = [];
observers[0].trigger();
flushEffectsAndRenders();
check(renderCount === rendersBeforeCleanup, "a disconnected observer cannot update state after unmount");

console.log(`test-event-section-nav: OK — ${checks} assertions (React hook harness; empty/streamed/hidden sections, attribute updates, details focus, cleanup)`);
