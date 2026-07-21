// scripts/test-personalization.mjs — lock test for the Personalization engine (lib/personalization.js).
// Pure + deterministic. Pins: same context → same order; morning ≠ evening; unavailable/absent
// sections excluded; live-picks always leads; ordering uses only real context signals.
import { orderSections, SECTIONS } from "../lib/personalization.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };
const allAvail = Object.fromEntries(SECTIONS.map((s) => [s, true]));

const morning = { hour: 9, isWeekend: false, season: "summer", weather: { condition: "clear" }, available: { ...allAvail } };
const evening = { hour: 19, isWeekend: false, season: "summer", weather: { condition: "clear" }, available: { ...allAvail } };
const rainy = { hour: 13, isWeekend: false, season: "summer", weather: { condition: "rain", isBad: true }, available: { ...allAvail } };
const weekend = { hour: 11, isWeekend: true, season: "summer", weather: { condition: "sunny" }, available: { ...allAvail } };

// determinism
ok(JSON.stringify(orderSections(morning)) === JSON.stringify(orderSections(morning)), "same context → same order");

// live picks always leads
for (const [name, ctx] of [["morning", morning], ["evening", evening], ["rainy", rainy], ["weekend", weekend]])
  ok(orderSections(ctx)[0] === "live-picks", `live-picks leads (${name})`);

// morning includes morning-picks; evening excludes it
ok(orderSections(morning).includes("morning-picks"), "morning includes morning-picks");
ok(!orderSections(evening).includes("morning-picks"), "evening excludes morning-picks (after 11)");

// morning order differs from evening order
ok(JSON.stringify(orderSections(morning)) !== JSON.stringify(orderSections(evening)), "morning order ≠ evening order");

// rainy drops beach and lifts indoor (things-to-do above shopping, both present)
const r = orderSections(rainy);
ok(!r.includes("beach"), "rainy drops beach");
ok(r.indexOf("things-to-do") < r.indexOf("shopping"), "rainy lifts things-to-do above shopping");

// evening lifts food above things-to-do (dinner prominence)
const e = orderSections(evening);
ok(e.indexOf("food") < e.indexOf("things-to-do"), "evening lifts food (dinner)");

// weekend ranks beach higher than the same weekday midday
const weekdayMid = { hour: 11, isWeekend: false, season: "summer", weather: { condition: "sunny" }, available: { ...allAvail } };
ok(orderSections(weekend).indexOf("beach") <= orderSections(weekdayMid).indexOf("beach"), "weekend lifts beach");

// unavailable sections excluded (e.g., beach unsafe upstream, sports off)
const off = orderSections({ ...morning, available: { ...allAvail, beach: false, sports: false } });
ok(!off.includes("beach") && !off.includes("sports"), "unavailable sections excluded");

// only known sections returned, no duplicates
const set = new Set(orderSections(morning));
ok(set.size === orderSections(morning).length && [...set].every((s) => SECTIONS.includes(s)), "known unique section ids only");

console.log(`test-personalization: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
