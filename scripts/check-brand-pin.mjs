#!/usr/bin/env node
// Lock for the user-location pin and the brand vector assets (ticket 4b).
//
// TWO SEPARATE FAILURES THIS DEFENDS.
//
// 1. THE PIN MUST MEAN "YOU", NEVER "A PLACE". Drawn in the same vocabulary as
//    places, the user's own position reads as a search result — the one thing a
//    map must never say. Outline pin = you are here; filled circle with a rank =
//    somewhere we recommend. Those two must not converge.
//
// 2. THE ASSETS MUST NOT DRIFT BACK INTO _to_delete/. All four vectors were
//    tracked but sitting in that folder and absent from the README, so a work
//    order described the pin as "already produced" and it read as missing. A
//    file nobody can find is the same as a file that does not exist.
import { readFileSync, existsSync } from "node:fs";
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const at = (p) => new URL("../" + p, import.meta.url);

// ── assets exist where the code and the README say they do ───────────────
const ASSETS = ["public/brand/wayfind-pin.svg", "public/brand/wayfind-logo.svg",
  "public/brand/wayfind-logo-ink.svg", "public/brand/wayfind-logo-bold.svg"];
for (const a of ASSETS) {
  ok(existsSync(at(a)), `${a} is missing — the map would render a broken image`);
  ok(!existsSync(at(a.replace("public/brand/", "public/brand/_to_delete/"))),
    `${a} is back in _to_delete/ — a file nobody can find is a file that does not exist`);
}
const pin = readFileSync(at("public/brand/wayfind-pin.svg"), "utf8");
ok(/viewBox="0 0 32(\.0)? 36(\.0)?"/.test(pin), "the pin is no longer the 32x36 mark");
ok(/<svg/.test(pin) && !/<image/.test(pin), "the pin is not vector — a raster crop softens visibly at 30px");

// ── the README lists them, or they get lost again ────────────────────────
const readme = readFileSync(at("public/brand/README.md"), "utf8");
for (const a of ASSETS) {
  ok(readme.includes("`" + a.split("/").pop() + "`"), `${a} is not in the brand README table`);
}
ok(/never a place|NEVER a place|USER, never/i.test(readme), "the README no longer states that the pin means the user, not a place");

// ── the map actually uses it, with the tip on the coordinate ─────────────
const view = readFileSync(at("app/components/MapView.js"), "utf8");
ok((view.match(/\/brand\/wayfind-pin\.svg/g) || []).length >= 2, "the map does not render the brand pin for the user's location (both the comment reference and the img src should name it)");
// anchor:"bottom" is what puts the TIP on the true coordinate.
ok(/anchor: "bottom" \}\)\.setLngLat\(\[origin\.lng, origin\.lat\]/.test(view),
  "the ORIGIN marker is not bottom-anchored — the pin's centre would sit on the coordinate instead of its tip (events share this anchor, so an unscoped check proves nothing)");
ok(/wf-origin-pin/.test(view), "the pin has no class, so the glow/pulse cannot target it");
ok(/prefers-reduced-motion: reduce/.test(view), "the pulse is not disabled under reduced motion");
// The pulse must animate the GLOW, not the mark — scaling the mark moves its tip.
ok(/@keyframes wfOriginGlow\{[^}]*filter:drop-shadow/.test(view.replace(/\s+/g, " ")) || /wfOriginGlow[\s\S]{0,200}drop-shadow/.test(view),
  "the pulse animates something other than the glow — scaling the mark would move its tip off the coordinate every frame");
// The two vocabularies stay apart: places are still circles with ranks.
ok(/"wf-place-pins", type: "circle"/.test(view), "places stopped being filled circles — they would collide with the user pin's vocabulary");
ok(/\["get", "rank"\]/.test(view), "place markers lost their rank labels");
ok(!/wayfind-pin\.svg[\s\S]{0,400}wf-place/.test(view), "the brand pin leaked into the place-marker path — the user would read as a search result");
ok(view.length > 3000, "MapView did not load — every assertion above would pass vacuously");

if (bad) { console.error(`\ncheck-brand-pin: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-brand-pin: OK — ${n} assertions (four vectors out of _to_delete/ and in the README; the user renders as the brand pin, tip-anchored, glow-pulsed, reduced-motion safe; places stay filled ranked circles)`);
