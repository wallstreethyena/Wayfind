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
ok(!/—|–| - /.test([g && g.title, g && g.description, CHRISTMAS_TICKETS_TITLE].join(" ")), "no dashes");

if (fail.length) { console.error("test-seo-money-headlines: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-seo-money-headlines: OK - ${pass} assertions (search words first, real picks, no dashes)`);
