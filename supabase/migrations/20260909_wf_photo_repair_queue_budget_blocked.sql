-- wf_photo_repair_queue: budget is a LIVE dependency, not a calendar date.
--
-- THE DEFECT (measured in production, 2026-09-09). 20260908's queue gave a
-- `spend-restricted` row `next_attempt_at = firstOfNextMonthUTC(now)` — a
-- CALENDAR date baked in at classification time, on the assumption that the
-- only way the `photos` ledger regains headroom is the monthly reset. That
-- assumption broke the day it was written: the owner raised the photos cap
-- the same day (lib/spendGate.js's photosPaidCap/GOOGLE_PHOTOS_MONTH_CAP,
-- #1186), so wf_spend_ledger's 2026-09 `photos` row now reads used=968,
-- cap=2000 -- 1,032 grants of open headroom -- while all 173 rows this
-- migration repairs sit with next_attempt_at pinned to 2026-10-01T00:00:00Z.
-- Nothing un-pins them: the queue is still waiting three weeks on a budget
-- that has already reopened. Budget state was encoded as a date instead of
-- a live read of the ledger.
--
-- THE FIX HAS TWO HALVES. (1) THIS MIGRATION never schedules a calendar
-- date again -- lib/photoCoverage.js's nextAttemptAt loses its
-- spend-restricted/calendar branch in the same lane's JS change, and every
-- row this migration touches gets next_attempt_at = now(), immediately
-- eligible. (2) lib/photoRepair.js's drain reads wf_spend_ledger ONCE per
-- run and asks it fresh every time a row is due -- headroom is a fact about
-- RIGHT NOW, checked at repair time, never baked into a schedule. A widened
-- allowance is visible to the queue the very next drain, not next month.
--
-- WHY A NEW STATUS, NOT A next_attempt_at REWRITE ALONE. `open` already
-- means "the repair worker owns this row and MAY buy a Google fetch when it
-- comes due" (see 20260908's own status comment: source-unavailable is
-- "left for a real request to resolve, the worker never buys"). A
-- budget-blocked row is different in kind: the worker has ALREADY decided
-- this row needs money and there is none -- it is not idly waiting its
-- turn, it is BLOCKED on an external fact (the ledger) that only
-- lib/photoRepair.js itself, not a client request, can observe changing.
-- Folding it into `open` would make wf_photo_queue_census (below) unable to
-- tell "not yet due" from "blocked on cash", which is exactly the
-- distinction an operator needs to answer "why is this queue not draining".
--
-- `blocked_since` (new column) records when a row FIRST became
-- budget-blocked, distinct from `updated_at` (touched on every patch) and
-- `first_seen_at` (when the monitor first detected the place, unrelated to
-- budget state). wf_photo_queue_census's `min(blocked_since)` is how an
-- operator sees "how long has the oldest blocked row been waiting", which
-- next_attempt_at alone cannot answer once it is reset to now() on release.
--
-- attempts IS NEVER INCREMENTED ON A BUDGET-BLOCKED TRANSITION (enforced in
-- lib/photoRepair.js, not by this schema, since attempts bookkeeping is
-- worker logic). This migration exists because 173 rows already had their
-- calendar date baked in while the ledger was exhausted at 950/950 -- their
-- attempts counters are untouched by this migration and must stay that way
-- going forward: MAX_ATTEMPTS is a promise about how many times a REAL
-- repair was tried and failed, and waiting on money is not a failed repair.
--
-- CHECK CONSTRAINT NAME. 20260908_wf_photo_repair_queue.sql declared
-- `status text not null default 'open' check (status = any (array[...]))`
-- inline, with no CONSTRAINT name -- Postgres names an unnamed table CHECK
-- constraint `<table>_<column>_check` (confirmed against this repo's own
-- convention: 20260907150500_social_acquisition_conveyor_v1.sql explicitly
-- names an equivalent inline check `wf_social_candidates_source_check`,
-- i.e. `<table>_<column>_check`, matching what Postgres would have picked
-- unnamed). So the live constraint here is
-- `wf_photo_repair_queue_status_check`; verified by reading the prior
-- migration's DDL, not guessed. `drop constraint if exists` makes the
-- rename-or-reapply idempotent even if that assumption is ever wrong on a
-- given environment -- the `add constraint` immediately after re-establishes
-- the widened rule either way.
--
-- Idempotent. Safe to run more than once: the constraint swap is
-- drop-if-exists + add, the column add is if-not-exists, and the data-fix
-- UPDATE only ever matches rows still in the pre-fix shape (a second run
-- finds none, because the first run already moved them to budget_blocked).

