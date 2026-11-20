#!/usr/bin/env node
// scripts/test-host-confident-voice.mjs — locks the seasonal host's confident voice.
//
// Owner 2026-11-19 (looking at Santa's dock bubble "Want me to build a day
// around this?"): "Santa needs to be more assertive and confident."
//
// The host states the move instead of asking permission. This guard CALLS the
// real selectors and persona (no source greps) and fails if any unsolicited
// offer or any Santa canned line asks permission or hedges, and if any Santa
// model prompt loses its confidence rule. Options-not-orders still holds: the
// prompts must keep asking for 2 or 3 picks.

import { selectProactivePlannerOffer } from "../lib/plannerProactive.js";
import { plannerPersona, personaPlanReply } from "../lib/plannerPersona.js";
import { santaPrompt as santaChatPrompt } from "../lib/santaChat.js";
import { santaPrompt as santaFinderPrompt } from "../lib/santaFinder.js";

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  ok  " + msg); } else { fail++; console.error("  FAIL " + msg); }
}

// Permission asks and hedges a confident host never uses in a canned line.
const TIMID = /\b(want me to|should i|shall i|would you like|do you want|maybe|perhaps|i think|might)\b/i;
// Positive control: the probe must catch the exact line the owner rejected.
ok(TIMID.test("Want me to build a day around this?"), "probe catches the rejected line (positive control)");
ok(!TIMID.test("This spot deserves a whole day. I'll build it."), "probe passes a confident line (negative control)");

// 1. Every unsolicited dock offer, one context per kind.
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const contexts = [
  { kind: "place", args: { pathname: "/places/abc", activePlace: { name: "Holidays at UTC", city: "Sarasota" } } },
  { kind: "unassigned_saves", args: { pathname: "/", unassignedSaveCount: 4 } },
  { kind: "itinerary", args: { pathname: "/itinerary", activeTrip: { key: "t1", city: "Tampa", items: [{ id: 1 }, { id: 2 }] } } },
  { kind: "christmas", args: { pathname: "/christmas-in-florida" } },
];
let seen = 0;
for (const c of contexts) {
  const offer = selectProactivePlannerOffer({ ...c.args, storage: mem() });
  ok(offer && offer.kind === c.kind, `offer kind ${c.kind} is produced`);
  if (!offer) continue;
  seen++;
  ok(!TIMID.test(offer.message), `${c.kind} offer is confident: "${offer.message}"`);
  ok(!/\?\s*$/.test(offer.message), `${c.kind} offer is a statement, not a question`);
  ok(!/[‐-―-]/.test(offer.message), `${c.kind} offer has no dash`);
}
ok(seen === contexts.length, `all ${contexts.length} offer kinds were exercised (${seen})`);

// 2. Santa's canned chat lines that close a turn.
const santa = plannerPersona("santa");
const santaLines = {
  planAsk: santa.planAsk,
  organizeReady: santa.organizeReady,
  noFit: santa.noFit,
  noChange: santa.noChange,
  planReply: personaPlanReply("santa", { days: 2, city: "Tampa", stops: 6, seed: "x" }),
};
for (const [k, line] of Object.entries(santaLines)) {
  ok(typeof line === "string" && line.length > 0, `santa.${k} exists`);
  ok(!TIMID.test(line), `santa.${k} is confident: "${line}"`);
}
ok(/Confidence:/.test(santa.rule) && /never ask permission/i.test(santa.rule), "Santa planner rule carries the confidence line");

// 3. Both Santa model prompts carry the confidence rule and still give options.
const chat = santaChatPrompt({ events: [], today: "2026-12-01" }, "lights near me", {});
const finder = santaFinderPrompt([], "lights near me", {});
for (const [name, p] of [["santaChat", chat], ["santaFinder", finder]]) {
  ok(p && typeof p.system === "string", `${name} prompt builds`);
  ok(/never ask permission/i.test(p.system) && /never hedge/i.test(p.system), `${name} prompt has the confidence rule`);
  ok(/2 or 3/.test(p.system), `${name} prompt still gives options, not orders`);
}

console.log(`\ntest-host-confident-voice: ${pass} passed, ${fail} failed (${seen} offers, ${Object.keys(santaLines).length} Santa lines, 2 prompts)`);
process.exit(fail ? 1 : 0);
