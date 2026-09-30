-- 2026-09-28: a TEMPORARILY closed place is not a permanent fact.
--
-- decidePromotion() rejects a place whose Google businessStatus is
-- CLOSED_TEMPORARILY, and wf_promotion_complete(p_reject := true) makes that
-- terminal. Nothing ever re-armed it. Measured on production today: 47 such
-- rejects, every one last looked at on or before 2026-09-01, 18 of them rated
-- 9.0+ — Knaus Berry Farm (seasonal, reopens every late fall), the Cici & Hyatt
-- Brown Museum and Ann Norton Sculpture Gardens (renovation closures), the
-- Marietta Museum of Art & Whimsy, Anna Maria Island Historical Society. Each
-- reopening stayed invisible on Wayfind forever.
--
-- wf_promotion_retry() stays deliberate (its header: "a rejected place that
-- re-queues itself is an unbounded spend loop"). This function is the bounded
-- exception, and it is bounded three ways:
--   1. ONLY reject_reason = 'non-operational status: CLOSED_TEMPORARILY'.
--      CLOSED_PERMANENTLY, unclassified, scout negatives, 404s: never touched.
--   2. ONLY rows whose last_attempt_at is at least p_min_age_days old
--      (default 30). wf_promotion_claim stamps last_attempt_at on every claim,
--      so each place is re-checked at most once per window — ~47 Details calls
--      a month at today's count, inside the Pro free tier.
--   3. p_limit per run (default 100).
-- The re-armed row still goes through the worker's per-call spend ledger
-- grant (spendAllowCapped) and the SAME decidePromotion() — a place that is
-- still closed is simply rejected again, a reopened one becomes a card.

create or replace function public.wf_promotion_recheck_temp_closed(
  p_min_age_days integer default 30,
  p_limit        integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer := 0;
begin
  with pick as (
    select q.place_id
      from public.wf_promotion_queue q
     where q.status = 'rejected'
       and q.reject_reason = 'non-operational status: CLOSED_TEMPORARILY'
       and coalesce(q.last_attempt_at, q.enqueued_at)
             < now() - make_interval(days => greatest(7, coalesce(p_min_age_days, 30)))
       and not exists (select 1 from public.wf_inventory i where i.place_id = q.place_id)
     order by q.priority desc
     limit greatest(0, least(coalesce(p_limit, 100), 500))
  )
  update public.wf_promotion_queue q
     set status          = 'pending',
         attempts        = 0,
         next_attempt_at = now(),
         claimed_at      = null,
         reject_reason   = null,
         last_error      = 'temp-closed recheck: last seen CLOSED_TEMPORARILY',
         reason          = 'temp-closed-recheck'
    from pick
   where q.place_id = pick.place_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.wf_promotion_recheck_temp_closed(integer, integer) from public, anon, authenticated;
grant execute on function public.wf_promotion_recheck_temp_closed(integer, integer) to service_role;

comment on function public.wf_promotion_recheck_temp_closed(integer, integer) is
  'Re-arms ONLY CLOSED_TEMPORARILY promotion rejects not looked at for p_min_age_days (floor 7, default 30), at most p_limit (cap 500) per run. Bounded: each place is re-checked at most once per window, and every re-check still passes the worker spend ledger.';

-- Weekly; the 30-day age filter, not the schedule, sets the per-place cadence.
select cron.schedule('wf-promotion-recheck-temp-closed', '50 4 * * 1',
  $$select public.wf_promotion_recheck_temp_closed(30, 100)$$);
