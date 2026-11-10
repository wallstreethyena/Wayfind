# Holiday affiliate audit — November 6, 2026

## Scope and starting evidence

Audited every page of the public Christmas browse feed: 27 successful pages,
641 distinct listings, no missing pages. The starting primary-action census was
13 affiliate, 105 organizer, and 523 without a ticket action. Enchant additionally
had one disclosed secondary TicketSmarter resale action. A missing ticket action
is not itself an affiliate defect: this collection includes free outings,
restaurants without a verified booking partner, and events for which no exact
partner product is currently proven.

The 20-merchant affiliate library was compared against all 641 public listings.
With this change, no recognized merchant remains in its `unmapped` state.
That is a finite library-coverage result, not a claim that every merchant in
Florida has an affiliate program or that the account is accepted into it.

## Recovered earning paths

All shared event mappings use `/api/commerce/go`, preserving the event identity
and surface. Their downstream destinations are resolved server side.

| Public event | Provider / offer | Product actually offered |
| --- | --- | --- |
| EPCOT Candlelight Processional | Undercover Tourist / 5 | EPCOT admission; standby seating, no dining package or guaranteed seat |
| WDW holiday season (two research cards) | Undercover Tourist / 5 | Park admission; excludes separately ticketed parties and paid extras |
| Universal Holiday Parade | Undercover Tourist / 6 | Admission to the relevant park; no Holiday Tour |
| Islands of Adventure Grinchmas | Undercover Tourist / 6 | Admission to the relevant park; no Holiday Tour |
| Gatorland Holiday Ho-Down | Undercover Tourist / 13 | Regular admission with included holiday entertainment |
| MOSI Santa in Space | Tiqets / tampa-hook-mosi | Museum admission; Santa included on the organizer's event day |
| ZooTampa Christmas in the Wild | Viator / 28841P3 | The Christmas evening event, not daytime admission |
| Chris Tomlin Christmas, Pensacola | Ticketmaster / Live Nation shared resolver | The exact Live Nation event URL, with Impact attribution |

The theme-park guide now has specific ticket links for its seven mapped park
picks. The two Disney parties use their own offers (38 and 39). Free Disney
Springs has no paid admission link. The guide also replaces the obsolete claim
that Universal's season is unconfirmed and updates Springs planning details.
The two new guide picks retain the existing clearly labelled illustrative
fallback, with an explicit photo-gap record. Available daytime venue images
were inspected and were not presented as photographs of the holiday program.

## Holiday blog handoffs

All 21 previously published holiday blog posts returned HTTP 200 with the
expected title. Their purchase navigation stayed on Wayfind; no raw affiliate
checkout was embedded in the articles. However, specific Disney parties and
Enchant were handed to generic venue pages, losing the intended event context.

Added 23 explicit event-detail links across nine existing posts, retaining each
post's blog campaign parameter. All 12 distinct destination pages were fetched
and returned substantial HTTP 200 pages before the write. The repair includes
MVMCP, Jollywood, Enchant, EPCOT, Busch Gardens, SeaWorld, Gatorland, MOSI and
ZooTampa. Free Disney Springs receives a planning-detail link, not a paid CTA,
and its article dates were corrected to November 11 through January 3.

The single atomic update required all nine posts' original item hashes and all
23 item names/positions to match. It changed exactly nine posts, preserved each
item count, and a separate SELECT verified 23/23 event links. Before-images of
the edited fields are in `holiday-blog-links-before-2026-11-06.json`. The other
12 posts were unchanged. Public-cache verification is part of release closure.

## Merchant verification and production data repair

Direct merchant pages were opened without affiliate tracking parameters; no
commission-network click was manufactured for the audit.

- Undercover Tourist's MVMCP and Jollywood pages showed their exact event
  products and selectable 2026 dates. Some dates were sold out; neither entire
  season was declared sold out.
- Disney, Universal, SeaWorld, Busch Gardens, LEGOLAND and Gatorland destinations
  showed the intended attractions. Universal's old 3-day-plus-2-free URL
  redirected to a **3-Day Base Ticket**. Its current product allows one park per
  day and excludes Hogwarts Express and the separately priced Holiday Tour.
