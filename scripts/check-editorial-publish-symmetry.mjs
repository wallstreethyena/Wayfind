#!/usr/bin/env node
// scripts/check-editorial-publish-symmetry.mjs — A PUBLISH GATE MUST HAVE AN
// INVERSE.
//
// 2026-09-04. wf_editorial held 922 rows marked verified = true. 207 of them
// were empty in every prose field — no hook, no why_here, no know_before, no
// best_time — with no issues recorded, and all 207 joined wf_inventory, so all
// 207 were live places claiming enriched editorial they did not have. That is
// 22% of the published set and it is the card the owner reported: present, and
// silent on why anyone should go.
//
// The writer was never the problem. lib/atlasEditorial.contentIssues has flagged
// thin-hook / insufficient-why-here / no-sourced-facts for months, and
// editorialRow derives `verified: flags === null` from it. The problem was that
// supabase/editorial-publish-backfill.sql promotes on `issues AND content` and
// demotes on `issues` ALONE. A row already sitting at verified = true could fail
// every content test that file applies to newcomers and be immune to its own
// demotion — nobody ever asked "is a PUBLISHED row still publishable?"
//
// TWO RULES, and the first is asserted BY CALLING THE REAL FUNCTION:
//
//   1. editorialRow() must never return verified:true for a row that would fail
//      the SQL's publish predicate. Proven by building real rows through the
//      real function across the boundary of each of the three thresholds and
//      reading `verified` back off what it returns — not by reading its source.
//   2. The SQL's promote and demote predicates must test the SAME THREE
//      THRESHOLDS. Structural (SQL has no callable seam from node), so each
//      threshold regex carries a positive control asserted to MATCH a known-good
//      literal and a red-prove asserted NOT to match the violation.
import { readFileSync } from "node:fs";
import { editorialRow, contentIssues } from "../lib/atlasEditorial.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => (cond ? pass++ : fail.push(msg));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
// Comments are legal JS and can contain anything this file greps for without
// the code doing it — strip before any position check (CLAUDE.md).
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const NOW = "2026-09-04T00:00:00.000Z";
const PLACE = { place_id: "ChIJtest", name: "Test Place" };
const LONG_WHY = "A".repeat(200);
const GOOD_HOOK = "A hook of at least twenty characters";
// sourcedFacts keeps only facts with a `claim` AND an http(s) `source` — a
// "fact" with no resolvable citation is an assertion, and this product does not
// publish assertions. The field is `claim`, not `text`; the first draft of this
// fixture used `text` and the POSITIVE CONTROL below caught it immediately,
// which is precisely what a positive control is for.
const FACT = { claim: "Open until 9pm on Fridays.", source: "https://example.com/hours" };

const row = (over) => editorialRow(PLACE, {
  hook: GOOD_HOOK, why_here: LONG_WHY, know_before: "Parking is tight.",
  best_time: "Weekday evenings.", local_tip: "Ask for the corner table.",
  facts: [FACT], ...over,
}, NOW, null);

// ── 1. THE WRITER, BY CALL ──────────────────────────────────────────────────
// POSITIVE CONTROL FIRST. If a fully-formed row does not come back verified,
// every rejection below is meaningless — a function that refuses everything
// "passes" every absence test ever written about it.
const good = row({});
ok(good.verified === true, `POSITIVE CONTROL: a complete row comes back verified (got ${good.verified}, issues ${JSON.stringify(good.issues)}) — without this, the rejections below prove nothing`);
ok(good.issues === null, "…with no issues recorded");
ok(good.why_here === LONG_WHY, "…and carries the why_here it was given (the field the owner's cards were missing)");

// THE 207. Every prose field empty, exactly the shape found in production.
const empty = editorialRow(PLACE, { hook: "", why_here: "", know_before: "", best_time: "", local_tip: "", facts: [] }, NOW, null);
ok(empty.verified === false, `an ALL-EMPTY card is NOT verified (got ${empty.verified}) — the 207-row shape found live on 2026-09-04`);
ok(Array.isArray(empty.issues) && empty.issues.includes("insufficient-why-here"), `…and says why: ${JSON.stringify(empty.issues)}`);

// Each threshold, one at a time, so a single over-broad rule cannot be mistaken
// for three working ones. Boundary values on both sides.
const thin = row({ hook: "Too short" });
ok(thin.verified === false && thin.issues.includes("thin-hook"), `a hook under 20 chars is refused (got verified=${thin.verified}, issues=${JSON.stringify(thin.issues)})`);
ok(row({ hook: "B".repeat(20) }).verified === true, "…and exactly 20 chars is accepted — the boundary is >=, not >, matching the SQL's `>= 20`");
ok(row({ hook: "B".repeat(19) }).verified === false, "…and exactly 19 is refused");

