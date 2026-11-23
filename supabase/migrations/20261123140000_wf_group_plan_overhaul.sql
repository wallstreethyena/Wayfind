-- Group Vote overhaul: 1-5 customizable places/experiences, single group-link
-- voting (join_respond), owner delete/clean-history RPCs, and first-party
-- opted-in Twilio SMS alerts (auto-cascaded on plan deletion or expiry).
-- Preserve server-only RLS, SECURITY INVOKER functions, CAS and privacy rules.
begin;

do $$
declare
  c record;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.wf_group_plans'::regclass
      and contype = 'c'
  loop
    if c.def like '%jsonb_array_length%' and (c.def like '%''places''%' or c.def like '%''invitees''%') then
      execute format('alter table public.wf_group_plans drop constraint %I', c.conname);
    end if;
  end loop;
end $$;

alter table public.wf_group_plans
  add constraint wf_group_plans_places_len_check
    check (coalesce(jsonb_typeof(state->'places'), '') = 'array' and jsonb_array_length(state->'places') between 1 and 5),
  add constraint wf_group_plans_invitees_len_check
    check (
      coalesce(jsonb_typeof(state->'invitees'), '') = 'array'
      and (
        (coalesce(state->>'shareMode', 'individual') = 'group' and jsonb_array_length(state->'invitees') between 0 and 10)
        or (coalesce(state->>'shareMode', 'individual') <> 'group' and jsonb_array_length(state->'invitees') between 1 and 10)
      )
    );

