#!/usr/bin/env bash
# scripts/vercel-ignore-build.sh — Vercel "Ignored Build Step".
# Exit 0 = SKIP this build, exit 1 = BUILD it (Vercel's convention).
#
# Why: Vercel builds one deployment at a time. Photo-only pushes
# (public/place-photos/**) queued ahead of code PR previews and blocked them for
# over an hour. Code changes must ALWAYS still get a preview (mobile / routing /
# map / photo bugs are caught there), so this skips ONLY commits whose every
# changed path is data or docs. Anything unknown, ambiguous or failing BUILDS.
#
#   - VERCEL_ENV=production           -> build (production always ships files)
#   - preview no longer its branch head -> skip (a newer push builds; see below)
#   - no / unresolvable previous SHA  -> build (fail closed)
#   - any path outside the allow-list -> build
#   - any path in a code area (app/ lib/ components/ scripts/ data/ public/
#     outside place-photos/, middleware.js, next.config*, package*.json, ...)
#     -> build, even when it is a .md file
#
# Locked by scripts/test-vercel-ignore-build.mjs. Project setting (applied through the
# Vercel API under the owner's 2026-11-04 approval; the first clause is the setting that was
# already there, kept unchanged, so a docs/markdown-only commit still skips everywhere):
#   git diff --quiet HEAD^ HEAD -- . ':(exclude)*.md' ':(exclude)docs/**' ||
#   { [ -f scripts/vercel-ignore-build.sh ] && bash scripts/vercel-ignore-build.sh || exit 1; }
# A branch that predates this file always builds.

build() { echo "vercel-ignore-build: BUILD - $1"; exit 1; }
skip()  { echo "vercel-ignore-build: SKIP - $1"; exit 0; }

[ "${VERCEL_ENV:-}" = "production" ] && build "production deploys always build"

# Superseded preview (owner approval 2026-11-04, "suppress duplicate branch builds"): when
# this commit is no longer its branch's head, a newer push exists and ITS build is the one
# that matters. Measured 2026-11-04: 240 of 312 queued previews were superseded and each
# held a build slot for ~10 minutes. The branch head always builds, so the last push of
# every branch still gets its preview. Any doubt (no branch, remote unreachable, empty
# answer) falls through to the rules below.
branch="${VERCEL_GIT_COMMIT_REF:-}"
remote="${WAYFIND_IGNORE_REMOTE:-https://github.com/${VERCEL_GIT_REPO_OWNER:-wallstreethyena}/${VERCEL_GIT_REPO_SLUG:-wayfind}.git}"
if [ -n "$branch" ] && [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
  head="$(GIT_TERMINAL_PROMPT=0 timeout 20 git ls-remote "$remote" "refs/heads/$branch" 2>/dev/null | cut -f1 | head -n1)"
  if [ -n "$head" ] && [ "$head" != "$VERCEL_GIT_COMMIT_SHA" ]; then
    skip "superseded: ${branch} is now at ${head:0:8}, this build is ${VERCEL_GIT_COMMIT_SHA:0:8}; the newer push builds"
  fi
fi

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
cur="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
[ -n "$prev" ] || build "no previous SHA (first build of this branch)"

if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=50 origin "$prev" >/dev/null 2>&1 || true
  git cat-file -e "${prev}^{commit}" 2>/dev/null || build "previous SHA ${prev:0:8} not resolvable in this clone"
fi
git cat-file -e "${cur}^{commit}" 2>/dev/null || build "current SHA ${cur:0:8} not resolvable in this clone"

# --no-renames lists both sides of a rename; -z is safe for odd file names.
files="$(git diff --name-only --no-renames -z "$prev" "$cur" | tr '\0' '\n')" || build "git diff failed"
[ -n "$files" ] || build "no changed files found between ${prev:0:8} and ${cur:0:8} (cannot prove data-only)"

n=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  n=$((n + 1))
  case "$f" in
    public/place-photos/*) ;;
    app/*|lib/*|components/*|scripts/*|data/*|public/*|middleware.js|next.config*|package*.json|vercel.json|.github/*)
      build "code or runtime file changed: $f" ;;
    docs/*|*.md) ;;
    supabase/*.sql|supabase/photo-batches/*) ;;
    *) build "path not on the data/docs allow-list: $f" ;;
  esac
done <<EOF
$files
EOF

skip "$n changed file(s), all data/docs only (place-photos, docs, *.md, stored supabase SQL)"
