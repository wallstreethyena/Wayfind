-- 20260909_wf_job_health_unavailable_is_dead.sql
-- A required input that could not be read is not the same question as
-- "nothing to do". public.wf_job_health's `dead` expression did not know
-- that, and it let a dead job hide behind "idle" indefinitely. (2026-09-09)
--
-- THE INCIDENT. At 2026-09-09 19:35:19Z the hourly at-risk photo drain
-- (vercel.json: `/api/cron/place-photos?source=at-risk&limit=25`, `35 * * * *`)
-- could not read its worklist view. PostgREST returned HTTP 500 /
-- `57014 canceling statement due to statement timeout` reading
-- wf_photo_at_risk (see 20260909_wf_places_cache_photo_partial_indexes.sql
-- for the query-plan root cause and its fix — that migration stops the
-- timeout; THIS one stops the failure from hiding the next time something
-- else makes a required read fail). The route filed exactly this pulse:
--
--   job=place-photos attempted=0 succeeded=0 failed=0
--   note="place-photos: wf_photo_at_risk unavailable"
--
-- TWO INDEPENDENT LAYERS then classified that as healthy-and-quiet — not one:
--
--   1. THIS FUNCTION. `dead := ((r.attempted > 0 OR r.failed > 0) AND
--      r.succeeded = 0)`. attempted=0 and failed=0, so dead=false, so
--      consecutive_zero never advances past 0 no matter how many hours in a
--      row the read keeps failing.
--   2. lib/jobPulse.js's `classifyHealth` (fixed in the same commit as this
--      migration): `if (zero >= threshold) incidents.push(r); else if
--      (attempted === 0 && zero === 0) idle.push(r);` — zero=0 and
--      attempted=0 landed the row in `idle`, not `incidents`.
--
-- Both checks asked "did the job attempt something and fail at it?" when the
-- real question was "did the job get to attempt anything at all?" — a run
-- that cannot even READ its input never gets to attempt, so attempted=0 is
-- true of BOTH a healthy idle run (nothing eligible today) and a dead run
-- (couldn't see what was eligible). Gating `dead` on attempted>0 conflates
-- the two, and the conflation is not specific to place-photos: it applies to
-- ANY job that fails before it can attempt anything — that job can be dead
-- indefinitely and never page.
--
-- THE FIX. `dead` now ALSO fires on a note carrying the house's deterministic-
-- failure prefix convention (`lib/jobPulse.js`'s "billing:"/"quota:" prefix,
-- CLAUDE.md's 2026-08-25 lesson 2 — a provider refusal that pages after ONE
-- run because it cannot be a transient blip) EXTENDED here with a third
-- prefix, "unavailable:", meaning A REQUIRED INPUT COULD NOT BE READ — that is
-- deterministic infrastructure failure, never a transient blip, and never
-- "nothing to do":
--
--   ((r.attempted > 0 OR r.failed > 0) AND r.succeeded = 0)
--     OR (r.succeeded = 0 AND r.note ~* '^(billing|quota|unavailable):')
--
-- THE SAME THREE PREFIXES, NOT A FOURTH COPY. lib/jobPulse.js exports
-- `DETERMINISTIC_NOTE_PREFIX = /^(billing|quota|unavailable):/i` so this SQL
-- expression and the JS classifier read from the same list in spirit, even
-- though SQL and JS cannot literally share one regex literal — the two are
-- kept from drifting apart by scripts/test-job-pulse.mjs, which extracts the
-- prefix list from BOTH this file's `dead` expression and the JS regex and
-- asserts they are the same three names (counted, not `includes`d).
--
-- lib/placePhotoBackfill.js and app/api/cron/place-photos/route.js (same
-- commit) now compose the pulse note so a lost wf_photo_at_risk read files
-- as `unavailable: place-photos wf_photo_at_risk read failed (HTTP 500)` —
-- carrying the `^unavailable:` prefix at column 0, and the HTTP status when
-- known — instead of the old `place-photos: wf_photo_at_risk unavailable`,
-- which named the failure but did not make it matchable by either layer's
-- prefix check. Everything else about this function — the recent/flagged/
-- streak CTEs, the lookback window, the output shape — is UNCHANGED; this
-- migration touches ONLY the `dead` boolean.
--
-- NOT APPLIED TO PRODUCTION BY THIS COMMIT. Written and verified locally;
-- deploy is a separate, owner-gated step per CLAUDE.md's "How to ship a fix".
--
-- Copied verbatim from 20260907141934_wf_job_health_failed_preflight.sql (the
-- function currently live in production) and changed ONLY the `dead` line.
CREATE OR REPLACE FUNCTION public.wf_job_health(p_lookback_hours integer DEFAULT 48)
 RETURNS TABLE(job text, runs integer, last_run timestamp with time zone, attempted bigint, succeeded bigint, consecutive_zero integer, last_note text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH recent AS (
    SELECT p.*, row_number() OVER (PARTITION BY p.job ORDER BY p.ran_at DESC, p.id DESC) AS rn
    FROM public.wf_job_pulse p
    WHERE p.ran_at > now() - make_interval(hours => greatest(1, coalesce(p_lookback_hours, 48)))
  ), flagged AS (
    SELECT r.*, (
      ((r.attempted > 0 OR r.failed > 0) AND r.succeeded = 0)
      OR (r.succeeded = 0 AND r.note ~* '^(billing|quota|unavailable):')
    ) AS dead
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
$function$;
REVOKE ALL ON FUNCTION public.wf_job_health(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wf_job_health(integer) TO service_role;
