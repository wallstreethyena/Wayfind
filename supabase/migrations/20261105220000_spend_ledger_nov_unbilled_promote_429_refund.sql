-- 20261105220000_spend_ledger_nov_unbilled_promote_429_refund.sql
--
-- Give back 16 details_pro grants on the 2026-11 ledger row: grants the
-- promotion cron took for Place Details calls that Google answered with a
-- daily-quota 429. Google bills OK / NOT_FOUND / INVALID_REQUEST only, never a
-- 429 (lib/spendGate.js refund note), and the deployed cron (main before
-- #2124) never refunded them.
--
-- WHY EXACTLY 16, AND WHY details_pro. Only grants that can be attributed to a
-- SKU are corrected; legitimate consumption is untouched.
--   * Every promote-index run whose pulse reads "quota: google places details
--     per-day quota exhausted (429)" made exactly one Details call that got the
--     429. A grant was taken before that call (app/api/cron/promote-index/
--     route.js, THE MONEY GUARD), and the rest of the batch was parked without
--     a grant (`if (quotaKind) { quotaReleased.push(...); continue; }`).
--   * The 2026-11 details_enterprise row has not changed since
--     2026-11-03T11:53:54.535131Z (used 988, cap 988). wf_spend_take sets
--     cap = p_cap and updated_at = now() on every successful take, and
--     wf_spend_refund sets updated_at, so no Enterprise grant has been taken
--     or returned since then. Every promotion grant after that moment was
--     therefore details_pro (the rating buy was refused and fell back to CORE).
--   * There are exactly 16 such quota runs from 2026-11-03T11:53:54.535131Z
--     to 2026-11-05T21:00Z (last 2026-11-05T05:20:26Z).
-- The 209 quota runs before that moment (Nov 1: 52, Nov 2: 156, Nov 3: 1)
-- also took unbilled grants, but the ledger is a counter with no per-grant
-- journal and the run could have bought either SKU, so their split is not
-- provable. They are left as they are; nothing is estimated.
--
-- If the run called details() with a 5xx before the 429, more than one grant
-- was taken; only the one for the 429 is refunded here (one per run).
--
-- AUDIT RECORD: the adjustment writes one wf_job_pulse row
-- (job 'spend-ledger-adjustment', note key adj=2026-11-details_pro-promote-429)
-- holding the before/after values and the evidence. The marker also makes the
-- migration idempotent: a second apply refunds nothing.
-- Reverse: supabase/data-fixes/20261105220000_spend_ledger_nov_unbilled_promote_429_refund_REVERSE.sql
do $$
declare
  v_done int;
  v_runs int;
  v_used int;
  v_ent record;
begin
  select count(*) into v_done from public.wf_job_pulse
   where job = 'spend-ledger-adjustment' and note like 'adj=2026-11-details_pro-promote-429 %';
  if v_done > 0 then
    raise notice 'adjustment adj=2026-11-details_pro-promote-429 already recorded; nothing to do';
    return;
  end if;

  select count(*) into v_runs from public.wf_job_pulse
   where job = 'promote-index'
     and ran_at >= '2026-11-03T11:53:54.535131Z' and ran_at < '2026-11-05T21:00:00Z'
     and note like 'quota: google places details per-day quota exhausted (429)%';
  if v_runs <> 16 then
    raise exception 'expected 16 promote-index quota-429 runs in the window, found %', v_runs;
  end if;

  select used, cap, updated_at into v_ent from public.wf_spend_ledger
   where month = '2026-11' and sku = 'details_enterprise';
  if v_ent is null or v_ent.updated_at > '2026-11-03T11:53:54.6Z' then
    raise exception 'details_enterprise 2026-11 changed after 2026-11-03T11:53:54Z (updated_at %): the details_pro attribution no longer holds; re-derive', v_ent.updated_at;
  end if;

  select used into v_used from public.wf_spend_ledger
   where month = '2026-11' and sku = 'details_pro' for update;
  if v_used is null or v_used < 16 then
    raise exception 'details_pro 2026-11 row missing or below 16 (used %)', v_used;
  end if;

  update public.wf_spend_ledger set used = used - 16, updated_at = now()
   where month = '2026-11' and sku = 'details_pro';

  insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
  values ('spend-ledger-adjustment', 16, 16, 0,
    'adj=2026-11-details_pro-promote-429 | details_pro 2026-11 used ' || v_used || ' -> ' || (v_used - 16)
    || ' | refund 16 unbilled grants: 16 promote-index runs 2026-11-03T11:53:54Z..2026-11-05T21:00Z each took one grant for a Details call Google answered 429 (unbilled); details_enterprise frozen at '
    || v_ent.used || '/' || v_ent.cap || ' since 2026-11-03T11:53:54Z proves every grant was details_pro'
    || ' | 209 earlier quota runs (Nov 1-3) not adjusted: SKU split unprovable | migration 20261105220000');
end $$;
