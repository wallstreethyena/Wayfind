#!/usr/bin/env bash
# lane-fix.sh — one-shot repo hygiene. Idempotent. Run from the repo root.
#
# Measured 2026-07-31: 55 live branches, 29 of which conflict with main.
# 11 of those 29 conflicts (38%) are on coordination documents, not code.
# scripts/guards.txt caused ZERO conflicts — merge=union already handles it.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
echo "== Wayfind lane-fix =="

echo; echo "-- 1. clearing stale git locks --"
for f in .git/index.lock .git/packed-refs.lock .git/refs/heads/wf-probe-delete-me.lock; do
  [ -e "$f" ] && rm -f "$f" && echo "   removed $f"
done
rm -f .wf-write-test 2>/dev/null && echo "   removed .wf-write-test (Cowork probe artifact)"
git branch -D wf-probe-delete-me 2>/dev/null && echo "   deleted branch wf-probe-delete-me (Cowork probe artifact)"

echo; echo "-- 2. guard count BEFORE --"
BEFORE=$(node scripts/run-guards.mjs 2>&1 | grep -oE '^run-guards: [0-9]+' | grep -oE '[0-9]+' || echo "?")
echo "   $BEFORE guards"

echo; echo "-- 3. registering the two new guards --"
for g in "node scripts/check-doc-ownership.mjs" "node scripts/check-locks.mjs"; do
  grep -qxF "$g" scripts/guards.txt || { echo "$g" >> scripts/guards.txt; echo "   + $g"; }
done

echo; echo "-- 4. deleting branches whose content is already in main --"
git fetch --quiet origin 2>/dev/null || true
DEL=0; KEPT=0
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'); do
  [ "$b" = "$(git branch --show-current)" ] && continue
  files=$(git diff --name-only "origin/main...$b" 2>/dev/null)
  if [ -z "$files" ] || git diff --quiet "origin/main..$b" -- $files 2>/dev/null; then
    git branch -D "$b" >/dev/null 2>&1 && { echo "   deleted $b"; DEL=$((DEL+1)); }
  else KEPT=$((KEPT+1)); fi
done
echo "   deleted=$DEL  kept-live=$KEPT"
echo "   NOTE: content test only. --merged and --contains lie in this squash-merge repo."

echo; echo "-- 5. branches that CONFLICT with main (need a human) --"
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'); do
  base=$(git merge-base origin/main "$b" 2>/dev/null) || continue
  git merge-tree "$base" origin/main "$b" 2>/dev/null | grep -q '^+<<<<<<<' && echo "   $b"
done

echo; echo "-- 6. guard count AFTER --"
node scripts/run-guards.mjs 2>&1 | tail -2

echo; echo "-- 7. staging --"
git add docs/lanes QUEUE.md LOCKS.md scripts/check-doc-ownership.mjs scripts/check-locks.mjs scripts/guards.txt scripts/lane-fix.sh 2>/dev/null
git status --short | head -20
echo
echo "Review, then:"
echo "  git checkout -b chore/lane-coordination && git commit -m 'chore(lanes): per-lane state files, owner-only rule docs, file locks, queue'"
