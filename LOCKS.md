# File locks — owner-only file.

A branch modifying a path locked by a DIFFERENT lane fails the build.
Enforced by scripts/check-locks.mjs.

Format: `path | lane | ISO date | reason`

