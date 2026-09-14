#!/usr/bin/env node
// scripts/test-shared-photo-lifecycle.mjs — FallbackImg URL-keyed outcomes.
//
// THE LIVE BUG (current main): FallbackImg resets `loaded` whenever `src` OR
// `fallbackSrc` changes. A loaded primary disappears when only the backup URL
// updates, because no second onLoad fires. Outcomes are not keyed by URL, and
// a cached img.complete image never becomes visible without onLoad. A stale
// onLoad from a previous src can mark the new src loaded.
//
// This guard EXECUTES the shipped FallbackImg through a deterministic
// hook/DOM host. No network, no IntersectionObserver, no hang timers, no
// eager promotion. Those belong to #1280 and are excluded here on purpose.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { imageDisplayState } from "../lib/imageState.js";

const source = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const start = source.indexOf("function FallbackImg(");
const end = source.indexOf("\n// v3.9:", start);
assert.ok(start > 0, "FallbackImg is declared in app/home.js");
assert.ok(end > start, "FallbackImg ends at the // v3.9: marker (ImgTile)");
const slice = source.slice(start, end);
assert.ok(/function FallbackImg\s*\(/.test(slice), "extracted slice is the FallbackImg declaration");

const js = ts.transpileModule(slice, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
}).outputText;
assert.ok(js.includes("FallbackImg"), "JSX transpile produced FallbackImg");

function host(initial, complete = false, width = 0) {
  let hooks = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let tree;
  let props = initial;
  const element = { complete, naturalWidth: width };
  const createElement = (type, nextProps, ...children) => ({
    type,
    props: nextProps || {},
    children,
  });
  const useState = (init) => {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = typeof init === "function" ? init() : init;
    return [hooks[i], (value) => {
      const next = typeof value === "function" ? value(hooks[i]) : value;
      if (next !== hooks[i]) {
        hooks[i] = next;
        dirty = true;
      }
    }];
  };
  const useRef = (init) => {
    const i = cursor++;
    return hooks[i] ||= { current: init };
  };
  const useEffect = (fn, deps) => {
    const i = cursor++;
    const old = hooks[i];
    if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
      effects.push(() => {
        old?.cleanup?.();
        hooks[i] = { deps, cleanup: fn() };
      });
    }
  };
  const Component = new Function(
    "React",
    "useState",
    "useRef",
    "useEffect",
    "imageDisplayState",
    "BrandedImageFallback",
    js + ";return FallbackImg;",
  )({ createElement }, useState, useRef, useEffect, imageDisplayState, "artwork");

  const img = () => (tree.children || []).find((n) => n && n.type === "img");
  const render = () => {
    let n = 0;
    do {
      assert.ok(++n < 20, "FallbackImg settles without a render loop");
      dirty = false;
      cursor = 0;
      effects = [];
      tree = Component(props);
      const node = img();
      if (node?.props.ref) node.props.ref.current = element;
      for (const effect of effects) effect();
    } while (dirty);
    return tree;
  };
  render();
  return {
    img,
    tree: () => tree,
    element,
    update(next) {
      props = next;
      render();
    },
    event(name) {
      const node = img();
      assert.ok(node && typeof node.props[name] === "function", `img has ${name}`);
      node.props[name]();
      render();
    },
  };
}

function opacityOf(h) {
  const node = h.img();
  assert.ok(node, "an <img> is mounted");
  return node.props.style.opacity;
}

// 1. Loaded primary + fallback-only update must stay visible.
//    THIS is the proven disappearing-image bug on current main.
{
  const h = host({ src: "primary.jpg", fallbackSrc: "backup-a.jpg" });
  assert.equal(opacityOf(h), 0, "unloaded primary starts hidden (positive control — probe can see opacity 0)");
  h.event("onLoad");
  assert.equal(opacityOf(h), 1, "primary onLoad reveals the image");
  h.update({ src: "primary.jpg", fallbackSrc: "backup-b.jpg" });
  assert.equal(
    opacityOf(h),
    1,
    "loaded primary + fallback-only update stays opacity 1 (current main resets loaded and hides it)",
  );
}

// 2. A cached-complete image (complete=true, naturalWidth>0) is visible
//    without waiting for a second onLoad.
{
  const h = host({ src: "cached.jpg" }, true, 640);
  assert.equal(
    opacityOf(h),
    1,
    "cached-complete image (complete=true, naturalWidth>0) becomes visible without onLoad",
  );
}

// 3. Primary error switches the img src to the backup.
{
  const h = host({ src: "dead.jpg", fallbackSrc: "backup.jpg" });
  h.event("onError");
  assert.equal(h.img().props.src, "backup.jpg", "primary error switches img src to backup");
  h.event("onLoad");
  assert.equal(opacityOf(h), 1, "backup onLoad reveals the backup image");
}

// Missing primary uses the backup URL (required activeSrc rule).
{
  const h = host({ src: null, fallbackSrc: "backup.jpg" });
  assert.equal(h.img().props.src, "backup.jpg", "missing primary uses backup as activeSrc");
}

// 4. Backup error reaches branded artwork fallback.
{
  const h = host({ src: "dead.jpg", fallbackSrc: "also-dead.jpg" });
  h.event("onError");
  assert.equal(h.img().props.src, "also-dead.jpg", "primary error reached backup before branded fallback");
  h.event("onError");
  assert.equal(h.tree().type, "artwork", "backup error reaches branded artwork fallback");
}

// 5. Stale onLoad from the old URL cannot reveal or corrupt the new src.
{
  const h = host({ src: "old.jpg" });
  const staleOnLoad = h.img().props.onLoad;
  assert.equal(typeof staleOnLoad, "function", "positive control: captured a real old-URL onLoad");
  h.update({ src: "new.jpg" });
  assert.equal(h.img().props.src, "new.jpg", "active src is the new URL");
  assert.equal(opacityOf(h), 0, "new unloaded src starts hidden");
  staleOnLoad();
  h.update({ src: "new.jpg" });
  assert.equal(
    opacityOf(h),
    0,
    "stale old-URL onLoad cannot reveal the new unloaded src (opacity stays 0)",
  );
}

assert.equal(
  host({ src: "primary.jpg" }).img().props.loading,
  "lazy",
  "loading stays lazy — this lock does not change loading policy",
);

console.log(
  "test-shared-photo-lifecycle: OK — fallback-only update, cached complete, primary→backup→branded, stale onLoad isolation",
);