create or replace function public.wf_group_plan_commit(p_id uuid,p_expected_revision integer,p_state jsonb,p_operation text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  row public.wf_group_plans;
  next_status text;
  notice text;
  all_responded boolean;
  any_responded boolean;
  is_group_mode boolean;
  prev_len integer;
  next_len integer;
  existing_preserved boolean;
begin
  select * into row from public.wf_group_plans where id=p_id for update;
  if not found or row.expires_at<=clock_timestamp() then return jsonb_build_object('error','not_found'); end if;
  if row.revision<>p_expected_revision then return jsonb_build_object('error','conflict'); end if;
  if p_operation not in ('start','respond','join_respond','withdraw','close','settle','cancel','finalize') then return jsonb_build_object('error','operation'); end if;
  if p_operation in ('start','respond','join_respond','withdraw') and clock_timestamp()>=row.deadline then return jsonb_build_object('error','deadline'); end if;
  next_status:=p_state->>'status';
  is_group_mode:=coalesce(row.state->>'shareMode','individual')='group';
  -- Immutable identity, choices, times, timezone, deadline and share mode.
  if (p_state->>'id')::uuid<>row.id or (p_state->>'ownerId')::uuid<>row.owner_id
     or (p_state->>'revision')::int<>row.revision+1
     or p_state->'places'<>row.state->'places' or p_state->'times'<>row.state->'times'
     or p_state->'deadline'<>row.state->'deadline' or p_state->'timeZone'<>row.state->'timeZone'
     or p_state->'createdAt'<>row.state->'createdAt' or p_state->'organizer'<>row.state->'organizer'
     or p_state->'organizerName'<>row.state->'organizerName'
     or coalesce(p_state->>'shareMode','individual')<>coalesce(row.state->>'shareMode','individual') then
    return jsonb_build_object('error','immutable');
  end if;
  if p_operation='join_respond' then
    if not is_group_mode or row.status<>'open' then return jsonb_build_object('error','operation'); end if;
    prev_len:=jsonb_array_length(row.state->'invitees');
    next_len:=jsonb_array_length(p_state->'invitees');
    if next_len<prev_len or next_len>prev_len+1 or next_len<1 or next_len>10 then
      return jsonb_build_object('error','immutable');
    end if;
    -- Every previously existing guest slot must stay intact by id, name and version.
    select coalesce(bool_and(exists(
      select 1 from jsonb_array_elements(p_state->'invitees') n
      where n->>'id'=o->>'id' and n->>'name'=o->>'name' and n->'inviteVersion'=o->'inviteVersion'
    )), true) into existing_preserved
    from jsonb_array_elements(row.state->'invitees') o;
    if not existing_preserved then return jsonb_build_object('error','immutable'); end if;
  else
    if coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','name',x->'name','v',x->'inviteVersion') order by x->>'id') from jsonb_array_elements(p_state->'invitees') x),'[]'::jsonb)
       <> coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','name',x->'name','v',x->'inviteVersion') order by x->>'id') from jsonb_array_elements(row.state->'invitees') x),'[]'::jsonb) then
      return jsonb_build_object('error','immutable');
    end if;
  end if;
  if not ((row.status='draft' and next_status in ('open','cancelled','closed'))
      or (row.status='open' and next_status in ('open','closed','cancelled'))
      or (row.status='closed' and next_status in ('finalized','cancelled'))) then
    return jsonb_build_object('error','state');
  end if;
  next_len:=jsonb_array_length(p_state->'invitees');
  select bool_and(x->'response' is not null and x->'response'<>'null'::jsonb),
         bool_or(x->'response' is not null and x->'response'<>'null'::jsonb)
    into all_responded, any_responded
    from jsonb_array_elements(p_state->'invitees') x;
  if next_status='closed' and clock_timestamp()<row.deadline then
    if is_group_mode and p_operation='close' then
      if not coalesce(any_responded,false) then return jsonb_build_object('error','early_close'); end if;
    elsif next_len=0 or not coalesce(all_responded,false) then
      return jsonb_build_object('error','early_close');
    end if;
  end if;
  if next_status='finalized' and p_state->'finalPlan' is null then return jsonb_build_object('error','final_plan'); end if;
  update public.wf_group_plans set state=p_state,revision=(p_state->>'revision')::int,status=next_status,updated_at=clock_timestamp() where id=p_id returning * into row;
  notice:=case when next_status='closed' then 'voting_closed' when next_status='finalized' then 'plan_finalized' when next_status='cancelled' then 'plan_cancelled' else null end;
  if notice is not null then
    insert into public.wf_group_plan_notices(plan_id,owner_id,event_type,email_status)
    values(row.id,row.owner_id,notice,case when row.email_consent and notice='voting_closed' then 'pending_configuration' else 'not_requested' end)
    on conflict(plan_id,event_type) do nothing;
  end if;
  return to_jsonb(row);
end $$;

revoke all on function public.wf_group_plan_commit(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.wf_group_plan_commit(uuid,integer,jsonb,text) to service_role;

-- First-party opted-in SMS subscriptions (organizer and optionally individual
-- voters who explicitly ticked SMS alerts on their own ballot). Cascaded on
-- plan deletion and expiry so phone numbers never outlive the plan.
create table if not exists public.wf_group_plan_sms_optins (
  plan_id uuid not null references public.wf_group_plans(id) on delete cascade,
  slot_key text not null check (length(slot_key) between 1 and 80),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  consent_at timestamptz not null default clock_timestamp(),
  consent_text text not null check (length(consent_text) between 10 and 400),
  primary key (plan_id, slot_key)
);

-- Durable per-(plan, recipient, kind) SMS send log (mirrors wf_reserve_notifications).
create table if not exists public.wf_group_plan_sms (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.wf_group_plans(id) on delete cascade,
  slot_key text not null check (length(slot_key) between 1 and 80),
  kind text not null check (kind in ('organizer_created','organizer_closed','participant_finalized')),
  recipient text not null check (recipient ~ '^\+[1-9][0-9]{7,14}$'),
  consent_at timestamptz not null default clock_timestamp(),
  consent_text text not null check (length(consent_text) between 10 and 400),
  provider text,
  provider_message_id text,
  status text not null default 'queued' check (status in ('unknown','queued','accepted','sending','sent','delivered','undelivered','failed','recorded')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_error text,
  note text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (plan_id, slot_key, kind)
);
create index if not exists wf_group_plan_sms_provider_idx on public.wf_group_plan_sms(provider, provider_message_id) where provider_message_id is not null;

alter table public.wf_group_plan_sms_optins enable row level security;
alter table public.wf_group_plan_sms enable row level security;
revoke all on public.wf_group_plan_sms_optins, public.wf_group_plan_sms from public, anon, authenticated;
grant select, insert, update, delete on public.wf_group_plan_sms_optins, public.wf_group_plan_sms to service_role;

create or replace function public.wf_group_plan_delete(p_id uuid, p_owner_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  delete from public.wf_group_plans where id = p_id and owner_id = p_owner_id;
  return found;
end $$;

create or replace function public.wf_group_plan_clean_history(p_owner_id uuid, p_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
  if p_scope = 'all' then
    delete from public.wf_group_plans where owner_id = p_owner_id;
    get diagnostics removed = row_count;
    return jsonb_build_object('deleted_plans', removed);
  elsif p_scope = 'finished' then
    delete from public.wf_group_plans
    where owner_id = p_owner_id
      and (status in ('closed', 'finalized', 'cancelled') or (status = 'draft' and deadline <= clock_timestamp()));
    get diagnostics removed = row_count;
    return jsonb_build_object('deleted_plans', removed);
  end if;
  return jsonb_build_object('error', 'invalid_scope');
end $$;

create or replace function public.wf_group_plan_dismiss_notice(p_notice_id uuid, p_owner_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  delete from public.wf_group_plan_notices where id = p_notice_id and owner_id = p_owner_id;
  return found;
end $$;

revoke all on function public.wf_group_plan_delete(uuid,uuid), public.wf_group_plan_clean_history(uuid,text), public.wf_group_plan_dismiss_notice(uuid,uuid) from public, anon, authenticated;
grant execute on function public.wf_group_plan_delete(uuid,uuid), public.wf_group_plan_clean_history(uuid,text), public.wf_group_plan_dismiss_notice(uuid,uuid) to service_role;

commit;
