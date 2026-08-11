-- 20260811_wf_trend_signals.sql — live external trend-signal observations
-- (Trend Intelligence Engine M3: the first two wired live sources).
--
-- Each row is one observation: "source X saw keyword K, matched to concept C,
-- with these growth/demand figures, at time T". The trend-signals cron writes
-- them; the scorer reads the recent window and BLENDS them into the factor set
-- (lib/trendSources/blend.js) before trendMomentumScore runs.
--
-- PROVENANCE INTERNAL-ONLY: the source column names providers; this table is
-- service-role only (same posture as every wf_trend_* table) and no serving
-- path exposes it. Public copy speaks Wayfind language via PUBLIC_LABELS.

create table if not exists public.wf_trend_signals (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,
  concept_key      text not null,
  keyword          text not null,
  region           text not null default 'US',
  match_confidence numeric,
  growth_wow       numeric,             -- percents as the source reports them
  growth_mom       numeric,
  growth_yoy       numeric,
  demand_index     numeric,             -- normalized 0..1 (source-relative)
  observed_at      timestamptz not null,
  observed_on      date not null default ((now() at time zone 'utc')::date),
  created_at       timestamptz not null default now(),
  constraint wf_trend_signals_source_ck
    check (source in ('pinterest','google_trends'))
);

-- One observation per source x concept x keyword x day: re-running the cron
-- the same day is an upsert, not a duplicate row (idempotent at the database,
-- the same doctrine as wf_trend_snapshots_hash).
create unique index if not exists wf_trend_signals_daily
  on public.wf_trend_signals (source, concept_key, keyword, observed_on);
create index if not exists wf_trend_signals_concept_recent
  on public.wf_trend_signals (concept_key, observed_at desc);

alter table public.wf_trend_signals enable row level security;
revoke all on public.wf_trend_signals from anon, authenticated;

comment on table public.wf_trend_signals is
  'Live external trend-signal observations. Provider names are internal-only; public copy never reads this table directly — signals reach users only as blended factors inside the Trend Momentum Score.';
