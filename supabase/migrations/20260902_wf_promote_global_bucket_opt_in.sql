-- 20260902_wf_promote_global_bucket_opt_in.sql
--
-- WO7 (2026-09-02) — "everything available everywhere" (owner): curated
-- places from the owner's reels now get a Wayfind page wherever they
-- physically are, not just inside Wayfind's four served Florida metros. That
-- requires a 'global' bucket in the SAME geography table the rest of
-- promotion already reads (public.wf_promote_metros / wf_bucket_metro()) — a
-- place outside every named metro box currently buckets to NULL and is
-- invisible to bucketMetro(), decidePromotion(), and every other consumer
-- keyed by metro.
--
-- THE GUARDRAIL THIS FILE IS ABOUT. Adding a metro whose box is the whole
-- planet must NOT turn on automated Google spend everywhere. The owner's rule
-- has two halves: curated (creator-sourced, human-picked) places go global;
-- the AUTOMATED promotion pipeline — the thing that spends real Google Places
-- money turning index rows into inventory cards — stays Florida-first. There
-- are exactly TWO code paths that put a place_id into wf_promotion_queue, and
-- both are patched here so 'global' is opt-in on both, not just one:
--
--   1. wf_enqueue_promotion() / the wf_place_ids_enqueue trigger — fires on
--      EVERY insert or update to wf_place_ids, including the live-traffic
--      index writes lib/serverCache.upsertPlaceIds makes for ordinary user
--      requests anywhere in the world. Before this file, this path enqueues
--      whatever wf_bucket_metro() returns with no metro-name check. Left
--      unpatched, an active whole-planet box here would flip automated
--      promotion queueing on for the 13,155+ out-of-market index rows
--      20260813_wf_promote_metros.sql's own comment says Wayfind does not
--      serve — silently undoing the "Florida-first" half of the owner's rule
--      the moment this migration applied. Patched below to skip (not queue)
--      when the bucket is 'global'.
--
--   2. wf_promotion_backfill() — the nightly cron sweep
--      (20260813_wf_promotion_cron_and_lockdown.sql calls it as
--      wf_promotion_backfill(null, 2000); app/api/cron/promote-backfill and
--      scripts/enqueue-inbox.mjs both also always call it with p_metro:
--      null) that catches any index row the trigger missed. Patched below
--      with the predicate the work order specified: excluded from an
--      all-metros sweep (p_metro is null — the only form any real caller in
--      this repo ever uses), but still reachable by an operator who
--      explicitly asks for it by name (wf_promotion_backfill('global', ...))
--      — the opt-in.
--
-- Curated (non-automated) attachment — a creator's venue getting a Wayfind
-- page via lib/creatorVideos.js plus a direct wf_place_ids row, as in
-- scripts/data/owner-reels-2026-09-02.sql — never goes through
-- wf_promotion_queue at all, so neither guard below touches it. That is the
-- "curated places get cards wherever they are" half of the rule; the two
-- patches below are the "automated spend stays Florida-first" half.
--
-- Mirrored in lib/promoteIndex.js PROMOTE_METROS (the offline fallback) so
-- scripts/check-promote-metros-parity.mjs and
-- scripts/check-promote-metros-live-drift.mjs stay meaningful rather than
-- silently blind to this row.

-- 1. The bucket itself. Same 5-value row shape as the seed migration's INSERT
--    (metro, min_lat, max_lat, min_lng, max_lng) — active defaults to true per
--    the table's own column default, set explicitly on conflict so re-running
--    this file re-activates a 'global' row someone deactivated live.
insert into public.wf_promote_metros (metro, min_lat, max_lat, min_lng, max_lng) values
  ('global', -90, 90, -180, 180)
on conflict (metro) do update
  set active = true, min_lat = excluded.min_lat, max_lat = excluded.max_lat,
      min_lng = excluded.min_lng, max_lng = excluded.max_lng;

-- 2. wf_enqueue_promotion() — identical body to 20260813_wf_promotion_queue.sql,
--    with one added early-return: a 'global' bucket is a discovery fact
--    ("this place is somewhere"), not a promotion instruction. Skips instead
--    of queuing, so the trigger stays fail-soft and this never raises.
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
    -- Index rows outside every served box land here. Correct: Wayfind does
    -- not automatically promote those markets.
    return 'skip:outside-served-metros';
  end if;

  -- WO7 opt-in guard. 'global' exists so a place outside every named metro
  -- still resolves to SOMETHING when a curated flow looks it up directly; it
  -- must never make the automated trigger queue that place for a paid
  -- Details call. Automated promotion stays scoped to the named metros.
  if v_metro = 'global' then
    return 'skip:global-bucket-not-automated';
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

-- 3. wf_promotion_backfill() — identical body to 20260813_wf_promotion_queue.sql,
--    with the work order's predicate added to the keep CTE: a whole-metros
--    sweep (p_metro is null, the only form any real caller in this repo uses)
--    never picks up 'global'-bucketed rows; an operator who explicitly asks
--    for p_metro = 'global' still can.
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
       and (p_metro is not null or m <> 'global')
     order by rv desc
     limit greatest(0, coalesce(p_limit, 1000))
  )
  insert into public.wf_promotion_queue (place_id, metro, priority, reason)
  select place_id, m, least(greatest(rv, 0), 1000000), 'backfill' from keep
  on conflict (place_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.wf_promotion_backfill(text, integer) is
  'Enqueues index rows outside wf_inventory into wf_promotion_queue, highest-review-count first, inside served metros only. A whole-metros sweep (p_metro null, the only form any caller in this repo uses) skips the global bucket by design -- explicit wf_promotion_backfill(''global'', N) still reaches it. See 20260902_wf_promote_global_bucket_opt_in.sql.';

comment on function public.wf_enqueue_promotion(text, text) is
  'Trigger-path enqueue for a single place. Skips (not queues) a global-bucketed place -- automated promotion is opt-in for anywhere outside the named Florida metros, matching wf_promotion_backfill. See 20260902_wf_promote_global_bucket_opt_in.sql.';

comment on table public.wf_promote_metros is
  'Authoritative promotion bounding boxes. Mirrors PROMOTE_METROS in lib/promoteIndex.js; parity is enforced by scripts/check-promote-metros-parity.mjs and scripts/check-promote-metros-live-drift.mjs. Only places inside an active, NAMED box are ever automatically promoted into wf_inventory -- ''global'' (added 2026-09-02) is the one deliberate exception: an always-active catch-all so any place resolves to SOME metro bucket, but excluded from automated enqueue by both wf_enqueue_promotion() and wf_promotion_backfill() unless a caller asks for it by name. Curated place cards (lib/creatorVideos.js) never go through wf_promotion_queue and are unaffected either way.';
