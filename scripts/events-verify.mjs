#!/usr/bin/env node
// scripts/events-verify.mjs — the creator-event work queue. RUN BY HAND.
//
// lib/creatorEvents.js refuses to emit an event past its `verified.through`
// date, so an event with stale research disappears rather than lying about
// when it is. That is the right failure, but a silent one — this is how you
// see it. Prints what has expired and what expires soon, with the creator's
// post so you can go back to the source.
import { needsVerification, CREATOR_EVENTS, creatorEventsFor } from "../lib/creatorEvents.js";

const now = new Date();
const within = Number(process.argv[2]) || 45;
const rows = needsVerification(now, within);

console.log(`\ncreator events: ${CREATOR_EVENTS.length} registered\n`);
if (!rows.length) {
  console.log(`  All verified beyond ${within} days. Nothing to do.\n`);
} else {
  for (const r of rows) {
    console.log(`  ${r.expired ? "\x1b[31mEXPIRED \x1b[0m" : "\x1b[33mexpiring\x1b[0m"}  ${r.name} — ${r.city}`);
    console.log(`            verified through ${r.through}   @${r.creator || "?"}`);
    if (r.video) console.log(`            source post: ${r.video}`);
    if (r.note) console.log(`            note: ${r.note.replace(/\s+/g, " ").slice(0, 200)}`);
    console.log("");
  }
  console.log(`  Confirm the real dates, then bump \`verified.through\` (and add a new`);
  console.log(`  "once" entry for a new festival edition). No other change is needed.\n`);
}
// What a user would actually see right now, per curated city.
for (const [city, lat, lng] of [["Parrish", 27.5942, -82.4257], ["Tampa", 27.9506, -82.4572], ["Miami", 25.7617, -80.1918]]) {
  const live = creatorEventsFor(lat, lng, now).events;
  console.log(`  live near ${city}: ${live.length ? live.slice(0, 4).map((e) => e.date + " " + e.name).join(", ") : "(none)"}`);
}
console.log("");
