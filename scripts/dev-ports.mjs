#!/usr/bin/env node
// scripts/dev-ports.mjs — "what am I actually looking at on :PORT?"
//
// WHY THIS EXISTS
// On 2026-07-28 the owner opened localhost:3111 believing it was current code.
// It was a five-hour-old `next start` production build, from a worktree that
// predated the branch under discussion by a day, with NO .env.local at all —
// so it rendered a plausible-looking page with an empty result pool. An hour
// went into diagnosing a policy bug in a build that did not contain the policy.
//
// Four or more Next processes routinely run from different worktrees, at
// different commits, on different ports. Nothing told us which was which.
// This does, read-only, in one command.
//
//   node scripts/dev-ports.mjs
//
// Reports per listening Node port: working directory, branch + commit, dev vs
// production build, whether the build is STALE relative to its own sources, and
// whether that directory has an env file. No framework, no deps, no writes.
import { execSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sh = (cmd) => { try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

// pid -> set(ports), from the TCP listener table only.
const listeners = new Map();
for (const line of sh("lsof -nP -iTCP -sTCP:LISTEN").split("\n").slice(1)) {
  const f = line.trim().split(/\s+/);
  if (f.length < 9 || !/^node$|^next/i.test(f[0])) continue;
  const port = (f[8].match(/:(\d+)$/) || [])[1];
  if (!port) continue;
  if (!listeners.has(f[1])) listeners.set(f[1], new Set());
  listeners.get(f[1]).add(port);
}

const newestSourceMs = (dir) => {
  let newest = 0;
  const walk = (d, depth) => {
    if (depth > 4) return;
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(js|jsx|mjs|ts|tsx|css)$/.test(e.name)) {
        try { const m = statSync(p).mtimeMs; if (m > newest) newest = m; } catch {}
      }
    }
  };
  for (const sub of ["app", "lib"]) { const p = join(dir, sub); if (existsSync(p)) walk(p, 0); }
  return newest;
};

const rows = [];
for (const [pid, ports] of listeners) {
  const cmd = sh(`ps -p ${pid} -o command=`);
  if (!/next/i.test(cmd)) continue;
  const cwd = (sh(`lsof -a -p ${pid} -d cwd -Fn`).split("\n").find((l) => l.startsWith("n")) || "").slice(1);
  if (!cwd) continue;

  // `next dev` SPAWNS a child whose command is literally "next-server", so
  // testing the child alone reports every dev server as production. Ask the
  // parent. (Caught by this tool reporting :3000 as production while its parent
  // was `next dev` — a diagnostic that lies is worse than none.)
  const ppid = sh(`ps -o ppid= -p ${pid}`).trim();
  const parentCmd = ppid ? sh(`ps -p ${ppid} -o command=`) : "";
  const chain = cmd + " || " + parentCmd;
  const mode = /next dev|next-dev/.test(chain) ? "dev"
    : /next start|next-server/.test(chain) ? "production" : "?";
  const branch = sh(`git -C "${cwd}" rev-parse --abbrev-ref HEAD`) || "?";
  const head = sh(`git -C "${cwd}" rev-parse --short HEAD`) || "?";
  const dirty = sh(`git -C "${cwd}" --no-optional-locks status --porcelain`).split("\n").filter(Boolean).length;

  const buildIdPath = join(cwd, ".next", "BUILD_ID");
  let builtMs = 0;
  try { builtMs = statSync(buildIdPath).mtimeMs; } catch {}
  const srcMs = newestSourceMs(cwd);
  const stale = mode === "production" && builtMs > 0 && srcMs > builtMs; // dev compiles on demand — staleness only means something for a built server

  const envFile = [".env.local", ".env"].find((f) => existsSync(join(cwd, f))) || null;

  rows.push({ ports: [...ports].sort().join(","), pid, mode, cwd, branch, head, dirty, builtMs, stale, envFile });
}

if (!rows.length) { console.log("dev-ports: no Next processes are listening."); process.exit(0); }

const age = (ms) => { if (!ms) return "-"; const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? m + "m ago" : Math.round(m / 60) + "h ago"; };
rows.sort((a, b) => a.ports.localeCompare(b.ports, undefined, { numeric: true }));

console.log("");
for (const r of rows) {
  const flags = [];
  if (!r.envFile) flags.push("NO ENV FILE — result pools will be empty and pages will look plausibly broken");
  if (r.stale) flags.push("STALE BUILD — sources are newer than .next, you are not looking at this worktree's code");
  if (r.dirty) flags.push(r.dirty + " uncommitted file(s)");
  console.log(`  :${r.ports}  ${r.mode}${r.mode === "production" ? " (built " + age(r.builtMs) + ")" : ""}`);
  console.log(`      cwd    ${r.cwd}`);
  console.log(`      git    ${r.branch} @ ${r.head}`);
  console.log(`      env    ${r.envFile || "(none)"}`);
  for (const f of flags) console.log(`      ⚠  ${f}`);
  console.log("");
}
