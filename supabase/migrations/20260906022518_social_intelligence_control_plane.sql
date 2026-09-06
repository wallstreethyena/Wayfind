-- Private control plane for qualified social discovery. Leads never publish directly.

create table if not exists public.wf_social_creators (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram','tiktok','facebook','creator_submission')),
  handle text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  qualification_basis text,
  follower_count bigint check (follower_count is null or follower_count >= 0),
  evidence_url text,
  canonical_place_id text,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, handle),
  constraint wf_social_creators_approval_ck check (
    status <> 'approved' or
    (evidence_url is not null and reviewed_at is not null and expires_at > reviewed_at)
  )
);

create table if not exists public.wf_source_evidence (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('social_lead','place_candidate','trend_signal')),
  entity_id text not null,
  field_name text not null,
  source_provider text not null,
  source_url text,
  evidence_quote text,
  evidence_hash text not null,
  observed_at timestamptz not null,
  expires_at timestamptz,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  verification_status text not null check (verification_status in ('observed','candidate','verified','rejected')),
  internal_use boolean not null default false,
  display_allowed boolean not null default false,
  derived_facts_allowed boolean not null default false,
  raw_redistribution_allowed boolean not null default false,
  commercial_api_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, field_name, evidence_hash)
);

create table if not exists public.wf_social_trend_reports (
  id uuid primary key default gen_random_uuid(),
  region text not null default 'FL',
  window_start timestamptz not null,
  window_end timestamptz not null,
  policy_version text not null,
  report jsonb not null,
  qualified_leads integer not null default 0,
  generated_at timestamptz not null default now(),
  unique (region, window_start, window_end, policy_version)
);

alter table if exists public.wf_social_candidates
  add column if not exists qualification_policy text,
  add column if not exists qualification_reason text,
  add column if not exists qualification_evidence jsonb,
  add column if not exists creator_qualified boolean not null default false,
  add column if not exists source_place_id text,
  add column if not exists location_name text,
  add column if not exists location_city text,
  add column if not exists location_address text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists identity_status text not null default 'unresolved',
  add column if not exists identity_method text,
  add column if not exists candidate_place_id text,
  add column if not exists extracted_facts jsonb,
  add column if not exists enriched_at timestamptz;

alter table if exists public.wf_social_candidates
  drop constraint if exists wf_social_candidates_location_pair_ck;
alter table if exists public.wf_social_candidates
  add constraint wf_social_candidates_location_pair_ck check (
    (location_lat is null and location_lng is null) or
    (location_lat is not null and location_lng is not null and
     location_lat between -90 and 90 and location_lng between -180 and 180)
  );

alter table public.wf_social_creators enable row level security;
alter table public.wf_source_evidence enable row level security;
alter table public.wf_social_trend_reports enable row level security;
revoke all on public.wf_social_creators from anon, authenticated;
revoke all on public.wf_source_evidence from anon, authenticated;
revoke all on public.wf_social_trend_reports from anon, authenticated;

create index if not exists wf_social_creators_status_idx on public.wf_social_creators (platform, status, expires_at);
create index if not exists wf_source_evidence_entity_idx on public.wf_source_evidence (entity_type, entity_id, observed_at desc);
create index if not exists wf_social_candidates_identity_idx on public.wf_social_candidates (identity_status, last_seen_at desc);

comment on table public.wf_social_creators is 'Owner-reviewed creator qualification registry; watched handles are not implicitly approved.';
comment on table public.wf_source_evidence is 'Private field-level provenance and rights. No raw social payload is commercially redistributable by default.';
comment on table public.wf_social_trend_reports is 'Private weekly aggregate of qualified Florida Fall social leads; never a publication feed.';
