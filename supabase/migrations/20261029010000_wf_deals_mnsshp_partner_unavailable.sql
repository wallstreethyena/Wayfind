-- FIX MICKEY (owner approved 2026-10-28, PR "Mickey's Not So Scary: partner tickets unavailable").
--
-- Data only, no schema change. wf_deals id 8 is Undercover Tourist's
-- "Mickey's Not-So-Scary Halloween Party" row. Its party ticket page now
-- redirects to UT's general Walt Disney World page, so every surface that
-- serves active wf_deals rows (/api/deals, affiliate chips, fall/christmas
-- bulk reads) would send a "party tickets" click to a page that does not sell
-- the party. active=false is the existing kill switch every reader honours
-- (lib/eventTicketDeals.js isServableDeal; deals-health cron only ever flips
-- active false, never back to true).
--
-- Impact: row 8 stops rendering anywhere. RLS/permissions unchanged.
-- Rollback / forward fix: UPDATE public.wf_deals SET active = true WHERE id = 8;
-- (only after the exact UT party ticket page is live again).
-- Ordering: safe before or after the code in the same PR; the code already
-- removes the mnsshp-2026 mapping from EVENT_TICKET_DEALS.

UPDATE public.wf_deals
SET active = false
WHERE id = 8
  AND title = 'Mickey''s Not-So-Scary Halloween Party';