-- ── widen the status CHECK ──────────────────────────────────────────────
alter table public.wf_photo_repair_queue
  drop constraint if exists wf_photo_repair_queue_status_check;

alter table public.wf_photo_repair_queue
  add constraint wf_photo_repair_queue_status_check
  check (status = any (array['open','budget_blocked','recovered','unresolved','retired']));

-- ── the column the transition needs ─────────────────────────────────────
alter table public.wf_photo_repair_queue
  add column if not exists blocked_since timestamptz;

-- ── DATA FIX: un-pin the 173 rows the calendar bug stranded ────────────
-- Every row this UPDATE matches was classified `spend-restricted` while the
-- ledger read 950/950 and given next_attempt_at = 2026-10-01T00:00:00Z. The
-- ledger has headroom NOW (used=968, cap=2000), so these rows go straight
-- to budget_blocked with next_attempt_at = now() -- immediately visible to
-- lib/photoRepair.js's fetchDueRows, which the very next drain will re-ask
-- the ledger about and release on its own (headroom > 0, symmetric
-- fail-closed) rather than this migration guessing the release itself.
-- failure_reason moves to 'source-unavailable' -- 'spend-restricted' is
-- retired from every future write (kept in the CHECK above for history
-- only; see lib/photoRepair.js, which never emits it again) and
-- 'source-unavailable' is the accurate, timeless description of "a
-- photo_ref exists, is uncached, and something external stands between it
-- and a fetch" that both spend-blocked and merely-not-yet-due rows already
-- share. blocked_since is backfilled from the row's own updated_at (the
-- last time this migration's predecessor actually classified it), which is
-- the closest honest answer this migration has to "when did this row
-- become budget-blocked" -- not now(), which would understate every row's
-- true wait by the time this migration runs.
update public.wf_photo_repair_queue
set status = 'budget_blocked',
    blocked_since = updated_at,
    failure_reason = 'source-unavailable',
    next_attempt_at = now()
where status = 'open'
  and failure_reason = 'spend-restricted';

-- ── wf_photo_queue_census — the queue's live shape, one grouping-sets pass ─
--
-- Two grains in one view via GROUP BY GROUPING SETS: rows where
-- failure_reason is null are the "by status" rollup; rows where it is set
-- are the "by (status, failure_reason)" breakdown. An operator (or
-- app/api/health/photos, a future reader) filters on
-- `failure_reason is null` for the coarse view or `is not null` for the
-- fine one, from a single query with no UNION to keep in sync.
--
-- satisfiable_by: how many rows in this bucket have SOME path to a real
-- photo right now -- either a live inventory photo_ref (the Google path,
-- contingent on budget) or an active wf_place_photo vault row (the FREE
-- path, never budget-contingent). This is "could be resolved", not "will
-- be resolved this drain" -- a budget_blocked row with a ref counts here
-- even while headroom is 0, because vault-first recovery in
-- lib/photoRepair.js's decideRowOutcome checks the free path BEFORE ever
-- consulting the ledger.
--
-- starved: the genuinely stuck subset -- no photo_ref at all (no-source,
-- structurally photoless) AND the vault worker already looked and found
-- nothing free-licensed (status='rejected'). No budget on earth resolves a
-- starved row; it needs a new source, not more money. This is the number
-- that answers "how many places will NEVER get a photo without new data",
-- distinct from every other count here, which answers "how many are
-- waiting on something".
--
-- recovered_24h / opened_24h: rolling 24h activity, so a dashboard reading
-- this view on a schedule can see throughput without querying wf_job_pulse.
-- opened_24h reads first_seen_at (when the MONITOR first saw this place
-- broken), never updated_at, so a row bumped by a re-detection today but
-- first seen last month does not read as "newly opened".
--
-- min(blocked_since): the oldest currently-blocked row's wait start --
-- non-null only on the budget_blocked breakdown rows; null everywhere else
-- (no row in another status bucket has ever been budget_blocked, or it
-- would be a budget_blocked row instead).
--
-- security_invoker=true (this repo's standing rule for every read view --
-- see 20260905_editorial_read_gate.sql) so this can never be used to read
-- around RLS on wf_photo_repair_queue / wf_inventory / wf_place_photo; moot
-- for service_role (BYPASSRLS) but correct regardless of which role ends up
-- reading it. revoke/grant below matches wf_photo_repair_queue's own posture
-- (service_role only -- this is an internal operator view, not a serving
-- surface).
create or replace view public.wf_photo_queue_census
with (security_invoker = true) as
select
  q.status,
  q.failure_reason,
  count(*)                                                              as n,
  count(*) filter (
    where i.photo_ref is not null or vp.status = 'active'
  )                                                                      as satisfiable_by,
  count(*) filter (
    where i.photo_ref is null and vp.status = 'rejected'
  )                                                                      as starved,
  count(*) filter (
    where q.status = 'recovered' and q.updated_at > now() - interval '24 hours'
  )                                                                      as recovered_24h,
  count(*) filter (
    where q.first_seen_at > now() - interval '24 hours'
  )                                                                      as opened_24h,
  min(q.blocked_since)                                                  as min_blocked_since