- Production `wf_deals.id=6` was changed with an exact old-value predicate:
  title `Universal Orlando: 3-Day Base Ticket`; destination
  `https://www.undercovertourist.com/orlando/universal-3-day-base-ticket/`;
  CJ path `https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_uni/https://www.undercovertourist.com/orlando/universal-3-day-base-ticket/`.
  Exactly one row updated; an independent SELECT confirmed it. `active=true`
  was retained and unknown `link_ok` was not converted to verified health.
- Viator 28841P3 showed Christmas evening admission. Selecting December 4,
  2026 returned 4 PM, $69.90 for two adults, with Book Now enabled. The existing
  event receives this ticket link; this does not add a low-rated product to
  the recommended Christmas tour collection or change editorial ordering.
- MOSI's evening laser shows require separate tickets for each showtime.
  They retain the organizer checkout; generic museum admission is not sold as
  laser-show entry. This explicit no-product decision expires November 13.

## Enchant and attribution limits

The live St. Petersburg Enchant card and detail page already show the organizer
as primary and **Browse resale tickets** as a disclosed secondary action. That
secondary action uses `ticketsmarter/enchant-stpete-ticketsmarter`, CJ advertiser
5346842, link 15735296, and Wayfind website PID 101643573. Its destination is
the Tropicana Field venue page, which visibly listed Enchant 2026 inventory.
It is a resale browsing destination, not an exact-date official Enchant ticket.
The label and fee/availability disclosure preserve that distinction.

The CJ sign-in page is an authentication boundary. No account approval screen,
current contract/deep-link permissions, click report or commission receipt was
accessible. The connected mailbox could not supply alternate evidence because
its mail service is not enabled. Therefore this audit proves deployed link
configuration and product identity; it does not assert current CJ relationship
approval, a direct Enchant advertiser relationship, or earned commissions.
Purchases made through Enchant's organizer checkout are not represented as
commissionable through the TicketSmarter link.

## Recurrence controls and validation

- Affiliate coverage now merges the published Christmas research catalog with
  live database rows. Held, excluded and ended rows are filtered after merging.
  A malformed or capped database census fails instead of reporting clean.
- The production coverage lambda explicitly traces the research JSON file.
- Database list/detail reads now retain `ticket_status`, so sold-out purchase
  gating is able to work on actual fetched rows.
- Christmas ticket rendering uses the shared Ticketmaster/Live Nation resolver
  and rejects free or unavailable cards before any affiliate mapping.
- The Christmas rail cache version advances to prevent an old payload retaining
  the prior Springs dates or missing affiliate mappings.
- Mutation proof: removing `ticket_status` from the database projection made
  the list/detail read guard fail. Restoring it passed.
- Mutation proof: removing Grinchmas's mapping made the research coverage guard
  fail. Restoring it passed.
- Targeted checks cover exact products, attribution IDs, deceptive hosts,
  unavailable rows, guide pick links, research tracing, and registry wiring.
  Full-suite, build and production receipts are recorded in the pull request.

## Source pages checked

- https://www.disneysprings.com/entertainment/christmas-tree-stroll/
- https://www.disneysprings.com/entertainment/santa-greetings/
- https://disneyparksblog.com/wdw/disney-eats-foodie-guide-to-holidays-at-walt-disney-world-resort/
- https://disneyparksblog.com/wdw/first-look-at-holidays-at-jock-lindseys-hangar-bar/
- https://www.universalorlando.com/web/en/us/things-to-do/events/holidays-at-universal
- https://www.gatorland.com/holiday-hohoho-down-2026/
- https://mosi.org/event/santa-in-space/
- https://mosi.org/lasers/
- https://zootampa.org/series/christmas-in-the-wild/
- https://www.viator.com/tours/Tampa/Christmas-in-the-Wild-at-Tampas-Lowry-Park-Zoo/d666-28841P3
- https://www.ticketsmarter.com/venues/tropicana-field

These are verification sources; links here are not visitor booking CTAs.
