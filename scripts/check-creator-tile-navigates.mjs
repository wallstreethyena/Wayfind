#!/usr/bin/env node
/**
 * check-creator-tile-navigates — the one rail whose answer is a PAGE opens it.
 *
 * Owner, 2026-08-30: "the page for cindy when you click on it is not showing up
 * either." The page had been live and returning 200 the whole time; the tile
 * simply never went there. DaypartRail.tileClick preventDefaults every anchor
 * and opens the in-rail drop instead — right for the rails whose answer IS a
 * shelf of place cards, wrong for the one whose answer is a person's page.
 *
 * WHAT THIS ASSERTS, and why each one is here rather than a grep:
 *
 *  · The ORDER inside tileClick. `return` on opensPage must come BEFORE
 *    preventDefault(). Both lines existing proves nothing — a return placed
 *    after the preventDefault leaves the navigation cancelled and the reader
 *    exactly where they were, which is the bug wearing the fix's clothes. This
 *    is a position check, so it is done on offsets in the stripped source.
 *
 *  · The destination RESOLVES. railHref() is CALLED, and the href it returns is
 *    matched against creatorSlugs() — the same set generateStaticParams()
 *    prerenders. With dynamicParams=false anything else is a hard 404, and a
 *    tile pointing at a 404 is worse than the drop it replaced.
 *
 *  · The opt-in stays NARROW. Every tile on this rail has an href, so a
 *    heuristic on "has an href" would have navigated all fifteen and deleted the
 *    drop interaction the owner designed. opensPage is asserted to be a small,
 *    deliberate set, and every member of it is asserted to be a real page.
 *
 * Red-proved by moving the return below preventDefault (goes red on order), by
 * deleting opensPage from the rail (red on the set), and by pointing the href
 * at a handle with no page (red on resolution).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const { RAILS } = await import("../lib/rails.js");
const { railHref } = await import("../lib/dayparts.js");
// lib/creatorPages.js contains JSX, so bare node cannot import it — loaded
// through the same compiler test-creator-pages uses. creatorSlugs() is CALLED
// rather than re-derived here: a second copy of "who gets a page" is exactly
// the drift that would let this guard bless a 404.
const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { creatorSlugs } = await loadComponent(fileURLToPath(new URL("../lib/creatorPages.js", import.meta.url)), REPO);
const rail = strip(readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8"));

const slugs = creatorSlugs();
ok(slugs.length > 0, "positive control: creatorSlugs() returns a real prerendered set — an empty one makes the resolution checks below vacuous");

const pageRails = RAILS.filter((r) => r && r.opensPage);
ok(pageRails.length >= 1, "no rail opts into navigation — the creator tile is back to opening a drop");
ok(pageRails.length <= 3, `opensPage has spread to ${pageRails.length} rails — this is an opt-in for rails whose answer is a PAGE, not a way to stop building drops`);

for (const r of pageRails) {
  ok(typeof r.href === "string" && r.href.startsWith("/"),
    `rail "${r.id}" opts into navigation with no same-origin href — the click would preventDefault into nothing`);
  // CALLED, because railHref is what the tile actually renders. A regional rail
  // rewrites its own href, and asserting r.href would miss that entirely.
  const dest = railHref(r, null, null);
  ok(typeof dest === "string" && dest.length > 1, `rail "${r.id}": railHref() returns no destination`);
  const m = /^\/creators\/([^/?#]+)$/.exec(String(dest || ""));
  if (m) {
    const handle = decodeURIComponent(m[1]);
    ok(slugs.includes(handle),
      `rail "${r.id}" points at /creators/${handle}, which generateStaticParams() does not prerender — with dynamicParams=false that is a hard 404`);
  } else {
    ok(dest.startsWith("/"), `rail "${r.id}": destination "${dest}" is not an in-app path`);
  }
}

// ── the ORDER inside tileClick ──────────────────────────────────────────────
const body = rail.slice(rail.indexOf("const tileClick"));
ok(body.length > 200, "positive control: tileClick was found in DaypartRail.js");
const iReturn = body.search(/if \(_r && _r\.opensPage\) return;/);
const iPrevent = body.search(/e\.preventDefault\(\)/);
ok(iReturn !== -1, "tileClick no longer honours opensPage — every tile is back to opening a drop");
ok(iPrevent !== -1, "positive control: tileClick still calls preventDefault for the rails that DO open a drop");
ok(iReturn !== -1 && iPrevent !== -1 && iReturn < iPrevent,
  "the opensPage return sits AFTER preventDefault() — the navigation is cancelled before the check runs, which is the original bug with a check bolted on");

// The modifier-key escape hatch must still precede both: a cmd-click on ANY
// tile has to stay a new tab, and that is a property of the branch order too.
const iMod = body.search(/e\.metaKey \|\| e\.ctrlKey/);
ok(iMod !== -1 && iMod < iReturn, "the modifier-key passthrough no longer runs first — cmd-click would stop opening a new tab");

// And the anchor itself must still be a real link, or none of the above matters.
ok(/<a className="wf8-tlink" href=\{href\}/.test(rail),
  "the tile is no longer a real <a href> — a crawler, a shared card and a middle-click all lose their destination");

if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`check-creator-tile-navigates: FAIL — ${bad.length}/${n} assertions`);
  process.exit(1);
}
console.log(`check-creator-tile-navigates: OK — ${n} assertions (${pageRails.length} rail(s) navigate: ${pageRails.map((r) => r.id).join(", ")}; destinations resolved against ${slugs.length} prerendered creator slugs; branch ORDER inside tileClick asserted on offsets, not presence)`);
