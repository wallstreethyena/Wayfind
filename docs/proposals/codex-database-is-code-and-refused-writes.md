# Proposal — the database is code, and a refused write is not a failed write

- **Lane:** codex (Wayfind lane)
- **Target file if adopted:** `AGENTS.md`, appended as §13 (never inserted — §5's renumbering
  broke every `§N` citation written before it)
- **Origin:** the 2026-08-25 exposure pass. Four holes were found that the previous four
  hardening passes had each already closed once. The mechanism is shipped and green
  (`check-schema-watch`, `check-client-writes-have-policies`, `check-writes-fail-loudly`,
  `wf_schema_audit()` on the `/api/cron/schema-watch` cron); only the written rule is
  awaiting adoption. Filed here rather than written into `AGENTS.md` directly, which
  `check-doc-ownership` forbids a lane from doing.
- **Status:** awaiting owner adoption. Not in force until it lands in `AGENTS.md` under an
  owner commit — though the guards enforce it either way.

## The rule, verbatim, ready to paste

### 13. The database is code. A refused write is not a failed write.

**13a. A new object in `public` is private. Exposure is a written line.**
Supabase's `ALTER DEFAULT PRIVILEGES` used to grant `anon` and `authenticated` ALL on every
new table and EXECUTE on every new function. That is why `security_hardening_v1..v4` each
fixed the objects that existed and the next migration created new ones born wide open. The
default is fixed for role `postgres`; the consequence is that every migration must now say
what it opens:

```sql
grant select on public.<table> to anon, authenticated;      -- plus an RLS policy
grant execute on function public.<fn>(<args>) to anon, authenticated;
```

**13b. Revoking from `anon` does nothing while `PUBLIC` holds the grant.**
Postgres grants EXECUTE to PUBLIC on every new function and `anon` inherits it. Always
`revoke ... from public, anon, authenticated`. Related: a revoke issued by a role that did
not grant it is a **silent no-op** — it reports success and changes nothing (this is why the
`net.*` lockdown in the same pass did not take). Assert the privilege is actually gone
afterwards. Applying is not fixing, the same way merging is not applying.

**13c. Verify as the attacker, not as the owner.** `has_table_privilege()` in a superuser
session is an opinion. A `curl` with the real publishable key is the answer. Test the control
as well as the happy path — `wf_gate_status` must answer `alert` for Fairbanks, not just
`live` for Parrish.

**13d. A refused write does not throw.** supabase-js returns `{ error }` on a *resolved*
promise, so `try/catch` cannot see an RLS or permission refusal. Two bugs lived here for
weeks because of it: nobody could delete their own comment, and signed-in visitors were told
"You're on the list" while the `wf_waitlist` insert was rejected — a lost email and a lost
vote on which metro gets built next, every time. **A catch may not claim the success its try
claims.** Silence is fine for telemetry; lying to a human is not.

## Why a cron and not only a guard

129 migrations are applied to this project and 10 exist as files in the repo. The schema is
the one part of Wayfind that never passes through a commit, and `check-guard-hermeticity`
rightly forbids a guard from holding a live credential. So the split is deliberate: the
guards lock the shapes in the repo, and `wf_schema_audit()` checks the live invariants from
inside the database on a cron.
