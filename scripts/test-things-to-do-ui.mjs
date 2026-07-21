// Lock test: Things To Do (§4) wiring + label honesty.
//
// scripts/test-things-to-do.mjs pins the ASSEMBLER (dedupe, 3–5 collections,
// non-raw labels). This pins the surface, where the risk is different: a
// curiosity label is a CLAIM, and the reasoning line next to it must name the
// real signal that earned it. "Places Locals Actually Recommend" in particular
// must stay backed by Google review volume — Wayfind's own likes/saves were
// 73+42 from SEVEN devices on 2026-07-21 and cannot support that claim.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildCollections, COLLECTIONS, RAW_CATEGORY_NAMES } from "../lib/thingsToDo.js";

let passed = 0;
const fail = (m) => { console.error("test-things-to-do-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/things-to-do/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/things-to-do/page.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. NO RAW CATEGORY NAMES ON SCREEN ----------------------------------
// The doctrine is curiosity labels; a raw category name as a section heading is
// the exact failure mode.
for (const raw of RAW_CATEGORY_NAMES) {
  ok(!new RegExp(`<h3[^>]*>\\s*${raw}\\s*<`, "i").test(uiCode), `a collection heading renders the raw category name "${raw}"`);
}
ok(COLLECTIONS.every((c) => !RAW_CATEGORY_NAMES.includes(c.label)), "a collection label became a raw category name");

// ---- 2. EVERY COLLECTION HAS A REASONING LINE ----------------------------
// A label without a stated reason is decoration, not intelligence.
const whyBlock = uiCode.slice(uiCode.indexOf("const WHY"), uiCode.indexOf("function useCenter"));
for (const c of COLLECTIONS) {
  ok(whyBlock.includes(`"${c.id}"`), `collection "${c.id}" has no reasoning line — every label must say what qualified it`);
}
ok(/WHY\[col\.id\]/.test(uiCode), "the reasoning line must actually render");

// ---- 3. "LOCALS" STAYS BACKED BY GOOGLE REVIEW VOLUME --------------------
const locals = COLLECTIONS.find((c) => c.id === "locals-recommend");
ok(!!locals, "the locals-recommend collection is gone");
ok(locals.pick({ rating: 4.9, reviewCount: 100 }) === false, "a place with few reviews must NOT qualify as locals-recommended");
ok(locals.pick({ rating: 4.7, reviewCount: 800 }) === true, "high rating + high review volume must qualify");
ok(/hundreds of nearby reviewers/i.test(ui), "the locals reasoning must attribute the claim to review volume, not to Wayfind's own engagement");
ok(!/engagementMap:/.test(uiCode), "the engagement boost must stay unwired while it is 7 devices — it cannot order anything and must not imply local consensus");

// ---- 4. DEDUPE REACHES THE SCREEN ----------------------------------------
// Behavioural: the same place must never appear in two rendered collections.
const p = (id, o) => ({ place_id: id, name: id, lat: 27.34, lng: -82.53, ...o });
const cols = buildCollections([
  p("a", { rating: 4.8, reviewCount: 120 }), p("b", { rating: 4.6, reviewCount: 90 }), p("c", { rating: 4.7, reviewCount: 200 }),
  p("d", { rating: 4.8, reviewCount: 1500 }), p("e", { rating: 4.7, reviewCount: 900 }), p("f", { rating: 4.9, reviewCount: 2200 }),
  // distant + highly rated -> worth-the-drive (12-45mi from centre)
  p("d1", { rating: 4.7, reviewCount: 400, lat: 27.57, lng: -82.71 }), p("d2", { rating: 4.8, reviewCount: 350, lat: 27.60, lng: -82.75 }), p("d3", { rating: 4.6, reviewCount: 420, lat: 27.58, lng: -82.72 }),
  // open now, rated just under the hidden-gem bar so they land in perfect-today
  p("g", { rating: 4.4, reviewCount: 60, openNow: true }), p("h", { rating: 4.35, reviewCount: 70, openNow: true }), p("i", { rating: 4.45, reviewCount: 80, openNow: true }),
], { center: { lat: 27.34, lng: -82.53 } });
const seen = new Set();
for (const c of cols) for (const pl of c.places) { ok(!seen.has(pl.place_id), `place ${pl.place_id} appears in two collections`); seen.add(pl.place_id); }
ok(cols.length >= 3 && cols.length <= 5, `expected 3–5 collections, got ${cols.length}`);
ok(/key=\{p\.place_id\}/.test(uiCode), "cards must be keyed by place_id so a duplicate would be visible, not silently merged");

// ---- 5. RENDER ONLY WHAT EXISTS ------------------------------------------
ok(/typeof p\.reviewCount === "number" && p\.reviewCount > 0/.test(uiCode), "review count must render only when it genuinely exists");
ok(/facts\.length \?/.test(uiCode), "a place with no facts must render no fact line rather than an empty one");

// ---- 6. GUARDRAILS -------------------------------------------------------
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page) && /!==\s*"1"/.test(page), "the route must be opt-in behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/wf_center/.test(ui) && /URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must be wf_center -> URL -> geolocation");
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the Things To Do UI (${coords.slice(0, 2).join(", ")})`);
for (const banned of ["Trending", "trending now", "crowd level", "Most Popular", "Everyone's going"]) {
  ok(!uiCode.includes(banned), `Things To Do renders "${banned}" — no trending/crowd source is wired`);
}

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — Things To Do must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

console.log(`test-things-to-do-ui: OK — ${passed} assertions (curiosity labels only; every collection states what qualified it; "locals" stays backed by review volume; dedupe holds; nothing invented)`);
