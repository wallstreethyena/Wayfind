#!/usr/bin/env node
// scripts/check-food-list-continuation.mjs — 2026-09-23. A capped first page
// is only safe when the reader can reach the rest of it. lib/inventoryServe.js
// now pages the DATABASE exhaustively (see check-inventory-serve-complete-
// read.mjs / check-ryans-cafe-sentinel.mjs); this guard is the CLIENT half —
// the Food/category list's "Wayfind 5 more spots" control must actually walk
// the server's offset pages once the loaded rows run out, through the SAME
// control (no new UI element), and the map beside it must never show fewer
// pins than the list it sits next to.
//
// STRUCTURAL-ONLY: app/home.js's PageInner is a 12,000+ line component with
// a huge live/context/effect dependency graph; scripts/lib/jsxLoad.mjs cannot
// render it in isolation (nothing in this suite does — check-narrow-chip-
// inventory.mjs and check-map-place-card.mjs take the same source-regex
// approach against the same two files, for the same reason). Every pattern
// below is an exact code shape (identifiers, call sites, JSX text), not prose
// a comment could plausibly contain, and each one was red-proved by breaking
// the code it protects (see the commit that added this file).
import { readFileSync } from "node:fs";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

// app/home.js is ~800KB of real JSX/JS; a comment-stripping pass tuned for
// smaller files runs away on it (an unbalanced-looking `/*`/`*/` sequence
// somewhere in 12,000+ lines eats real code between two unrelated markers —
// measured: it drops the file from 829,397 to 510,421 bytes and silently
// swallows loadMoreInventory along with it). So HOME is matched RAW; every
// pattern below is an exact code shape (identifiers + punctuation), not prose
// a comment could plausibly contain, so stripping buys nothing here and cost
// a false "missing" on working code.
const HOME = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../app/api/places/search/route.js", import.meta.url), "utf8");
const VIEW = strip(readFileSync(new URL("../app/components/MapView.js", import.meta.url), "utf8"));

ok(HOME.length > 100000, "app/home.js did not load — every assertion below would pass vacuously");

// ── 1. THE ROUTE actually reports paging metadata (so the client's j.hasMore
// reads a real field, not undefined-is-falsy-by-accident). ──
ok(/total:\s*meta\.eligible/.test(ROUTE) || /total,\s*hasMore,\s*truncated/.test(ROUTE) || /hasMore:/.test(ROUTE),
  "the inv=1 route response no longer reports hasMore — the client cannot know there is a next page");
ok(/hasMore:\s*meta\.offset \+ meta\.served < meta\.eligible/.test(ROUTE),
  "hasMore is not derived from meta.offset + meta.served < meta.eligible — the exact formula the paged-read meta was built to answer");
ok(/withMeta:\s*true/.test(ROUTE), "the inv=1 route no longer asks serveFromInventory for withMeta — it would have no meta to report hasMore from");

// ── 2. THE CLIENT — cross-render state that survives a re-render without
// re-triggering one, per this repo's own useRef convention for such state. ──
ok(/invMoreRef\s*=\s*useRef\(\s*\{\s*hasMore:\s*false,\s*offset:\s*0,\s*cat:\s*null,\s*sub:\s*null,\s*m:\s*null,\s*centerKey:\s*null\s*\}\s*\)/.test(HOME),
  "invMoreRef (the paging cursor for the Food/category list) is missing or its shape changed");
ok(/invMoreLoadingRef\s*=\s*useRef\(false\)/.test(HOME),
  "invMoreLoadingRef (in-flight guard against a double-tap firing two page fetches) is missing");

// ── 3. THE FETCH — _invAll must accept and forward an offset, and must read
// hasMore back off the response into invMoreRef so the button knows there is
// more to load. ──
ok(/_invAll\s*=\s*async\s*\(m,\s*offset\s*=\s*0\)\s*=>/.test(HOME),
  "_invAll no longer takes an offset parameter — the first page can no longer be followed by a second");
