-- guide-visual-monitor heartbeat tolerance: 720 -> 1080 minutes, measured.
--
-- WHY. heartbeat-watch paged "OVERDUE (1/21): guide-visual-monitor (754.3min
-- vs 720min max)" on 2026-11-16 while every run of the workflow was green.
-- .github/workflows/guide-visual-monitor.yml declares "35 */6 * * *", but
-- GitHub's scheduler starts it far less often: across its last 40 scheduled
-- runs (to 2026-11-16) the worst gaps were 754, 763, 770, 770, 777, 784, 912
-- and 935 minutes. 720 (copied from the */30 and hourly monitors in
-- 20260930120000) is below ordinary behaviour for a 6-hourly workflow.
--
-- 1080 minutes (18h) sits above the measured 935 and still pages within a day
-- if the workflow really stops (disabled, secrets revoked, file moved), which
-- is the only thing this row exists to catch. A red run still pages on its own
-- pulse. Locked by scripts/check-heartbeat-tolerance.mjs (per-job measured gap).
--
-- DATA ONLY: one existing row in an existing table; no schema, grant or RLS
-- change. Idempotent.
-- Rollback: update public.wf_heartbeat_expected set max_staleness_minutes = 720 where job = 'guide-visual-monitor';
update public.wf_heartbeat_expected
   set max_staleness_minutes = 1080,
       note = 'declares every 6h at :35 (GitHub); measured worst gap 935min over 40 runs to 2026-11-16, so 18h ceiling (20261116220000). Added 2026-10-15.'
 where job = 'guide-visual-monitor';
