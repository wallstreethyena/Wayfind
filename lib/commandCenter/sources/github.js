// lib/commandCenter/sources/github.js — code & repo context from the public
// GitHub API (the repo is public; unauthenticated reads, cached 10 min, well
// inside the 60 req/h anonymous budget). If GITHUB_API_TOKEN is set it is used
// for headroom, but nothing here requires it.
//
// This feeds the Code & Operations section: recent commits, default branch
// head, language byte breakdown, repo file count. Honesty note carried into
// the UI: language numbers are BYTES from GitHub's linguist, not line counts —
// operational context, not a vanity metric.

import { memTTL } from "../cache.js";
import { srcOk, srcError } from "../respond.js";

const NAME = "GitHub (public repo)";

function repo(env = process.env) {
  return String(env.WF_GITHUB_REPO || "wallstreethyena/Wayfind").trim();
}

async function gh(path, opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "wayfind-command-center" };
  const tok = String(env.GITHUB_API_TOKEN || "").trim();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
  try {
    const r = await fetchImpl(`https://api.github.com${path}`, { headers, cache: "no-store", signal: ctrl.signal });
    if (!r.ok) throw new Error(`github ${r.status} ${path}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export async function repoSnapshot(opts = {}) {
  const R = repo(opts.env);
  try {
    const data = await memTTL(`gh:${R}`, 10 * 60 * 1000, async () => {
      const [meta, commits, languages] = await Promise.all([
        gh(`/repos/${R}`, opts),
        gh(`/repos/${R}/commits?sha=main&per_page=10`, opts),
        gh(`/repos/${R}/languages`, opts),
      ]);
      const totalBytes = Object.values(languages || {}).reduce((a, b) => a + b, 0) || 1;
      return {
        repo: R,
        default_branch: meta.default_branch,
        pushed_at: meta.pushed_at,
        open_issues: meta.open_issues_count,
        size_kb: meta.size,
        head_sha: commits && commits[0] ? commits[0].sha : null,
        commits: (commits || []).map((c) => ({
          sha: String(c.sha || "").slice(0, 7),
          message: String((c.commit && c.commit.message) || "").split("\n")[0].slice(0, 120),
          date: c.commit && c.commit.author && c.commit.author.date,
          author: (c.commit && c.commit.author && c.commit.author.name) || "",
        })),
        languages: Object.entries(languages || {})
          .map(([lang, bytes]) => ({ lang, bytes, pct: Math.round((bytes / totalBytes) * 1000) / 10 }))
          .sort((a, b) => b.bytes - a.bytes),
      };
    });
    return { source: srcOk(NAME, { confidence: "measured", note: "language split is bytes (linguist), not lines" }), data };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}
