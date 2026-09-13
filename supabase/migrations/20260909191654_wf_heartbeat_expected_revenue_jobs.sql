-- Extend the silence watcher from "the three monitors" to "the monitors plus
-- the jobs whose silence costs money" — the scope the owner chose on
-- 2026-09-09 after being shown the measured cadences.
--
-- wf_heartbeat_expected already held canary (360), synthetic-monitor (360) and
-- photo-monitor (240). Those three watch; these four EARN, and a revenue job
-- that stops is worse than a monitor that stops.
--
-- EVERY TOLERANCE IS ABOVE THE OBSERVED WORST GAP, not the declared cron.
-- Measured over four days of wf_job_pulse on 2026-09-09:
--
--   job                declared        observed max gap    set here
--   job-watch          45 * * * *      1.01h                180 min (3h)
--   revenue-heartbeat  5 */3 * * *     3.00h                540 min (9h)
--   photo-repair       20 4 * * *      daily                1800 min (30h)
--   promote-index      */5 * * * *     0.23h (14 min)       60 min (1h)
--
-- A tolerance below the real cadence pages on healthy behaviour and trains its
-- reader to ignore the alert, which is the failure this whole lane exists to
-- end. These sit 3x to 4x above what each job actually does.
--
-- Written as insert-where-not-exists rather than a plain insert so re-applying
-- is safe and so it can never overwrite a tolerance someone has since tuned by
-- hand. Nothing already in the table is touched.
insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note)
select v.job, v.mins, v.note
  from (values
    ('job-watch',         180,  'Vercel 45 * * * *; observed max gap 1.01h. The alert path itself — its silence means no incident mail reaches anyone.'),
    ('revenue-heartbeat', 540,  'Vercel 5 */3 * * *; observed max gap 3.00h. Detects a collapse in affiliate click-through.'),
    ('photo-repair',      1800, 'Vercel 20 4 * * *, daily; 30h allows a full missed day plus slack. Drains the photo repair queue.'),
    ('promote-index',     60,   'Vercel */5 * * * *; observed max gap 14 min. Highest-frequency revenue job in the system.')
  ) as v(job, mins, note)
 where not exists (
   select 1 from public.wf_heartbeat_expected e where e.job = v.job
 );