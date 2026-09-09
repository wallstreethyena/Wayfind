-- wf_affiliate_opportunity_seen — a monetization opportunity seen AGAIN is new
-- information, and until now it was thrown away.
--
-- THE DEFECT (owner's affiliate deep-link audit, 2026-09-08; measured against
-- production). app/api/cron/atlas-build/route.js is the ONLY writer of
-- wf_affiliate_opportunities, and it writes like this:
--
--     POST /rest/v1/wf_affiliate_opportunities?on_conflict=place_id
--     Prefer: resolution=ignore-duplicates,return=minimal
--
-- `ignore-duplicates` means an existing row is SKIPPED ENTIRELY. Not updated —
-- skipped. So for any place already in the queue:
--   * `hits` can never increment          -> the worklist cannot rank by demand
--   * `last_seen_at` can never refresh    -> "still unmonetized today" is unprovable
--   * `resolved_at` can never clear       -> a place that was marked resolved and
--                                            then went unmonetized again stays
--                                            invisible forever
--
-- MEASURED, production, 2026-09-08: 63 rows, EVERY ONE with hits = 1 and
-- first_seen_at = last_seen_at = 2026-08-21. The whole cohort was written once,
-- on one day, and has been frozen since. That looked like "nothing changed";
-- it was actually "nothing CAN change".
--
-- WHY IT HAS NOT BITTEN YET, AND WHEN IT WILL. Those cards sit on the 21-day
-- Atlas refresh cycle, so the first re-sighting of the 2026-08-21 cohort falls
-- around 2026-09-11/12. Every re-sighting from that date forward is a silent
-- no-op unless this ships first. The queue would keep looking like a static list
-- of 63 places rather than a live ledger of which money paths are still missing
-- and how often we are walking past them.
--
-- WHY AN RPC RATHER THAN A SMARTER POSTREST CALL. `resolution=merge-duplicates`
-- would fix the skip, but it REPLACES the row: it cannot increment `hits` from
-- its own previous value, cannot preserve `first_seen_at`, and cannot
-- conditionally clear `resolved_at`. Doing it client-side (read, compute, write)
-- is a read-modify-write across a network with no isolation — two Atlas
-- categories running concurrently would lose each other's increments. The
-- increment has to happen inside one statement, in the database. That is what
-- this function is.
--
-- REOPEN SEMANTICS, stated deliberately. Atlas only proposes a row for a place
-- that currently has NO verified product (route.js filters on `!have.has(...)`).
-- So a re-sighting is positive evidence that the money path is STILL missing,
-- whatever a human previously marked. Therefore a sighting clears `resolved_at`.
-- The alternative — respect the resolution and stay quiet — would mean a place
-- that was monetized and later lost its product silently drops out of the
-- worklist, which is the same class of blindness as the skip this replaces.
--
-- `p_rows` is a JSONB ARRAY so the whole batch is one atomic statement rather
-- than one round trip per place.

-- ---------------------------------------------------------------------------
-- I. THE TABLE, RECORDED IN THE REPO AT LAST.
--
-- This table has existed in production since 2026-07-23 and its DDL has never
-- been in this repository — `claude/wayfind-v8.30.0-EARN-LAW-REMEDIATION-2026-08-22.md`
-- claims "DDL in the repo at last" and that claim was not true. Every statement
-- below is `if not exists` and was transcribed from the live database on
-- 2026-09-09 (information_schema.columns + pg_indexes), so applying this is a
-- NO-OP against production and a record for everyone who reads the repo after.
-- ---------------------------------------------------------------------------
create table if not exists public.wf_affiliate_opportunities (
  id                uuid        primary key default gen_random_uuid(),
  place_id          text        not null unique,
  name              text,
  category          text,
  reason            text,
  suggested_partner text,
  created_at        timestamptz not null default now(),
  surface           text,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  hits              integer     not null default 1,
  resolved_at       timestamptz
);

-- The worklist's ordering index: open opportunities, most-hit first.
create index if not exists wf_affiliate_opportunities_open_idx
  on public.wf_affiliate_opportunities using btree (hits desc)
  where resolved_at is null;

-- RLS on, no policies — deny-all to anon/authenticated, service_role bypasses.
-- Re-asserted here rather than assumed: 20260825_security_hardening_v5.sql set
-- it, and a table whose DDL lives nowhere is a table whose posture nobody can
-- check by reading the repo.
alter table public.wf_affiliate_opportunities enable row level security;

