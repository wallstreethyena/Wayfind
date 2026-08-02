#!/usr/bin/env node
// test-experience-now-rank — lib/experienceNowRank.js's two ordering-only
// bonuses (discount depth, time-of-day fit) never overpower rating, never
// import commerce/payout data, and never gate anything — only nudge order.
//
// Owner: "make sure they are displayed by rating and discount, point based
// on the activity time of today — something great that is not the best time
// of the day should show lower in ranking."
import { readFileSync } from "node:fs";
import path from "node:path";
import { discountDepthPct, discountDepthBonus, textTimeLean, timeOfDayBonus } from "../lib/experienceNowRank.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// --- discount depth ---
ok(discountDepthPct("40% off") === 40, "reads a plain percent-off badge");
ok(discountDepthPct("Save 15% Off today") === 15, "reads percent-off inside a longer badge string");
ok(discountDepthPct("Half price entry") === 50, "half-price reads as 50%");
ok(discountDepthPct("Free entry") === 0, "a free/no-percent badge yields 0, not a fabricated number");
ok(discountDepthPct("") === 0 && discountDepthPct(null) === 0 && discountDepthPct(undefined) === 0, "empty/missing text is 0, never throws");
ok(discountDepthPct("250% off") === 0, "an impossible >100% figure is refused, not trusted verbatim");

ok(discountDepthBonus("100% off") === 0.5, "the discount bonus is capped at 0.5 even at 100% off");
ok(discountDepthBonus("20% off") < discountDepthBonus("80% off"), "a deeper discount earns a larger (but still small) bonus");
ok(discountDepthBonus("20% off") < 0.2, "a typical discount bonus stays a fraction of a rating point, never a dominant term");

// --- time-of-day lean (soft, ordering-only) ---
ok(textTimeLean("Sunset dinner cruise") === "night", "night-oriented text reads as a night lean");
ok(textTimeLean("Farm-to-table breakfast tour") === "morning", "morning-oriented text reads as a morning lean");
ok(textTimeLean("Guided kayak eco tour") === null, "text with no time signal reads as no lean — never guessed");

ok(timeOfDayBonus("Sunset dinner cruise", 20) === 0.3, "a night pick gets a small bump at 8pm");
ok(timeOfDayBonus("Sunset dinner cruise", 8) === -0.3, "a night pick loses a little ground at 8am, never hidden — just a position");
ok(timeOfDayBonus("Farm-to-table breakfast tour", 8) === 0.3, "a morning pick gets a small bump at 8am");
ok(timeOfDayBonus("Farm-to-table breakfast tour", 20) === -0.3, "a morning pick loses a little ground at 8pm");
ok(timeOfDayBonus("Guided kayak eco tour", 8) === 0, "a pick with no time signal is never penalized or boosted");
ok(timeOfDayBonus("Sunset dinner cruise", 15) === 0, "mid-afternoon favors no lean either way");
ok(Math.abs(timeOfDayBonus("Sunset dinner cruise", 20)) < 0.5 && Math.abs(discountDepthBonus("100% off")) <= 0.5,
  "both bonuses stay small relative to a rating term that spans roughly 0-10.4");

// --- the module itself never becomes a commerce/payout backdoor ---
const src = readFileSync(path.resolve("lib/experienceNowRank.js"), "utf8");
ok(!/(?:from|require\()\s*["'][^"']*\bcommerce(?:\.m?js)?["']/.test(src),
  "lib/experienceNowRank.js does not import lib/commerce — no path for payout to reach an order");
// Checks for a FIELD READ (a payout/price value influencing the bonus), not
// the bare word — HALF_PRICE_RE legitimately matches the phrase "half price"
// inside a discount BADGE STRING, which is display text, not a payout figure.
ok(!/\.(fromPrice|price|commission|commission_estimate|payout|grossBookingValue|gross_booking_value)\b/.test(src),
  "the module never reads a price/commission/payout field off a pick — only rating/discount-badge-text/hour");

// --- consumers wire it in, and rankExperiences() itself stays untouched ---
const partner = readFileSync(path.resolve("app/components/IntentPartnerPick.js"), "utf8");
ok(/from "\.\.\/\.\.\/lib\/experienceNowRank"/.test(partner), "IntentPartnerPick imports the shared now-rank helpers");
ok(/discountDepthBonus\(/.test(partner) && /timeOfDayBonus\(/.test(partner), "IntentPartnerPick's evidenceScore applies both bonuses");
ok(/evidenceScore\(b\) - evidenceScore\(a\)/.test(partner), "the guarded evidence sort call itself is untouched");
ok(/if \(base < 0\) return base;/.test(partner), "unrated inventory (no rating evidence) is excluded from both bonuses and still sorts last");

const home = readFileSync(path.resolve("app/home.js"), "utf8");
ok(/from "\.\.\/lib\/experienceNowRank"/.test(home), "home.js imports the shared now-rank helpers");
ok(/sort\(\(a, b\) => b\.score - a\.score\)/.test(home), "UnifiedBrowseCommerceRail's guarded score sort call itself is untouched");
ok(/dBase > 0 \? dBase \+ discountDepthBonus/.test(home), "UnifiedBrowseCommerceRail's deal score keeps the -1 unrated sentinel and only bonuses rated deals");

const rankExpSrc = readFileSync(path.resolve("lib/experiencesData.js"), "utf8");
ok(!/experienceNowRank/.test(rankExpSrc), "rankExperiences itself is untouched — test-ranked-experience-rails.mjs's guarantee still holds unmodified");

if (fail.length) {
  console.error("test-experience-now-rank: FAIL");
  fail.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`test-experience-now-rank: OK — ${pass} assertions (discount-depth + time-of-day are small, capped, order-only, commerce-free, and wired into both mixed-provider rails)`);
