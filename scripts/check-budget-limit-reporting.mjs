#!/usr/bin/env node
// Locks budget-limit reporting (2026-10-13): every cap/gate refusal that writes a
// pulse starts "budget limit reached:", is NOT a deterministic (paging) prefix,
// and the Ticketmaster per-day stop-loss exists and runs before the monthly grant.
import { readFileSync } from "node:fs";
import {
  budgetLimitNote, budgetGateNote, isBudgetLimitNote,
  isDeterministicFailureNote, classifyHealth,
} from "../lib/jobPulse.js";
import { DAILY_LIMITS, eventProviderDailySku } from "../lib/eventProviderSpend.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error("FAIL: " + m); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p) => strip(readFileSync(p, "utf8"));

// 1. note shapes
ok(budgetLimitNote("details_pro", 6650, 6650) === "budget limit reached: details_pro 6650/6650", "budgetLimitNote shape");
ok(budgetGateNote("free").startsWith("budget limit reached: paid generation disabled (gate=free)"), "budgetGateNote shape");
ok(isBudgetLimitNote(budgetLimitNote("x", 1, 2)) && !isBudgetLimitNote("intentional skip: gate=free") && !isBudgetLimitNote("x budget limit reached:"), "isBudgetLimitNote anchored");
ok(!isDeterministicFailureNote(budgetLimitNote("x", 1, 1)) && !isDeterministicFailureNote(budgetGateNote("free")), "budget note must NOT be a paging prefix");

// 2. classifier: a capped idle job is not an incident but is distinguishable; a real dead streak still pages
const idleCapped = { job: "promote-index", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: budgetLimitNote("details_pro", 6650, 6650) };
const deadDeferred = { job: "atlas-build", attempted: 5, succeeded: 0, consecutive_zero: 3, last_note: budgetLimitNote("details_enterprise", 950, 950) };
const c = classifyHealth([idleCapped, deadDeferred]);
ok(c.incidents.length === 1 && c.incidents[0].job === "atlas-build", "dead streak must still page even with a budget note");
ok(c.idle.length === 1 && c.budgetLimited.length === 1 && c.budgetLimited[0].job === "promote-index", "capped idle run is idle AND listed as budgetLimited");
ok(classifyHealth([{ job: "j", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: null }]).budgetLimited.length === 0, "plain idle is not budgetLimited");

// 3. call sites use the helpers
const promote = src("app/api/cron/promote-index/route.js");
ok(/budgetLimitNote\(PROMOTE_SKU,\s*budgetUsed,/.test(promote), "promote-index pulse note must use budgetLimitNote");
ok(!/`budget: \$\{PROMOTE_SKU\}/.test(promote), "promote-index old 'budget:' note must be gone");
const atlas = src("app/api/cron/atlas-build/route.js");
ok(/attempted: 0, succeeded: 0, failed: 0, note: budgetGateNote\(mode,/.test(atlas) && !/intentional skip: gate=/.test(atlas), "atlas gate skip must use budgetGateNote and stay 0/0/0 (idle, never an incident)");
ok(/budgetLimitNote\("details_enterprise"/.test(atlas) && !/`budget: 0 of/.test(atlas), "atlas deferral note must use budgetLimitNote");
const events = src("app/api/events/route.js");
ok(!/reason: "spend denied"/.test(events) && (events.match(/reason: "budget limit reached: events_\w+"/g) || []).length === 5, "all 5 event-provider spend denials carry the budget label");

ok(/^budget limit reached: \w+ \d+\/\d+/.test("budget limit reached: details_pro 6650/6650"), "positive control: the label regex matches a known-good note");
// 3b. POSITIVE CONTROLS: the absence probes above must fire on the known-bad shapes.
{
  const oldPromote = promote.replace(/budgetLimitNote\(PROMOTE_SKU,\s*budgetUsed,[^)]*\)\)/, "`budget: ${PROMOTE_SKU} ceiling reached`");
  ok(!/budgetLimitNote\(PROMOTE_SKU,\s*budgetUsed,/.test(oldPromote) || /`budget: \$\{PROMOTE_SKU\}/.test(oldPromote), "control: promote-index probe must flag the pre-fix 'budget:' note");
  const oldAtlas = atlas.replace(/budgetGateNote\(mode, "intentional skip[^)]*\)/, "`intentional skip: gate=${mode}`");
  ok(/intentional skip: gate=/.test(oldAtlas) && !/intentional skip: gate=/.test(atlas), "control: atlas probe finds the old skip note in the mutated copy and not in the real file");
  const oldEvents = events.replace(/reason: "budget limit reached: events_seatgeek"/, 'reason: "spend denied"');
  ok(/reason: "spend denied"/.test(oldEvents) && !/reason: "spend denied"/.test(events), "control: events probe finds 'spend denied' in the mutated copy and not in the real file");
}

// 4. Ticketmaster daily limiter, ahead of the monthly grant
ok(DAILY_LIMITS.ticketmaster === 4500, "Ticketmaster daily stop-loss must be 4500 (< published 5000/day)");
ok(/^events_ticketmaster_d\d{8}$/.test(eventProviderDailySku("ticketmaster")), "daily sku shape");
const esp = src("lib/eventProviderSpend.js");
const iDaily = esp.indexOf("takeFromLedger(eventProviderDailySku(provider), daily)");
const iMonthly = esp.indexOf("return takeFromLedger(entry.sku, cap)");
ok(iDaily > 0 && iMonthly > iDaily, "daily grant must precede the monthly grant");

if (fails) { console.error(`check-budget-limit-reporting: ${fails} failure(s)`); process.exit(1); }
console.log("check-budget-limit-reporting: OK (note shapes, non-paging prefix, classifier, promote/atlas/events call sites, TM daily limiter ordering)");
