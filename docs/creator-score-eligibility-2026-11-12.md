# Creator score eligibility, 2026-11-12

Owner brief (2026-11-12): hosted, organizer-owned and independent creator content must get the appropriate treatment, useful videos stay visible, and a score is never manufactured.

## What was wrong

The +0.2 creator term on the Wayfind Score (`governedWayfindScore`, owner rule 2026-08-07) fired for ANY video. `lib/creatorIndependence.js` only filtered the trending corroboration count, so a venue's own promo reel, a hosted creator, a realtor's promo or an unattributed share raised the place's displayed score and its rank.

## Rule now

A video counts toward the score only if its creator is independent of the place. Not the venue's or organizer's own account, not a hosted creator, not a business promoting itself, and not a video with no creator handle. Aggregator, city guide and tourism pages (`MEDIA_NOT_CORROBORATION_HANDLES`) stay independent of the venue and still count. They remain excluded from trending corroboration as before.

Every video still DISPLAYS everywhere with credit (`hasCreatorVideoAt` is unchanged). Only the score question changed (`hasScoringCreatorVideoAt`), at every score and sort path: `displayedWfScore`, `creatorEvidenceTerm`, `creatorBoostFor`, `lib/lawfulOrder.js` (recorded verdict and score receipt), `lib/todaysBest.js`, `lib/landing.js`, `lib/landingPage.js`, `app/components/CreatorFinds.js`. The featured creator term (Cindy Selects) is unchanged.

## Effect

27 places lose a +0.2 they had not earned. 524 places keep it. No score went up.

| Place | City | Video creator(s) |
|---|---|---|
| Gaylord Palms Resort & Convention Center | Kissimmee | briantreks |
| Spooky Cat Press | Casselberry | spookycatorlando |
| Mathers Social Gathering | Orlando | matherssocialgathering |
| Farmstead Distillery | Cottleville | cottle.village |
| Anthony's Runway 84 | Fort Lauderdale | runway84 |
| Shindig Farms | Nampa | shindigfarms |
| Schnepf Farms | Queen Creek | schnepfchristmas |
| Gaucho Covent Garden | London | gauchogroup |
| Urban Roast | West Palm Beach | urbanroastfl |
| Omni Orlando Resort at ChampionsGate | ChampionsGate | briantreks |
| Tropicana Field | St. Petersburg | enchantstpetersburg |
| Cordle Family Estates Pumpkin House | St. Augustine | sellingjax |
| Brown & Brown Farms and Country Store | Oxford | brownandbrownfarms_55 |
| Tookies and Treats Bakery Shop | Ellenton | tookiesandtreats |
| Mai-Kai | Fort Lauderdale | (no handle) |
| Strandhill Public | Tampa | strandhillpublictampa |
| Giancarlo's | Tampa | sidebaratgs |
| St Augustine Coffee House | St. Augustine | staugcoffeehouse, haileycoffey |
| The Fox Mercantile | Bradenton | thefoxmercantile |
| Treasure Island Beach | Treasure Island | techtravelrentals |
| Ever After Farms U-Pick Flowers | Seffner | everafterfarmsflowers |
| Ocean Grill | Vero Beach | katrin_pfitzenreiter |
| The Eye | Orlando | theeyeorlando_ |
| Boulon | Tampa | boulontampa |
| Hampton Chocolate Factory | Tampa | hamptonchocolatefactory |
| Holly Bluff Resort Marina | DeLand | hollybluffmarina |
| M.Bird | Tampa | m.bird_tampa |
## Open decision for the owner

Aggregators and city guides (for example Secrets of Tampa Bay, Influence Tampa, Visit St. Pete/Clearwater) still raise scores, on about 46 places. They are independent of the venue but repost rather than visit. Moving them out is one line: remove the handle from `MEDIA_NOT_CORROBORATION_HANDLES`.

Locked by `scripts/test-creator-score-eligibility.mjs` (red-proved), plus `check-creator-signal-equivalence` and `check-score-law` updated to the new rule.