from public.wf_photo_repair_queue q
left join public.wf_inventory i   on i.place_id = q.place_id
left join public.wf_place_photo vp on vp.place_id = q.place_id
group by grouping sets ((q.status), (q.status, q.failure_reason))
order by q.status, q.failure_reason nulls first;

revoke all on public.wf_photo_queue_census from anon, authenticated;
grant select on public.wf_photo_queue_census to service_role;

comment on view public.wf_photo_queue_census is
  'The repair queue''s live shape (2026-09-09), one GROUPING SETS pass over ((status), (status,failure_reason)) -- filter failure_reason is null for the coarse by-status rollup, is not null for the fine breakdown. satisfiable_by = rows with SOME path to a real photo right now (live inventory photo_ref OR an active wf_place_photo vault row) -- "could be resolved", not "will be this drain". starved = no photo_ref at all AND the vault already rejected this place -- no budget resolves these, they need a new source. recovered_24h / opened_24h are rolling-24h activity (opened_24h reads first_seen_at, never updated_at, so a re-detection does not read as newly opened). min_blocked_since is the oldest currently budget_blocked row''s wait start, null on every other status bucket. security_invoker=true, service_role only.';

-- ── wf_photo_coverage_census — active inventory vs. real coverage ────────
--
-- Same key-parsing shape wf_photo_at_risk (20260909_wf_place_photo_vault.sql)
-- already proved: the cache key is `photo|<ref>|<width>`, so
-- split_part(k,'|',2) IS the ref, and joining that to i.photo_ref by
-- EQUALITY finds every cached width variant for a place's exact current ref.
--
-- MEASURED, do not "simplify" this back (2026-09-09). The obvious spelling,
-- `c.k like 'photo|' || i.photo_ref || '|%'`, cannot use any index: a prefix
-- LIKE is only index-eligible when the prefix is a CONSTANT, and here it is
-- built from the other side of the join. EXPLAIN on production returned a
-- Nested Loop with a Join Filter at cost 39,556,129 (~19.8k inventory rows x
-- ~44.8k live cache rows). The split_part equality form plans as a Parallel
-- Hash Join at cost 12,266 -- the same shape, 3,200x cheaper. If this view
-- ever needs to get faster still, the next step is an expression index on
-- split_part(k,'|',2), not a return to the LIKE.
--
-- A left join (never inner) so a place with zero cache rows still
-- contributes to `total`/`with_ref` -- only `fresh_exact_cache`/`expiring_*`
-- require a match.
--
-- fresh_exact_cache: places whose CURRENT ref has at least one unexpired
-- cache row right now -- the population that is NOT showing a placeholder
-- this instant, by the same definition lib/photoCoverage.js's
-- computePhotoCoverage uses for exactFresh.
--
-- expiring_7d / expiring_30d: of the fresh-cached population, how many die
-- within the window -- the SAME cliff wf_photo_at_risk enumerates row by
-- row, counted here so a dashboard does not have to COUNT(*) that view
-- itself every poll. A place with no fresh cache row at all is excluded
-- from both (it is already a placeholder, not "at risk of becoming one").
--
-- vault_active / vault_rejected: how much of the OPERATIONAL population the
-- permanent free lane has already resolved one way or the other -- the
-- complement, `total - vault_active - vault_rejected`, is "the vault worker
-- has not looked at this place yet".
--
-- Scoped to wf_inventory.status = 'OPERATIONAL' only, matching every other
-- reader in this lane (scripts/photo-monitor.mjs's fetchActiveRows,
-- app/api/health/photos) -- a closed/pending place is not part of "coverage"
-- by definition.
create or replace view public.wf_photo_coverage_census
with (security_invoker = true) as
with active_inventory as (
  select i.place_id, i.photo_ref
  from public.wf_inventory i
  where i.status = 'OPERATIONAL'
),
cache_exact as (
  select ai.place_id, min(c.exp) as earliest_exp
  from active_inventory ai
  join public.wf_places_cache c
    on split_part(c.k, '|', 2) = ai.photo_ref
   and c.k like 'photo|%'
   and c.exp > now()
  where ai.photo_ref is not null
  group by ai.place_id
)
select
  count(*)                                                                       as total,
  count(*) filter (where ai.photo_ref is not null)                               as with_ref,
  count(*) filter (where vp.status = 'active')                                   as vault_active,
  count(*) filter (where vp.status = 'rejected')                                 as vault_rejected,
  count(*) filter (where ce.place_id is not null)                                as fresh_exact_cache,
  count(*) filter (where ce.earliest_exp is not null
                      and ce.earliest_exp <= now() + interval '7 days')          as expiring_7d,
  count(*) filter (where ce.earliest_exp is not null
                      and ce.earliest_exp <= now() + interval '30 days')         as expiring_30d
