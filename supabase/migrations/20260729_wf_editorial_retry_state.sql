-- wf_editorial: the retry lifecycle state that did not exist.
--
-- wf_atlas_missing returns rows with NO wf_editorial record. A row written with
-- issues=['...'] IS a record, so the moment the generator wrote a failure that
-- place was excluded from every future run. Correct as idempotency, wrong as a
-- lifecycle: there was no state for "attempted, failed, try again", so 540 rows
-- that failed only because an API key was being rejected are permanently stuck
-- and nothing re-queues them (#438).
--
-- attempt_count and last_attempted_at are what let a retry path converge and be
-- rate-limited. Without them a retry either runs forever or cannot tell a row it
-- tried five minutes ago from one it has never touched.
alter table public.wf_editorial
  add column if not exists attempt_count     integer     not null default 0,
  add column if not exists last_attempted_at timestamptz;

-- Backfill: every existing failed row has been attempted exactly once, at the
-- time it was written. Leaving these at 0/null would make the first retry pass
-- treat a five-day-old failure as a virgin row, which is true of neither.
-- Published rows keep attempt_count 0 -- they are not retry candidates and the
-- column would only be noise on them.
-- Measured at apply time: 653 failed rows -> attempt_count 1, all with a
-- timestamp; 400 published rows untouched at 0.
update public.wf_editorial
   set attempt_count = 1,
       last_attempted_at = written_at
 where issues is not null
   and array_length(issues, 1) > 0
   and attempt_count = 0;

create index if not exists wf_editorial_retry_idx
  on public.wf_editorial (attempt_count, last_attempted_at)
  where issues is not null;

comment on column public.wf_editorial.attempt_count is
  'How many times generation has been attempted for this place. Backfilled to 1 for pre-existing failed rows (2026-07-29) -- 1 means "written once", not "retried once by the new path". A retry path must bound on this or it cannot converge.';
comment on column public.wf_editorial.last_attempted_at is
  'When generation was last attempted. Backfilled from written_at. Null only on rows never attempted.';