const shortWhy = row({ why_here: "C".repeat(119) });
ok(shortWhy.verified === false && shortWhy.issues.includes("insufficient-why-here"), `a why_here under 120 chars is refused (got ${JSON.stringify(shortWhy.issues)})`);
ok(row({ why_here: "C".repeat(120) }).verified === true, "…and exactly 120 is accepted, matching the SQL's `>= 120`");

const noFacts = row({ facts: [] });
ok(noFacts.verified === false && noFacts.issues.includes("no-sourced-facts"), `a row with zero sourced facts is refused (got ${JSON.stringify(noFacts.issues)})`);
// A fact without a source is not a sourced fact — the whole point of the field.
ok(row({ facts: [{ claim: "Something.", source: "" }] }).verified === false, "…and a fact carrying no http(s) source does not count as one");
ok(row({ facts: [{ source: "https://example.com/x" }] }).verified === false, "…nor does a source with no claim attached to it");

// Whitespace is not content. btrim in SQL, .trim() in JS — they must agree.
const blankish = row({ hook: "   \n  ", why_here: "   " });
ok(blankish.verified === false, "whitespace-only prose is refused, the same way SQL's btrim() sees it");

// contentIssues is the shared rule both the writer and the SQL encode; assert it
// directly so a future caller that forgets editorialRow still has one truth.
ok(contentIssues({ hook: "", why_here: "", facts: [] }, []).length === 3, "contentIssues reports all THREE failures on an empty card, not just the first");
ok(contentIssues({ hook: GOOD_HOOK, why_here: LONG_WHY }, [FACT]).length === 0, "POSITIVE CONTROL: …and zero on a complete one");

// ── 2. THE SQL PREDICATES ARE INVERSES ──────────────────────────────────────
// The bug was that they were not. Both files must test all three thresholds.
const backfill = read("../supabase/editorial-publish-backfill.sql");
const symmetry = read("../supabase/migrations/20260904_editorial_publish_gate_symmetry.sql");

const HOOK_RX  = /length\(btrim\(hook\)\)\s*,\s*0\)\s*[<>]=?\s*20\b/;
const WHY_RX   = /length\(btrim\(why_here\)\)\s*,\s*0\)\s*[<>]=?\s*120\b/;
const FACTS_RX = /jsonb_array_length\(facts\)\s*,\s*0\)\s*[<>]=?\s*1\b/;

// POSITIVE CONTROLS: each regex must match a known-good literal, so a rotted
// regex fails here rather than passing every file silently.
ok(HOOK_RX.test("and coalesce(length(btrim(hook)), 0) >= 20"), "POSITIVE CONTROL: the hook-threshold regex matches a known-good clause");
ok(WHY_RX.test("and coalesce(length(btrim(why_here)), 0) >= 120"), "POSITIVE CONTROL: the why_here-threshold regex matches a known-good clause");
ok(FACTS_RX.test("and coalesce(jsonb_array_length(facts), 0) >= 1"), "POSITIVE CONTROL: the facts-threshold regex matches a known-good clause");
// RED-PROVES: the exact drift each rule exists to catch.
ok(!HOOK_RX.test("and coalesce(length(btrim(hook)), 0) >= 5"), "RED-PROVE: a loosened hook threshold (5) does NOT satisfy the rule");
ok(!WHY_RX.test("and coalesce(length(hook), 0) >= 120"), "RED-PROVE: the right number on the wrong column does NOT satisfy the why_here rule");
ok(!FACTS_RX.test("and facts is not null"), "RED-PROVE: a null-check standing in for a length check does NOT satisfy the facts rule");

for (const [name, src] of [["editorial-publish-backfill.sql", backfill], ["20260904_editorial_publish_gate_symmetry.sql", symmetry]]) {
  ok(HOOK_RX.test(src),  `${name}: tests the hook >= 20 threshold`);
  ok(WHY_RX.test(src),   `${name}: tests the why_here >= 120 threshold`);
  ok(FACTS_RX.test(src), `${name}: tests the facts >= 1 threshold`);
}

// ── 2b. PUBLISHABILITY HAS MORE THAN ONE AXIS ───────────────────────────────
// 2026-09-05. The content bar above asks "does this row carry what it claims".
// It never asked "is this place still one we serve". Eight rows were published
// for places that were EXCLUDED (4), CLOSED_PERMANENTLY (2), CLOSED_TEMPORARILY
// (1) or had no wf_inventory row at all (1) — and they were REACHABLE, because
// app/api/editorial/route.js matches on place_id + verified and nothing else.
// Same bug class as the demote asymmetry, one dimension over: a gate that tests
// one axis of publishability and not the others.
//
// The rule is cross-table so it cannot be a CHECK constraint; it is a trigger,
// in supabase/migrations/20260905_editorial_requires_servable_place.sql. This
// asserts the migration encodes it — and, critically, that the SERVING path is
// the reason it has to (a status filter on the read would be the alternative
// fix, and its ABSENCE is what makes the trigger load-bearing).
const servable = read("../supabase/migrations/20260905_editorial_requires_servable_place.sql");
const OPERATIONAL_RX = /i\.status\s*=\s*'OPERATIONAL'/;
ok(OPERATIONAL_RX.test("where i.place_id = new.place_id and i.status = 'OPERATIONAL'"),
  "POSITIVE CONTROL: the OPERATIONAL-status probe matches a known-good clause");
