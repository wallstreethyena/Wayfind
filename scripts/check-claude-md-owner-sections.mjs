#!/usr/bin/env node
// STRUCTURAL-ONLY: the protected thing is a document (CLAUDE.md), not executable code.
// check-claude-md-owner-sections — owner instructions in CLAUDE.md cannot be
// silently dropped (owner directive, 2026-11-12).
//
// CLAUDE.md is owner-only (scripts/lib/ownerApproval.mjs): every edit already
// needs the owner's GitHub review (Review changes → Approve). That stops unapproved edits but
// not an approved edit that quietly loses a rule along the way. This guard
// pins what must stay:
//   - the GABRIEL EXECUTION AUTONOMY section, exactly once, with its manual
//     action format, its eight hard stops, its no-bypass clause and its
//     "never relaxes any other rule" clause;
//   - the No Magic Owner Comments section (2026-11-13), exactly once, with its clauses;
//   - every top-level safety section and the core safety sentences they carry.
// Changing a pinned rule on purpose means editing this guard in the same
// owner-approved PR, so the change is visible in review.
//
// Positive control: the committed CLAUDE.md passes. Negative controls: each
// mutation below (section removed, a hard stop removed, the no-bypass clause
// removed, a safety section removed, a section duplicated, the manual
// action minimization rule removed) must fail.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTONOMY = "## GABRIEL EXECUTION AUTONOMY";

const NO_MAGIC = "## No Magic Owner Comments";
const NO_MAGIC_CLAUSES = [
  "**Never ask Gabriel to paste `/owner-approve <SHA>`**",
  "authenticated GitHub PR review (Review changes → Approve)",
  "fingerprint of the protected (owner-only) content",
  "Rebases, main moving and unrelated changes never invalidate it",
  "A fresh review is needed only when owner-controlled content materially changes.",
  "**Never create scheduled reminders or check-ins to nag for approval.**",
  "request one normal GitHub Approve action",
  "stay silent until it happens",
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
  "owner-only files still need the owner's GitHub review",
  "**Blocked does not mean stop.**",
  "**No implementation diary.**",
  "**Completion standard.**",
  "**Manual Action Minimization.**",
  "GABRIEL ACTION REQUIRED: NONE",
  "C re-approval of approved scope → never ask again",
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
  if (headingCount(NO_MAGIC) !== 1) errors.push(`expected exactly one "${NO_MAGIC}" heading, found ${headingCount(NO_MAGIC)}`);
  const noMagic = sectionBody(text, NO_MAGIC) || "";
  for (const c of NO_MAGIC_CLAUSES) if (!noMagic.includes(c)) errors.push(`no-magic-comments section lost: ${c}`);
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
  const broken = real.split(from).join(to); // every copy, so a second mention can't mask the removal
  if (broken === real) { fail.push(`control "${label}": mutation did not change the text`); return; }
  if (!evaluate(broken).length) fail.push(`control "${label}" stayed green`);
};
const autonomy = sectionBody(real, AUTONOMY) || "";
mutate("autonomy section removed", autonomy, "");
mutate("hard stop 8 removed", "\n8. create significant irreversible risk.", "");
mutate("no-bypass clause removed", "Never bypass, imitate or work around a denied action or a platform safety gate", "Proceed");
mutate("relaxes-nothing clause removed", "This section never relaxes any other rule in this file", "This section overrides");
mutate("manual action format removed", "MANUAL ACTION REQUIRED", "Say go");
mutate("manual action minimization removed", "**Manual Action Minimization.**", "**Ask freely.**");
mutate("booking safety section removed", sectionBody(real, "## Booking integrity") || "\u0000", "");
mutate("owner-gated merges removed", "**Merges are owner-gated.**", "Merge freely.");
mutate("autonomy section duplicated", autonomy, autonomy + autonomy);
const noMagicBody = sectionBody(real, NO_MAGIC) || "\u0000";
mutate("no-magic-comments section removed", noMagicBody, "");
mutate("no-nag-reminders clause removed", "**Never create scheduled reminders or check-ins to nag for approval.**", "**Remind Gabriel daily.**");
mutate("fingerprint binding removed", "fingerprint of the protected (owner-only) content", "exact head commit");

if (fail.length) {
  console.error("check-claude-md-owner-sections: FAIL\n  " + fail.join("\n  "));
  process.exit(1);
}
console.log(`check-claude-md-owner-sections: OK — ${assertions} assertions: CLAUDE.md carries the GABRIEL EXECUTION AUTONOMY section once (${AUTONOMY_CLAUSES.length} clauses, hard stops 1 to 8), the No Magic Owner Comments section once (${NO_MAGIC_CLAUSES.length} clauses), ${SAFETY_SECTIONS.length} safety sections exactly once and ${SAFETY_SENTENCES.length} core safety sentences; 12 negative controls each went red. False-positive surface: an owner-approved rewording of a pinned sentence fails here until this guard is updated in the same PR.`);
