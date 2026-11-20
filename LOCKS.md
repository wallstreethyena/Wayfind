# File locks — owner-governed, lane-coordinated.

A branch modifying a path locked by a DIFFERENT lane fails the build.
Enforced by scripts/check-locks.mjs.

Lane protocol:
- A lane may propose adding, editing, or removing only its own lock rows.
- A lane that uses locks must work from `lane/<lane>/<task>`; the `<lane>` token must exactly match the lock row's lane field (case-insensitive).
- A lane may never delete or rewrite another lane's lock. Coordinate with that lane instead.
- Lock ownership is derived from the branch namespace, never a commit-author display name. There is no `gabriel` author-name bypass.
- Locks are a coordination guard against accidental cross-lane edits, not an authorization boundary; repository permissions remain the security boundary.

Format: `path | lane | ISO date | reason`
