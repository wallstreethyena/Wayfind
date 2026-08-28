#!/usr/bin/env node
/**
 * scripts/check-event-date-honesty.mjs — Wayfind never publishes a date it
 * cannot verify, and it answers "may this event show" in exactly one place.
 *
 * WHAT HAPPENED, 2026-08-27. Seven 2027 rows in wf_events carried dates the
 * organiser had never published. Each one said so in its own verify_note —
 * "Placeholder date - hold until announced", "Stored dates were a one-day shift
 * off 2026 — never published". The ingest that wrote them did the right thing:
 * it held them at event_status 'unannounced' and wrote down why.
 *
 * So nothing was careless, and nothing had leaked. The danger was the SHAPE of
 * the protection: a placeholder date sitting in a date column, invisible only
 * because two files happened to filter it out. The plan that same evening was
 * to widen exactly those filters to surface real unannounced events — which
 * would have published seven fabricated dates in the owner's home market.
 *
 * Two fixes, and this guard pins both:
 *
 *  1. THE DATABASE REFUSES IT NOW. Constraint
 *     wf_events_low_confidence_has_no_dates: a row may be low-confidence, or it
 *     may have dates, never both. That is stronger than any filter, because a
 *     filter is a decision in one file that another file can forget — which is
 *     precisely what happened below.
 *
 *  2. ONE DEFINITION OF TRUST. lib/curatedEvents.isEligible checked status,
 *     source_tier and confidence. app/api/events/fall/route.js re-implemented
 *     only the status half inline, so the AUGTOBER rail was not honouring its
 *     own stated rule — "Tier 5 may DISCOVER an event. It may never DATE one."
 *     A tier-5 row with a medium date would have gone straight through onto the
 *     surface the owner looks at most. isTrusted() is now the single answer and
 *     both call it.
 *
 * ASSERTED BY EXECUTION. Every law below is run against real row shapes rather
 * than grepped, because the failure this exists for is a row that passes a
 * filter — and only calling the filter can tell you that.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isTrusted, isEligible, DISPLAYABLE_STATUS } from "../lib/curatedEvents.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

// A row that SHOULD pass, so every rejection below is a real rejection and not
// a function that refuses everything.
const GOOD = Object.freeze({
  event_id: "control-2026", event_name: "Control Festival", city: "Sarasota",
  event_status: "scheduled", source_tier: 2, verification_confidence: "high",
  start_date: "2099-10-17", end_date: "2099-10-18", card_hook: "A real hook.",
});

/* ── 1. THE CONTROL ────────────────────────────────────────────────────────*/
{
  ok(isTrusted(GOOD) === true, "CONTROL: a scheduled, tier-2, high-confidence row with a hook IS trusted — without this every assertion below passes on a function that returns false for everything");
  ok(isEligible(GOOD) === true, "CONTROL: …and eligible, with a future date");
}

/* ── 2. THE LAWS, EXECUTED ─────────────────────────────────────────────────*/
{
  ok(isTrusted({ ...GOOD, verification_confidence: "low" }) === false,
    "a LOW-confidence row is never trusted — this is the row class that held seven fabricated 2027 dates");
  ok(isTrusted({ ...GOOD, verification_confidence: null }) === false,
    "…and neither is one with no confidence recorded at all: absent is not the same as fine");
  ok(isTrusted({ ...GOOD, source_tier: 5 }) === false,
    "a TIER-5 row is never trusted — 'creator/social may DISCOVER an event, it may never DATE one', which is the rule the fall rail was not applying");
  ok(isTrusted({ ...GOOD, source_tier: null }) === false, "…nor a row with no tier recorded");
  ok(isTrusted({ ...GOOD, event_status: "unannounced" }) === false, "an UNANNOUNCED row is not displayable");
  ok(isTrusted({ ...GOOD, event_status: "cancelled" }) === false, "…nor a cancelled one");
  ok(isTrusted({ ...GOOD, card_hook: null }) === false,
    "…nor one with no hook: 'a card with no hook is a calendar row, and we do not ship calendar rows'");
  ok(isTrusted({ ...GOOD, city: null }) === false, "…nor one with no city");
  ok(isTrusted(null) === false && isTrusted(undefined) === false, "…and it never throws on a missing row");

  ok(isEligible({ ...GOOD, start_date: null, end_date: null }) === false,
    "a row with NO DATES is not eligible — which is exactly the state every unverified row is now forced into by the database constraint");
  ok(isEligible({ ...GOOD, start_date: "2020-01-01", end_date: "2020-01-02" }) === false,
    "…and a past event is not eligible");
  ok(isEligible({ ...GOOD, end_date: null, start_date: "2099-10-17" }) === true,
    "…while a single-day event with no end_date IS eligible — a null end must not read as 'no date'");
}

