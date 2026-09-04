-- Authoritative daily allowance for Lunch in My City. The browser may mirror
-- the count for instant UI, but only this atomic server call can spend a reveal.
-- Subject keys are one-way SHA-256 digests; raw device IDs and user IDs are not
-- stored in this table.
begin;

create table if not exists public.wf_lunch_reveal_usage (
  subject_key text not null,
  site_day date not null,
  attempts smallint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (subject_key, site_day),
  constraint wf_lunch_reveal_subject_ck check (subject_key ~ '^[0-9a-f]{64}$'),
  constraint wf_lunch_reveal_attempts_ck check (attempts between 0 and 2)
);

create index if not exists wf_lunch_reveal_day_idx
  on public.wf_lunch_reveal_usage (site_day desc);

alter table public.wf_lunch_reveal_usage enable row level security;
revoke all on public.wf_lunch_reveal_usage from anon, authenticated;

create or replace function public.wf_consume_lunch_reveal(
  p_device_key text,
  p_user_key text,
  p_site_day date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used smallint := 0;
  v_next smallint;
  v_limit smallint := case when p_user_key is null then 1 else 2 end;
begin
  if p_device_key is null or p_device_key !~ '^[0-9a-f]{64}$' then
    raise exception 'wf_consume_lunch_reveal: invalid device key';
  end if;
  if p_user_key is not null and p_user_key !~ '^[0-9a-f]{64}$' then
    raise exception 'wf_consume_lunch_reveal: invalid user key';
  end if;
  if p_site_day is null or p_site_day < current_date - 1 or p_site_day > current_date + 1 then
    raise exception 'wf_consume_lunch_reveal: invalid site day';
  end if;

  -- Serialize every subject participating in this decision. This makes two
  -- simultaneous taps observe one another before either can increment.
  perform pg_advisory_xact_lock(hashtextextended(p_device_key || ':' || p_site_day::text, 0));
  if p_user_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_user_key || ':' || p_site_day::text, 0));
  end if;

  select coalesce(max(attempts), 0)::smallint into v_used
  from public.wf_lunch_reveal_usage
  where site_day = p_site_day
    and subject_key in (p_device_key, coalesce(p_user_key, p_device_key));

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'remaining', 0, 'limit', v_limit);
  end if;

  v_next := v_used + 1;
  insert into public.wf_lunch_reveal_usage as u (subject_key, site_day, attempts, updated_at)
  values (p_device_key, p_site_day, v_next, now())
  on conflict (subject_key, site_day) do update
    set attempts = greatest(u.attempts, excluded.attempts), updated_at = now();

  if p_user_key is not null then
    insert into public.wf_lunch_reveal_usage as u (subject_key, site_day, attempts, updated_at)
    values (p_user_key, p_site_day, v_next, now())
    on conflict (subject_key, site_day) do update
      set attempts = greatest(u.attempts, excluded.attempts), updated_at = now();
  end if;

  return jsonb_build_object('allowed', true, 'used', v_next, 'remaining', v_limit - v_next, 'limit', v_limit);
end;
$$;

revoke all on function public.wf_consume_lunch_reveal(text, text, date) from public, anon, authenticated;
grant execute on function public.wf_consume_lunch_reveal(text, text, date) to service_role;

comment on table public.wf_lunch_reveal_usage is
  'Server-authoritative Lunch in My City daily reveal counts. Service-role only; subject identifiers are SHA-256 digests.';

commit;
