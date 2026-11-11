-- Card titles on /christmas-in-florida come from wf_events.short_title
-- (lib/christmasCards.js: title = short_title || event_name). Keep the park
-- name. Each WHERE guard matches the current short title, so a later edit is
-- not overwritten.
update public.wf_events
  set short_title = 'Mickey''s Very Merry Christmas Party'
  where event_id = 'mvmcp-2026' and short_title = 'Very Merry';

update public.wf_events
  set short_title = 'Busch Gardens Christmas Town'
  where event_id = 'christmas-town-2026' and short_title = 'Christmas Town';

update public.wf_events
  set short_title = 'EPCOT Festival of the Holidays'
  where event_id = 'epcot-festival-holidays-2026' and short_title = 'Festival of the Holidays';

update public.wf_events
  set short_title = 'Disney Jollywood Nights'
  where event_id = 'jollywood-nights-2026' and short_title = 'Jollywood Nights';
