#!/usr/bin/env node
// scripts/check-featured-creator-score.mjs — locks the owner's 2026-10-29 rule:
//
//   "when there is a cindy.selects video the wayfind score increases by 0.3 …
//    if the business is below 9; if above 9 it will increase 0.1. make this a
//    global rule."
//
// Owner's choices the same day: it STACKS on the +0.2 any creator video earns
// (so +0.5 under 9.0, +0.3 at 9.0+), and it is DISCLOSED ("Cindy Selects pick" on
// the card, her real connection on her page). Every assertion here CALLS the
// real code: the score law, the creator-term helper every home.js rank site
// uses, the displayed-score path, the lawful sort and todaysBest.
import { governedWayfindScore, creatorVideoTerm, CREATOR_VIDEO_BONUS, FEATURED_VIDEO_TIER,
  FEATURED_VIDEO_BONUS_LOW, FEATURED_VIDEO_BONUS_HIGH } from "../lib/wayfindScore.js";
import { hasFeaturedCreatorVideoAt, creatorEvidenceTerm, displayedWfScore } from "../lib/creatorBoost.js";
import { governedScoreOf } from "../lib/lawfulOrder.js";
import { byVisibleScore } from "../lib/todaysBest.js";
import { FEATURED_CREATOR, creatorVideosFor } from "../lib/creatorVideos.js";
import { FEATURED_CREATOR_DISCLOSURE, claimsAffiliation } from "../lib/creatorRights.js";
import { readFileSync } from "node:fs";

let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

// ── 1. The numbers are the owner's ──────────────────────────────────────────
ok(FEATURED_VIDEO_BONUS_LOW === 3 && FEATURED_VIDEO_BONUS_HIGH === 1 && FEATURED_VIDEO_TIER === 90,
  "+0.3 under 9.0, +0.1 at 9.0 and up (internal 3 / 1, tier 90)");
ok(FEATURED_CREATOR === "cindy.selects", "the featured creator is cindy.selects");

// ── 2. The law itself ──────────────────────────────────────────────────────
ok(governedWayfindScore(85, { hasFeaturedCreatorVideo: true, hasCreatorVideo: true }) === 90, "8.5 with her video shows 9.0 (+0.2 creator +0.3 hers)");
ok(governedWayfindScore(89, { hasFeaturedCreatorVideo: true, hasCreatorVideo: true }) === 94, "8.9 with her video shows 9.4 (+0.5: tier reads the base)");
ok(governedWayfindScore(90, { hasFeaturedCreatorVideo: true, hasCreatorVideo: true }) === 93, "9.0 with her video shows 9.3 (+0.2 +0.1)");
ok(governedWayfindScore(95, { hasFeaturedCreatorVideo: true, hasCreatorVideo: true }) === 98, "9.5 with her video shows 9.8 (+0.3)");
ok(governedWayfindScore(100, { hasFeaturedCreatorVideo: true, hasCreatorVideo: true }) === 100, "never past 10.0");
ok(governedWayfindScore(85, { hasCreatorVideo: true }) === 85 + CREATOR_VIDEO_BONUS, "any other creator video keeps the flat +0.2");
ok(governedWayfindScore(85, { hasFeaturedCreatorVideo: true }) === 90, "her flag alone applies the term");
ok(governedWayfindScore(85, {}) === 85 && governedWayfindScore(null, { hasFeaturedCreatorVideo: true }) === null,
  "no video, no term; unrated stays null ('Score pending')");
ok(governedWayfindScore(85, { hasFeaturedCreatorVideo: true, hasCreatorVideo: true, distanceMi: 30 }) === 88, "the far deduction still applies after her term");
ok(creatorVideoTerm(92, true, true) === 3 && creatorVideoTerm(70, true, true) === 5 && creatorVideoTerm(70, true, false) === 2 && creatorVideoTerm(70, false, false) === 0,
  "creatorVideoTerm: featured high / featured low / other creator / none");
