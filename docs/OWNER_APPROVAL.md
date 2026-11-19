# Owner approval for owner-only files

Some files set the rules every agent follows, or enforce this very check. They
change only with the owner's approval:

- `AGENTS.md`, `LOCKS.md`, `QUEUE.md`, `docs/*-standard.md`
  (`CLAUDE.md` was removed from this list on 2026-11-14 by owner decision: the owner
  does not want to be asked for approval comments on rules-file edits)
- the pieces that enforce this rule: `scripts/check-doc-ownership.mjs`,
  `scripts/check-owner-approval-pr.mjs`, `scripts/owner-approval-gate.mjs`,
  `scripts/lib/ownerApproval.mjs`, `scripts/lib/githubPullEvidence.mjs`,
  `scripts/lib/githubAppAuth.mjs`, `scripts/test-owner-approval.mjs`,
  `scripts/test-owner-approval-gate.mjs`
- the guard runner's control path: `scripts/run-guards.mjs`, every local module
  it imports (`scripts/lib/guardShards.mjs`, `scripts/lib/guardEnv.mjs`),
  `scripts/guards-serial.txt`, and `.npmrc`. A pull request that made the runner
  exit 0, or set `ignore-scripts=true`, used to turn the required guards check
  and Vercel's prebuild green with a failing guard. Adding a guard to
  `scripts/guards.txt` stays a normal change.
- **everything under `.github/`**: every workflow and `CODEOWNERS`. A workflow
  can report a check under any name and can read repository secrets, so adding
  or changing one is an owner decision.

The list lives in `scripts/lib/ownerApproval.mjs` (`OWNER_ONLY`). Paths match
case-insensitively, because on a Mac `agents.md` is the same file as `AGENTS.md`.

## What counts as approval

A comment on the pull request, posted from the owner's GitHub account
(`OWNERS`: login `wallstreethyena` and account id `297334934`, so a renamed
or re-registered login does not count), with its own line:

```
/owner-approve <the PR's current head commit, all 40 characters>
```

The failing check prints the exact line to paste. A shortened sha does not
count, because a different commit with the same short prefix can be made on
purpose. An **edited** comment does not count either: anyone with write access
(an App included) can edit a comment without changing its author, so an approval
counts only as first posted. To change one, post a new comment.

GitHub authenticates who posted a comment, so it can't be faked by editing a
commit. The command names one exact commit, but it is not tied to that commit
forever: when the pull request gets a new head whose own change is the same
change (it caught up with main, or a rebase that edits nothing), the approval
carries forward (#2558; see "Catching up with main does not void an approval"
below). Only a change to what the pull request itself changes needs a fresh
approval, and the failing check names exactly what changed.

**What does not count:** commit author or committer names (anyone can type
"Gabriel Pereira" into a commit), labels, a green local run, and a comment an
App posted with the owner's token. GitHub marks that comment with
`performed_via_github_app` (the "claude" App posted eight such approvals on
this repository in November 2026, including the one that merged #2491). A
comment the owner posts himself comes back with that field null and still
counts. The same rejection applies when an earlier approval is carried forward.

## Catching up with main does not void an approval (2026-11-12)

Branch protection makes a pull request catch up with main before it merges, and
catching up makes a new head commit. An approval names a commit, so it used to
expire with every catch-up (PRs #2175 and #2107 were approved three times each).

Now an `/owner-approve <sha>` for an earlier head still counts when the pull
request's OWN change is the same change. All three checks read GitHub's three-dot
diff (`GET /compare/main...<sha>`, which starts at the merge base, so commits that
came in from main are on neither side) for the approved commit and for the current
head, and `scripts/lib/ownerApproval.mjs` compares them file by file:

- **Carried forward:** the same files with identical edits (hunk line numbers
  ignored, so main editing elsewhere in a file is fine); guard-registry rows
  (`scripts/guards.txt`, `scripts/lib/guard-expectations.tsv`) that only moved;
  new `"applied"` receipts in `scripts/migration-apply-log.jsonl` for migrations
  the approved change already contains, unedited.
- **Fresh approval needed:** any new, removed or re-edited file; a changed line, even
  one moved or reworded; an added or dropped registry row; a receipt for any other
  migration; a conflict resolution that changes main's text; binary files GitHub
  shows no diff for; changes of 300 files or more. The failing check names exactly
  what changed.

Only the owner's own unedited approval comments are compared (the same evidence as
an exact-head approval, including the refusal of any comment an App posted), at
most the three newest. Each comparison is logged as an
`approval-audit` JSON record (PR, approved and current head and base commits, a
fingerprint of each change, the files, the approver, the approval time, the
decision and why), and the Owner Gate App puts the records on its check run.
Tests: `scripts/test-owner-approval-carry-forward.mjs`.

## Where it is checked

Only by GitHub Actions, twice:

1. **`guards`** runs `scripts/check-doc-ownership.mjs` inside the full guard
   suite. Since #2602 the suite runs as four parallel shard jobs and the
   required `guards` job passes only when every part passed; the ownership
   check runs in whichever shard holds it. It runs on `pull_request`, so it uses
   the pull request's own copy of the rule.
2. **`owner-approval`** runs `scripts/check-owner-approval-pr.mjs` on
   `pull_request_target`. GitHub runs that workflow and script from the base
   branch (`main`), never from the pull request, and the script reads the pull
   request only as data from the API. A pull request that edits the guard is
   still judged by the unedited rule.

Branch protection on `main` requires both checks, from the GitHub Actions app.
Both use a read-only token and fail when they can't read the evidence (no pull
request, no token, an API error, an incomplete file list, or a head that moved
while it was being read).

A local run fails whenever an owner-only file changed, because it can't see
approvals. That is on purpose: a local pass must never look like approval.

