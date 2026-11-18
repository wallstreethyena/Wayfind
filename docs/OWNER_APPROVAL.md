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
  `scripts/test-owner-approval-carry-forward.mjs`, `scripts/test-owner-approval-gate.mjs`,
  `scripts/owner-gate-setup-check.mjs`, and, since the 2026-11-18 security review, the
  signature code: `scripts/lib/sshSignature.mjs` (the verifier),
  `scripts/lib/ownerSigningTestkit.mjs` (the test signer) and
  `scripts/owner-sign-approval.mjs` (the helper the owner signs with, which decides what
  he is shown when he signs). A pull request that could edit any of these could change
  what counts as a signature.
- **everything under `.github/`**: every workflow and `CODEOWNERS`. A workflow
  can report a check under any name and can read repository secrets, so adding
  or changing one is an owner decision.

The list lives in `scripts/lib/ownerApproval.mjs` (`OWNER_ONLY`). Paths match
case-insensitively, because on a Mac `agents.md` is the same file as `AGENTS.md`.

## What counts as approval

A comment on the pull request, posted from the owner's GitHub account
(`OWNERS`: login `wallstreethyena` and account id `297334934`, so a renamed
or re-registered login does not count), with its own line, **followed by an SSH
signature block that the owner's FIDO security key made over that exact commit, with a touch and the key's PIN** (see
"Signed approval" below; without a verifying signature the comment is not evidence):

```
/owner-approve <the PR's current head commit, all 40 characters>
-----BEGIN SSH SIGNATURE-----
...
-----END SSH SIGNATURE-----
```

The failing check prints the exact line to paste and the helper command that makes the signature. A shortened sha does not
count, because a different commit with the same short prefix can be made on
purpose. An **edited** comment does not count either: anyone with write access
(an App included) can edit a comment without changing its author, so an approval
counts only as first posted. To change one, post a new comment.

GitHub authenticates who posted a comment, so it can't be faked by editing a
commit. The command names one exact commit. Pushing anything new changes the
head, so the old approval stops matching and the owner has to approve again.

