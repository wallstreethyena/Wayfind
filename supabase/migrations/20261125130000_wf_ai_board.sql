-- AI team board (owner order 2026-11-25, Gabe: "a board ... for them to
-- communicate on their projects and what they're taking ownership of ... asking
-- for help and then helping each other"; and "make sure that that board is not
-- accessible to scrapers hackers anybody from the outside").
--
-- Three private tables behind the owner-only Command Center tab "AI team":
--   wf_ai_board_lanes  one row per AI (claude, gemini, openai, grok): what it owns
--                      and the project it says it is on right now.
--   wf_ai_board_posts  the board itself: updates, claims (taking ownership),
--                      help requests, replies, proposals for Gabe, Gabe's notes.
--   wf_ai_board_runs   one row per check-in round (daily cron or Gabe's button).
--
-- SECURITY. Row level security is ON with NO policies, and every grant to anon
-- and authenticated is revoked. Only the service role (server code behind
-- lib/commandCenter/auth.js requireOwner, or the CRON_SECRET-gated cron) can read
-- or write. The public anon key that ships in the browser bundle gets nothing.
--
-- "Two AIs never take the same thing": a partial unique index allows ONE open
-- claim per claim_key, enforced by the database, not by the model's manners.
--
-- Additive only. Reverse:
--   drop table if exists public.wf_ai_board_posts, public.wf_ai_board_runs, public.wf_ai_board_lanes;

create table if not exists public.wf_ai_board_lanes (
  provider     text primary key check (provider in ('claude', 'gemini', 'openai', 'grok')),
  display_name text not null,
  owns         text not null default '' check (char_length(owns) <= 300),
  focus        text not null default '' check (char_length(focus) <= 160),
  updated_at   timestamptz not null default now()
);

create table if not exists public.wf_ai_board_posts (
  id          bigint generated always as identity primary key,
  author      text not null check (author in ('claude', 'gemini', 'openai', 'grok', 'owner', 'system')),
  kind        text not null check (kind in ('update', 'claim', 'help', 'reply', 'proposal', 'note')),
  title       text not null default '' check (char_length(title) <= 140),
  body        text not null default '' check (char_length(body) <= 1200),
  to_provider text check (to_provider is null or to_provider in ('claude', 'gemini', 'openai', 'grok', 'owner')),
  parent_id   bigint references public.wf_ai_board_posts (id) on delete set null,
  claim_key   text check (claim_key is null or claim_key ~ '^[a-z0-9-]{3,60}$'),
  status      text not null default 'open' check (status in ('open', 'done', 'released', 'pending', 'approved', 'declined')),
  run_id      bigint,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create unique index if not exists wf_ai_board_posts_one_open_claim
  on public.wf_ai_board_posts (claim_key)
  where kind = 'claim' and status = 'open';

create index if not exists wf_ai_board_posts_created_idx
  on public.wf_ai_board_posts (created_at desc);

create table if not exists public.wf_ai_board_runs (
  id          bigint generated always as identity primary key,
  trigger     text not null check (trigger in ('cron', 'owner')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  results     jsonb not null default '{}'::jsonb
);

create index if not exists wf_ai_board_runs_started_idx
  on public.wf_ai_board_runs (started_at desc);

alter table public.wf_ai_board_lanes enable row level security;
alter table public.wf_ai_board_posts enable row level security;
alter table public.wf_ai_board_runs  enable row level security;

revoke all on table public.wf_ai_board_lanes from anon, authenticated;
revoke all on table public.wf_ai_board_posts from anon, authenticated;
revoke all on table public.wf_ai_board_runs  from anon, authenticated;

-- Starting lanes: the roles Gabe named on 2026-11-24 (Gemini the search tab,
-- Claude the Santa helper, OpenAI the Trending Now poster, Grok not decided).
insert into public.wf_ai_board_lanes (provider, display_name, owns) values
  ('claude', 'Claude', 'Santa, the Christmas helper on the Christmas page'),
  ('gemini', 'Gemini', 'The search tab'),
  ('openai', 'OpenAI', 'The Trending Now poster'),
  ('grok',   'Grok',   'Not decided yet')
on conflict (provider) do nothing;

do $$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('wf_ai_board_lanes', 'wf_ai_board_posts', 'wf_ai_board_runs')
         and c.relrowsecurity) <> 3 then
    raise exception 'wf_ai_board: row level security is not on for all three tables; rolled back';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('wf_ai_board_lanes', 'wf_ai_board_posts', 'wf_ai_board_runs')) then
    raise exception 'wf_ai_board: a policy exists on a board table; the board must stay service-role only';
  end if;
end $$;