from active_inventory ai
left join cache_exact ce      on ce.place_id = ai.place_id
left join public.wf_place_photo vp on vp.place_id = ai.place_id;

revoke all on public.wf_photo_coverage_census from anon, authenticated;
grant select on public.wf_photo_coverage_census to service_role;

comment on view public.wf_photo_coverage_census is
  'Real photo coverage over active (OPERATIONAL) wf_inventory (2026-09-09). total/with_ref describe the population; vault_active/vault_rejected describe how much of it the permanent free lane has resolved; fresh_exact_cache/expiring_7d/expiring_30d describe the Google-rented population''s cliff, using the same photo|<ref>|<width> key-parsing shape wf_photo_at_risk proved -- split_part(k,''|'',2) joined to photo_ref by EQUALITY (a hash join), never a LIKE built from the joined column, which plans as a 39.5M-cost nested loop because a prefix LIKE is only index-eligible when the prefix is constant. expiring_* counts only places WITH a fresh exact-ref cache row (excludes places already showing a placeholder). security_invoker=true, service_role only.';

-- ── existing column comments, corrected for budget_blocked ───────────────
comment on column public.wf_photo_repair_queue.status is
  'open: still showing the compass or a per-title miss, and may still be repaired (attempts keeps incrementing on backoff). budget_blocked: the worker already tried and found a photo_ref with no headroom in wf_spend_ledger -- attempts UNCHANGED (waiting on money is not a failed repair attempt), blocked_since set once, next_attempt_at reset to now() so the row is picked up the instant a later drain sees headroom > 0 (never a calendar date -- see lib/photoCoverage.js nextAttemptAt, which no longer has a branch that returns one). recovered: same-place-cache, the free vault, or a later real fetch resolved it -- attempts preserved, and a row seen again after recovery flips back to open. unresolved: attempts reached lib/photoCoverage.js MAX_ATTEMPTS on a NON-blocked verdict -- still counted, still visible, never silently dropped; a budget_blocked row can never reach unresolved by waiting, only by later failing a REAL attempt. retired: an operator decided this place will never have a real photo (e.g. permanently closed) -- the only status this migration does not set automatically.';

comment on column public.wf_photo_repair_queue.blocked_since is
  'When this row FIRST transitioned to budget_blocked (2026-09-09). Set once and never touched again while the row stays blocked; explicitly cleared (written back to null) the moment lib/photoRepair.js releases the row out of budget_blocked, so a released row never carries a stale wait-start forward. Distinct from updated_at (touched on every patch) and first_seen_at (when the monitor first detected the place, unrelated to budget state). wf_photo_queue_census''s min(blocked_since) is how an operator sees the oldest currently-waiting row.';

comment on column public.wf_photo_repair_queue.failure_reason is
  'Why the place currently has no real photo. stale-reference: inventory photo_ref changed since current_ref was cached. expired-cache: reserved for a future exact-key-expiry distinction; not currently emitted. no-source: wf_inventory has no photo_ref at all (genuinely photoless -- never filled with another place''s or a scraped/stock image). source-unavailable: a photo_ref exists and is uncached -- covers both "the ledger has headroom, left for a real request" (status=open) and "the ledger is exhausted" (status=budget_blocked); the STATUS column, not this one, is what distinguishes them since 2026-09-09. spend-restricted: RETIRED 2026-09-09 -- kept in the CHECK constraint only so historical rows and this migration''s own predecessor remain legible; no code path writes it again (lib/photoRepair.js never emits it; see the incident note at the top of this migration for why a calendar-encoded budget state was the bug).';

comment on column public.wf_photo_repair_queue.next_attempt_at is
  'When the repair worker may next attempt this row. Backoff (1h,4h,1d,3d,7d,7d) for every non-blocked classification. A budget_blocked row is reset to now() on every transition into or through that status (2026-09-09) -- headroom is checked fresh on every drain via wf_spend_ledger, never scheduled against a calendar assumption about when the ledger resets. See lib/photoCoverage.js backoffMs / nextAttemptAt (the calendar branch is gone) and lib/photoRepair.js''s symmetric fail-closed headroom read.';
