-- 20260813_wf_promotion_queue.sql
--
-- THE DEFECT THIS CLOSES. Every place a user has ever surfaced is logged in
-- wf_place_ids (20,215 rows). Only 3,771 of them are cards in wf_inventory. The
-- promoter that closes that gap -- scripts/promote-index.mjs -- exists, works, and
-- has to be run BY HAND. Nobody ran it. Measured 2026-08-13, within 10 miles of
-- Parrish: 364 places in the index, 62 promoted. That is the whole of the "why is
-- everything more than 9 miles away" report. It was never a ranking problem.
--
-- THE RULE THIS OBEYS. Sparse local inventory is NOT solved by calling Google when
-- a user opens the app. This queue makes promotion inventory-first, incremental
-- and asynchronous: the app reads owned inventory, the queue fills in the
-- background, and coverage improves on its own between sessions.
--
-- THE LESSON FROM atlas-build (#438), ENCODED HERE. That job removed a place from
-- its own future queue every time it failed to source it -- 25 rows/hour of
-- permanently destroyed eligibility, invisible because every invocation returned
-- HTTP 200. So in this queue a failure NEVER deletes a row and NEVER makes a place
-- ineligible in a way you cannot see:
--   * a failed attempt goes back to 'pending' with exponential backoff,
--   * exhausting max_attempts sets 'rejected' and KEEPS the row, the attempt
--     count and the exact error,
--   * wf_promotion_retry() puts a rejected place back in play deliberately.
-- The queue is therefore a permanent, readable ledger of what has not been
-- promoted and precisely why.

create table if not exists public.wf_promotion_queue (
  place_id        text primary key references public.wf_place_ids(place_id) on delete cascade,
  metro           text not null,
  status          text not null default 'pending',
  priority        integer not null default 0,
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  reason          text not null default 'trigger',
  enqueued_at     timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  claimed_at      timestamptz,
  last_attempt_at timestamptz,
  last_error      text,
  reject_reason   text,
  promoted_at     timestamptz,
  constraint wf_promotion_queue_status_ck
    check (status in ('pending', 'working', 'done', 'rejected'))
);

comment on table public.wf_promotion_queue is
  'Work queue: index places (wf_place_ids) awaiting promotion into wf_inventory. Append-and-update only - a failure never deletes a row, so this doubles as the permanent ledger of what is unpromoted and why.';
comment on column public.wf_promotion_queue.priority is
  'Google review count at enqueue time. Best-known places promote first, so the first batch is also the most useful batch.';
comment on column public.wf_promotion_queue.reject_reason is
  'Terminal cause: max attempts, unclassifiable, or non-operational. The row stays queryable and wf_promotion_retry() can re-arm it.';

create index if not exists wf_promotion_queue_ready_idx
  on public.wf_promotion_queue (metro, priority desc, enqueued_at)
  where status = 'pending';
create index if not exists wf_promotion_queue_lease_idx
  on public.wf_promotion_queue (claimed_at)
  where status = 'working';
create index if not exists wf_promotion_queue_status_idx
  on public.wf_promotion_queue (status);

-- enqueue -------------------------------------------------------------------
-- Idempotent and cheap enough to sit on the discovery-index write path. Returns a
-- reason string rather than raising, so the trigger has nothing to swallow in the
-- normal case.
create or replace function public.wf_enqueue_promotion(p_place_id text, p_reason text default 'trigger')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lat     double precision;
  v_lng     double precision;
  v_reviews integer;
  v_metro   text;
begin
  if p_place_id is null or length(trim(p_place_id)) = 0 then
    return 'skip:no-id';
  end if;

  -- Already a card. Promotion is a one-way door; refresh is a different job
  -- (wf_inventory.refreshed_at), deliberately not this one.
  if exists (select 1 from public.wf_inventory where place_id = p_place_id) then
    return 'skip:already-inventory';
  end if;

  select p.lat, p.lng, coalesce((p.signals->>'reviews')::integer, 0)
    into v_lat, v_lng, v_reviews
    from public.wf_place_ids p
   where p.place_id = p_place_id;

  if v_lat is null or v_lng is null then
    return 'skip:no-coords';
  end if;

  v_metro := public.wf_bucket_metro(v_lat, v_lng);
  if v_metro is null then
    -- 13,155 index rows land here. Correct: Wayfind does not serve those markets.
    return 'skip:outside-served-metros';
  end if;

  insert into public.wf_promotion_queue (place_id, metro, priority, reason)
  values (p_place_id, v_metro, least(greatest(v_reviews, 0), 1000000), p_reason)
  on conflict (place_id) do update
     set metro    = excluded.metro,
         priority = greatest(wf_promotion_queue.priority, excluded.priority);
  -- NOTE the deliberate omission: status is NOT reset here. A place the index
  -- re-sees every day must not silently re-enter a queue that has already
  -- rejected it three times -- that is a hot loop that spends money forever. Use
  -- wf_promotion_retry() to re-arm rejects on purpose.

  return 'queued:' || v_metro;
exception when others then
  return 'error:' || left(sqlerrm, 120);
end $$;

-- the trigger ---------------------------------------------------------------
-- FAIL-SOFT BY CONSTRUCTION. lib/serverCache.upsertPlaceIds writes up to 60 index
-- rows on a live request path. Promotion book-keeping must never be able to fail
-- that write, so the whole call is wrapped and any exception is discarded.
create or replace function public.wf_place_ids_enqueue_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.wf_enqueue_promotion(new.place_id, 'index-write');
  exception when others then
    null;
  end;
  return null;
end $$;

drop trigger if exists wf_place_ids_enqueue on public.wf_place_ids;
create trigger wf_place_ids_enqueue
after insert or update on public.wf_place_ids
for each row execute function public.wf_place_ids_enqueue_trg();

-- claim ---------------------------------------------------------------------
-- FOR UPDATE SKIP LOCKED so two overlapping cron fires can never hand the same
-- place to two workers and pay Google twice for it.
--
-- attempts increments at CLAIM time, not at completion. A worker that is killed
-- mid-flight still burns an attempt, which is what stops a poison-pill row from
-- being retried forever. The lease reclaim below returns crashed rows to the
-- queue without a second increment.
create or replace function public.wf_promotion_claim(
  p_metro          text    default null,
  p_limit          integer default 10,
  p_lease_minutes  integer default 15
)
returns table (
  place_id text,
  name     text,
  lat      double precision,
  lng      double precision,
  metro    text,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wf_promotion_queue q
     set status = 'pending', claimed_at = null
   where q.status = 'working'
     and q.claimed_at < now() - make_interval(mins => greatest(1, p_lease_minutes));

  return query
  with picked as (
    select q.place_id
      from public.wf_promotion_queue q
     where q.status = 'pending'
       and q.next_attempt_at <= now()
       and (p_metro is null or q.metro = p_metro)
     order by q.priority desc, q.enqueued_at asc
     limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update skip locked
  )
  update public.wf_promotion_queue q
     set status          = 'working',
         claimed_at      = now(),
         last_attempt_at = now(),
         attempts        = q.attempts + 1
    from picked pk
    join public.wf_place_ids ix on ix.place_id = pk.place_id
   where q.place_id = pk.place_id
  returning q.place_id, ix.name, ix.lat, ix.lng, q.metro, q.attempts;
end $$;

-- complete ------------------------------------------------------------------
-- p_reject = a verdict, not an error: the place is unclassifiable, or Google says
-- it is closed. Retrying those spends money to reach the same answer.
create or replace function public.wf_promotion_complete(
  p_place_id text,
  p_ok       boolean,
  p_error    text    default null,
  p_reject   boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_max      integer;
begin
  select attempts, max_attempts into v_attempts, v_max
    from public.wf_promotion_queue where place_id = p_place_id;
  if not found then
    return 'unknown';
  end if;

  if p_ok then
    update public.wf_promotion_queue
       set status = 'done', promoted_at = now(), claimed_at = null,
           last_error = null, reject_reason = null
     where place_id = p_place_id;
    return 'done';
  end if;

  if p_reject then
    update public.wf_promotion_queue
       set status = 'rejected', claimed_at = null,
           last_error = left(p_error, 500), reject_reason = left(coalesce(p_error, 'rejected'), 200)
     where place_id = p_place_id;
    return 'rejected';
  end if;

  if v_attempts >= v_max then
    update public.wf_promotion_queue
       set status = 'rejected', claimed_at = null,
           last_error = left(p_error, 500), reject_reason = 'max attempts'
     where place_id = p_place_id;
    return 'rejected:max-attempts';
  end if;

  -- Exponential backoff, capped at a day: 10m, 30m, 90m...
  update public.wf_promotion_queue
     set status          = 'pending',
         claimed_at      = null,
         last_error      = left(p_error, 500),
         next_attempt_at = now() + make_interval(mins => least((power(3, greatest(v_attempts, 1) - 1) * 10)::integer, 1440))
   where place_id = p_place_id;
  return 'retry';
end $$;

-- retry ---------------------------------------------------------------------
-- Deliberate re-arming of rejects, e.g. after a classifier change. Never
-- automatic: a rejected place that re-queues itself is an unbounded spend loop.
create or replace function public.wf_promotion_retry(
  p_metro  text    default null,
  p_reason text    default null,
  p_limit  integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer := 0;
begin
  with pick as (
    select place_id from public.wf_promotion_queue
     where status = 'rejected'
       and (p_metro is null or metro = p_metro)
       and (p_reason is null or reject_reason ilike '%' || p_reason || '%')
     order by priority desc
     limit greatest(0, p_limit)
  )
  update public.wf_promotion_queue q
     set status = 'pending', attempts = 0, next_attempt_at = now(), claimed_at = null
    from pick where q.place_id = pick.place_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- backfill ------------------------------------------------------------------
-- Idempotent and batched: enqueues index rows that are neither inventory cards
-- nor already queued, highest-review-count first, inside served metros only.
-- Safe to call repeatedly; returns how many it actually added.
create or replace function public.wf_promotion_backfill(
  p_metro text    default null,
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer := 0;
begin
  with cand as (
    select p.place_id,
           public.wf_bucket_metro(p.lat, p.lng) as m,
           coalesce((p.signals->>'reviews')::integer, 0) as rv
      from public.wf_place_ids p
     where p.lat is not null and p.lng is not null
       and not exists (select 1 from public.wf_inventory     i where i.place_id = p.place_id)
       and not exists (select 1 from public.wf_promotion_queue q where q.place_id = p.place_id)
  ), keep as (
    select place_id, m, rv from cand
     where m is not null and (p_metro is null or m = p_metro)
     order by rv desc
     limit greatest(0, coalesce(p_limit, 1000))
  )
  insert into public.wf_promotion_queue (place_id, metro, priority, reason)
  select place_id, m, least(greatest(rv, 0), 1000000), 'backfill' from keep
  on conflict (place_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- health --------------------------------------------------------------------
-- One row per metro per status. This is what /api/cron/job-watch and the command
-- centre read; "the queue is draining" and "the queue is spinning" must be
-- distinguishable without opening the table.
create or replace view public.wf_promotion_health as
  select q.metro,
         q.status,
         count(*)                                                       as places,
         sum(case when q.attempts > 0 then 1 else 0 end)                as attempted,
         max(q.last_attempt_at)                                         as last_attempt_at,
         max(q.promoted_at)                                             as last_promoted_at,
         (array_agg(q.reject_reason order by q.last_attempt_at desc nulls last)
            filter (where q.reject_reason is not null))[1]              as newest_reject_reason
    from public.wf_promotion_queue q
   group by q.metro, q.status;

comment on view public.wf_promotion_health is
  'Queue depth and drain rate by metro and status. A metro whose pending count is flat while attempted climbs is the atlas-build failure shape - attempting work, accomplishing none.';
