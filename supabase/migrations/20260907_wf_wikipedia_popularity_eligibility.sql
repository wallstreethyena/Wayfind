-- wf_wikipedia_popularity_eligibility — stop asking Wikipedia about places
-- that structurally cannot have an article, before matching is even reached.
--
-- THE DEFECT (claude/wayfind-AUDIT-wikipedia-enrichment-failure-population-
-- 2026-09-07.md). 180-row sample of the failing wf_inventory population: 156
-- of 180 (86.7%) have NO Wikipedia article for Wikipedia's own notability
-- reasons -- independent local businesses (`Amore Protein House LLC`,
-- `CHURROLAND MIAMI`, `Basil's Chicken & Ribs`) that will never clear it.
-- Not a defect in the matcher; asking is simply the wrong question for most
-- of wf_inventory. Measured on the same 180-row sample:
--
--   filter                                rows kept    correct/10   precision
--   none (today)                          180 (100%)   10           5.6%
--   primary_type in attraction class      30 (16.7%)   8            27%
--   + reviews >= 400                      19 (10.6%)   8            42%
--
-- Type-class + review floor: ~89% fewer lookups, 80% of the achievable
-- matches retained, precision 5.6% -> 42%. It touches no matching logic, so
-- it cannot increase false matches -- it can only reduce candidate volume,
-- and it reduces it exactly where the wrong-entity class concentrates
-- (restaurants, cafes, bars: the audit's 37-of-61 "outright wrong" class was
-- overwhelmingly food/drink venues with an unrelated same-name article).
-- The two matches this filter drops that the audit judged real (Majordomo,
-- Magpie Cafe) are notable restaurants outside the attraction class; the
-- owner's instruction is to recover those later with an explicit allowlist,
-- never by loosening this filter or the confidence floor.
--
-- THE FIX composes with the per-source selector v9.0 already shipped
-- (20260907_wf_popularity_attempt_ledger.sql, PR #1150): that migration
-- added p_categories, driven by categoriesForSource() in lib/popularity.js,
-- so each source can restrict which wf_inventory rows are even OFFERED to
-- it. This migration adds two MORE optional, source-driven restrictions on
-- the exact same pattern -- p_primary_types and p_min_reviews, both default
-- null (no restriction, unchanged behaviour for every source that doesn't
-- pass them) -- appended as TRAILING parameters so the existing p_source/
-- p_categories/p_n call shape from every other source keeps working
-- unmodified. lib/popularity.js's primaryTypesForSource()/minReviewsForSource()
-- return the attraction-class list and 400 for 'wikipedia' only, null for
-- every other source -- composing with, not fighting, categoriesForSource().

create or replace function public.wf_popularity_stale_batch(
  p_source text,
  p_categories text[] default null,
  p_n integer default 100,
  p_primary_types text[] default null,
  p_min_reviews numeric default null
)
returns table(place_id text, name text, lat double precision, lng double precision, category text, metro text,
              last_attempted_at timestamptz, fetched_at timestamptz)
language sql
stable
set search_path to 'public'
as $function$
  select i.place_id, i.name, i.lat, i.lng, i.category, i.metro, a.last_attempted_at, p.fetched_at
  from wf_inventory i
  left join wf_popularity_attempts a
    on a.place_id = i.place_id and a.source = p_source
  left join wf_place_popularity p
    on p.place_id = i.place_id and p.source = p_source
  where i.lat is not null
    and coalesce(i.status,'OPERATIONAL') <> 'CLOSED'
    and (p_categories is null or i.category = any(p_categories))
    -- NEW, both default null (no restriction) -- see header. primary_type is
    -- the fine-grained Google-place type (museum/zoo/restaurant/...), a
    -- different, finer axis than the coarse `category` bucket p_categories
    -- already filters on (food/nightlife/attractions/...), which is why
    -- this needed its own parameter rather than folding into p_categories.
    and (p_primary_types is null or i.primary_type = any(p_primary_types))
    and (p_min_reviews is null or coalesce((i.signals->>'reviews')::numeric, 0) >= p_min_reviews)
  order by
    a.last_attempted_at asc nulls first,
    p.fetched_at asc nulls first,
    i.seen_at asc
  limit greatest(coalesce(p_n,100),1)
$function$;

comment on function public.wf_popularity_stale_batch(text, text[], integer, text[], numeric) is
  'Per-source stale-batch selector (v9.0, PR #1150) + eligibility pre-filter (2026-09-07). p_primary_types/p_min_reviews are optional, source-driven restrictions on TOP of p_categories -- wikipedia passes the attraction-class type list + reviews>=400 (measured: 89% fewer lookups, precision 5.6%->42%, 80% of achievable matches kept); every other source passes null/null and is unaffected. See 20260907_wf_wikipedia_popularity_eligibility.sql for the measurement this is built on.';

revoke all on function public.wf_popularity_stale_batch(text, text[], integer, text[], numeric) from public, anon, authenticated;
