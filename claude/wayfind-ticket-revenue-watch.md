# Wayfind ticket revenue watch

State for the scheduled ticket revenue watch. Append a dated section only when something changes; never drop earlier sections.

## Approvals from Gabe (written)

None recorded.

## 2026-11-16 (baseline, no findings)

Approved partners read from origin/main: TicketSmarter (lib/secondaryEventTickets.js); TicketNetwork, Viator, Tiqets, Klook, Undercover Tourist (lib/eventTicketDeals.js VIA_BY_PROVIDER). Ticketmaster is not a provider in lib/eventTicketDeals.js on main, so it was treated as not approved this run.

Events checked (5): naples-night-lights-2026 (Nov 27 2026, not_yet_on_sale), cosmic-baseball-jacksonville-2027-03-19, cosmic-baseball-jacksonville-2027-03-20, cosmic-baseball-miami-2027-07-24, cosmic-baseball-tropicana-2027-08-21 (all lottery).

Findings: none. No TicketSmarter or TicketNetwork per-performance page surfaced for any Cosmic date; no approved-partner listing for Naples Night Lights (the garden sells its own tickets).

Organizer page (chilipeppersbaseball.com/cosmic-lottery/): still says the lottery is the only way to get Cosmic Baseball tickets; selected entrants can buy until the event sells out. No lottery dates, prices, first pitch times or matchups shown.

## 2026-11-19 (no findings; one new row watched)

New row in the watch list: pop-tarts-bowl-orlando-2026 (Dec 29 2026, Camping World Stadium, not_yet_on_sale). TicketSmarter has only the general performer page (ticketsmarter.com/p/pop-tarts-bowl-tickets), which says the next game is not announced; no per-date page. No TicketNetwork page surfaced.

Other 5 rows unchanged: no approved-partner per-performance page for any Cosmic date or for Naples Night Lights. Organizer lottery page unchanged. Ticketmaster still not a provider in lib/eventTicketDeals.js on main (66b3c6f).

## 2026-11-26 (one unverified candidate; one new row watched)

New row in the watch list: palm-beach-international-boat-show-2027 (Mar 17 2027, Flagler Drive, West Palm Beach, not_yet_on_sale). No TicketSmarter or TicketNetwork per-date page surfaced (only unapproved resellers).

Candidate, NOT a verified finding: pop-tarts-bowl-orlando-2026 (Dec 29 2026, Camping World Stadium). The TicketSmarter performer page now links a per-date event page, https://www.ticketsmarter.com/e/pop-tarts-bowl-tickets-orlando-12-29-2026-camping-world-stadium/3392297, says "next game is on December 29th, 2026 at 5:30pm", and its price table shows 27 tickets available, lowest $61. The event page itself could not be opened this run (fetch permission not available unattended; Exa out of credits), so same-event/venue/date/inventory was not confirmed on the event page. Recheck next run. No TicketNetwork page surfaced.

Cosmic rows (4): no approved-partner per-performance page. Organizer lottery page could not be read this run. MLB.com 2027 tour article (Oct 7 2026) lists only Jacksonville VyStar Ballpark among Florida stops and says dates and ticketing will be announced soon; it does not mention Miami loanDepot park or Tropicana Field, so those two wf_events rows are not corroborated by that article (event-truth sweep owns facts).

Ticketmaster still not a provider in lib/eventTicketDeals.js on main. Nothing was added to Wayfind.
