-- Prepared with the Supabase CLI. Tested only on isolated embedded PostgreSQL.
-- Use scripts/apply-migration.mjs with approval and reconciliation before production.
-- No outbound delivery is enabled by this schema.
begin;

create table public.wf_group_plans (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  create_key uuid not null,
  revision integer not null check (revision > 0),
  status text not null check (status in ('draft','open','closed','finalized','cancelled')),
  deadline timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  invite_secret text not null check (invite_secret ~ '^[a-f0-9]{64}$'),
  email_consent boolean not null default false,
  state jsonb not null,
  unique(owner_id,create_key),
  check (state ?& array['id','ownerId','revision','status','deadline','createdAt','invitees','places','times','organizer','organizerName','timeZone','originalPlaceId','schemaVersion']),
  check (jsonb_typeof(state->'invitees') = 'array' and jsonb_array_length(state->'invitees') between 1 and 10),
  check (jsonb_typeof(state->'places') = 'array' and jsonb_array_length(state->'places') between 1 and 3),
  check (jsonb_typeof(state->'times') = 'array' and jsonb_array_length(state->'times') between 1 and 3),
  check ((state->>'id')::uuid=id and (state->>'ownerId')::uuid=owner_id and (state->>'revision')::int=revision and state->>'status'=status),
  check ((state->>'deadline')::timestamptz=deadline),
  check (expires_at > deadline and expires_at <= created_at + interval '120 days'),
  check (pg_column_size(state) <= 65536)
);
create index wf_group_plans_owner_updated on public.wf_group_plans(owner_id,updated_at desc);
create index wf_group_plans_due on public.wf_group_plans(deadline) where status='open';
create index wf_group_plans_expiry on public.wf_group_plans(expires_at);

