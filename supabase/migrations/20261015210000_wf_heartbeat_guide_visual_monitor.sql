-- Missed-run alarm for the new guide-visual-monitor (GitHub-scheduled).
--
-- WHY. .github/workflows/guide-visual-monitor.yml reads every live guide and
-- blog post every 6 hours and records a wf_job_pulse row for job
-- 'guide-visual-monitor' (scripts/guide-visual-monitor.mjs). A red run already
-- pages on its own pulse (succeeded=0 when a photo exists but Wayfind fails to
-- show it; job-watch escalates after 2 dead runs). This row covers the OTHER
-- failure: the workflow silently stops running (disabled, secrets revoked,
-- file moved). Without it that silence would never page
-- (scripts/check-heartbeat-tolerance.mjs fails the build until it exists).
--
-- 720 minutes, the same ceiling as photo-monitor / canary / synthetic-monitor
-- (20260930120000): GitHub's measured worst gap between scheduled runs was
-- 517 min, so a tighter tolerance would page on GitHub's ordinary behaviour.
--
-- DATA ONLY: one row in an existing table; no schema, grant or RLS change.
-- Idempotent: inserting the same job twice is a no-op.
-- Rollback: delete from public.wf_heartbeat_expected where job = 'guide-visual-monitor';
insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note)
select v.job, v.mins, v.note
  from (values
    ('guide-visual-monitor', 720, 'declares every 6h at :35 (GitHub); 12h ceiling like the other GitHub monitors (see 20260930120000). Added 2026-10-15.')
  ) as v(job, mins, note)
 where not exists (select 1 from public.wf_heartbeat_expected e where e.job = v.job);
