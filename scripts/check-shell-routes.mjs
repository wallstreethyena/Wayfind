// scripts/check-shell-routes.mjs — EVERY DOOR INTO THE APP SHELL OPENS ON A
// WHOLE PAGE.
//
// WHY (owner, 2026-08-20, with a screenshot of a homepage containing a header,
// one promo card and nothing else): "when i go back to the home page from
// different screens the amazon rail cards are gone ... no matter what i do i
// cannot get the amazon rail cards now ... when i click on the like button is
// when the issue with the main page shows up."
//
// Two facts met. (1) app/home.js renders its whole card surface as
// `railMenu ? <DaypartRail .../> : null` — server data or nothing, so a bad
// regeneration cannot paint an empty band. (2) app/p/[id]/page.js renders the
// SAME shell for share links and ?action= deep links and passed no railMenu.
//
// So /p/<id> was a homepage with its rails amputated — and because Home,
// Events, Coupons and Map are STATE inside that shell rather than routes,
// tapping Home from there kept the URL at /p/<id> and the rails never came
// back. Every route that renders <Home> must hand it the shell's server data.
// lib/homeShellData.js is that data; this guard is the rule.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let checks = 0, bad = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-shell-routes: FAIL — " + m); } };

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" ? [] : walk(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The shell is whatever app/home.js default-exports, found by IMPORT rather
// than by filename, so a route that imports it under another local name is
// still caught.
let routes = 0;
for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (rel === "app/home.js") continue;
  const src = strip(readFileSync(abs, "utf8"));
  const imp = src.match(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']*\/home["']/);
  if (!imp) continue;
  const local = imp[1];
  const rendered = new RegExp("<" + local + "\\b");
  if (!rendered.test(src)) continue;
  routes++;
  const el = src.slice(src.search(rendered));
  const end = el.indexOf("/>");
  const tag = end > 0 ? el.slice(0, end) : el;
  ok(/\brailMenu\s*=/.test(tag),
    `${rel}: renders the app shell without railMenu. app/home.js draws its entire card surface only when that prop is present, so this route serves a homepage with no rails — and every in-app destination is state inside the shell, so the reader cannot navigate out of it.`);
  ok(/homeShellData|railMenuData/.test(src),
    `${rel}: renders the shell but never resolves the shell's server data. Use lib/homeShellData.js so both entry points to the homepage show the same rails.`);
}

// At least the two known doors: "/" and "/p/[id]". A guard whose subject can
// vanish reports green by evaporating.
ok(routes >= 2, `expected at least 2 routes rendering the app shell, found ${routes} — either a door was deleted or this guard stopped recognising the import`);

if (bad) { console.error(`check-shell-routes: ${bad} failure(s)`); process.exit(1); }
console.log(`check-shell-routes: OK — ${checks} assertions across ${routes} shell routes`);
