# Proposal — §6b: the fail-closed property must live at the DECISION POINT, not the wrapper

- **Lane:** claude-exe (Wayfind lane)
- **Target file if adopted:** `AGENTS.md`, as §6b
- **Origin:** commit `823ebf7`, 2026-07-30. That commit wrote this into `AGENTS.md`, which
  `check-doc-ownership` forbids a lane from doing. Re-filed here 2026-07-31 and stripped from
  the branch history with the owner's explicit approval. The code changes in `823ebf7` are
  unaffected.
- **Status:** awaiting owner adoption. Not in force until it lands in `AGENTS.md` under an
  owner commit.

## The rule, verbatim, ready to paste

## 6b. The fail-closed property must live at the DECISION POINT, not the wrapper

A guard placed on a wrapper whose callers can bypass it does not protect anything — it
only stops reporting. **That is strictly worse than no guard, because it converts a known
gap into a believed-safe one.**

The instance, 2026-07-30. `Aff.viatorDirectUrl()` returned the bare viator.com URL when
`NEXT_PUBLIC_VIATOR_PID` was unset — a working, unattributed link, the same shape as the
VRBO leak. The obvious fix was to make the wrapper return `null`. It would have been a
false green: **six call sites write `Aff.viatorDirectUrl(x) || x`**, so the raw URL renders
regardless. Only the guard would have gone quiet. The real fail-closed points are
`ticketsUrl()` and `experienceSearchUrl()`, which decide *whether a monetized link exists
at all*.

Before trusting a fix or a guard, ask:

- **who calls this, and can the caller undo it?** `grep` the call sites. `|| fallback`,
  `?? fallback`, and `try/catch { return raw }` all undo a fail-closed return.
- **is this thing a decision or a transform?** A transform (wrapper, formatter, tracker)
  cannot be the enforcement point, because its output is optional to its callers. Enforce
  where the answer "should this render at all?" is produced.
- **would the guard still fail if I bypassed the wrapper?** If not, the guard is pinned to
  the wrong line.

Same family as §4's "did it run" and the role-vs-substring rule in CLAUDE.md: the check
executes, returns a truthful answer, and answers the wrong question.

## One correction to the origin commit's account

`823ebf7` wrote this rule and then, in the same commit, broke it in the other direction on
`app/components/BookingCTA.js`. Closing the `|| raw` fallback there was correct; deleting
the `commerceHref()` branch beside it was not in scope and un-shipped #538 for the tour
list — the server redirect that resolves the destination from `wf_experiences` so no
partner URL is trusted from the request. It also deleted `offerId` while three lines below
still read it, which is a `ReferenceError` on every render of that list.

Restored 2026-07-31: product code first (server-resolved), the tracked direct link only
when there is no code, and nothing at all when neither is attributable — which is §6b
applied, not merely written down. Worth keeping attached to the rule, because the commit
that authored it is the commit that shows how easily it is violated while quoting it.