const trace = [];
governedWayfindScore(85, { hasFeaturedCreatorVideo: true, hasCreatorVideo: true }, trace);
ok(trace.length === 1 && trace[0].key === "featured_creator" && trace[0].delta === 5, "the receipt names the featured-creator step, once, with its real delta");

// ── 3. The resolver: real registry places ──────────────────────────────────
const bellabean = { id: "ChIJ6_hQr4AXw4gRwfUFqlfdRfA", name: "Bellabean", city: "Bradenton" };
const roses = { id: "ChIJ6cPIn0fiwogRklWu_EbSja0", name: "Rose's at St. Pete Athletic" };
ok(creatorVideosFor(bellabean).some((v) => v.creator === FEATURED_CREATOR), "positive control: Bellabean carries a cindy.selects video");
ok(hasFeaturedCreatorVideoAt(bellabean) === true, "hasFeaturedCreatorVideoAt finds her on Bellabean");
ok(creatorVideosFor(roses).length > 0 && hasFeaturedCreatorVideoAt(roses) === false, "negative control: another creator's place is not featured");
ok(hasFeaturedCreatorVideoAt({ id: "nope", name: "Nowhere Cafe" }) === false && hasFeaturedCreatorVideoAt(null) === false, "unknown places and null fail closed");
ok(creatorEvidenceTerm({ ...bellabean, wfScore: 85 }) === 5 && creatorEvidenceTerm({ ...bellabean, wfScore: 93 }) === 3, "home.js rank term: her place gets 5 under 9.0, 3 at 9.0+");
ok(creatorEvidenceTerm({ ...roses, wfScore: 85 }) === CREATOR_VIDEO_BONUS && creatorEvidenceTerm({ id: "x", name: "Nowhere", wfScore: 85 }) === 0, "home.js rank term: other creator 2, none 0");

// ── 4. Shown == sorted on every path that scores a place ───────────────────
ok(displayedWfScore({ ...bellabean, wfScore: 85 }) === 90, "displayedWfScore applies +0.5");
ok(displayedWfScore({ ...bellabean, wfScore: 93 }) === 96, "displayedWfScore applies +0.3");
const lawful = { ...bellabean, wfScore: 85 };
ok(governedScoreOf(lawful) === 90 && lawful.featured_creator_video === true, "the lawful sort scores 9.0 and records the verdict on the row");
const recomputed = { ...lawful, id: lawful.id, name: "renamed", governed_score: undefined };
delete recomputed.governed_score;
ok(governedScoreOf(recomputed) === 90, "a later city-less recompute keeps the recorded term");
// Two rows: Array.prototype.sort never calls the comparator for one row.
const tb = byVisibleScore([{ place_id: bellabean.id, id: bellabean.id, name: "Bellabean", rating: 4.9, reviews: 116, distance_mi: 3 },
  { place_id: roses.id, id: roses.id, name: roses.name, rating: 4.4, reviews: 13, distance_mi: 3 }]);
const tbB = tb.find((r) => r.id === bellabean.id), tbR = tb.find((r) => r.id === roses.id);
ok(tbB && tbB.featured_creator_video === true && tbR && tbR.featured_creator_video !== true, "todaysBest stamps the featured flag so the card can disclose it");

// ── 5. Disclosure is the condition it ships under ──────────────────────────
const HOME = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/label: hasFeaturedCreatorVideoAt\(p\) \? "Cindy Selects pick" : "Creator post"/.test(HOME), "the card chip names a Cindy Selects pick");
ok(!claimsAffiliation(FEATURED_CREATOR_DISCLOSURE) && /part of the Wayfind team/.test(FEATURED_CREATOR_DISCLOSURE) && /Score boost/.test(FEATURED_CREATOR_DISCLOSURE),
  "her disclosure states the connection and the boost, without a banned membership phrase");

if (fails.length) {
  console.error("check-featured-creator-score: FAIL\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log(`check-featured-creator-score: OK — ${n} assertions (+0.3 under 9.0, +0.1 at 9.0+, stacked on the +0.2, capped at 10.0, shown == sorted across law/display/lawful/todaysBest/home rank term, disclosed on card and page)`);
