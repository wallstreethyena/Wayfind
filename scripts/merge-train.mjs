#!/usr/bin/env node
/**
 * merge-train — one pass of the merge train (see scripts/lib/mergeTrain.mjs).
 * Runs from .github/workflows/merge-train.yml on main only (push to main, a
 * finished guards run, every 10 minutes, or by hand). Each pass reads the
 * queue, takes at most ONE step, and exits; the next event takes the next step.
 *
 * Steps it can take:
 *   - update the next queued pull request with main (GitHub "Update branch");
 *   - dispatch "guards" on the car's branch (an update made with the workflow
 *     token fires no pull_request run, so the train starts it explicitly);
 *   - evaluate "owner-approval" for the car's head with MAIN's copy of
 *     scripts/check-owner-approval-pr.mjs and post the result as that check.
 * It never merges (auto-merge does, once both required checks pass on an
 * up-to-date head), never approves, never edits code, never pushes to main.
 *
 * SECURITY: runs in main's context with a write token. It never checks out,
 * installs or executes anything from a pull request; pull requests are read only
 * as API data. Fails safe: on any error it does nothing and exits non-zero.
 */
import { spawnSync } from "node:child_process";
import { REQUIRED_CHECKS, planTrain } from "./lib/mergeTrain.mjs";

const token = String(process.env.GITHUB_TOKEN || "").trim();
const repo = String(process.env.GITHUB_REPOSITORY || "").trim();
const api = String(process.env.GITHUB_API_URL || "").trim().replace(/\/+$/, "");
if (process.env.GITHUB_ACTIONS !== "true" || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^https:\/\/[^\s/]+/.test(api)) {
  console.error("merge-train: runs only inside GitHub Actions with a token and repository");
  process.exit(1);
}

async function gh(method, path, body) {
  const response = await fetch(`${api}/repos/${repo}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { ok: response.ok, status: response.status, json };
}
const must = async (method, path, body) => {
  const r = await gh(method, path, body);
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} answered HTTP ${r.status}`);
  return r.json;
};

async function latestChecks(sha) {
  const runs = (await must("GET", `/commits/${sha}/check-runs?per_page=100&filter=latest`)).check_runs || [];
  const out = {};
  for (const name of REQUIRED_CHECKS) {
    // GitHub Actions' own check runs only: the app the branch rule pins.
    const mine = runs.filter((r) => r && r.name === name && r.app && r.app.slug === "github-actions")
      .sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));
    if (mine[0]) out[name] = { status: mine[0].status, conclusion: mine[0].conclusion };
  }
  return out;
}

async function readQueue() {
  const open = await must("GET", "/pulls?state=open&base=main&per_page=100&sort=created&direction=asc");
  const queued = open.filter((p) => p && p.auto_merge && !p.draft && p.head && p.head.repo && p.head.repo.full_name === repo);
  const cars = [];
  for (const p of queued) {
    const pull = await must("GET", `/pulls/${p.number}`);
    const cmp = await must("GET", `/compare/main...${pull.head.sha}?per_page=1`);
    cars.push({
      number: pull.number,
      ref: pull.head.ref,
      head: pull.head.sha,
      behindBy: Number.isInteger(cmp.behind_by) ? cmp.behind_by : -1,
      mergeable: pull.mergeable,
      checks: await latestChecks(pull.head.sha),
    });
  }
  return cars;
}

async function dispatchGuards(car) {
  const r = await gh("POST", "/actions/workflows/guards.yml/dispatches", { ref: car.ref, inputs: { pr: String(car.number) } });
  console.log(`merge-train: #${car.number} guards dispatched on ${car.head.slice(0, 12)} (${r.ok ? "ok" : `HTTP ${r.status}`})`);
}

async function postOwnerApproval(car) {
  const run = spawnSync(process.execPath, ["scripts/check-owner-approval-pr.mjs"], {
    env: { ...process.env, GITHUB_EVENT_NAME: "merge-train", WF_PR_NUMBER: String(car.number), WF_PR_HEAD: car.head },
    encoding: "utf8",
    timeout: 120000,
  });
  const passed = run.status === 0;
  const text = `${run.stdout || ""}${run.stderr || ""}`.trim().slice(0, 60000) || "no output";
  const previous = car.checks["owner-approval"];
  if (previous && previous.status === "completed" && previous.conclusion === (passed ? "success" : "failure")) {
    console.log(`merge-train: #${car.number} owner-approval unchanged (${passed ? "success" : "failure"})`);
    return;
  }
  await must("POST", "/check-runs", {
    name: "owner-approval",
    head_sha: car.head,
    status: "completed",
    conclusion: passed ? "success" : "failure",
    output: { title: passed ? "Owner approval OK (merge train)" : "Owner approval needed", summary: text },
  });
  console.log(`merge-train: #${car.number} owner-approval ${passed ? "success" : "failure"} posted for ${car.head.slice(0, 12)}`);
}

async function waitForNewHead(number, oldHead) {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pull = await must("GET", `/pulls/${number}`);
    if (pull.head.sha !== oldHead) return pull;
  }
  return null;
}

async function main() {
  const cars = await readQueue();
  const plan = planTrain(cars);
  const byNumber = new Map(cars.map((c) => [c.number, c]));
  for (const s of plan.skipped) {
    console.log(`merge-train: #${s.number} skipped (${s.why})`);
    if (s.recheck) await postOwnerApproval(byNumber.get(s.number));
  }
  if (plan.type === "idle") { console.log(`merge-train: idle (${cars.length} queued)`); return; }
  if (plan.type === "wait") {
    const car = byNumber.get(plan.number);
    console.log(`merge-train: #${car.number} is the car (current with main); needs: ${plan.need.join(", ") || "nothing, its checks are running or done"}`);
    if (plan.need.includes("guards")) await dispatchGuards(car);
    if (plan.need.includes("owner-approval")) await postOwnerApproval(car);
    return;
  }
  // update: try the planned car, then the next ones, if GitHub refuses (conflict).
  const order = cars.filter((c) => c.behindBy > 0 && c.mergeable !== false && !plan.skipped.some((s) => s.number === c.number));
  for (const car of order.slice(order.findIndex((c) => c.number === plan.number))) {
    const r = await gh("PUT", `/pulls/${car.number}/update-branch`, { expected_head_sha: car.head });
    if (!r.ok) { console.log(`merge-train: #${car.number} update refused (HTTP ${r.status}); next`); continue; }
    const pull = await waitForNewHead(car.number, car.head);
    if (!pull) { console.log(`merge-train: #${car.number} updated; head not visible yet, the next pass continues`); return; }
    const next = { ...car, head: pull.head.sha, behindBy: 0, checks: {} };
    console.log(`merge-train: #${car.number} brought up to date: ${car.head.slice(0, 12)} -> ${next.head.slice(0, 12)}`);
    await dispatchGuards(next);
    await postOwnerApproval(next);
    return;
  }
  console.log("merge-train: no queued pull request could be updated");
}

main().catch((e) => {
  console.error(`merge-train: FAIL — ${(e && e.message) || e}`);
  process.exit(1);
});
