// Money page headlines (SEO engine 2026-11-23): the two biggest free Google
// landing pages say the words people search, inside Google's length limits,
// with no dashes, and the facts in the description come from the picks.
import { GUIDES } from "../lib/guides.js";
import { CHRISTMAS_TICKETS_TITLE } from "../lib/christmasTickets.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const g = GUIDES["things-to-do-sarasota"];
ok(g && /Things to Do in Sarasota, FL/.test(g.title), "Sarasota guide title says Things to Do in Sarasota, FL");
ok(g && (g.title + " | Wayfind").length <= 65, "Sarasota title fits Google's width");
ok(g && g.description.length <= 160 && /^The best things to do in Sarasota, FL/.test(g.description), "Sarasota description answers the search first, 160 characters max");
const names = (g && g.picks || []).map((p) => p.name).join(" | ");
for (const n of ["The Ringling", "Selby", "Mote", "Myakka", "Lido"]) ok(names.includes(n), `description pick ${n} is a real pick on the page`);
ok(g && g.picks.some((p) => /Mondays the art museum is free/.test(p.tip || "")), "free Mondays claim is backed by the Ringling pick");
ok(/^Christmas in Florida \d{4}: /.test(CHRISTMAS_TICKETS_TITLE), "Christmas hub headline leads with Christmas in Florida and the year");
// New Year's Eve guide (SEO engine 2026-11-25): "new years eve florida" 590/mo, low difficulty.
// The title says those words with the year and fits Google's width; the description names real picks.
const nye = GUIDES["florida-new-years-eve-2026"];
ok(nye && /^Florida New Year's Eve \d{4}: /.test(nye.title), "New Year's Eve guide title leads with Florida New Year's Eve and the year");
ok(nye && (nye.title + " | Wayfind").length <= 65, "New Year's Eve title fits Google's width");
const nyeNames = (nye && nye.picks || []).map((p) => p.name).join(" | ");
for (const n of ["Treasure Island", "Clearwater Beach", "Shrimp Drop", "MOSI", "LEGOLAND"]) ok(nyeNames.includes(n) && nye.description.includes(n), `New Year's Eve description pick ${n} is a real pick on the page`);
ok(!/—|–| - /.test([g && g.title, g && g.description, CHRISTMAS_TICKETS_TITLE, nye && nye.title, nye && nye.description].join(" ")), "no dashes");

if (fail.length) { console.error("test-seo-money-headlines: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-seo-money-headlines: OK - ${pass} assertions (search words first, real picks, no dashes)`);
