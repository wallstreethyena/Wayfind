-- PROPOSAL ONLY (2026-10-08). Deliberately NOT under supabase/migrations: nothing applies this.
-- Postgres twin of lib/atlasBudgetFileLedger.js: an enforceable dollar budget for the Atlas writer.
-- Reasons returned match the JS ledger: no_budget, halted, duplicate_attempt_key, active_place,
-- over_ceiling, unknown_price_version, invalid_bound.
--
-- Invariant (inside wf_ai_reserve, serialised by SELECT ... FOR UPDATE on every budget row of the scope):
--   settled(this period) + sum(reserved_micro_usd of reserved|dispatched|unresolved, ANY period) + new bound <= ceiling
-- Overrun (settled > reserved) is recorded in full and halts the whole scope until wf_ai_clear_halt().
--
-- CALLER CONTRACT (the application MUST follow this; the database cannot know whether a provider call happened):
--   0. wf_ai_can_spend(scope) is a cheap pre-check only (false when halted or no budget). wf_ai_reserve is the gate.
--   1. wf_ai_reserve(...)  -> {ok:true} (or {ok:true, already:true} for an identical retry of a still-open attempt).
--                             Anything else, or ANY error/timeout: do NOT call the provider.
--   2. wf_ai_dispatch(key) -> BEFORE sending the request. If dispatch fails, the provider was not called; the row stays
--                             'reserved' and still counts. wf_ai_release(key) is legal only from 'reserved'.
--   3. send the provider request.
--   4a. wf_ai_settle(key, cost_from_provider_usage, usage, request_id) when usage is known, or
--   4b. wf_ai_unresolve(key, reason) on ANY ambiguity (timeout, crash, missing/invalid usage, settle error).
--       Never release after dispatch: the provider may have charged. 'unresolved' keeps counting the full bound
--       until an operator runs wf_ai_reconcile(key, real_billed_amount, reason).
--   Retries: settle/reconcile with the SAME amount on an already settled attempt are no-ops (already:true); a DIFFERENT
--   amount raises. release on a released row, unresolve on an unresolved row: no-ops. dispatch is NOT idempotent
--   (a second dispatch raises, so a retried sender cannot double-send).
--   Fail closed: every function runs as one statement/transaction, so any exception rolls the attempt back to its
--   previous state ('dispatched' or 'unresolved'), which still counts its FULL reserved bound. A caller that cannot
--   tell whether settle committed must retry it with the same amount or call wf_ai_unresolve; it must never release.
--   Periods: an attempt is charged to the period it was reserved in, even if settled after the next period starts.
--   Release is the only refund and frees exactly that attempt's reserved bound; no function touches another
--   period's figures. In-flight (reserved|dispatched|unresolved) rows of ANY period count against new reservations.
--   Halting: a settle/reconcile above the reserved bound, or leaving (settled + still-open bounds) of the attempt's
--   own period above that period's ceiling, halts the scope until an operator calls wf_ai_clear_halt(scope).

create table if not exists wf_ai_budget (
  scope              text   not null,
  period             text   not null,            -- e.g. 'pilot-2026-10' or '2026-10' (America/New_York month)
  ceiling_micro_usd  bigint not null check (ceiling_micro_usd >= 0),
  halted             boolean not null default false,
  created_at         timestamptz not null default now(),
  primary key (scope, period)
);

create table if not exists wf_ai_spend (
  attempt_key         text primary key,
  scope               text   not null,
  period              text   not null,
  place_id            text   not null,
  model               text   not null,
  price_version       text   not null,
  state               text   not null check (state in ('reserved','dispatched','settled','unresolved','released')),
  reserved_micro_usd  bigint not null check (reserved_micro_usd >= 0),
  settled_micro_usd   bigint check (settled_micro_usd >= 0),
  usage               jsonb,
  request_id          text,
  reason              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (scope, period) references wf_ai_budget (scope, period)
);

-- one active (reserved|dispatched) attempt per place per scope
create unique index if not exists wf_ai_spend_one_active_per_place
  on wf_ai_spend (scope, place_id) where state in ('reserved','dispatched');
create index if not exists wf_ai_spend_scope_state on wf_ai_spend (scope, state);

alter table wf_ai_budget enable row level security;
alter table wf_ai_spend  enable row level security;
-- No policies: anon/authenticated see nothing. Only service_role (bypasses RLS) and the SECURITY DEFINER functions touch these.

