# Owner approval for owner-only files

Some files set the rules every agent follows, or enforce this very check. They
change only with the owner's approval:

- `AGENTS.md`, `CLAUDE.md`, `LOCKS.md`, `QUEUE.md`, `docs/*-standard.md`
- the pieces that enforce this rule: `scripts/check-doc-ownership.mjs`,
  `scripts/check-owner-approval-pr.mjs`, `scripts/owner-approval-gate.mjs`,
  `scripts/lib/ownerApproval.mjs`, `scripts/lib/githubPullEvidence.mjs`,
  `scripts/lib/githubAppAuth.mjs`, `scripts/owner-approval-recheck.mjs`,
  this document (`docs/OWNER_APPROVAL.md`),
  `scripts/test-owner-approval.mjs`, `scripts/test-owner-approval-gate.mjs`,
  `scripts/test-owner-approval-v2.mjs`
- **everything under `.github/`**: every workflow and `CODEOWNERS`. A workflow
  can report a check under any name and can read repository secrets, so adding
  or changing one is an owner decision.

The list lives in `scripts/lib/ownerApproval.mjs` (`OWNER_ONLY`). Paths match
case-insensitively, because on a Mac `claude.md` is the same file as `CLAUDE.md`.

## What counts as approval (V2, 2026-11-13)

The owner opens the pull request on GitHub and clicks **Review changes → Approve**.
Nothing to paste: no command, no commit sha, no comment.

The review counts only when GitHub says it came from the owner's account
(`OWNERS`: login `wallstreethyena` **and** account id `297334934`, account type
`User`). A bot, an App, another user, or the owner's login on a different account
id never counts. The owner's **latest decisive** review decides: a later
"Request changes" withdraws an approval, a **dismissed** review approves nothing
(dismissing the owner's "Request changes" never brings an older approval back), and
a comment-only review neither grants nor withdraws.

### The approval binds to the protected content, not to a commit

The gate computes a **protected-content fingerprint** for a commit:

1. the merge base of that commit with `main`;
2. for every owner-only path that differs between the merge base and the commit:
   path, base entry (mode, type, blob sha) and proposed entry (or "absent" for an
   added or removed file);
3. sha256 of those rows, sorted by path.

The approval is valid while the fingerprint of the **reviewed commit** equals the
fingerprint of the **live head**. So:

- **Still approved:** rebasing, `main` moving, a new merge base, unrelated app
  changes, generated registries, migration receipts, CI metadata, line-number
  movement, and conflict resolution outside owner-only files.
- **Needs a fresh Approve:** any changed byte or mode in an owner-only file, a
  `.github/**` change, a change to the approval code itself, an owner-only file
  added or removed, `main` changing an owner-only file this pull request also
  changes (the approved diff no longer applies to the same base), or the pull
  request's **base branch changed** after the review.

It also fails closed when the head is behind `main` (the protected diff would not
be the one that merges; update the branch), when the fingerprint does not cover
exactly the protected paths GitHub lists as changed, and when a re-run started on
an older `main` (an older rule never re-judges).

Blob shas are git's own content hashes, read from GitHub's git data API, so the
fingerprint is cryptographic: two different file contents cannot share one.

After the owner approves, the workflows re-run on their own (see "Re-running");
nobody needs to press anything.

**What does not count:** commit author or committer names, labels, a green local
run, any review from a bot or App, and any comment that is not the legacy form below.

### Legacy comments (transition only)

An `/owner-approve <full head sha>` comment from the owner is still **read** for
pull requests approved that way before V2, with its old rules (exact head, unedited).
It is never requested: no refusal message, doc or agent asks for it. It will be
removed once no open pull request relies on it.

## Where it is checked

Only by GitHub Actions, twice:

1. **`guards`** runs `scripts/check-doc-ownership.mjs` inside the full guard
   suite. It runs on `pull_request`, so it uses the pull request's own copy of
   the rule.
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

Both read the pull request's reviews, fingerprint the protected content of the
live head and of the reviewed commit, re-read the head afterwards and fail closed
if it moved (a stale run never passes on old evidence).

## Re-running after a review

A review does not start `pull_request_target` runs, so two small workflows close
the loop without trusting the pull request:

1. `owner-review-observed.yml` runs on `pull_request_review`, only when the
   reviewer's account id is the owner's. It has no permissions, no checkout and
   no code: it only exists so its completion can be observed.
2. `owner-approval-recheck.yml` runs on `workflow_run` of (1), which GitHub runs
   from `main`. It checks out `main` without credentials and runs
   `scripts/owner-approval-recheck.mjs`, which re-runs the latest **failed**
   `owner-approval` and `guards` runs for the pull request's **live** head. It
   decides nothing: the re-run gates judge from scratch with `main`'s rule.
   The Owner Gate App workflow also listens to (1) directly.

## The Owner Gate App (the check a pull request cannot fake)

On a repository owned by a personal account, branch protection can pin a required
check only to an app, not to a workflow file. GitHub Actions is one app, so a pull
request that adds its own workflow with a job named `owner-approval` or `guards`
could report a passing check under that name. Pinning a workflow by path needs
GitHub Enterprise, which Wayfind does not pay for.

The free fix is a third required check, **`owner-approval-gate`**, created by a
GitHub App the owner owns (the "Owner Gate App"):

- `.github/workflows/owner-approval-gate.yml` runs `scripts/owner-approval-gate.mjs`
  on `pull_request_target`, `issue_comment` and `workflow_run`. GitHub runs all three from `main`.
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

## Agents get their own GitHub identity

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
re-runs, so re-running an old run cannot apply an older rule.) A review or comment from `wayfind-agents[bot]`
never counts (it is not the owner's account).

After the switch, the owner's own GitHub login is removed from the machines agents
run on, so an owner review is something only the owner can submit, from the GitHub
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
   unapproved change, or produce a passing gate check (by posting it, submitting
   an Approve review, editing an owner comment, or re-running the gate). Then switch
   agents to the App.
6. The owner revokes his GitHub CLI login (github.com/settings/applications); the
   agent confirms GitHub rejects it and erases it from the Mac.

After that, changing branch protection or the gate is something only the owner
can do.
