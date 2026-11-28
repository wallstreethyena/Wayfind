-- Planner gaps and the end of day gap report (owner order 2026-11-27: "if it's
-- not on Wayfind, I want them to report to me so that we can add them ... a
-- report at the end of the day").
--
-- wf_planner_gaps: one row per planner request Wayfind could not fully answer
-- (no plan, a thin plan, a city it does not cover, or named places it does not
-- have). PRIVACY: only the planner's structured reading is kept (city slug,
-- interest words, party word, budget word, day and stop counts, and names of
-- places asked for, each screened for personal data in lib/plannerGaps.js).
-- No visitor text, IP, user id or session. Rows older than 90 days are
-- deleted by the report job.
--
-- wf_planner_gap_reports: one plain text report per day, built by
-- app/api/cron/planner-gap-report. Web leads in it are pages to check, never
-- facts.
--
-- Both tables: RLS on, no policies, so only the service role reads or writes.
--
-- Reverse:
--   drop table if exists public.wf_planner_gap_reports;
--   drop table if exists public.wf_planner_gaps;

create table if not exists public.wf_planner_gaps (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  mode            text not null check (mode in ('picks', 'notes')),
  outcome         text not null check (outcome in ('OK', 'THIN', 'NO_PLAN', 'NEED_CITY', 'UNAVAILABLE')),
  metro           text check (metro is null or (char_length(metro) between 2 and 60 and metro ~ '^[a-z0-9]+([_-][a-z0-9]+)*$')),
  requested_city  text check (requested_city is null or (char_length(requested_city) between 1 and 40 and requested_city ~ '^[A-Za-z][A-Za-z .'']*$')),
  interests       text[] not null default '{}' check (cardinality(interests) <= 12),
  party           text check (party is null or party ~ '^[a-z_]{2,24}$'),
  kids            boolean not null default false,
  budget          text check (budget is null or budget ~ '^[a-z_]{2,24}$'),
  day_count       smallint check (day_count is null or day_count between 1 and 10),
  stop_count      smallint not null default 0 check (stop_count between 0 and 60),
  unmatched       text[] not null default '{}' check (cardinality(unmatched) <= 6),
  weather_lean    text check (weather_lean is null or weather_lean in ('rain', 'heat'))
);

create index if not exists wf_planner_gaps_created on public.wf_planner_gaps (created_at desc);

alter table public.wf_planner_gaps enable row level security;
revoke all on public.wf_planner_gaps from anon, authenticated;

create table if not exists public.wf_planner_gap_reports (
  report_date  date primary key,
  created_at   timestamptz not null default now(),
  requests     integer not null default 0 check (requests >= 0),
  summary      text not null check (char_length(summary) between 1 and 6000),
  body         jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 64000)
);

alter table public.wf_planner_gap_reports enable row level security;
revoke all on public.wf_planner_gap_reports from anon, authenticated;
