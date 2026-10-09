// scripts/check-route-shim-handoff.mjs
//
// 2026-10-08 PERF: /events, /map, /favorites, /itinerary and /coupons are thin
// route shims that hand off to the app shell (app/components/GoScreen.js). The
// hand-off ran in a useEffect, i.e. only after the shim's own JS downloaded and
// hydrated: measured ~2.1 s at 390px, 4x CPU, fast 4G before the shell even
// started loading, on the Events path the owner timed at ~8 s to first card.
// The hand-off now also runs as an inline script while the HTML parses.
//
// CALLED: GoScreen is rendered to markup and its inline script is EXECUTED in
// a sandbox with a fake location, asserting the exact target (query carried).
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };
const REPO = fileURLToPath(new URL("..", import.meta.url));
const GoScreen = (await loadComponent(fileURLToPath(new URL("../app/components/GoScreen.js", import.meta.url)), REPO)).default;

const run = (screen, search) => {
  const html = renderToStaticMarkup(React.createElement(GoScreen, { screen }));
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) return { html, target: null };
  let target = null;
  const location = { search, replace: (u) => { target = u; } };
  vm.runInNewContext(m[1], { location, encodeURIComponent });
  return { html, target };
};
const a = run("events", "?lat=27.34&lng=-82.53&date=2026-10-31");
ok(a.target === "/?go=events&lat=27.34&lng=-82.53&date=2026-10-31", `the inline hand-off runs during parse and carries the query (got ${a.target})`);
const b = run("saved", "");
ok(b.target === "/?go=saved", `no query: plain hand-off (got ${b.target})`);
ok((a.html.match(/<script>/g) || []).length === 1, "exactly one inline hand-off script");
// Positive control: the extraction finds a known inline script.
ok(/<script>([\s\S]*?)<\/script>/.test("<div><script>location.replace('/x')</script></div>"), "positive control: the probe finds an inline script in known markup");

if (fail.length) {
  console.error(`check-route-shim-handoff: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-route-shim-handoff: OK — ${pass} assertions; GoScreen rendered and its inline hand-off EXECUTED in a sandbox (target and query carried)`);
