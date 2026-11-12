-- Social Trending ingestion (zero-miss guarantee). NOT APPLIED: owner applies
-- after review (scripts/migration-pending-apply.json).
--
-- wf_social_assets: Wayfind's own published posts synced by the scheduled
--   reconciler after the last deploy. lib/trendingSocialServer.js reads it
--   (service role) and merges it with the committed snapshot
--   data/social/wayfind-instagram.json; until this table exists the snapshot
--   is the whole inventory. Only status = 'published' rows can reach Trending
--   (lib/socialAssets.socialAssetEligibility).
-- wf_social_reconciliations: one row per reconciler run. The production
--   monitor (scripts/check-social-trending-live.mjs) fails when the newest
--   successful run is older than 36 hours.
--
-- Both tables: RLS on, no policies. Only the service role (server routes, the
-- reconciler) reads or writes; the browser never queries them.
create table if not exists public.wf_social_assets (
  permalink    text primary key check (permalink ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]+/?$'),
  owner        text not null default 'gowayfind.app',
  format       text not null check (format in ('reel', 'carousel', 'image')),
  status       text not null default 'published' check (status in ('created', 'scheduled', 'published', 'deleted')),
  published_at timestamptz,
  caption      text not null default '',
  kind         text not null default 'discovery' check (kind in ('discovery', 'brand')),
  kind_reason  text,
  twin_of      text,
  entities     jsonb not null default '[]'::jsonb check (jsonb_typeof(entities) = 'array'),
  metrics      jsonb not null default '{}'::jsonb,
  city         text,
  seasons      text[] not null default '{}',
  ingested_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists wf_social_assets_owner_published on public.wf_social_assets (owner, published_at desc);
alter table public.wf_social_assets enable row level security;

create table if not exists public.wf_social_reconciliations (
  id                  bigint generated always as identity primary key,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  ok                  boolean not null default false,
  source              text not null default 'metricool',
  published_total     integer,
  eligible            integer,
  trending            integer,
  excluded            integer,
  missing             integer,
  newest_published_at timestamptz,
  notes               jsonb not null default '{}'::jsonb
);
create index if not exists wf_social_reconciliations_ok_finished on public.wf_social_reconciliations (ok, finished_at desc);
alter table public.wf_social_reconciliations enable row level security;
