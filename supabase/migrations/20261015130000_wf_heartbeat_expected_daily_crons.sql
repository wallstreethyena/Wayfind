-- Heartbeat coverage for four daily Vercel crons that pulse wf_job_pulse but
-- had no wf_heartbeat_expected row, so their silence never paged:
--
--   partner-path             40 9 * * *   last pulse 2026-10-14 09:40Z
--   spend-pacing             42 12 * * *  last pulse 2026-10-14 12:42Z
--   events-link-health       10 5 * * *   last pulse 2026-10-14 05:10Z
--   experiences-link-health  35 6 * * *   last pulse 2026-10-13 06:35Z (missed 10-14)
--
-- Daily crons get 1800 min (30h) = one missed day plus slack, the same ceiling
-- as photo-repair and event-truth-daily. Insert-where-not-exists so re-applying
-- is safe and a hand-tuned tolerance is never overwritten.
--
-- A job whose last pulse is already older than the ceiling is overdue the
-- moment its row exists (wf_heartbeat_overdue compares the last pulse, not the
-- row's created_at, once a pulse exists). That is intended: experiences-link-health
-- really did miss 2026-10-14.
insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note)
select v.job, v.mins, v.note
  from (values
    ('partner-path',            1800, 'Vercel 40 9 * * *, daily; 30h = one missed day plus slack. Partner-path health verdict; silence means a dead partner path goes unseen. Added 2026-10-15.'),
    ('spend-pacing',            1800, 'Vercel 42 12 * * *, daily; 30h = one missed day plus slack. Google/paid spend pacing ledger check. Added 2026-10-15.'),
    ('events-link-health',      1800, 'Vercel 10 5 * * *, daily; 30h = one missed day plus slack. Probes event ticket/official links and persists broken verdicts. Added 2026-10-15.'),
    ('experiences-link-health', 1800, 'Vercel 35 6 * * *, daily; 30h = one missed day plus slack. Probes Viator experience links. Missed 2026-10-14 06:35Z (no pulse); added 2026-10-15.')
  ) as v(job, mins, note)
 where not exists (
   select 1 from public.wf_heartbeat_expected e where e.job = v.job
 );