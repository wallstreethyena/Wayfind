-- 20261015120000_wf_photo_purchase.sql — a privacy-conscious per-purchase record
-- for Google photo takes (observe-only, 2026-10-15).
--
-- WHY. wf_photo_outcome_daily counts classes per day; it cannot say which place
-- triggered a paid take, whether it was new vs retry vs free, whether the same
-- request was charged twice, or what caused a denial. One row per request that
-- reached the paid decision point answers those.
--
-- PRIVACY. No raw IP, raw user agent, photo ref/URL, key or query string is ever
-- stored: bucket_hash is a per-UTC-day salted hash (no cross-day linkability),
-- ua_class is a 5-value bucket. Rows are pruned after 35 days by
-- wf_photo_purchase_prune(). Writes come from lib/photoPurchaseLog.js, fail-soft.
create table if not exists public.wf_photo_purchase (
  id              bigserial primary key,
  ts              timestamptz not null default now(),
  place_id        text not null,
  surface         text check (surface in ('card','detail')),
  request_id      text,
  idempotency_key text,
  ledger_reason   text,
  upstream        text,
  retried         boolean,
  refunded        smallint,
  bucket_hash     text,
  ua_class        text,
  sfs             text,
  env             text,
  deployment_id   text
);

create index if not exists wf_photo_purchase_ts_idx on public.wf_photo_purchase (ts);
create index if not exists wf_photo_purchase_place_ts_idx on public.wf_photo_purchase (place_id, ts);

alter table public.wf_photo_purchase enable row level security;
-- No policies: internal telemetry, service_role only (bypasses RLS).
revoke all on public.wf_photo_purchase from anon, authenticated;
grant select, insert, delete on public.wf_photo_purchase to service_role;
revoke all on sequence public.wf_photo_purchase_id_seq from anon, authenticated;
grant usage, select on sequence public.wf_photo_purchase_id_seq to service_role;

comment on table public.wf_photo_purchase is
  'One row per /api/photo request that reached the paid Google decision point (granted, owned-miss or spend-denied). Observe-only (2026-10-15). No raw IP/UA/ref/URL/key: bucket_hash is a per-UTC-day salted hash. Pruned at 35 days by wf_photo_purchase_prune(). RLS enabled, no policies, service_role only.';

create or replace function public.wf_photo_purchase_prune()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n integer;
begin
  delete from public.wf_photo_purchase where ts < now() - interval '35 days';
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.wf_photo_purchase_prune() from public, anon, authenticated;
grant execute on function public.wf_photo_purchase_prune() to service_role;

comment on function public.wf_photo_purchase_prune() is
  'Deletes wf_photo_purchase rows older than 35 days; returns the number deleted. service_role only.';
