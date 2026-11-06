-- Source checked 2026-11-06: https://santaswonderlandfestival.com now shows
-- 2025 attractions/sponsors and Dec 12-14 hours, with no current 2026 dates.
-- https://www.eventeny.com/event-list/Santa039s-Wonderland-Festival-6157/
-- is an unclaimed estimate: header 12/12/2026 conflicts with body Dec 19-20.
-- This does NOT establish cancellation. Preserve the information page using
-- lib/eventPublicationHold.js, the old verification evidence, and Nov 8 recheck.
-- Deploy pending-page support BEFORE applying this whole committed migration
-- through scripts/apply-migration.mjs. No source-fetch success is stamped here.
do $$
declare r public.wf_events%rowtype; n integer;
begin
  select * into strict r from public.wf_events
    where event_id = 'santas-wonderland-festival-2026' for update;
  if r.slug is distinct from 'santas-wonderland-festival-2026'
    or r.year is distinct from 2026
    or r.event_status is distinct from 'scheduled'
    or r.verification_confidence is distinct from 'medium'
    or r.start_date is distinct from date '2026-12-19'
    or r.end_date is distinct from date '2026-12-20'
    or r.start_time is not null or r.end_time is not null
    or r.select_nights is distinct from false
    or r.last_verified_at is distinct from timestamptz '2026-10-22 09:01:58.73262+00'
    or r.recheck_on is distinct from date '2026-11-08'
    or r.source_url is distinct from 'https://santaswonderlandfestival.com'
    or r.official_event_url is distinct from 'https://santaswonderlandfestival.com'
    or r.card_hook is distinct from 'Santa''s Wonderland Festival returns to Lake Wimauma Convention Center for its second year, Dec 19 and 20, 2026.'
    or r.schedule_note is distinct from 'Sat Dec 19 to Sun Dec 20, 2026'
    or position('2026-11-06 SWEEP FAIL' in coalesce(r.recheck_reason, '')) = 0
  then raise exception 'Santa publication hold: row changed since reviewed evidence; re-review required';
  end if;
  update public.wf_events set
    event_status = 'unannounced', verification_confidence = 'low',
    start_date = null, end_date = null, start_time = null, end_time = null,
    select_nights = false,
    schedule_note = '2026 dates are not confirmed. The organizer currently shows 2025 information. Recheck November 8, 2026.',
    card_hook = 'Santa''s Wonderland Festival in Wimauma. Current 2026 dates await organizer confirmation.',
    editorial_summary = 'Current 2026 dates await organizer confirmation. Wayfind is checking the official festival website for an updated announcement.',
    verify_note = concat_ws(E'\n', nullif(verify_note, ''), '2026-11-06 publication hold: prior Dec 19-20, 2026 dates are unconfirmed. Official https://santaswonderlandfestival.com now shows 2025-only schedule/attractions. Unclaimed Eventeny estimate https://www.eventeny.com/event-list/Santa039s-Wonderland-Festival-6157/ conflicts: header 12/12/2026, body Dec 19-20, 2026. No cancellation inferred. Preserve Nov 8 recheck; last_verified_at is intentionally unchanged.')
  where event_id = r.event_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Santa publication hold: expected one update, got %', n; end if;
end $$;

-- Read back status/confidence, null dates/times, recheck_on 2026-11-08,
-- unchanged last_verified_at and source identity; verify the pending HTTP200
-- page after ISR/cache refresh and absence from dated feeds/schema/reminders.
-- Do not automatically reverse: restoring dates requires fresh organizer proof.
