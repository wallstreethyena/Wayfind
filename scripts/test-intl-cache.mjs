// scripts/test-intl-cache.mjs — locks the 2026-09-28 load-lag fix: the
// venue-local date helpers reuse ONE Intl.DateTimeFormat per (locale, options)
// instead of constructing a new one per call (~600 ms of a throttled home-page
// load). Behavior is asserted by CALLING the helpers; the static half forbids
// a raw `new Intl.DateTimeFormat(` from coming back into the hot helpers.
import { readFileSync } from "node:fs";
import { dtf } from "../lib/intlCache.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { siteHourFloat, siteDayOfWeek } from "../lib/nowContext.js";

let pass = 0;
const fail = (m) => { console.error("test-intl-cache: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const o = { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" };
ok(dtf("en-CA", o) === dtf("en-CA", { ...o }), "same (locale, options) returns the same instance");
ok(dtf("en-CA", o) !== dtf("en-US", o), "different locale is a different instance");
let threw = false; try { dtf("en-US", { timeZone: "Not/AZone" }); } catch (e) { threw = true; }
ok(threw, "an invalid zone still throws at the call site (callers' fallbacks keep working)");

// Venue-local truth across the 8 PM ET UTC rollover (the CLAUDE.md "today" rule).
const late = new Date("2026-09-29T02:30:00Z"); // 10:30 PM EDT, Mon Sep 28
ok(siteTodayStr(late) === "2026-09-28", "siteTodayStr stays on the ET day after 8 PM ET — got " + siteTodayStr(late));
ok(Math.abs(siteHourFloat(late) - 22.5) < 1e-9, "siteHourFloat reads ET — got " + siteHourFloat(late));
ok(siteDayOfWeek(late) === 1, "siteDayOfWeek reads the ET weekday (Mon=1)");
ok(siteHourFloat(late, "America/Los_Angeles") === 19.5, "an explicit zone is honored and cached separately");
const winter = new Date("2026-01-15T04:30:00Z"); // 11:30 PM EST, Jan 14
ok(siteTodayStr(winter) === "2026-01-14", "DST-aware in winter (EST)");

// Performance: the cached path must be dramatically cheaper than per-call construction.
const N = 3000;
let t = performance.now(); for (let i = 0; i < N; i++) siteTodayStr(); const cached = performance.now() - t;
t = performance.now(); for (let i = 0; i < N; i++) new Intl.DateTimeFormat("en-CA", o).formatToParts(new Date()); const raw = performance.now() - t;
ok(cached * 3 < raw, `cached siteTodayStr is >3x faster than constructing per call (cached ${cached.toFixed(0)}ms vs raw ${raw.toFixed(0)}ms)`);

// Static: the hot helpers never construct a formatter directly again.
for (const f of ["lib/siteTime.js", "lib/nowContext.js", "lib/eventResolve.js"]) {
  const code = readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");
  ok(!/new Intl\.DateTimeFormat\(/.test(code), f + " constructs no Intl.DateTimeFormat per call (use dtf from lib/intlCache.js)");
  ok(/import \{ dtf \} from "\.\/intlCache\.js"/.test(code), f + " imports dtf");
}
console.log(`test-intl-cache: OK — ${pass} assertions (one formatter per option set; ET day/hour/weekday unchanged; cached ${cached.toFixed(0)}ms vs raw ${raw.toFixed(0)}ms for ${N} calls)`);
