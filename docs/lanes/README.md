# Lane state — one file per lane, never a shared file

## Why this directory exists

Measured 2026-07-31 across all 55 live branches: **29 conflicted when merged into `main`, and
11 of those 29 conflicts — 38% — were on coordination documents, not code.**

    AGENTS.md                    3 branches conflicting
    CLAUDE.md                    3
    docs/KIMI_QUEUE.md           3
    docs/DEEPSEEK_LANE_STATE.md  1
    docs/KIMI_REVENUE_MAP.md     1

The largest single source of merge pain in this repo was the paperwork describing the work,
not the work. `scripts/guards.txt` — which looked like the problem because 30 branches touch
it — caused **zero** conflicts, because it already carries `merge=union` in `.gitattributes`.
That was the right fix, applied on 2026-07-28. This directory applies the same thinking to
lane state, where `merge=union` would be wrong (unioning prose duplicates paragraphs).

## The rule

**A lane writes to exactly one file: `docs/lanes/<LANE>.md`. Nothing else.**

Two lanes can never conflict, because two lanes never touch the same file.

| Lane | Pane | Owns |
|---|---|---|
| claude.exe | 3 | `docs/lanes/claude-exe.md` |
| gwen | 4 | `docs/lanes/gwen.md` |
| llama | 5 | `docs/lanes/llama.md` |
| deepseek | 6 | `docs/lanes/deepseek.md` |
| kimi | 8 | `docs/lanes/kimi.md` |
| gemini | 9 | `docs/lanes/gemini.md` |

## Owner-only files — no agent commits to these

`AGENTS.md`, `CLAUDE.md`, `docs/*-standard.md`, `LOCKS.md`, `QUEUE.md`.

These define the rules. Rules cannot stabilise while they are a merge target — six versions of
`AGENTS.md` existed simultaneously on 2026-07-31, and whichever merged last silently
overwrote the rest.

To propose a rule change, write `docs/proposals/<lane>-<topic>.md` and say so in your lane
file. The owner merges it. Enforced by `scripts/check-doc-ownership.mjs`.

## Migration

`docs/KIMI_QUEUE.md`, `docs/DEEPSEEK_LANE_STATE.md`, `docs/KIMI_REVENUE_MAP.md` are superseded
by the per-lane files here. Land or drop the branches still holding them, then stop writing to
them.
