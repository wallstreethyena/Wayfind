-- Heartbeat coverage for the new daily Vercel cron /api/cron/sighting-renewal
-- (20 5 * * *), which keeps recorded Google sightings in
-- wf_inventory.independent_coords current from wf_place_ids at zero cost and
-- deletes expired ones. If it goes quiet, ~2,674 map pins silently expire by
-- 2026-11-13, so its silence must page.
--
-- Daily crons get 1800 min (30h) = one missed day plus slack, the same ceiling
-- as partner-path / spend-pacing (20261015130000). Insert-where-not-exists so
-- re-applying is safe and a hand-tuned tolerance is never overwritten.
insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note)
select v.job, v.mins, v.note
  from (values
    ('sighting-renewal', 1800, 'Vercel 20 5 * * *, daily; 30h = one missed day plus slack. Renews wf_place_ids-sighting map coordinates (30-day Google window) and deletes expired ones; zero Google calls. Added 2026-10-15.')
  ) as v(job, mins, note)
 where not exists (
   select 1 from public.wf_heartbeat_expected e where e.job = v.job
 );
