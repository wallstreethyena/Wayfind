// Lock test: Beach Intelligence (§0) wiring + safety rules.
//
// scripts/test-marine.mjs pins the SCORER's gates. This pins the wiring, where
// the danger is different and worse: a UI that renders a cheerful beach card
// while an NWS rip-current warning is active is actively harmful — worse than
// having no section. So the safety gate must reach the screen, and the section
// must never invent crowd or parking data it has no source for.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { scoreBeachDay } from "../lib/marine.js";

let passed = 0;
const fail = (m) => { console.error("test-beach-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/beach/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/beach/page.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/beach/conditions/route.js", import.meta.url), "utf8");
const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. THE SAFETY GATE REACHES THE SCREEN -------------------------------
ok(/if \(!data\.show\)/.test(uiCode), "the UI must branch on the engine's show decision");
ok(!/data\.show\s*\|\|/.test(uiCode) && !/show:\s*true/.test(uiCode), "the UI must never override or default the show decision to true");
ok(/status === "unsafe"/.test(uiCode), "an unsafe verdict must be surfaced explicitly, not folded into a generic empty state");
ok(/a\.unsafe/.test(uiCode), "the NWS alerts shown must be the ones flagged unsafe");
ok(/National Weather Service/.test(ui), "the safety source must be attributed on screen");
// behavioural: an active alert on an otherwise perfect day must still block
const perfectButUnsafe = scoreBeachDay({ hasUnsafe: true, airTempMaxF: 85, waterTempF: 84, precipProbMaxPct: 0, uvIndexMax: 6 }, 2);
ok(perfectButUnsafe.show === false && perfectButUnsafe.status === "unsafe",
  "an active water-safety alert must block the hero even when every other signal is ideal");

// ---- 2. NO INVENTED DATA -------------------------------------------------
// Crowd levels and parking have NO source (see docs/HOMEPAGE_V2_DATA_SOURCES.md).
for (const banned of ["crowd level", "Crowd Level", "Usually busy", "Parking available", "parking spots", "Less crowded", "Crowds:", "Busy now"]) {
  ok(!uiCode.includes(banned), `Beach section renders "${banned}" — no crowd/parking source is wired. Omit it, never estimate.`);
}
ok(/no crowd or parking data/.test(ui), "the section must state the crowd/parking gap rather than leave it implied");

// ---- 3. RENDER ONLY WHAT EXISTS ------------------------------------------
ok(/if \(value == null \|\| value === ""\) return null;/.test(uiCode), "a stat with no value must render nothing, never a placeholder or a zero");

// ---- 4. WIRING -----------------------------------------------------------
ok(/"\/api\/beach\/conditions"/.test(mw), "/api/beach/conditions must be in the middleware matcher — its own route comment requires it");
ok(/show: false/.test(route), "the route must fail soft to {show:false} so the section hides instead of erroring the page");
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page) && /!==\s*"1"/.test(page), "the route must be opt-in behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/wf_center/.test(ui) && /URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must be wf_center -> URL -> geolocation");
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the Beach UI (${coords.slice(0, 2).join(", ")}) — the engine is location-general by design`);

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — Beach Intelligence must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

console.log(`test-beach-ui: OK — ${passed} assertions (safety gate reaches the screen and cannot be overridden; NWS attributed; no invented crowd/parking; route guarded + fail-soft)`);
