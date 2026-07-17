# RLS Apply Steps — closing S1 / S3 / S6

Static verification of `supabase/DRAFT-rls-fixes.sql` against the live schema
sources in this repo, plus a copy-pasteable dashboard runbook for the owner.
Read-only review; the owner performs the apply.

---

## 1. Verdict — does `DRAFT-rls-fixes.sql` close S1 / S3 / S6?

| Exposure | Draft coverage | Status |
|---|---|---|
| **S1** `saved_places`, `likes` world-readable | drops the permissive policy by exact name + creates owner-only read | **Closed** |
| **S1** `profiles`, `follows` world-readable | **not touched at all** | **NOT closed** (residual leak — see below) |
| **S3** `events` insert `with check (true)` | drops both known permissive policy names + binds `user_id` to caller | **Closed** (one behavioural caveat) |
| **S6** `shared_lists` unauth insert, no size cap | adds 16 KB payload size cap | **Partial** — size capped; open insert + no rate cap remain (both by design / not RLS-expressible) |
| **S5** `/api/auth/confirm` | not covered (it is a route, not RLS) | **Out of scope — correct** |

### S1 — `saved_places` + `likes`: closed correctly (the OR-semantics trap is handled)
- `DRAFT-rls-fixes.sql:16` `drop policy if exists "saved are public"` then `:17-18` `create policy "own saved read" ... using (auth.uid() = user_id)`.
- `DRAFT-rls-fixes.sql:20` `drop policy if exists "likes are public"` then `:21-22` `create policy "own likes read" ... using (auth.uid() = user_id)`.

The permissive policies live **only** in the root `supabase-schema.sql`
(`"saved are public"` at line 48, `"likes are public"` at line 31). The draft
drops them **by their exact name**, so the Postgres "policies are OR'd together"
trap is avoided — you cannot leave a `using (true)` policy alive next to a new
owner-only one. This is the correct fix.

No app feature breaks: every client read of these tables filters by the caller
(`app/home.js:3447/3457/3461/3463/3465` all `.eq("user_id", user.id)`), and the
community like-count aggregate runs server-side under the **service-role key**,
which bypasses RLS (`app/api/signals/likes/route.js:21,34` — its own comment says
RLS is *meant* to hide member likes from other clients). Owner-only is the
intended end state, not a regression.

### S1 — `profiles` + `follows`: **the draft does not address these**
- The permissive reads `"profiles are public"` (`supabase-schema.sql:15`) and
  `"follows are public"` (`supabase-schema.sql:62`) are **never dropped** by the draft.
- These tables exist **only if the root `supabase-schema.sql` was applied**;
  the canonical `supabase/schema.sql` does not define them. The app code
  references neither table (grep for `profiles`/`follows` across `app/`, `lib/`
  returns nothing).
- Concrete residual leak: the signup trigger `handle_new_user()`
  (`supabase-schema.sql:68-81`) auto-inserts a `profiles` row whose
  `display_name` defaults to `split_part(new.email,'@',1)` — i.e. the **email
  local-part** of every signed-up user. Under `"profiles are public"` that is
  world-readable via the anon key. `follows` is likely empty (the app never
  writes it) but is also world-readable.
- **Owner decision, low-risk to close:** since no shipped feature reads another
  user's profile or follow graph, dropping these public-read policies has zero
  functional impact and closes the leak. The hardened block in §4 includes them,
  gated on the STEP-0 check actually showing those rows.

### S3 — `events` insert: closed, with one behavioural caveat
- `DRAFT-rls-fixes.sql:29-30` drop **both** insert-policy names that exist in the
  repo — `"events_insert_anon"` (from root `events.sql:29`) and `"insert any
  event"` (from canonical `supabase/schema.sql:28`). `:31-33` recreate anon
  insert scoped to `with check (user_id is null)`; `:34-36` add an authenticated
  insert scoped to `with check (user_id = auth.uid())`. Forged `user_id` is no
  longer possible.
