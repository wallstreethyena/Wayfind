#!/usr/bin/env node
// check-social-extract-cannot-invent — a caption fact that is not IN the caption
// does not survive.
//
// THE LAW (owner, 2026-09-03): "i cannot afford to have a person click on it and
// have false information", and "i cannot have someone be interested and not know
// when they will be able to go to the event." Those two pull in opposite
// directions: the second wants dates on cards, the first forbids guessing one.
// lib/socialExtract resolves it by making a guess UNPROVABLE rather than
// discouraged — every fact must arrive with the substring it was read from, and
// normalizeExtraction throws away any fact whose quote is not literally in the
// caption.
//
// This guard EXECUTES that net against the shapes a helpful model actually
// produces, because the prompt is not the guarantee and must not be tested as
// if it were. Every case below is a real Suncoast caption shape.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXTRACT_SYSTEM, EXTRACT_TOOL, extractRequest, extractionFrom,
  normalizeExtraction, quoteIsInCaption, readCaption,
} from "../lib/socialExtract.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const VAGUE = "Fall Festival is BACK this weekend!! 🎃 Hayrides, corn maze, kettle corn. Bring the whole family, y'all know how we do 🍂 #hunsader #fallinflorida";
const DATED = "Mark your calendars 🍁 Our Fall Harvest Festival runs October 12 through October 14. Gates open at 9:00am. $15 adults, kids under 5 free. Parrish, FL.";
const NOTHING = "Throwback to last season 🥹 we miss y'all already. Tag someone who was there!";

// ── 1. the net, executed ──────────────────────────────────────────────────
// A model doing exactly what it is told on a caption with no date.
const clean = normalizeExtraction(
  { is_event: true, title: "Fall Festival", title_evidence: "Fall Festival", start_date: null, start_date_evidence: null },
  VAGUE
);
ok(clean.is_event === true, "a real event is recognised as an event");
ok(clean.fields.title === "Fall Festival", "a title that IS in the caption survives");
ok(clean.fields.start_date === undefined, "…and a caption saying only \"this weekend\" yields no date at all");

// THE FAILURE MODE THIS EXISTS FOR: the model helpfully resolves "this weekend".
const guessed = normalizeExtraction(
  { is_event: true, title: "Fall Festival", title_evidence: "Fall Festival",
    start_date: "2026-09-06", start_date_evidence: "this weekend, September 6" },
  VAGUE
);
ok(guessed.fields.start_date === undefined,
  "A GUESSED DATE IS DROPPED — its quote (\"this weekend, September 6\") is not in the caption");
ok(guessed.dropped.some((d) => d.field === "start_date" && /not in the caption/.test(d.why)),
  "…and the drop is recorded with its reason, so a drifting extractor is visible instead of silent");
ok(guessed.fields.title === "Fall Festival", "…while the honest field in the SAME answer is kept — this is a scalpel, not a kill switch");

// A model that returns a date with no quote at all.
const unbacked = normalizeExtraction({ is_event: true, start_date: "2026-10-12", start_date_evidence: null }, DATED);
ok(unbacked.fields.start_date === undefined, "a fact with no evidence quote is dropped, even when it happens to be right");
ok(unbacked.dropped.some((d) => d.field === "start_date" && d.why === "no evidence quote"),
  "…and it is dropped for the RIGHT reason — the audit trail has to say \"nothing was quoted\", not \"the quote did not match\"");

// The good case: everything is really there.
const real = normalizeExtraction(
  { is_event: true,
    title: "Fall Harvest Festival", title_evidence: "Fall Harvest Festival",
    start_date: "10-12", start_date_evidence: "October 12",
    end_date: "10-14", end_date_evidence: "October 14",
    start_time: "9:00am", start_time_evidence: "Gates open at 9:00am",
    price_text: "$15 adults", price_evidence: "$15 adults",
    venue_name: "Parrish, FL", venue_evidence: "Parrish, FL" },
  DATED
);
ok(real.fields.start_date === "10-12" && real.fields.end_date === "10-14", "a caption that really states a range keeps both dates");
ok(real.fields.start_time === "9:00am" && real.fields.price_text === "$15 adults", "…and the time and the price, which are the two facts that decide whether someone goes");
ok(real.dropped.length === 0, "…with nothing dropped — the net is not just refusing everything");
ok(Object.keys(real.evidence).length === Object.keys(real.fields).length, "every surviving fact carries its quote onward for a human to check");

// A YEAR IS NOT INVENTED. "October 12" states a month and a day; MM-DD is the
// honest shape, and a full date is only kept when the caption gives the year.
ok(real.fields.start_date === "10-12", "no year is manufactured for a caption that does not state one");
const bogus = normalizeExtraction({ is_event: true, start_date: "October 12", start_date_evidence: "October 12" }, DATED);
ok(bogus.fields.start_date === undefined, "a date that is not a calendar date is dropped even with a good quote (prose in a date field)");

// Not an event at all.
const none = normalizeExtraction({ is_event: false, title: "Fall Festival", title_evidence: "Throwback" }, NOTHING);
ok(none.is_event === false && Object.keys(none.fields).length === 0,
  "a throwback post publishes nothing, however popular — is_event false ends it");

