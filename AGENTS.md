# Wayfind — rules for every agent working this repo

Paste this at the start of every session, in every terminal (Claude, GWEN, DeepSeek, LLAMA).
If anything below conflicts with your own reasoning, this file wins.

> **⚠ SECTION NUMBERS CHANGED — 2026-07-29, in the commit that added §5.** §5 ("Absent configuration fails loudly") was
> INSERTED, which shifted every section after it by one. Any citation written before this
> commit points at the wrong section. Mapping:
>
> | Was | Is now | Title |
> |---|---|---|
> | §1–§4 | unchanged | One writer · Claim the work · Branch from main · Verify by running |
> | — | **§5** | **Absent configuration fails loudly. Never silently.** ← new |
> | §5 | §6 | Guards are the product decisions |
> | §6 | §7 | A clean merge is not a correct merge |
> | §7 | §8 | Standing product constraints |
> | §8 | §9 | Secrets |
> | §9 | §10 | Finish the same way every time |
> | §10 | **§11** | Ask before anything outward-facing |
>
> Known casualty: "§10 says I ask before a production write" — that rule is now **§11**.
> §10 is now "Finish the same way every time."
>
> **From here on, APPEND. Do not insert.** Renumbering invalidates every citation in every open
> PR, issue and agent transcript at once, and there is no way to tell a stale citation from a
> correct one by reading it.

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
returns a reassuring answer it did not earn. Four distinct shapes have hit us, and they
need different defences — a guard against one does not catch the others:

**(a) Ran against nothing, reported success.**
A `/private/tmp` worktree probed at a stale path: `git -C` errored, the error was
suppressed, `wc -l` counted zero lines, and the report read "0 uncommitted changes" for a
directory that did not exist — the real tree had five uncommitted files. A `zsh` loop that
did not word-split, so five deletions silently no-oped and the verification block printed
OK comparing two empty strings. `git worktree list` run from the wrong tree, calling three
live paths prunable.

- Assert the target exists before probing it.
- Never suppress an error on the command whose output becomes your answer.
- Assert both sides of a comparison are non-empty before comparing. Two empty strings are
  equal; that is absence, not agreement.
- Count loop iterations against the input count and fail when they differ. A loop that ran
  zero times exits 0.

**(b) Silently did not achieve the stated condition.**
A pane asked Chrome to resize to 390px. macOS clamped it to 506. The check reported the
width it had *requested*, not the width it *got*.

- Re-read the achieved state from the source of truth, never from your own input.
- If you asked for X, assert X is now true — do not assert that you asked.

**(c) Ran correctly, answered a different question.**
`git diff HEAD origin/main -- <paths>` ran fine and reported honestly. It answers "which
files differ between these refs", not "which files did #401 touch". Every rule in (a)
passes here: the command existed, ran, and returned real output. It was simply not the
question.

- State the question in words first, then check the command actually answers *that*.
- Prefer a command scoped to the claim: to ask what a commit touched, ask the commit
  (`git show --name-only <sha>`), not a diff between two refs.
- This is the shape that survives every "did my check run" guard. Assume you are making it.

**(d) False negative — reported absent for something present.**
A line-oriented `grep` for a phrase that wrapped across a newline returned 0. The text was
there.

- Match the tool to the shape of the data: line tools find line-shaped things.
- Before trusting an absence, prove the probe can find a positive — search for something
  you know is present in the same file, the same way.

**(e) Stopped early, reported done.**
A sweep that stops when a measured condition is met can stop for the wrong reason and still
report success. A census sweep watched marginal yield over the last 12 queries and declared
saturation — but the window sat entirely inside one district's exhausted phrasing, so a
local trough read as metro-wide completion. It stopped in a district that had reached 154
place_ids where every other district reached 685–841, and the district visited immediately
before it had just contributed 223 place_ids nobody else reached. The verdict said "done";
the sweep had run out of plan, not out of venues.

- Scope the stopping condition to the axis it claims to cover. A per-metro claim cannot be
  measured on a window that only ever sees one district.
- **A stopping condition you cannot audit afterward is a stopping condition you have to
  trust. Persist the curve, not just the verdict.** The bad stop above survived only because
  the run saved its conclusion and threw away the per-query series behind it.
- A budget or cap that binds must say so loudly. A truncated run must never render as a
  completed one.

**And for all five: prove the check can fail.** Break the thing on purpose, watch it go
red, put it back. A guard that has never failed in front of you is a guard you are guessing
about.

**A check that cannot fail is worse than no check, because it launders an unknown into a
green.** When you report a verification, say what you ran and what it returned — not that
it passed.

Assertions written before a rule exists are the ones the rule cannot reach retroactively. When a
§4-class rule lands, a repo-wide sweep for prior violations is mandatory, not optional.

## 5. Absent configuration fails loudly. Never silently.

A missing or empty required value is an error, not a default. The failure names the variable and
stops the process. It never falls back to a placeholder, never substitutes a literal, and never
degrades into output that looks like a normal answer.

The failure shapes this prevents:

(a) **The silent fallback.** `process.env.X || "some-literal"`. A hardcoded default makes the
    resulting behaviour unfalsifiable — you cannot tell "configured correctly" from "configured not
    at all" by looking at the output.
(b) **The plausible empty.** A missing data-source key that yields an empty pool, rendered to users
    as an ordinary "nothing found" state. A misconfiguration wearing the costume of a product state
    is undiagnosable from the outside.
(c) **The unlabelled build.** Placeholder config is legitimate for e2e. A build made with it that is
    indistinguishable from a production build is not.

**Corollary:** a zero has two causes and they get opposite treatment. Zero because the source is
unconfigured is an operator error and must be loud. Zero because everything was filtered is a
product state and gets product handling. Code that cannot tell them apart is the bug.

Recorded instances, 2026-07-28: `DEFAULT_ADS_ID` made "0 conversions" unfalsifiable;
`NEXT_PUBLIC_SUPABASE_URL` fell through to a nonexistent placeholder host; a production build with
`GOOGLE_MAPS_SERVER_KEY` at length 0 compiled, booted, and rendered "0 curated picks."

## 6. Guards are the product decisions. Do not route around them.

A failing guard is far more likely to be right than your change is. If a guard blocks you,
find the decision it encodes — the comment above it says why it exists — and either honour it
or explain to the owner why it should change. Never delete, skip, weaken, or `EXCLUDED`-list
a guard to get green.

New guard file ⇒ add it to `scripts/guards.txt` in the **same commit**. That is what
`check-guard-manifest.mjs` enforces and why it exists.

## 7. A clean merge is not a correct merge

Git preserving a block of code is evidence about *text*, not about *intent*. When a change is
"remove X", a 3-way merge will happily keep someone else's newer copy of X, because it looks
like an unrelated addition. That is exactly how #392's home-feed taste editor — the surface
the owner explicitly asked to delete — nearly shipped back.

After any merge/rebase/`am`, grep for the thing the change was supposed to remove and confirm
it is gone. Zero, not "probably".

## 8. Standing product constraints — never negotiate these

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

## 9. Secrets

Never print, commit, echo, or paste a real key. Never read `.env*` into your output. If you
need a value to make something run, use the placeholders in §4.

## 10. Finish the same way every time

State: **what changed, why, risks, follow-ups.** No "should work". If you did not run it, say
you did not run it.

## 11. Ask before anything outward-facing

Pushing to a shared branch, opening or merging a PR, deploying, deleting remote refs,
force-pushing: confirm with the owner first. Everything else — read, build, test, branch
locally — go ahead without asking.