ok(/\$\{offset \? `&offset=\$\{offset\}` : ""\}/.test(HOME),
  "_invAll's inventory fetch no longer forwards &offset= to the route");
ok(/invMoreRef\.current\s*=\s*\{\s*hasMore:\s*!!j\.hasMore,\s*offset:\s*offset \+ raw\.length,/.test(HOME),
  "_invAll no longer records hasMore/offset from the route response into invMoreRef");

// ── 4. THE CONTINUATION — loadMoreInventory fetches the NEXT offset page
// through the identical &sub=/&cat= shape, dedupes by id (a re-fetch must
// never duplicate a row already on screen), and appends rather than replaces. ──
ok(/const loadMoreInventory = async \(\) => \{/.test(HOME),
  "loadMoreInventory is missing — nothing walks the server's offset pages once the loaded rows run out");
ok(/meta\.hasMore/.test(HOME) && /!meta\.hasMore/.test(HOME),
  "loadMoreInventory does not check meta.hasMore before fetching — it would fetch past the end of the eligible set");
ok(/&offset=\$\{meta\.offset\}/.test(HOME),
  "loadMoreInventory's fetch does not carry the server's own next offset");
ok(/const seen = new Set\(\(prev \|\| \[\]\)\.map\(\(p\) => p && p\.id\)\)/.test(HOME) && /const add = mapped\.filter\(\(p\) => p && p\.id && !seen\.has\(p\.id\)\)/.test(HOME),
  "loadMoreInventory does not dedupe the new page against what is already loaded — a re-fetch could duplicate a card");
ok(/setPlaces\(\(prev\) => \{/.test(HOME) && /\[\.\.\.prev, \.\.\.add\]/.test(HOME),
  "loadMoreInventory does not APPEND the new page onto the existing list — pagination must not discard what is already on screen");

// ── 5. THE WIRING — the SAME "Wayfind 5 more spots" control does double duty:
// reveal already-loaded rows first, then walk to the server for more. No
// second control is introduced. ──
ok(/const invMoreCanContinue = !!\(invMoreRef\.current/.test(HOME),
  "invMoreCanContinue is missing — the render condition has no way to know a server page is still available once every loaded row is revealed");
ok(/restView\.length > visibleCount \|\| invMoreCanContinue/.test(HOME),
  "the \"Wayfind 5 more spots\" control's render condition no longer keeps itself mounted when there is a server page left to fetch");
ok(/if \(restView\.length > visibleCount\) setVisibleCount\(\(c\) => c \+ 5\); else loadMoreInventory\(\);/.test(HOME),
  "the control's onClick no longer falls through to loadMoreInventory() once every loaded row is revealed");
// Raw-source match, so count only the lines that are not `//` comments (this
// file's header explains why a blanket strip is unsafe here) — several lines
// reference the control's name in prose, and only one may actually render it.
const buttonTextLines = HOME.split("\n").filter((line) => {
  const idx = line.indexOf("Wayfind 5 more spots");
  if (idx < 0) return false;
  const before = line.slice(0, idx);
  return !before.includes("//"); // a `//` anywhere before the match on its own line makes the match a comment, whether the line starts with it or the comment merely trails real code
});
ok(buttonTextLines.length === 1,
  `"Wayfind 5 more spots" renders on ${buttonTextLines.length} line(s) outside comments — pagination must reuse the SAME control, never add a second one`);

// ── 6. THE MAP beside the list must never show fewer pins than the list
// itself now that the list can page past its old ceiling. ──
ok(/const ranked = \(places \|\| \[\]\)\.filter\(\(p\) => p && p\.lat != null && p\.lng != null\);/.test(VIEW) &&
   !/const ranked = \(places \|\| \[\]\)\.filter\([^)]*\)\.slice\(/.test(VIEW),
  "MapView caps pin membership below the list again — see check-map-place-card.mjs for the full pin-density contract");

if (bad) { console.error(`\ncheck-food-list-continuation: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-food-list-continuation: OK — ${n} assertions (the Food/category list walks the server's offset pages through the SAME control, deduped and appended, and the map beside it stays uncapped)`);
