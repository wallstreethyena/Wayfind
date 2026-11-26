-- Turn on the OpenTable site switch for the booking agent (owner's yes 2026-11-25, his order to
-- set up the robot and run one test booking at Summer House on the Lake). The robot still needs
-- BOOKING_AGENT_ENABLED=1 and BOOKING_AGENT_SITE_OPENTABLE=1, and books only the allowlisted
-- restaurant (lib/bookingAgent/placeAllowlist.js).
-- Only flips a row that is still 'off': a pause or disable the robot set itself after a challenge
-- is left alone.
-- Reverse (stop at once): update public.wf_booking_agent_sites set status = 'off' where site = 'opentable';
update public.wf_booking_agent_sites
set status = 'on'
where site = 'opentable' and status = 'off';
