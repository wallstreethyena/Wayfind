// Lock test: Personalization (§7) orchestration.
//
// scripts/test-personalization.mjs pins the ORDERING ENGINE. This pins the hinge
// the engine cannot defend itself against: `available`.
//
// orderSections() will faithfully order whatever it is handed. If a future edit
// stubs `available` to true, the page still renders — and silently claims to
// have arranged itself around real content while showing empty sections. That is
// the one failure here that looks like success, so it is what this test attacks.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { orderSections, SECTIONS } from "../lib/personalization.js";

let passed = 0;
const fail = (m) => { console.error("test-personalization-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/home/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/home/page.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. AVAILABILITY COMES FROM REAL ASSEMBLERS, NEVER STUBBED -----------
ok(!/available\s*=\s*\{[^}]*:\s*true[,\s}]/.test(uiCode.replace(/\s+/g, " ")),
  "a section's availability is hardcoded true — availability MUST come from that section's own data returning content");
for (const [id, call] of [
  ["live-picks", "rankLivePicks"],
  ["sports", "rankSports"],
  ["things-to-do", "buildCollections"],
  ["food", "buildFoodCollections"],
  ["shopping", "pickShoppingHero"],
  ["morning-picks", "isMorning"],
]) {
  ok(uiCode.includes(call), `availability for "${id}" must be derived by calling ${call} on real data`);
}
ok(/beach:\s*probe\.beachShow/.test(uiCode), "beach availability must come from the beach engine's own show decision");
ok(/\/api\/beach\/conditions/.test(uiCode) && /\/api\/events/.test(uiCode) && /\/api\/places\/search/.test(uiCode),
  "the orchestrator must probe the real endpoints, not assume content exists");

// ---- 2. ONLY REAL CONTEXT SIGNALS ORDER THE PAGE -------------------------
for (const banned of ["trending", "socialScore", "crowdLevel", "traffic", "popularity"]) {
  ok(!new RegExp(`\\b${banned}\\b`, "i").test(uiCode.replace(/no trending, social, crowd or traffic data/i, "")),
    `the orchestrator references "${banned}" — that signal has no wired source and must not influence ordering`);
}
ok(/hour|isWeekend|season|weather/.test(uiCode), "ordering context must be built from time/weekend/season/weather");

// ---- 3. ORDER IS THE ENGINE'S, AND IT RENDERS ----------------------------
ok(/orderSections\(/.test(uiCode), "the page must order through orderSections");
ok(/order\.map\(\(id\)/.test(uiCode), "the page must render in the engine's order");
ok(!/\.sort\(/.test(uiCode), "the orchestrator must not re-sort the engine's output");

// ---- 4. BEHAVIOURAL: THE PAGE REALLY DOES REARRANGE ----------------------
const all = Object.fromEntries(SECTIONS.map((s) => [s, true]));
const morning = orderSections({ hour: 9, isWeekend: false, season: "summer", weather: { condition: "clear" }, available: { ...all } });
const evening = orderSections({ hour: 19, isWeekend: false, season: "summer", weather: { condition: "clear" }, available: { ...all } });
const rainy = orderSections({ hour: 13, isWeekend: false, season: "summer", weather: { condition: "rain", isBad: true }, available: { ...all } });
ok(JSON.stringify(morning) !== JSON.stringify(evening), "morning and evening must not produce the same page");
ok(morning.includes("morning-picks") && !evening.includes("morning-picks"), "morning-picks must appear in the morning and be gone by evening");
ok(!rainy.includes("beach"), "rain must drop the beach section entirely");
ok(morning[0] === "live-picks" && evening[0] === "live-picks" && rainy[0] === "live-picks", "live-picks must lead every arrangement");
// unavailable sections vanish — the honesty hinge, end to end
const noContent = orderSections({ hour: 9, isWeekend: false, season: "summer", weather: { condition: "clear" }, available: { ...all, food: false, shopping: false, beach: false } });
ok(!noContent.includes("food") && !noContent.includes("shopping") && !noContent.includes("beach"),
  "sections whose data produced nothing must not appear at all");
ok(JSON.stringify(orderSections({ hour: 9, isWeekend: false, season: "summer", weather: { condition: "clear" }, available: { ...all } })) === JSON.stringify(morning),
  "the same context must always produce the same page");

// ---- 5. THE ARRANGEMENT LINE IS DERIVED, NOT DECORATIVE ------------------
ok(/function arrangementLine/.test(uiCode), "the page must state WHY it is arranged this way");
ok(/arrangementLine\(\{\s*hour:\s*ctx\.hour/.test(uiCode), "the arrangement line must be derived from the SAME context that ordered the page");

// ---- 6. GUARDRAILS -------------------------------------------------------
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page) && /!==\s*"1"/.test(page), "the route must be opt-in behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/wf_center/.test(ui) && /URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must be wf_center -> URL -> geolocation");
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the orchestrator (${coords.slice(0, 2).join(", ")})`);

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — the orchestrator must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

console.log(`test-personalization-ui: OK — ${passed} assertions (availability derived from real assemblers and never stubbed; only real context orders the page; it genuinely rearranges; absent sections vanish)`);
