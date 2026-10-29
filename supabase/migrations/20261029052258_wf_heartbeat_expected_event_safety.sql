insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note)
select v.job, v.mins, v.note
  from (values
    ('event-rollover', 180, 'Vercel 20 * * * *, hourly; 3h = two missed runs plus slack. Deterministic rollover of ended displayable wf_events to completed (no LLM). Added 2026-10-28.'),
    ('event-freshness', 180, 'Vercel 20 * * * *, hourly; 3h = two missed runs plus slack. Data-level event verification freshness + event-truth-daily useful-work check; failed>0 when degraded. Added 2026-10-28.')
  ) as v(job, mins, note)
 where not exists (
   select 1 from public.wf_heartbeat_expected e where e.job = v.job
 );