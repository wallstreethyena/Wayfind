-- Provider-independent source policy and atomic free-call metering.

create table if not exists public.wf_source_registry (
  provider text primary key,
  source_class text not null,
  capabilities text[] not null default '{}',
  status text not null default 'disabled' check (status in ('healthy','degraded','disabled','review_required')),
  metered boolean not null default true,
  hard_call_ceiling_daily integer check (hard_call_ceiling_daily is null or hard_call_ceiling_daily >= 0),
  cost_after_free_micros bigint check (cost_after_free_micros is null or cost_after_free_micros >= 0),
  auth_type text not null,
  cache_policy text,
  retention_policy text,
  internal_use boolean not null default false,
  display_allowed boolean not null default false,
  derived_facts_allowed boolean not null default false,
  raw_redistribution_allowed boolean not null default false,
  commercial_api_allowed boolean not null default false,
  adapter_module text not null,
  fallback_rank integer not null default 100,
  documentation_url text not null,
  last_verified_at date not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_provider_usage_daily (
  provider text not null references public.wf_source_registry(provider),
  capability text not null,
  usage_date date not null,
  calls bigint not null default 0 check (calls >= 0),
  free_units bigint not null default 0 check (free_units >= 0),
  paid_units bigint not null default 0 check (paid_units >= 0),
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0),
  results_returned bigint not null default 0 check (results_returned >= 0),
  useful_results bigint not null default 0 check (useful_results >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, capability, usage_date)
);

create table if not exists public.wf_provider_call_budget_daily (
  provider text not null references public.wf_source_registry(provider),
  usage_date date not null,
  calls bigint not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, usage_date)
);

insert into public.wf_source_registry (
  provider, source_class, capabilities, status, metered,
  hard_call_ceiling_daily, cost_after_free_micros, auth_type,
  cache_policy, retention_policy, internal_use, display_allowed,
  derived_facts_allowed, raw_redistribution_allowed, commercial_api_allowed,
  adapter_module, fallback_rank, documentation_url, last_verified_at
) values (
  'meta_instagram', 'official_api', array['business_discovery','hashtag_search','media_metadata'],
  'healthy', true, 50, 0, 'bearer_token',
  'private candidate metadata only', '30 days unless reverified', true, false,
  true, false, false, 'lib/instagramGraph.js', 10,
  'https://developers.facebook.com/docs/instagram-platform/', date '2026-09-06'
)
on conflict (provider) do update set
  source_class=excluded.source_class, capabilities=excluded.capabilities,
  hard_call_ceiling_daily=excluded.hard_call_ceiling_daily,
  cost_after_free_micros=excluded.cost_after_free_micros,
  auth_type=excluded.auth_type, cache_policy=excluded.cache_policy,
  retention_policy=excluded.retention_policy, adapter_module=excluded.adapter_module,
  documentation_url=excluded.documentation_url, last_verified_at=excluded.last_verified_at,
  updated_at=now();

create or replace function public.wf_reserve_free_provider_call(
  p_provider text, p_capability text, p_usage_date date, p_units integer default 1
) returns table (allowed boolean, reason text, calls bigint, free_units bigint)
language plpgsql security definer set search_path = public as $$
declare
  source_row public.wf_source_registry%rowtype;
  usage_row public.wf_provider_usage_daily%rowtype;
  provider_calls bigint;
begin
  if p_units is null or p_units < 1 then
    return query select false, 'invalid_units'::text, 0::bigint, 0::bigint;
    return;
  end if;
  select * into source_row from public.wf_source_registry where provider=p_provider;
  if not found or source_row.status <> 'healthy' or not source_row.internal_use then
    return query select false, 'provider_unavailable_or_rights_denied'::text, 0::bigint, 0::bigint;
    return;
  end if;
  if source_row.cost_after_free_micros is null or source_row.cost_after_free_micros <> 0 then
    return query select false, 'not_a_zero_cost_source'::text, 0::bigint, 0::bigint;
    return;
  end if;
  if source_row.hard_call_ceiling_daily is null or p_units > source_row.hard_call_ceiling_daily then
    return query select false, 'missing_or_insufficient_ceiling'::text, 0::bigint, 0::bigint;
    return;
  end if;

  insert into public.wf_provider_call_budget_daily(provider, usage_date, calls)
  values (p_provider, p_usage_date, p_units)
  on conflict (provider, usage_date) do update set
    calls=wf_provider_call_budget_daily.calls + excluded.calls,
    updated_at=now()
  where wf_provider_call_budget_daily.calls + excluded.calls <= source_row.hard_call_ceiling_daily
  returning wf_provider_call_budget_daily.calls into provider_calls;

  if not found then
    select b.calls into provider_calls from public.wf_provider_call_budget_daily b
      where b.provider=p_provider and b.usage_date=p_usage_date;
    return query select false, 'daily_ceiling_reached'::text,
      coalesce(provider_calls,0), coalesce(provider_calls,0);
    return;
  end if;

  insert into public.wf_provider_usage_daily(provider, capability, usage_date, calls, free_units)
  values (p_provider, p_capability, p_usage_date, p_units, p_units)
  on conflict (provider, capability, usage_date) do update set
    calls=wf_provider_usage_daily.calls + excluded.calls,
    free_units=wf_provider_usage_daily.free_units + excluded.free_units,
    updated_at=now()
  returning * into usage_row;
  return query select true, 'reserved'::text, provider_calls, usage_row.free_units;
end $$;

alter table public.wf_source_registry enable row level security;
alter table public.wf_provider_usage_daily enable row level security;
alter table public.wf_provider_call_budget_daily enable row level security;
revoke all on public.wf_source_registry from anon, authenticated;
revoke all on public.wf_provider_usage_daily from anon, authenticated;
revoke all on public.wf_provider_call_budget_daily from anon, authenticated;
revoke all on function public.wf_reserve_free_provider_call(text,text,date,integer) from public, anon, authenticated;
grant execute on function public.wf_reserve_free_provider_call(text,text,date,integer) to service_role;

comment on table public.wf_source_registry is 'Enforced source capabilities, rights, cost class, adapter and documentation provenance.';
comment on table public.wf_provider_usage_daily is 'Atomic provider call inventory; zero-cost calls are still finite inventory.';
comment on table public.wf_provider_call_budget_daily is 'One atomic daily ceiling shared by every capability of a provider.';
