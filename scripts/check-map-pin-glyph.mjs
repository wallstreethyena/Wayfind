#!/usr/bin/env node
// scripts/check-map-pin-glyph.mjs — THE PIN SAYS WHICH ONE, OR WHAT IT IS.
//
// v8.85 (owner, 2026-08-28, on a Food/Dinner map at Bradenton showing thirteen
// identical orange teardrops): "show me number top 5 choices and make the
// places have an icon representing its categories".
//
// The map already HELD both answers — `rank` was a feature property used only
// to size pin #1, and the primary type was on every row — and threw them away
// at the last step. lib/mapPinGlyph.js decides what goes in the head of the
// pin; MapView only draws it.
//
// The rule is executed here. The two wiring assertions read source and say so:
// MapView imports maplibre-gl and paints on a canvas, so node cannot render it
// (the same reason it is absent from test-map-render-smoke's happy path).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pinGlyphFor, categoryGlyph, pinImageKey, RANKED_PIN_COUNT, NEUTRAL_GLYPH } from "../lib/mapPinGlyph.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. THE TOP FIVE CARRY THEIR POSITION ────────────────────────────────────
const pizza = { name: "A Pizzeria", primaryType: "pizza_restaurant" };
for (let r = 1; r <= RANKED_PIN_COUNT; r += 1) {
  const g = pinGlyphFor(pizza, r, "food");
  ok(g.kind === "rank" && g.text === String(r), `rank ${r} shows the numeral ${r} (got ${g.kind}:${g.text})`);
}
// FIVE, not ten: a two-digit numeral inside a 20px pin head is unreadable at a
// real device ratio, and this is the assertion that keeps someone from
// "improving" it to 10 without seeing that trade.
{
  const sixth = pinGlyphFor(pizza, RANKED_PIN_COUNT + 1, "food");
  ok(sixth.kind === "glyph", `rank ${RANKED_PIN_COUNT + 1} is NOT numbered — it falls to its category (got ${sixth.kind}:${sixth.text})`);
  ok(sixth.text === "🍕", "…and the sixth pizzeria still shows a pizza");
}

// ── 2. THE GLYPH COMES FROM THE PRIMARY TYPE, NEVER THE UNION ───────────────
// Google's types[] is a union of every facet: a steakhouse carries `bar`, a
// hotel carries `restaurant`, a brewery carries `live_music_venue`. Reading it
// would give a third of the map a confidently wrong picture.
//
// EVERY ROW BELOW LEADS ITS types[] WITH THE WRONG ANSWER. That is the point: a
// fixture whose union happens to start with the true primary cannot tell the
// two readings apart, and a guard that cannot fail is decoration. Red-proved
// by pointing categoryGlyph at types[0] — this table goes red, and the
// version of it that led with the primary did not.
const CASES = [
  ["a steakhouse that also has a bar", { primaryType: "steak_house", types: ["bar", "restaurant", "steak_house"] }, "🥩"],
  ["a comedy club", { primaryType: "comedy_club", types: ["event_venue", "bar", "comedy_club"] }, "🎤"],
  ["a performing arts theatre", { primaryType: "performing_arts_theater", types: ["event_venue", "performing_arts_theater"] }, "🎭"],
  ["a coffee shop", { primaryType: "coffee_shop", types: ["bakery", "cafe", "coffee_shop"] }, "☕"],
  ["an ice cream shop", { primaryType: "ice_cream_shop", types: ["restaurant", "ice_cream_shop"] }, "🍦"],
  ["a beach", { primaryType: "beach", types: ["park", "natural_feature", "beach"] }, "🏖️"],
  ["a nature preserve", { primaryType: "nature_preserve", types: ["park", "nature_preserve"] }, "🌿"],
  ["the Skyway bridge", { primaryType: "bridge", types: ["tourist_attraction", "bridge"] }, "🌉"],
  ["a wine bar", { primaryType: "wine_bar", types: ["restaurant", "bar", "wine_bar"] }, "🍷"],
  ["a sports bar", { primaryType: "sports_bar", types: ["bar", "sports_bar"] }, "📺"],
  ["a museum", { primaryType: "museum", types: ["tourist_attraction", "museum"] }, "🏛️"],
  ["a bakery", { primaryType: "bakery", types: ["cafe", "store", "bakery"] }, "🥐"],
];
for (const [label, place, want] of CASES) {
  const got = categoryGlyph(place, "food");
  ok(got === want, `${label} shows ${want} (got ${got}) — from the PRIMARY type, not the union it also carries`);
}

