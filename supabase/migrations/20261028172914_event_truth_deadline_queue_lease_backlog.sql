
-- 1. Structured recheck fields (additive; never suppress SLA freshness)
alter table public.wf_events
  add column if not exists recheck_on date,
  add column if not exists recheck_reason text,
  add column if not exists recheck_set_at timestamptz;
comment on column public.wf_events.recheck_on is 'Structured manual recheck date (America/New_York). ADDITIVE ONLY: a row is due when recheck_on <= today OR its SLA deadline is near; a future recheck_on never suppresses an SLA-required check. Free-text RECHECK tokens in verify_note are history only and are NOT read by the queue.';

-- 2. SLA deadline that accounts for the row entering a tighter band later
create or replace function public.wf_event_sla_deadline(p_start date, p_last timestamptz, p_at timestamptz default now())
returns timestamptz language plpgsql stable set search_path = public as $$
declare
  v_today date := (p_at at time zone 'America/New_York')::date;
  v_days int;
  v_cur interval;
  v_dl timestamptz;
  v_entry timestamptz;
  t record;
begin
  if p_start is null then return null; end if;
  if p_last is null then return '-infinity'::timestamptz; end if;
  v_days := p_start - v_today;
  v_cur := case when v_days <= 7 then interval '1 day' when v_days <= 30 then interval '7 days'
                when v_days <= 90 then interval '14 days' else interval '30 days' end;
  v_dl := p_last + v_cur;
  for t in select * from (values (90, interval '14 days'), (30, interval '7 days'), (7, interval '1 day')) x(th, sla) loop
    if v_days > t.th then
      v_entry := ((p_start - t.th)::timestamp) at time zone 'America/New_York';
      v_dl := least(v_dl, greatest(p_last + t.sla, v_entry));
    end if;
  end loop;
  return v_dl;
end $$;

