-- Noah Kahan, Raymond James Stadium, Tampa, Thu Apr 29 2027: held as an UNANNOUNCED row.
-- event_status 'unannounced' is not in DISPLAYABLE_STATUS (lib/curatedEvents.js), so no
-- card, page, strip or sitemap entry can render it. Its only job is recheck_on: the daily
-- "Wayfind — daily event truth" scheduled task (08:07 ET) queues unannounced rows whose
-- recheck_on has arrived (queue class 5). Reviewed in the PR that carries this file; run
-- after merge; insert only; NOT EXISTS on event_id and slug.
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.wf_events (
  event_id, event_series_id, slug, year, timezone, event_status, city, county, state,
  category, subcategory, tags, audience, event_name, short_title, start_date, end_date,
  select_nights, schedule_note, venue, address, lat, lng, is_free, card_hook,
  official_event_url, source_url, source_type, source_tier, verification_confidence,
  last_verified_at, verify_note, recheck_on, recheck_reason, recheck_set_at
)
SELECT
  'noah-kahan-last-of-the-bugs-tampa-2027', 'noah-kahan-tampa', 'noah-kahan-last-of-the-bugs-tampa-2027', 2027, 'America/New_York', 'unannounced',
  'Tampa', 'Hillsborough', 'FL', 'music', 'concert', ARRAY['concert','music','stadium']::text[], ARRAY[]::text[],
  'Noah Kahan: The Last of the Bugs World Tour, Tampa', 'Noah Kahan in Tampa', DATE '2027-04-29', DATE '2027-04-29',
  false, 'Thu Apr 29 2027. Presale registration closes Nov 5 (11:59 pm ET); artist presale Nov 10 at noon; general sale Nov 12 at noon, per Ticketmaster.',
  'Raymond James Stadium', '4201 N Dale Mabry Hwy, Tampa, FL 33607', 27.977838, -82.505423, false,
  'Noah Kahan brings The Last of the Bugs World Tour to Raymond James Stadium in Tampa.',
  'https://blog.ticketmaster.com/noah-kahan-2027-tour-dates/', 'https://blog.ticketmaster.com/noah-kahan-2027-tour-dates/', 'ticketer-announcement', 2, 'medium',
  TIMESTAMPTZ '2026-11-03T19:30:00Z',
  '2026-11-03: HELD, not public. Ticketmaster tour announcement (blog.ticketmaster.com, 2026-10-29) lists 04/29/27 Tampa, FL (Raymond James Stadium); presale signup deadline Thu Nov 5 11:59 pm ET; artist presale Tue Nov 10 12:00 pm local; general on sale Thu Nov 12 12:00 pm local. Corroborated by buffalobills.com (venue side for Buffalo only) and WFTS Tampa Bay 28 (press). No Ticketmaster EVENT page, no noahkahan.com/tour Tampa entry, no Live Nation / raymondjamesstadium.com / Tampa Sports Authority listing found (fetches refused: untested, not disproved). Publish as scheduled only when an organizer or ticketing EVENT page exists; carry its URL as official_ticket_url.',
  DATE '2026-11-10',
  'Artist presale day. Look for the Ticketmaster EVENT page / organizer listing for Tampa Apr 29 2027; if found set scheduled + official_ticket_url, else keep unannounced and set recheck_on 2026-11-12 (general sale).',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.wf_events l
  WHERE l.event_id = 'noah-kahan-last-of-the-bugs-tampa-2027' OR l.slug = 'noah-kahan-last-of-the-bugs-tampa-2027'
     OR (lower(l.event_name) LIKE '%noah kahan%' AND l.start_date = DATE '2027-04-29')
);
COMMIT;
