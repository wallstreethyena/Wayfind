#!/usr/bin/env node
// STRUCTURAL-ONLY: the protected thing is a document (CLAUDE.md), not executable code.
// check-claude-md-owner-sections — owner instructions in CLAUDE.md cannot be
// silently dropped (owner directive 2026-11-12; ported from #2494 on 2026-11-14 and
// rewritten for the comment-fingerprint approval contract).
//
// CLAUDE.md is owner-only (scripts/lib/ownerApproval.mjs): every edit already needs
// the owner's "/owner-approve <fingerprint>" comment. That stops unapproved edits but
// not an approved edit that quietly loses a rule along the way. This guard pins:
//   - the GABRIEL EXECUTION AUTONOMY section, exactly once, with its manual action
//     format, its eight hard stops, its no-bypass clause, its "never relaxes any
//     other rule" clause and Manual Action Minimization;
//   - the Owner approval section, exactly once, with the comment-fingerprint
//     contract and the honest shared-identity limit (agents never post approvals);
//     and it REFUSES the native-review claims of #2494 ("Review changes → Approve",
//     "No Magic Owner Comments"), which cannot work: every PR is authored by the
//     owner account and GitHub forbids approving your own PR;
//   - the merge-queue text of "How to ship a fix" (label, halt label, fingerprint);
//   - every top-level safety section and the core safety sentences they carry.
// Changing a pinned rule on purpose means editing this guard in the same
// owner-approved PR, so the change is visible in review.
//
// Positive control: the committed CLAUDE.md passes. Negative controls: each mutation
// below must fail, and each proves its probe text exists before mutating.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTONOMY = "## GABRIEL EXECUTION AUTONOMY";
const APPROVAL = "## Owner approval";
const SHIP = "## How to ship a fix";

const AUTONOMY_CLAUSES = [
  "MANUAL ACTION REQUIRED",
  "**A tool confirmation dialog is not a new decision.**",
  "Never bypass, imitate or work around a denied action or a platform safety gate",
  "This section never relaxes any other rule in this file",
  "owner-only files still need the owner's `/owner-approve` comment",
  "**Blocked does not mean stop.**",
  "**No implementation diary.**",
  "**Completion standard.**",
  "**Manual Action Minimization.**",
  "GABRIEL ACTION REQUIRED: NONE",
  "C re-approval of approved scope → never ask again",
];

const APPROVAL_CLAUSES = [
  "GitHub forbids an account approving its own PR",
  "`/owner-approve <fingerprint>`",
  "The fingerprint binds the PR number, its base branch and the protected content.",
  "Rebases,\n  main moving and unrelated changes never invalidate it",
  "removing a line from `scripts/guards.txt`",
  "**Never create scheduled reminders or check-ins to nag for approval.**",
  "**Shared-identity limit (honest).**",
  "**agents never post `/owner-approve`\n  comments**",
  "`owner-approval-recheck`",
];

// Claims that are false for this repository (native self-review is impossible).
const FORBIDDEN = [
  "Review changes → Approve",
  "No Magic Owner Comments",
  "Never ask Gabriel to paste `/owner-approve",
];