-- 3. Shared lease (protects against overlapping runs across sessions)
create table if not exists public.wf_event_truth_lease (
  lane text primary key,
  holder text not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.wf_event_truth_lease enable row level security;

create or replace function public.wf_event_truth_lease_acquire(p_lane text, p_holder text, p_ttl_minutes int default 60)
returns boolean language plpgsql set search_path = public as $$
declare v_ok boolean;
begin
  insert into wf_event_truth_lease as l (lane, holder, acquired_at, heartbeat_at, expires_at)
  values (p_lane, p_holder, now(), now(), now() + make_interval(mins => p_ttl_minutes))
  on conflict (lane) do update
    set holder = excluded.holder,
        acquired_at = case when l.holder = excluded.holder then l.acquired_at else now() end,
        heartbeat_at = now(),
        expires_at = excluded.expires_at
    where l.expires_at < now() or l.holder = excluded.holder
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

create or replace function public.wf_event_truth_lease_release(p_lane text, p_holder text)
returns boolean language sql set search_path = public as $$
  with d as (delete from wf_event_truth_lease where lane = p_lane and holder = p_holder returning 1)
  select exists(select 1 from d);
$$;

-- 4. Resumable, idempotent backlog (staging for two-phase writes)
create table if not exists public.wf_event_truth_backlog (
  event_id text not null references public.wf_events(event_id),
  batch_id text not null,
  enqueued_at timestamptz not null default now(),
  priority_class int not null,
  sla_deadline timestamptz,
  reason text not null,
  expected_last_verified_at timestamptz,
  state text not null default 'queued' check (state in ('queued','claimed','staged','applied','held','failed','skipped')),
  claimed_by text,
  claimed_at timestamptz,
  attempts int not null default 0,
  verdict text check (verdict in ('PASS','PARTIAL','FAIL')),
  proposed jsonb,
  evidence text,
  source_url text,
  source_tier int,
  needs_review boolean,
  updated_at timestamptz not null default now(),
  primary key (event_id, batch_id)
);
create index if not exists wf_event_truth_backlog_open on public.wf_event_truth_backlog (state, priority_class, sla_deadline);
alter table public.wf_event_truth_backlog enable row level security;

-- 5. Deterministic deadline-aware queue
create or replace function public.wf_event_truth_queue(p_horizon interval default interval '8 hours', p_limit int default 1000)
returns table(event_id text, priority_class int, sla_deadline timestamptz, reason text, expected_last_verified_at timestamptz,
              start_date date, days_out int, event_status text, verification_confidence text, recheck_on date)
language sql stable set search_path = public as $$
  with t as (select (now() at time zone 'America/New_York')::date as today),
  r as (
    select e.event_id, e.start_date, e.end_date, e.event_status, e.verification_confidence, e.last_verified_at, e.recheck_on,
           e.start_date - t.today as d,
           wf_event_sla_deadline(e.start_date, e.last_verified_at) as dl,
           t.today
      from wf_events e cross join t
  ), c as (
    select r.*,
      case
        when event_status in ('scheduled','sold_out') and coalesce(end_date,start_date) < today then 0
        when event_status in ('scheduled','sold_out') and dl < now() and d <= 7 then 1
        when event_status in ('scheduled','sold_out') and dl <= now() + p_horizon and d <= 0 then 2
        when event_status in ('scheduled','sold_out') and dl <= now() + p_horizon and d <= 3 then 3
        when event_status in ('scheduled','sold_out') and dl <= now() + p_horizon and d <= 7 then 4
        when event_status in ('postponed','uncertain') and recheck_on <= today then 5
        when event_status in ('scheduled','sold_out') and dl <= now() + p_horizon and verification_confidence = 'low' then 6
        when event_status in ('scheduled','sold_out') and dl <= now() + p_horizon and verification_confidence = 'medium' then 7
        when event_status in ('scheduled','sold_out') and dl <= now() + p_horizon then 9
        when recheck_on <= today then 8
      end as pc
    from r
  )
  select event_id, pc, dl,
         case pc when 0 then 'rollover: ended, still displayable'
                 when 1 then 'OVERDUE imminent'
                 when 5 then 'status risk recheck_on ' || recheck_on
                 when 8 then 'recheck_on ' || recheck_on
                 else 'sla deadline ' || to_char(dl at time zone 'UTC','YYYY-MM-DD HH24:MI"Z"') end
           || case when recheck_on <= today and pc not in (5,8) then ' + recheck_on ' || recheck_on else '' end,
         last_verified_at, start_date, d, event_status, verification_confidence, recheck_on
    from c where pc is not null
   order by pc, dl nulls first, start_date
   limit p_limit;
$$;

-- 6. Status/monitoring snapshot
create or replace function public.wf_event_truth_status()
returns jsonb language sql stable set search_path = public as $$
  with t as (select (now() at time zone 'America/New_York')::date as today),
  r as (
    select e.event_id, e.start_date - t.today as d, wf_event_sla_deadline(e.start_date, e.last_verified_at) as dl
      from wf_events e cross join t
     where e.event_status in ('scheduled','sold_out') and coalesce(e.end_date, e.start_date) >= t.today
  )
  select jsonb_build_object(
    'at', now(),
    'overdue_now', (select count(*) from r where dl < now()),
    'overdue_imminent', (select count(*) from r where dl < now() and d <= 7),
    'past_fuse_imminent', (select count(*) from r where d <= 7 and dl < now() - interval '2 days'),
    'due_within_4h', (select count(*) from r where dl between now() and now() + interval '4 hours'),
    'due_within_12h', (select count(*) from r where dl between now() and now() + interval '12 hours'),
    'due_within_24h', (select count(*) from r where dl between now() and now() + interval '24 hours'),
    'next_deadline', (select min(dl) from r where dl >= now()),
    'rollover_pending', (select count(*) from wf_events e, t where e.event_status in ('scheduled','sold_out') and coalesce(e.end_date,e.start_date) < t.today),
    'recheck_due', (select count(*) from wf_events e, t where e.recheck_on <= t.today),
    'backlog_open', (select count(*) from wf_event_truth_backlog where state in ('queued','claimed','staged')),
    'backlog_failed_24h', (select count(*) from wf_event_truth_backlog where state = 'failed' and updated_at > now() - interval '24 hours'),
    'lease', (select jsonb_build_object('holder', holder, 'expires_at', expires_at) from wf_event_truth_lease where lane = 'event-truth' and expires_at > now()),
    'last_useful_completion', (select max(ran_at) from wf_job_pulse where job = 'event-truth-daily' and succeeded > 0),
    'last_run_pulse', (select max(ran_at) from wf_job_pulse where job = 'event-truth-daily')
  );
$$;

revoke all on function public.wf_event_sla_deadline(date, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.wf_event_truth_lease_acquire(text, text, int) from public, anon, authenticated;
revoke all on function public.wf_event_truth_lease_release(text, text) from public, anon, authenticated;
revoke all on function public.wf_event_truth_queue(interval, int) from public, anon, authenticated;
revoke all on function public.wf_event_truth_status() from public, anon, authenticated;
revoke all on table public.wf_event_truth_lease, public.wf_event_truth_backlog from anon, authenticated;
