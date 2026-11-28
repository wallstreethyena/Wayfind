#!/usr/bin/env node
// scripts/check-this-week-fallback.mjs - the homepage "This week in Florida"
// strip is never blank after a deploy (2026-11-27, premium polish pass).
//
// The homepage is hourly ISR and `next build` reads no database, so a fresh
// deploy shipped the strip with no events until the page regenerated. Three
// parts close that, and this guard checks each one:
//   1. ThisWeekEvents (executed: compiled and rendered) shows a same-size
//      placeholder when the server sent fewer than two events, renders the
//      server cards untouched when it sent enough, and only paints fallback
//      cards that carry a slug, a name and a same-site link.
//   2. /api/events/this-week builds the SAME strip as app/page.js (the same
//      server read, the Christmas hub card only in front of two dated events),
//      marks "/" for regeneration when it finds a full strip, throttled.
//   3. middleware.js puts that route behind the same-origin + per-IP guard.
// The build-phase cache write itself is executed in check-homepage-events-deadline.mjs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
let pass = 0; const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

// ---- 1. the component, executed --------------------------------------------
const mod = await loadComponent(path.join(REPO, "app/components/ThisWeekEvents.js"), REPO);
const ThisWeekEvents = mod.default;
const { usableStripCards, THIS_WEEK_FALLBACK_URL } = mod;
ok(typeof ThisWeekEvents === "function" && typeof usableStripCards === "function", "ThisWeekEvents exports the component and usableStripCards");
ok(THIS_WEEK_FALLBACK_URL === "/api/events/this-week", "the fallback asks /api/events/this-week");

const card = (i, extra = {}) => ({ slug: "control-" + i, href: "/florida-events/control-" + i, name: "Control event " + i, when: "Sat", city: "Sarasota", image: null, ...extra });
// positive control: good cards pass
ok(usableStripCards([card(1), card(2)]).length === 2, "two well formed cards pass the check");
ok(usableStripCards([card(1, { href: "/christmas-in-florida", hub: true })]).length === 1, "the hub card's same-site link passes");
// negative controls: each broken shape is dropped
const bad = [null, "x", card(3, { href: "https://evil.example/x" }), card(4, { href: "//evil.example" }), card(5, { href: "javascript:alert(1)" }),
  card(6, { slug: "" }), card(7, { name: "" }), card(8, { href: 7 }), { slug: "a", name: "b" }];
ok(usableStripCards(bad).length === 0, "off-site, protocol-relative, script, nameless, slugless and linkless cards are all dropped (" + bad.length + " shapes)");
ok(usableStripCards(undefined).length === 0 && usableStripCards({}).length === 0, "a non-array answer paints nothing");

const realFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (...args) => { fetchCalls++; return new Promise(() => {}); };
try {
  const full = renderToStaticMarkup(createElement(ThisWeekEvents, { events: [card(1), card(2)], guide: null }));
  ok(full.includes("Control event 1") && full.includes("Control event 2") && full.includes('href="/florida-events/control-1"') && !full.includes("data-this-week-loading"),
    "two server events render as cards, with no placeholder");
  const empty = renderToStaticMarkup(createElement(ThisWeekEvents, { events: [], guide: null }));
  ok(empty.includes("data-this-week-loading") && empty.includes('aria-busy="true"') && empty.includes("This week in Florida") && (empty.match(/flex:0 0 168px/g) || []).length === 3,
    "no server events render the same-size placeholder (three 168px cards), never nothing");
  const one = renderToStaticMarkup(createElement(ThisWeekEvents, { events: [card(1)], guide: null }));
  ok(one.includes("data-this-week-loading") && !one.includes("Control event 1"), "a single server event waits for the fallback instead of painting a one-card strip");
  ok(fetchCalls === 0, "server render never calls fetch (effects run only in the browser)");
} finally { globalThis.fetch = realFetch; }

const comp = strip(read("app/components/ThisWeekEvents.js"));
ok(/useEffect\(\(\) => \{\s*if \(serverFull\) return undefined;/.test(comp), "the browser fetch is skipped whenever the server strip is already full");
ok(/fetch\(THIS_WEEK_FALLBACK_URL/.test(comp) && /setTimeout\(\(\) => \{ try \{ ctrl && ctrl\.abort\(\); \} catch \{\} \}, FALLBACK_TIMEOUT_MS\)/.test(comp) && /dead = true/.test(comp), "the fallback fetch has a timeout and ignores a late answer after unmount");
ok(/usableStripCards\(body && body\.events\)/.test(comp), "fallback cards go through the same shape check before painting");

// ---- 2. the route builds the same strip as the homepage -------------------
const route = strip(read("app/api/events/this-week/route.js"));
const page = strip(read("app/page.js"));
ok(/import \{ thisWeekEventsForHome \} from "[./]+lib\/thisWeekEventsServer\.js"/.test(route) && /await thisWeekEventsForHome\(today\)/.test(route),
  "the route uses the homepage's own server read (thisWeekEventsForHome)");
ok(/hub && rows\.length >= 2 \? \[hub, \.\.\.rows\] : rows/.test(route) && /christmasHubCard && thisWeekRows\.length >= 2 \? \[christmasHubCard, \.\.\.thisWeekRows\]/.test(page),
  "the route and app/page.js use the same hub card rule (only in front of two dated events)");
ok(/christmasHubStripCard\(today\)/.test(route) && /const today = siteTodayStr\(\)/.test(route), "the route dates the hub card with the site's Eastern day");
ok(/if \(full && Date\.now\(\) - lastHealAt > HEAL_EVERY_MS\)/.test(route) && /revalidatePath\("\/"\)/.test(route) && /HEAL_EVERY_MS = 10 \* 60 \* 1000/.test(route),
  "a full strip marks the homepage for regeneration, at most once per ten minutes per instance");
ok((route.match(/revalidatePath\(/g) || []).length === 1, "the route revalidates exactly one path");
ok(/s-maxage=300/.test(route) && /s-maxage=60/.test(route), "a full answer is CDN cached for five minutes, an empty one for one minute");

// ---- 3. middleware guard ---------------------------------------------------
const mw = strip(read("middleware.js"));
const matcher = mw.slice(mw.indexOf("matcher: ["), mw.indexOf("]", mw.indexOf("matcher: [")));
ok(matcher.length > 100 && matcher.includes('"/api/events/this-week"'), "middleware matches /api/events/this-week (same-origin + per-IP guard)");

if (fail.length) { console.error("check-this-week-fallback: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`check-this-week-fallback: OK - ${pass} assertions (component compiled and rendered; route and middleware read from source)`);