// An end date with no start is a loose number, not a range.
const dangling = normalizeExtraction({ is_event: true, end_date: "10-14", end_date_evidence: "October 14" }, DATED);
ok(dangling.fields.end_date === undefined, "an end date with no start date is dropped — a range needs both ends");

// is_free only when it means free.
ok(normalizeExtraction({ is_event: true, is_free: false, free_evidence: "$15 adults" }, DATED).fields.is_free === undefined,
  "is_free is recorded only when TRUE — \"not free\" is not a fact worth carrying");

// ── 2. quote matching: forgiving on shape, strict on content ──────────────
ok(quoteIsInCaption("october 12", DATED), "matching ignores case — a caption is not typed carefully");
ok(quoteIsInCaption("Gates open at\n9:00am", DATED), "…and ignores line breaks, which every caption is full of");
ok(quoteIsInCaption("kids under 5 free", DATED), "…and matches straight through emoji and punctuation");
ok(!quoteIsInCaption("October 13", DATED), "but a date that is NOT in the caption does not match");
ok(!quoteIsInCaption("", DATED) && !quoteIsInCaption(null, DATED), "an empty or missing quote never matches");
ok(!quoteIsInCaption("a", DATED), "a one-character quote never matches — that would match everything");

// ── 3. the request is dark, offline and clock-free ────────────────────────
const req = extractRequest(DATED);
ok(!!req && req.tools[0].name === EXTRACT_TOOL.name, "the request forces the answer through the tool");
ok(req.tool_choice && req.tool_choice.type === "tool", "…and the model cannot answer in prose instead");
ok(req.system === EXTRACT_SYSTEM, "the system prompt shipped is the one this file exports (the same string pasted into the console)");
ok(JSON.stringify(req).includes("October 12") && !/20\d\d-\d\d-\d\dT/.test(JSON.stringify(req)),
  "THE POST'S TIMESTAMP IS NOT SENT — a model given today's date can resolve \"this weekend\", which is the one thing it must not do");
ok(extractRequest("") === null && extractRequest(null) === null, "an empty caption builds no request, so no empty call is ever billed");
const longReq = extractRequest("x".repeat(9000));
ok(longReq.messages[0].content.length <= 2000 + 16,
  `a runaway caption is truncated to 2000 chars before it is billed (got ${longReq.messages[0].content.length})`);

// The module must not reach the network or read a key on its own.
const SRC = readFileSync(join(ROOT, "lib/socialExtract.js"), "utf8");
ok(!/\bfetch\s*\(/.test(SRC), "lib/socialExtract makes no network call of its own — the caller owns the fetch, the timeout and the key");
ok(!/process\.env/.test(SRC), "…and reads no environment, so it ships dark and stays testable offline");
ok(!/new Date\(|Date\.now\(/.test(SRC), "…and reads no clock, so it cannot resolve a relative date even by accident");

// ── 4. the prompt says the thing the net enforces ─────────────────────────
ok(/never infer/i.test(EXTRACT_SYSTEM), "the prompt states the rule the net enforces");
ok(/this weekend/i.test(EXTRACT_SYSTEM), "…and names the exact vague phrases that must return null");
ok(/character for character/i.test(EXTRACT_SYSTEM), "…and demands a verbatim quote, which is what makes the net possible");
for (const [field, ev] of Object.entries(EXTRACT_TOOL.input_schema.properties).filter(([k]) => /_evidence$/.test(k) ? false : true)) {
  if (["is_event"].includes(field)) continue;
  if (/_evidence$/.test(field)) continue;
  const pair = { venue_name: "venue_evidence", is_free: "free_evidence", price_text: "price_evidence" }[field] || field + "_evidence";
  ok(!!EXTRACT_TOOL.input_schema.properties[pair], `every fact field has an evidence field beside it (${field} -> ${pair})`);
  void ev;
}

// ── 5. end to end, through a real response shape ──────────────────────────
const response = { content: [
  { type: "text", text: "" },
  { type: "tool_use", name: EXTRACT_TOOL.name, input: { is_event: true, title: "Fall Harvest Festival", title_evidence: "Fall Harvest Festival", start_date: "10-12", start_date_evidence: "October 12" } },
] };
const end = readCaption(response, DATED);
ok(end.is_event && end.fields.start_date === "10-12", "end to end: a real API response shape yields an audited lead");
ok(readCaption({ content: [{ type: "text", text: "{}" }] }, DATED).is_event === false,
  "a response with no tool block yields nothing rather than throwing");
ok(readCaption(null, DATED).is_event === false && readCaption(undefined, "").is_event === false, "null and undefined responses are safe");
ok(extractionFrom({ content: [{ type: "tool_use", name: "something_else", input: { is_event: true } }] }) === null,
  "a tool block with the wrong name is not read as our answer");

if (fails.length) {
  console.error("check-social-extract-cannot-invent: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-social-extract-cannot-invent: OK — ${pass} assertions; an extracted fact must survive being looked up in the caption, and a guessed date does not`);
