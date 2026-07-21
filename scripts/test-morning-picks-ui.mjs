// Lock test: Morning Picks (§3) wiring + honesty rules.
//
// scripts/test-morning-picks.mjs pins the GATE + selection module. This pins the
// wiring around it, which is where the section is most likely to quietly break:
//
//   1. the gate is LOCATION-local, not site-local (the whole point of §3)
//   2. after 11:00 the section renders NOTHING — not a placeholder
//   3. no unearned superlatives ("Best Coffee", "#1 Cafe")
//   4. no invented crowd / wait-time data
//   5. location is the user's; flag-gated; home.js + Viator untouched
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { isMorning, getMorningPick, MORNING_HEADLINES } from "../lib/morningPicks.js";

let passed = 0;
const fail = (m) => { console.error("test-morning-picks-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/morning-picks/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/morning-picks/page.js", import.meta.url), "utf8");
const weather = readFileSync(new URL("../app/api/weather/route.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. THE GATE IS LOCATION-LOCAL ---------------------------------------
// Site-time gating would hide the section for a user searching a west-coast
// city mid-afternoon ET, when it is still morning there.
ok(/\/api\/weather\?lat=/.test(uiCode), "the timezone must come from /api/weather (Open-Meteo timezone=auto), not be assumed");
ok(/d\.timezone/.test(uiCode), "the resolved IANA timezone must actually be read from the weather response");
ok(/tz:\s*tz\s*\|\|\s*undefined/.test(uiCode), "a failed timezone lookup must fall back to the module default, never to a guessed zone");
ok(/timezone=auto/.test(weather), "app/api/weather must keep requesting timezone=auto — §3's gate depends on it");
// behavioural: same instant, two zones, opposite answers
const t = new Date("2026-07-21T15:30:00Z"); // 11:30 ET / 08:30 PT
ok(isMorning(t, "America/New_York") === false, "11:30 ET must not be morning");
ok(isMorning(t, "America/Los_Angeles") === true, "08:30 PT must be morning — the gate is location-local");

// ---- 2. AFTER 11:00 THE SECTION IS ABSENT --------------------------------
ok(/if \(!pick\.show\)/.test(uiCode), "the hidden branch must exist");
ok(/return nowOverride \?/.test(uiCode) && /: null;/.test(uiCode),
  "when hidden the section must return null in normal use — a 'come back later' placeholder is still a section on the page");
const late = getMorningPick([{ place_id: "a", name: "Cafe", types: ["cafe"], rating: 4.9 }], { now: new Date("2026-07-21T16:00:00Z"), tz: "America/New_York" });
ok(late.show === false, "after 11:00 local the module must not offer a pick");

// ---- 3. NO UNEARNED SUPERLATIVES -----------------------------------------
for (const banned of ["Best Coffee", "best coffee", "Top Cafe", "Top Café", "#1 Cafe", "Voted Best", "Award Winning"]) {
  ok(!uiCode.includes(banned), `Morning Picks renders "${banned}" — Wayfind has no source that ranks cafés that way`);
}
ok(MORNING_HEADLINES.every((h) => !/best coffee|top cafe/i.test(h)), "a story headline must not become a superlative");

// ---- 4. NO INVENTED CROWD DATA -------------------------------------------
for (const banned of ["wait time", "Wait Time", "busy right now", "crowd level", "Usually busy", "Less crowded"]) {
  ok(!uiCode.includes(banned), `Morning Picks implies "${banned}" — no crowd/wait source is wired`);
}
ok(/doesn’t have\s*\n?\s*crowd or wait-time data|crowd or wait-time data/.test(ui),
  "the section must state the crowd/wait-time gap rather than leave it implied");

// ---- 5. GUARDRAILS -------------------------------------------------------
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page) && /!==\s*"1"/.test(page), "the route must be opt-in behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/wf_center/.test(ui) && /URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must be wf_center -> URL -> geolocation");
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the Morning Picks UI (${coords.slice(0, 2).join(", ")}) — location is always the user's`);

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — Morning Picks must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

console.log(`test-morning-picks-ui: OK — ${passed} assertions (gate is location-local via real Open-Meteo tz; hidden means absent; no superlatives; no invented crowd data; lanes untouched)`);
