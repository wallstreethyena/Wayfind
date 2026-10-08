// scripts/check-event-price-fact.mjs
//
// 2026-10-08 (owner): "Do not imply an entire experience is free." The home
// event rail printed "Free" for ANY event with ticketed === false, which every
// library talk, PredictHQ and Google listing carries with no price at all; and
// a ticketed Ticketmaster event with no price printed nothing. Both card
// surfaces now print lib/eventPriceFact.js.
//
// CALLED: eventPriceFact over the shapes that reach a card. Syntactic
// (comments stripped): the two card surfaces print it, and the old
// "not ticketed means Free" inference is gone.
import { readFileSync } from "node:fs";
import { eventPriceFact } from "../lib/eventPriceFact.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

ok(eventPriceFact({ ticketed: false, price: null }) === null, "a listing with no ticket and no price prints nothing (not Free)");
ok(eventPriceFact({ price: null }) === null, "no ticket flag and no price prints nothing");
ok(eventPriceFact({ ticketed: true, price: null }) === "Check ticket price", "a ticketed event with no price says Check ticket price");
ok(eventPriceFact({ ticketed: true, price: "" }) === "Check ticket price", "an empty price string counts as missing");
ok(eventPriceFact({ price: "Free" }) === "Free admission" && eventPriceFact({ price: " free " }) === "Free admission", "a bare provider Free reads Free admission");
ok(eventPriceFact({ price: "Free admission · paid activities" }) === "Free admission · paid activities", "the source-supported offer wording passes through untouched");
ok(eventPriceFact({ price: "Free tickets available · conditions apply", ticketed: true }) === "Free tickets available · conditions apply", "a free tier with conditions keeps its conditions");
ok(eventPriceFact({ price: "$15 to $125 · check fees", ticketed: true }) === "$15 to $125 · check fees", "a paid range passes through");
ok(eventPriceFact(null) === null && eventPriceFact(undefined) === null, "missing event is safe");

const code = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const home = code("app/home.js");
const tab = code("app/components/screens/Events.js");
ok(/const facts = \[venue, eventPriceFact\(event\), repeats\]/.test(home), "the home event rail prints eventPriceFact");
ok(/facts=\{\[venue \|\| null, eventPriceFact\(e\),/.test(tab), "the Events tab card prints eventPriceFact");
const FREE_GUESS = /ticketed === false \|\|/;
// Positive control: the probe finds the retired inference.
ok(FREE_GUESS.test('const isFree = event.ticketed === false || /^free$/i.test(p);'), "positive control: the free-guess probe finds the old line");
ok(!FREE_GUESS.test(home) && !FREE_GUESS.test(tab), "no card treats 'not ticketed' as free");

if (fail.length) {
  console.error(`check-event-price-fact: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-event-price-fact: OK — ${pass} assertions; eventPriceFact CALLED over 9 shapes (not-ticketed never reads free, ticketed-unknown reads Check ticket price); both card surfaces print it (comments stripped)`);
