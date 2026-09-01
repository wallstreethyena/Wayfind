-- 20260901_wf_promote_spend_cap_and_release.sql — the drain's monthly budget
-- dial, and a way to hand a claimed place back WITHOUT charging it an attempt.
--
-- WHY (2026-09-01). #1054 raised the drain's ceiling to ~600 places/hour but
-- the cron still only asked lib/spendGate.js ONE question per run (is the gate
-- shut?), never the per-place ledger question every other metered path asks.
-- At 600/hour that is an unbounded Google bill. Two pieces close it:
--
-- 1. wf_promote_config.month_cap — how many Place Details records the drain
--    may buy this calendar month, in every gate mode. The route passes it to
--    spendAllowCapped(PROMOTE_SKU, month_cap), which counts it down atomically
--    in wf_spend_ledger (one row per month+sku). In WAYFIND_GATE=free the
--    ledger additionally clamps to Google's free tier (4,800 for details_pro);
--    in open mode this number IS the ceiling. Default 4,800 = the free tier,
--    so the default is $0. Raising it is a deliberate operator act:
--      update public.wf_promote_config set month_cap = 8000 where id = 1;
--    and the paid overage is (month_cap - 5000) x $0.017.
--
-- 2. wf_promotion_release — when the ledger says no, the places already
--    claimed for this batch are NOT failures. wf_promotion_complete(p_ok=false)
--    would burn one of their three attempts and back them off exponentially;
--    three ledger refusals in a row would REJECT a perfectly good place. This
--    returns the row to pending, refunds the attempt the claim charged, and
--    parks it for p_delay_minutes so the cron does not hot-loop on an empty
--    budget. Idempotent: only touches a row that is actually 'working'.

alter table public.wf_promote_config
  add column if not exists month_cap integer not null default 4800;

alter table public.wf_promote_config
  drop constraint if exists wf_promote_config_month_cap_ck;
alter table public.wf_promote_config
  add constraint wf_promote_config_month_cap_ck check (month_cap between 0 and 100000);

comment on column public.wf_promote_config.month_cap is
  'Max Place Details (Pro SKU) records the promotion drain may buy this calendar month, enforced per place via lib/spendGate.js spendAllowCapped -> wf_spend_take. 0 halts the drain. In WAYFIND_GATE=free the ledger also clamps to the free tier (4800).';

create or replace function public.wf_promotion_release(p_place_id text, p_delay_minutes integer default 60, p_note text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
begin
  select status into v_status from public.wf_promotion_queue where place_id = p_place_id;
  if not found then
    return 'unknown';
  end if;
  if v_status <> 'working' then
    return 'noop:' || v_status;
  end if;

  update public.wf_promotion_queue
     set status          = 'pending',
         claimed_at      = null,
         attempts        = greatest(attempts - 1, 0),
         last_error      = left(coalesce(p_note, 'released'), 500),
         next_attempt_at = now() + make_interval(mins => greatest(1, least(coalesce(p_delay_minutes, 60), 1440)))
   where place_id = p_place_id;
  return 'released';
end $function$;

revoke all on function public.wf_promotion_release(text, integer, text) from public, anon, authenticated;
