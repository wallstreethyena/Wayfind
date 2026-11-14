// scripts/lib/mergeQueue.mjs — the merge queue's DECISIONS. Pure: no I/O, no clock,
// no environment. scripts/merge-queue.mjs does the GitHub calls and asks this file
// what each answer means; scripts/test-merge-queue.mjs drives both.
//
// Why a queue exists: this is a personal-account repository, so there is no native
// merge queue, branch protection requires "strict" (up to date with main), and
// several lanes merge concurrently. Lanes add the `merge-queue` label instead of
// merging; one worker merges them one at a time, each tested on top of the main it
// will land on.

export const DEFAULT_LABEL = "merge-queue";
export const HALT_LABEL = "merge-queue-halt";
export const DEFAULT_GUARDS_WORKFLOW = "guards.yml";
export const GUARDS_CHECK_NAME = "guards";
export const OWNER_APPROVAL_CHECK_NAME = "owner-approval";
export const GITHUB_ACTIONS_APP_ID = 15368;
const SHA40 = /^[0-9a-f]{40}$/i;

// Possible states of a queued PR, in the order they are checked.
export const STATES = Object.freeze({
  CONFLICT: "conflict",
  NEEDS_UPDATE: "needs-update",
  AWAITING_CI: "awaiting-ci",
  CI_FAILED: "ci-failed",
  APPROVAL_MISSING: "approval-missing",
  READY: "ready",
});

/** Refusal reason, or null when this process may run the queue. */
export function refuseUnlessMainOnActions(env) {
  if (!env || env.GITHUB_ACTIONS !== "true") return "the merge queue runs only inside GitHub Actions (GITHUB_ACTIONS must be \"true\")";
  if (env.GITHUB_REF !== "refs/heads/main") return `the merge queue runs only from main (GITHUB_REF is "${env.GITHUB_REF || ""}", need "refs/heads/main"), so a pull request cannot supply the code that merges it`;
  return null;
}

/** Parsed configuration, or { error }. */
export function readConfig(env) {
  const token = String((env && env.GITHUB_TOKEN) || "").trim();
  if (!token) return { error: "GITHUB_TOKEN is not set" };
  const repo = String((env && env.GITHUB_REPOSITORY) || "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: "GITHUB_REPOSITORY is missing or malformed" };
  const api = String((env && env.GITHUB_API_URL) || "https://api.github.com").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/.test(api)) return { error: "GITHUB_API_URL is not an https URL" };
  const label = String((env && env.MERGE_QUEUE_LABEL) || "").trim() || DEFAULT_LABEL;
  const guardsFile = String((env && env.GUARDS_WORKFLOW_FILE) || "").trim() || DEFAULT_GUARDS_WORKFLOW;
  if (!/^[\w.-]+\.ya?ml$/.test(guardsFile)) return { error: `GUARDS_WORKFLOW_FILE "${guardsFile}" is not a workflow file name` };
  const dryRun = String((env && env.MERGE_QUEUE_DRY_RUN) || "") === "1";
  return { error: null, token, repo, api, label, guardsFile, dryRun };
}

const hasLabel = (pr, label) => Array.isArray(pr && pr.labels) && pr.labels.some((l) => (typeof l === "string" ? l : l && l.name) === label);

/** A PR the queue may touch: labelled, open, not a draft, targeting `base`. */
export function isQueueable(pr, { label = DEFAULT_LABEL, base = "main" } = {}) {
  return !!pr && pr.state === "open" && pr.draft !== true && !!pr.base && pr.base.ref === base && hasLabel(pr, label);
}

/** Next PR to merge: the queueable one with the lowest number (= oldest), skipping `skip`. */
export function pickNext(prs, { label = DEFAULT_LABEL, base = "main", skip = new Set() } = {}) {
  const eligible = (Array.isArray(prs) ? prs : [])
    .filter((pr) => isQueueable(pr, { label, base }) && Number.isInteger(pr.number) && !skip.has(pr.number))
    .sort((a, b) => a.number - b.number);
  return eligible.length ? eligible[0] : null;
}

/**
 * Classify one queued PR from facts the worker has just read.
 *   pr: { mergeable, mergeable_state }       mergeable === false is a conflict
 *   behindBy: number                          commits main has that the head lacks
 *   guards: null | { conclusion }             null = the check-run is not there (yet)
 *   approval: null | { ok }                   null = not evaluated yet
 */
export function classify({ pr, behindBy, guards = null, approval = null }) {
  if (pr && (pr.mergeable === false || pr.mergeable_state === "dirty")) return STATES.CONFLICT;
  if (!Number.isInteger(behindBy) || behindBy > 0) return STATES.NEEDS_UPDATE; // unknown is not "up to date"
  if (!guards) return STATES.AWAITING_CI;
  if (guards.conclusion !== "success") return STATES.CI_FAILED;
  if (!approval) return STATES.READY;   // CI is green; approval is the next step
  return approval.ok ? STATES.READY : STATES.APPROVAL_MISSING;
}

/**
 * The newest "guards" check-run that belongs to THE run the queue dispatched:
 * name exactly "guards", created by GitHub Actions (app id 15368), completed, on the
 * tested head sha, and inside that run's check suite (check_run.check_suite.id ===
 * run.check_suite_id). A same-named check from another app, another run (another
 * suite) or another commit is not it. Without a numeric checkSuiteId and a headSha
 * nothing can match: identity is never guessed.
 */