create table public.wf_group_plan_notices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.wf_group_plans(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check(event_type in ('voting_closed','plan_finalized','plan_cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  email_status text not null default 'not_requested' check(email_status in ('not_requested','pending_configuration','queued','attempted','provider_accepted','failed','suppressed')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  claim_token uuid,
  last_error_code text,
  unique(plan_id,event_type)
);
create index wf_group_plan_notices_owner on public.wf_group_plan_notices(owner_id,created_at desc);
create index wf_group_plan_notices_retry on public.wf_group_plan_notices(next_attempt_at) where email_status in ('queued','failed');

create table public.wf_group_plan_limits (
  key text primary key check(key ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  hits integer not null check(hits>0)
);

alter table public.wf_group_plans enable row level security;
alter table public.wf_group_plan_notices enable row level security;
alter table public.wf_group_plan_limits enable row level security;
revoke all on public.wf_group_plans,public.wf_group_plan_notices,public.wf_group_plan_limits from public,anon,authenticated;
grant select,insert,update,delete on public.wf_group_plans,public.wf_group_plan_notices,public.wf_group_plan_limits to service_role;
-- No public/authenticated RLS policy: all access is through an authenticated,
-- same-origin application server that verifies owner or per-slot capability.

create function public.wf_group_plan_rate_limit(p_key text,p_limit integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 120 then return false; end if;
  insert into public.wf_group_plan_limits as existing(key,window_start,hits)
  values(p_key,clock_timestamp(),1)
  on conflict(key) do update set
    hits=case when existing.window_start < clock_timestamp()-interval '1 minute' then 1 else existing.hits+1 end,
    window_start=case when existing.window_start < clock_timestamp()-interval '1 minute' then clock_timestamp() else existing.window_start end
  returning hits into n;
  return n<=p_limit;
end $$;

create function public.wf_group_plan_create(p_state jsonb,p_invite_secret text,p_create_key uuid,p_email_consent boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.wf_group_plans; owner uuid; made timestamptz; due timestamptz;
begin
  owner := (p_state->>'ownerId')::uuid;
  -- Serialize this owner's creation cap and idempotency check.
  perform pg_advisory_xact_lock(hashtextextended(owner::text,32491));
  select * into row from public.wf_group_plans where owner_id=owner and create_key=p_create_key;
  if found then return to_jsonb(row); end if;
  if (select count(*) from public.wf_group_plans where owner_id=owner and created_at>clock_timestamp()-interval '1 hour')>=10 then
    return jsonb_build_object('error','rate_limited');
  end if;
  made := (p_state->>'createdAt')::timestamptz;
  due := (p_state->>'deadline')::timestamptz;
  if p_state->>'status'<>'draft' or (p_state->>'revision')::int<>1
     or abs(extract(epoch from clock_timestamp()-made))>60
     or due<=clock_timestamp() or due>clock_timestamp()+interval '14 days'
     or exists(select 1 from jsonb_array_elements(p_state->'times') t where
       (t->>'startsAt')::timestamptz<=due or (t->>'endsAt')::timestamptz<=(t->>'startsAt')::timestamptz
       or (t->>'endsAt')::timestamptz>clock_timestamp()+interval '90 days') then
    return jsonb_build_object('error','invalid_plan');
  end if;
  insert into public.wf_group_plans(id,owner_id,create_key,revision,status,deadline,created_at,expires_at,invite_secret,email_consent,state)
  values((p_state->>'id')::uuid,owner,p_create_key,1,'draft',due,made,made+interval '120 days',p_invite_secret,coalesce(p_email_consent,false),p_state)
  returning * into row;
  return to_jsonb(row);
end $$;

create function public.wf_group_plan_commit(p_id uuid,p_expected_revision integer,p_state jsonb,p_operation text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.wf_group_plans; next_status text; notice text; all_responded boolean;
begin
  select * into row from public.wf_group_plans where id=p_id for update;
  if not found or row.expires_at<=clock_timestamp() then return jsonb_build_object('error','not_found'); end if;
  if row.revision<>p_expected_revision then return jsonb_build_object('error','conflict'); end if;
  if p_operation not in ('start','respond','withdraw','close','settle','cancel','finalize') then return jsonb_build_object('error','operation'); end if;
  if p_operation in ('start','respond','withdraw') and clock_timestamp()>=row.deadline then return jsonb_build_object('error','deadline'); end if;
  next_status:=p_state->>'status';
  -- Immutable identity, roster, choices, times, timezone and deadline. Responses
  -- may change, but another person's slot can never be appended or replaced.
  if (p_state->>'id')::uuid<>row.id or (p_state->>'ownerId')::uuid<>row.owner_id
     or (p_state->>'revision')::int<>row.revision+1
     or p_state->'places'<>row.state->'places' or p_state->'times'<>row.state->'times'
     or p_state->'deadline'<>row.state->'deadline' or p_state->'timeZone'<>row.state->'timeZone'
     or p_state->'createdAt'<>row.state->'createdAt' or p_state->'organizer'<>row.state->'organizer'
     or p_state->'organizerName'<>row.state->'organizerName'
     or (select jsonb_agg(jsonb_build_object('id',x->'id','name',x->'name','v',x->'inviteVersion') order by x->>'id') from jsonb_array_elements(p_state->'invitees') x)
       <> (select jsonb_agg(jsonb_build_object('id',x->'id','name',x->'name','v',x->'inviteVersion') order by x->>'id') from jsonb_array_elements(row.state->'invitees') x)
     then return jsonb_build_object('error','immutable'); end if;
  if not ((row.status='draft' and next_status in ('open','cancelled','closed'))
      or (row.status='open' and next_status in ('open','closed','cancelled'))
      or (row.status='closed' and next_status in ('finalized','cancelled'))) then
    return jsonb_build_object('error','state');
  end if;
  select bool_and(x->'response' is not null and x->'response'<>'null'::jsonb) into all_responded from jsonb_array_elements(p_state->'invitees') x;
  if next_status='closed' and clock_timestamp()<row.deadline and not coalesce(all_responded,false) then return jsonb_build_object('error','early_close'); end if;
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

revoke all on function public.wf_group_plan_rate_limit(text,integer),public.wf_group_plan_create(jsonb,text,uuid,boolean),public.wf_group_plan_commit(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.wf_group_plan_rate_limit(text,integer),public.wf_group_plan_create(jsonb,text,uuid,boolean),public.wf_group_plan_commit(uuid,integer,jsonb,text) to service_role;

-- A single claimed notice may be retried using the same provider idempotency key.
-- SKIP LOCKED permits multiple workers without concurrent sends of one notice.
create function public.wf_group_plan_claim_notice(p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare notice public.wf_group_plan_notices; consent boolean;
begin
  select n.* into notice from public.wf_group_plan_notices n join public.wf_group_plans p on p.id=n.plan_id
  where n.event_type='voting_closed' and p.email_consent and p.status in ('closed','finalized') and p.expires_at>clock_timestamp()
    and n.attempts<5 and (n.next_attempt_at is null or n.next_attempt_at<=clock_timestamp())
    and (n.email_status in ('pending_configuration','queued','failed') or (n.email_status='attempted' and n.lease_until<clock_timestamp()))
  order by n.created_at,n.id for update of n skip locked limit 1;
  if not found then return null; end if;
  update public.wf_group_plan_notices set email_status='attempted',attempts=attempts+1,claim_token=p_claim_token,lease_until=clock_timestamp()+interval '2 minutes'
  where id=notice.id returning * into notice;
  return to_jsonb(notice)||jsonb_build_object('email_consent',true);
end $$;

create function public.wf_group_plan_finish_notice(p_id uuid,p_claim_token uuid,p_status text,p_error_code text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('provider_accepted','failed','suppressed','pending_configuration') then return false; end if;
  update public.wf_group_plan_notices set email_status=p_status,claim_token=null,lease_until=null,last_error_code=left(p_error_code,60),
    next_attempt_at=case when p_status='failed' and attempts<5 then clock_timestamp()+make_interval(mins=>least(60,(power(3,attempts))::int)) else null end
  where id=p_id and claim_token=p_claim_token and email_status='attempted';
  return found;
end $$;

revoke all on function public.wf_group_plan_claim_notice(uuid),public.wf_group_plan_finish_notice(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.wf_group_plan_claim_notice(uuid),public.wf_group_plan_finish_notice(uuid,uuid,text,text) to service_role;

create function public.wf_group_plan_cleanup()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plans integer; limits integer;
begin
  delete from public.wf_group_plans where id in (select id from public.wf_group_plans where expires_at<=clock_timestamp() order by expires_at limit 500);
  get diagnostics plans=row_count;
  delete from public.wf_group_plan_limits where key in (select key from public.wf_group_plan_limits where window_start<clock_timestamp()-interval '2 days' order by window_start limit 500);
  get diagnostics limits=row_count;
  return jsonb_build_object('expired_plans_removed',plans,'old_limits_removed',limits);
end $$;
revoke all on function public.wf_group_plan_cleanup() from public,anon,authenticated;
grant execute on function public.wf_group_plan_cleanup() to service_role;
commit;