/* ── 3. TRUST IS ONE FUNCTION, NOT TWO COPIES ──────────────────────────────*/
{
  const fall = strip(readFileSync(join(ROOT, "app/api/events/fall/route.js"), "utf8"));
  ok(/isTrusted\(e\)/.test(fall),
    "the fall rail calls isTrusted — not a second inline copy of half the rule");
  ok(/import \{[^}]*isTrusted[^}]*\} from ".*curatedEvents\.js"/.test(fall),
    "…imported from the one module that defines it (an unbound call is legal JS until it runs — the #486 lesson)");
  ok(!/event_status\s*===\s*"scheduled"/.test(fall),
    "…and the inline status comparison is GONE. Leaving it would mean two answers to one question, which is how the tier-5 gate went missing in the first place");

  const cur = strip(readFileSync(join(ROOT, "lib/curatedEvents.js"), "utf8"));
  ok(/export function isTrusted\(/.test(cur), "isTrusted is exported from curatedEvents (the declaration, not the bare name)");
  ok(/function isEligible[\s\S]{0,200}isTrusted\(e\)/.test(cur),
    "…and isEligible DELEGATES to it rather than repeating the checks — two copies drift, and this file exists because two copies drifted");
  // Count the RULE, not the word. `source_tier` also appears in the SELECT
  // column list, which is not a decision about anything — counting bare
  // mentions made this assertion fire on a correct file, and a guard that
  // fires on correct code gets switched off (CLAUDE.md).
  const tierRules = (cur.match(/if \s*\(!e\.source_tier/g) || []).length;
  ok(tierRules === 1, `the tier rule is enforced in exactly ONE place (found ${tierRules}) — two copies drift, and this file exists because two copies drifted`);
  const confRules = (cur.match(/verification_confidence === "low"/g) || []).length;
  ok(confRules === 1, `…and so is the confidence rule (found ${confRules})`);
}

/* ── 4. THE DATABASE HALF IS DOCUMENTED WHERE IT CAN BE FOUND ──────────────
   The constraint is the real protection and it lives in Postgres, where no
   guard in this suite can reach it. The next person to widen a filter has to
   be able to find out it exists, so the module that filters names it. */
{
  const cur = readFileSync(join(ROOT, "lib/curatedEvents.js"), "utf8");
  ok(/wf_events_low_confidence_has_no_dates/.test(cur),
    "the constraint is named in curatedEvents, so someone loosening a filter here discovers that the database is also holding the line");
}

/* ── 5. RED PROOFS ─────────────────────────────────────────────────────────*/
const RED = [
  ["a filter that only checks status is detectable", () => {
    const inline = 'e.event_status === "scheduled" || e.event_status === "sold_out"';
    return /event_status\s*===\s*"scheduled"/.test(inline);
  }],
  ["a tier-5 row really would pass a status-only filter", () => {
    const row = { ...GOOD, source_tier: 5 };
    const statusOnly = DISPLAYABLE_STATUS.has(row.event_status);   // the old fall-route rule
    return statusOnly === true && isTrusted(row) === false;         // green vs red on the same row
  }],
  ["a low-confidence row really would pass a status-only filter", () => {
    const row = { ...GOOD, verification_confidence: "low" };
    return DISPLAYABLE_STATUS.has(row.event_status) === true && isTrusted(row) === false;
  }],
  ["an all-rejecting isTrusted would fail the control", () => isTrusted(GOOD) === true],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-event-date-honesty: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-event-date-honesty: OK — ${pass} assertions (trust laws executed against real row shapes; one definition, both surfaces; the tier-5 and low-confidence gates proven to change the verdict)`);
