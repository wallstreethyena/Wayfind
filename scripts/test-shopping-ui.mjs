// Lock test: Shopping (§6) wiring + honesty rules.
//
// One hero card carries the section's entire claim, so the failure modes are
// sharper than elsewhere:
//   1. padding the page with a weak pick instead of hiding
//   2. the bare word "Shopping" as the headline (the banned raw category name)
//   3. invented sale / stock / crowd claims on a single prominent card
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pickShoppingHero, SHOP_HEADLINES, RAW_CATEGORY_NAMES } from "../lib/shopping.js";

let passed = 0;
const fail = (m) => { console.error("test-shopping-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/shopping/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/shopping/page.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. HIDE RATHER THAN PAD ---------------------------------------------
ok(/if \(!hero\.show\) return null;/.test(uiCode),
  "when nothing clears the bar the section must render NOTHING — a weak single hero is worse than an absent section");
ok(!/hero\.show\s*\|\|/.test(uiCode) && !/show:\s*true/.test(uiCode), "the show decision must never be overridden or defaulted true");
// behavioural: a restaurant-only area yields no hero
const none = pickShoppingHero([{ place_id: "r", name: "Diner", types: ["restaurant"], rating: 4.9, lat: 27.34, lng: -82.53 }], { center: { lat: 27.34, lng: -82.53 } });
ok(none.show === false, "a non-shopping area must not produce a hero");
// behavioural: a low-rated mall does not clear the 4.0 bar
const weak = pickShoppingHero([{ place_id: "m", name: "Mall", types: ["shopping_mall"], rating: 3.2, lat: 27.34, lng: -82.53 }], { center: { lat: 27.34, lng: -82.53 } });
ok(weak.show === false, "a poorly rated store must not become the hero");

// ---- 2. HEADLINE IS NEVER THE RAW CATEGORY -------------------------------
for (const raw of RAW_CATEGORY_NAMES) {
  ok(!new RegExp(`<h2[^>]*>\\s*${raw}\\s*<`, "i").test(uiCode), `the headline renders the raw category name "${raw}"`);
}
ok(SHOP_HEADLINES.every((h) => !RAW_CATEGORY_NAMES.includes(h)), "a curiosity headline became a raw category name");
ok(/\{hero\.headline\}/.test(uiCode), "the headline must come from the module's curiosity set, not be hardcoded");

// ---- 3. NOTHING INVENTED --------------------------------------------------
for (const banned of ["Sale", "% off", "Deals today", "in stock", "crowd level", "Trending", "Most Popular", "Busy now", "Limited time"]) {
  ok(!uiCode.includes(banned), `Shopping renders "${banned}" — no sale/stock/crowd source is wired`);
}
ok(/no sale, stock or crowd data/.test(ui), "the section must state the sale/stock/crowd gap rather than leave it implied");

// ---- 4. RENDER ONLY WHAT EXISTS ------------------------------------------
ok(/typeof p\.reviewCount === "number" && p\.reviewCount > 0/.test(uiCode), "review count must render only when it exists");
ok(/facts\.length \?/.test(uiCode), "a place with no facts must render no fact line");
ok(/p\.openNow === true/.test(uiCode), "open-now must be rendered only on an explicit true, never on a missing value");

// ---- 5. GUARDRAILS -------------------------------------------------------
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page) && /!==\s*"1"/.test(page), "the route must be opt-in behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/wf_center/.test(ui) && /URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must be wf_center -> URL -> geolocation");
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the Shopping UI (${coords.slice(0, 2).join(", ")})`);
ok(!/engagementMap:/.test(uiCode), "the engagement boost must stay unwired at 7 devices (consistent with §4/§5)");

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — Shopping must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

console.log(`test-shopping-ui: OK — ${passed} assertions (hides rather than padding with a weak pick; curiosity headline never the raw category; no sale/stock/crowd claims; renders only what exists)`);