-- Internal helpers: never callable by API roles (see the GRANT block at the end).
create or replace function wf_ai__lock_scope(p_scope text) returns void
language sql security definer set search_path = public, pg_temp as $$
  select 1 from wf_ai_budget where scope = p_scope order by period for update;
$$;

-- Locks the scope first (same order as wf_ai_reserve), then the attempt row. Raises if unknown.
create or replace function wf_ai__lock_attempt(p_key text)
returns wf_ai_spend language plpgsql security definer set search_path = public, pg_temp as $$
declare r wf_ai_spend; v_scope text;
begin
  select scope into v_scope from wf_ai_spend where attempt_key = p_key;
  if not found then raise exception 'unknown attempt %', p_key using errcode = 'P0002'; end if;
  perform wf_ai__lock_scope(v_scope);
  select * into r from wf_ai_spend where attempt_key = p_key for update;
  return r;
end $$;

-- Validates a settlement amount: NULL, negative, NaN or fractional values raise (never coerced to 0).
create or replace function wf_ai__check_amount(p_settled numeric) returns void
language plpgsql immutable security definer set search_path = public, pg_temp as $$
begin
  if p_settled is null or p_settled = 'NaN'::numeric or p_settled < 0 or p_settled <> trunc(p_settled) then
    raise exception 'settled amount must be a non-negative integer (got %)', p_settled using errcode = 'P0001';
  end if;
end $$;

