// lib/commandCenter/sources/vercel.js — deployment context, two tiers:
//
//   1. RUNTIME (always on, zero credentials): the deployment Vercel is
//      currently serving describes itself via system env vars
//      (VERCEL_GIT_COMMIT_SHA / REF / MESSAGE, VERCEL_ENV, VERCEL_URL) plus
//      the build stamp injected at build time (next.config.js →
//      WF_CC_BUILD_TIME). This is REAL data about the running build.
//   2. API (optional): VERCEL_API_TOKEN unlocks the recent-deployments list
//      (build states, failed deploys). Without it, that sub-panel is labeled
//      Not connected with the exact step.

import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "Vercel";
const NEXT_API = "Create a Vercel access token (vercel.com/account/settings/tokens) and add VERCEL_API_TOKEN to the environment to list recent deployments and build states.";

export function runtimeDeployment(env = process.env) {
  const has = !!(env.VERCEL || env.VERCEL_ENV);
  const data = {
    on_vercel: has,
    env: env.VERCEL_ENV || (process.env.NODE_ENV === "production" ? "production?" : "development"),
    url: env.VERCEL_URL || null,
    commit_sha: env.VERCEL_GIT_COMMIT_SHA || null,
    commit_ref: env.VERCEL_GIT_COMMIT_REF || null,
    commit_message: (env.VERCEL_GIT_COMMIT_MESSAGE || "").split("\n")[0].slice(0, 140) || null,
    repo: env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : null,
    built_at: env.WF_CC_BUILD_TIME || null,
    node_env: process.env.NODE_ENV || null,
  };
  return {
    source: srcOk(NAME + " (runtime)", { confidence: has ? "measured" : "partial", note: has ? undefined : "not running on Vercel — local/dev values" }),
    data,
  };
}

export async function deploymentsList(opts = {}) {
  const env = opts.env || process.env;
  const token = String(env.VERCEL_API_TOKEN || "").trim();
  if (!token) return { source: srcMissing(NAME + " API", NEXT_API), data: null };
  const fetchImpl = opts.fetchImpl || fetch;
  const projectId = String(env.VERCEL_PROJECT_ID || "").trim();
  const teamId = String(env.VERCEL_TEAM_ID || "").trim();
  try {
    const data = await memTTL("vercel:deploys", 3 * 60 * 1000, async () => {
      const qs = new URLSearchParams({ limit: "10" });
      if (projectId) qs.set("projectId", projectId);
      if (teamId) qs.set("teamId", teamId);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
      try {
        const r = await fetchImpl(`https://api.vercel.com/v6/deployments?${qs}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`vercel ${r.status}`);
        const d = await r.json();
        return (d.deployments || []).map((x) => ({
          state: x.state, target: x.target || "preview",
          created: x.created, ref: x.meta && x.meta.githubCommitRef,
          sha: x.meta && x.meta.githubCommitSha ? String(x.meta.githubCommitSha).slice(0, 7) : null,
          message: x.meta && x.meta.githubCommitMessage ? String(x.meta.githubCommitMessage).split("\n")[0].slice(0, 100) : null,
        }));
      } finally { clearTimeout(timer); }
    });
    return { source: srcOk(NAME + " API"), data };
  } catch (e) {
    return { source: srcError(NAME + " API", e && e.message), data: null };
  }
}
