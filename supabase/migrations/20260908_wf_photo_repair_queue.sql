-- wf_photo_repair_queue — a compass a reader saw is now a row someone can find.
--
-- THE INCIDENT (measured against production, 2026-09-08, scratchpad/facts.md).
-- The `photos` Google Places ledger exhausted 950/950 on 2026-09-01 19:43Z and
-- stays exhausted through September (resets 2026-10-01). Of 19,852 active
-- wf_inventory rows carrying a photo_ref, only 4,764 have a cache row for
-- their EXACT current ref — the other 15,088 have resolved to the branded
-- compass SVG (or, after #1182, a per-title monogram) for every request since
-- the ledger ran dry, and nothing recorded which places those were. This
-- migration is the persistent record: a queue a monitor and a repair worker
-- can write to and read from without ever spending another cent at Google.
--
-- SAME-PLACE CACHE RECOVERY ITSELF — finding a fresh cache row under an OLDER
-- photo ref for the same place — is #1184's lib/photoCacheRecovery.js, which
-- reads wf_places_cache by a bounded primary-key RANGE query
-- (`k gte 'photo|places/<id>/photos/'` / `lt '...photos0'`), deliberately
-- shaped so the table's existing pkey btree serves it with no new index. This
-- migration therefore adds ONLY the repair-queue table below — no index on
-- wf_places_cache.
--
-- WHY A TABLE, NOT A LOG LINE. A dead-run pulse (wf_job_pulse) says a job
-- failed; it does not say WHICH place is still showing a compass, so nobody
-- could tell, place by place, "still broken" from "recovered" from "never had
-- a photo at all". wf_photo_repair_queue is that per-place record, upserted
-- by both scripts/photo-monitor.mjs (detection) and
-- scripts/photo-repair-worker.mjs (classification/recovery), keyed on
-- place_id so repeated detections of the same place bump a counter instead of
-- duplicating rows.
--
-- THE OWNER'S HARD CONSTRAINTS THIS TABLE MUST NEVER VIOLATE (facts.md):
-- no additional Google spend or limit increase; a same-place cache reuse
-- keeps the ORIGINAL row's remaining lifetime, never a fresh 30 days; places
-- with no photo_ref at all stay recorded as `no-source`, never silently
-- filled with someone else's picture or a scraped/stock image; a
-- `spend-restricted` row is never rescheduled before the ledger resets
-- (lib/photoCoverage.js firstOfNextMonthUTC / nextAttemptAt).

create table if not exists public.wf_photo_repair_queue (
  place_id        text primary key references public.wf_inventory(place_id) on delete cascade,
  current_ref     text,
  failure_reason  text not null check (failure_reason = any (array[
                    'stale-reference','expired-cache','no-source','source-unavailable',
                    'spend-restricted','owned-miss'])),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  detections      integer     not null default 1,
  attempts        integer     not null default 0,
  next_attempt_at timestamptz not null default now(),
  status          text        not null default 'open'
                    check (status = any (array['open','recovered','unresolved','retired'])),
  recovery_source text,
  recovery_ref    text,
  attribution     jsonb,
  last_error      text,
  updated_at      timestamptz not null default now()
);

create index if not exists wf_photo_repair_queue_status_next_idx
  on public.wf_photo_repair_queue (status, next_attempt_at);

alter table public.wf_photo_repair_queue enable row level security;
revoke all on public.wf_photo_repair_queue from anon, authenticated;
grant select, insert, update, delete on public.wf_photo_repair_queue to service_role;

comment on table public.wf_photo_repair_queue is
  'Persistent per-place photo-repair record (2026-09-08). One row per place_id that a probe has ever seen serving the compass fallback (or, after #1182, a per-title miss), or that the repair worker classified as needing attention. Written by scripts/photo-monitor.mjs (detection, on a compass/miss probe) and scripts/photo-repair-worker.mjs (classification and same-place-cache recovery via lib/photoCacheRecovery.js). Never deleted automatically -- status=unresolved stays visible on purpose, and status=retired is an operator-only verdict. See this file for the full incident.';
comment on column public.wf_photo_repair_queue.failure_reason is
  'Why the place currently has no real photo. stale-reference: inventory photo_ref changed since current_ref was cached. expired-cache: reserved for a future exact-key-expiry distinction; not currently emitted. no-source: wf_inventory has no photo_ref at all (genuinely photoless -- never filled with another place''s or a scraped/stock image). source-unavailable: a photo_ref exists, is uncached, and the photos ledger has headroom -- left for a real request to resolve, the worker never buys. spend-restricted: a photo_ref exists, is uncached, and the photos ledger is exhausted this month.';
comment on column public.wf_photo_repair_queue.status is
  'open: still showing the compass or a per-title miss. recovered: same-place-cache (or a later real fetch) resolved it -- attempts preserved, and a row seen again after recovery flips back to open. unresolved: attempts reached lib/photoCoverage.js MAX_ATTEMPTS -- still counted, still visible, never silently dropped. retired: an operator decided this place will never have a real photo (e.g. permanently closed) -- the only status this migration does not set automatically.';
comment on column public.wf_photo_repair_queue.next_attempt_at is
  'When the repair worker may next attempt this row. Backoff (1h,4h,1d,3d,7d,7d) or, for spend-restricted, the first instant of next UTC month -- never earlier, because the exhausted ledger cannot un-exhaust itself mid-month. See lib/photoCoverage.js backoffMs / nextAttemptAt / firstOfNextMonthUTC.';
comment on column public.wf_photo_repair_queue.attribution is
  'Recovery provenance, e.g. {"source":"google-places-photo","ref":...,"cached_exp":...,"place_id":...,"recovered_at":...} -- set only on a recovery. Never a wrong-place or invented attribution: the recovery ref is re-verified to belong to place_id before this is written (lib/photoCacheRecovery.js).';
