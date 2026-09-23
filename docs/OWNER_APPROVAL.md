# Owner approval for owner-only files

Some files set the rules every agent follows, or enforce this very check. They
change only with the owner's approval:

- `AGENTS.md`, `CLAUDE.md`, `LOCKS.md`, `QUEUE.md`, `docs/*-standard.md`
- the pieces that enforce this rule: `scripts/check-doc-ownership.mjs`,
  `scripts/check-owner-approval-pr.mjs`, `scripts/lib/ownerApproval.mjs`,
  `scripts/lib/githubPullEvidence.mjs`, `scripts/test-owner-approval.mjs`,
  `.github/workflows/guards.yml`, `.github/workflows/owner-approval.yml`,
  `.github/CODEOWNERS`

The list lives in `scripts/lib/ownerApproval.mjs` (`OWNER_ONLY`).

## What counts as approval

A comment on the pull request, posted from an owner GitHub login
(`OWNER_LOGINS`, currently `wallstreethyena`), with its own line:

```
/owner-approve <first 12 or more characters of the PR's current head commit>
```

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

## Known limit

GitHub can't tell the owner apart from a tool that is signed in to the owner's
own account. Agents that use the owner's `gh` login could post the comment too.
The rule for agents is to post `/owner-approve` only when the owner explicitly
instructs it for that exact change, and to say in the same comment that they
are posting on his instruction. The durable fix is to give agents their own
GitHub identity, such as a free GitHub App. The owner's comment is then
something no agent can produce.
