#!/usr/bin/env node
// The newest completed `guards` workflow run for a push to main must be
// success. A cancelled or still-open run is not a green main.
//
// Invoked by .github/workflows/guards-main-monitor.yml. The decision is
// verdictFromRuns(); this file's main() only fetches the Actions API.
// test-guards-ci.mjs locks the decision without the network.

import { pathToFileURL } from "node:url";

const STUCK_MS = 45 * 60 * 1000;

export function verdictFromRuns(runs, now = Date.now()) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return { ok: false, reason: "no guards runs returned for a push to main" };
  }
  const newest = runs[0];
  if (!newest || typeof newest.status !== "string") {
    return { ok: false, reason: "newest guards run has no status" };
  }
  if (newest.status !== "completed") {
    const started = Date.parse(newest.run_started_at || newest.created_at || "");
    if (!Number.isFinite(started)) {
      return { ok: false, reason: `newest main guards run ${newest.id ?? "?"} is ${newest.status} and has no start time` };
    }
    if (now - started > STUCK_MS) {
      return { ok: false, reason: `newest main guards run ${newest.id ?? "?"} still ${newest.status} after 45 minutes (${newest.html_url || "no url"})` };
    }
  }
  const completed = runs.find((run) => run && run.status === "completed");
  if (!completed) return { ok: false, reason: "no completed guards run on main" };
  const sha = typeof completed.head_sha === "string" ? completed.head_sha.slice(0, 10) : "?";
  const url = completed.html_url || "no url";
  if (completed.conclusion !== "success") {
    return {
      ok: false,
      reason: `latest completed main guards run ${completed.id ?? "?"} (${sha}) concluded ${completed.conclusion} — cancelled or incomplete is not success (${url})`,
    };
  }
  return { ok: true, reason: `latest completed main guards run ${completed.id} (${sha}) succeeded (${url})` };
}

async function fetchRuns(repo, token) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/guards.yml/runs?branch=main&event=push&per_page=5`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "wayfind-guards-main-monitor",
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Actions API HTTP ${response.status} for ${url} ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.workflow_runs)) {
    throw new Error("Actions API response has no workflow_runs array");
  }
  return payload.workflow_runs;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  if (!token || !repo) {
    console.error("guards-main-run: FAIL — GITHUB_TOKEN and GITHUB_REPOSITORY are required (absent configuration is not a pass)");
    process.exit(1);
  }
  let runs;
  try {
    runs = await fetchRuns(repo, token);
  } catch (error) {
    console.error(`guards-main-run: FAIL — ${error.message}`);
    process.exit(1);
  }
  const verdict = verdictFromRuns(runs);
  if (!verdict.ok) {
    console.error(`guards-main-run: FAIL — ${verdict.reason}`);
    process.exit(1);
  }
  console.log(`guards-main-run: OK — ${verdict.reason}`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) main();
