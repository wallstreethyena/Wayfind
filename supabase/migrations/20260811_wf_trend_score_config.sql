-- 20260811_wf_trend_score_config.sql — the Trend Momentum Score model (M1/M2 of
-- the Trend Intelligence Engine brief, owner-approved 2026-08-11).
--
-- NAMING (owner decision pending, default applied): the brief calls this "the
-- Wayfind Score", but Wayfind already shows users a Wayfind Score (the governed
-- /10 place score). This model is therefore the TREND MOMENTUM SCORE everywhere
-- in code and data. Users only ever see the public labels.
--
-- ONE CONFIGURABLE MODEL. Weights live here (one active row) and in
-- lib/trendScore.js's DEFAULT_WEIGHTS fallback — the guard asserts the two
-- agree, so neither can drift. Service-role only: trend internals never reach
-- the anon client (same posture as the other wf_trend_* tables).

create table if not exists public.wf_trend_score_config (
  id          uuid primary key default gen_random_uuid(),
  version     text not null,                     -- e.g. 'tms-v1'
  weights     jsonb not null,                    -- { growth:.12, demand:.15, ... } sums to 1
  thresholds  jsonb not null,                    -- { exploding:85, rising:75, building:65 }
  labels      jsonb not null,                    -- momentum -> public label (Wayfind language only)
  active      boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now()
);

-- exactly one active model at a time
create unique index if not exists wf_trend_score_config_one_active
  on public.wf_trend_score_config (active) where active;

alter table public.wf_trend_score_config enable row level security;
revoke all on public.wf_trend_score_config from anon, authenticated;

insert into public.wf_trend_score_config (version, weights, thresholds, labels, active, notes)
select 'tms-v1',
  '{"growth":0.12,"demand":0.15,"velocity":0.13,"localIntent":0.16,"bookability":0.12,"quality":0.12,"freshness":0.10,"confidence":0.10}'::jsonb,
  '{"exploding":85,"rising":75,"building":65}'::jsonb,
  '{"exploding":"Taking off","rising":"On the rise","building":"Getting noticed","watch":"Worth watching"}'::jsonb,
  true,
  'Initial workbook weights (brief of 2026-08-11). Change via a new row + active flip, never in place.'
where not exists (select 1 from public.wf_trend_score_config where version = 'tms-v1');

-- Additive columns on the topic store: the computed model outputs and the geo
-- scope the brief requires. All nullable — existing rows and the CSV ingest are
-- untouched; the scorer fills them.
alter table public.wf_trend_topics add column if not exists trend_score numeric;
alter table public.wf_trend_topics add column if not exists momentum text;
alter table public.wf_trend_topics add column if not exists public_label text;
alter table public.wf_trend_topics add column if not exists component_scores jsonb;
alter table public.wf_trend_topics add column if not exists model_version text;
alter table public.wf_trend_topics add column if not exists suppression_reason text;
alter table public.wf_trend_topics add column if not exists country text;
alter table public.wf_trend_topics add column if not exists state text;
alter table public.wf_trend_topics add column if not exists city text;
alter table public.wf_trend_topics add column if not exists lat double precision;
alter table public.wf_trend_topics add column if not exists lng double precision;
