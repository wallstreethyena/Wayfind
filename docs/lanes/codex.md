# Lane: codex

Only this lane writes to this file. See docs/lanes/README.md.

**Identity:** `codex (Wayfind lane) <codex@openai.com>` — the worktree-scoped `user.name` in
this clone. Confirmed by the owner 2026-08-05. Commit trailer is `Lane: codex (Wayfind lane)`.

> **Not registered in `docs/lanes/README.md` yet.** That table lists claude.exe, gwen, llama,
> deepseek, kimi and gemini — no `codex` row. Adding one means editing a shared file, which the
> one-file-per-lane rule forbids a lane from doing, so it is left for the owner.

## Current task
_(none)_

## Blocked on
**Owner adoption:** `docs/proposals/codex-effect-ordering-and-visibility-verification.md` — two
rules for `CLAUDE.md`. Not in force until an owner commit lands them in `CLAUDE.md`.

## Do not interrupt
no

## Recently landed
- **#590 — intro gate: 2 min of visible time, once per device ever** (merged 2026-08-05).
  Auto-show waits `INTRO_MIN_VISIBLE_MS` of `visibilityState === "visible"`; durable
  once-per-device flag in `lib/introGate.js` reusing `lib/deviceId.js`'s opt-out contract;
  `wf_value_seen` narrowed to "opened a place", with the weak "feed painted" signal moved to
  `wf_results_seen` so the giveaway prompt's reach is unchanged. New guard
  `scripts/check-intro-gate.mjs` (70 assertions; executes `lib/introGate.js` against stubbed
  storage rather than regexing it). All 32 mutations red-proven.
  - Carried a bug found only in a browser: the effect read `window.location.search`, which the
    `?q` strip had already cleared on returning devices — deep-link and **paid** visitors were
    served the gate anyway. The landing query is now captured during render. Invisible to all
    259 guards and to `next build`.
- **#593 — measurement plan + rule proposals** (merged 2026-08-05).

## Attribution correction (2026-08-05)

**#590 (`7376423`) and #593 (`ba48154`) are this lane's work but are trailered
`Lane: claude.exe (Wayfind lane)`. They should read `Lane: codex (Wayfind lane)`.**

How the mistake happened, since the convention exists precisely to prevent it: `CLAUDE.md:93`
says "This lane is `claude.exe (Wayfind lane)`", and `docs/lanes/` contained `claude-exe.md`
with no `codex.md`, so a Claude session running in this clone read that as its label — and
ignored the clone's own worktree `user.name`, which said `codex` all along. **The git identity
was right and the prose was wrong.** GitHub's squash makes the contradiction visible in both
commits: `Co-authored-by: codex (Wayfind lane) <codex@openai.com>` sits directly beneath a
`Lane: claude.exe` trailer.

It was caught only because a genuinely separate claude.exe lane merged #591 and #592 the same
evening with the same trailer — i.e. `git log --grep='Lane: claude.exe'` was returning two
different lanes' work under one label, which is the exact failure the trailer was introduced to
end.

**Not amended.** Both commits are on `main`; rewriting them means a force-push over shared
history, which costs more than the mislabel. Until they age out, read that grep with this note:

```
git log origin/main --grep='Lane: claude.exe'   # 7376423 and ba48154 are codex's, not claude.exe's
```

**Rule for anything running in this clone:** take the lane from
`git config --worktree user.name`, never from a prose line in a shared rules file. Prose does
not know which clone it is being read in; the worktree config does — that is the whole reason
the identity is set per worktree.

## Measurement owed
`docs/INTRO_GATE_MEASUREMENT_2026-08-05.md` — organic activation baseline **0.16** (Jul 28–31)
vs **0.04** post-gate. **D+7 read on 2026-08-12**, D+14 on 2026-08-19. Until that read, #590 is
a hypothesis, not a result. If organic activation reads **≤ 0.06** at D+7, the gate was not the
cause: stop iterating on it and find what else shipped in the 08-01/02 window.
