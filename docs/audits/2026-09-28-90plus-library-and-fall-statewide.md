# 9.0+ places missing from Wayfind, and the statewide Fall fill (2026-09-28)

## Part 1: every 9.0+ Florida place in the library that was not on Wayfind

"Library" means `wf_place_ids`, the place index. "On Wayfind" means `wf_inventory`, the served cards. Score is the app's Bayesian Wayfind Score, `((reviews*rating + 60*3.9)/(reviews+60))/5*100`. 90 or more means 9.0+.

| | places |
|---|---|
| 9.0+ Florida places in the library | 6,986 |
| already served | 6,746 |
| **in the library, not served** | **240** |
| 9.0+ outside Florida (index rows, never served by design) | 6,895 |

### Why each of the 240 was missing

| bucket | count | what happens |
|---|---|---|
| Queued, blocked only by the Google Details monthly budget | 147 | The promoter is in FREE mode, capped at Google's 4,800/month free tier. September used 6,426, so every claim was released with `spend ledger: details_pro ceiling 4800 reached`. The allowance resets 2026-10-01. The claim order already puts proven and 9.0+ rows first (#1522, #1532), and the whole pending queue (4,108 rows) is smaller than one month's free tier. So these promote automatically at $0 in the first hours of October. |
| Permanently closed | 17 | Correctly hidden. |
| Temporarily closed | 20 | Rejected once and **never re-checked. This was a bug, now fixed** (below). |
| Not a destination (dentists, roofers, clinics, storage, barbers, an adult club) | 55 | Correctly hidden. There is one policy question, below. |
| Coordinate mismatch | 1 | Hanalei Shave Ice. Google's fresh coordinates put it in the Orlando area, but it was queued under St. Pete. It has been re-filed under Orlando and will promote Oct 1. |

**Serving side.** The 9.0+ rows that are in inventory are served. The surface-parity audit (2026-09-23, #1495/#1507) checked 129,891 place-surface pairs with 0 failures. The 30 non-served inventory rows are closed, duplicates or service businesses.

**Cached details could not be used.** 104 of the 147 had cached Google details (`pd1|`). Every cached row was 34–77 days old. Google's terms, and this repo's ToS boundary, forbid building a card from place content older than 30 days, so the promoter correctly re-fetches.

### Fixed: temporarily closed places were rejected forever

`wf_promotion_recheck_temp_closed()` plus a weekly pg_cron job. It re-arms only `CLOSED_TEMPORARILY` rejects that have not been attempted for 30 days, with a 7-day floor and at most 500 per run. There are 47 such rows today, including Knaus Berry Farm (seasonal), the Cici & Hyatt Brown Museum, Ann Norton Sculpture Gardens and the Marietta Museum. Every re-check still passes the promoter's spend-ledger grant and `decidePromotion()`.

It was applied to production and proven first in a rolled-back transaction:
- 9 rows re-armed.
- `CLOSED_PERMANENTLY` rows untouched.
- An immediate re-run re-armed 0.

The guard is `scripts/check-temp-closed-recheck.mjs`. Branch: `fix/temp-closed-recheck`.

### Owner decisions (not changed)

- **Cathedral Basilica of St. Augustine** (4.8, 3,460 reviews) is excluded by the 2026-09-02 house-of-worship policy (`WORSHIP_PRIMARY_RX` in `lib/placeFilter.js`). It is a top St. Augustine landmark. An exception for landmark basilicas and cathedrals would need your call.
- **Promote the 147 today instead of Oct 1.** This means raising `details_pro` for 3 days: about 147 × $0.017 ≈ $2.50. Headliners waiting include:
  - Guardians of the Galaxy: Cosmic Rewind (8,055 reviews)
  - Star Wars: Rise of the Resistance
  - Kali River Rapids
  - Sunset Watersports Key West (23,755 reviews, bookable)
  - Southern Hill Farms
  - Hop On Hop Off Miami
  - Salty Siren manatee tours
  - Leading Edge Helicopters
  - Little Palm Island
  - Centro Ybor

## Part 2: statewide Fall fill

**103 new verified Fall 2026 events** are now in `wf_events`, targeted at the metros and types the Fall rails were missing. The full rows, with the evidence quote for each, are in `fall-discovery/2026-09-28-statewide-events.json`.

- **By region:**
  - St. Johns 12, Lee 10, Orange 9, Walton 8, Escambia 7, Leon 7, Collier 7, Duval 6
  - Martin 5, Palm Beach 5, Santa Rosa 5, Brevard 3, Charlotte 3, St. Lucie 3, Monroe 2, Marion 2, Miami-Dade 2
  - one each in Clay, Alachua, Jefferson, Gadsden, Okaloosa, Indian River, Broward, Hillsborough and Pinellas
- **By rail**, computed by calling the real `fallEventRail()`: date-night 32, family 26, farms 16, festivals 13, haunts 8, Oktoberfest 5, food 5, photos 1.
- **What they are:** themed Halloween bars and pop-ups, Halloween dinners and wine dinners, seasonal menus, Oktoberfests, farms, corn mazes, haunts, ghost tours and family Halloween events.

**Evidence rules.** Every row was verified against a fetched page showing the 2026 date or offer, then independently re-fetched on 2026-09-28: 107 of 107 source URLs were live and contained "2026". A row is `high` confidence only when it is an official source and the quote itself prints 2026. Visitor bureaus, and date/weekday matches without a printed year, are `medium`. Both levels pass `isTrusted` and never enter as `low`.

**Dropped:** year-round tours with no season (Ghosts & Gravestones Key West, the Fort Myers Haunted History Tour), rows with only prior-year pages, and cross-source duplicates. Duplicate matching uses name similarity, date and **city**. A name-only first pass wrongly merged Naples' and Gulf Breeze's "Boo at the Zoo"; this was caught and re-inserted.

**Photos.** The rail only shows cards with a real venue image:
- 27 rows matched an owned inventory venue with a photo.
- 14 more were linked to their exact library venue. Those 10 venues were moved to the front of the Oct 1 promotion queue (`reason='fall-event-venue'`).
- The rest are live on their `/florida-events/<slug>` pages. They join the rail once their venue has an owned photo.

**Live check, production `/api/events/fall`, 2026-09-28:**

| area | new cards live |
|---|---|
| St. Augustine | 6 (date-night 5/5) |
| Naples | 9 |
| Pensacola | 5 |

**Search.** `/florida-events/<slug>` had never been in the sitemap. Branch `fix/sitemap-event-pages` adds every live, trusted Florida event page.

## Known gaps

The shared web-search budget ran out, so these are still thin:
- local-café pumpkin and fall drink menus (only Lucky Goat, Tallahassee)
- Fort Lauderdale and Miami themed bars
- German-restaurant Oktoberfest menus

Leads for the next pass: Fritz & Franz, Mr. Dunderbak's, Hofbräuhaus St. Pete, Old Heidelberg, Vicky Bakery, The Salty Donut, Casa Tiki.
