-- 20260923_wf_capture_live_function_state.sql — FORWARD-ONLY. Records two pieces
-- of production behaviour that reached the database without a migration file, so a
-- database rebuilt from supabase/migrations matches production.
--
-- ON PRODUCTION EVERY STATEMENT IS A NO-OP: the function body below is byte-identical
-- to the live body (md5 656ac41b8ff3f886ed1e10cdbe06a23b), the attributes match
-- (sql, stable, search_path=public, invoker), CREATE OR REPLACE keeps the existing
-- grants (service_role only, set by 20260825_security_hardening_v5.sql), and the two
-- dropped overloads do not exist there. No applied migration is edited.
--
-- Found by the 2026-09-23 audit of the 14 statement-level differences recorded in
-- scripts/migration-content-baseline.json (docs/MIGRATION_DRIFT_AUDIT_2026-09-23.md).
--
-- 1. wf_atlas_retryable (ledger 20260729194309, 20260729194414). PR #600 (29767d3c,
--    2026-08-05) widened it directly in the database, in its own words "applied to
--    the DB": FAILED VERIFICATION rows written before the #594 verifier fix
--    (2026-08-05 23:50:40Z) are readmitted, and a null attempt_count counts as 0.
--    No migration carried that, so the repo's last definition
--    (20260729_wf_atlas_retryable.sql) is the older PENDING-SOURCE-only selector
--    and a rebuild would silently drop the retry path.
--
-- 2. wf_popularity_stale_batch (ledger 20260907084309). Production dropped the
--    (integer) and (text, text[], integer) overloads in that version; the committed
--    file never did (20260907_wf_popularity_attempt_ledger.sql lists the drop as a
--    follow-up). A rebuild would keep three overloads with defaulted arguments,
--    which PostgREST cannot choose between for a call naming only p_source.

CREATE OR REPLACE FUNCTION public.wf_atlas_retryable(p_category text, p_metros text[], p_limit integer)
 RETURNS TABLE(place_id text, name text, metro text, category text, primary_type text, lat double precision, lng double precision, rating numeric, reviews integer, attempt_count integer, last_attempted_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Two retry populations, both bounded by the same attempt cap.
  --
  -- 1. PENDING SOURCE — the original: the writer had no usable source.
  -- 2. FAILED VERIFICATION written BEFORE 2026-08-05 23:50:40Z — the verifier
  --    fix (PR #594) landed then. Those rows were rejected on notation the
  --    corpus actually contained: "Florida" against an address saying FL, a
  --    24-hour clock against Google's 12-hour hours, and a bare "00" tokenized
  --    out of "11:00" that could never match under any corpus. Same
  --    cause-fixed waiver precedent as the 2026-07-29 timestamp below.
  --
  -- The cutoff is what stops a loop: a row that fails under the NEW verifier is
  -- written after it and is therefore never readmitted here.
  select i.place_id, i.name, i.metro, i.category, i.primary_type, i.lat, i.lng,
         nullif(i.signals->>'rating','')::numeric as rating,
         coalesce(nullif(i.signals->>'reviews','')::int, 0) as reviews,
         e.attempt_count, e.last_attempted_at
  from public.wf_editorial e
  join public.wf_inventory i on i.place_id = e.place_id
  where (
          e.issues[1] = 'PENDING SOURCE'
          or ('FAILED VERIFICATION' = any(coalesce(e.issues,'{}'))
              and e.written_at < timestamptz '2026-08-05 23:50:40+00')
        )
    and i.status = 'OPERATIONAL'
    and coalesce(e.attempt_count, 0) < 2
    and (
      e.last_attempted_at is null
      or e.last_attempted_at < now() - interval '7 days'
      or e.last_attempted_at < timestamptz '2026-07-29 18:00:00+00'
    )
    and i.metro = any(p_metros)
    and (p_category is null or p_category = '' or i.category = p_category)
  order by coalesce(nullif(i.signals->>'reviews','')::int, 0) desc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$function$;

drop function if exists public.wf_popularity_stale_batch(integer);
drop function if exists public.wf_popularity_stale_batch(text, text[], integer);
