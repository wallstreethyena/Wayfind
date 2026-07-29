-- wf_atlas_retryable — the retry selector. Four rules, in one place so they
-- cannot drift apart.
--   1. survived reclassification: only issues[1] = 'PENDING SOURCE'. RIDE-LEVEL,
--      BLOCKED - §7 source, chain-generic, category-mismatch, possible-duplicate
--      and junk-candidate are excluded BY LABEL. The reclassification pass is
--      what makes this rule enforceable rather than a hope: do not spend a
--      Places call re-deriving an answer the classifier gives for free.
--   2. not a §7-blocked host -- carried by the label from rule 1. A Disney-hosted
--      row is BLOCKED, never PENDING, so it can never enter this set.
--   3. attempt_count < 2, plus a cooldown on last_attempted_at.
--   4. operational, ordered by reviews desc -- the 1,000+ review rows are where
--      the value is.
--
-- THE COOLDOWN WAIVER, and why it is not a loophole.
-- The literal rule is "last_attempted_at null or older than 7 days". Every row
-- in this backlog was attempted 2026-07-28..29, so a literal reading selects
-- ZERO rows and the retry does nothing at all.
--
-- The cooldown exists to stop a job hammering a failure whose cause is UNKNOWN.
-- These failed for a cause that is known, fixed and independently confirmed: an
-- Anthropic key whose value in Vercel never matched any live key (the console
-- showed "Last used: never"), since replaced, with spend resuming after five
-- days of zero. A failure that predates a confirmed fix does not need to cool
-- down -- it needs to be retried.
--
-- So rows last attempted BEFORE the fix waive the cooldown once; anything after
-- obeys the full seven days. The waiver is a FIXED TIMESTAMP, not a flag, so it
-- cannot be reused for the next incident without someone deliberately editing
-- this function and dating their reason.
drop function if exists public.wf_atlas_retryable(text[], integer);

create or replace function public.wf_atlas_retryable(p_category text, p_metros text[], p_limit integer)
returns table(place_id text, name text, metro text, category text, primary_type text,
              lat double precision, lng double precision, rating numeric, reviews integer,
              attempt_count integer, last_attempted_at timestamptz)
language sql
stable
set search_path to 'public'
as $function$
  select i.place_id, i.name, i.metro, i.category, i.primary_type, i.lat, i.lng,
         nullif(i.signals->>'rating','')::numeric as rating,
         coalesce(nullif(i.signals->>'reviews','')::int, 0) as reviews,
         e.attempt_count, e.last_attempted_at
  from public.wf_editorial e
  join public.wf_inventory i on i.place_id = e.place_id
  where e.issues[1] = 'PENDING SOURCE'          -- rules 1 + 2 (the label carries both)
    and i.status = 'OPERATIONAL'
    and e.attempt_count < 2                     -- rule 3a
    and (                                       -- rule 3b, with the cause-fixed waiver
      e.last_attempted_at is null
      or e.last_attempted_at < now() - interval '7 days'
      or e.last_attempted_at < timestamptz '2026-07-29 18:00:00+00'
    )
    and i.metro = any(p_metros)
    and (p_category is null or p_category = '' or i.category = p_category)
  order by coalesce(nullif(i.signals->>'reviews','')::int, 0) desc   -- rule 4
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$function$;

-- Bump attempt state. Called once per retried place, WHATEVER the outcome: a
-- retry that failed is still an attempt, and not counting it is how a bounded
-- retry quietly becomes an unbounded one.
create or replace function public.wf_editorial_record_attempt(p_place_id text, p_issues text[])
returns void
language sql
volatile
set search_path to 'public'
as $function$
  update public.wf_editorial
     set issues            = p_issues,
         verified          = (p_issues is null or array_length(p_issues, 1) is null),
         attempt_count     = attempt_count + 1,
         last_attempted_at = now(),
         written_at        = now()
   where place_id = p_place_id
$function$;
