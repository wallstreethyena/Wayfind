// Gate: scripts/vercel-ignore-build.sh (Vercel "Ignored Build Step") skips a build
// ONLY when every changed path is data/docs, and builds on everything else.
// Exit 0 = skip, exit 1 = build. Executes the real script against a temp git repo
// fixture (no regex over the source), and asserts on exit code AND the printed
// reason line. Code PR previews must never be skipped (owner rule); every doubt
// (missing/unknown previous SHA, production, git failure) must BUILD.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "vercel-ignore-build.sh");
let fails = 0;
let asserts = 0;
const ok = (c, m) => { asserts++; if (!c) { console.error("test-vercel-ignore-build: FAIL - " + m); fails++; } };

ok(existsSync(SCRIPT), "scripts/vercel-ignore-build.sh exists");

const root = mkdtempSync(path.join(tmpdir(), "wf-vercel-ignore-"));
const git = (args, opts = {}) => {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + r.stderr);
  return r.stdout.trim();
};
const put = (rel, body) => {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, body);
};

git(["init", "-q", "-b", "main"]);
git(["config", "user.name", "fixture"]);
git(["config", "user.email", "fixture@example.com"]);
git(["config", "commit.gpgsign", "false"]);
for (const f of ["app/page.js", "lib/a.js", "scripts/check-x.mjs", "public/logo.svg", "docs/a.md", "package.json", "middleware.js", "next.config.js"]) put(f, "base\n");
git(["add", "-A"]);
git(["commit", "-q", "-m", "base"]);
const BASE = git(["rev-parse", "HEAD"]);

// Make a commit on top of BASE touching `files`, return its SHA, then reset to BASE.
function commitOf(files) {
  git(["checkout", "-q", "--detach", BASE]);
  for (const f of files) put(f, "changed " + Math.random() + "\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "case"]);
  return git(["rev-parse", "HEAD"]);
}

function run({ files, prev = BASE, cur, env = {} }) {
  const sha = cur || commitOf(files);
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (k.startsWith("VERCEL")) delete clean[k];
  const r = spawnSync("bash", [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...clean, VERCEL_GIT_COMMIT_SHA: sha, ...(prev === null ? {} : { VERCEL_GIT_PREVIOUS_SHA: prev }), ...env },
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const expectSkip = (name, r) => {
  ok(r.code === 0, `${name}: expected SKIP (exit 0), got exit ${r.code}: ${r.out.trim()}`);
  ok(/vercel-ignore-build: SKIP/.test(r.out), `${name}: prints a SKIP reason line: ${r.out.trim()}`);
};
const expectBuild = (name, r) => {
  ok(r.code === 1, `${name}: expected BUILD (exit 1), got exit ${r.code}: ${r.out.trim()}`);
  ok(/vercel-ignore-build: BUILD/.test(r.out), `${name}: prints a BUILD reason line: ${r.out.trim()}`);
};

try {
  // SKIP cases: data / docs only
  expectSkip("photo-only diff", run({ files: ["public/place-photos/batch-2026-11/ChIJabc/site_1.jpg", "public/place-photos/batch-2026-11/ChIJabc/site_2.jpg"] }));
  expectSkip("docs-only diff", run({ files: ["docs/new-lesson.md", "docs/sub/dir/x.txt"] }));
  expectSkip("markdown anywhere outside code dirs", run({ files: ["README.md", "ops/notes.md"] }));
  expectSkip("stored supabase SQL + photo batch notes", run({ files: ["supabase/photo-batches/2026-11-01/apply.sql", "supabase/photo-batches/2026-11-01/before_snapshot.json", "supabase/new-table.sql"] }));
  expectSkip("photos + docs together", run({ files: ["public/place-photos/batch-2026-11/ChIJabc/site_3.jpg", "docs/claude-lessons.md"] }));

  // BUILD cases: any code change must still get a preview
  expectBuild("one lib file", run({ files: ["lib/a.js"] }));
  expectBuild("one app file", run({ files: ["app/page.js"] }));
  expectBuild("public/ non-photo file", run({ files: ["public/logo.svg"] }));
  expectBuild("scripts file (guards run in prebuild)", run({ files: ["scripts/check-x.mjs"] }));
  expectBuild("package.json", run({ files: ["package.json"] }));
  expectBuild("middleware.js", run({ files: ["middleware.js"] }));
  expectBuild("next.config.js", run({ files: ["next.config.js"] }));
  expectBuild("photo + one lib file mixed", run({ files: ["public/place-photos/batch-2026-11/ChIJabc/site_4.jpg", "lib/a.js"] }));
  expectBuild("markdown inside a code dir", run({ files: ["lib/notes.md"] }));
  expectBuild("unlisted top-level path", run({ files: ["tools/thing.py"] }));

  // BUILD cases: every doubt fails closed
  const photoSha = commitOf(["public/place-photos/batch-2026-11/ChIJabc/site_5.jpg"]);
  expectBuild("empty previous SHA", run({ cur: photoSha, prev: "" }));
  expectBuild("previous SHA unset", run({ cur: photoSha, prev: null }));
  expectBuild("unknown previous SHA", run({ cur: photoSha, prev: "0123456789abcdef0123456789abcdef01234567" }));
  expectBuild("VERCEL_ENV=production even for a photo-only diff", run({ cur: photoSha, env: { VERCEL_ENV: "production" } }));
  expectSkip("VERCEL_ENV=preview photo-only diff", run({ cur: photoSha, env: { VERCEL_ENV: "preview" } }));
  expectBuild("no changed files (cannot prove data-only)", run({ cur: BASE }));
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (fails) { console.error(`test-vercel-ignore-build: ${fails} failure(s)`); process.exit(1); }
console.log(`test-vercel-ignore-build: OK - ${asserts} assertions (6 skip cases, 10 code-change build cases, 5 fail-closed build cases) against a temp git fixture`);
