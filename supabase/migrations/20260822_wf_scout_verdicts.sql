-- 20260822_wf_scout_verdicts.sql — the 9.2 scout's memory and candidate set.
-- APPLIED TO PRODUCTION 2026-08-22. Recorded here so the schema lives in git.
--
-- Context: 294 places were fetched from Google, PAID FOR, and rejected by
-- /api/cron/promote-index as `unclassified` because lib/placeCategory.js could
-- not read an identity out of their type lists. 40 of them clear the owner's
-- 9.2 floor. That bucket holds Mote Marine Laboratory (94) and Siesta Roofing
-- (92) side by side, with indistinguishable Google types. See
-- lib/scoutAdjudicate.js for the law that separates them.

-- One row per place ever adjudicated, so a verdict is bought exactly once and a
-- rejected place is never re-judged or re-billed. `section` null + accepted
-- false = "this is not a destination" — a stored OUTCOME, deliberately distinct
-- from "not yet seen" (no row at all). A place the model simply did not mention
-- must produce NO ROW: see adjudicationOutcome's `answered`.
create table if not exists public.wf_scout_verdicts (
  place_id        text primary key,
  name            text,
  score           integer not null,
  rating          numeric,
  reviews         integer,
  section         text,
  accepted        boolean not null default false,
  reason          text,
  model           text,
  adjudicated_at  timestamptz not null default now(),
  constraint wf_scout_verdicts_section_ck
    check (section is null or section in ('Food','Nightlife','Activities','Hotels','Shopping')),
  -- accepted implies a section. The pair can never disagree.
  constraint wf_scout_verdicts_accept_ck
    check ((accepted = false) or (section is not null))
);

create index if not exists wf_scout_verdicts_accepted_score_idx
  on public.wf_scout_verdicts (accepted, score desc);

alter table public.wf_scout_verdicts enable row level security;

comment on table public.wf_scout_verdicts is
  'lib/scoutAdjudicate.js verdicts. Service-role only: no policies by design. A model may FLAG a section for a place classify() abstained on; a human ships it (rows land needs_review=true).';

-- wf_scout_candidates — the abstention bucket, richest first.
--
-- Every candidate (a) clears the owner floor on THE Wayfind score — the same
-- Bayesian blend as lib/wayfindScore.js, restated in SQL and pinned against the
-- JS by scripts/check-scout-law.mjs's minReviewsFor assertions; (b) is not
-- already inventory; (c) was rejected by the promoter as `unclassified`, so
-- Place Details was already fetched AND PAID FOR and the payload is still
-- cached; and (d) has never been adjudicated. Because the details come from
-- wf_places_cache, a scout run costs ZERO Google spend.
create or replace function public.wf_scout_candidates(p_limit integer default 40, p_floor integer default 92)
returns table (place_id text, name text, score integer, rating numeric, reviews integer, details jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select p.place_id,
         p.name,
         round((((coalesce((p.signals->>'reviews')::numeric,0) * (p.signals->>'rating')::numeric) + 60*3.9)
               / (coalesce((p.signals->>'reviews')::numeric,0) + 60)) / 5 * 100)::integer as score,
         (p.signals->>'rating')::numeric as rating,
         coalesce((p.signals->>'reviews')::numeric,0)::integer as reviews,
         c.v as details
  from public.wf_place_ids p
  join public.wf_promotion_queue q on q.place_id = p.place_id
  join public.wf_places_cache   c on c.k = 'pd1|' || p.place_id
  left join public.wf_inventory i on i.place_id = p.place_id
  left join public.wf_scout_verdicts sv on sv.place_id = p.place_id
  where i.place_id is null
    and sv.place_id is null
    and q.status = 'rejected'
    and q.reject_reason like 'unclassified%'
    and p.signals->>'rating' is not null
    and round((((coalesce((p.signals->>'reviews')::numeric,0) * (p.signals->>'rating')::numeric) + 60*3.9)
              / (coalesce((p.signals->>'reviews')::numeric,0) + 60)) / 5 * 100) >= p_floor
    and coalesce(c.v->>'businessStatus','OPERATIONAL') = 'OPERATIONAL'
  order by score desc, reviews desc
  limit greatest(1, least(p_limit, 200));
$$;

comment on function public.wf_scout_candidates(integer,integer) is
  'Places clearing the Wayfind score floor that the regex classifier abstained on. Details come from wf_places_cache, so adjudicating them costs no Google spend.';
