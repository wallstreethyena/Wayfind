-- A failed preflight did no provider work, but it is not a healthy idle run.
CREATE OR REPLACE FUNCTION public.wf_job_health(p_lookback_hours integer DEFAULT 48)
RETURNS TABLE(job text, runs integer, last_run timestamptz, attempted bigint,
              succeeded bigint, consecutive_zero integer, last_note text)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  WITH recent AS (
    SELECT p.*, row_number() OVER (PARTITION BY p.job ORDER BY p.ran_at DESC, p.id DESC) AS rn
    FROM public.wf_job_pulse p
    WHERE p.ran_at > now() - make_interval(hours => greatest(1, coalesce(p_lookback_hours, 48)))
  ), flagged AS (
    SELECT r.*, ((r.attempted > 0 OR r.failed > 0) AND r.succeeded = 0) AS dead
    FROM recent r
  ), streak AS (
    SELECT f.job, count(*)::int AS consecutive_zero FROM flagged f
    WHERE f.dead AND f.rn <= coalesce(
      (SELECT min(f2.rn)-1 FROM flagged f2 WHERE f2.job=f.job AND NOT f2.dead),
      (SELECT max(f3.rn) FROM flagged f3 WHERE f3.job=f.job))
    GROUP BY f.job
  )
  SELECT r.job, count(*)::int, max(r.ran_at), sum(r.attempted), sum(r.succeeded),
    coalesce(max(s.consecutive_zero),0),
    (array_agg(r.note ORDER BY r.ran_at DESC, r.id DESC))[1]
  FROM recent r LEFT JOIN streak s ON s.job=r.job GROUP BY r.job;
$$;
REVOKE ALL ON FUNCTION public.wf_job_health(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wf_job_health(integer) TO service_role;