ok(!OPERATIONAL_RX.test("where i.place_id = new.place_id"),
  "RED-PROVE: a place_id match with no status test does NOT satisfy the rule");
ok(/create or replace function public\.wf_editorial_requires_servable_place/.test(servable),
  "the servable-place rule exists as a FUNCTION (a CHECK constraint cannot reference wf_inventory, so this must be a trigger)");
ok(/create trigger wf_editorial_servable_place[\s\S]{0,160}before insert or update/.test(servable),
  "…fired BEFORE insert or update, so a bad write is refused rather than recorded and cleaned up later");
// SCOPE TO THE FUNCTION BODY, NOT THE FILE. The first version of this assertion
// tested OPERATIONAL_RX against the whole migration and PASSED a mutation that
// deleted the status test from the trigger — because the same string still
// appears in the file's UPDATE statement and its verification SELECT. That is
// CLAUDE.md's role-vs-substring trap, committed while writing a guard against
// exactly that class of bug. The gate lives inside the function; assert there.
const fnBody = (servable.match(/create or replace function public\.wf_editorial_requires_servable_place[\s\S]*?\$\$;/) || [""])[0];
ok(fnBody.length > 0, "the trigger function body is locatable (without it every assertion below is scoped to nothing)");
ok(/new\.verified is true/.test(fnBody), "the trigger gates on verified=true");
ok(OPERATIONAL_RX.test(fnBody),
  "…and the OPERATIONAL status test is INSIDE THE FUNCTION BODY, not merely somewhere in the file — the whole-file version of this assertion passed a mutation that deleted it from the trigger");
ok(/errcode = 'check_violation'/.test(servable),
  "…raising check_violation, the errcode the live probe catches — a bare RAISE would be indistinguishable from an unrelated failure");
// The serving path is the REASON this trigger is load-bearing. If a future
// change adds a status filter to the read, this assertion goes red and whoever
// does it is told to re-examine the trigger rather than leaving two half-rules.
const editorialRoute = stripComments(read("../app/api/editorial/route.js"));
ok(/verified=is\.true/.test(editorialRoute),
  "app/api/editorial still gates on verified=is.true (the flag this whole file governs)");
ok(!/status=eq\.OPERATIONAL/.test(editorialRoute),
  "…and still does NOT filter on inventory status — which is exactly why the trigger has to hold the line. POSITIVE CONTROL for this absence: the assertion above proves the probe reads real query text from the same file.");

// The demote side specifically. A file that only ever promotes is how this bug
// happened, so assert the DEMOTING statement exists and that it is guarded by
// content, not by `issues` alone.
const demote = symmetry.match(/update public\.wf_editorial\s+set verified = false[\s\S]*?;/);
ok(!!demote, "the migration contains an `update … set verified = false` — a gate with no demote path is the bug this file exists for");
if (demote) {
  const d = demote[0];
  ok(HOOK_RX.test(d) && WHY_RX.test(d) && FACTS_RX.test(d),
    "…and that demote statement is guarded by all THREE content thresholds, not by `issues` alone (the exact asymmetry that left 207 empty rows published)");
  ok(/issues\s*=\s*array\['empty-published-row'\]/.test(d),
    "…and stamps a named, greppable reason so the change is auditable and reversible in one statement");
}

// And the database-level invariant, so this cannot be reintroduced by hand.
ok(/add constraint wf_editorial_verified_needs_content/.test(symmetry), "the migration adds a CHECK constraint — the rule is enforced by the database, not only by whichever code path happens to run");
ok(/validate constraint wf_editorial_verified_needs_content/.test(symmetry), "…and VALIDATEs it against existing rows, so it is not merely armed for future writes");

if (fail.length) {
  console.error("check-editorial-publish-symmetry: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`check-editorial-publish-symmetry: OK — ${pass} assertions; editorialRow() was CALLED across every boundary of all three publish thresholds (19/20 hook, 119/120 why_here, 0/1 sourced facts, whitespace-only prose) and its returned `+"`verified`"+` read back, with a complete row as the positive control; both SQL files are asserted to test the same three thresholds on BOTH the promote and demote sides. False-positive surface: lib/atlasEditorial.js + the 2 SQL files; it proves nothing about other publish paths.`);
