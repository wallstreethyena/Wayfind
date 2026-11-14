#!/usr/bin/env node
// scripts/check-event-not-found-recovery.mjs: ended or missing event pages
// show live options (not a dead end) while the status stays a real 404.
// EXECUTED, not grepped: both not-found boundaries are compiled with jsxLoad
// and rendered; the markup must carry the recovery heading and links to
// /christmas-in-florida and /events. Both boundaries and the shared component
// must stay free of fetch / cookies / headers (comments stripped first), so
// nothing turns dynamic or no-store. Positive control: the stripper must still
// see the real "export default" in each file.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const FILES = {
  events: "app/events/[city]/[slug]/not-found.js",
  florida: "app/florida-events/[slug]/not-found.js",
  shared: "app/components/EventNotFoundRecovery.js",
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const [name, rel] of Object.entries(FILES)) {
  const abs = path.join(ROOT, rel);
  ok(existsSync(abs), `${rel} exists`);
  if (!existsSync(abs)) continue;
  const code = stripComments(readFileSync(abs, "utf8"));
  ok(/export default function/.test(code), `${name}: positive control, stripped source still has its default export`);
  ok(!/\bfetch\s*\(/.test(code), `${name}: no fetch( call`);
  ok(!/\bcookies\b|\bheaders\b|next\/headers/.test(code), `${name}: no cookies/headers usage`);
  ok(!/["']use client["']/.test(code), `${name}: stays a server component`);
  ok(!/dynamic\s*=|revalidate\s*=|no-store/.test(code), `${name}: no dynamic/no-store opt-in`);
}

for (const name of ["events", "florida"]) {
  const abs = path.join(ROOT, FILES[name]);
  if (!existsSync(abs)) continue;
  const mod = await loadComponent(abs, ROOT);
  const html = renderToStaticMarkup(React.createElement(mod.default));
  ok(/This event has wrapped or moved/.test(html), `${name}: renders the recovery heading`);
  ok(/See what's on now|See what&#x27;s on now/.test(html), `${name}: renders the "See what's on now" line`);
  ok(/href="\/christmas-in-florida"/.test(html), `${name}: links to /christmas-in-florida`);
  ok(/href="\/events"/.test(html), `${name}: links to /events`);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  ok(hrefs.length >= 3 && hrefs.length <= 4, `${name}: 3 or 4 link cards (${hrefs.length})`);
  ok(hrefs.every((h) => h.startsWith("/") && !h.startsWith("//")), `${name}: internal links only`);
  for (const h of hrefs) {
    const dir = path.join(ROOT, "app", h.slice(1));
    ok(existsSync(path.join(dir, "page.js")), `${name}: route ${h} exists in app/`);
  }
}

// the florida-events page must still call notFound() (otherwise the boundary is dead)
const fp = stripCommentsSafe(readFileSync(path.join(ROOT, "app/florida-events/[slug]/page.js"), "utf8"));
function stripCommentsSafe(s) { return stripComments(s); }
ok(/\bnotFound\(\)/.test(fp), "florida-events/[slug]/page.js still calls notFound()");

console.log(fail ? `check-event-not-found-recovery: ${fail} FAILED, ${pass} passed` : `check-event-not-found-recovery: OK (${pass} assertions; 2 boundaries rendered, 3 files scanned for fetch/cookies/headers)`);
process.exit(fail ? 1 : 0);
