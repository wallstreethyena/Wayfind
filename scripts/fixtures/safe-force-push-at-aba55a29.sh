#!/usr/bin/env bash
# scripts/safe-force-push.sh — the ONLY sanctioned way to force-push a shared
# PR branch in this repo.
#
# WHY THIS EXISTS (2026-09-09). A lane force-pushed PR #1221 with a
# --force-with-lease whose lease came from a remote-tracking ref that had gone
# stale, and destroyed be96edfc — four housekeeping commits another lane had
# pushed to the same branch minutes earlier. The work was recovered (both heads
# turned out to have identical trees on the same base) but only because someone
# went looking. Nothing in git warned: `--force-with-lease` with no explicit
# value compares against YOUR cached idea of the remote, which is exactly the
# thing that is wrong after another lane pushes.
#
# Owner's rule, verbatim: "No agent may force-push a shared PR branch unless it
# has fetched that exact remote branch immediately beforehand and the push is
# conditional on the exact SHA it just observed."
#
# So this script does three things in order, and refuses if any of them is off:
#   1. fetches THAT branch, right now, no cache;
#   2. pins the lease to the SHA that fetch just returned;
#   3. shows what would be lost and requires the count to be zero, or an
#      explicit --accept-loss with the exact SHA the caller says they reviewed.
#
# Usage:
#   scripts/safe-force-push.sh <branch>
#   scripts/safe-force-push.sh <branch> --accept-loss <sha-you-reviewed>
#
# The lease is what makes this a compare-and-swap: if the remote moved between
# the fetch and the push, the push is REJECTED rather than silently winning.
set -euo pipefail

BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "safe-force-push: FAIL — no branch given. Usage: scripts/safe-force-push.sh <branch> [--accept-loss <sha>]" >&2
  exit 2
fi
shift || true

ACCEPT=""
if [ "${1:-}" = "--accept-loss" ]; then
  ACCEPT="${2:-}"
  if [ -z "$ACCEPT" ]; then
    echo "safe-force-push: FAIL — --accept-loss needs the exact SHA you reviewed and are choosing to discard." >&2
    exit 2
  fi
fi

case "$BRANCH" in
  main|master)
    echo "safe-force-push: REFUSED — never force-push $BRANCH. Protected main is where every lane lands." >&2
    exit 2
    ;;
esac

# 1. Fetch THIS branch, now. Not --all, not a cached ref: the whole failure was
#    trusting a remote-tracking ref that had not been updated.
echo "safe-force-push: fetching origin/$BRANCH …"
git fetch --no-tags origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" >/dev/null 2>&1 || true
REMOTE_HEAD="$(git ls-remote origin "refs/heads/$BRANCH" | awk '{print $1}')"

LOCAL_HEAD="$(git rev-parse HEAD)"

if [ -z "$REMOTE_HEAD" ]; then
  # No remote branch yet: this is a create, not a force. Nothing can be lost.
  echo "safe-force-push: origin/$BRANCH does not exist yet — this is a first push, no lease needed."
  git push origin "HEAD:refs/heads/$BRANCH"
  echo "safe-force-push: OK — created origin/$BRANCH at $LOCAL_HEAD"
  exit 0
fi

echo "safe-force-push: observed origin/$BRANCH = $REMOTE_HEAD"
echo "safe-force-push: local HEAD            = $LOCAL_HEAD"

if [ "$REMOTE_HEAD" = "$LOCAL_HEAD" ]; then
  echo "safe-force-push: nothing to do — origin/$BRANCH already IS your HEAD."
  exit 0
fi

# 2. What would this push destroy? Anything reachable from the remote head that
#    is NOT reachable from ours. Zero is the normal, safe answer.
LOST="$(git rev-list --no-merges "$LOCAL_HEAD..$REMOTE_HEAD" 2>/dev/null || echo "")"
LOST_N=0
[ -n "$LOST" ] && LOST_N="$(printf '%s\n' "$LOST" | wc -l | tr -d ' ')"

if [ "$LOST_N" -ne 0 ]; then
  echo "safe-force-push: origin/$BRANCH holds $LOST_N commit(s) your HEAD does not contain:" >&2
  git --no-pager log --oneline --no-merges "$LOCAL_HEAD..$REMOTE_HEAD" >&2 || true
  if [ "$ACCEPT" != "$REMOTE_HEAD" ]; then
    cat >&2 <<MSG

safe-force-push: REFUSED.

This is the #1221 failure exactly: another lane's commits are on this branch and
this push would delete them. Do ONE of these, never a bigger hammer:

  * rebase onto them:   git fetch origin && git rebase origin/$BRANCH
  * or, if you have reviewed those commits and are deliberately discarding them,
    rescue them first and re-run with the SHA you just read:

        git branch rescue/$BRANCH-$(printf '%.8s' "$REMOTE_HEAD") $REMOTE_HEAD
        git push origin rescue/$BRANCH-$(printf '%.8s' "$REMOTE_HEAD")
        scripts/safe-force-push.sh $BRANCH --accept-loss $REMOTE_HEAD

ONE LANE OWNS ONE REMOTE BRANCH. If you are here because two lanes are pushing
the same branch, the fix is a second branch, not a bigger force.
MSG
    exit 1
  fi
  echo "safe-force-push: --accept-loss matches the SHA just observed ($REMOTE_HEAD) — proceeding."
fi

# 3. Compare-and-swap. The lease names the exact SHA observed seconds ago, so a
#    push that races another lane is REJECTED rather than silently winning.
git push --force-with-lease="refs/heads/$BRANCH:$REMOTE_HEAD" origin "HEAD:refs/heads/$BRANCH"
echo "safe-force-push: OK — origin/$BRANCH moved $REMOTE_HEAD -> $LOCAL_HEAD under a lease pinned to the observed SHA"
