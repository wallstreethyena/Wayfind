// scripts/check-map-note-attribution.mjs — the Map tab's "N places aren't
// pinned" note must never cover Apple MapKit's logo / "Legal" link.
//
// Incident (2026-10-14, live at 390x844): the note (#1772) was absolutely
// positioned at bottom:142, rect top 636 / bottom 702, directly on top of the
// MapKit attribution that MapKit draws at the bottom-left of the padded map
// (controls rectangle bottom = 844 - 150 = 694). Apple MapKit JS terms require
// the logo and legal attribution to stay visible and unobscured.
//
// The fix ties the note to lib/mapSafeArea.js — the same constants that set
// `map.padding` — so the note sits above the reserved attribution band. This
// guard (1) executes the constants, (2) simulates the layout at 320 / 390 /
// 768 / 1280 widths and asserts no rectangle intersection with the attribution
// band, the results sheet, or the right-hand zoom/control column, and (3) pins
// the wiring in the source with comments stripped, so a numeric `bottom:`
// cannot creep back. Real-browser measurements need a MapKit token and are
// done by hand (see the PR); this guard says so rather than claiming them.

import { readFileSync } from "node:fs";

let failures = 0;
const ok = (cond, m) => { if (cond) console.log("  ok:", m); else { failures++; console.error("  FAIL:", m); } };

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// ── 1. constants, executed ──────────────────────────────────────────────────
const { MAP_SAFE_PADDING: PAD, MAP_ATTRIBUTION_BAND: BAND, MAP_NOTE_OFFSET: NOTE, MAPLIBRE_ATTRIBUTION_LIFT } = await import("../lib/mapSafeArea.js");
ok(BAND >= 40, `attribution band is at least 40px (logo + legal row + air), got ${BAND}`);
ok(NOTE.bottom >= PAD.bottom + BAND, `note bottom offset ${NOTE.bottom} clears padding.bottom ${PAD.bottom} + band ${BAND}`);
ok(NOTE.left >= PAD.left && NOTE.right >= PAD.right, "note stays inside the MapKit safe rectangle left/right");

