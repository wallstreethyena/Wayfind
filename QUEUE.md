# Queue — one task per lane. Owner-only file.

A lane with an in-flight task receives NO new task, from anyone — including Cowork.
This rule was broken repeatedly on 2026-07-31: pane 3 was handed five different "#1
priorities" in one day (unified sheet, nowContext, share cards, metadataBase, audit fixes).
Each new instruction displaced the last, so the oldest never reached the front of the queue.

| Lane | Pane | Current task | Blocked on | Do not interrupt |
|---|---|---|---|---|
| claude.exe | 3 | OG fail-closed + /best-beaches soft-404 | — | **yes** |
| gwen | 4 | attraction card art wiring | — | no |
| llama | 5 | branch/lane hygiene (this change) | — | **yes** |
| deepseek | 6 | — | — | no |
| kimi | 8 | money-funnel traceability | — | no |
| gemini | 9 | — | — | no |

## Queued, not started
1. Moment-engine rollout — the `mood:true` flag + the `screen !== "experience"` gate in
   `app/home.js:4728`. Owner's #1 product priority. Goes to pane 3 when OG work lands.
2. Share-card v2 — blocked on the standards merge (see docs/share-card-standard.md).