After the owner comments, re-run both checks on the pull request (the
"Re-run jobs" button on each). Pushing again is also fine: a new head with the
same change keeps the approval, so the owner is asked again only when the pull
request's own change is different.

## The Owner Gate App (the check a pull request cannot fake)

On a repository owned by a personal account, branch protection can pin a required
check only to an app, not to a workflow file. GitHub Actions is one app, so a pull
request that adds its own workflow with a job named `owner-approval` or `guards`
could report a passing check under that name. Pinning a workflow by path needs
GitHub Enterprise, which Wayfind does not pay for.

The free fix is a third required check, **`owner-approval-gate`**, created by a
GitHub App the owner owns (the "Owner Gate App"):

- `.github/workflows/owner-approval-gate.yml` runs `scripts/owner-approval-gate.mjs`
  on `pull_request_target` and `issue_comment`. GitHub runs both from `main`.
- The script applies the same rule as above and creates the check run with the
  App's installation token. GitHub records that check as coming from the App.
- The App's private key is a secret of the `owner-gate` environment, which only
  workflows running on `main` can open (deployment branch policy `main`,
  administrators cannot bypass). A pull request's own workflows run on its own
  ref, so they can never read the key, and without the key nothing can post a
  check as the App.
- Branch protection requires `owner-approval-gate` **from that App's id**. A
  same-named check from anything else does not count.
- Every file under `.github/` is owner-only, so the workflow cannot be changed,
  and no new workflow can be added, without the owner's approval.

`scripts/test-owner-approval-gate.mjs` proves all of this without network access,
and `scripts/owner-gate-setup-check.mjs` checks the live settings.

## Agents get their own GitHub identity (planned, NOT live)

**Status 2026-11-18: not in effect.** Agents still work through the owner's
account (`wallstreethyena`). A comment an App posts is refused
(`performed_via_github_app`), but an agent session signed in as the owner could
post a comment GitHub cannot tell apart from the owner's own. Until the switch
below happens, that boundary is a rule agents follow: **only the owner posts
`/owner-approve`**. Everything below describes the intended setup.

GitHub cannot tell the owner apart from a tool that is signed in as the owner. So
the approval only means "the owner" once agents stop using the owner's account.
Agents act as a second GitHub App, **Wayfind Agents** (`wayfind-agents[bot]`):
`scripts/agent-github-token.mjs` mints its one-hour token, and `gh` and `git` use
that. Its permissions cover pull requests, comments, pushing branches and
re-running workflows. It has no workflows, administration, secrets, environments
or checks-write permission, so it cannot change a workflow file, touch branch
protection or the gate key, or post the gate check. Its private key lives at
`~/.config/wayfind-agents/app.pem` on the owner's Mac (folder 700, file 600), and
no script prints, logs or commits it. Actions write (needed to re-run jobs) also
lets it cancel or start runs and disable or enable workflows; none of that changes
what a workflow does, and a disabled required check can only block a merge. (The gate also refuses
re-runs, so re-running an old run cannot apply an older rule.) An `/owner-approve` comment from `wayfind-agents[bot]`
never counts (it is not the owner's account).

After the switch, the owner's own GitHub login is removed from the machines agents
run on, so an owner comment is something only the owner can post, from the GitHub
website or app.

## Turning on the Owner Gate App

Status on 2026-09-24: the workflow, the rule and the tests are on `main`, and the
`owner-gate` environment exists with its `main`-only policy. Until the App exists
the gate posts nothing (`NOT CONFIGURED`) and is not required, and `guards` plus
`owner-approval` keep working exactly as before. The owner's steps (only the owner
can create an App or hold its key):

1. Create both Apps (github.com/settings/apps/new; exact fields in the setup
   checklist), each installed on the Wayfind repository only, no webhook.
   Least privilege: the Owner Gate App gets **Checks: read and write** and nothing
   else (GitHub adds the mandatory Metadata: read), because the gate reads the pull
   request with the workflow's own read-only token and uses the App token for one
   call. The Agents App gets Actions, Contents, Issues and Pull requests read and
   write, Checks and Commit statuses read.
2. Gate App key: straight from Downloads into the `owner-gate` environment secret
   `OWNER_GATE_PRIVATE_KEY` (the checklist's one Terminal line sends it and deletes
   the file, without the clipboard), plus the environment variable
   `OWNER_GATE_APP_ID`. That key never lives on any machine agents use.
3. Agents App key: `install-agents-key.sh` moves it out of Downloads to
   `~/.config/wayfind-agents/app.pem`, locks it, and checks with GitHub that the
   key, the App and its exact permissions are right. It does not switch agents yet.

Then, in this order, while an agent can still use the owner's login (these need
admin rights), and without turning off `guards` or `owner-approval`:

1. Prove the gate check on a real pull request comes from the Owner Gate App.
2. Run `scripts/owner-gate-setup-check.mjs`.
3. Only now require `owner-approval-gate`, pinned to the Gate App's id, and prove
   the pin (not merely the name) with the branch protection settings.
4. On a throwaway pull request, prove that same-named checks and statuses from a
   workflow are not required, the merge stays blocked, and a pull request's own
   jobs cannot open the `owner-gate` environment.
5. Prove `wayfind-agents[bot]` can push branches, open and edit pull requests,
   comment and re-run jobs, and cannot push workflow changes, touch branch
   protection, environments, secrets or variables, push to main, merge an
   unapproved change, or produce a passing gate check (by posting it, commenting
   `/owner-approve`, editing an owner comment, or re-running the gate). Then switch
   agents to the App.
6. The owner revokes his GitHub CLI login (github.com/settings/applications); the
   agent confirms GitHub rejects it and erases it from the Mac.

After that, changing branch protection or the gate is something only the owner
can do.
