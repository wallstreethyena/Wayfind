#!/usr/bin/env node
// Lock for the map place card + marker vocabulary (work order, tickets 3 + 4c).
//
// THESE SHIPPED TOGETHER ON PURPOSE. Places are a MapLibre CIRCLE layer, not DOM
// markers, so ticket 3's "selected pin changes state" and ticket 4c's marker
// redesign are the SAME paint expressions. Building 3 first would have written
// expressions 4c immediately replaced, and left two edits fighting over one
// renderer.
import { readFileSync } from "node:fs";
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const map = strip(readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8"));
const view = strip(readFileSync(new URL("../app/components/MapView.js", import.meta.url), "utf8"));

// ── the card ─────────────────────────────────────────────────────────────
ok(/maxHeight: 175/.test(map), "the place card lost its 175px cap — the rings and user pin must stay visible behind it");
ok(/width: 74, height: 74/.test(map), "the card thumbnail is not 74px");
ok(/See details/.test(map), "the card has no primary CTA");
ok(/height: 44,[^}]*background: C\.accent/.test(map) || /background: C\.accent[^}]*height: 44/.test(map), "the CTA is not a 44px accent button");
ok(/ranked by fit/.test(map), "the ranked-position footer is gone — it is the payoff of a ranked map");
ok(/aria-label="Next place"/.test(map) && /aria-label="Previous place"/.test(map), "the paging arrows are gone");
ok(/onTouchEnd=/.test(map) && /dy > 60/.test(map), "swipe-down no longer dismisses the card");
// Opening must NOT move the camera; only the arrows may.
ok(!/onSelect=\{\(p\) => \{[^}]*setMapFocus/.test(map), "tapping a pin recenters the map — only the arrows may move the camera");
ok(/const step = \(dir\) => \{[\s\S]{0,400}?setMapFocus/.test(map), "the arrows do not move the camera, so paging would leave the pin off-screen");
// Three events, and the CTA one must carry rank or the map's commerce is unattributable.
for (const ev of ["map_pin_tap", "map_card_cta", "map_card_page"]) {
  ok(new RegExp('logEvent\\("' + ev + '"').test(map), `event "${ev}" is not emitted`);
}
ok(/logEvent\("map_card_cta"[^)]*rank/.test(map), "map_card_cta carries no rank — which position converts is the whole question");

// ── the marker vocabulary + selection ────────────────────────────────────
ok(/selectedId/.test(view), "MapView no longer accepts a selection");
ok(/selectedId=\{mapPreview/.test(map), "the card and the pins do not share one selected id");
ok(/"wf-place-halo"/.test(view), "the outer ring is gone — it is what makes the marker read as ours rather than Google's");
ok(/\["\+", R_SEL, 4\.5\]/.test(view), "the outer ring no longer stands clear of the chip");
ok(/\["\*", R_BASE, 1\.4\]/.test(view), "the selected pin no longer scales up");
ok(/"wf-place-pointer"/.test(view), "the downward pointer is gone — the card would not read as anchored to a place");
ok(/\["==", \["get", "anySel"\], 1\], \.42/.test(view), "unselected pins no longer dim when something is selected");
ok(/\["==", \["get", "rank"\], 1\], 16\.5, 14\.5/.test(view), "rank 1 is no longer drawn larger");
ok(/\["get", "rank"\]/.test(view), "pins no longer carry the rank label");
// The selection must be a redraw dependency or the pin state never updates.
ok(/\[places, center, category, deviceLoc, events, fit, rings, selectedId\]/.test(view),
  "selectedId is not a redraw dependency — the pin state would never change");
// Vacuity: both files must actually have loaded.
ok(map.length > 3000 && view.length > 3000, "a source file did not load — every assertion above would pass vacuously");

if (bad) { console.error(`\ncheck-map-place-card: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-map-place-card: OK — ${n} assertions (card capped at 175px with ranked paging and three events; selection shared between card and pins; outer ring, rank sizing, pointer and dimming intact)`);
