# Proposal — `merge=union` protects LOCAL merges only; GitHub's PR merge does not apply it

- **Lane:** codex (Wayfind lane)
- **Target files if adopted:** `docs/lanes/README.md` (the "caused **zero** conflicts" sentence,
  line 16) and `CLAUDE.md`'s "`gh` merge mechanics that will waste your time" section.
- **Origin:** PR #587, merged 2026-08-06. Blocked for hours reporting `CONFLICTING` on a change
  whose only shared-file edit was a single appended line to `scripts/guards.txt` — the exact file
  `merge=union` exists to make conflict-proof.
- **Status:** awaiting owner adoption. Not in force until it lands under an owner commit.

---

## What the repo currently claims

`docs/lanes/README.md:16`:

> `scripts/guards.txt` — which looked like the problem because 30 branches touch it — caused
> **zero** conflicts, because it already carries `merge=union` in `.gitattributes`. That was the
> right fix, applied on 2026-07-28.

The fix *was* right and the measurement *was* real. The sentence is still misleading, because it
states an unconditional property that holds in only one of the two places merges happen here.

## What is actually true

**`merge=union` is applied by local `git merge`. It is evidently not applied by GitHub's
server-side merge**, which is what computes a PR's `mergeable` flag and what runs on
`gh pr merge`.

Measured on #587, 2026-08-05/06:

| check | result |
|---|---|
| `gh pr view 587 --json mergeable` | `CONFLICTING / DIRTY`, **settled** — polled 12× over ~3 min, never `UNKNOWN` |
| `git merge origin/fix/... ` into `origin/main`, locally | **clean.** `Auto-merging scripts/guards.txt`, exit 0, 264/264 guards green |
| same merge, union driver disabled (`-c merge.union.driver=false`) | **`CONFLICT (content): Merge conflict in scripts/guards.txt`** |

`scripts/guards.txt` was the *only* conflicting path. With the union driver it merges; without
it, it conflicts; GitHub behaves like the second. That is the whole inference.

**Epistemic status, stated plainly:** this is inferred from behaviour, not from GitHub
documentation. The alternative — that GitHub applies union and conflicted for some other reason
— is ruled out by the fact that the union-enabled local merge is clean and produces no other
conflicting path. Good enough to act on, and worth re-checking if GitHub's merge machinery
changes.

## Why nobody hit this for a week

Because **a branch rebased immediately before merging never sees it.** CLAUDE.md already
mandates that (`git fetch origin main` and diff immediately before every commit), and every
guard-adding PR that followed the rule merged fine — including #590 and #598, both of which
appended to `guards.txt`.

#587 sat from 2026-08-04 and went in **13 commits behind**, **seven** of which appended to
`guards.txt` (#583, #588, #589, #590, #591, #595, #600). Both sides appended at the end of the
file, which is exactly the shape union resolves and a plain three-way merge does not.

So the protection is real, and it is **conditional on branch freshness** — which is the opposite
of how the README reads.

## The rule, ready to paste

### `merge=union` does not survive a GitHub merge — refresh stale branches instead

`.gitattributes` marks `scripts/guards.txt merge=union` so two branches appending guards never
collide. **That applies to `git merge` on your machine. GitHub's PR merge does not apply it**, so
a branch that has fallen behind will report `CONFLICTING` on `guards.txt` even though the merge
is clean locally.

The tell: `gh pr view <#> --json mergeable` says `CONFLICTING`, it **stays** `CONFLICTING` across
repeated polls (so it is not the post-push lag documented above), and a local
`git merge origin/main` into the branch succeeds. When those three hold together, the branch is
simply stale.

Fix by bringing `main` into the branch and pushing — **merge, do not rebase**:

```
git checkout -B tmp/update-<pr> origin/<their-branch>
git merge --no-edit origin/main          # union resolves guards.txt here
node scripts/run-guards.mjs; echo "rc=$?" # verify the UNION, not the branch
git push origin HEAD:<their-branch>       # fast-forward, no --force
```

A merge adds on top of their commit; a rebase rewrites it and needs `--force`, which can destroy
work if the branch is shared. **Verify the union rather than assuming it:** check the line count
moved as expected, that the branch's own guard survives exactly once, that `main`'s new guards
are all present, and that `sort | uniq -d` finds no duplicates. Union merges *can* duplicate —
the runner de-dupes at run time, but a duplicated line in the file is still wrong.

**If the branch belongs to another lane, get owner authorization first** and say so in the merge
commit. CLAUDE.md's "leave the other session's branches alone" is not a formality: while #587 was
being merged, a live worktree from another session held that branch and `.git/index.lock` for
~220 seconds. Clearing that lock — which looks like ordinary stale-lock hygiene — would have
corrupted a concurrent operation. **Wait for a lock whose process is alive; only remove one whose
process is gone.**

## Suggested edit to `docs/lanes/README.md:16`

Replace "caused **zero** conflicts, because it already carries `merge=union`" with something that
carries the condition, e.g.:

> …caused **zero local conflicts**, because it carries `merge=union` in `.gitattributes`. Note
> the limit found on 2026-08-06 (#587): GitHub's PR merge does not apply `merge=union`, so a
> branch that falls behind still conflicts on this file at merge time. Union removes the pain of
> *concurrent* additions; it does not excuse a **stale** branch. See
> `docs/proposals/codex-union-merge-is-local-only.md`.

## Why it is worth adopting

The current sentence reads as "this file cannot conflict", and it is load-bearing: it is the
stated justification for the whole one-file-per-lane design and the reason nobody looks at
`guards.txt` when a PR goes red. #587's merge stalled on a conflict the repo's own documentation
says is impossible, and the first instinct — reasonable, given the docs — was that GitHub's
`CONFLICTING` had to be the known lag. It was not.

Same family as the rest of this repo's hard-won rules: **a protection verified in one environment
was assumed to hold in the one that actually gates shipping.**