-- ---------------------------------------------------------------------------
-- II. THE ATOMIC UPSERT.
-- ---------------------------------------------------------------------------
create or replace function public.wf_affiliate_opportunity_seen(p_rows jsonb)
returns table (
  inserted    integer,
  incremented integer,
  reopened    integer
)
language sql
volatile
security invoker
set search_path = pg_catalog
as $$
  with incoming as (
    select
      nullif(trim(r->>'place_id'), '')          as place_id,
      nullif(r->>'name', '')                    as name,
      nullif(r->>'category', '')                as category,
      nullif(r->>'reason', '')                  as reason,
      nullif(r->>'suggested_partner', '')       as suggested_partner,
      nullif(r->>'surface', '')                 as surface
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
    -- A malformed element must not become a row. Same rule as the rest of this
    -- codebase: an unreadable input is a failure, never an empty success.
    where jsonb_typeof(r) = 'object'
  ),
  -- One row per place_id, so a batch that names the same place twice increments
  -- ONCE. `hits` counts sightings, and a sighting is a run, not a row.
  deduped as (
    select distinct on (place_id) *
    from incoming
    where place_id is not null
    order by place_id
  ),
  -- What the row looked like BEFORE the write, so the counts below report what
  -- actually happened rather than what was attempted.
  prior as (
    select o.place_id, o.resolved_at
    from public.wf_affiliate_opportunities o
    join deduped d on d.place_id = o.place_id
  ),
  upserted as (
    insert into public.wf_affiliate_opportunities
      (place_id, name, category, reason, suggested_partner, surface,
       first_seen_at, last_seen_at, hits, resolved_at)
    select d.place_id, d.name, d.category, d.reason, d.suggested_partner, d.surface,
           now(), now(), 1, null
    from deduped d
    on conflict (place_id) do update set
      -- first_seen_at NEVER moves. It is the age of the opportunity.
      last_seen_at      = now(),
      hits              = public.wf_affiliate_opportunities.hits + 1,
      -- Still unmonetized today, so it is open again regardless of any earlier
      -- resolution. See the REOPEN SEMANTICS note above.
      resolved_at       = null,
      -- Refresh the descriptive fields, but never overwrite a value we have
      -- with a null we do not: a caller that omits `name` must not erase it.
      name              = coalesce(excluded.name, public.wf_affiliate_opportunities.name),
      category          = coalesce(excluded.category, public.wf_affiliate_opportunities.category),
      reason            = coalesce(excluded.reason, public.wf_affiliate_opportunities.reason),
      suggested_partner = coalesce(excluded.suggested_partner, public.wf_affiliate_opportunities.suggested_partner),
      surface           = coalesce(excluded.surface, public.wf_affiliate_opportunities.surface)
    returning place_id, (xmax = 0) as was_insert
  )
  select
    count(*) filter (where u.was_insert)::integer                                as inserted,
    count(*) filter (where not u.was_insert)::integer                            as incremented,
    count(*) filter (where not u.was_insert and p.resolved_at is not null)::integer as reopened
  from upserted u
  left join prior p on p.place_id = u.place_id;
$$;

-- Server-only. This function writes a revenue worklist and must never be
-- reachable by a browser key. The only intended caller is service_role, which
-- already has SELECT/INSERT/UPDATE on this table and BYPASSRLS in production,
-- so SECURITY INVOKER is sufficient and avoids unnecessary creator privilege.
-- The search path is pinned to pg_catalog and every relation is schema-qualified.
-- Execute is still revoked explicitly from PUBLIC/anon/authenticated rather than
-- relying on project-wide defaults, because this is an exposed-schema RPC.
revoke all on function public.wf_affiliate_opportunity_seen(jsonb) from public, anon, authenticated;
grant execute on function public.wf_affiliate_opportunity_seen(jsonb) to service_role;

comment on function public.wf_affiliate_opportunity_seen(jsonb) is
  'Atomically record affiliate-opportunity sightings: insert a new place, or increment hits / refresh last_seen_at / clear resolved_at for one already queued, preserving first_seen_at. Replaces a PostgREST resolution=ignore-duplicates write that silently discarded every re-sighting (63 rows frozen at hits=1 since 2026-08-21). Returns per-effect counts so callers report what happened, not what was attempted. SECURITY INVOKER; service role only. Called from lib/affiliateOpportunity.js.';
