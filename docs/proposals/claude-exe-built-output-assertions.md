# Proposal — assertions about built output must scope to PRODUCTION chunks

- **Lane:** claude-exe (Wayfind lane)
- **Target file if adopted:** `CLAUDE.md`, alongside the other "the check ran and answered a
  question you were not asking" entries
- **Origin:** commit `c7faa767`, 2026-07-30. That commit wrote this straight into `CLAUDE.md`,
  which `check-doc-ownership` forbids a lane from doing. The rule is not in dispute; the
  filing was. Re-filed here 2026-07-31 and stripped from the branch history with the owner's
  explicit approval.
- **Status:** awaiting owner adoption. Not in force until it lands in `CLAUDE.md` under an
  owner commit.

## The rule, verbatim, ready to paste

### Assertions about built output must scope to PRODUCTION chunks

`.next/static/chunks/` retains artifacts from `next dev` runs. Those are **unminified**, so
every local identifier survives literally — which means a grep over that directory can
"find" a symbol that `next build` provably eliminates, or find 19 copies of a thing that
ships once.

Any assertion of the form "X does/does not appear in the built bundle" must first scope to
the production build's own chunk list, not the whole directory. Otherwise the check is
reading a different program than the one that ships, and the failure mode is the worst
kind: **the logic is sound and the input set is wrong**, so the result looks trustworthy
and re-reading the assertion tells you nothing.

Cheapest fixes, in order: `rm -rf .next` before a build you intend to assert on; read the
chunk names out of the build manifest rather than globbing; or assert against the served
HTML/JS from `next start`, which can only contain what shipped.

## Why it is worth adopting

It is the same family as the 2026-07-31 guard failures: a check that executes, returns a
truthful answer, and answers the wrong question. `check-guard-hermeticity` now covers one
member of that family (a guard reading the ambient shell); this covers another (a guard
reading the wrong input set). Neither is caught by re-reading the assertion, which is what
makes both expensive.
