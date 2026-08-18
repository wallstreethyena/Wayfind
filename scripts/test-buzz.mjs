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
// v8 (2026-08-15) — THE BUZZ HERO SLIDE IS GONE, and with it the wf_buzz_picks
// RPC and the /api/buzz/why LLM call that fired on every homepage load for a
// card nothing rendered any more.
//
// THE HONESTY CONTRACT DID NOT GO. It moved to the `trending` RAIL, and the
// rail's version is stricter, because the failure mode is the same one this
// block was written for: claiming demand that does not exist. The old slide
// had a fallback line for every case; the rail has none. If nothing near the
// reader clears lib/trendSignal.js TREND_THRESHOLD, "Exploding Trends Near
// You" ships EMPTY rather than showing a place with no signal behind it —
// measured on the preview 2026-08-15 in Sarasota, where it does exactly that.
{
  const railSelect = readFileSync(new URL("../lib/railSelect.js", import.meta.url), "utf8");
  const railsData = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");
  ok(!/supabase\.rpc\("wf_buzz_picks"/.test(home), "the buzz hero RPC is back in app/home.js — nothing on that page renders it");
  // Checked as a CALL, not as a string: the v8 note in app/home.js explaining
  // this removal names the endpoint, and TrendingNowClient.js still uses it
  // legitimately on its own page. A guard that fires on its own rationale is a
  // guard someone deletes.
  ok(!/fetch\("\/api\/buzz\/why"/.test(home), "the buzz why-line LLM call is back on the homepage's critical path");
  // v8.6 — RE-POINTED TO THE ACTUAL RULE, which is stronger than what was here.
  //
  // These two pinned the rail to `pick: (p) => !!p.trending` and to ordering by
  // trend_score. The INTENT was "never fake velocity" — never let this rail
  // claim spiking demand on a signal that is not a spike.
  //
  // Pinning the implementation turned out to protect the wrong half. The
  // trend flag is fed by wf_place_popularity, which holds 164 rows, ALL
  // wikipedia, so restaurants and bars could never qualify and the rail shipped
  // empty in the flagship metro for three sessions while these assertions
  // stayed green. A rail that is always empty makes no false claim, so the
  // guard was satisfied and the product was broken.
  //
  // The owner's option (b) moved it to review volume — 100% coverage, real
  // demand, but CUMULATIVE, not a spike — and renamed it to match. So the rule
  // that actually matters is a RELATIONSHIP: the headline and the signal must
  // agree. Spike words are only allowed over the spike flag.
  {
    const flat = railSelect.replace(/\n\s*/g, " ");
    const cfg = (flat.match(/trending: \{.*?\},\s*\/\/|trending: \{.*?\}\s*,/) || [""])[0];
    const gatesOnSpike = /pick: \(p\) => !!p\.trending/.test(cfg);
    const railsSrc = readFileSync("lib/rails.js", "utf8");
    const railRow = (railsSrc.match(/\{ id: "trending",[\s\S]*?\},/) || [""])[0];
    const SPIKE_WORDS = /exploding|spiking|spike|trending now|everyone'?s searching|blowing up/i;
    const copy = railRow.replace(/\/\/[^\n]*/g, " ");
    const claimsSpike = SPIKE_WORDS.test(copy);
    ok(!claimsSpike || gatesOnSpike,
      "the trending rail's COPY claims a spike (exploding/spiking/everyone's searching) while its selector does not gate on the real trend flag — that is the one unfalsifiable claim on the page. Either gate on p.trending or rename the rail to what the signal supports.");
    // v8.10 — creator evidence joined the accepted signals: a real creator
    // video (hasCreatorVideoAt / the creators pool's _creatorSourced marker)
    // is a verifiable "people are talking about this" fact this repo can
    // evidence, same class as the spike flag. Review VOLUME left the selector
    // with the v8.7 blend, so it left this list too.
    ok(gatesOnSpike || /p\.trending/.test(cfg) && /hasCreatorVideoAt|_creatorSourced/.test(cfg),
      "the trending rail gates on neither the trend flag nor creator evidence — whatever it is selecting on, it is not a demand signal this repo can evidence");
  }
  ok(/MIN_CARDS/.test(railsData) || /MIN_CARDS/.test(railSelect),
    "a rail that cannot fill honestly must ship empty — that floor is what stops a demand claim with no demand behind it");
  ok(/ships EMPTY/.test(railSelect) || /ship the rail with no cards/.test(railsData),
    "…and the reason must be written down where the next person changing it will read it");
}
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