- **Caveat (not a user-facing break):** `logEventAnon()` (`app/home.js:325-337`,
  4 call sites) **always** sends `user_id: null`. For a *signed-in* visitor the
  browser client uses the `authenticated` role, so only the new
  `events_insert_auth` policy applies, and `null = auth.uid()` is false → that
  insert is **rejected**. Because the insert is fire-and-forget
  (`.then(()=>{}, ()=>{})`), nothing visible breaks, but those analytics rows are
  silently dropped for logged-in users. `logEvent()` (`app/home.js:3849-3864`)
  correctly sets `user_id: user ? user.id : null` and is fully compatible.
  Optional follow-up: have `logEventAnon` stamp `user_id` when a session exists,
  **or** add an authenticated branch allowing `user_id is null`.

### S6 — `shared_lists`: size cap only
- `DRAFT-rls-fixes.sql:60-62` add `shared_lists_payload_size_chk` (`pg_column_size(payload) <= 16384`).
  This is the flood/oversize guard. It works whether `payload` is `text`
  (root schemas) or `jsonb` (canonical `supabase/schema.sql:64`).
- **Not addressed (by design / not expressible as a table constraint):** the
  insert remains open to anon — that is intentional (anonymous share links) — and
  there is **no rate limit**. Rate limiting cannot be done in RLS/CHECK; it needs
  an app-side or edge throttle. Flag as a known residual for S6.

### Bonus hardening in the draft (not part of S1/S3/S6)
- **M2** `events` payload caps — `DRAFT-rls-fixes.sql:45-49` (`meta <= 2048 B`, `place_name <= 200`).
- **M3** `comments` content caps — `DRAFT-rls-fixes.sql:54-57` (`body <= 600`, `author <= 40`, `rating between 1 and 5`). Columns exist (`supabase/comments.sql:7-10`).
- Lines `64-67` are a code-side note only (Vercel `CRON_SECRET`) — no SQL.

---

## 2. Idempotency & validity verdict

**Validity: sound. Idempotency: NO — this is a one-shot script that can HALT partway.**

### Validity
- All column/table references resolve (`events.meta`, `events.place_name`,
  `comments.body/author/rating`, `shared_lists.payload`).
- It does **not** lock out legitimate app access (verified in §1: client reads
  are owner-scoped; the aggregate uses the service role).

### Idempotency — the important failure mode
`drop policy if exists` (lines 16, 20, 29, 30) is safely repeatable. Everything
else is **not**, and the consequence is worse than an annoying re-run error:

**The Supabase SQL editor stops at the first error.** If an early statement
throws, every statement **after** it is skipped. Concretely:

- `create policy "own saved read"` (`:17-18`) and `"own likes read"` (`:21-22`)
  have **no preceding `drop policy if exists` for their own name**. They throw
  *"policy already exists"* if (a) the canonical `supabase/schema.sql` is live
  (it already defines those exact names at lines 41/56), or (b) the script is
  re-run. If line 17 throws, then **H2 (S3), M2, M3, and L2 (S6) never run** —
  the owner sees one benign-looking error and S3 + S6 stay open. This is the
  single most important reason to use the hardened block in §4.
- `create policy "events_insert_auth"` (`:34-36`) also has no drop guard → throws on re-run.
  (`events_insert_anon` at `:31` *is* dropped first at `:29`, so only that one is safe.)
- The three `alter table ... add constraint` blocks (`:45-49`, `:54-57`, `:60-62`)
  use plain `ADD CONSTRAINT`. Postgres has **no `ADD CONSTRAINT IF NOT EXISTS`**,
  so each throws *"constraint already exists"* on re-run, **and** each validates
  existing rows on first run — if any current row violates the cap
  (a `comments.body > 600`, a `meta > 2 KB`, a `payload > 16 KB`) the `ALTER`
  fails and halts the script.

**Do not assume rollback-on-error.** Rather than rely on the editor's default
transaction behaviour (which varies), wrap the whole paste in `begin; … commit;`
so it is all-or-nothing (see §3c). Use the hardened, fully-idempotent statements
in §4 instead of pasting the raw draft.

---

## 3. Owner runbook (Supabase dashboard)

### (a) CHECK — what is actually live (this is the source of truth, not the .sql files)
Dashboard → **SQL Editor** → **New query** → run:

