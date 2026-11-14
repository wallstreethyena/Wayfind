# Partner ticket buttons that led nowhere, or to the wrong place — 2026-11-11

## What was wrong

Two separate problems, both on Tiqets buttons.

**1. Five buttons led to a page with nothing to buy.** The partner page still
loads, so every check we own (they read the status code) called them healthy.

| Offer id | What the partner page showed on 2026-11-11 | Likely cause | Look again |
|---|---|---|---|
| `gurnee-hook-six-flags` (Tiqets l189862) | Every ticket option "Temporarily unavailable"; checkout button disabled | Seasonal park, closed for winter | Spring 2027 |
| `gurnee-hook-hurricane-harbor` (Tiqets l248283) | Same page state, same operator | Water park, closed for winter | Late spring 2027 |
| `kissimmee-hook-island-h2o` (Tiqets l161122) | Every ticket option unavailable; checkout disabled | Water park off-season | Spring 2027 |
| `tampa-hook-selfie-wrld` (Tiqets l242578) | The product address now lands on the Tampa category page | Product removed by the partner | Needs a new verified address, not a wait |
| `clearwater-hook-calypso-queen` | The address lands on "Tampa Evening Cruises", a category page | Product removed by the partner | Needs a new verified address, not a wait |

**2. Three places were offered another venue's ticket.** The place pick matched
on the exact name alone, and three places in our inventory share a name with a
Florida attraction but are a different venue in another state:

| Place in our inventory | Where it really is | Ticket it was offered |
|---|---|---|
| Adventure Island (`ChIJC5cg-Y4GmogRfmvedNEA2zY`) | Orange Beach, Alabama | Adventure Island, Tampa |
| Dinosaur World (`ChIJ1_zqtDEZZogRUR-Xo4y_aWI`) | Cave City, Kentucky | Dinosaur World, Plant City |
| Titanic: The Artifact Exhibition (`ChIJJ2BLPs7FyIAR_z-wekDws_g`) | Las Vegas, Nevada | Titanic: The Artifact Exhibition, Orlando |

A read-only sweep of every pick name against `wf_inventory` found about 115
places whose name equals a pick name. All of them are the real venue except
these three.

## What changed

- `lib/partnerOfferHolds.js` — a short list of offers whose own page cannot
  take an order. A held offer paints no button on any of the three surfaces
  (place pick, venue map, metro rail) and the redirect refuses the id, so a
  cached page cannot send anyone there either.
- `lib/placePartnerPicks.js` — a name-only match now also has to sit in the
  pick's own region (Florida, the New York area, or the Chicago area) when the
  caller knows where the place is. A caller that only knows a name is
  unaffected, and a place-id match is never second-guessed.
- `scripts/check-partner-offer-holds.mjs` — the lock test, wired into the
  guard suite. It calls the real functions; it does not read the source.

**Nothing was deleted.** The registry rows, the pick rows and the menu rows are
all still there. No database row was touched.

**Nothing is labelled "sold out" or "closed".** We do not know why the partner
stopped selling, only that the page could not take an order. The button is
simply not shown.

## How to lift a hold

1. Open the partner page in a browser.
2. Confirm a date can be picked and the checkout button is live.
3. Delete the id from `HELD_PARTNER_OFFERS` in `lib/partnerOfferHolds.js` **and**
   from `READ_AND_FOUND_UNBUYABLE` in `scripts/check-partner-offer-holds.mjs`,
   and put the date the page was re-read in the commit message.

The button comes back on every surface at once.

## Open question for the owner

**Adventure Island, Tampa** (`tampa-deal-adventure-island`). The Tiqets page
showed "Closed" for all seven days of the week, but ticket options were listed
and the checkout button was **not** disabled. That is weaker evidence than the
five above, so it was left alone and its Tampa button still shows. If the park
is shut for the season, add the id to the hold list.

## What was NOT checked

- **About 72 of the 108 Tiqets rows were not read.** 36 Tiqets pages were read
  once each and saved; the rest were left alone on purpose, to avoid inflating
  our own click and visit numbers. Five of the 36 were unbuyable, so more are
  likely among the unread ones.
- **Klook and Undercover Tourist cannot be read by a script** — both answer an
  automated visitor with a bot wall. Their state is unknown, not dead, and none
  of their offers are held.
- **Viator** was checked through the existing serveability data and came back
  clean; nothing changed there.
- **No click route was requested.** `/api/commerce/go` and its siblings log a
  click on every request, so none of them was opened for this audit.

## Gaps this exposed

- No check we own reads what a Tiqets, Klook or Go City page actually says.
  They all read the status code, and an unbuyable page answers 200.
- The hold list proves a held offer stays hidden. It cannot prove the list is
  complete — that needs someone, or something, to read the partner pages.