const SHIP_CLAUSES = [
  "label `merge-queue`",
  "The halt label `merge-queue-halt` stops the queue before its next step",
  "`/owner-approve <fingerprint>`",
  "**Agents never post approvals.**",
];

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
  "**Land through the merge queue, never by racing main.**",
  "Full `npm run prebuild` green before commit.",
  "Never commit, stash,",
  "**Force-push only as a pinned compare-and-swap**",
  "**Pipes swallow exit codes.**",
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
    const stops = body.split("\n").filter((l) => /^[1-8]\. /.test(l)).map((l) => Number(l[0]));
    if (stops.join(",") !== "1,2,3,4,5,6,7,8") errors.push(`autonomy section must list hard stops 1 to 8 in order (found ${stops.join(",") || "none"})`);
  }
  if (headingCount(APPROVAL) !== 1) errors.push(`expected exactly one "${APPROVAL}" heading, found ${headingCount(APPROVAL)}`);
  const approval = sectionBody(text, APPROVAL) || "";
  for (const c of APPROVAL_CLAUSES) if (!approval.includes(c)) errors.push(`owner approval section lost: ${c.replace(/\n\s*/g, " ")}`);
  for (const f of FORBIDDEN) if (text.includes(f)) errors.push(`false approval claim present (native self-review cannot work here): ${f}`);
  const ship = sectionBody(text, SHIP) || "";
  for (const c of SHIP_CLAUSES) if (!ship.includes(c)) errors.push(`"How to ship a fix" lost: ${c}`);
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
let controls = 0;
const mutate = (label, from, to) => {
  assertions++;
  controls++;
  if (!real.includes(from)) { fail.push(`control "${label}": probe text not found, the control cannot run`); return; }
  const broken = real.split(from).join(to); // every copy, so a second mention can't mask the removal
  if (broken === real) { fail.push(`control "${label}": mutation did not change the text`); return; }
  if (!evaluate(broken).length) fail.push(`control "${label}" stayed green`);
};
const autonomy = sectionBody(real, AUTONOMY) || "\u0000";
const approval = sectionBody(real, APPROVAL) || "\u0000";
mutate("autonomy section removed", autonomy, "");
mutate("hard stop 8 removed", "\n8. create significant irreversible risk.", "");
mutate("no-bypass clause removed", "Never bypass, imitate or work around a denied action or a platform safety gate", "Proceed");
mutate("relaxes-nothing clause removed", "This section never relaxes any other rule in this file", "This section overrides");
mutate("manual action format removed", "MANUAL ACTION REQUIRED", "Say go");
mutate("manual action minimization removed", "**Manual Action Minimization.**", "**Ask freely.**");
mutate("booking safety section removed", sectionBody(real, "## Booking integrity") || "\u0000", "");
mutate("merge queue rule removed", "**Land through the merge queue, never by racing main.**", "Merge freely.");
mutate("autonomy section duplicated", autonomy, autonomy + autonomy);
mutate("owner approval section removed", approval, "");
mutate("no-nag-reminders clause removed", "**Never create scheduled reminders or check-ins to nag for approval.**", "**Remind Gabriel daily.**");
mutate("base-branch binding removed", "The fingerprint binds the PR number, its base branch and the protected content.", "The fingerprint binds the head commit.");
mutate("shared-identity limit removed", "**Shared-identity limit (honest).**", "**Identity.**");
mutate("agents-never-post rule removed", "**agents never post `/owner-approve`\n  comments**", "agents may post approvals");
mutate("native review claim reintroduced", "`/owner-approve <fingerprint>`, the 64-hex value", "a GitHub review (Review changes → Approve), the 64-hex value");
mutate("halt label removed", "The halt label `merge-queue-halt` stops the queue before its next step", "The queue never stops");

if (fail.length) {
  console.error("check-claude-md-owner-sections: FAIL\n  " + fail.join("\n  "));
  process.exit(1);
}
console.log(`check-claude-md-owner-sections: OK — ${assertions} assertions: CLAUDE.md carries the GABRIEL EXECUTION AUTONOMY section once (${AUTONOMY_CLAUSES.length} clauses, hard stops 1 to 8), the Owner approval section once (${APPROVAL_CLAUSES.length} clauses, comment fingerprint + shared-identity limit, ${FORBIDDEN.length} false native-review claims refused), the merge-queue ship rule (${SHIP_CLAUSES.length} clauses), ${SAFETY_SECTIONS.length} safety sections exactly once and ${SAFETY_SENTENCES.length} core safety sentences; ${controls} negative controls each went red. False-positive surface: an owner-approved rewording of a pinned sentence fails here until this guard is updated in the same PR.`);
