// Guardrail: the Today's Best hero card (issue #232), first card on the homepage.
//
// Three things must stay true:
//   1. it NEVER touches a Viator lane file — it goes through /api/experiences,
//      which reads the cached wf_experiences table (CLAUDE.md locks the rest)
//   2. it renders only what the row actually carries — no invented rating,
//      price or duration
//   3. it hides rather than showing a thin rail
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0;
const fail = (m) => { console.error("test-todays-best: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const i = src.indexOf("function TodaysBestRail(");
ok(i !== -1, "TodaysBestRail is gone from app/home.js");
const block = src.slice(i, src.indexOf("function HooksBanner(", i));
const code = block.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. THE VIATOR LANE IS NOT TOUCHED -----------------------------------
ok(/\/api\/experiences\?/.test(code), "must source activities from /api/experiences (cached wf_experiences), not a Viator endpoint");
for (const locked of ["bookingResolver", "verifiedOffers", "viatorServer", "/api/viator", "experienceGoUrl", "ticketsUrl", "viatorApiProductUrl"]) {
  ok(!code.includes(locked), `Today's Best references ${locked} — that is a locked Viator lane file (CLAUDE.md)`);
}
ok(/Aff\.viatorDirectUrl\(/.test(code), "the outbound link must use the already-exported Aff.viatorDirectUrl so attribution is kept without editing affiliates.js");

// ---- 2. RENDER ONLY WHAT EXISTS ------------------------------------------
ok(/typeof t\.rating === "number"/.test(code), "rating must render only when the row carries a real number");
ok(/t\.duration \?|if \(t\.duration\)/.test(code), "duration must be conditional");
ok(/typeof t\.fromPrice === "number"/.test(code), "price must render only when fromPrice is a real number — never a placeholder");
ok(/t\.image \?/.test(code), "a missing image must fall back to the gradient, not render a broken img");
for (const banned of ["Selling Fast", "% match", "Most Popular", "crowd", "Trending", "Best Price", "Sold Out"]) {
  ok(!code.includes(banned), `Today's Best renders "${banned}" — no wired source backs that claim`);
}

// ---- 3. HIDE RATHER THAN SHOW A THIN RAIL --------------------------------
ok(/items\.length < 2\) return null/.test(code), "fewer than 2 activities must render nothing — a thin rail is worse than no rail");
ok(/res\.dark/.test(code), "a dark/unconfigured experiences table must degrade to empty, not crash");

// ---- 4. PLACEMENT + LANES ------------------------------------------------
ok(src.indexOf("<TodaysBestRail") < src.indexOf("Wayfind Picks (issue #228)"),
  "Today's Best must be the FIRST hero card — above Wayfind Picks and above Happening near you");
ok(/frontPageEvents\(usable, eventBucket\)/.test(src), "the existing Happening-near-you hero must remain (test-front-events locks it)");

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — a locked Viator lane file (CLAUDE.md)`);
  }
}

console.log(`test-todays-best: OK — ${passed} assertions (sources via /api/experiences, no locked Viator file touched, renders only real fields, hides when thin, stays the first card)`);
