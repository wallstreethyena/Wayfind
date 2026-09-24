# Owner approval for owner-only files

Some files set the rules every agent follows, or enforce this very check. They
change only with the owner's approval:

- `AGENTS.md`, `CLAUDE.md`, `LOCKS.md`, `QUEUE.md`, `docs/*-standard.md`
- the pieces that enforce this rule: `scripts/check-doc-ownership.mjs`,
  `scripts/check-owner-approval-pr.mjs`, `scripts/owner-approval-gate.mjs`,
  `scripts/lib/ownerApproval.mjs`, `scripts/lib/githubPullEvidence.mjs`,
  `scripts/lib/githubAppAuth.mjs`, `scripts/test-owner-approval.mjs`,
  `scripts/test-owner-approval-gate.mjs`
- **everything under `.github/`**: every workflow and `CODEOWNERS`. A workflow
  can report a check under any name and can read repository secrets, so adding
  or changing one is an owner decision.

The list lives in `scripts/lib/ownerApproval.mjs` (`OWNER_ONLY`). Paths match
case-insensitively, because on a Mac `claude.md` is the same file as `CLAUDE.md`.

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
commit. The command names one exact commit. Pushing anything new changes the
head, so the old approval stops matching and the owner has to approve again.

**What does not count:** commit author or committer names (anyone can type
"Gabriel Pereira" into a commit), labels, and a green local run.

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

After the owner comments, re-run both checks on the pull request (the
"Re-run jobs" button on each), or push again and approve the new head.

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

## Agents get their own GitHub identity

GitHub cannot tell the owner apart from a tool that is signed in as the owner. So
the approval only means "the owner" once agents stop using the owner's account.
Agents act as a second GitHub App, **Wayfind Agents** (`wayfind-agents[bot]`):
`scripts/agent-github-token.mjs` mints its one-hour token, and `gh` and `git` use
that. Its permissions cover pull requests, comments, pushing branches and
re-running workflows. It has no workflows, administration, secrets, environments
or checks-write permission, so it cannot change a workflow file, touch branch
protection or the gate key, or post the gate check. (The gate also refuses
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

1. Create both Apps (github.com/settings/apps/new; exact fields in the setup checklist).
2. Install each App on the Wayfind repository only.
3. Gate App: generate a private key, paste it into the `owner-gate` environment
   as the secret `OWNER_GATE_PRIVATE_KEY`, add the App id as the environment
   variable `OWNER_GATE_APP_ID`, then delete the downloaded key file.
4. Agents App: generate a private key and leave it where the agents' setup reads it.

Then, while an agent can still act as the owner (these need admin rights), it adds
`owner-approval-gate` pinned to the Gate App id to the required checks, runs
`scripts/owner-gate-setup-check.mjs`, proves on a real pull request that a
same-named check from a workflow does not satisfy the gate, and switches agents to
the Agents App. The owner's last step is revoking his own GitHub CLI login
(github.com/settings/applications) and erasing github.com from the Mac keychain.
After that, changing branch protection or the gate is something only the owner
can do.
