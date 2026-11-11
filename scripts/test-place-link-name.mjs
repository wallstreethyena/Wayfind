#!/usr/bin/env node
// scripts/test-place-link-name.mjs — a /p/{id} link in the address bar carries
// the place's name, so a link passed on from the browser previews with it.
//
// 2026-11-11: 4,548 /p pageviews in 30 days, none with ?t=; 20,957 of 24,359
// inventory names are past the 30-day window the link preview may use, so a
// bare link previewed as "A spot worth your time". lib/placeLinkName.js writes
// ?t=<name> once the place has opened. This guard runs the helper and checks
// that app/home.js calls it right after the deep-linked place opens, and that
// the preview still prefers a fresh stored name and falls back to ?t=.
//
// Hermetic: no env, no network, no writes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placePathWithName } from "../lib/placeLinkName.js";

let n = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };
const ok = (c, msg) => { assert.ok(c, msg); n++; };

const ID = "ChIJwTaQvXzxwogR3bHs7Q_MZ6A";
const place = { id: ID, name: "The Charles Hosmer Morse Museum of American Art" };

// The CALL.
eq(placePathWithName(`/p/${ID}`, "", place), `/p/${ID}?t=The+Charles+Hosmer+Morse+Museum+of+American+Art`, "A1 a bare place link gains the name");
const kept = new URL("https://x" + placePathWithName(`/p/${ID}`, "?utm_source=ig&r=4.8", place));
eq([kept.searchParams.get("utm_source"), kept.searchParams.get("r"), kept.searchParams.get("t")], ["ig", "4.8", place.name], "A2 every other parameter is kept");
eq(placePathWithName(`/p/${ID}`, "?t=Already", place), null, "A3 a link that already names the place is left alone");
eq(placePathWithName(`/p/OTHER`, "", place), null, "A4 a different place on the path is never renamed");
eq(placePathWithName(`/`, "?place=" + ID, place), null, "A5 only the /p route is touched");
eq(placePathWithName(`/p/${ID}/extra`, "", place), null, "A6 a deeper path is not a place link");
eq(placePathWithName(`/p/${ID}`, "", { id: ID, name: "   " }), null, "A7 no name, no change");
eq(placePathWithName(`/p/${ID}`, "", null), null, "A8 no place, no change");
eq(placePathWithName(`/p/%E0%A4%A`, "", place), null, "A9 a malformed id never throws");
const long = { id: ID, name: "A".repeat(200) };
eq(new URL("https://x" + placePathWithName(`/p/${ID}`, "", long)).searchParams.get("t").length, 80, "A10 the name is cut at 80 like the Share button");
eq(new URL("https://x" + placePathWithName(`/p/${ID}`, "", { id: ID, name: "Joe's  Crab\nShack" })).searchParams.get("t"), "Joe's Crab Shack", "A11 whitespace is tidied");

// The WIRING.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const home = strip(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
ok(/import\s*\{\s*placePathWithName\s*\}\s*from\s*"\.\.\/lib\/placeLinkName\.js"/.test(home), "B1 home.js imports placePathWithName");
ok(/openDetail\(opened\);\s*try\s*\{\s*const named = placePathWithName\(window\.location\.pathname, window\.location\.search, opened\);\s*if \(named\) window\.history\.replaceState\(/.test(home),
  "B2 the deep-linked place writes its name right after it opens");
const page = strip(readFileSync(new URL("../app/p/[id]/page.js", import.meta.url), "utf8"));
ok(/const t = identity\?\.name \|\| s\(searchParams\.t\) \|\|/.test(page), "B3 the preview prefers a fresh stored name, then ?t=");

console.log(`test-place-link-name: OK — ${n} assertions (helper 11 cases; home.js wiring; preview still reads ?t=)`);
