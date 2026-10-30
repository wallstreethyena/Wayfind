#!/usr/bin/env node
// Actual hook, persistent React cells, mocked device store and timers. No GPS,
// network, credentials or browser prompt is available to this fixture.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { loadComponent } from "./lib/jsxLoad.mjs";

let passed = 0;
const ok = (value, message) => { assert.ok(value, message); passed++; };
let snapshot = null, subscriptions = 0, permissionQueries = 0;
const listeners = new Set(), permissionListeners = new Set(), timers = new Map();
let timerId = 0;
const stored = new Map([["wf_center", JSON.stringify({ lat: 40.7, lng: -74, loc: "New York", manual: false, ts: Date.now() })]]);
const permission = { state: "granted", addEventListener: (_, fn) => permissionListeners.add(fn), removeEventListener: (_, fn) => permissionListeners.delete(fn) };
globalThis.__halloweenStore = {
  getSnapshot: () => snapshot,
  subscribe: (fn) => { subscriptions++; listeners.add(fn); return () => { listeners.delete(fn); snapshot = null; }; },
};
globalThis.window = {
  navigator: { geolocation: {}, permissions: { query: async () => { permissionQueries++; return permission; } } },
  localStorage: { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
};
globalThis.fetch = () => { throw new Error("Unexpected network call"); };
globalThis.setInterval = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay, interval: true }); return id; };
globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay, interval: false }); return id; };
globalThis.clearInterval = globalThis.clearTimeout = (id) => timers.delete(id);
const mod = await loadComponent(path.resolve("app/components/useHalloweenLocation.js"), process.cwd(), { onGraph(graph) {
  writeFileSync(graph.get(path.resolve("lib/deviceLocationStore.js")), "export const deviceLocationStore = globalThis.__halloweenStore;\n");
} });
const { default: useLocation, halloweenLocationOrigin, HALLOWEEN_AREAS, HALLOWEEN_AREA_KEY, HALLOWEEN_SORT_KEY } = mod;
const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function renderer() {
  const cells = [], cleanups = new Map();
  return { render(commit = true) {
    let i = 0; const effects = [];
    const dispatcher = {
      useState(initial) { const k = i++; if (!(k in cells)) cells[k] = typeof initial === "function" ? initial() : initial; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
      useRef(initial) { const k = i++; return cells[k] ||= { current: initial }; },
      useCallback(fn, deps) { const k = i++; if (!same(cells[k]?.deps, deps)) cells[k] = { fn, deps }; return cells[k].fn; },
      useEffect(fn, deps) { const k = i++; if (!same(cells[k], deps)) { effects.push(() => { cleanups.get(k)?.(); cleanups.set(k, fn()); }); cells[k] = deps; } },
    };
    const slot = "ReactCurrentDispatcher" in internals ? internals.ReactCurrentDispatcher : null;
    const prior = slot ? slot.current : internals.H;
    if (slot) slot.current = dispatcher; else internals.H = dispatcher;
    let result;
    try { result = useLocation(); } finally { if (slot) slot.current = prior; else internals.H = prior; }
    if (commit) effects.forEach((fn) => fn());
    return result;
  }, unmount() { for (const fn of cleanups.values()) fn?.(); cleanups.clear(); } };
}
const publish = (value) => { snapshot = value; for (const listener of [...listeners]) listener(); };
const mirror = () => { for (const timer of timers.values()) if (timer.interval) timer.fn(); };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

ok(HALLOWEEN_AREAS.length >= 30 && HALLOWEEN_AREAS.every((area) => area.id && area.name && Number.isFinite(area.lat) && Number.isFinite(area.lng)), "free Florida area choices carry real centers");
ok(!HALLOWEEN_AREAS.some((area) => area.id === "honolulu"), "non-Florida catalog choices stay outside this page");
ok(halloweenLocationOrigin(null, "unknown") === null, "unknown area cannot invent an origin");
ok(halloweenLocationOrigin({ lat: "", lng: 0 }, "tampa")?.kind === "area", "invalid device coordinates cannot outrank a valid chosen area");
ok(HALLOWEEN_SORT_KEY === "wf_halloween_sort", "sort persistence is page scoped");
ok(renderer().render(false).origin === null, "SSR begins with no location claim");

const first = renderer(); first.render(); let state = first.render();
ok(state.origin === null && subscriptions === 0 && permissionQueries === 0, "mount never subscribes, asks permission or trusts unrelated wf_center");
ok(state.chooseArea("tampa") && stored.get(HALLOWEEN_AREA_KEY) === "tampa", "explicit area persists only its own page key");
state = first.render();
ok(state.origin?.kind === "area" && state.origin.label === "Tampa, FL (area center)", "chosen area is honestly labelled as a city center");
ok(state.chooseArea("new-york") === false && first.render().origin?.label === state.origin.label, "unknown choices cannot replace the selected center");
snapshot = { lat: 27.5, lng: -82.5 }; mirror(); state = first.render();
ok(state.origin?.kind === "device" && state.origin.lat === 27.5 && state.origin.label === "your current location", "a current actual device fix outranks the chosen city");
state.chooseArea("orlando"); state = first.render();
ok(state.origin?.kind === "device" && state.origin.lat === 27.5, "area choice never replaces a still-current device fix");
snapshot = null; mirror(); state = first.render();
ok(state.origin?.kind === "area" && state.origin.label.startsWith("Orlando,"), "device expiry falls back to the explicitly chosen area");
ok(subscriptions === 0 && permissionQueries === 0, "passive snapshot mirroring never prompts or refreshes GPS");

state.requestLocation(); await flush(); state = first.render();
ok(subscriptions === 1 && permissionQueries === 1 && listeners.size === 1 && state.status === "requesting", "only explicit button activation starts a device subscription");
publish({ lat: 28.1, lng: -82.2 }); state = first.render();
ok(state.status === "ready" && state.origin?.kind === "device" && !state.error, "fresh fix becomes the truthful origin and ends requesting status");
ok(![...timers.values()].some((timer) => !timer.interval), "successful location clears its request timeout");
permission.state = "denied"; for (const fn of [...permissionListeners]) fn(); state = first.render();
ok(state.status === "denied" && state.error.includes("blocked") && state.origin?.kind === "area", "revocation removes the device fix and explains the area fallback");
ok(listeners.size === 0 && permissionListeners.size === 0, "denial cancels this page's device and permission listeners");
permission.state = "granted";
state.requestLocation(); await flush(); const stale = [...listeners][0];
first.render().requestLocation(); await flush();
snapshot = { lat: 31, lng: -85 }; stale(); state = first.render();
ok(state.origin?.kind === "area", "a callback from a superseded request cannot replace the origin");
for (const [id, timer] of [...timers]) if (!timer.interval) { timers.delete(id); timer.fn(); }
state = first.render();
ok(state.status === "unavailable" && state.error.includes("try again") && listeners.size === 0, "timeout ends the request and leaves the area fallback available");
state.requestLocation(); const late = [...listeners][0]; first.unmount(); await flush();
late?.();
ok(listeners.size === 0 && permissionListeners.size === 0 && timers.size === 0, "unmount cancels watches, timers, permission listeners and late results");
const returning = renderer(); returning.render(); state = returning.render();
ok(state.origin?.kind === "area" && state.origin.label.startsWith("Orlando,"), "returning page restores its explicit area without GPS or a global search center");
returning.unmount();
ok(JSON.parse(stored.get("wf_center")).loc === "New York", "page never overwrites the global search location");
console.log(`test-halloween-location: OK — ${passed} assertions; actual hook lifecycle, no automatic prompt, device priority, area fallback, expiry, denial and cleanup`);
