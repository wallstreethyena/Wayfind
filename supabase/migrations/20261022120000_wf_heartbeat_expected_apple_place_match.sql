-- Heartbeat coverage for the nightly Vercel cron /api/cron/apple-place-match
-- (13 3-8 * * *: six runs between 03:13 and 08:13 UTC), the free Apple Place
-- ID backfill (lib/appleMatchJob.js). Every run pulses wf_job_pulse, including
-- its controlled no-op outcomes (credentials not configured, ledger not
-- provisioned, backlog exhausted), so a silent stop means the cron itself
-- stopped firing.
--
-- 1800 min (30h) = the longest normal gap (08:13 -> next 03:13 is 19h) plus a
-- missed night's slack; same ceiling as sighting-renewal (20261015200000).
-- Insert-where-not-exists so re-applying is safe and a hand-tuned tolerance is
-- never overwritten. Rollback: delete from public.wf_heartbeat_expected where
-- job = 'apple-place-match';
insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note)
select v.job, v.mins, v.note
  from (values
    ('apple-place-match', 1800, 'Vercel 13 3-8 * * *, nightly window; 30h = longest gap plus a missed night. Free Apple Place ID backfill (wf_apple_place_ids), <=6000 Apple calls/day via wf_reserve_free_provider_call; zero Google calls. Added 2026-10-22.')
  ) as v(job, mins, note)
 where not exists (
   select 1 from public.wf_heartbeat_expected e where e.job = v.job
 );
