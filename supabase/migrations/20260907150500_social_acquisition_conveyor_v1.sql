-- Private, provider-independent intake for indexed social links. Discovery is
-- not publication: an indexed title or view count can create a trend signal,
-- but never a Wayfind card or event date.

create table if not exists public.wf_social_discoveries (
  discovery_id text primary key,
  media_id text not null,
  provider text not null references public.wf_source_registry(provider),
  platform text not null check (platform in ('instagram','tiktok','facebook','youtube')),
  permalink text not null,
  creator_name text,
  creator_handle text,
  title text,
  observed_views bigint check (observed_views is null or observed_views >= 0),
  observed_likes bigint check (observed_likes is null or observed_likes >= 0),
  observed_comments bigint check (observed_comments is null or observed_comments >= 0),
  query_key text not null,
  query_region text not null default 'FL',
  seasonal_evidence jsonb not null default '[]'::jsonb,
  qualification_status text not null default 'new'
    check (qualification_status in ('new','trend_only','qualified','rejected')),
  qualification_reason text,
  candidate_place_id text,
  identity_status text not null default 'unresolved'
    check (identity_status in ('unresolved','candidate','verified','rejected')),
  identity_method text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, platform, permalink)
);

alter table public.wf_social_discoveries enable row level security;
revoke all on public.wf_social_discoveries from anon, authenticated;
grant select, insert, update, delete on public.wf_social_discoveries to service_role;
create index if not exists wf_social_discoveries_status_idx
  on public.wf_social_discoveries (qualification_status, last_seen_at desc);
create index if not exists wf_social_discoveries_platform_idx
  on public.wf_social_discoveries (platform, last_seen_at desc);

alter table if exists public.wf_social_candidates
  drop constraint if exists wf_social_candidates_source_check;
alter table if exists public.wf_social_candidates
  add constraint wf_social_candidates_source_check
  check (source in ('hashtag','business_discovery','search_index'));

insert into public.wf_source_registry (
  provider, source_class, capabilities, status, metered,
  hard_call_ceiling_daily, cost_after_free_micros, auth_type,
  cache_policy, retention_policy, internal_use, display_allowed,
  derived_facts_allowed, raw_redistribution_allowed, commercial_api_allowed,
  adapter_module, fallback_rank, documentation_url, last_verified_at
) values (
  'serpapi_social_free', 'permitted_search_index', array['indexed_short_video_search'],
  'healthy', true, 4, 0, 'api_key_with_runtime_free_plan_check',
  'private normalized links and factual counters only', '30 days unless re-observed',
  true, false, true, false, false, 'lib/socialAcquisition.js', 20,
  'https://serpapi.com/short-videos', date '2026-09-07'
)
on conflict (provider) do update set
  source_class=excluded.source_class, capabilities=excluded.capabilities,
  status=excluded.status, metered=excluded.metered,
  hard_call_ceiling_daily=excluded.hard_call_ceiling_daily,
  cost_after_free_micros=excluded.cost_after_free_micros,
  auth_type=excluded.auth_type, cache_policy=excluded.cache_policy,
  retention_policy=excluded.retention_policy, internal_use=excluded.internal_use,
  display_allowed=excluded.display_allowed, derived_facts_allowed=excluded.derived_facts_allowed,
  raw_redistribution_allowed=excluded.raw_redistribution_allowed,
  commercial_api_allowed=excluded.commercial_api_allowed,
  adapter_module=excluded.adapter_module, fallback_rank=excluded.fallback_rank,
  documentation_url=excluded.documentation_url, last_verified_at=excluded.last_verified_at,
  updated_at=now();

comment on table public.wf_social_discoveries is
  'Private acquisition inbox. Indexed social URLs and observable counters are leads/trend signals only; never a publication feed.';
