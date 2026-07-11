// Guardrail + unit tests: meal-slot truth. A place may only appear under a
// meal label it verifiably serves. Runs the REAL engine against fixtures,
// including the exact production bug (Italian restaurant opening at 11 AM
// listed under Breakfast).
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
import { mealEligible, hoursSpan } from "../lib/meals.js";
const fail = (m) => { console.error("check-meals: FAIL — " + m); process.exit(1); };

const per = (oh, om, ch, cm2, cd) => ({ open: { day: 1, hour: oh, minute: om }, close: { day: cd ?? 1, hour: ch, minute: cm2 } });
const P = (name, types, periods) => ({ name, types, oh: periods ? { periods } : undefined });

// 1. The iDalia case: opens 11:00, Italian — must FAIL Breakfast, pass Lunch/Dinner.
const idalia = P("Restaurant iDalia", ["italian_restaurant", "restaurant"], [per(11, 0, 22, 0)]);
if (mealEligible("Breakfast", idalia)) fail("iDalia case: 11 AM opener passed Breakfast");
if (!mealEligible("Lunch", idalia) || !mealEligible("Dinner", idalia)) fail("iDalia should pass Lunch/Dinner");

// 2. A 7 AM diner passes Breakfast on hours alone.
if (!mealEligible("Breakfast", P("Sunrise Diner", ["restaurant"], [per(7, 0, 14, 0)]))) fail("7 AM diner failed Breakfast");

// 3. No hours + breakfast signal passes; no hours + steakhouse fails (strict).
if (!mealEligible("Breakfast", P("Corner Cafe", ["cafe"], null))) fail("hourless cafe failed Breakfast");
if (mealEligible("Breakfast", P("Prime Steakhouse", ["steak_house", "restaurant"], null))) fail("hourless steakhouse passed Breakfast");

// 4. Dinner truth: closes 3 PM must fail Dinner.
if (mealEligible("Dinner", P("Morning Bakery", ["bakery"], [per(6, 0, 15, 0)]))) fail("3 PM closer passed Dinner");

// 5. Late-night truth: closes 9 PM fails; open till 2 AM passes.
if (mealEligible("Late-night eats", P("Early Kitchen", ["restaurant"], [per(11, 0, 21, 0)]))) fail("9 PM closer passed Late-night");
if (!mealEligible("Late-night eats", P("Midnight Tacos", ["restaurant"], [per(17, 0, 2, 0, 2)]))) fail("2 AM taco spot failed Late-night");

// 6. Quick bite: pure night_club fails.
if (mealEligible("Quick bite", P("Pulse Club", ["night_club"], null))) fail("night club passed Quick bite");

// 7. Overnight span maths.
const sp = hoursSpan(P("x", [], [per(17, 0, 2, 0, 2)]));
if (!sp || sp.lc <= 1440) fail("overnight close not treated as 24h+");

// 8. The composite loop is actually wired through the engine.
const page = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
if (!page.includes("Meals.mealEligible(sl.label, pp)")) fail("openCurated not filtering through mealEligible");
if ((page.match(/Meals\.mealEligible\(sl\.label, pp\)/g) || []).length < 2) fail("backfill path missing eligibility check");
console.log("check-meals: OK — 8 fixture suites pass; slot labels are hours-verified promises");
