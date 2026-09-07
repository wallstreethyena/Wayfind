-- wf_popularity_attempt_ledger — a failed lookup is still an attempt.
--
-- THE DEFECT (confirmed against production, 2026-09-07). wf_popularity_stale_batch
-- selected the 100 stalest places by `min(wf_place_popularity.fetched_at)`,
-- nulls first. wf_place_popularity.fetched_at is written ONLY on a successful
-- match — a miss, a low-confidence match, a 429, a missing key, all write NO
-- row at all. So a place that has never once matched has `fetched_at = null`
-- forever, sorts FIRST forever, and every run just re-tries the same head of
-- the queue and fails the same way again. Nothing ever moves it to the back.
--
-- MEASURED CONSEQUENCE. 19,673 of 20,086 eligible wf_inventory rows hold NO
-- popularity row of any source (413 hold exactly one — all wikipedia). With a
-- batch of 100, a place ranked below #100 in this immortal null-first order is
-- unreachable. Four places an independent audit proved would match Wikipedia
-- at similarity 1.0 on the very first call, if ever offered:
--   National Aviary                                    rank ~9,917
--   San Diego Zoo                                       rank ~11,040
--   Smithsonian National Museum of Natural History      rank ~12,622
--   Fort De Soto                                        rank ~18,782
-- wikipedia rows written per day: 54 (Aug24) 33 (25) 19 (27) 15 (31) 10 (Sep2)
-- then 1, 1, 1 (Sep3, 4, 7) — the exact day the queue's reachable slice ran dry.
-- The `i.seen_at desc` tie-break made this worse, not just slow: a big ingest
-- (2026-09-03) hands every brand-new row a fresher seen_at than the entire
-- existing backlog, so it jumps straight to the head of the null-first order
-- and the old backlog gets pushed back further, never actually processed.
--
-- THE FIX, same shape as wf_atlas_retryable / wf_editorial_record_attempt
-- (20260729_wf_atlas_retryable.sql, 20260729_wf_editorial_retry_state.sql):
-- an attempt ledger, written on every attempt REGARDLESS OF OUTCOME, kept
-- STRICTLY separate from wf_place_popularity.fetched_at.
--
--   wf_place_popularity.fetched_at   = "we got real data" (success only —
--                                       UNCHANGED, never written on failure).
--   wf_popularity_attempts.last_attempted_at = "we asked" (every attempt,
--                                       success or failure).
--
-- The owner's hard constraint: never let a failed request's timestamp make
-- stale/absent successful data look fresh. Keeping these in two tables (not
-- two columns on one row) is what makes that constraint impossible to violate
-- by accident — nothing ever writes fetched_at except a real upsert into
-- wf_place_popularity, exactly as before.
--
-- SCHEDULING ORDER, per the owner: (1) never attempted, (2) oldest attempted,
-- (3) successful-data freshness, tracked separately. `order by
-- last_attempted_at asc nulls first` gives (1)+(2) in one clause — a null
-- sorts first (never attempted), and a bumped now() sorts to the very back
-- (a failing place cannot stay at the front — it now moves to the back like
-- every other attempt, succeeding or not). `fetched_at asc nulls first` is
-- then a THIRD-order tie-break only, never the primary key of the sort, so a
-- fresh failure can never impersonate fresh data.
--
-- THE seen_at TIE-BREAK IS FLIPPED, deliberately, not just carried over: `asc`
-- instead of the old `desc`. Within the (now-shrinking, and non-immortal)
-- never-attempted tier, the longest-waiting backlog goes first and a new
-- ingest joins the BACK of that tier instead of jumping the line ahead of
-- places that have been waiting since before it existed. This only changes
-- who goes first among ties on an already-decoupled axis — it is not a
-- standalone sort-order fix (that shape is explicitly rejected: the root
-- defect is the missing attempt record, and this repairs that first).
--
-- PER-SOURCE, NOT ONE SHARED BATCH. wf_popularity_stale_batch used to pick ONE
-- set of 100 places and try every source in lib/popularity.js's sourcesFor()
-- on each of them. Two real correctness gaps that shape produces, both
-- present in the current code, not hypothetical:
--   1. app/api/cron/popularity's own SOURCE_CAPS budget check `continue`s
--      past foursquare (cap 30/run) for the 70+ places past the cap, with NO
--      diagnostic and (pre-fix) no record of any kind — so a single shared
--      "attempted" timestamp for the whole place would have been WRONG for
--      foursquare on most of the batch: it would look recently tried when it
--      was never actually asked.
--   2. A place with ONE working source (its only wf_place_popularity row) and
--      three sources that have NEVER been tried used to look "recently
--      fetched" overall (min() only sees the source that exists) and could
--      sit out of the batch indefinitely for the sources that have nothing.
-- wf_popularity_attempts is keyed (place_id, source) for exactly this reason,
-- and wf_popularity_stale_batch now takes p_source: each source rotates on
-- its own last_attempted_at clock and cannot be hidden behind another
-- source's success, cap-skip, or permanent retirement (tripadvisor).