**What does not count:** commit author or committer names (anyone can type
"Gabriel Pereira" into a commit), labels, a green local run, and a comment an
App posted with the owner's token. GitHub marks that comment with
`performed_via_github_app` (the "claude" App posted eight such approvals on
this repository in November 2026, including the one that merged #2491). A
comment the owner posts himself comes back with that field null and still
counts. The same rejection applies when an earlier approval is carried forward.
(Even a comment the owner's account posts is not enough on its own any more; see the
next two sections.)

## Why the account checks are not enough (threat model, 2026-11-18)

Everything above proves which ACCOUNT posted a comment, not WHO was at the keyboard.
A comment posted through the owner's `gh` CLI OAuth token comes back from the API
with `user.login` = `wallstreethyena`, `user.type` = `User`, the owner's account id,
`performed_via_github_app` = `null`, and identical `created_at`/`updated_at`: byte for
byte what a hand-typed comment looks like. This was shown on issue #2477 (comment of
2026-11-14T20:44:38Z, posted by an agent using the owner's token). So the login, id,
type, unedited and `performed_via_github_app` checks can all be satisfied by anything
that holds the owner's token. Agents running as the owner (or with his token on disk)
could therefore approve their own changes to the rules and to this gate.

The one thing such an agent cannot produce is a signature from a private key that
never leaves the owner's hardware and needs a physical touch to use. So an approval
now requires that proof, and the proof is bound to the repository and the exact commit.

## Signed approval (the rule since 2026-11-18)

The comment must contain an OpenSSH signature (`ssh-keygen -Y sign`, namespace
`wayfind-owner-approve`) over exactly these bytes (no trailing newline):

```
wayfind-owner-approve v1
repo=wallstreethyena/Wayfind
sha=<the full 40-character head sha, lowercase>
```

and it must verify, with `scripts/lib/sshSignature.mjs` (node:crypto only, following
OpenSSH `PROTOCOL.sshsig` and `PROTOCOL.u2f`), against a key in `OWNER_SIGNING_KEYS`
in `scripts/lib/ownerApproval.mjs`, **under the owner signing policy** below (the key must be
a security key and the signature must show a touch and the PIN). The verifier itself is generic
and parses `ssh-ed25519`, `sk-ssh-ed25519@openssh.com`, `ecdsa-sha2-nistp256` and
`sk-ecdsa-sha2-nistp256@openssh.com`; the policy is what limits approval to the two `sk-` types.
Every earlier rule still applies (owner login and id,
`User` type, unedited, not posted by an App, full 40-hex sha, head binding, carry-forward).
A wrong namespace or hash, another key, another repository, another commit, a
modified byte, trailing garbage or any parse error is a refusal. **If
`OWNER_SIGNING_KEYS` is empty, nothing is approved**: the gate fails closed.

Because the message names the repository and the commit, a signature cannot be replayed
on a new head or on a fork. Carry-forward of an approval to a caught-up head still works,
because it starts from an earlier head that carries a valid signature.

### Owner signing policy (2026-11-18 security review)

A valid signature is not enough on its own. In `scripts/lib/ownerApproval.mjs`
(`APPROVAL_POLICY`) an approval signature counts only when **both**:

1. **The matching `OWNER_SIGNING_KEYS` line is a security-key type**:
   `sk-ssh-ed25519@openssh.com` or `sk-ecdsa-sha2-nistp256@openssh.com`. A plain
   `ssh-ed25519` / `ecdsa-sha2-nistp256` line, a Secure Enclave key (Secretive) and a key held
   by a password manager or SSH agent (1Password) are **not accepted**, even though they parse
   and their signatures verify. Why: the verifier can only prove a signature came from a key,
   never that a person was present. Anything running as you can ask a key file, the Secure
   Enclave or an agent socket to sign, so an agent with your session could approve its own
   change. Only a FIDO security key puts a physical touch (and a PIN) into the signed data,
   where the verifier can check it.
2. **The signature's signed flags include BOTH user presence (`0x01`, the touch) AND user
   verification (`0x04`, the PIN).** The flags are part of the signed bytes, so they cannot
   be edited afterwards. A signature with the touch but no PIN, or the PIN without the touch,
   is refused, each with its own reason. Create the key with `-O verify-required` (below) so
   the key itself insists on the PIN.

The generic verifier (`scripts/lib/sshSignature.mjs`) takes the policy as an argument
(`{ requireSecurityKey, requireUserVerification }`) and behaves as before for callers that pass
none; the owner's policy lives in the owner-only `ownerApproval.mjs`.

### Owner setup (one time, on your own machine)

1. Use a **YubiKey or another FIDO2 key**. Create the signing key with a PIN requirement and
   store it on the key (resident):

   ```
   ssh-keygen -t ed25519-sk -O verify-required -O resident -C "wayfind owner approval" -f ~/.ssh/id_ed25519_sk
   ```

   (OpenSSH 8.2 or newer. The key asks for its **PIN** when you create it and **on every
   signature**, and you touch it when it blinks. `-O verify-required` is what makes the PIN
   mandatory; without it the signature carries no user-verification flag and the gate refuses
   it.) **Never touch the key unless you started the signing yourself, just now, from the
   helper below.** A blinking key you did not start is an agent or a program asking it to
   sign: leave it alone. Secretive, 1Password and plain private-key files are not accepted (see
   the policy above).
2. Add the public line (the `.pub` file's one line) to `OWNER_SIGNING_KEYS` in
   `scripts/lib/ownerApproval.mjs`, either in the pull request that introduces this rule
   (before you approve it) or in a follow-up. That file is owner-only, so changing the list
   needs your own approval of that change.

   ```
   cat ~/.ssh/id_ed25519_sk.pub
   ```

   Until a key is in the list, no owner-only change can be approved by anyone.

   **Bootstrap warning (the pull request that introduces this rule).** Its two required
   checks do not protect it from itself. The `guards` check runs the pull request's own code,
   and `owner-approval` runs `main`'s older comment rule, which accepts the plain
   `/owner-approve <sha>` line with no signature. So an agent that holds the owner's token
   could add its OWN public key to `OWNER_SIGNING_KEYS` in that pull request and sign with it,
   and the checks would pass. **Before you approve, compare the exact `OWNER_SIGNING_KEYS`
   line in the final diff with `cat ~/.ssh/<your key>.pub` yourself, character by character,
   on your own machine.** After this rule merges, adding or changing a key line needs your
   signed approval like any other owner-only edit, and this exposure is gone.
3. To approve a pull request: open it **on github.com**, read the diff, and **copy the head
   commit sha from the page** (the Commits tab, or the sha beside the last commit). **Check the
   sha on github.com before you touch the key.** Then run the helper on your machine (it
   prints, it never posts):

   ```
   node scripts/owner-sign-approval.mjs --sha <the 40-character sha you copied> [--key ~/.ssh/id_ed25519_sk]
   ```

   There is deliberately no `--pr` option: "sign whatever the head is now" would sign a commit
   an agent pushed after you looked. The helper prints the repository and the sha in large
   type BEFORE the key asks for your touch; compare them with github.com while the key waits.
   If they differ by even one character, press Ctrl-C and do not touch the key. Then enter the
   PIN and touch the key. It prints the whole comment: the `/owner-approve <sha>` line and the
   `-----BEGIN SSH SIGNATURE-----` block.
4. Paste all of that into a new comment on the pull request yourself, in the GitHub website
   or app (not through an agent or `gh`). Then re-run the two checks. Push anything new and
   the head changes, so sign again for the new head.

An agent never posts, edits, drafts for posting, or relays an `/owner-approve` comment or
signature, on any account, and never runs `scripts/owner-sign-approval.mjs` or
`ssh-keygen -Y sign` with an owner key or triggers a security-key prompt (AGENTS.md section 11).
Testing: `scripts/test-owner-approval.mjs` and the gate and carry-forward tests sign with
synthetic security keys (built with node:crypto per `PROTOCOL.u2f`, flags `0x05`) from
`scripts/lib/ownerSigningTestkit.mjs`, and prove the policy: a plain key with a valid signature
is refused, a touch without the PIN is refused, touch and PIN are accepted. The owner's real
key is never needed to run tests.

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
