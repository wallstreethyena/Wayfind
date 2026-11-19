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
