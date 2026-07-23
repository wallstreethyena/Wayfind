// scripts/test-buzz.mjs — the Buzz hero + drive rule + hero-image monitor locks.
import { readFileSync } from "fs";
import { pickBestPhoto } from "../lib/heroImage.js";
import { driveDeduction, byVisibleScore } from "../lib/todaysBest.js";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// The owner's drive rule, exact numbers (17 free, -0.2 per started 5mi block)
ok(driveDeduction(17) === 0 && driveDeduction(5) === 0 && driveDeduction(NaN) === 0, "17mi or less / unknown: no deduction");
ok(Math.abs(driveDeduction(18) - 0.2) < 1e-9 && Math.abs(driveDeduction(22.1) - 0.4) < 1e-9 && Math.abs(driveDeduction(32) - 0.6) < 1e-9, "-0.2 per started 5mi block past 17");
const near = { id: "a", rating: 4.6, reviews: 3000, distance_mi: 5, kind: "place" };
const far = { id: "b", rating: 4.8, reviews: 5000, distance_mi: 30, kind: "place" };
const sorted = byVisibleScore([far, near]);
ok(sorted[0].id === "a", "a 4.8 thirty miles out ranks below a 4.6 nearby (drive rule)");
ok(sorted.find((r) => r.id === "b").drive_deduction >= 0.4, "the deduction is carried for the card's honest why-note");
const tour = { id: "t", rating: 5, reviews: 900, kind: "experience" }; // no coords
ok(byVisibleScore([tour, near])[0].id === "t", "tours (no coords) take no deduction");

// hero-image picker: deterministic, landscape-only, >=800w, largest wins
ok(pickBestPhoto([{ name: "p/a", widthPx: 1600, heightPx: 900 }, { name: "p/b", widthPx: 2400, heightPx: 1400 }]).ref === "p/b", "largest qualifying landscape wins");
ok(pickBestPhoto([{ name: "p/p", widthPx: 900, heightPx: 1600 }]) === null, "portrait never picked for a hero");
ok(pickBestPhoto([{ name: "p/s", widthPx: 640, heightPx: 400 }]) === null, "sub-800px never picked");
ok(pickBestPhoto([]) === null && pickBestPhoto(null) === null, "no candidates -> null (fallback to current logic)");
ok(/qualifying/.test(pickBestPhoto([{ name: "p/a", widthPx: 1600, heightPx: 900 }]).reason), "the reason is recorded");

// Buzz honesty contract (source-level)
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes('supabase.rpc("wf_buzz_picks"'), "buzz slide reads the real popularity RPC");
ok(/\(r\.sources_count \|\| 0\) >= 1/.test(home), "buzz requires at least one REAL signal source");
ok(home.includes("On readers' radar near you"), "the single-source fallback claims only a LEVEL ('on the radar'), never a velocity ('than usual' — wf_buzz_picks has no baseline)");
ok(home.includes("Trending near you") && !/than usual|busiest|more people/i.test(home.match(/buzzWhy \|\|[\s\S]{0,220}/)[0]), "the rendered fallback line never claims a velocity or crowd (no baseline/door-count data)");
ok(home.includes('"Popular across " + buzzPick.sources_count + " local signals'), "the multi-source fallback is data-templated (real source COUNT only), no 'this week' freshness claim");
const why = readFileSync(new URL("../app/api/buzz/why/route.js", import.meta.url), "utf8");
ok(why.includes("THE SWAP TEST") && why.includes("NEVER INVENT") && why.includes("hidden gem, nestled, boasts, stunning"), "the why-line prompt carries the Wayfind editorial standard");
ok(why.includes('cget(ckey)') && why.includes("1 * DAY"), "why-lines pool-cached one day");
ok(/busiest|packed|wait time/.test(why) && /line = ""/.test(why), "output lint kills invented-crowd words");
const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
ok(mw.includes('"/api/buzz/why"'), "/api/buzz/why missing from the metered-API guard (the bestmove/why lesson)");
const cron = readFileSync(new URL("../app/api/cron/hero-images/route.js", import.meta.url), "utf8");
ok(cron.includes("CRON_SECRET") && cron.includes("pickBestPhoto"), "hero-image cron gate/picker intact");
const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
ok(v.crons.some((c) => c.path === "/api/cron/hero-images"), "hero-image cron unscheduled");
const ttd = readFileSync(new URL("../app/components/ThingsToDoList.js", import.meta.url), "utf8");
ok(ttd.includes("ranked lower for the drive"), "TTD card lost the honest drive note");

console.log(`test-buzz: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
