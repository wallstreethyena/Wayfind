// Lock test: Live Picks (§1) wiring + honesty rules.
//
// scripts/test-live-picks.mjs already pins the SCORER. This pins everything
// around it — the parts a future edit is most likely to quietly violate:
//
//   1. no fabricated popularity language ever reaches the screen
//   2. "Popular on Wayfind" requires a REAL threshold, not merely ">0"
//   3. location is the user's (wf_center -> URL -> geolocation), never hardcoded
//   4. the section is flag-gated and cannot leak to users
//   5. app/home.js and the Viator lane are untouched by this section
//   6. optional signals degrade instead of breaking
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0;
const fail = (m) => { console.error("test-live-picks-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/live-picks/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/live-picks/page.js", import.meta.url), "utf8");
const demand = readFileSync(new URL("../app/api/events/demand/route.js", import.meta.url), "utf8");
const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. NO FABRICATED POPULARITY -----------------------------------------
// There is no wired source for ticket demand, trends, social or crowd levels.
// These phrases claim one. Comments may discuss them; rendered strings may not.
for (const banned of ["Selling Fast", "Selling fast", "Everyone's Talking", "Everyone’s Talking", "Trending on Google", "Going Viral", "Almost Sold Out", "Hot Right Now", "crowd level", "buzz score"]) {
  ok(!uiCode.includes(banned), `Live Picks renders "${banned}" — no wired source backs that claim. Omit it, never fabricate.`);
}

// ---- 2. THE POPULARITY TAG NEEDS A REAL BAR ------------------------------
ok(/const POPULAR_MIN_OPENS = (\d+)/.test(ui) && /const POPULAR_MIN_DEVICES = (\d+)/.test(ui),
  "the Popular-on-Wayfind thresholds are gone");
const minOpens = Number(ui.match(/const POPULAR_MIN_OPENS = (\d+)/)[1]);
const minDev = Number(ui.match(/const POPULAR_MIN_DEVICES = (\d+)/)[1]);
ok(minOpens >= 3, `POPULAR_MIN_OPENS=${minOpens} is too low — measured 2026-07-21 the busiest event had ONE open; a low bar turns one click into a public "popular" claim`);
ok(minDev >= 2, `POPULAR_MIN_DEVICES=${minDev} is too low — distinct devices is what separates a crowd from one enthusiastic user`);
ok(/isPopular\s*=\s*\(d\)\s*=>/.test(ui) && /devices\s*\|\|\s*0\)\s*>=\s*POPULAR_MIN_DEVICES/.test(ui),
  "isPopular must gate on distinct devices as well as opens");
// behavioural: the real 2026-07-21 data must NOT qualify
const isPopular = (d) => !!d && (d.opens || 0) >= minOpens && (d.devices || 0) >= minDev;
ok(!isPopular({ opens: 1, ticketOuts: 0, devices: 1 }), "one open from one device must NOT read as popular");
ok(!isPopular({ opens: 20, ticketOuts: 5, devices: 1 }), "a single device must never qualify, however many opens");
ok(isPopular({ opens: minOpens, ticketOuts: 0, devices: minDev }), "a genuine crowd must still qualify once traffic grows");

// ---- 3. LOCATION IS THE USER'S -------------------------------------------
ok(/wf_center/.test(ui), "location must read the stored wf_center");
ok(/URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must fall back URL -> geolocation");
// no hardcoded Florida coordinates anywhere in the section
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the Live Picks UI (${coords.slice(0, 3).join(", ")}) — location is ALWAYS the user's center`);

// ---- 4. FLAG-GATED -------------------------------------------------------
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page), "the route must be gated behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/!==\s*"1"/.test(page), "the flag must be opt-IN (off by default), so a half-built section cannot reach users");

// ---- 5. LANE DISCIPLINE --------------------------------------------------
// This section must never touch the live homepage or the Viator lane.
let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  const forbidden = ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"];
  for (const f of forbidden) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — Live Picks must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

// ---- 6. DEGRADE, DON'T BREAK ---------------------------------------------
ok(/demandMap:\s*demandMap\s*\|\|\s*undefined/.test(ui), "a missing demand map must degrade to undefined so the scorer's boost is 0, not crash");
ok(/source:\s*"unconfigured"/.test(demand) && /source:\s*"error"/.test(demand), "the demand route must fail soft to an empty map");
ok(!/device_id\s*:/.test(demand.slice(demand.indexOf("const demand = {}"))), "the demand route must return AGGREGATES only — never device_id or any raw row");
ok(/"\/api\/events\/demand"/.test(mw), "/api/events/demand must be in the middleware matcher (same-origin anti-scrape)");

// ---- 7. THE INTELLIGENCE IS VISIBLE AND HONEST ---------------------------
ok(/Curated by Wayfind AI/.test(ui), "the Wayfind-AI badge is required on every V2 section");
ok(/Chosen from \{all\.length\} events/.test(ui), "the badge must state the REAL considered count, not a round number");
ok(/aren’t available from any source Wayfind trusts yet|aren't available from any source/.test(ui),
  "the section must surface the data gap (trends/demand unsourced) rather than hide it");

console.log(`test-live-picks-ui: OK — ${passed} assertions (no fabricated popularity; the Popular tag needs a real crowd; location is the user's; flag-gated; home.js + Viator untouched; degrades cleanly)`);
