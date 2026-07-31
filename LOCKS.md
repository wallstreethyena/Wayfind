# File locks — owner-only file.

A branch modifying a path locked by a DIFFERENT lane fails the build.
Enforced by scripts/check-locks.mjs.

Format: `path | lane | ISO date | reason`

app/home.js | claude.exe | 2026-07-31 | 10-way contested; 6 abandoned rescue/wf-* branches sit on it