create table if not exists public.wf_popularity_attempts (
  place_id           text not null references public.wf_inventory(place_id) on delete cascade,
  source             text not null check (source = any (array['yelp','foursquare','tripadvisor','wikipedia','ticketmaster','predicthq','besttime','google_trends'])),
  attempt_count      integer not null default 0,
  last_attempted_at  timestamptz,
  last_outcome       text,
  primary key (place_id, source)
);

create index if not exists wf_popularity_attempts_source_recency_idx
  on public.wf_popularity_attempts (source, last_attempted_at);

comment on table public.wf_popularity_attempts is
  'Attempt ledger for Tier-2 popularity enrichment (2026-09-07), one row per (place, source). A row here means "we asked", success or not. wf_place_popularity.fetched_at means "we got real data" and is written ONLY on success -- kept in a SEPARATE table on purpose so a failed attempt can never be mistaken for fresh data. See 20260907_wf_popularity_attempt_ledger.sql for the full incident.';
comment on column public.wf_popularity_attempts.last_attempted_at is
  'When this source was last actually invoked for this place (the fetcher was called), regardless of outcome. Null = never attempted, and sorts FIRST in wf_popularity_stale_batch. Bumped to now() on every attempt, so a repeatedly-failing place moves to the BACK of the queue like any other attempt -- it cannot monopolise the front.';
comment on column public.wf_popularity_attempts.last_outcome is
  'Diagnostic only (ok / no_data / low_confidence / whatever POP_DIAG named it) -- never read by the scheduler. Lets an operator see WHY a place keeps failing without changing WHEN it gets retried.';

-- Bump attempt state for a batch of (place, source) pairs in ONE call, called
-- for every pair the cron actually invoked this run -- WHATEVER it returned.
-- A cap-skipped pair (SOURCE_CAPS budget already spent this run) is NOT in
-- the batch passed here: it was never asked, so it must keep sorting as
-- never/oldest-attempted, not "just tried". Bulk (jsonb array), not one RPC
-- per pair, because a single cron run now attempts on the order of a few
-- hundred (place, source) pairs across four sources and this repo's existing
-- convention for that volume is a chunked bulk write (see the 200-row
-- wf_place_popularity upsert this mirrors), not a round trip per row.
create or replace function public.wf_popularity_record_attempts(p_attempts jsonb)
returns void
language sql
volatile
set search_path to 'public'
as $function$
  insert into public.wf_popularity_attempts (place_id, source, attempt_count, last_attempted_at, last_outcome)
  select a->>'place_id', a->>'source', 1, now(), a->>'outcome'
  from jsonb_array_elements(p_attempts) as a
  on conflict (place_id, source) do update
    set attempt_count     = wf_popularity_attempts.attempt_count + 1,
        last_attempted_at = now(),
        last_outcome      = excluded.last_outcome
$function$;

-- The selector, rebuilt per-source. Signature changed (p_n integer) -> (text,
-- text[], integer), so the old one-shared-batch shape cannot be called by
-- accident from anywhere still expecting it.
drop function if exists public.wf_popularity_stale_batch(integer);

create or replace function public.wf_popularity_stale_batch(p_source text, p_categories text[] default null, p_n integer default 100)
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
    -- p_categories is the JS-side categoriesForSource(source) inverse of
    -- sourcesFor() (lib/popularity.js) -- null means "every category routes
    -- here" (wikipedia/foursquare/tripadvisor); yelp passes ['food','nightlife'].
    -- Kept as a PARAMETER, not a hardcoded category list in this function, so
    -- the routing rule lives in exactly one place and cannot drift between
    -- this selector and sourcesFor().
    and (p_categories is null or i.category = any(p_categories))
  order by
    a.last_attempted_at asc nulls first,  -- never-attempted, then oldest-attempted (rules 1+2)
    p.fetched_at asc nulls first,          -- successful-data freshness, TIE-BREAK ONLY (rule 3)
    i.seen_at asc                          -- oldest-seen first among ties -- a new ingest joins the BACK, never jumps it
  limit greatest(coalesce(p_n,100),1)
$function$;

-- Backfill: every EXISTING wf_place_popularity row is a real success, so its
-- source has already been "attempted" for that place, at the time it
-- succeeded. Leaving these at (0, null) post-migration would put all 413 of
-- them back in the "never attempted" tier alongside the true 19,673 -- not
-- wrong (a harmless re-check), but not the honest starting state either.
-- Measured at apply time: 413 wf_place_popularity rows, all source=wikipedia
-- (yelp/foursquare/tripadvisor have never written one), so this backfills
-- exactly 413 wf_popularity_attempts rows.
insert into public.wf_popularity_attempts (place_id, source, attempt_count, last_attempted_at, last_outcome)
select place_id, source, 1, fetched_at, 'ok'
from public.wf_place_popularity
on conflict (place_id, source) do nothing;

-- Service-role-only, same lockdown as every other cron-internal RPC in this
-- file's family (20260825_security_hardening_v5.sql PART 1). New functions
-- already inherit no-EXECUTE-for-anon/authenticated from that migration's
-- ALTER DEFAULT PRIVILEGES, but this repo's convention is to say so
-- explicitly rather than rely on a default silently doing the right thing.
revoke all on function public.wf_popularity_record_attempts(jsonb) from public, anon, authenticated;
revoke all on function public.wf_popularity_stale_batch(text, text[], integer) from public, anon, authenticated;