// ── 3. THE TAIL, WHICH IS WHERE A LOOKUP TABLE USUALLY LIES ─────────────────
// Google mints new `*_restaurant` members constantly. An unnamed one is still
// dinner, and saying so is better than a neutral dot; saying nothing at all is
// better than saying the wrong thing.
ok(categoryGlyph({ primaryType: "peruvian_restaurant" }, "food") === "🍽️", "an unnamed *_restaurant still reads as a meal");
ok(categoryGlyph({ primaryType: "tiki_bar" }, "nightlife") === "🍸", "an unnamed *_bar still reads as a drink");
ok(categoryGlyph({ primaryType: "record_store" }, "shopping") === "🛍️", "an unnamed *_store still reads as shopping");
ok(categoryGlyph({ primaryType: "totally_unknown_thing" }, "food") === "🍽️", "an unknown type falls back to the VIEW's category, which is still true");
ok(categoryGlyph({}, "") === NEUTRAL_GLYPH, `with no type AND no category the pin is neutral (${NEUTRAL_GLYPH}) — "we know where, not what"`);
ok(pinGlyphFor(null, null, null).kind === "glyph", "total over garbage: a null place never throws inside a map render loop");
ok(pinGlyphFor(pizza, 0, "food").kind === "glyph" && pinGlyphFor(pizza, -3, "food").kind === "glyph",
  "a nonsense rank falls to the glyph rather than printing '0' or '-3' on the map");

// ── 4. THE SPRITE CACHE STAYS SMALL, which is the perf rule ─────────────────
// MapView must remain ONE symbol layer with a handful of images, never N DOM
// markers. Distinct (colour x mark x selected) is the sprite count.
{
  const screenful = [
    ...CASES.map(([, p]) => p),
    { primaryType: "pizza_restaurant" }, { primaryType: "pizza_restaurant" }, { primaryType: "coffee_shop" },
  ];
  const keys = new Set(screenful.map((p, i) => pinImageKey("#F97316", pinGlyphFor(p, i + 6, "food").text, false)));
  ok(keys.size <= 16, `a 15-pin screenful needs ${keys.size} sprites, not 15 — repeats share one image`);
  ok(pinImageKey("#F97316", "🍕", false) === pinImageKey("#F97316", "🍕", false), "the key is stable for the same inputs (addImage is idempotent only if it is)");
  ok(pinImageKey("#F97316", "🍕", false) !== pinImageKey("#F97316", "☕", false), "…and different marks get different images");
  ok(pinImageKey("#F97316", "🍕", true) !== pinImageKey("#F97316", "🍕", false), "…and the selected variant is its own image");
  ok(/^[\w-]+$/.test(pinImageKey("#F97316", "🏖️", false)), "the key is id-safe — an emoji is several code units and MapLibre compares image ids as plain strings");
}

// ── 5. THE WIRING (weaker: source, and named as such) ───────────────────────
{
  const mv = stripComments(readFileSync(join(ROOT, "app/components/MapView.js"), "utf8"));
  ok(/import \{ pinGlyphFor, pinImageKey \} from "\.\.\/\.\.\/lib\/mapPinGlyph\.js"/.test(mv),
    "weaker check (source): MapView imports the rule rather than restating it");
  ok(/pinGlyphFor\(place, rank, category\)/.test(mv),
    "weaker check (source): MapView CALLS pinGlyphFor with the place, its rank and the view's category");
  ok(/"icon-image": \["get", "img"\]/.test(mv),
    "weaker check (source): the sprite is resolved per feature — a `concat` of an emoji into an image id is not something to rely on");
  ok(/glyph: p\.mark, kind: p\.markKind/.test(mv),
    "weaker check (source): the mark reaches the sprite drawing, so a registered image actually carries it");
  ok(/\["<=", \["get", "rank"\], 5\]/.test(mv),
    "weaker check (source): the top five are sized to be readable, not left at the dot-era 0.86");
}

console.log(`\ncheck-map-pin-glyph: ${fail ? "FAIL" : "OK"} — ${pass} assertions; the rule EXECUTED over ${CASES.length} real primary types each carrying a misleading types[] union, the top-five numerals, the *_restaurant / *_bar / *_store tails, the neutral fallback, and the sprite-cache identity that keeps this one symbol layer`);
process.exit(fail ? 1 : 0);
