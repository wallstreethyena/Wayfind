-- Private model-to-model observations. No new exposed schema or public table.
-- Only the Wayfind server's supabase service role can execute the fixed RPCs;
-- users and providers do not receive SQL permissions, credentials or arbitrary text.
begin;

create schema wf_ai_private;
revoke all on schema wf_ai_private from public, anon, authenticated, service_role;

create table wf_ai_private.bulletin (
  run_date date not null,
  region text not null check (region in (
    'statewide', 'tampa-bay', 'sarasota-bradenton', 'central-florida', 'orlando',
    'miami', 'south-florida', 'first-coast', 'suncoast', 'southwest-florida',
    'daytona-space-coast', 'treasure-coast', 'panhandle', 'north-florida', 'keys'
  )),
  daypart text not null check (daypart in ('all-day', 'morning', 'afternoon', 'evening', 'late-night')),
  topic text not null check (topic in ('posters', 'project')),
  provider text not null check (provider in ('openai', 'gemini', 'grok', 'claude')),
  stage text not null check (stage in ('intake', 'verification', 'selection', 'publication', 'health')),
  status text not null check (status in ('ready', 'succeeded', 'degraded', 'skipped', 'unavailable')),
  signal text not null check (signal in (
    'none', 'candidate_count', 'verified_evidence', 'stale_evidence', 'provider_unavailable',
    'budget_limited', 'configuration_missing', 'no_safe_candidates', 'deterministic_fallback'
  )),
  candidate_count integer not null check (candidate_count between 0 and 500),
  observed_at timestamptz not null default statement_timestamp(),
  check (stage <> 'publication' or provider = 'openai'),
  check (signal = 'candidate_count' or candidate_count = 0),
  primary key (run_date, region, daypart, topic, provider, stage)
);
alter table wf_ai_private.bulletin enable row level security;
revoke all on table wf_ai_private.bulletin from public, anon, authenticated, service_role;
create index bulletin_observed_idx on wf_ai_private.bulletin (observed_at);

create function wf_ai_private.read_bulletin(
  p_provider text, p_run_date date, p_region text, p_daypart text, p_topic text
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $function$
begin
  if session_user <> 'service_role' and current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'private bulletin access denied';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'provider', n.provider, 'stage', n.stage, 'status', n.status,
    'signal', n.signal, 'count', n.candidate_count
  ) order by n.provider, n.stage), '[]'::jsonb)
  from wf_ai_private.bulletin n
  where p_provider in ('openai', 'gemini', 'grok', 'claude')
    and n.run_date = p_run_date and n.region = p_region
    and n.daypart = p_daypart and n.topic = p_topic
    and n.observed_at >= statement_timestamp() - interval '7 days');
end;
$function$;

create function wf_ai_private.post_bulletin(
  p_provider text, p_run_date date, p_region text, p_daypart text, p_topic text,
  p_stage text, p_status text, p_signal text, p_count integer
) returns text language plpgsql security definer set search_path = pg_catalog as $function$
declare
  utc_date date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if session_user <> 'service_role' and current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'private bulletin access denied';
  end if;
  -- Florida civil date may lag UTC. A small backfill allowance covers retries.
  -- It does not permit seeding arbitrary past or future scopes.
  if p_run_date is null or p_run_date < utc_date - 2 or p_run_date > utc_date + 1 then
    raise exception using errcode = '22023', message = 'invalid bulletin date';
  end if;

  -- One immutable report per provider/stage/scope. Equal retries are harmless;
  -- a changed replay is a conflict, not an update. Old notes are never read,
  -- and regular scheduled writes also remove them.
  delete from wf_ai_private.bulletin
  where observed_at < statement_timestamp() - interval '7 days';

  insert into wf_ai_private.bulletin (
    provider, run_date, region, daypart, topic, stage, status, signal, candidate_count
  ) values (
    p_provider, p_run_date, p_region, p_daypart, p_topic, p_stage, p_status, p_signal, p_count
  ) on conflict do nothing;
  if found then return 'inserted'; end if;

  if exists (
    select 1 from wf_ai_private.bulletin n
    where n.run_date = p_run_date and n.region = p_region and n.daypart = p_daypart
      and n.topic = p_topic and n.provider = p_provider and n.stage = p_stage
      and n.status = p_status and n.signal = p_signal and n.candidate_count = p_count
  ) then return 'unchanged'; end if;
  return 'conflict';
end;
$function$;

-- PostgREST only sees the invoker wrappers. Never expose wf_ai_private.
-- The restricted definer functions in the private schema own table access;
-- even the service role only sees the invoker-compatible RPC contract.
grant usage on schema wf_ai_private to service_role;
revoke all on function wf_ai_private.read_bulletin(text,date,text,text,text) from public, anon, authenticated, service_role;
revoke all on function wf_ai_private.post_bulletin(text,date,text,text,text,text,text,text,integer) from public, anon, authenticated, service_role;
grant execute on function wf_ai_private.read_bulletin(text,date,text,text,text) to service_role;
grant execute on function wf_ai_private.post_bulletin(text,date,text,text,text,text,text,text,integer) to service_role;

create function public.wf_ai_bulletin_read(
  p_provider text, p_run_date date, p_region text, p_daypart text, p_topic text
) returns jsonb language sql stable security invoker set search_path = pg_catalog as $function$
  select wf_ai_private.read_bulletin(p_provider,p_run_date,p_region,p_daypart,p_topic);
$function$;
create function public.wf_ai_bulletin_post(
  p_provider text, p_run_date date, p_region text, p_daypart text, p_topic text,
  p_stage text, p_status text, p_signal text, p_count integer
) returns text language sql security invoker set search_path = pg_catalog as $function$
  select wf_ai_private.post_bulletin(p_provider,p_run_date,p_region,p_daypart,p_topic,p_stage,p_status,p_signal,p_count);
$function$;

revoke all on function public.wf_ai_bulletin_read(text,date,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.wf_ai_bulletin_post(text,date,text,text,text,text,text,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.wf_ai_bulletin_read(text,date,text,text,text) to service_role;
grant execute on function public.wf_ai_bulletin_post(text,date,text,text,text,text,text,text,integer) to service_role;

commit;
