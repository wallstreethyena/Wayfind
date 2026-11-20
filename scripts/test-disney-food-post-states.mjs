// scripts/test-disney-food-post-states.mjs — a guide creator post (shared
// CheckedCreatorPost, used by the Disney food guide) never shows a blank (black)
// Instagram frame. Mounts the REAL CheckedCreatorPost + CreatorVideoPlayer
// in jsdom, drives real message events and a captured timer:
//   loading panel with source link → ignores wrong origin / wrong frame →
//   falls back to the source card on timeout → a late MOUNTED from the post's
//   own frame reveals it → "Reload post" returns to loading with focus kept.
// --red-prove: an origin-blind or frame-blind CheckedCreatorPost must fail.
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { flushSync } from "react-dom";
import { JSDOM } from "jsdom";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { readFileSync } from "node:fs";
import { DISNEY_FOOD_STOPS } from "../lib/guidesDisneyHolidayFood2026.js";

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://www.gowayfind.com/guides/disney-world-holiday-food-guide-2026", pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, MessageEvent: dom.window.MessageEvent });
const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = null; };
const fire = () => { const live = timers.filter((t) => t.fn); live.forEach((t) => { const f = t.fn; t.fn = null; f(); }); };

const { default: CheckedCreatorPost, CREATOR_POST_TIMEOUT_MS } = await loadComponent(path.resolve("app/components/CheckedCreatorPost.js"), process.cwd());
const post = DISNEY_FOOD_STOPS[0].posts[0];
const { createRoot } = await import("react-dom/client");

function run(variant, Component = CheckedCreatorPost) {
  document.getElementById("root").innerHTML = "";
  timers.length = 0;
  const root = createRoot(document.getElementById("root"));
  flushSync(() => root.render(React.createElement(Component, { post })));
  const fig = () => document.querySelector("[data-creator-post]");
  const state = () => fig().dataset.creatorPostState;
  const send = (data, origin, source) => flushSync(() => window.dispatchEvent(new MessageEvent("message", { data, origin, source })));
  const frame = () => fig().querySelector("iframe");
  assert.equal(state(), "idle");
  assert.equal(frame(), null, "no provider player (and no black frame) before the tap");
  flushSync(() => fig().querySelector("button").click());
  assert.equal(state(), "loading");
  assert.ok(frame(), "player is mounted (hidden) so Instagram can load");
  assert.equal(fig().querySelector("[inert]")?.contains(frame()), true, "hidden player is inert while loading");
  assert.match(fig().textContent, /Loading the reel from Instagram/);
  assert.ok(timers.some((t) => t.fn && t.ms === CREATOR_POST_TIMEOUT_MS), "fallback timer armed");
  const mounted = '{"details":{},"type":"MOUNTED"}';
  send(mounted, "https://evil.example", frame().contentWindow);
  assert.equal(state(), "loading", "message from another origin is ignored");
  send(mounted, "https://www.instagram.com", window);
  assert.equal(state(), "loading", "message from another frame is ignored");
  if (variant === "late") {
    flushSync(fire);
    assert.equal(state(), "unavailable", "no render signal → compact source card, not a black frame");
    assert.match(fig().textContent, /The post didn’t load here/);
    assert.ok([...fig().querySelectorAll("a")].some((a) => a.textContent === "Watch on Instagram ↗" && a.href === post.url));
  }
  send(mounted, "https://www.instagram.com", frame().contentWindow);
  assert.equal(state(), "ready", "the post's own frame reporting MOUNTED reveals it");
  assert.equal(fig().querySelector("[inert]"), null, "revealed player is interactive");
  flushSync(() => [...fig().querySelectorAll("button")].find((b) => b.textContent === "Reload post").click());
  flushSync(() => {});
  assert.equal(state(), "loading");
  assert.equal(document.activeElement?.textContent, "Watch on Instagram ↗", "focus lands on the loading panel's link");
  flushSync(() => root.unmount());
}

if (process.argv.includes("--red-prove")) {
  // Negative controls on the REAL component source: remove the origin check,
  // then the source-frame check; each mutant must fail this test.
  const dir = "app/components/";
  const src = readFileSync(dir + "CheckedCreatorPost.js", "utf8");
  const mutants = {
    "origin check removed": src.replace("if (event.origin !== IG_ORIGIN) return;", ""),
    "frame check removed": src.replace("if (!frame || event.source !== frame.contentWindow) return;", ""),
  };
  for (const [name, code] of Object.entries(mutants)) {
    assert.notEqual(code, src, "mutation applied: " + name);
    // Loaded in memory (jsxLoad sourceOverrides): nothing is written to the repo.
    const real = path.resolve(dir + "CheckedCreatorPost.js");
    const { default: Mutant } = await loadComponent(real, process.cwd(), { sourceOverrides: new Map([[real, code]]) });
    let caught = false;
    try { run("on-time", Mutant); } catch { caught = true; }
    assert.ok(caught, "red-prove: mutant with " + name + " must fail");
  }
  // Control: the unmutated source through the same override path passes.
  const real = path.resolve(dir + "CheckedCreatorPost.js");
  const { default: Same } = await loadComponent(real, process.cwd(), { sourceOverrides: new Map([[real, src]]) });
  run("on-time", Same);
  console.log("test-disney-food-post-states --red-prove: OK — CheckedCreatorPost without its origin check or its frame check fails the test");
  process.exit(0);
}
run("late");
run("on-time");
console.log("test-disney-food-post-states: OK — loading panel with source link, wrong origin and wrong frame ignored, timeout → source card, late MOUNTED reveals, reload keeps focus");
