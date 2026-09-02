import { readFileSync } from "node:fs";
import { dailyTrendIntelligence, trendItemStatus, validateDailyTrendReport } from "../lib/dailyTrendReport.js";

let pass = 0;
function ok(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  pass++;
  console.log(`  ✓ ${message}`);
}

const report = JSON.parse(readFileSync(new URL("../data/trend-reports/latest.json", import.meta.url), "utf8"));
const checked = validateDailyTrendReport(report);
ok(checked.ok, `the supplied report satisfies the typed contract (${checked.errors.join("; ")})`);
ok(checked.count === 20, "all 20 supplied phrases are preserved exactly once");

const out = dailyTrendIntelligence({ nowMs: Date.parse("2026-09-02T16:00:00Z"), input: report });
ok(out.intelligence.length === 12 && out.leads.length === 8, "signals split into 12 intelligence rows and 8 actionable leads");
ok(out.safeguards.affectsDisplayedWayfindScore === false, "a daily report cannot alter the displayed Wayfind Score");
ok(out.safeguards.publishesCardsAutomatically === false, "a daily report cannot publish a place or event card");
ok(out.safeguards.startsGooglePlaceCalls === false, "reading the report spends no Google Places calls");

const related = out.intelligence.find((item) => item.rank === 1);
ok(related.valueLabel === "Related score 43", "the score is labelled as a related query score, never volume");
const held = out.intelligence.find((item) => item.rank === 18);
ok(held.status.key === "held" && held.valueLabel === "No volume claimed", "an unmeasured phrase is held without a trend claim");
const blues = out.leads.find((item) => item.rank === 12);
ok(blues.status.key === "expired", "yesterday's concert expires instead of lingering as a live lead");
const rays = out.leads.find((item) => item.rank === 17);
ok(rays.status.key === "live", "the final Rays home game remains live through its event date");
const yellowcard = out.leads.find((item) => item.rank === 13);
ok(yellowcard.status.key === "upcoming", "a future verified event remains upcoming");
ok(trendItemStatus(yellowcard, { nowMs: Date.parse("2026-09-05T16:00:00Z") }).key === "expired", "event leads expire the day after their official end date");

const duplicate = structuredClone(report);
duplicate.items[1].rank = duplicate.items[0].rank;
ok(validateDailyTrendReport(duplicate).ok === false, "duplicate ranks fail validation loudly");
const wrongMetric = structuredClone(report);
wrongMetric.items[0].metric.name = "search_volume";
ok(validateDailyTrendReport(wrongMetric).ok === false, "an invented search volume field fails validation loudly");

const route = readFileSync(new URL("../app/api/command-center/[panel]/route.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/command-center/ui.js", import.meta.url), "utf8");
ok(route.includes('case "intelligence": data = intelligence(now); break;'), "the owner only API exposes the intelligence panel through its authenticated choke point");
ok(ui.includes('<IntelligenceSection auth={auth} />'), "the Command Center renders Intelligence and Leads");

console.log(`test-daily-trend-intelligence: OK, ${pass} assertions`);
