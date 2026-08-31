#!/usr/bin/env node
import { beachWaterBand, rankBeachesForToday, beachDecisionReason } from "../lib/beachDecision.js";

let pass = 0, fail = 0;
const ok = (condition, message) => condition ? pass++ : (fail++, console.error("  FAIL:", message));
const now = new Date("2026-08-31T12:00:00Z").getTime();
const water = (result, days = 1, advisory = false) => ({ result, advisory, sampled_at: new Date(now - days * 86400000).toISOString() });
const row = (id, score, w) => ({ id, governed_score: score, water: w });

ok(beachWaterBand(water("Good"), now) === "good", "fresh Good is decisional");
ok(beachWaterBand(water("Poor", 1, true), now) === "advisory", "advisory outranks the lab label");
ok(beachWaterBand(water("Good", 15), now) === "unknown", "a sample older than 14 days cannot decide today");
ok(beachWaterBand(null, now) === "unknown", "missing evidence is unknown, never fabricated");

const ranked = rankBeachesForToday([
  row("famous-poor", 9.9, water("Poor")),
  row("good", 8.8, water("Good")),
  row("moderate", 9.7, water("Moderate")),
  row("unknown", 9.8, null),
  row("advisory", 10, water("Good", 1, true)),
], now);
ok(ranked.map((p) => p.id).join(",") === "good,moderate,unknown,famous-poor,advisory",
  `water quality is primary (got ${ranked.map((p) => p.id).join(",")})`);

const sameBand = rankBeachesForToday([row("lower", 8.7, water("Good")), row("higher", 9.4, water("Good"))], now);
ok(sameBand[0].id === "higher", "Wayfind Score orders beaches inside the same water band");
ok(/current water sample is good/i.test(beachDecisionReason(water("Good"), now)), "winner reason states the evidence");
ok(beachDecisionReason(null, now) === null, "unknown water produces no invented explanation");

if (fail) process.exit(1);
console.log(`test-beach-decision: OK — ${pass} assertions; current water first, score within band, stale/unknown honest`);
