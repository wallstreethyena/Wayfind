-- 20260916120000_wf_spend_refund_and_photo_outcomes.sql — give back a ledger
-- grant Google never billed, and count WHY every photo attempt ended the way
-- it did.
--
-- WHY (2026-09-16, Google Cloud console verified). Places API (New)'s
-- `GetPhotoMediaRequest per day` quota carries a MANUAL OVERRIDE of 32 (the
-- Google default is 175,000). Today's usage: 34/32 (100%+). Every request past
-- the 32nd is rejected by Google — RESOURCE_EXHAUSTED / PERMISSION_DENIED /
-- UNAVAILABLE / INTERNAL — and per Google's own billing table
-- (developers.google.com/maps/reporting-and-monitoring/reporting), none of
-- those are billed: OVER_QUERY_LIMIT/RESOURCE_EXHAUSTED/rateLimitExceeded
-- (403/429) is NOT billed, REQUEST_DENIED is NOT billed, UNKNOWN_ERROR
-- (500/503) is NOT billed. Only OK, NOT_FOUND, and an INVALID_REQUEST with an
-- "invalid parameter value" are billed. Wayfind's own `photos` ledger
-- (wf_spend_ledger, wf_spend_take) counted every ATTEMPT, billed or not —
-- September read 1,170 counted against Google's real day-by-day serving
-- capacity of at most 32 — so the ledger looked "spent" while Google had
-- refused almost everything for free. This migration adds the one write path
-- that lets lib/spendGate.js's refundToLedger() give back a grant for an
-- attempt Google did not (and, per its own published contract, will not)
-- bill for — and a place to count, per day and per class, what actually
-- happened, so the next incident like this one is visible in a dashboard
-- instead of reconstructed from a support ticket three weeks later.
--
-- wf_spend_refund is the return path for wf_spend_take (2026-08-25's
-- $1,878 guard's own ledger), same (month, sku) key —
-- to_char(now() at time zone 'utc', 'YYYY-MM') — same SECURITY DEFINER +
-- search_path posture, same bounded p_n (1..10, matching wf_spend_take's own
-- p_cap-style bound) so a single call can never zero out or corrupt a whole
-- month's row. `greatest(used - p_n, 0)` — a refund can reduce `used` to zero
-- but never negative, so a double-refund (a bug, a retry, a race) degrades to
-- "some headroom looks larger than it should", never to a negative counter a
-- reader downstream would have to special-case. Returns `found` — false when
-- the (month, sku) row does not exist yet, exactly like a request never
-- having been taken; the caller (lib/spendGate.js's refundToLedger) treats
-- that as "nothing to refund", not an error.
--
-- wf_spend_take's own CREATE FUNCTION is not present anywhere in this
-- migrations directory (it predates migration-tracked schema changes on this
-- project, applied directly against the database) — there is nothing to grep
-- its grants from, so this migration states the grants explicitly instead of
-- copying them: revoke from anon/authenticated (a metered spend function is
-- never public-callable), grant execute to service_role only (server-side
-- lib/spendGate.js runs with the service role key).
create or replace function public.wf_spend_refund(p_sku text, p_n integer default 1)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
  if p_n is null or p_n < 1 or p_n > 10 then
    return false;
  end if;
  update public.wf_spend_ledger
     set used = greatest(used - p_n, 0),
         updated_at = now()
   where month = m
     and sku = p_sku;
  return found;
end;
$function$;

revoke all on function public.wf_spend_refund(text, integer) from public, anon, authenticated;
grant execute on function public.wf_spend_refund(text, integer) to service_role;

comment on function public.wf_spend_refund(text, integer) is
  'Gives back p_n (1-10) grants to the CURRENT UTC-month wf_spend_ledger row for p_sku — the return path for wf_spend_take, same (month, sku) key. used never goes below 0 (greatest(used - p_n, 0)); returns found (false when no row exists for this (month, sku) yet, or when p_n is out of range — both read as "nothing to refund", never an error). Added 2026-09-16 so lib/spendGate.js.refundToLedger can give back a photos grant for a Google request that RESOURCE_EXHAUSTED/PERMISSION_DENIED/UNAVAILABLE/INTERNAL refused — per developers.google.com/maps/reporting-and-monitoring/reporting, none of those are billed, so the ledger counting them as spent was overcounting. service_role only, same posture as wf_spend_take.';

-- ── wf_photo_outcome_daily — WHY every photo attempt ended the way it did ──
--
-- One row per (day, class): day is venue-facing (America/New_York,
-- lib/siteTime.js siteTodayStr — the SAME "today" every other date cutoff in
-- this app uses; Google's OWN daily quota resets at Pacific midnight, which
-- is a SEPARATE clock this table does not try to be — see
-- lib/placePhotoServe.js msUntilNextPacificMidnight for that one). class is a
-- short machine tag: ok / quota / key-denied / server / network / redirect /
-- badjson / unowned / stale / client / stale-heal-* / quota-open /
-- ledger-denied / refunded — never free text, never a message body, enforced
-- below by a narrow CHECK so a bug cannot smuggle an unbounded string (or a
-- key/ref/URL a caller mistakenly passed as `class`) into this table.
create table if not exists public.wf_photo_outcome_daily (
  day        date not null,
  class      text not null,
  n          integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, class)
);

alter table public.wf_photo_outcome_daily
  drop constraint if exists wf_photo_outcome_daily_class_check;
alter table public.wf_photo_outcome_daily
  add constraint wf_photo_outcome_daily_class_check
  check (class ~ '^[a-z0-9:_-]{1,40}$');

alter table public.wf_photo_outcome_daily enable row level security;
-- No policies: every role except service_role (which bypasses RLS) sees zero
-- rows and can write none. This is an internal telemetry table, not a serving
-- surface — matching wf_photo_repair_queue's own posture.
revoke all on public.wf_photo_outcome_daily from anon, authenticated;
grant select, insert, update on public.wf_photo_outcome_daily to service_role;

comment on table public.wf_photo_outcome_daily is
  'Daily counts of photo-serve outcome classes (2026-09-16) — one row per (day, class), day = America/New_York calendar day (lib/siteTime.js siteTodayStr, NOT Google''s Pacific quota-reset day). Bumped by public.wf_photo_outcome_bump from app/api/photo/route.js''s recordPhotoOutcome for every Google-path result: ok/quota/key-denied/server/network/redirect/badjson/unowned/stale/client/stale-heal-*/quota-open/ledger-denied/refunded. RLS enabled, no policies — service_role only, same posture as wf_photo_repair_queue.';

create or replace function public.wf_photo_outcome_bump(p_day date, p_class text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_day is null or p_class !~ '^[a-z0-9:_-]{1,40}$' then
    return;
  end if;
  insert into public.wf_photo_outcome_daily (day, class, n, updated_at)
  values (p_day, p_class, 1, now())
  on conflict (day, class)
  do update set n = public.wf_photo_outcome_daily.n + 1,
                updated_at = now();
end;
$function$;

revoke all on function public.wf_photo_outcome_bump(date, text) from public, anon, authenticated;
grant execute on function public.wf_photo_outcome_bump(date, text) to service_role;

comment on function public.wf_photo_outcome_bump(date, text) is
  'Upsert +1 to wf_photo_outcome_daily(p_day, p_class). p_class must match ^[a-z0-9:_-]{1,40}$ or this is a no-op (never raises — a telemetry write must never be why a photo response fails). Called from lib/photoOutcomes.js recordPhotoOutcome, itself bounded (400ms timeout) and never throwing. service_role only.';
