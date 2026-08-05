# Lane: claude-exe

Only this lane writes to this file. See docs/lanes/README.md.

## Current task
_(none)_ — PR #590 is open and owner-gated on merge.

## Blocked on
**Owner decision: merge PR #590** (`fix/intro-gate-2min-once-ever`). 259/259 guards green,
`check:jsx` clean, `next build` clean, Vercel preview green, PR state `MERGEABLE / CLEAN`.

Merge with `gh pr merge 590 --squash --delete-branch`, from a real branch that is **not** #590's
own (`--delete-branch` fails silently from a detached HEAD, *after* the merge lands), and keep
the **default** squash body — passing `--body` drops the `Lane:` trailer.

**Also awaiting owner adoption:** `docs/proposals/claude-exe-effect-ordering-and-visibility-verification.md`
(two rules for `CLAUDE.md`). Not in force until an owner commit lands them.

## Do not interrupt
no

## Recently landed
- **PR #590 — intro gate: 2 min of visible time, once per device ever** (open, not merged).
  Auto-show waits `INTRO_MIN_VISIBLE_MS` of `visibilityState === "visible"`; durable
  once-per-device flag in `lib/introGate.js` reusing `lib/deviceId.js`'s opt-out contract;
  `wf_value_seen` narrowed to "opened a place" with the weak signal moved to `wf_results_seen`
  so the giveaway's reach is unchanged. New guard `check-intro-gate.mjs` (70 assertions,
  executes the helper against stubbed storage). All 32 mutations red-proven.
  - **Carried a real bug fix found only in the browser:** the effect read
    `window.location.search`, which the `?q` strip had already cleared on returning devices —
    deep-link and **paid** visitors were served the gate anyway. Landing query is now captured
    during render. Invisible to all 259 guards and to `next build`.

## Open questions for the owner
- **Lane identity mismatch.** This clone's worktree-scoped git identity is
  `codex (Wayfind lane) <codex@openai.com>`, but `CLAUDE.md:93` says "This lane is
  `claude.exe (Wayfind lane)`", and `docs/lanes/` has `claude-exe.md` with no `codex.md`.
  PR #590's commit is therefore **authored `codex` but trailered `Lane: claude.exe`**. The
  evidence favours `claude.exe` being correct and the git config being the anomaly, but this is
  an attribution question and `CLAUDE.md` says those get answered from evidence, not assumption.
  Fixing the config is one line; amending the pushed commit would be a force-push. Owner's call.

## Measurement owed
`docs/INTRO_GATE_MEASUREMENT_2026-08-05.md` — organic activation baseline **0.16** (Jul 28–31)
vs **0.04** now. **D+7 read on 2026-08-12**, D+14 on 2026-08-19. Until that read, #590 is a
hypothesis, not a result.
