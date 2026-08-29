#!/usr/bin/env node
// Lock for the map place card + marker vocabulary.
//
// v7.16 (owner, 2026-08-11, Google Maps reference screenshot) SUPERSEDES the
// ticket 3/4c circle-chip design this guard used to pin:
//   · "i want the results to be our iconic place card … in the bottom" — the
//     bottom slot renders IconicPlaceCard (the wf-place-card money contract),
//     not a bespoke 175px compact card.
//   · "can the location be more precise perhaps just a pin icon … the circle
//     covers too much" — places are teardrop PIN SPRITES whose tip sits on
//     the exact coordinate (icon-anchor bottom), one cheap symbol layer that
//     clusters natively. No score text on pins; the score lives in the card.
//   · "the area looks very thin … is that a lazy get strategy?" — the map
//     draws up to 60 of the already-fetched pool (no new API cost).
import { readFileSync } from "node:fs";
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const map = strip(readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8"));
const view = strip(readFileSync(new URL("../app/components/MapView.js", import.meta.url), "utf8"));
const iconic = strip(readFileSync(new URL("../app/components/IconicPlaceCard.js", import.meta.url), "utf8"));

// ── the card: THE iconic place card, in a capped scrollable shell ────────
ok(/<IconicPlaceCard/.test(map), "the bottom slot no longer renders IconicPlaceCard — the owner's money card IS the map result card (v7.16)");
ok(/import IconicPlaceCard from "\.\.\/IconicPlaceCard"/.test(map), "Map.js imports the shared card — never a second card system");
ok(/maxHeight: 356/.test(map) && /overflowY: "auto"/.test(map), "the card shell lost its 356px cap + scroll — the map must stay visible behind it");
ok(/ranked by fit/.test(map), "the ranked-position footer is gone — it is the payoff of a ranked map");
ok(/aria-label="Next place"/.test(map) && /aria-label="Previous place"/.test(map), "the paging arrows are gone");
ok(/onTouchEnd=/.test(map) && /dy > 60/.test(map), "swipe-down no longer dismisses the card");
ok(/onOpen=\{\(\) => \{[\s\S]{0,160}?openDetail\(mp\)/.test(map), "opening the card no longer opens the in-app detail sheet");
// Opening must NOT move the camera; only the arrows may.
ok(!/onSelect=\{\(p\) => \{[^}]*setMapFocus/.test(map), "tapping a pin recenters the map — only the arrows may move the camera");
ok(/const step = \(dir\) => \{[\s\S]{0,400}?setMapFocus/.test(map), "the arrows do not move the camera, so paging would leave the pin off-screen");
for (const ev of ["map_pin_tap", "map_card_cta", "map_card_page"]) {
  ok(new RegExp('logEvent\\("' + ev + '"').test(map), `event "${ev}" is not emitted`);
}
ok(/logEvent\("map_card_cta"[^)]*rank/.test(map), "map_card_cta carries no rank — which position converts is the whole question");
// The shared card must support the in-app open without navigating away.
ok(/if \(onOpen\) \{ onOpen\(place\); return; \}/.test(iconic), "IconicPlaceCard lost its onOpen path — the map card would navigate away and lose the map");

// ── the markers: pin sprites, tip on the coordinate ──────────────────────
ok(/selectedId/.test(view), "MapView no longer accepts a selection");
ok(/selectedId=\{mapPreview/.test(map), "the card and the pins do not share one selected id");
ok(/drawPinImageData/.test(view) && /ensurePinImage/.test(view), "the pin sprite factory is gone — places would fall back to shapeless markers");
ok(/"icon-anchor": "bottom"/.test(view), "the pin tip no longer sits on the exact coordinate — precision was the owner's ask");
ok(/"icon-allow-overlap": true/.test(view), "pins hide each other at density — allow-overlap is what makes 60 pins readable");
// v8.85 — FOLLOWED THE CODE RATHER THAN DELETED. The literal "wf-pin-sel" is
// gone because the sprite key is now composed per feature (colour x mark x
// selected) by lib/mapPinGlyph.pinImageKey — an emoji cannot be concatenated
// into an image id safely. The INVARIANT is unchanged and is what is asserted
// now: a selected place still gets its own distinct sprite, and still grows to
// 1.18. Asserting the old string would have gone green the day someone dropped
// the selected sprite while keeping the name in a comment.
ok(/selected: !!p\.sel/.test(view) && /\["==", \["get", "sel"\], 1\], 1\.18/.test(view),
  "the selected pin no longer swaps to its own sprite and grows to 1.18");
ok(/\["==", \["get", "anySel"\], 1\], \.5/.test(view), "unselected pins no longer dim when something is selected");
// v8.85 — the top FIVE are now drawn larger, not just rank 1, because they
// carry a numeral that has to be readable (owner: "show me number top 5
// choices"). Same invariant — the ranked head of the list is visually ahead of
// the field — measured on the expression that actually ships.
ok(/\["<=", \["get", "rank"\], 5\], 1\.06, 0\.9/.test(view),
  "the ranked head of the list is no longer drawn larger than the field");
ok(!/scoreLabel/.test(view) && !/"wf-place-ranks"/.test(view), "score text crept back onto the pins — the score belongs to the card (v7.16)");
ok(/slice\(0, 60\)/.test(view), "the density cap fell below 60 — the thin-map complaint comes back");
ok(/slice\(0, 40\)/.test(map), "the default map pool cap fell below 40");
ok(/clusterRadius: 30/.test(view), "the cluster radius widened again — more clustering means fewer visible pins");
ok(/pixelRatio: PIN_DPR/.test(view), "pin sprites are not registered at 2x — they would render blurry on retina");
ok(/\[places, center, category, deviceLoc, events, fit, rings, selectedId\]/.test(view),
  "selectedId is not a redraw dependency — the pin state would never change");
ok(map.length > 3000 && view.length > 3000 && iconic.length > 3000, "a source file did not load — assertions above would pass vacuously");

// ── empty take: do not reserve the 176px take gap ────────────────────────
{
  const css = readFileSync(new URL("../app/components/css.js", import.meta.url), "utf8");
  ok(/is-no-take/.test(iconic), "IconicPlaceCard no longer marks cards with no take/aiSummary — the 176px take gap stays reserved");
  ok(/hasTake \? "" : " is-no-take"/.test(iconic) || /hasTake \? '' : " is-no-take"/.test(iconic),
     "is-no-take is not gated on hasTake (filtered take or validated aiSummary)");
  ok(/\.wf-place-card\.is-no-take .wf-place-card-layout/.test(css) && /min-height:0/.test(css),
     "is-no-take CSS no longer drops the 176px min-height, so empty-take cards keep the dead gap");
  ok(/take \|\| validAiSummary/.test(iconic),
     "hasTake must be the filtered take or validated aiSummary — do not generate a blurb in the render path");
  ok(/toHookLine\(editorial, place\.name\)/.test(iconic),
     "the take is toHookLine(editorial) — host-theme copy cannot reserve or fill the slot");
}

if (bad) { console.error(`\ncheck-map-place-card: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-map-place-card: OK — ${n} assertions (iconic card in the bottom slot; tip-anchored pin sprites, no score text, 60-pin density; selection shared; camera law intact)`);
