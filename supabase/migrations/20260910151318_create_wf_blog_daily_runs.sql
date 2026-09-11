create table if not exists public.wf_blog_daily_runs (
  run_date date primary key,                       -- America/New_York calendar date of the daily run
  article_mode text not null default 'pending'
    check (article_mode in ('pending','new','reshare','none')),
  slug text,                                       -- article promoted today (new or reshared)
  metro text,
  category text,
  intent text,                                     -- e.g. weekend-plans, date-night, family, brunch
  item_count int,
  fb_status text not null default 'pending'
    check (fb_status in ('pending','scheduled','posted','blocked','skipped')),
  fb_scheduled_for timestamptz,
  fb_window text,                                  -- default | intent | learned | test
  fb_time_reason text,
  caption text,
  hook_type text,                                  -- curiosity | usefulness | timely | local-identity | question | surprise
  tracked_url text,
  fb_post_url text,
  retries int not null default 0,
  metrics jsonb not null default '{}'::jsonb,      -- backfilled later: fb_link_clicks, fb_reach, blog_visits, blog_to_wayfind
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.wf_blog_daily_runs is
  'Private run log for the daily blog + Facebook automation: idempotency (one row per ET date) and the learning loop for topics, hooks and posting windows. Service role only.';

alter table public.wf_blog_daily_runs enable row level security;
revoke all on table public.wf_blog_daily_runs from anon, authenticated;
