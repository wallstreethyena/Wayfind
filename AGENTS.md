# Wayfind — rules for every agent working this repo

Paste this at the start of every session, in every terminal (Claude, GWEN, DeepSeek, LLAMA).
If anything below conflicts with your own reasoning, this file wins.

Repo: `~/Projects/wayfind` · remote `origin` = `wallstreethyena/Wayfind` · trunk = `main`.

---

## 1. One writer at a time

`~/Projects/wayfind` is a single-writer working tree. Before you touch it, run `git status`.
If it is on a branch that is not yours, or the index is mid-`am`/mid-`rebase`/mid-`merge`, **stop
and say so.** Do not "fix" someone else's in-progress state.

If you need to work while another agent holds the tree, take a worktree instead:

```
git worktree add ../wf-<yourname> origin/main
```

Work there, and remove it when you are done. Two agents editing `app/home.js` in the same
checkout is how today's mess started.

**Worktrees live at `../wf-<yourname>` on real disk. Never `/private/tmp` or any other temp
path.** Temp directories get reaped by the OS and are not reliably visible from other
checkouts, so a worktree there can stop being readable while it still holds uncommitted
work. On 2026-07-28 a `/private/tmp` worktree held five uncommitted files — including an
untracked component that no bundle covered — and a `git worktree list` run from a different
tree reported three paths as prunable that were not. Work you cannot see is work you can
destroy by accident.

Before removing any worktree: `git worktree list`, confirm the path is the one you mean,
and confirm `git -C <path> status --porcelain` is empty. See §4 — assert the path exists
first, or that check reports clean for a directory that is simply gone.

## 2. Claim the work before doing it

Before starting anything that produces a branch or a PR:

```
git fetch origin
gh pr list --state open        # or open github.com/wallstreethyena/Wayfind/pulls
```

If an open PR already covers the task you were handed, **say so and stop.** Do not open a
second one. Today two agents independently reconciled PR #393 and reached *opposite*
conclusions about the same code. That is worse than either one working alone.

## 3. Branch from `origin/main`, and stay close to it

```
git fetch origin
git checkout -B <branch> origin/main
```

Never branch from another branch. Never resume a branch you have not re-fetched.
Before you finish, run this and read it:

```
git log --oneline HEAD..origin/main
```

Anything listed there landed *underneath* you while you worked. If it touches your files,
rebase before you push. PR #393 sat open long enough that `main` merged #395 under it and
six of its ten "new" test suites already existed upstream — it had partly reinvented work
that had already shipped.

Branch lifetime is measured in **hours**, not versions.

## 4. Verify by running. Never by reasoning.

The truth of this repo is:

```
node scripts/run-guards.mjs      # the full guard suite (= npm run prebuild)
npm run check:jsx
npx next build
```

with these placeholders exported (they are not secrets, they are shaped like keys so the
build type-checks):

```
NEXT_PUBLIC_GOOGLE_MAPS_KEY=e2e-placeholder-not-a-real-key
NEXT_PUBLIC_SUPABASE_URL=https://e2eplaceholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-placeholder-anon-key-not-real
```

Do not report a risk you have not reproduced. Today an agent reported "green build, four
guards silently dead" as a blocking finding. It was false: `scripts/check-guard-manifest.mjs`
already fails the build when a `check-*.mjs` / `test-*.mjs` file is not listed in
`scripts/guards.txt`. Deleting the four lines and running it takes eleven seconds and would
have shown that. **If you can test a claim, test it before you report it.**

### A verification must prove it ran before it reports

The most expensive failure on this repo is not a check that fails. It is a check that
returns a reassuring answer **because it ran against nothing**. Three agents hit this on
2026-07-28, by three unrelated mechanisms, within hours:

- A `/private/tmp` worktree was probed at a stale path. `git -C` errored, the error was
  suppressed, `wc -l` counted zero lines, and the report read "0 uncommitted changes" — a
  clean reading of a directory that did not exist. The real tree had five uncommitted files.
- A `zsh` loop did not word-split, so five deletions silently no-oped. The verification
  block printed OK because it compared two empty strings.
- `git worktree list` run from the wrong tree reported three paths prunable. They were not;
  they simply were not visible from where it ran.

So, before you conclude anything from a check:

1. **Assert the target exists.** `[ -d "$P" ] || { echo "MISSING: $P"; exit 1; }` before you
   probe a path you are about to draw a conclusion from.
2. **Never suppress an error on something you will conclude from.** No `2>/dev/null` on the
   command whose output becomes your answer. Suppress noise, never the signal.
3. **Assert both sides of a comparison are non-empty before comparing.** Two empty strings
   are equal. That is not agreement, it is absence.
4. **Count the iterations.** If a loop should process N items, count them and fail when the
   count differs. A loop that ran zero times exits 0.
5. **Prove the check can fail.** Break the thing on purpose, watch it go red, put it back.
   A guard that has never failed in front of you is a guard you are guessing about.

**A check that cannot fail is worse than no check, because it launders an unknown into a
green.** When you report a verification, say what you ran and what it returned — not that it
passed.

## 5. Guards are the product decisions. Do not route around them.

A failing guard is far more likely to be right than your change is. If a guard blocks you,
find the decision it encodes — the comment above it says why it exists — and either honour it
or explain to the owner why it should change. Never delete, skip, weaken, or `EXCLUDED`-list
a guard to get green.

New guard file ⇒ add it to `scripts/guards.txt` in the **same commit**. That is what
`check-guard-manifest.mjs` enforces and why it exists.

## 6. A clean merge is not a correct merge

Git preserving a block of code is evidence about *text*, not about *intent*. When a change is
"remove X", a 3-way merge will happily keep someone else's newer copy of X, because it looks
like an unrelated addition. That is exactly how #392's home-feed taste editor — the surface
the owner explicitly asked to delete — nearly shipped back.

After any merge/rebase/`am`, grep for the thing the change was supposed to remove and confirm
it is gone. Zero, not "probably".

## 7. Standing product constraints — never negotiate these

- **Affinity may reorder results. It must NEVER feed a displayed Wayfind Score.**
- **No scraping, polling, or automated requests** against `disneyworld.disney.go.com`,
  the My Disney Experience app, or any Disney reservation endpoint. Google Places is the only
  source of identifiers. DeepSeek output is prose/enums only, enforced by the regex validator
  that rejects URLs, domains, emails and phone numbers.
- **Google Places ToS:** Place IDs may be stored indefinitely; all other place content must
  not be cached beyond 30 days.
- Do not weaken `geoConfirms()` or the `isTicketyPlace()` beach exclusion.
  `scripts/test-booking-integrity.mjs` stays green.
- Personalization is **signed-in only**, and lives at the bottom of Favorites — never in the
  home feed. Locked by `scripts/test-taste.mjs`.

## 8. Secrets

Never print, commit, echo, or paste a real key. Never read `.env*` into your output. If you
need a value to make something run, use the placeholders in §4.

## 9. Finish the same way every time

State: **what changed, why, risks, follow-ups.** No "should work". If you did not run it, say
you did not run it.

## 10. Ask before anything outward-facing

Pushing to a shared branch, opening or merging a PR, deploying, deleting remote refs,
force-pushing: confirm with the owner first. Everything else — read, build, test, branch
locally — go ahead without asking.
