#!/usr/bin/env node
// STRUCTURAL-ONLY: the protected thing is a document (CLAUDE.md), not executable code.
// check-claude-md-owner-sections — owner instructions in CLAUDE.md cannot be
// silently dropped (owner directive, 2026-11-12).
//
// CLAUDE.md is owner-only (scripts/lib/ownerApproval.mjs): every edit already
// needs an "/owner-approve <head sha>" comment. That stops unapproved edits but
// not an approved edit that quietly loses a rule along the way. This guard
// pins what must stay:
//   - the GABRIEL EXECUTION AUTONOMY section (the owner operating mode),
//     exactly once, with its manual action format, its ten hard stops, its
//     no-bypass clause, its "never relaxes any other rule" clause, and the
//     2026-11-13 operating rules (approval follows meaning, notification
//     classes, completion report, temporary automation cleanup, TESTED vs
//     DEPLOYED vs VERIFIED, brand assets);
//   - every top-level safety section and the core safety sentences they carry.
// Changing a pinned rule on purpose means editing this guard in the same
// owner-approved PR, so the change is visible in review.
//
// Positive control: the committed CLAUDE.md passes. Negative controls: each
// mutation below (section removed, a hard stop removed, the no-bypass clause
// removed, a safety section removed, a section duplicated) must fail.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTONOMY = "## GABRIEL EXECUTION AUTONOMY";

export const SAFETY_SECTIONS = [
  "## Booking integrity",
  "## Revenue-path rules",
  "## Concurrency & git",
  "## How to ship a fix",
  "## Writing guards & assertions",
  "## Verification",
  "## Extraction PRs",
  "## Code gotchas",
  "## Housekeeping",
];

export const SAFETY_SENTENCES = [
  "**Never weaken `geoConfirms()`**",
  "**Never weaken the beach exclusion**",
  "**Deterministic provider failures (billing/quota) never retry.**",
  "**Merges are owner-gated.**",
  "Full `npm run prebuild` green before commit.",
  "Never commit, stash,",
  "**Force-push only as a pinned compare-and-swap**",
  "**Pipes swallow exit codes.**",
];

const AUTONOMY_CLAUSES = [
  "MANUAL ACTION REQUIRED",
  "**A tool confirmation dialog is not a new decision.**",
  "Never bypass, imitate or work around a denied action or a platform safety gate",
  "This section never relaxes any other rule in this file",
  "`/owner-approve <head sha>`",
  "**Blocked does not mean stop.**",
  "**No implementation diary.**",
  "**Completion standard.**",
  "**Approval follows meaning, not the commit hash.**",
  "Never weaken owner protection to avoid an approval",
  "Previously approved scope changed: YES / NO",
  "**Classify before notifying.**",
  "An error code alone is not an incident",
  "**Completion report.**",
  "Production: LIVE + VERIFIED | NOT YET VERIFIED",
  "Concise never means hiding failed tests",
  "**Temporary automation must die.**",
  "Gabriel's Mac is not production infrastructure.",
  "**TESTED, DEPLOYED, VERIFIED are different words.**",
  "Never disable a live safeguard just to prove its off switch works.",
  "**Fix systems, not symptoms.**",
  "**Brand assets.**",
];

/** The section body: from its heading to the next top-level heading. */
function sectionBody(text, heading) {
  const start = text.indexOf("\n" + heading);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.slice(heading.length).search(/\n## /);
  return next < 0 ? rest : rest.slice(0, heading.length + next);
}

/** Errors for one CLAUDE.md text; empty means it passes. */
export function evaluate(text) {
  const errors = [];
  const headingCount = (h) => text.split("\n").filter((l) => l.startsWith(h)).length;
  if (headingCount(AUTONOMY) !== 1) errors.push(`expected exactly one "${AUTONOMY}" heading, found ${headingCount(AUTONOMY)}`);
  const body = sectionBody(text, AUTONOMY);
  if (body) {
    for (const c of AUTONOMY_CLAUSES) if (!body.includes(c)) errors.push(`autonomy section lost: ${c}`);
    const stops = body.split("\n").map((l) => /^(\d+)\. /.exec(l)).filter(Boolean).map((m) => Number(m[1]));
    if (stops.join(",") !== "1,2,3,4,5,6,7,8,9,10") errors.push(`autonomy section must list hard stops 1 to 10 in order (found ${stops.join(",") || "none"})`);
  }
  for (const h of SAFETY_SECTIONS) if (headingCount(h) !== 1) errors.push(`safety section "${h}" must appear exactly once (found ${headingCount(h)})`);
  for (const s of SAFETY_SENTENCES) if (!text.includes(s)) errors.push(`safety rule lost: ${s}`);
  return errors;
}

const real = readFileSync(path.join(root, "CLAUDE.md"), "utf8");
let assertions = 0;
const fail = [];
const realErrors = evaluate(real);
assertions++;
if (realErrors.length) fail.push("CLAUDE.md: " + realErrors.join("; "));

// Each mutation must turn the check red; prove the mutation applied first.
const mutate = (label, from, to) => {
  assertions++;
  if (!real.includes(from)) { fail.push(`control "${label}": probe text not found, the control cannot run`); return; }
  const broken = real.replace(from, to);
  if (broken === real) { fail.push(`control "${label}": mutation did not change the text`); return; }
  if (!evaluate(broken).length) fail.push(`control "${label}" stayed green`);
};
const autonomy = sectionBody(real, AUTONOMY) || "";
mutate("autonomy section removed", autonomy, "");
mutate("hard stop 8 removed", "\n8. create significant irreversible risk;", "");
mutate("hard stop 10 removed", "\n10. technically require his own identity or account", "");
mutate("approval-by-meaning rule removed", "**Approval follows meaning, not the commit hash.**", "Approval follows the SHA.");
mutate("no-hiding clause removed", "Concise never means hiding failed tests", "Keep it short");
mutate("temporary automation rule removed", "**Temporary automation must die.**", "Watchers may stay.");
mutate("no-bypass clause removed", "Never bypass, imitate or work around a denied action or a platform safety gate", "Proceed");
mutate("relaxes-nothing clause removed", "This section never relaxes any other rule in this file", "This section overrides");
mutate("manual action format removed", "MANUAL ACTION REQUIRED", "Say go");
mutate("booking safety section removed", sectionBody(real, "## Booking integrity") || "\u0000", "");
mutate("owner-gated merges removed", "**Merges are owner-gated.**", "Merge freely.");
mutate("autonomy section duplicated", autonomy, autonomy + autonomy);

if (fail.length) {
  console.error("check-claude-md-owner-sections: FAIL\n  " + fail.join("\n  "));
  process.exit(1);
}
console.log(`check-claude-md-owner-sections: OK — ${assertions} assertions: CLAUDE.md carries the GABRIEL EXECUTION AUTONOMY section once (${AUTONOMY_CLAUSES.length} clauses, hard stops 1 to 10), ${SAFETY_SECTIONS.length} safety sections exactly once and ${SAFETY_SENTENCES.length} core safety sentences; 12 negative controls each went red. False-positive surface: an owner-approved rewording of a pinned sentence fails here until this guard is updated in the same PR.`);
