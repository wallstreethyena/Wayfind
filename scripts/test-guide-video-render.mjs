#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = await loadComponent(path.join(REPO, "app/components/GuideVideoPreview.js"), REPO);
const Comp = mod.default;
const mk = (n) => Array.from({ length: n }, (_, i) => ({ name: `Stop ${i}`, category: "Spring", dayNumber: 1, photo: i % 2 ? null : { url: "/x.jpg", credit: "Someone" } }));
for (const n of [0, 1, 8]) {
  const html = renderToStaticMarkup(createElement(Comp, { slug: "test", title: "Hidden springs", city: "Ocala", days: 2, stops: mk(n) }));
  assert.ok(html.includes("<canvas") && html.includes('width="1080"') && html.includes('role="img"'), `canvas for ${n}`);
  assert.ok(html.includes("Play") && html.includes("Make video"), `buttons for ${n}`);
}
console.log("PASS guide video render: 0, 1 and 8 stops render to static markup");