export function pickGuardsCheck(checkRuns, { checkSuiteId, headSha } = {}) {
  if (!Number.isInteger(checkSuiteId) || checkSuiteId < 1 || !SHA40.test(String(headSha || ""))) return null;
  const mine = (Array.isArray(checkRuns) ? checkRuns : []).filter((c) => c && c.name === GUARDS_CHECK_NAME
    && c.app && c.app.id === GITHUB_ACTIONS_APP_ID && c.status === "completed"
    && c.check_suite && c.check_suite.id === checkSuiteId
    && String(c.head_sha || "").toLowerCase() === String(headSha).toLowerCase());
  mine.sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")) || (b.id || 0) - (a.id || 0));
  return mine.length ? mine[0] : null;
}

/** True when run.path is exactly the guards workflow file (an "@ref" suffix is tolerated). */
export function isGuardsWorkflowRun(run, guardsFile = DEFAULT_GUARDS_WORKFLOW) {
  const p = String((run && run.path) || "");
  const want = `.github/workflows/${guardsFile}`;
  return p === want || p.startsWith(`${want}@`);
}

/** The dispatched run among a workflow's recent runs, or null. */
export function pickDispatchedRun(runs, { headSha, knownIds = new Set(), notBeforeMs = 0, guardsFile = DEFAULT_GUARDS_WORKFLOW }) {
  const mine = (Array.isArray(runs) ? runs : []).filter((r) => r && isGuardsWorkflowRun(r, guardsFile) && r.event === "workflow_dispatch"
    && String(r.head_sha || "").toLowerCase() === String(headSha || "").toLowerCase()
    && !knownIds.has(r.id) && Date.parse(r.created_at) >= notBeforeMs);
  mine.sort((a, b) => b.id - a.id);
  return mine.length ? mine[0] : null;
}

/**
 * Re-check a run read back by id. Returns null when it is the run we dispatched, else
 * the reason it is not. A run that cannot prove its identity is not used.
 */
export function guardsRunMismatch(run, { headSha, guardsFile = DEFAULT_GUARDS_WORKFLOW, notBeforeMs = 0 }) {
  if (!run) return "no run";
  if (!isGuardsWorkflowRun(run, guardsFile)) return `run is not ${guardsFile} (path ${run.path || "unknown"})`;
  if (run.event !== "workflow_dispatch") return `run event is ${run.event || "unknown"}, not workflow_dispatch`;
  if (String(run.head_sha || "").toLowerCase() !== String(headSha || "").toLowerCase()) return "run tested a different commit";
  if (!(Date.parse(run.created_at) >= notBeforeMs)) return "run was created before the dispatch";
  if (!Number.isInteger(run.check_suite_id) || run.check_suite_id < 1) return "run has no check suite id";
  return null;
}

/** Tree equality for the union proof. Anything that is not a full sha never matches. */
export function treesEqual(a, b) {
  return typeof a === "string" && typeof b === "string" && SHA40.test(a) && SHA40.test(b) && a.toLowerCase() === b.toLowerCase();
}

const short = (sha) => String(sha || "").slice(0, 12);

/**
 * Text of the one comment a dropped PR gets. kind is one of:
 *   conflict | ci-failed | ci-timeout | approval-missing | merge-failed | main-moving | workflow-permission | unexpected
 */
export function buildComment(kind, d = {}) {
  switch (kind) {
    case "conflict":
      return "Merge queue: conflicts with main; restack and re-label.";
    case "ci-failed":
      return `Merge queue: the \`guards\` check did not pass on ${short(d.head)} (${d.detail || "no passing check-run"}). Removed from the queue; fix and re-label.${d.runUrl ? `\n\nRun: ${d.runUrl}` : ""}`;
    case "ci-timeout":
      return `Merge queue: the \`guards\` run for ${short(d.head)} did not finish within ${d.minutes} minutes. Removed from the queue; re-label to try again.${d.runUrl ? `\n\nRun: ${d.runUrl}` : ""}`;
    case "approval-missing":
      return `Merge queue: owner approval failed for ${short(d.head)}: ${d.reason}\n\nRemoved from the queue; re-label once resolved.`;
    case "merge-failed":
      return `Merge queue: GitHub refused the squash merge of ${short(d.head)} ${d.attempts} time(s) (last HTTP ${d.status}: ${d.detail || "no detail"}). Removed from the queue; re-label to try again.`;
    case "workflow-permission":
      return `Merge queue: GitHub would not let the queue's built-in token ${d.step || "update or merge"} ${short(d.head)}, because the result touches \`.github/workflows\` (that token has no workflows permission). An agent with its own credentials must ${d.step === "merge" ? "merge it" : "update the branch"} once; then re-label. (${d.detail || "no detail"})`;
    case "main-moving":
      return `Merge queue: main moved ${d.attempts} times while ${short(d.head)} was being tested, so it could not be proven against the main it would land on. Removed from the queue; re-label to try again.`;
    default:
      return `Merge queue: unexpected problem with ${short(d.head)}: ${d.detail || "unknown"}. Removed from the queue; re-label to try again.`;
  }
}

/** GitHub's refusal when a token without the workflows permission would create or update a workflow file. */
export function isWorkflowPermissionRefusal(status, message) {
  return [403, 404, 405, 409, 422].includes(Number(status)) && /workflow/i.test(String(message || "")) && /permission|scope|refus/i.test(String(message || ""));
}

/** Alarm text for a merged commit whose tree is not the tree that was tested. */
export function buildTreeMismatchMessage({ number, mergeSha, mergedTree, testedHead, testedTree }) {
  return `merge queue UNION PROOF FAILED for #${number}: main commit ${short(mergeSha)} has tree ${short(mergedTree)} but the tested head ${short(testedHead)} has tree ${short(testedTree)}. The merge was NOT reverted. Inspect main now.`;
}
