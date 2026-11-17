#!/usr/bin/env node
// check-photo-rail-swipe — owner report 2026-11-16 (Enchant Christmas St.
// Petersburg, iPhone): "the horizontal slide is not smooth, you cannot click to
// enlarge the pictures, and there is no indication the user can slide or that
// there are more pictures. This is everywhere."
//
// Root cause: the shared event hero rail (EventDetailShell, used by every
// /florida-events, /events and /movies detail page) rendered a FULL-WIDTH first
// photo followed by 216px photos under `scroll-snap-type:x proximity`, so the
// first photo hid all the others and swipes landed between mixed widths. There
// was no viewer and no counter/dots. Place detail rails had a viewer for one
// photo at a time and no position indicator.
//
// This guard locks the fix by CALLING the shipped logic, not grepping it:
//   1. railIndex / collectRailPhotos run against a fake rail and must pick the
//      right slide, skip fallback tiles and broken images, skip a movie poster's
//      blurred backdrop, and carry credits (per-photo, else the hero credit).
//   2. The shared hero CSS: mandatory snap, one photo per swipe, uniform width
//      with a peek, lone photo full width, room for the dots.
//   3. Wiring: the shell mounts the controls right after the rail; the controls
//      and the place header open PhotoLightbox and show RailCount/RailDots.
// Red-proved: reverting any of those trips the matching assertion.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
let passed = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else failures.push(msg); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// ── 1. Run the real functions against a fake rail ───────────────────────────
// The shipped modules, compiled by the shared JSX loader (real imports, real React).
const indicators = await loadComponent(path.join(REPO, "app/components/PhotoRailIndicators.js"), REPO);
const controls = await loadComponent(path.join(REPO, "app/components/EventPhotoRailControls.js"), REPO);
const Shell = (await loadComponent(path.join(REPO, "app/components/EventDetailShell.js"), REPO)).default;
ok(typeof indicators.railIndex === "function" && typeof controls.collectRailPhotos === "function",
  "PhotoRailIndicators.railIndex and EventPhotoRailControls.collectRailPhotos are exported functions");

// The shell's real server render: rail, then the controls mount point, then the credit.
const html = renderToStaticMarkup(createElement(Shell, {
  title: "Fixture", facts: [], actions: null,
  media: createElement("div", { className: "wf-event-photo" }, createElement("img", { src: "/a.jpg", alt: "a" })),
  credit: createElement("p", { "data-event-hero-credit": "" }, "Photo: fixture."),
}));
const railPos = html.indexOf('class="wf-event-photo-rail"'), ctlPos = html.indexOf("data-event-rail-controls"), credPos = html.indexOf("data-event-hero-credit");
ok(railPos > 0 && ctlPos > railPos && credPos > ctlPos, "server render: rail, then rail controls, then the credit line");
ok(!/data-photo-rail-count|data-photo-lightbox/.test(html), "server render adds no counter or viewer before hydration (no hydration mismatch)");

