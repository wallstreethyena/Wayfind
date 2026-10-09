-- PROPOSAL ONLY (2026-10-08). Deliberately NOT under supabase/migrations: nothing applies this.
-- Postgres twin of lib/atlasBudgetFileLedger.js: an enforceable dollar budget for the Atlas writer.
-- Reasons returned match the JS ledger: no_budget, halted, duplicate_attempt_key, active_place,
-- over_ceiling, unknown_price_version, invalid_bound.
--
-- Invariant (inside wf_ai_reserve, serialised by SELECT ... FOR UPDATE on every budget row of the scope):
--   settled(this period) + sum(reserved_micro_usd of reserved|dispatched|unresolved, ANY period) + new bound <= ceiling
-- Overrun (settled > reserved) is recorded in full and halts the whole scope until wf_ai_clear_halt().

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

create or replace function wf_ai__lock_scope(p_scope text) returns void
language sql as $$
  select 1 from wf_ai_budget where scope = p_scope order by period for update;
$$;

create or replace function wf_ai_reserve(
  p_attempt_key text, p_scope text, p_period text, p_place_id text,
  p_model text, p_price_version text, p_bound bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ceiling bigint; v_committed bigint;
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
  if exists (select 1 from wf_ai_spend where attempt_key = p_attempt_key) then
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
returns wf_ai_spend language plpgsql as $$
declare r wf_ai_spend;
begin
  select * into r from wf_ai_spend where attempt_key = p_key for update;
  if not found then raise exception 'unknown attempt %', p_key using errcode = 'P0002'; end if;
  perform wf_ai__lock_scope(r.scope);
  if not (r.state = any (p_from)) then
    raise exception 'illegal transition: % -> % (allowed from %)', r.state, p_to, p_from using errcode = 'P0001';
  end if;
  update wf_ai_spend set state = p_to, reason = coalesce(p_reason, reason), updated_at = now()
   where attempt_key = p_key returning * into r;
  return r;
end $$;

create or replace function wf_ai_dispatch(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin perform wf_ai__move(p_key, array['reserved'], 'dispatched', null); end $$;

create or replace function wf_ai_release(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin perform wf_ai__move(p_key, array['reserved'], 'released', null); end $$;

create or replace function wf_ai_unresolve(p_key text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin perform wf_ai__move(p_key, array['dispatched'], 'unresolved', p_reason); end $$;

create or replace function wf_ai_settle(p_key text, p_settled bigint, p_usage jsonb, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r wf_ai_spend; v_over boolean;
begin
  if p_settled is null or p_settled < 0 then raise exception 'settled must be a non-negative integer' using errcode = 'P0001'; end if;
  r := wf_ai__move(p_key, array['dispatched'], 'settled', null);
  v_over := p_settled > r.reserved_micro_usd;
  update wf_ai_spend set settled_micro_usd = p_settled, usage = p_usage, request_id = p_request_id,
         reason = case when v_over then format('overrun: settled %s > bound %s', p_settled, r.reserved_micro_usd) else reason end
   where attempt_key = p_key;
  if v_over then update wf_ai_budget set halted = true where scope = r.scope; end if;
  return jsonb_build_object('overrun', v_over);
end $$;

create or replace function wf_ai_reconcile(p_key text, p_settled bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform wf_ai__move(p_key, array['unresolved'], 'settled', coalesce(p_reason, 'operator_reconcile'));
  update wf_ai_spend set settled_micro_usd = p_settled where attempt_key = p_key;
end $$;

create or replace function wf_ai_clear_halt(p_scope text) returns void
language sql security definer set search_path = public as $$
  update wf_ai_budget set halted = false where scope = p_scope;
$$;

-- Lock the functions down to service_role only (guarded so the file also loads in plain Postgres / PGlite).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function wf_ai_reserve(text,text,text,text,text,text,bigint), wf_ai_dispatch(text), wf_ai_release(text),
      wf_ai_unresolve(text,text), wf_ai_settle(text,bigint,jsonb,text), wf_ai_reconcile(text,bigint,text), wf_ai_clear_halt(text)
      from public, anon, authenticated;
    grant execute on function wf_ai_reserve(text,text,text,text,text,text,bigint), wf_ai_dispatch(text), wf_ai_release(text),
      wf_ai_unresolve(text,text), wf_ai_settle(text,bigint,jsonb,text), wf_ai_reconcile(text,bigint,text), wf_ai_clear_halt(text)
      to service_role;
  end if;
end $$;
