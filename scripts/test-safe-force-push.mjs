#!/usr/bin/env node
/**
 * test-safe-force-push — the sanctioned force-push script must never report OK
 * while deleting another lane's commit.
 *
 * WHY (2026-09-10). safe-force-push.sh shipped in #1238 to close the #1221
 * branch-overwrite failure, and carried a fail-open that made it worse than no
 * script at all, because it printed OK:
 *
 *   1. `git fetch … || true` swallowed a failed fetch;
 *   2. REMOTE_HEAD came from a SEPARATE ls-remote, so it was still correct;
 *   3. `git rev-list LOCAL..REMOTE` then could not run — the object was not local;
 *   4. `2>/dev/null || echo ""` turned that failure into "nothing will be lost";
 *   5. the lease matched (REMOTE_HEAD was right), so the push SUCCEEDED.
 *
 * Result: exit 0, "safe-force-push: OK", and the other lane's commit gone.
 * Scenario 1 below reproduces that against the pre-fix source and asserts the
 * destruction actually happened, so the proof cannot quietly stop proving.
 *
 * `--no-merges` was a second, narrower hole: a merge commit present only on the
 * remote counted as zero loss. Scenario 3 covers it.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SHIPPED = join(process.cwd(), "scripts", "safe-force-push.sh");
const PRE_FIX_SHA = "aba55a29";
const ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e.com" };

let passed = 0;
let redProofSkipped = false;
const failures = [];
const check = (n, c, d) => { if (c) passed += 1; else failures.push(`${n}: ${d}`); };

const git = (cwd, args, { allowFail = false } = {}) => {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...ENV }, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (e) { if (allowFail) return null; throw e; }
};

const root = mkdtempSync(join(tmpdir(), "wf-sfp-"));
try {
  // A `git` that fails only on fetch, to model the swallowed failure.
  const binDir = join(root, "bin");
  mkdirSync(binDir);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(join(binDir, "git"),
    `#!/usr/bin/env bash\nif [ "\${1:-}" = "fetch" ]; then echo "simulated fetch failure" >&2; exit 128; fi\nexec ${realGit} "$@"\n`);
  chmodSync(join(binDir, "git"), 0o755);

  const runScript = (cwd, script, args, { breakFetch = false } = {}) => {
    const env = { ...process.env, ...ENV };
    if (breakFetch) env.PATH = `${binDir}:${env.PATH}`;
    try { return { code: 0, out: execFileSync("bash", [script, ...args], { cwd, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }) }; }
    catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` }; }
  };

  let n = 0;
  /** Build the incident: lane A cloned before lane B pushed, so it lacks B's object. */
  const world = (script) => {
    const id = `w${n++}`;
    const origin = join(root, `${id}.git`);
    mkdirSync(origin); git(origin, ["init", "-q", "--bare", "-b", "main"]);
    const seed = join(root, `${id}-seed`);
    mkdirSync(seed); git(seed, ["init", "-q", "-b", "main"]);
    writeFileSync(join(seed, "f.txt"), "base\n"); git(seed, ["add", "-A"]); git(seed, ["commit", "-qm", "base"]);
    git(seed, ["remote", "add", "origin", origin]); git(seed, ["push", "-q", "origin", "main"]);
    git(seed, ["checkout", "-q", "-b", "shared"]);
    writeFileSync(join(seed, "f.txt"), "start\n"); git(seed, ["commit", "-qam", "start"]); git(seed, ["push", "-q", "origin", "shared"]);
    const start = git(seed, ["rev-parse", "HEAD"]);

    const a = join(root, `${id}-a`);
    git(root, ["clone", "-q", origin, a]); git(a, ["checkout", "-q", "shared"]);
    const scriptPath = join(a, "sfp.sh");
    writeFileSync(scriptPath, execFileSync("cat", [script], { encoding: "utf8" }));
    return { origin, a, start, scriptPath,
      remoteNow: () => git(root, ["ls-remote", origin, "refs/heads/shared"]).split(/\s+/)[0],
      laneARewrites: () => { git(a, ["reset", "-q", "--hard", `${start}~1`]); writeFileSync(join(a, "f.txt"), "lane A\n"); git(a, ["commit", "-qam", "lane A rewrite"]); return git(a, ["rev-parse", "HEAD"]); },
      laneBPushes: (merge = false) => {
        const b = join(root, `${id}-b`);
        git(root, ["clone", "-q", origin, b]); git(b, ["checkout", "-q", "shared"]);
        if (merge) {
          git(b, ["checkout", "-q", "-b", "side"]);
          writeFileSync(join(b, "s.txt"), "side\n"); git(b, ["add", "-A"]); git(b, ["commit", "-qm", "side work"]);
          git(b, ["checkout", "-q", "shared"]);
          git(b, ["merge", "-q", "--no-ff", "-m", "merge side", "side"]);
        } else {
          writeFileSync(join(b, "f.txt"), "lane B precious\n"); git(b, ["commit", "-qam", "lane B work"]);
        }
        git(b, ["push", "-q", "origin", "shared"]);
        return git(b, ["rev-parse", "HEAD"]);
      } };
  };

  // ---- 1. RED PROOF against the pre-fix source ----
  let preFix = null;
  try { preFix = execFileSync("git", ["show", `${PRE_FIX_SHA}:scripts/safe-force-push.sh`], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { preFix = null; }
  if (preFix) {
    const f = join(root, "prefix.sh"); writeFileSync(f, preFix);
    const w = world(f);
    w.laneARewrites();
    const bSha = w.laneBPushes();
    const r = runScript(w.a, w.scriptPath, ["shared"], { breakFetch: true });
    check("RED: the pre-fix script reported success", r.code === 0 && /safe-force-push: OK/.test(r.out), `exit ${r.code}: ${r.out.trim().slice(-300)}`);
    check("RED: and destroyed lane B's commit", w.remoteNow() !== bSha, "lane B survived — the fail-open no longer reproduces, so this proof is stale");
  } else { redProofSkipped = true; }

  // ---- 2. the shipped script refuses the same scenario ----
  {
    const w = world(SHIPPED);
    w.laneARewrites();
    const bSha = w.laneBPushes();
    const r = runScript(w.a, w.scriptPath, ["shared"], { breakFetch: true });
    check("a failed fetch stops the rewrite", r.code !== 0, `exit ${r.code}: ${r.out.trim().slice(-300)}`);
    check("it never claims OK on a failed fetch", !/safe-force-push: OK/.test(r.out), `still printed OK — ${r.out.trim().slice(-200)}`);
    check("lane B's commit survives a failed fetch", w.remoteNow() === bSha, "lane B's work was destroyed");
  }

  // ---- 3. a merge commit only on the remote counts as loss ----
  {
    const w = world(SHIPPED);
    w.laneARewrites();
    const bSha = w.laneBPushes(true);
    const r = runScript(w.a, w.scriptPath, ["shared"]);
    check("a remote-only merge commit is counted as loss", r.code !== 0 && /REFUSED/.test(r.out), `exit ${r.code}: ${r.out.trim().slice(-300)}`);
    check("the merge commit survives", w.remoteNow() === bSha, "the merge commit was destroyed");
  }

  // ---- 4. ordinary loss still refuses, with the remote reachable ----
  {
    const w = world(SHIPPED);
    w.laneARewrites();
    const bSha = w.laneBPushes();
    const r = runScript(w.a, w.scriptPath, ["shared"]);
    check("ordinary divergence is refused", r.code !== 0 && /REFUSED/.test(r.out), `exit ${r.code}: ${r.out.trim().slice(-300)}`);
    check("ordinary divergence leaves lane B intact", w.remoteNow() === bSha, "lane B's work was destroyed");
  }

  // ---- 5. GREEN: a zero-loss advance still lands ----
  // Every genuine history rewrite drops at least the commit it replaces, so the
  // script requires --accept-loss for those by design (scenario 6). The case
  // that must stay frictionless is the one where nothing is lost at all: local
  // is strictly ahead of the remote.
  {
    const w = world(SHIPPED);
    writeFileSync(join(w.a, "g.txt"), "added\n");
    git(w.a, ["add", "-A"]); git(w.a, ["commit", "-qm", "lane A adds work"]);
    const mine = git(w.a, ["rev-parse", "HEAD"]);
    const r = runScript(w.a, w.scriptPath, ["shared"]);
    check("a zero-loss advance succeeds", r.code === 0 && /safe-force-push: OK/.test(r.out), `exit ${r.code}: ${r.out.trim().slice(-300)}`);
    check("the zero-loss advance landed", w.remoteNow() === mine, "the remote did not move to lane A");
  }

  // ---- 6. GREEN: reviewed loss may proceed with the exact SHA ----
  {
    const w = world(SHIPPED);
    const mine = w.laneARewrites();
    const bSha = w.laneBPushes();
    const r = runScript(w.a, w.scriptPath, ["shared", "--accept-loss", bSha]);
    check("--accept-loss with the observed SHA proceeds", r.code === 0, `exit ${r.code}: ${r.out.trim().slice(-300)}`);
    check("the reviewed rewrite landed", w.remoteNow() === mine, "the rewrite did not land");
  }

  // ---- 7. GREEN: main is never force-pushed ----
  {
    const w = world(SHIPPED);
    const r = runScript(w.a, w.scriptPath, ["main"]);
    check("main is refused outright", r.code !== 0 && /REFUSED/.test(r.out), `exit ${r.code}: ${r.out.trim().slice(-200)}`);
  }

  // ---- 8. structural: the fail-open shapes must not come back ----
  // POSITIVE CONTROLS for the three absence probes below. An absence assertion is
  // only evidence if the probe can still FIND the thing it looks for — a regex
  // that has rotted into one matching nothing reports "clean" forever. Each is run
  // against the pre-fix source that actually carried the defect, and asserted to
  // MATCH, before it is asserted to be absent from the shipped script.
  {
    const shipped = execFileSync("cat", [SHIPPED], { encoding: "utf8" });
    const BAD = preFix || [
      'git fetch --no-tags origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" >/dev/null 2>&1 || true',
      'LOST="$(git rev-list --no-merges "$LOCAL_HEAD..$REMOTE_HEAD" 2>/dev/null || echo "")"',
    ].join("\n");

    check("POSITIVE CONTROL: the swallowed-fetch probe matches the real defect",
      /git fetch[^\n]*\|\|\s*true/.test('git fetch --no-tags origin "+refs/heads/$B:refs/remotes/origin/$B" >/dev/null 2>&1 || true'),
      "the probe matched nothing, so its absence below proves nothing");
    check("POSITIVE CONTROL: it also matches the pre-fix source as shipped",
      /git fetch[^\n]*\|\|\s*true/.test(BAD), "the probe did not match the source that carried the defect");
    check("the shipped script no longer swallows a failed fetch",
      !/git fetch[^\n]*\|\|\s*true/.test(shipped), "`git fetch … || true` is back");

    check("POSITIVE CONTROL: the unreadable-history probe matches the real defect",
      /rev-list[^\n]*2>\/dev\/null\s*\|\|\s*echo/.test('LOST="$(git rev-list --no-merges "$A..$B" 2>/dev/null || echo "")"'),
      "the probe matched nothing, so its absence below proves nothing");
    check("the shipped script no longer reads an unreadable history as empty",
      !/rev-list[^\n]*2>\/dev\/null\s*\|\|\s*echo/.test(shipped), "a rev-list failure is being turned into an empty result again");

    check("POSITIVE CONTROL: the skipped-merge-commit probe matches the real defect",
      /rev-list --no-merges/.test('git rev-list --no-merges "$A..$B"'),
      "the probe matched nothing, so its absence below proves nothing");
    check("the shipped script counts merge commits as loss",
      !/rev-list --no-merges/.test(shipped), "`--no-merges` is back in the loss count");
  }
} finally { rmSync(root, { recursive: true, force: true }); }

if (failures.length) {
  console.error("test-safe-force-push: FAIL");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
const red = redProofSkipped ? `pre-fix source at ${PRE_FIX_SHA} unreachable here, red proof skipped` : "pre-fix source red-proved destroying a lane's commit while reporting OK";
console.log(`test-safe-force-push: OK — ${passed} assertions (${red}; failed fetch, unreadable history and remote-only merge commits all now fail closed; clean rewrite, reviewed --accept-loss, and the main refusal all still hold)`);
