#!/usr/bin/env node
/**
 * scripts/merge-queue.mjs — Wayfind's serial merge queue worker.
 *
 * Runs ONLY inside GitHub Actions, from main (a pull request must never supply the
 * code that merges it). Lanes add the `merge-queue` label instead of merging; this
 * worker takes labelled PRs oldest first, ONE AT A TIME, and for each one:
 *
 *   1. re-reads it; a conflict drops it (label removed, one comment)
 *   2. brings it up to date with main (update-branch pinned to the head it read)
 *   3. dispatches the guards workflow on its branch and waits for the result
 *      (pushes made with GITHUB_TOKEN do not trigger workflows, workflow_dispatch does)
 *   4. decides owner approval with the repo's own rules and posts `owner-approval`
 *   5. squash-merges, pinned to the tested head sha
 *   6. proves main's new tree is exactly the tested head's tree (never reverts)
 *   7. dispatches guards on main and removes the label
 *
 * It never force-pushes, never deletes branches, never touches an unlabelled PR.
 * The decisions live in scripts/lib/mergeQueue.mjs; the tests (scripts/test-merge-queue.mjs)
 * drive this file against a fake GitHub with no network.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_API_URL, GITHUB_ACTIONS, GITHUB_REF,
 *      MERGE_QUEUE_LABEL (merge-queue), GUARDS_WORKFLOW_FILE (guards.yml),
 *      MERGE_QUEUE_DRY_RUN=1 (read and log only: no label, comment, dispatch, update or merge).
 */
import { pathToFileURL } from "node:url";
import { decideOwnerApproval, isOwnerOnly } from "./lib/ownerApproval.mjs";
import { fetchPullEvidence } from "./lib/githubPullEvidence.mjs";

export const POST_MERGE_PATH_WORKFLOWS = Object.freeze([
  { file: "python-audit.yml", match: (f) => f.startsWith("tools/python/") || f === "scripts/export-revenue-pins.mjs" || f === ".github/workflows/python-audit.yml" },
  { file: "native-trends.yml", match: (f) => /^lib\/trendSources\/native[^/]*\.js$/.test(f) || f === "scripts/native-trends-collect.mjs" || f === ".github/workflows/native-trends.yml" },
]);
import {
  STATES, GUARDS_CHECK_NAME, OWNER_APPROVAL_CHECK_NAME,
  refuseUnlessMainOnActions, readConfig, pickNext, isQueueable, classify,
  pickGuardsCheck, pickDispatchedRun, treesEqual,
  buildComment, buildTreeMismatchMessage,
} from "./lib/mergeQueue.mjs";

export const MAX_MERGE_ATTEMPTS = 3;   // 405/409 from the merge endpoint
export const MAX_MOVES = 10;           // head or main moved under a PR while it was tested
export const DEFAULT_TIMING = Object.freeze({
  pollMs: 30_000,            // guards run status poll
  maxWaitMs: 45 * 60_000,    // give up on one guards run
  locatePollMs: 5_000,       // looking for the run we just dispatched
  locateMaxMs: 3 * 60_000,
  updatePollMs: 2_000,       // waiting for update-branch to show a new head
  updateMaxPolls: 15,
  mergeablePollMs: 2_000,    // GitHub computes `mergeable` lazily
  mergeablePolls: 6,
});

export class TreeMismatchError extends Error {
  constructor(message) { super(message); this.name = "TreeMismatchError"; }
}
export class RefusedError extends Error {
  constructor(message) { super(message); this.name = "RefusedError"; }
}

const REAL_SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drain the queue. Returns { merged: [{number, sha}], dropped: [{number, reason}] }.
 * Throws RefusedError (not on Actions/main, bad config) or TreeMismatchError (loud, exit 1).
 */