-- Halts the scope if this attempt's own period is over its ceiling:
--   settled(period) + open bounds (reserved|dispatched|unresolved) of that period > ceiling(period).
create or replace function wf_ai__halt_if_over_ceiling(p_scope text, p_period text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ceiling bigint; v_total numeric;
begin
  select ceiling_micro_usd into v_ceiling from wf_ai_budget where scope = p_scope and period = p_period;
  select coalesce(sum(case when state = 'settled' then settled_micro_usd
                           when state in ('reserved','dispatched','unresolved') then reserved_micro_usd else 0 end), 0)
    into v_total from wf_ai_spend where scope = p_scope and period = p_period;
  if v_total > v_ceiling then
    update wf_ai_budget set halted = true where scope = p_scope;
    return true;
  end if;
  return false;
end $$;

create or replace function wf_ai_reserve(
  p_attempt_key text, p_scope text, p_period text, p_place_id text,
  p_model text, p_price_version text, p_bound bigint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ceiling bigint; v_committed bigint; v_row wf_ai_spend;
begin
  if p_price_version is null or p_price_version <> all (array['anthropic-std-2026-10-08']) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_price_version');
  end if;
  if p_bound is null or p_bound < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_bound');
  end if;
  perform wf_ai__lock_scope(p_scope);
  select ceiling_micro_usd into v_ceiling from wf_ai_budget where scope = p_scope and period = p_period;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_budget'); end if;
  if exists (select 1 from wf_ai_budget where scope = p_scope and halted) then
    return jsonb_build_object('ok', false, 'reason', 'halted');
  end if;
  select * into v_row from wf_ai_spend where attempt_key = p_attempt_key;
  if found then
    -- Identical retry of a still-open attempt is idempotent. Anything else fails closed.
    if v_row.state in ('reserved','dispatched')
       and v_row.scope = p_scope and v_row.period = p_period and v_row.place_id = p_place_id
       and v_row.model = p_model and v_row.price_version = p_price_version
       and v_row.reserved_micro_usd = p_bound then
      return jsonb_build_object('ok', true, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'duplicate_attempt_key');
  end if;
  if exists (select 1 from wf_ai_spend where scope = p_scope and place_id = p_place_id and state in ('reserved','dispatched')) then
    return jsonb_build_object('ok', false, 'reason', 'active_place');
  end if;
  select coalesce(sum(case
           when state = 'settled' and period = p_period then settled_micro_usd
           when state in ('reserved','dispatched','unresolved') then reserved_micro_usd
           else 0 end), 0)
    into v_committed from wf_ai_spend where scope = p_scope;
  if v_committed + p_bound > v_ceiling then
    return jsonb_build_object('ok', false, 'reason', 'over_ceiling', 'committed', v_committed);
  end if;
  insert into wf_ai_spend (attempt_key, scope, period, place_id, model, price_version, state, reserved_micro_usd)
  values (p_attempt_key, p_scope, p_period, p_place_id, p_model, p_price_version, 'reserved', p_bound);
  return jsonb_build_object('ok', true);
end $$;

-- Transition helper: raises on illegal moves (release after dispatch is an error, as in JS).
create or replace function wf_ai__move(p_key text, p_from text[], p_to text, p_reason text)
returns wf_ai_spend language plpgsql security definer set search_path = public, pg_temp as $$
declare r wf_ai_spend;
begin
  r := wf_ai__lock_attempt(p_key);
  if not (r.state = any (p_from)) then
    raise exception 'illegal transition: % -> % (allowed from %)', r.state, p_to, p_from using errcode = 'P0001';
  end if;
  update wf_ai_spend set state = p_to, reason = coalesce(p_reason, reason), updated_at = now()
   where attempt_key = p_key returning * into r;
  return r;
end $$;

create or replace function wf_ai_dispatch(p_key text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform wf_ai__move(p_key, array['reserved'], 'dispatched', null); end $$;

-- The only refund. Legal from 'reserved' only; a retry on an already released row is a no-op success.
create or replace function wf_ai_release(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r wf_ai_spend;
begin
  r := wf_ai__lock_attempt(p_key);
  if r.state = 'released' then return jsonb_build_object('ok', true, 'already', true); end if;
  if r.state <> 'reserved' then
    raise exception 'illegal transition: % -> released (allowed from reserved)', r.state using errcode = 'P0001';
  end if;
  update wf_ai_spend set state = 'released', updated_at = now() where attempt_key = p_key;
  return jsonb_build_object('ok', true);
end $$;

-- Ambiguity marker; keeps counting the full bound. A retry on an already unresolved row is a no-op success.
create or replace function wf_ai_unresolve(p_key text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r wf_ai_spend;
begin
  r := wf_ai__lock_attempt(p_key);
  if r.state = 'unresolved' then return jsonb_build_object('ok', true, 'already', true); end if;
  if r.state <> 'dispatched' then
    raise exception 'illegal transition: % -> unresolved (allowed from dispatched)', r.state using errcode = 'P0001';
  end if;
  update wf_ai_spend set state = 'unresolved', reason = coalesce(p_reason, reason), updated_at = now() where attempt_key = p_key;
  return jsonb_build_object('ok', true);
end $$;

-- Shared by settle (from dispatched) and reconcile (from unresolved). Charged to the attempt's OWN period.
create or replace function wf_ai__finish(p_key text, p_from text, p_settled numeric, p_usage jsonb, p_request_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r wf_ai_spend; v_over boolean; v_halt boolean;
begin
  perform wf_ai__check_amount(p_settled);   -- before any state change: invalid input never erases a charge
  r := wf_ai__lock_attempt(p_key);
  if r.state = 'settled' then
    if r.settled_micro_usd = p_settled then   -- identical retry: same result, no totals change
      return jsonb_build_object('ok', true, 'already', true,
        'overrun', coalesce(r.reason like 'overrun%', false), 'halted', (select bool_or(halted) from wf_ai_budget where scope = r.scope));
    end if;
    raise exception 'attempt % already settled at % (retry with % refused)', p_key, r.settled_micro_usd, p_settled using errcode = 'P0001';
  end if;
  if r.state <> p_from then
    raise exception 'illegal transition: % -> settled (allowed from %)', r.state, p_from using errcode = 'P0001';
  end if;
  v_over := p_settled > r.reserved_micro_usd;
  update wf_ai_spend set state = 'settled', settled_micro_usd = p_settled::bigint,
         usage = coalesce(p_usage, usage), request_id = coalesce(p_request_id, request_id), updated_at = now(),
         reason = case when v_over then format('overrun: settled %s > bound %s', p_settled, r.reserved_micro_usd)
                       else coalesce(p_reason, reason) end
   where attempt_key = p_key;
  if v_over then update wf_ai_budget set halted = true where scope = r.scope; end if;
  v_halt := wf_ai__halt_if_over_ceiling(r.scope, r.period) or v_over;
  return jsonb_build_object('ok', true, 'overrun', v_over, 'halted', v_halt);
end $$;

create or replace function wf_ai_settle(p_key text, p_settled numeric, p_usage jsonb, p_request_id text)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select wf_ai__finish(p_key, 'dispatched', p_settled, p_usage, p_request_id, null);
$$;

create or replace function wf_ai_reconcile(p_key text, p_settled numeric, p_reason text)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select wf_ai__finish(p_key, 'unresolved', p_settled, null, null, coalesce(p_reason, 'operator_reconcile'));
$$;

-- Advisory pre-check for callers: false when the scope is halted or has no budget row at all.
-- wf_ai_reserve remains the authoritative gate; this never grants anything.
create or replace function wf_ai_can_spend(p_scope text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from wf_ai_budget where scope = p_scope)
     and not exists (select 1 from wf_ai_budget where scope = p_scope and halted);
$$;

-- Budget upsert: create, keep or LOWER a ceiling freely; RAISING an existing one needs p_allow_raise = true
-- (an explicit operator decision; the pilot runner never passes it).
create or replace function wf_ai_set_budget(p_scope text, p_period text, p_ceiling bigint, p_allow_raise boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old bigint;
begin
  if p_ceiling is null or p_ceiling < 0 then raise exception 'ceiling must be a non-negative integer' using errcode = 'P0001'; end if;
  perform wf_ai__lock_scope(p_scope);
  select ceiling_micro_usd into v_old from wf_ai_budget where scope = p_scope and period = p_period for update;
  if found and p_ceiling > v_old and not coalesce(p_allow_raise, false) then
    raise exception 'refusing to RAISE ceiling % -> % for %/% without p_allow_raise', v_old, p_ceiling, p_scope, p_period using errcode = 'P0001';
  end if;
  insert into wf_ai_budget (scope, period, ceiling_micro_usd) values (p_scope, p_period, p_ceiling)
  on conflict (scope, period) do update set ceiling_micro_usd = excluded.ceiling_micro_usd;
  return jsonb_build_object('old', v_old, 'new', p_ceiling);
end $$;

create or replace function wf_ai_clear_halt(p_scope text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update wf_ai_budget set halted = false where scope = p_scope;
$$;

-- ── Access: budget authority is server-controlled (service_role only) ──────────────────────────
-- Step 1 is unconditional and runs even if the roles below do not exist (fail closed): PUBLIC holds EXECUTE on new
-- functions by default, so it is revoked from every function and table first.
revoke all on function wf_ai__lock_scope(text), wf_ai__lock_attempt(text), wf_ai__check_amount(numeric),
  wf_ai__halt_if_over_ceiling(text,text), wf_ai__move(text,text[],text,text), wf_ai__finish(text,text,numeric,jsonb,text,text),
  wf_ai_reserve(text,text,text,text,text,text,bigint), wf_ai_dispatch(text), wf_ai_release(text), wf_ai_unresolve(text,text),
  wf_ai_settle(text,numeric,jsonb,text), wf_ai_reconcile(text,numeric,text), wf_ai_can_spend(text), wf_ai_clear_halt(text),
  wf_ai_set_budget(text,text,bigint,boolean) from public;
revoke all on table wf_ai_budget, wf_ai_spend from public;

-- Step 2: API roles. Supabase default privileges grant EXECUTE to anon/authenticated/service_role explicitly, so they
-- are revoked by name. Helpers are revoked from service_role too (only the SECURITY DEFINER owner calls them).
-- A missing service_role is NOT skipped silently: a WARNING is raised and nothing is granted to anyone.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function wf_ai__lock_scope(text), wf_ai__lock_attempt(text), wf_ai__check_amount(numeric), wf_ai__halt_if_over_ceiling(text,text), wf_ai__move(text,text[],text,text), wf_ai__finish(text,text,numeric,jsonb,text,text) from %I', r);
      execute format('revoke all on table wf_ai_budget, wf_ai_spend from %I', r);
      if r <> 'service_role' then
        execute format('revoke all on function wf_ai_reserve(text,text,text,text,text,text,bigint), wf_ai_dispatch(text), wf_ai_release(text), wf_ai_unresolve(text,text), wf_ai_settle(text,numeric,jsonb,text), wf_ai_reconcile(text,numeric,text), wf_ai_can_spend(text), wf_ai_clear_halt(text), wf_ai_set_budget(text,text,bigint,boolean) from %I', r);
      end if;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function wf_ai_reserve(text,text,text,text,text,text,bigint), wf_ai_dispatch(text), wf_ai_release(text),
      wf_ai_unresolve(text,text), wf_ai_settle(text,numeric,jsonb,text), wf_ai_reconcile(text,numeric,text), wf_ai_can_spend(text),
      wf_ai_clear_halt(text), wf_ai_set_budget(text,text,bigint,boolean) to service_role;
  else
    raise warning 'wf_ai: role service_role does not exist; EXECUTE was revoked from PUBLIC and granted to NO ONE (fail closed). Create the role and re-run this block.';
  end if;
end $$;
