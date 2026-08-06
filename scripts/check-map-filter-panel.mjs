#!/usr/bin/env node
// Lock for the map's compact filter panel (work order 2026-08-06, ticket 2).
//
// THE THING MOST LIKELY TO GO WRONG IS NOT THE PANEL — it is someone applying
// this styling to CategoryMenu itself. That component has FOUR call sites (the
// home feed, home's browse-in-place row, Itinerary, and the map), and two guards
// are pinned to its existing render: check-design requires the literal
// "#FFFFFF" idle lettering (owner call 2026-07-21) and check-ux bans the old
// borderRadius:22 chip strip. So the compact layout is a separate branch, and
// this asserts the shared path is still intact rather than only checking that
// the new one exists.
import { readFileSync } from "node:fs";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const home = strip(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
const map = strip(readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8"));

// ── the compact branch is opt-in, and only the map opts in ────────────────
ok(/compact\s*\}/.test(home) || /,\s*compact\s*\}/.test(home), "CategoryMenu no longer accepts a `compact` prop");
ok(/if \(compact\) \{[\s\S]{0,600}?wf-mapfp/.test(home), "the compact layout is not behind a branch — it would apply to every call site");
ok(/<CategoryMenu compact/.test(map), "the map does not request the compact panel");
const others = [...home.matchAll(/<CategoryMenu\b[^>]*/g)].map((m) => m[0]);
ok(others.length >= 2, `home.js renders ${others.length} CategoryMenu call sites — under 2 means this file is reading nothing`);
ok(others.every((t) => !/\bcompact\b/.test(t)), "a home.js call site opted into the compact layout — that reshapes the home feed");

// ── the shared render the other three screens depend on is untouched ──────
ok((home.match(/on \? C\.accent : "#FFFFFF"/g) || []).length >= 2, "the shared tiles lost their #FFFFFF idle lettering on the icon or the label (check-design owns this too)");
ok(/CATEGORY_TILES\.map/.test(home), "the shared category tiles are gone");

// ── the compact layout's own rules ───────────────────────────────────────
ok(/height:32px/.test(home), "category pills are not 32px");
ok(/border-radius:16px/.test(home), "category pills are not radius 16");
// The ban check-ux enforces, asserted here too so this file fails first with a
// message that explains WHY rather than leaving it to a cross-file guard.
ok(!/border-radius:22px/.test(home), "the compact pills adopted radius 22 — check-ux bans that shape for category strips");
ok(/\.wf-mapfp-tap\{[^}]*padding:6px 0/.test(home) && /\.wf-mapfp-subs \.wf-mapfp-tap\{padding:9px 0/.test(home),
  "touch targets come from height rather than padding — 32px+12 and 26px+18 are what reach 44px without growing the row");
ok(/\.wf-mapfp-fade\{[^}]*pointer-events:none/.test(home), "the scroll fade can swallow taps on the pill beneath it");
ok(/scroll-snap-type:x proximity/.test(home), "the pill rows do not scroll-snap");
ok(/prefers-reduced-motion: reduce/.test(home), "the subfilter transition is not disabled under reduced motion");
ok(/role="tablist"/.test(home) && /role="tab"/.test(home) && /aria-selected=/.test(home), "the pill rows are not a tablist");
ok(/ArrowRight/.test(home) && /ArrowLeft/.test(home), "arrow keys do not move between pills");
ok(/backdrop-filter:blur\(18px\) saturate\(140%\)/.test(home), "the panel is not translucent — the map should read underneath it");

// ── the subfilter row mounts only with a category, and resets on change ───
ok(/const open = !!\(activeCat && subs\.length > 1\)/.test(home), "the subfilter row is not conditional on a selected category");
ok(/\{open \?/.test(home), "the subfilter row renders unconditionally — it must MOUNT, not just hide");
ok(/setCat\(id\); setSub\("all"\)/.test(map), "switching category does not reset the sub-filter — a stale filter would carry across");

// ── ticket 2c: the seventh 'Search' tile is gone ─────────────────────────
ok(!/aria-label="Search"/.test(map), "the Search tile is back in the category row — there is a search bar directly above it");

if (bad) { console.error(`\ncheck-map-filter-panel: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-map-filter-panel: OK — ${n} assertions (compact layout is map-only and opt-in, the shared CategoryMenu render is intact, pills are 32px/r16 with 44px targets, subfilters mount only with a category)`);
