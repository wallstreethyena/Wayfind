# Affiliate coverage law: a card that matches the library never ships a raw link by accident

Owner direction, 2026-09-15, after the Fall in Florida Howl-O-Scream card opened buschgardens.com instead of the commissioned Undercover Tourist ticket: "we need to make sure we always earn the affiliate commission on all of the programs … build a library of what they have and offer … if the place card matches the library of our affiliate we need to make sure we are using the deep linking for it."

## The rule

1. **Unknown is not dead.** `link_ok` is tri-state everywhere. `true` is alive, `false` is proven dead, `null` is unknown (bot-blocked 403/429, never probed, transient). Only `false` may hide a CTA or refuse a redirect. No code in `app/` or `lib/` may test `link_ok` for truthiness. Undercover Tourist 403s every non-browser probe, so every UT row is `null` in steady state; treating that as dead unmonetized the whole park inventory for six days.
2. **One predicate.** Any route that reads `wf_deals` in bulk decides servability with `isServableDeal()` from `lib/eventTicketDeals.js`, never an inline test.
3. **The redirect is the last line.** `/api/commerce/go` refuses a proven-dead row for every provider that has a health column (`deadColumn`), so a surface that builds its CTA from the static registry cannot 302 a click to a dead partner page.
4. **The library is the lookup.** `lib/affiliateLibrary.js` maps each merchant's own website host (and park path where a host serves several parks) to the partners that sell it and the Undercover Tourist admission row an included-with-admission event may use. Every row is evidence: a live `wf_deals` id, a `lib/partnerOfferRegistry.js` key, an organizer URL already stored in `wf_events` or a homepage read that day. A merchant with no proven partner is absent, never guessed.
5. **A match is a decision, not a default.** The library never auto-monetizes. `lib/eventTicketDeals.js` remains the only place that decides which row sells *the thing the card promises*: the event's own ticket, or park admission only when the organizer's page says the event is included. What the library changes is that an unmapped event at a sellable merchant is now a named state (`unmapped`) that a guard and a nightly job surface, instead of an invisible default to the organizer's site.
6. **Two watches, one email path.** `scripts/check-affiliate-coverage.mjs` runs in prebuild and executes rules 1 to 5 against the code and fixtures. `app/api/cron/affiliate-coverage` reads live `wf_events` daily, classifies every future event, and pulses `succeeded=0` with the event ids in the note whenever any event is in the leak state, so `job-watch` emails the owner through the channel that already exists. `scripts/export-revenue-pins.mjs` writes the same gap list into the daily revenue census.
7. **Mapping stays human and sourced.** To close a leak, add the event to `EVENT_TICKET_DEALS` with the product kind the organizer's own page supports, quote that page in the comment, and let the guard confirm the deal id is the library's admission row for that merchant (park-admission) or a pinned `UT_EVENT_DEAL_IDS` row (event-ticket). Separately ticketed events with no UT event-ticket row (Jollywood Nights, Mickey's Very Merry Christmas Party) stay unmapped until a verified `wf_deals` row exists, inserted through the migration-first process.

## What shipped with this proposal

- `app/api/events/fall/route.js` filters with `isServableDeal` (the bug).
- `lib/commerceProviders.js` gives `undercover_tourist` a `deadColumn`.
- `lib/eventTicketDeals.js` maps Christmas Town, SeaWorld Christmas Celebration and Holidays at LEGOLAND to their park admission rows, each confirmed included with admission on the organizer's page.
- `lib/affiliateLibrary.js`, `scripts/check-affiliate-coverage.mjs`, `app/api/cron/affiliate-coverage/route.js`, the `vercel.json` schedule, and the census gap export.

## Known gaps this does not close (follow-up lanes)

- The event registry can only express Undercover Tourist. Zoo Miami, ZooTampa, Central Florida Zoo and other Tiqets-only merchants are classified `sellable-no-ut-path` and cannot carry a ticket CTA on event cards until the registry accepts a second provider.
- EPCOT Festival of the Holidays and Universal Holidays render client-side; their included-with-admission claim could not be read and they stay unmapped pending a browser check.
- `/florida-events/[slug]`, `lib/guideCta.js` and the Events feed build the UT CTA without a live row; rule 3 covers the click, but a proven-dead deal still renders a button until those pages read `wf_deals`.
- UT's steady-state 403 means the health cron can no longer detect a dead UT page at all; a browser-based probe is the only way to regain that signal.
- WeGoTrip is approved with live promo ids and four registry rows but has no `PROVIDERS` entry, so its inventory is unreachable.
- SeatGeek, Eventbrite, Fever and organizer sites are unmonetized by design (no program); the events window list marks some of those links `sponsored: true`, which is a labeling error.