class FakeEl {
  constructor(tag, { cls = "", attrs = {}, text = "", children = [], complete = true, naturalWidth = 640, currentSrc = "" } = {}) {
    Object.assign(this, { tag, cls, attrs, textContent: text, children, nodeType: 1, complete, naturalWidth, currentSrc });
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  *all() { for (const c of this.children) { yield c; yield* c.all(); } }
  matches(sel) {
    return sel.split(",").some((s) => {
      s = s.trim();
      const not = s.match(/^(\w+):not\(\.([\w-]+)\)$/);
      if (not) return this.tag === not[1] && !this.cls.split(" ").includes(not[2]);
      if (s.startsWith(".")) return this.cls.split(" ").includes(s.slice(1));
      if (s.startsWith("[")) return s.slice(1, -1) in this.attrs;
      return this.tag === s;
    });
  }
  querySelector(sel) { for (const n of this.all()) if (n.matches(sel)) return n; return null; }
}
const img = (src, o = {}) => new FakeEl("img", { attrs: { src, alt: o.alt || "alt " + src }, cls: o.cls || "", complete: o.complete ?? true, naturalWidth: o.naturalWidth ?? 640 });
const slide = (...kids) => new FakeEl("div", { cls: "wf-event-photo", children: kids });
const credit = (t) => new FakeEl("span", { cls: "wf-event-photo-credit", text: t });

// railIndex: slides 300px apart, rail 348px wide, 6 slides.
const mkRail = (scrollLeft, n = 6) => {
  const kids = Array.from({ length: n }, (_, i) => Object.assign(slide(img("/p" + i + ".jpg")), { offsetLeft: 20 + i * 308 }));
  return { children: kids, scrollLeft, clientWidth: 348, scrollWidth: 20 + n * 308 };
};
ok(indicators.railIndex(mkRail(0)) === 0, "railIndex: unscrolled rail is on photo 1");
ok(indicators.railIndex(mkRail(308)) === 1, "railIndex: one snap in is photo 2");
ok(indicators.railIndex(mkRail(470)) === 2, "railIndex: nearest slide wins mid-swipe");
ok(indicators.railIndex({ ...mkRail(0), clientWidth: 600, scrollLeft: 6 * 308 + 20 - 600 }) === 5, "railIndex: scrolled to the end is the last photo even when it cannot reach the left edge");
ok(indicators.railIndex({ children: [], scrollLeft: 0, clientWidth: 0, scrollWidth: 0 }) === 0, "railIndex: empty rail is safe");

// collectRailPhotos: credits, fallback tiles, broken images, movie backdrop.
const heroCredit = new FakeEl("p", { attrs: { "data-event-hero-credit": "" }, text: "Photo: Visit St. Pete." });
const media = new FakeEl("div", { children: [heroCredit] });
const rail = {
  children: [
    slide(img("/hero.jpg")),                                                        // credit from the hero line
    slide(new FakeEl("div", { cls: "wf-event-photo-fallback" })),                  // tile, no photo
    slide(img("/two.jpg"), credit("Photo: Creative Loafing Tampa (opens in a new tab)")),               // own credit
    slide(img("/broken.jpg", { complete: true, naturalWidth: 0 })),                // failed image
    slide(img("/bg.jpg", { cls: "wf-movie-bg" }), img("/art.jpg", { cls: "wf-movie-art" })), // poster
  ],
};
const got = controls.collectRailPhotos(rail, media);
ok(got.length === 3, `collectRailPhotos keeps only rendered photos (got ${got.length}, want 3)`);
ok(got[0]?.src === "/hero.jpg" && got[0]?.credit === "Photo: Visit St. Pete.", "first photo carries the hero credit into the viewer");
ok(got[1]?.src === "/two.jpg" && got[1]?.credit === "Photo: Creative Loafing Tampa", "a photo's own credit travels with it");
ok(got[2]?.src === "/art.jpg", "movie poster opens the poster art, not the blurred backdrop");
ok(got[1]?.slide === rail.children[2], "each photo keeps its slide so a tap opens the tapped photo");
ok(controls.collectRailPhotos({ children: [] }, null).length === 0, "empty rail yields no viewer photos");

// ── 2. Shared hero CSS ──────────────────────────────────────────────────────
const css = read("app/components/EventExperienceStyles.js");
const rule = (sel) => (css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{[^}]*\\}")) || [""])[0];
const railRule = rule(".wf-event-photo-rail");
ok(/scroll-snap-type:x mandatory/.test(railRule) && !/proximity/.test(railRule), "rail snaps one photo per swipe (mandatory, not proximity)");
ok(/scrollbar-width:none/.test(railRule) && css.includes(".wf-event-photo-rail::-webkit-scrollbar{display:none}"), "rail hides the desktop scrollbar strip");
ok(/scroll-snap-stop:always/.test(rule(".wf-event-photo")), "a fast flick stops at the next photo instead of skipping several");
ok(css.includes(".wf-event-hero .wf-event-photo-rail{padding:0;gap:0;") && css.includes(".wf-event-hero .wf-event-photo{height:clamp(240px,42vw,440px);flex:0 0 100%;width:100%"), "every hero photo fills the card on its own: no photo is cut off at the edge (owner follow-up 2026-11-16)");
ok(css.includes(".wf-event-hero .wf-event-photo:only-child{flex:0 0 100%;width:100%}"), "a lone hero photo still fills the card");
ok(!/\.wf-event-hero \.wf-event-photo:first-child\{flex:0 0 100%/.test(css), "no full-width FIRST photo that hides the rest");
ok(css.includes(".wf-event-hero .wf-event-photo-rail:has(>.wf-event-photo+.wf-event-photo){margin-bottom:26px}"), "multi-photo rail reserves the dots strip (no layout shift)");
ok(/@media\(hover:hover\) and \(pointer:fine\)\{\.wf-event-rail-arrow\{display:block\}\}/.test(css), "arrows show for mouse users only");

// ── 3. Wiring ───────────────────────────────────────────────────────────────
const shell = strip(read("app/components/EventDetailShell.js"));
const railAt = shell.indexOf('className="wf-event-photo-rail"');
const ctlAt = shell.search(/<EventPhotoRailControls[\s/>]/);
ok(/import\s+EventPhotoRailControls\s+from\s+"\.\/EventPhotoRailControls\.js"/.test(shell), "shell imports the rail controls");
ok(railAt > 0 && ctlAt > railAt && ctlAt < shell.indexOf("{credit}"), "shell mounts the controls after the rail, before the credit line");
const ctl = strip(read("app/components/EventPhotoRailControls.js"));
ok(/^"use client"/.test(read("app/components/EventPhotoRailControls.js")), "controls are a client component");
ok(/<PhotoLightbox[\s/>]/.test(ctl) && /addEventListener\("click"/.test(ctl), "tapping a rail photo opens the full-screen viewer");
ok(/<RailCount[\s/>]/.test(ctl) && /<RailDots[\s/>]/.test(ctl), "event rail shows counter and dots");
ok(/subtree:\s*true/.test(strip(read("app/components/PhotoRailIndicators.js"))) && /shown\s*>\s*0/.test(ctl), "the expand badge appears even when the photo mounts after a pending tile (watches the whole rail, not just its direct children)");
ok(!/usePeekNudge|scrollSnapType\s*=\s*"none"/.test(ctl + strip(read("app/components/PhotoRailIndicators.js"))), "no photo moves on its own (owner disliked the auto peek, 2026-11-16)");
const place = strip(read("app/components/PlaceDetailPhotoHeader.js"));
ok(/\{multi && viewer \? <PhotoLightbox[\s/>]/.test(place), "place detail multi-photo rail opens the swipeable viewer");
ok(/<RailCount[\s/>]/.test(place) && /<RailDots[\s/>]/.test(place), "place detail rail shows counter and dots");
const lb = strip(read("app/components/PhotoLightbox.js"));
ok(/showModal\(\)/.test(lb) && /onCancel=/.test(lb) && /aria-label="Close photos"/.test(lb), "viewer is a real modal that closes with Escape and a labelled button");
ok(/scrollSnapType:\s*"x mandatory"/.test(lb) && /ArrowRight/.test(lb), "viewer swipes photo by photo and supports arrow keys");

if (failures.length) {
  console.error(`check-photo-rail-swipe: ${failures.length} FAILED (${passed} passed)`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-photo-rail-swipe: OK — ${passed} assertions (real railIndex/collectRailPhotos calls, shared hero CSS, shell/place/viewer wiring)`);
