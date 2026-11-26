-- 2026-11-25 (owner, "do it all": merge the two Jacksonville ZooLights pages
-- and give the one page a ticket button).
--
-- zoolights-jacksonville-zoo-2026 had no official_ticket_url, so its page
-- showed only "Official site". The zoo's own ZOOLights page
-- (https://www.jacksonvillezoo.org/zoolights, read 2026-11-25) links its
-- NON-MEMBER TICKETS button to the zoo's ticket store below, on the zoo's own
-- subdomain. Online prices stated there: $30 non-members, $20 members, 2 and
-- under free (price_min 30 already matches).
--
-- Guarded: only fills an empty field on this one row, so a re-run is a no-op.
-- Reverse:
--   update public.wf_events set official_ticket_url = null
--   where event_id = 'zoolights-jacksonville-zoo-2026'
--     and official_ticket_url = 'https://tickets.jacksonvillezoo.org/webstore/shop/viewitems.aspx?cg=events&c=zoolights';
update public.wf_events
set official_ticket_url = 'https://tickets.jacksonvillezoo.org/webstore/shop/viewitems.aspx?cg=events&c=zoolights'
where event_id = 'zoolights-jacksonville-zoo-2026'
  and official_ticket_url is null;