```sql
-- Which tables have RLS on, and every policy with its USING/CHECK expression
select tablename, rowsecurity
  from pg_tables where schemaname = 'public' order by tablename;

select tablename, policyname, cmd, roles, qual as using_expr, with_check
  from pg_policies where schemaname = 'public'
  order by tablename, cmd, policyname;
```

**A bad row looks like this** — a `select`/`ALL` policy on a sensitive table
whose `using_expr` is literally `true`:

| tablename | policyname | cmd | using_expr |
|---|---|---|---|
| saved_places | saved are public | SELECT | `true`  ← **leak** |
| likes | likes are public | SELECT | `true`  ← **leak** |
| profiles | profiles are public | SELECT | `true`  ← **leak (PII)** |
| follows | follows are public | SELECT | `true`  ← leak |
| events | insert any event / events_insert_anon | INSERT | (with_check = `true`) ← **forgeable** |

Also use this output to answer three things before applying:
1. **Which schema is live** — if `saved_places`/`likes` already show
   `auth.uid() = user_id`, S1 for those two is already closed; if they show
   `true`, apply is needed.
2. **Whether `profiles`/`follows` exist at all** (they only exist under the root
   schema) — decide whether to include the §4 lines that close them.
3. **Any policy name not covered by the drops** — if an `events` INSERT policy,
   or a `saved_places`/`likes`/`profiles`/`follows` SELECT policy, appears under
   a name created directly in the dashboard (so it is in **no** repo file), add a
   matching `drop policy if exists "<that name>" on public.<table>;` to your paste.
   Static analysis cannot see dashboard-created policies — this query can.

### (b) BACK UP current policies
Save the full output of the second query above (copy the grid, or run it and
**Export → CSV**) into a note. This is your revert reference — it records every
policy name + expression as it stood before the change.

Also pre-check for existing rows that would make the new CHECK constraints fail:

```sql
select max(char_length(body))          as max_body   from public.comments;      -- must be <= 600
select max(char_length(author))        as max_author from public.comments;      -- must be <= 40
select min(rating), max(rating)        from public.comments;                    -- ratings must be within 1..5 (nulls ok)
select max(pg_column_size(meta))       as max_meta   from public.events;        -- must be <= 2048
select max(char_length(place_name))    as max_pname  from public.events;        -- must be <= 200
select max(pg_column_size(payload))    as max_payload from public.shared_lists; -- must be <= 16384
```

If any max exceeds its cap, either raise that cap in §4 or clean the offending
rows first — otherwise the `ALTER` will halt the script.

### (c) APPLY
Paste the **hardened block from §4** (preferred) — not the raw draft — into a new
SQL Editor query and **Run**. It is wrapped in `begin; … commit;` so a failure on
any line rolls the whole thing back rather than leaving a half-applied state.

> If you insist on pasting `supabase/DRAFT-rls-fixes.sql` verbatim: run it exactly
> **once**, and if it errors on *"policy already exists"* on `own saved read` /
> `own likes read`, that means the canonical safe schema is already live for those
> tables — but the error will have **skipped H2/M2/M3/L2**, so you must still run
> the remaining sections. The §4 block avoids this entirely.

### (d) VERIFY
Re-run the STEP-0 policy query from (a). Confirm:

```sql
-- No sensitive SELECT policy is USING(true) anymore. Expect ZERO rows:
select tablename, policyname, cmd, qual
  from pg_policies
  where schemaname = 'public'
    and cmd = 'SELECT'
    and qual = 'true'
    and tablename in ('saved_places','likes','profiles','follows');

-- events INSERT is now scoped (expect user_id-based checks, no bare 'true'):
select policyname, roles, with_check
  from pg_policies where schemaname='public' and tablename='events' and cmd='INSERT';

-- constraints landed:
select conname from pg_constraint
  where conrelid in ('public.events'::regclass,'public.comments'::regclass,'public.shared_lists'::regclass)
    and contype = 'c';
```

Optional live proof with the **anon** key (not service role): sign in as user A,
`select * from likes` / `saved_places` — you should see only A's rows; a query
for another user's `user_id` must return **0 rows**. Under the old policy it
returned everyone's.

### (e) ROLLBACK
The owner-only policies are the **correct end state**, so a rollback should only
be needed if a feature legitimately needs broader read. To revert a specific
table to its prior policy, drop the new one and recreate what your (b) backup
recorded, e.g.:

