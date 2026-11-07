-- REVERSE of supabase/migrations/20261105220000_spend_ledger_nov_unbilled_promote_429_refund.sql
-- Re-debits the 16 details_pro grants on the 2026-11 ledger row and records the
-- reversal next to the original audit row. Only valid while the ledger month is
-- still 2026-11 data (the row is addressed explicitly, so it is safe later too).
do $$
begin
  if not exists (select 1 from public.wf_job_pulse where job = 'spend-ledger-adjustment'
                  and note like 'adj=2026-11-details_pro-promote-429 %') then
    raise exception 'no adjustment adj=2026-11-details_pro-promote-429 recorded; nothing to reverse';
  end if;
  if exists (select 1 from public.wf_job_pulse where job = 'spend-ledger-adjustment'
              and note like 'reverse adj=2026-11-details_pro-promote-429 %') then
    raise notice 'already reversed'; return;
  end if;
  update public.wf_spend_ledger set used = used + 16, updated_at = now()
   where month = '2026-11' and sku = 'details_pro';
  insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
  values ('spend-ledger-adjustment', 16, 16, 0, 'reverse adj=2026-11-details_pro-promote-429 | details_pro 2026-11 +16');
end $$;
