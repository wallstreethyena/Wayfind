#!/usr/bin/env node
// Founder visual-approval gate for the shared place card.
//
// Agents may fix implementation defects. They may not silently redefine the
// #1302 premium card. When any visual-contract file changes, the PR must
// carry the `ui-owner-approved` label before merge.
//
// This is a GitHub PR check, NOT a prebuild guard. Vercel has no PR labels
// and must not go red for a missing human approval.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "ui-owner-approved";
const PROTECTED = [
  "lib/placeCardStandard.js",
  "app/components/css.js",
  "app/components/IconicPlaceCard.js",
  "app/components/RailCard.js",
  "app/components/PlaceCardSkeleton.js",
  "scripts/check-place-card-visual-contract.mjs",
  "docs/ui/place-card-standard.md",
];

export function needsOwnerApproval(changedFiles, labels) {
  const files = [...new Set((changedFiles || []).map((file) => String(file).replace(/^\.\//, "")))];
  const hit = PROTECTED.filter((file) => files.includes(file));
  const approved = (labels || []).includes(LABEL);
  return { required: hit.length > 0, approved, files: hit };
}

let pass = 0;
const failures = [];
const ok = (condition, message) => { pass++; if (!condition) failures.push(message); };

const owners = readFileSync(path.join(ROOT, ".github/CODEOWNERS"), "utf8");
ok(existsSync(path.join(ROOT, ".github/workflows/ui-owner-approved.yml")),
  "PROBE: ui-owner-approved.yml exists");
for (const file of PROTECTED) {
  ok(owners.includes(file), `CODEOWNERS lists ${file}`);
}

const none = needsOwnerApproval(["lib/bookingResolver.js"], []);
ok(none.required === false, "a non-card file does not require founder UI approval");
const blocked = needsOwnerApproval(["lib/placeCardStandard.js", "app/home.js"], []);
ok(blocked.required === true && blocked.approved === false && blocked.files.includes("lib/placeCardStandard.js"),
  "a visual-contract file without the label stays blocked");
const allowed = needsOwnerApproval(["app/components/css.js"], [LABEL]);
ok(allowed.required === true && allowed.approved === true, "the same file with ui-owner-approved is approved");

function labelsFromEvent(event) {
  return (event?.pull_request?.labels || []).map((row) => row.name);
}

function changedFromEvent(event) {
  const repo = event?.repository?.full_name;
  const number = event?.pull_request?.number;
  if (!repo || !number) return null;
  const listed = spawnSync("gh", [
    "api",
    "--paginate",
    `repos/${repo}/pulls/${number}/files`,
    "--jq",
    ".[].filename",
  ], { encoding: "utf8" });
  if (listed.status !== 0) return null;
  const names = String(listed.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return names;
}

const eventPath = process.env.GITHUB_EVENT_PATH;
if (eventPath && existsSync(eventPath)) {
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  if (event.pull_request) {
    const labels = labelsFromEvent(event);
    const changed = changedFromEvent(event);
    ok(Array.isArray(changed), "PROBE: PR file list is readable via gh api");
    const verdict = needsOwnerApproval(changed || [], labels);
    if (verdict.required && !verdict.approved) {
      ok(false, `shared place-card visual files changed (${verdict.files.join(", ")}) and the \`${LABEL}\` label is absent — founder visual approval is required before merge`);
    } else if (verdict.required) {
      console.log(`  founder UI approval present for ${verdict.files.join(", ")}`);
    } else {
      console.log("  no shared place-card visual-contract files in this PR — approval not required");
    }
  }
}

if (failures.length) {
  console.error("check-ui-owner-approved: FAIL");
  failures.forEach((failure) => console.error("  ✗ " + failure));
  process.exit(1);
}
console.log(`check-ui-owner-approved: OK — ${pass} assertions; shared place-card appearance stays founder-gated`);
