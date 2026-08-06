-- supabase/push-token-register.sql
--
-- APPLIED TO PRODUCTION 2026-08-05 (owner-directed), migration
-- `push_token_register_heartbeat_and_lockdown`. Nothing in the repo runs this
-- file; it is the reviewed source of truth for what is deployed.
--
-- ── WHAT WAS FOUND AT APPLY TIME, WHICH WAS NOT WHAT WAS EXPECTED ─────────
-- When PR #610 was written, device_push_tokens DID NOT EXIST -- measured, not
-- inferred (information_schema count 0), which is why every push registration
-- since the native shell shipped had failed silently inside a swallowing
-- try/catch.
--
-- By the time this was applied, an EARLIER VARIANT of the table and function
-- was already deployed by another hand. It was close but not this: it had NO
-- wf_job_pulse heartbeat (ticket 2c missing entirely), pinned search_path to
-- `public` without pg_temp, accepted tokens as short as 16 characters, and did
-- not btrim. Critically, `revoke all ... from anon, authenticated` had NEVER
-- been run -- anon and authenticated still held full INSERT/SELECT/UPDATE/
-- DELETE/TRUNCATE grants, so RLS-with-no-policies was the ONLY thing standing
-- between the public and a table of device tokens.
--
-- Applying this replaced that variant with the reviewed one.
--
-- ── VERIFIED BY CALLING IT, NOT BY "THE MIGRATION RAN" ────────────────────
--   register + re-register            -> 1 row, no duplicate, updated_at bumped
--   heartbeat                         -> one wf_job_pulse row per call, note=platform
--   short / null token, bad platform  -> all three RAISE; a valid call in the
--                                        same block still succeeded, so
--                                        "rejected" is not "broken for everything"
--   rejected calls                    -> wrote 0 rows
--   null device_id on re-register     -> existing device_id PRESERVED (coalesce)
--   as role anon: SELECT / INSERT / DELETE -> permission denied
--   as role anon: the RPC             -> allowed, which is the point
-- Every control row and test heartbeat was deleted afterwards; the table and
-- the push_register pulse count were both back to 0.
--
-- ── WHY AN RPC AND NOT JUST THE TABLE ─────────────────────────────────────
-- A directly-writable table needs an INSERT policy permissive enough for a
-- SIGNED-OUT device (tokens are collected pre-signup, which is most of the
-- value). "anon may insert rows" on a table holding device tokens and user ids
-- is a write surface anyone can spray. A SECURITY DEFINER function keeps the
-- table completely unwritable by anon and authenticated, and exposes exactly
-- one operation with the shape we want.
--
-- It also solves the heartbeat cleanly. wf_job_pulse is written by
-- lib/jobPulse.recordPulse using the SERVICE ROLE key, which a client
-- component cannot have. Putting the pulse inside the definer function means
-- one round trip, no new API route, and no service key anywhere near the
-- browser -- and "push registration is happening" becomes an observable fact
-- instead of an assumption.

begin;

-- ── 1. THE TABLE ──────────────────────────────────────────────────────────
create table if not exists public.device_push_tokens (
  token       text primary key,
  platform    text not null check (platform in ('ios', 'android')),
  -- Null for a signed-out device. device_id still identifies it, which is the
  -- point: re-engagement has to work before signup.
  user_id     uuid references auth.users (id) on delete cascade,
  device_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Sending reads by user (targeted) and by device (broadcast to signed-out).
create index if not exists device_push_tokens_user_idx   on public.device_push_tokens (user_id) where user_id is not null;
create index if not exists device_push_tokens_device_idx on public.device_push_tokens (device_id);

-- ── 2. LOCKED DOWN. NO POLICIES, ON PURPOSE. ─────────────────────────────
-- RLS on with zero policies means anon and authenticated see and write NOTHING
-- through PostgREST. The definer function below is the only door. The revokes
-- are belt and braces: RLS alone would still let a SELECT return zero rows and
-- confirm the table exists, and there is no reason to expose even that.
alter table public.device_push_tokens enable row level security;
revoke all on public.device_push_tokens from anon, authenticated;

-- ── 3. THE ONLY WRITE PATH ────────────────────────────────────────────────
create or replace function public.wf_register_push_token(
  p_token     text,
  p_platform  text,
  p_device_id text
)
returns void
language plpgsql
security definer
-- Pinned search_path. Without it, a definer function is exploitable by a
-- caller who can create objects in a schema that resolves earlier.
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tok text := btrim(coalesce(p_token, ''));
  v_dev text := nullif(btrim(coalesce(p_device_id, '')), '');
begin
  -- Validate rather than store junk. An APNs token is 64 hex chars today, but
  -- the length is not contractually fixed, so this is a sanity bound and not a
  -- format assertion.
  if length(v_tok) < 32 or length(v_tok) > 512 then
    raise exception 'wf_register_push_token: implausible token length %', length(v_tok);
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'wf_register_push_token: unsupported platform %', p_platform;
  end if;

  insert into public.device_push_tokens as t (token, platform, user_id, device_id, updated_at)
  values (v_tok, p_platform, v_uid, v_dev, now())
  on conflict (token) do update
    set platform   = excluded.platform,
        -- COALESCE, not assignment. A token re-registering while signed out
        -- arrives with a null user_id; overwriting would silently downgrade a
        -- targeted token to a broadcast one and lose the user association on
        -- every app launch before sign-in completes.
        user_id    = coalesce(excluded.user_id, t.user_id),
        device_id  = coalesce(excluded.device_id, t.device_id),
        updated_at = now();

  -- ── 4. THE HEARTBEAT ────────────────────────────────────────────────────
  -- "It ran" and "it accomplished something" are separate facts -- the premise
  -- lib/jobPulse.js opens with. Without this row, "zero push tokens" is
  -- indistinguishable between nobody granting permission, the client never
  -- calling, and this function erroring. Insert-only and fail-soft: a pulse
  -- that cannot be written must never fail the registration it is describing.
  begin
    insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
    values ('push_register', 1, 1, 0, p_platform);
  exception when others then
    null;
  end;
end;
$$;

-- Callable by signed-out devices too -- that is most of the value.
revoke all on function public.wf_register_push_token(text, text, text) from public;
grant execute on function public.wf_register_push_token(text, text, text) to anon, authenticated;

commit;

-- ── VERIFYING AFTER APPLYING ──────────────────────────────────────────────
-- Assert on the CALL, not on "the migration ran without error":
--
--   select public.wf_register_push_token(repeat('a', 64), 'ios', 'verify-control');
--   select token, platform, user_id, device_id from public.device_push_tokens
--    where device_id = 'verify-control';                    -- expect 1 row
--   select job, note, created_at from public.wf_job_pulse
--    where job = 'push_register' order by created_at desc limit 1;  -- expect 1 row
--   delete from public.device_push_tokens where device_id = 'verify-control';
--
-- And prove the lockdown, which is the half that fails open if it is wrong.
-- With the ANON key, this must return zero rows / permission denied:
--
--   select * from public.device_push_tokens limit 1;
