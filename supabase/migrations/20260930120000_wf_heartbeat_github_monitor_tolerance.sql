-- Heartbeat tolerance for the three GitHub-scheduled monitors, set from
-- GitHub's MEASURED cadence instead of the declared cron.
--
-- THE INCIDENT (2026-09-30 04:45 ET owner email): "heartbeat-watch — 9
-- consecutive runs produced nothing (114/192 succeeded in 48h), last reason:
-- OVERDUE (1/7): photo-monitor (371.2min vs 240min max)". Nothing was
-- overdue in any sense a reader cares about. photo-monitor ran, green, every
-- time GitHub started it; GitHub just starts it far less often than its
-- hourly cron declares.
--
-- MEASURED 2026-09-16 -> 2026-09-30 (scheduled runs only, GitHub Actions API):
--
--   workflow           runs  median gap  p95 gap  max gap   old tolerance
--   photo-monitor       82    261 min     377      516       240
--   canary              86    233 min     382      511       360
--   synthetic-monitor   83    256 min     386      514       360
--
-- photo-monitor's MEDIAN gap was above its 240-minute tolerance, so
-- heartbeat-watch went dead on GitHub's ordinary behaviour most days (44 of 81
-- gaps). canary and synthetic-monitor crossed 360 six and five times. A
-- tolerance below the real cadence pages on healthy behaviour and trains its
-- reader to ignore the alert, which is the rule 20260909191654 already wrote
-- down for the Vercel jobs ("every tolerance is above the observed worst gap,
-- not the declared cron"). These three rows never got that treatment.
--
-- 720 minutes (12h) is 1.4x the worst gap in 14 days and ~2.8x the median. A
-- monitor that has truly stopped (workflow disabled, secrets revoked, file
-- moved) still pages within half a day, and the FAILURE of any run still pages
-- on its own pulse long before that: canary and synthetic-monitor write
-- succeeded=0 on a red run, which job-watch escalates after 2 dead runs.
--
-- Scoped by job name to exactly these three rows. The Vercel-scheduled
-- tolerances (job-watch, revenue-heartbeat, photo-repair, promote-index) are
-- untouched. scripts/check-heartbeat-tolerance.mjs replays every migration
-- that writes this table and fails if any GitHub-scheduled monitor is left
-- below the measured worst gap.
update public.wf_heartbeat_expected
   set max_staleness_minutes = 720,
       note = case job
         when 'photo-monitor'     then 'declares hourly at :50; GitHub measured 2026-09-16..30: median 261min, max 516min. 12h ceiling (see 20260930120000).'
         when 'canary'            then 'declares */30; GitHub measured 2026-09-16..30: median 233min, max 511min. 12h ceiling (see 20260930120000).'
         when 'synthetic-monitor' then 'declares */30; GitHub measured 2026-09-16..30: median 256min, max 514min. 12h ceiling (see 20260930120000).'
       end
 where job in ('photo-monitor', 'canary', 'synthetic-monitor');