// ── 2. layout simulation (the same arithmetic the browser does) ─────────────
const screenSrc = strip(readFileSync("app/components/screens/Map.js", "utf8"));
const rawScreen = readFileSync("app/components/screens/Map.js", "utf8");
const deskNote = rawScreen.match(/@media \(min-width: (\d+)px\)\s*\{[\s\S]*?\.wf-map-explorer \.wf-map-note \{ width: (\d+)px; right: auto !important; \}/);
ok(!!deskNote, "wide screens pin the note to the sheet column (min-width media rule for .wf-map-note)");
const [deskMin, deskW] = deskNote ? [+deskNote[1], +deskNote[2]] : [760, 390];
const SHEET = { left: 12, bottom: 76, collapsedH: 58 };
const RIGHT_COLUMN = { right: 12, width: 46 };       // floating controls stack
const rects = (W, H) => {
  const wide = W >= deskMin;
  const noteH = 96;                                  // worst case: 5 wrapped lines at 320
  const nl = NOTE.left, nr = wide ? nl + deskW : W - NOTE.right;
  const note = { l: nl, r: nr, t: H - NOTE.bottom - noteH, b: H - NOTE.bottom };
  // MapKit draws logo + Legal at the bottom-left of the padded rectangle.
  const attr = { l: PAD.left, r: PAD.left + 170, t: H - PAD.bottom - BAND, b: H - PAD.bottom };
  const sheet = { l: SHEET.left, r: wide ? SHEET.left + 390 : W - 12, t: H - SHEET.bottom - SHEET.collapsedH, b: H - SHEET.bottom };
  const controls = { l: W - RIGHT_COLUMN.right - RIGHT_COLUMN.width, r: W - RIGHT_COLUMN.right, t: 164, b: 322 };
  return { note, attr, sheet, controls };
};
const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
for (const [W, H] of [[320, 640], [390, 844], [768, 1024], [1280, 900]]) {
  const { note, attr, sheet, controls } = rects(W, H);
  ok(!hit(note, attr), `${W}x${H}: note [${note.l},${note.t},${note.r},${note.b}] does not touch MapKit attribution band [${attr.l},${attr.t},${attr.r},${attr.b}]`);
  ok(!hit(note, sheet), `${W}x${H}: note clears the results sheet`);
  ok(!hit(note, controls), `${W}x${H}: note clears the right-hand control column`);
  ok(note.t >= 150, `${W}x${H}: note stays below the 150px header band`);
}
// Control: the OLD placement (bottom:142, full width) must be caught by this simulation.
{
  const W = 390, H = 844;
  const old = { l: 12, r: W - 12, t: H - 142 - 66, b: H - 142 };
  const attr = rects(W, H).attr;
  ok(hit(old, attr), "control: the pre-fix rect (top 636 / bottom 702) DOES intersect the attribution band — the simulation can fail");
}

// ── 3. wiring, comments stripped ────────────────────────────────────────────
const noteEls = [...screenSrc.matchAll(/<div role="note"[^>]*data-wf-map-unpinned=[^>]*style=\{\{([\s\S]*?)\}\}>/g)];
ok(noteEls.length === 1, `exactly one absolutely positioned unpinned note element (found ${noteEls.length})`);
const style = noteEls[0] ? noteEls[0][1] : "";
ok(/bottom: MAP_NOTE_OFFSET\.bottom/.test(style), "note bottom comes from MAP_NOTE_OFFSET.bottom");
ok(/left: MAP_NOTE_OFFSET\.left/.test(style) && /right: MAP_NOTE_OFFSET\.right/.test(style), "note left/right come from MAP_NOTE_OFFSET");
ok(!/\bbottom:\s*\d/.test(style), "no numeric bottom: literal on the note");
ok(/className="wf-map-note"/.test(screenSrc.match(/<div role="note"[^>]*>/)?.[0] || ""), "note carries the wf-map-note class the media rule targets");
ok(/import \{ MAP_NOTE_OFFSET, MAPLIBRE_ATTRIBUTION_LIFT \} from "\.\.\/\.\.\/\.\.\/lib\/mapSafeArea\.js"/.test(screenSrc), "Map.js imports MAP_NOTE_OFFSET");

ok(/\.wf-map-explorer \.maplibregl-ctrl-bottom-left, \.wf-map-explorer \.maplibregl-ctrl-bottom-right \{ margin-bottom: \$\{MAPLIBRE_ATTRIBUTION_LIFT\}px; \}/.test(rawScreen), "3D MapLibre path: OSM/MapLibre attribution controls are lifted by MAPLIBRE_ATTRIBUTION_LIFT (not left under the sheet + tab bar)");
ok(MAPLIBRE_ATTRIBUTION_LIFT + 10 >= SHEET.bottom + SHEET.collapsedH, `3D attribution lift ${MAPLIBRE_ATTRIBUTION_LIFT} (+10 control margin) clears the collapsed sheet top (${SHEET.bottom + SHEET.collapsedH})`);
ok(MAPLIBRE_ATTRIBUTION_LIFT + 10 + 44 <= NOTE.bottom, "3D attribution (worst case 44px tall) stays below the note's bottom edge, so they never overlap");
const lib = strip(readFileSync("lib/appleExplorerMap.js", "utf8"));
ok(!/Padding\(\s*150/.test(lib), "appleExplorerMap has no numeric Padding(150, ...) safe-area literal left");
ok(/Padding\(\s*150/.test("map.padding = new mapkit.Padding(150, 68, 150, 12);"), "control: the Padding(150 probe finds the pre-fix literal, so its absence above is meaningful");
ok((lib.match(/new mapkit\.Padding\(MAP_SAFE_PADDING\.top, MAP_SAFE_PADDING\.right, MAP_SAFE_PADDING\.bottom, MAP_SAFE_PADDING\.left\)/g) || []).length === 2, "both map.padding and the cluster showItems padding use MAP_SAFE_PADDING");

console.log(failures ? `check-map-note-attribution: ${failures} FAILURE(S)` : "check-map-note-attribution: all green — constants executed, 4 viewports simulated against attribution/sheet/controls (real-browser rects need a MapKit token: measured by hand in the PR)");
process.exit(failures ? 1 : 0);