```sql
-- revert saved_places read to the previous (permissive) policy — ONLY if required
drop policy if exists "own saved read" on public.saved_places;
create policy "saved are public" on public.saved_places for select using (true);
```

**Before reverting, confirm the feature actually needs cross-user read.** Based on
this review, none does: all client reads are owner-scoped and the like aggregate
uses the service role. The one thing to watch after apply is signed-in
`logEventAnon` inserts silently failing (S3 caveat above) — that is analytics
loss, not a user-facing break, and is fixed in code, not by reverting RLS.

---

## 4. Hardened, idempotent replacement to paste (recommended over the raw draft)

Fully re-runnable, all-or-nothing, and it closes the `profiles`/`follows` gap.
Delete the two `profiles`/`follows` lines if STEP-0 showed those tables/policies
do not exist. This **replaces** `DRAFT-rls-fixes.sql:17-18, 21-22, 31-36,
45-49, 54-57, 60-62` with drop-guarded equivalents.

```sql
begin;

-- ── S1: saved_places / likes owner-only reads (replaces draft :16-22) ──
drop policy if exists "saved are public" on public.saved_places;
drop policy if exists "own saved read"   on public.saved_places;
create policy "own saved read" on public.saved_places
  for select using (auth.uid() = user_id);

drop policy if exists "likes are public" on public.likes;
drop policy if exists "own likes read"   on public.likes;
create policy "own likes read" on public.likes
  for select using (auth.uid() = user_id);

-- ── S1 gap: profiles / follows (only if STEP-0 showed a public-read row) ──
-- No shipped feature reads other users' profiles/follows, so this is zero-impact.
-- Re-add a scoped public-read policy later if you ship public profiles.
drop policy if exists "profiles are public" on public.profiles;
drop policy if exists "follows are public"  on public.follows;

-- ── S3: events insert bound to the caller (replaces draft :29-36) ──
drop policy if exists "events_insert_anon" on public.events;
drop policy if exists "insert any event"   on public.events;
drop policy if exists "events_insert_auth" on public.events;
create policy "events_insert_anon" on public.events
  for insert to anon          with check (user_id is null);
create policy "events_insert_auth" on public.events
  for insert to authenticated with check (user_id = auth.uid());

-- ── M2: events payload caps (replaces draft :45-49) ──
alter table public.events drop constraint if exists events_meta_size_chk;
alter table public.events drop constraint if exists events_placename_len_chk;
alter table public.events
  add constraint events_meta_size_chk
    check (meta is null or pg_column_size(meta) <= 2048),
  add constraint events_placename_len_chk
    check (place_name is null or char_length(place_name) <= 200);

-- ── M3: comments content caps (replaces draft :54-57) ──
alter table public.comments drop constraint if exists comments_body_len_chk;
alter table public.comments drop constraint if exists comments_author_len_chk;
alter table public.comments drop constraint if exists comments_rating_chk;
alter table public.comments
  add constraint comments_body_len_chk   check (char_length(body) <= 600),
  add constraint comments_author_len_chk check (author is null or char_length(author) <= 40),
  add constraint comments_rating_chk     check (rating is null or rating between 1 and 5);

-- ── S6: shared_lists payload size cap (replaces draft :60-62) ──
alter table public.shared_lists drop constraint if exists shared_lists_payload_size_chk;
alter table public.shared_lists
  add constraint shared_lists_payload_size_chk
    check (pg_column_size(payload) <= 16384);

commit;
```

Run the STEP-0 pre-checks in §3b first; if any existing row exceeds a cap, this
transaction will roll back cleanly (no partial state) and you can fix the data or
raise that cap before re-running.

### What this still does NOT cover (track separately)
- **S5** `/api/auth/confirm` — a route, fixed in code, not RLS.
- **S6 rate limiting** — needs an app/edge throttle; not expressible as a constraint.
- **`logEventAnon` under a signed-in session** — analytics rows silently dropped;
  fix in `app/home.js`, not in SQL.
- **The giveaway draw trusting a client-writable `events` table** — the draft's
  own note (`:37-39`) recommends a server-stamped source (SECURITY DEFINER RPC)
  long-term.
