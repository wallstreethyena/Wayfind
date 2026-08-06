#!/usr/bin/env node
// Lock for the map overlay controls (work order 2026-08-06, ticket 1).
//
// TWO THINGS THIS DEFENDS, and only one of them is visible in the UI:
//
// 1. THE COMPASS LISTENER. The control's handler was registered with
//    `addEventListener("deviceorientation", h, true)` — capture phase, on
//    window. Deleting the button while leaving the registration path behind
//    leaks a global listener on every Map visit, and nothing on screen would
//    show it. So this asserts the REGISTRATION is gone, not just the button.
//
// 2. THE EVENTS CONTROL IS FLAGGED, NOT DELETED. Removing it takes event pins
//    off the map, which is deliberate — Events is its own tab. But mapMode and
//    MapView's events/onSelectEvent props must survive untouched so restoring
//    it is one env var. A guard that only checked "the button is gone" would
//    pass just as happily after someone ripped the plumbing out.
import { readFileSync } from "node:fs";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
// Comments must not satisfy or trip any rule here — this guard's own prose
// mentions every symbol it forbids.
const code = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")   // JSX comment blocks
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const FILES = ["app/home.js", "app/components/screens/Map.js"];
const src = {};
for (const f of FILES) src[f] = code(readFileSync(new URL("../" + f, import.meta.url), "utf8"));
const all = Object.values(src).join("\n");

// ── 1. compass, gone at the registration level ────────────────────────────
ok(!/addEventListener\(\s*["']deviceorientation["']/.test(all),
  "a deviceorientation listener is registered again — the compass leak is back");
ok(!/removeEventListener\(\s*["']deviceorientation["']/.test(all),
  "deviceorientation cleanup code survives, so something still registers one");
for (const sym of ["compassOn", "toggleCompass", "compassNeedleRef", "compassHandlerRef", "stopCompass"]) {
  ok(!new RegExp("\\b" + sym + "\\b").test(all), `\`${sym}\` still exists — the compass was not fully removed`);
}
ok(!/Toggle compass heading/.test(all), "the compass control is still rendered");
// The cleanup effect that called stopCompass() must not survive as a dead
// reference — that would be a ReferenceError on every screen change.
ok(!/stopCompass\(\)/.test(all), "an effect still calls stopCompass(), which no longer exists");

// ── 2. events control is behind the flag, plumbing intact ─────────────────
const map = src["app/components/screens/Map.js"];
ok(/NEXT_PUBLIC_MAP_EVENTS/.test(map), "the events control is not gated by NEXT_PUBLIC_MAP_EVENTS");
ok(/MAP_EVENTS_ON\s*\?/.test(map), "the flag is defined but never used to gate the control");
// Absent env var must mean OFF. Asserted on the expression, not on behaviour we
// cannot execute here: a truthy-cast of an unset var must not enable it.
const flagLine = (map.match(/const MAP_EVENTS_ON[^\n]*/) || [""])[0];
ok(/===\s*["']1["']/.test(flagLine) || /===\s*["']true["']/.test(flagLine),
  `the flag is not an explicit opt-in — absent must be OFF (${flagLine.slice(0, 90)})`);
// The plumbing the flag is supposed to preserve.
ok(/events=\{/.test(map), "MapView no longer receives its `events` prop — the restore path is broken");
ok(/onSelectEvent=\{/.test(map), "MapView no longer receives `onSelectEvent` — the restore path is broken");
ok(/\bmapMode\b/.test(map) && /\bsetMapMode\b/.test(map), "mapMode/setMapMode were removed — restoring events would need code, not a flag");

// Both sides non-empty, or the file above proves nothing about what it reads.
ok(all.length > 2000 && /MapView/.test(map), "the sources did not load — every assertion above would pass vacuously");

if (bad) { console.error(`\ncheck-map-controls: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-map-controls: OK — ${n} assertions (compass gone at the registration level, not just the button; events control opt-in via NEXT_PUBLIC_MAP_EVENTS with MapView's props and mapMode intact)`);
