// scripts/test-buzz.mjs — the Buzz hero + drive rule + hero-image monitor locks.
import { readFileSync } from "fs";
import { pickBestPhoto } from "../lib/heroImage.js";
import { byVisibleScore } from "../lib/todaysBest.js";
import { governedWayfindScore, wayfindScore, CREATOR_VIDEO_BONUS, FAR_MILES, FAR_PENALTY } from "../lib/wayfindScore.js";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// THE GOVERNING LAW (owner, 2026-08-07 — lib/wayfindScore.js). The per-mile
// driveDeduction curve this file used to lock is retired: it was rank-only
// and invisible, which is how a shown 9.2 rendered below two shown 9.0s
// (owner's screenshot, Bradenton, 2026-08-07). The law: a creator video is a
// flat +2 (0.2 shown), strictly-past-17-miles is a flat −2 (0.2 shown), the
// number shown IS the number sorted, unrated stays null.
ok(CREATOR_VIDEO_BONUS === 2 && FAR_MILES === 17 && FAR_PENALTY === 2, "the law's constants are the owner's numbers");
ok(governedWayfindScore(90, {}) === 90, "no video, near: base untouched");
ok(governedWayfindScore(92, { hasCreatorVideo: true }) === 94, "a 9.2 with a creator video shows 9.4 — the owner's own example");
ok(governedWayfindScore(92, { distanceMi: 20 }) === 90, "a 9.2 past 17 miles shows 9.0 — the owner's own example");
ok(governedWayfindScore(92, { distanceMi: 17 }) === 92, "17.0 miles exactly is NOT past 17 — strictly greater only");
ok(governedWayfindScore(90, { hasCreatorVideo: true, distanceMi: 30 }) === 90, "both terms stack: +2 then −2");
ok(governedWayfindScore(99, { hasCreatorVideo: true }) === 100, "clamped at 100 so toDisplayScore never nulls a boosted great place");
ok(governedWayfindScore(null, { hasCreatorVideo: true }) === null, "unrated stays null — a video cannot invent a score");
ok(governedWayfindScore(90, { distanceMi: null }) === 90 && governedWayfindScore(90, { distanceMi: NaN }) === 90, "unknown distance: no deduction (tours have no coords)");
// Sort parity: byVisibleScore orders by the same governed number the chip
// shows, and carries it on the row as governed_score.
const near = { id: "a", rating: 4.6, reviews: 3000, distance_mi: 5, kind: "place" };
const far = { id: "b", rating: 4.9, reviews: 5000, distance_mi: 30, kind: "place" };
const sorted = byVisibleScore([near, far]);
ok(sorted[0].id === "b", "past-17 costs exactly 2 points shown — a 9.6 thirty miles out still beats a 9.1 nearby, and the chip says so");
ok(sorted.every((r) => r.governed_score === governedWayfindScore(wayfindScore(r.rating, r.reviews), { hasCreatorVideo: !!r.creator_video, distanceMi: isFinite(r.distance_mi) ? r.distance_mi : null })), "the sort key IS the governed displayed score, carried on the row");
ok(sorted.find((r) => r.id === "b").drive_deduction === 0.2, "the flat deduction is carried for the card's honest why-note");
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
