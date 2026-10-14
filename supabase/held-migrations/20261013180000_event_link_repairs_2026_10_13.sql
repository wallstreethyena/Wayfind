-- 2026-10-13 event link repairs. NOT applied by the agent that wrote it: owner
-- reviews the PR, then applies. Every URL below was fetched and read on
-- 2026-10-13; the evidence is quoted in each verify_note.
--
-- Also see lib/linkQuarantine.js in the same PR: the "hijacked" verdict on the
-- Goblin Gathering county page was a classifier false positive ("judi" matched
-- inside "Judicial" in the county footer), fixed in code.

-- 1. Cortez Commercial Fishing Festival -------------------------------------
-- official_ticket_url was https://cortez-fish.org, which no longer belongs to
-- the organizer: it now 301s to an unrelated domain (observed
-- femininefitnessforce.com on 2026-10-13; mojawa.eu.com earlier). Treat the
-- domain as compromised and never link or fetch it. The organizer (Florida
-- Institute for Saltwater Heritage) is at fishcortez.org, already stored as
-- official_event_url. The organizer site shows "Admission: $5.00 / Kids under
-- 12: Free" at the gate and has no online ticketing, so there is no ticket URL.
-- Status and dates are deliberately NOT changed here (see PR body: the
-- organizer's own 2027 vendor/artist PDFs now state Feb 13-14, 2027).
update public.wf_events set
  official_ticket_url = null,
  link_ok = null, link_verdict = null, link_checked_at = null, link_final_url = null,
  verify_note = coalesce(verify_note || ' | ', '') ||
    '2026-10-13 LINK REPAIR: removed official_ticket_url https://cortez-fish.org (domain now redirects to an unrelated site; compromised, never link). Organizer site fishcortez.org lists "Admission: $5.00", "Kids under 12: Free", "10:00 AM - 6:00 PM Daily", "Third weekend of February", no online ticketing. Organizer 2027 vendor PDFs (fishcortez.org/artist-application.pdf, /food-vendor-application-2027.pdf) state "45th Annual Cortez Commercial FISH Festival to be held Feb. 13th & 14th, 2027" and "Saturday - February 13, 2027 10am - 6pm / Sunday - February 14, 2027 10am - 6pm". Status left unannounced pending owner decision.'
where event_id = 'cortez-fishing-festival-2027'
  and official_ticket_url = 'https://cortez-fish.org';

-- 2. Florida Coffee Festival ------------------------------------------------
-- official_event_url https://www.flcoffeeculture.com/floridacoffeefestival is
-- a 404 (the organizer's Wix site at flcoffeeculture.com is alive but has no
-- festival page). The organizer's official Eventbrite listing (organizer
-- "Florida Coffee Culture") is live and is the same URL already stored as the
-- ticket link, so the event page points at it too.
update public.wf_events set
  official_event_url = 'https://www.eventbrite.com/e/2026-florida-coffee-festival-tickets-1997481661420',
  link_ok = null, link_verdict = null, link_checked_at = null, link_final_url = null,
  verify_note = coalesce(verify_note || ' | ', '') ||
    '2026-10-13 LINK REPAIR: flcoffeeculture.com/floridacoffeefestival is HTTP 404; replaced official_event_url with the organizer''s Eventbrite listing (HTTP 200, organizer "Florida Coffee Culture", JSON-LD startDate 2026-11-15T11:00:00-05:00, endDate 2026-11-15T16:00:00-05:00, "Festival Park", 2911 East Robinson Street, Orlando, eventStatus EventScheduled).'
where event_id = 'florida-coffee-festival-2026'
  and official_event_url = 'https://www.flcoffeeculture.com/floridacoffeefestival';

-- 3. Country Thunder Florida ------------------------------------------------
-- countrythunder.com/florida, /fl, /fl-info, /fl-tickets, /fl-lineup all 404
-- on 2026-10-13 and the site nav now lists only AZ, SK and WI. No official
-- 2027 Florida page exists. The row stays unannounced (not displayable, dates
-- unverifiable); only the dead links are removed. The check below keeps the
-- update scoped to the stored dead URL.
update public.wf_events set
  official_event_url = null,
  source_url = null,
  link_ok = null, link_verdict = null, link_checked_at = null, link_final_url = null,
  verify_note = coalesce(verify_note || ' | ', '') ||
    '2026-10-13 LINK REPAIR: removed official_event_url/source_url https://www.countrythunder.com/florida (HTTP 404; /fl-info, /fl-tickets, /fl-lineup also 404; site nav lists only AZ, SK, WI). No official 2027 Florida page or dates exist, so the row stays unannounced with no link. Re-add only when the organizer publishes.'
where event_id = 'country-thunder-fl-2027'
  and official_event_url = 'https://www.countrythunder.com/florida';

-- 4. Goblin Gathering (Bradenton) -------------------------------------------
-- The 2026-09-21 manual verification expired 2026-10-05, automated probing
-- resumed and the content classifier returned "hijacked" (false positive, see
-- lib/linkQuarantine.js). The page is the genuine Manatee County event page:
-- "Friday, October 16, 2026 4:00 to 7:00 PM GT Bray 51st ST Park". Bridge it
-- through the event date, same mechanism as the 2026-09-21 migration.
update public.wf_events set
  link_ok = true, link_verdict = 'manual:alive', link_checked_at = now(),
  link_final_url = official_event_url,
  link_manual_verifications = jsonb_build_object(
    official_event_url, jsonb_build_object(
      'reviewed_at', '2026-10-13', 'review_by', '2026-10-17',
      'evidence', 'genuine Manatee County page, "Friday, October 16, 2026 4:00 to 7:00 PM GT Bray 51st ST Park"; prior hijacked verdict was the judi-in-Judicial classifier false positive')
  )
where event_id = 'goblin-gathering-bradenton-2026'
  and official_event_url like 'https://www.mymanatee.org/%';
