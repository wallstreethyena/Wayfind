-- 20260901_wf_promote_config.sql — the drain rate's ONE config row.
--
-- NOT APPLIED YET. Committed migration only — the parent session applies this
-- to live Supabase (see the PR this ships in). Written to match this repo's
-- other single-purpose config rows (public.wf_scout_verdicts-style RLS: enabled,
-- zero policies, service-role only by design — see 20260822_wf_scout_verdicts.sql).
--
-- WHY. app/api/cron/promote-index/route.js and scripts/promote-worker.mjs were
-- both pinned to a hardcoded 25-per-invocation batch (~$0.43 ceiling), drained
-- 4x/hour = ~100/hour. This table lets the cron self-tune that number between
-- runs — up when a batch clears clean, down (fast) on errors or a Google 429 —
-- inside hard bounds, so throughput adapts without a code deploy and without
-- ever being able to run away. See lib/promoteThrottle.js for the pure
-- clamp/step functions both the route and the worker share.
--
-- SINGLE ROW BY DESIGN (id=1, enforced by the check constraint below — not a
-- unique index on a constant, which the planner can still elide in a race; the
-- CHECK makes a second row a hard rejection at insert time, same species of
-- protection as wf_scout_verdicts' accepted/section CHECK).
create table if not exists public.wf_promote_config (
  id                integer primary key default 1,
  batch_limit       integer not null default 25,
  min_interval_note text,
  auto              boolean not null default true,
  last_run_promoted integer,
  last_run_rejected integer,
  last_run_errors   integer,
  updated_at        timestamptz not null default now(),
  constraint wf_promote_config_singleton_ck check (id = 1),
  -- Defense in depth: even a hand-written UPDATE cannot push batch_limit past
  -- what the claim RPC (wf_promotion_claim) already hard-caps server-side at
  -- 50, and never below 1 (0 would silently stop the drain with no error).
  constraint wf_promote_config_batch_limit_ck check (batch_limit between 1 and 50)
);

alter table public.wf_promote_config enable row level security;

comment on table public.wf_promote_config is
  'Single-row (id=1) adaptive throttle for the promotion drain. Service-role only: no policies by design — anon/authenticated get zero rows. batch_limit is read live by app/api/cron/promote-index and scripts/promote-worker.mjs (see lib/promoteThrottle.js), and adjusted by the cron itself when auto=true. min_interval_note is operator-facing documentation only (e.g. "vercel.json fires this every 5 minutes"), read by nothing.';

insert into public.wf_promote_config (id, batch_limit, min_interval_note, auto)
values (1, 25, 'vercel.json fires /api/cron/promote-index every 5 minutes (*/5 * * * *); batch_limit self-tunes 5..50 between runs when auto=true.', true)
on conflict (id) do nothing;