export async function runQueue({ env, fetchImpl = globalThis.fetch, sleep = REAL_SLEEP, now = Date.now, log = console.log, timing = {} }) {
  const refusal = refuseUnlessMainOnActions(env);
  if (refusal) throw new RefusedError(refusal);
  const cfg = readConfig(env);
  if (cfg.error) throw new RefusedError(cfg.error);
  const T = { ...DEFAULT_TIMING, ...timing };
  const { label, guardsFile, dryRun } = cfg;
  const result = { merged: [], dropped: [] };

  // ---- GitHub plumbing -----------------------------------------------------
  const call = async (method, path, body) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(`${cfg.api}/repos/${cfg.repo}${path}`, {
        method,
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (method === "GET" && (res.status >= 500 || res.status === 429) && attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    }
  };
  const must = async (method, path, body, okStatuses = [200, 201, 202, 204]) => {
    const r = await call(method, path, body);
    if (!okStatuses.includes(r.status)) throw new Error(`GitHub ${method} ${path.split("?")[0]} answered HTTP ${r.status}${r.data && r.data.message ? `: ${r.data.message}` : ""}`);
    return r.data;
  };
  const say = (line) => log(`merge-queue: ${line}`);
  const mutate = (what) => { if (dryRun) { say(`DRY RUN would ${what}`); return false; } return true; };

  const listQueuedPulls = async () => {
    const numbers = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await must("GET", `/issues?labels=${encodeURIComponent(label)}&state=open&per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error("GitHub returned a non-array issue page");
      for (const i of batch) if (i && i.pull_request && Number.isInteger(i.number)) numbers.push(i.number);
      if (batch.length < 100) break;
    }
    numbers.sort((a, b) => a - b);
    const pulls = [];
    for (const n of numbers) pulls.push(await must("GET", `/pulls/${n}`));
    return pulls;
  };
  const readPull = async (n) => {
    let pr = await must("GET", `/pulls/${n}`);
    for (let i = 0; pr.mergeable === null && i < T.mergeablePolls; i++) { await sleep(T.mergeablePollMs); pr = await must("GET", `/pulls/${n}`); }
    return pr;
  };
  const removeLabel = async (n) => {
    if (!mutate(`remove label "${label}" from #${n}`)) return;
    const r = await call("DELETE", `/issues/${n}/labels/${encodeURIComponent(label)}`);
    if (![200, 204, 404].includes(r.status)) say(`WARNING could not remove label from #${n} (HTTP ${r.status})`);
  };
  const comment = async (n, body) => {
    if (!mutate(`comment on #${n}: ${body.split("\n")[0]}`)) return;
    const r = await call("POST", `/issues/${n}/comments`, { body });
    if (![200, 201].includes(r.status)) say(`WARNING could not comment on #${n} (HTTP ${r.status})`);
  };
  const dispatchGuards = async (ref, inputs) => {
    const r = await call("POST", `/actions/workflows/${guardsFile}/dispatches`, inputs ? { ref, inputs } : { ref });
    if (r.status !== 204) throw new Error(`dispatching ${guardsFile} on ${ref} answered HTTP ${r.status}${r.data && r.data.message ? `: ${r.data.message}` : ""}`);
  };
  const behindBy = async (head) => {
    const c = await must("GET", `/compare/main...${head}`);
    return Number.isInteger(c && c.behind_by) ? c.behind_by : null;
  };

  // Workflows that run on push to main with a path filter. A GITHUB_TOKEN merge
  // fires no push event, so the queue dispatches them when the merged PR touched
  // their paths (mirrors their on.push.paths; kept in step by test-merge-queue).
  const dispatchPathWorkflows = async (files) => {
    for (const w of POST_MERGE_PATH_WORKFLOWS) {
      if (!files.some((f) => w.match(f))) continue;
      if (!mutate(`dispatch ${w.file} on main`)) continue;
      const r = await call("POST", `/actions/workflows/${w.file}/dispatches`, { ref: "main" });
      if (r.status !== 204) say(`WARNING post-merge dispatch of ${w.file} answered HTTP ${r.status}`);
    }
  };

  // ---- per-PR state --------------------------------------------------------
  const counters = new Map();
  const counter = (n) => { if (!counters.has(n)) counters.set(n, { merge: 0, moves: 0 }); return counters.get(n); };
  const drop = async (n, kind, details, reason) => {
    say(`dropped #${n}: ${reason}`);
    await comment(n, buildComment(kind, details));
    await removeLabel(n);
    result.dropped.push({ number: n, reason });
    return "dropped";
  };
  // The head or main moved under this PR: test again, but never forever.
  const moved = async (n, head, why) => {
    const c = counter(n);
    c.moves++;
    say(`#${n}: ${why}; looping (${c.moves}/${MAX_MOVES})`);
    if (c.moves >= MAX_MOVES) return drop(n, "main-moving", { head, attempts: c.moves }, `moved ${c.moves} times`);
    return "retry";
  };

  // ---- one pass over one PR: "merged" | "dropped" | "retry" | "skipped" ---------
  const step = async (n) => {
    let pr = await readPull(n);
    if (!isQueueable(pr, { label })) { say(`#${n} is no longer queueable; leaving it alone`); return "skipped"; }
    if (pr.head.repo && pr.head.repo.full_name !== cfg.repo) {
      return drop(n, "unexpected", { head: pr.head.sha, detail: "the branch lives in a fork; the queue only tests branches in this repository" }, "fork branch");
    }
    if (classify({ pr, behindBy: 0 }) === STATES.CONFLICT) return drop(n, "conflict", {}, "conflicts with main");

    // 2. up to date with main
    let behind = await behindBy(pr.head.sha);
    if (behind === null || behind > 0) {
      if (!mutate(`update-branch #${n} (head ${pr.head.sha.slice(0, 12)}, behind main)`)) return "dropped";
      const u = await call("PUT", `/pulls/${n}/update-branch`, { expected_head_sha: pr.head.sha });
      if (u.status === 422) return drop(n, "conflict", {}, "update-branch hit a merge conflict");
      if (u.status === 409) return moved(n, pr.head.sha, "head moved while updating");
      if (u.status !== 202) throw new Error(`update-branch #${n} answered HTTP ${u.status}${u.data && u.data.message ? `: ${u.data.message}` : ""}`);
      const old = pr.head.sha;
      for (let i = 0; i < T.updateMaxPolls && pr.head.sha === old; i++) { await sleep(T.updatePollMs); pr = await must("GET", `/pulls/${n}`); }
      if (pr.head.sha === old) return moved(n, old, "update-branch never produced a new head");
      say(`#${n} updated with main: ${old.slice(0, 12)} -> ${pr.head.sha.slice(0, 12)}`);
    }
    const head = pr.head.sha;
    const ref = pr.head.ref;

    if (dryRun) {
      say(`DRY RUN would dispatch ${guardsFile} on ${ref} (pr=${n}), post ${OWNER_APPROVAL_CHECK_NAME}, squash-merge ${head.slice(0, 12)}, verify the tree, dispatch ${guardsFile} on main`);
      return "dropped";
    }

    // 3. guards on exactly this head
    const listRuns = async () => {
      const d = await must("GET", `/actions/workflows/${guardsFile}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=30`);
      return (d && d.workflow_runs) || [];
    };
    const knownIds = new Set((await listRuns()).map((r) => r.id));
    const dispatchedAt = now();
    await dispatchGuards(ref, { pr: String(n) });
    let run = null;
    for (let waited = 0; !run && waited <= T.locateMaxMs; waited += T.locatePollMs) {
      await sleep(T.locatePollMs);
      run = pickDispatchedRun(await listRuns(), { headSha: head, knownIds, notBeforeMs: dispatchedAt - 5000 });
    }
    if (!run) return drop(n, "ci-failed", { head, detail: "the dispatched run never appeared" }, "dispatched guards run not found");
    say(`#${n}: waiting on guards run ${run.id} for ${head.slice(0, 12)}`);
    const startedWaiting = now();
    while (run.status !== "completed") {
      if (now() - startedWaiting > T.maxWaitMs) return drop(n, "ci-timeout", { head, minutes: Math.round(T.maxWaitMs / 60000), runUrl: run.html_url }, "guards run timed out");
      await sleep(T.pollMs);
      run = await must("GET", `/actions/runs/${run.id}`);
    }

    // Main (or the branch) moving during the run makes the result about a different union: test again.
    const afterPr = await must("GET", `/pulls/${n}`);
    if (afterPr.head.sha !== head) return moved(n, head, "head changed during guards");
    const behindAfter = await behindBy(head);
    if (behindAfter === null || behindAfter > 0) return moved(n, head, "main moved during guards");

    const checks = await must("GET", `/commits/${head}/check-runs?check_name=${GUARDS_CHECK_NAME}&per_page=100`);
    const guards = pickGuardsCheck(checks && checks.check_runs);
    const state = classify({ pr, behindBy: behindAfter, guards: guards || (run.conclusion === "success" ? null : { conclusion: run.conclusion || "failure" }) });
    if (state === STATES.AWAITING_CI) return drop(n, "ci-failed", { head, detail: `no \`${GUARDS_CHECK_NAME}\` check-run on the head`, runUrl: run.html_url }, "no guards check-run");
    if (state !== STATES.READY || run.conclusion !== "success") {
      return drop(n, "ci-failed", { head, detail: `run ${run.conclusion || "unfinished"}, check ${guards ? guards.conclusion : "missing"}`, runUrl: run.html_url }, `guards ${run.conclusion}`);
    }

    // 4. owner approval, decided by the repository's own rules
    let verdict;
    let changedFiles = [];
    try {
      const ctx = { error: null, api: cfg.api, repo: cfg.repo, token: cfg.token, number: n, eventHeadSha: head };
      const live = await fetchPullEvidence(ctx, { withFiles: true, protectedFilter: isOwnerOnly, fetchImpl });
      if (live.liveHeadSha !== head) return moved(n, head, "head changed while reading approval evidence");
      changedFiles = Array.isArray(live.files) ? live.files : [];
      verdict = decideOwnerApproval({
        changedPaths: live.files, mergeGate: true,
        pr: { number: n, eventHeadSha: head, liveHeadSha: live.liveHeadSha },
        comments: live.comments, protectedEntries: live.protectedEntries || null, error: null,
      });
    } catch (e) {
      verdict = { ok: false, reason: `owner approval cannot be evaluated: ${(e && e.message) || e}` };
    }
    await must("POST", "/check-runs", {
      name: OWNER_APPROVAL_CHECK_NAME, head_sha: head, status: "completed",
      conclusion: verdict.ok ? "success" : "failure",
      output: { title: verdict.ok ? "Owner approval: OK" : "Owner approval: not satisfied", summary: String(verdict.reason).slice(0, 60000) },
    }, [201]);
    if (!verdict.ok) return drop(n, "approval-missing", { head, reason: verdict.reason }, `owner approval: ${verdict.reason}`);

    // 5. squash-merge exactly the tested head; no commit_message so GitHub keeps every commit body (Lane: trailers)
    const m = await call("PUT", `/pulls/${n}/merge`, { merge_method: "squash", sha: head });
    if (m.status !== 200 || !m.data || m.data.merged !== true) {
      const c = counter(n);
      c.merge++;
      const detail = (m.data && m.data.message) || "";
      say(`#${n}: merge refused (HTTP ${m.status}) attempt ${c.merge}/${MAX_MERGE_ATTEMPTS}`);
      if ([405, 409].includes(m.status) && c.merge < MAX_MERGE_ATTEMPTS) return "retry";
      return drop(n, "merge-failed", { head, attempts: c.merge, status: m.status, detail }, `merge refused HTTP ${m.status}`);
    }
    const mergeSha = m.data.sha;

    // 6. union proof: what landed on main is exactly what was tested
    const testedTree = (await must("GET", `/commits/${head}`)).commit.tree.sha;
    const mergedTree = (await must("GET", `/commits/${mergeSha}`)).commit.tree.sha;
    if (!treesEqual(testedTree, mergedTree)) {
      const message = buildTreeMismatchMessage({ number: n, mergeSha, mergedTree, testedHead: head, testedTree });
      await comment(n, `Merge queue: ${message}`);
      await removeLabel(n);
      throw new TreeMismatchError(message);
    }

    // 7. post-merge: guards on main (not awaited), label off
    try { await dispatchGuards("main"); } catch (e) { say(`WARNING post-merge guards dispatch failed: ${e.message}`); }
    try { await dispatchPathWorkflows(changedFiles); } catch (e) { say(`WARNING post-merge path dispatch failed: ${e.message}`); }
    await removeLabel(n);
    result.merged.push({ number: n, sha: mergeSha });
    say(`merged #${n} sha=${mergeSha} tree-proof=PASS`);
    return "merged";
  };

  // ---- drain loop ------------------------------------------------------------
  const done = new Set();
  for (;;) {
    const pr = pickNext(await listQueuedPulls(), { label, skip: done });
    if (!pr) break;
    const outcome = await step(pr.number);
    if (outcome !== "retry") done.add(pr.number);
  }
  say(`queue empty: ${result.merged.length} merged, ${result.dropped.length} dropped${dryRun ? " (dry run)" : ""}`);
  return result;
}

// CLI entry: only when executed directly, never when imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runQueue({ env: process.env });
  } catch (e) {
    console.error(`merge-queue: FAIL — ${(e && e.message) || e}`);
    process.exit(1);
  }
}
