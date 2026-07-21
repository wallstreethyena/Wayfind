// Lock test: Food collections (§5) wiring + label honesty.
//
// scripts/test-food-collections.mjs pins the ASSEMBLER. This pins the surface.
// The specific risks here:
//   • "Date Night Done Right" implies UPSCALE — it must stay tied to Google
//     priceLevel, and the $ glyphs must never be rendered for a place that has
//     no priceLevel (that would invent a price tier).
//   • "Locals Can't Stop Talking" implies CONSENSUS — it must stay tied to
//     Google review volume, not Wayfind's 7-device engagement signal.
//   • A flat restaurant list defeats the whole section.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildFoodCollections, COLLECTIONS, RAW_CATEGORY_NAMES } from "../lib/foodCollections.js";

let passed = 0;
const fail = (m) => { console.error("test-food-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/food/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/food/page.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. COLLECTIONS, NOT A FLAT LIST -------------------------------------
ok(/buildFoodCollections\(/.test(uiCode), "the section must render through buildFoodCollections");
ok(/collections\.map\(\(col\)/.test(uiCode), "the section must render collection ROWS, not one flat list");
for (const raw of RAW_CATEGORY_NAMES) {
  ok(!new RegExp(`<h3[^>]*>\\s*${raw}\\s*<`, "i").test(uiCode), `a collection heading renders the raw category name "${raw}"`);
}
ok(COLLECTIONS.every((c) => !RAW_CATEGORY_NAMES.includes(c.label)), "a collection label became a raw category name");

// ---- 2. EVERY COLLECTION STATES ITS EVIDENCE -----------------------------
const whyBlock = uiCode.slice(uiCode.indexOf("const WHY"), uiCode.indexOf("function useCenter"));
for (const c of COLLECTIONS) ok(whyBlock.includes(`"${c.id}"`), `collection "${c.id}" has no reasoning line`);
ok(/WHY\[col\.id\]/.test(uiCode), "the reasoning line must actually render");

// ---- 3. "DATE NIGHT" STAYS TIED TO REAL PRICE LEVEL ----------------------
const dn = COLLECTIONS.find((c) => c.id === "date-night");
ok(!!dn, "the date-night collection is gone");
ok(dn.pick({ rating: 4.7, priceLevel: 1 }) === false, "a cheap eat must not qualify as date night when Google gives a price level");
ok(dn.pick({ rating: 4.7, priceLevel: 4 }) === true, "an upscale, highly rated place must qualify");
// the $ glyphs must be conditional — inventing a price tier is fabrication
ok(/p\.priceLevel != null \?/.test(uiCode), "the $ price glyphs must render ONLY when Google supplied a priceLevel");
ok(/"\$"\.repeat\(/.test(uiCode), "price should render as real $ glyphs derived from priceLevel");

// ---- 4. "LOCALS" STAYS TIED TO GOOGLE REVIEW VOLUME ----------------------
const lo = COLLECTIONS.find((c) => c.id === "locals-love");
ok(!!lo, "the locals-love collection is gone");
ok(lo.pick({ rating: 4.9, reviewCount: 120 }) === false, "few reviews must NOT read as 'locals can't stop talking'");
ok(lo.pick({ rating: 4.7, reviewCount: 900 }) === true, "high rating + high review volume must qualify");
ok(/Hundreds of nearby reviewers/i.test(ui), "the locals reasoning must attribute the claim to review volume");
ok(!/engagementMap:/.test(uiCode), "the engagement boost must stay unwired at 7 devices — it cannot support a consensus claim");

// ---- 5. NON-FOOD NEVER APPEARS -------------------------------------------
const p = (id, o) => ({ place_id: id, name: id, types: ["restaurant"], lat: 27.34, lng: -82.53, ...o });
const cols = buildFoodCollections([
  p("a", { rating: 4.7, priceLevel: 4, reviewCount: 800 }), p("b", { rating: 4.8, priceLevel: 3, reviewCount: 400 }), p("c", { rating: 4.9, priceLevel: 3, reviewCount: 250 }),
  p("d", { rating: 4.7, priceLevel: 2, reviewCount: 1500 }), p("e", { rating: 4.6, priceLevel: 2, reviewCount: 900 }), p("f", { rating: 4.8, priceLevel: 2, reviewCount: 2000 }),
  p("g", { rating: 4.5, priceLevel: 1, reviewCount: 120 }), p("h", { rating: 4.6, priceLevel: 1, reviewCount: 90 }), p("i", { rating: 4.5, priceLevel: 1, reviewCount: 200 }),
  { place_id: "museum", name: "Art Museum", types: ["museum"], rating: 4.9, reviewCount: 999, lat: 27.34, lng: -82.53 },
], { center: { lat: 27.34, lng: -82.53 } });
ok(!cols.some((c) => c.places.some((pl) => pl.place_id === "museum")), "a non-food place reached a food collection");
const seen = new Set();
for (const c of cols) for (const pl of c.places) { ok(!seen.has(pl.place_id), `restaurant ${pl.place_id} appears in two collections`); seen.add(pl.place_id); }
ok(cols.length >= 3, `expected >=3 collections from the fixture, got ${cols.length}`);

// ---- 6. RENDER ONLY WHAT EXISTS + GUARDRAILS -----------------------------
ok(/typeof p\.reviewCount === "number" && p\.reviewCount > 0/.test(uiCode), "review count must render only when it exists");
ok(/facts\.length \?/.test(uiCode), "a place with no facts must render no fact line");
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page) && /!==\s*"1"/.test(page), "the route must be opt-in behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/wf_center/.test(ui) && /URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must be wf_center -> URL -> geolocation");
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the Food UI (${coords.slice(0, 2).join(", ")})`);
for (const banned of ["wait time", "Wait Time", "reservation available", "Book a table", "crowd level", "Trending", "Most Popular"]) {
  ok(!uiCode.includes(banned), `Food renders "${banned}" — no reservation/wait/crowd source is wired`);
}
ok(/no reservation, wait-time or crowd data/.test(ui), "the section must state the reservation/wait/crowd gap");

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — Food must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

console.log(`test-food-ui: OK — ${passed} assertions (collections not a flat list; date-night tied to real priceLevel; locals tied to review volume; non-food excluded; dedupe holds; nothing invented)`);
