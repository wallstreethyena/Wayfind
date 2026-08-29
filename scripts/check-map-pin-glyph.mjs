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
import { pinGlyphFor, categoryGlyph, pinImageKey, RANKED_PIN_COUNT, NEUTRAL_GLYPH, pinFamily, pinColorFor, NEUTRAL_COLOR, FAMILY_COLOR } from "../lib/mapPinGlyph.js";

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

// ── 4b. THE COLOUR, EXECUTED (v8.89) ────────────────────────────────────────
// Owner, 2026-08-29, on the v8.85 pin strip: "you cannot see the icon in these,
// I need the icon to be distinguished between food, bars, hotels etc."
//
// The glyph was half the problem. The other half was that MapView derived ONE
// colour per VIEW, so every pin on the Food map was the same orange whatever
// the place was — the only channel that is legible at pin size, spent
// restating the filter the reader had just chosen.
//
// Each row leads its types[] with the WRONG answer, the same discipline the
// glyph table above uses: a fixture whose union starts with the true primary
// cannot tell the two readings apart.
{
  const COLOR_CASES = [
    ["Sofra Kitchen Bar & Bistro", "italian_restaurant", ["bar", "italian_restaurant", "restaurant"], "food", "food"],
    ["Joy Coffee", "coffee_shop", ["restaurant", "coffee_shop", "cafe"], "food", "cafe",
      "a cafe is NOT the same colour as a restaurant — they sit side by side on every Food map"],
    ["Sea Maids Creamery", "ice_cream_shop", ["restaurant", "ice_cream_shop"], "food", "cafe"],
    ["Bahi Hut Tiki Cocktail Lounge", "cocktail_bar", ["restaurant", "cocktail_bar", "bar"], "nightlife", "drinks",
      "a bar is not a restaurant, which is the owner's 'food, bars' in one line"],
    ["McCurdy's Comedy Theatre", "comedy_club", ["bar", "comedy_club"], "attractions", "shows"],
    ["Van Wezel", "performing_arts_theater", ["event_venue", "performing_arts_theater"], "attractions", "shows"],
    ["Siesta Beach", "beach", ["tourist_attraction", "beach", "natural_feature"], "attractions", "water"],
    ["Marina Jack", "marina", ["restaurant", "marina"], "attractions", "water",
      "Marina Jack's union LEADS with restaurant — reading types[] would paint it orange"],
    ["Emerson Point Preserve", "nature_preserve", ["park", "nature_preserve"], "attractions", "outdoors"],
    ["The Ringling", "museum", ["tourist_attraction", "museum", "art_gallery"], "attractions", "culture"],
    ["The Ritz-Carlton", "hotel", ["restaurant", "spa", "hotel"], "hotels", "stay",
      "a hotel's union leads with restaurant and carries spa — both would be the wrong colour"],
    ["Westfield Sarasota Square", "shopping_mall", ["point_of_interest", "shopping_mall"], "shopping", "shop"],
  ];
  for (const [name, primaryType, types, category, wantFamily, why] of COLOR_CASES) {
    const place = { name, primaryType, types };
    const gotFamily = pinFamily(place, category);
    ok(gotFamily === wantFamily,
      `${name} (${primaryType}) is in the ${wantFamily} colour family${why ? " — " + why : ""}; got ${gotFamily}`);
    ok(/^#[0-9A-F]{6}$/i.test(pinColorFor(place, category)), `…and resolves to a real hex colour`);
  }
  // THE POINT OF THE WHOLE CHANGE, asserted as one fact: the families a single
  // Food map really mixes must come out as DIFFERENT colours. Before this
  // release all three were #F97316.
  const onFoodMap = [
    ["restaurant", "italian_restaurant"], ["cafe", "coffee_shop"], ["bar", "cocktail_bar"],
  ].map(([, pt]) => pinColorFor({ primaryType: pt }, "food"));
  ok(new Set(onFoodMap).size === 3,
    `a restaurant, a cafe and a bar are three different colours on the SAME map (got ${onFoodMap.join(", ")}) — one orange for all three is the defect`);
  // Negative control: a rule that returned a different colour for everything
  // would satisfy the line above and be useless. Two restaurants must MATCH.
  ok(pinColorFor({ primaryType: "italian_restaurant" }, "food") === pinColorFor({ primaryType: "sushi_restaurant" }, "food"),
    "negative control: two restaurants share one colour — the families are families, not sixty shades");
  // Total over garbage, inside a map render loop.
  ok(/^#[0-9A-F]{6}$/i.test(pinColorFor(null, null)) && pinColorFor(null, null) === NEUTRAL_COLOR,
    "an unknown place gets the neutral slate rather than a confident wrong colour");
  ok(pinColorFor({ primaryType: "chiropractor" }, "food") === FAMILY_COLOR.food,
    "…and an unmapped type inside a known view falls back to the VIEW's family, which is still a true statement about what the reader is looking at");
}

// ── 5. THE WIRING (weaker: source, and named as such) ───────────────────────
{
  const mv = stripComments(readFileSync(join(ROOT, "app/components/MapView.js"), "utf8"));
  // v8.89 — pinColorFor joined the import: the pin's COLOUR is now a fact about
  // the place too, not about the view's filter. Matched as a set rather than a
  // literal list so adding a fourth export does not go red for no reason, while
  // a MapView that stopped importing any of the three still does.
  ok(/import \{[^}]*\} from "\.\.\/\.\.\/lib\/mapPinGlyph\.js"/.test(mv)
    && /\bpinGlyphFor\b/.test(mv) && /\bpinImageKey\b/.test(mv) && /\bpinColorFor\b/.test(mv),
    "weaker check (source): MapView imports the rule rather than restating it");
  ok(/pinColorFor\(place, category\)/.test(mv),
    "…and the PIN's colour is resolved per PLACE — one orange for every pin on the Food map is what made a steakhouse, a cafe and a beach bar identical");
  ok(!/const categoryColor =/.test(mv),
    "…and the per-VIEW pin table it replaced is gone, not merely bypassed");
  // The CLUSTER ring keeps the view's colour, deliberately and by contrast: a
  // cluster is "twelve results in the filter you chose", which is a fact about
  // the view. Asserted so nobody deletes it while cleaning up the pin table,
  // and so this guard is scoped to the pin rather than to the word "colour".
  ok(/const clusterColor = \{ food:/.test(mv),
    "…while the CLUSTER ring keeps the view's colour, which is the one place a per-view colour is the true statement");
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
