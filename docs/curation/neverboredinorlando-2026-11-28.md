# @neverboredinorlando intake, November 28, 2026

Gabriel asked to add Kaleigh's (@neverboredinorlando, "Never Bored in Orlando") videos to Wayfind, leaving out any place that scores under 9, and to build cards for places Wayfind does not have yet.

## Source and rules

- Reel list: public profile data (shortcode, caption, post date) for the 108 most recent Reels, September 25 to November 28, 2026, plus her three pinned Reels. Older Reels were not listed in this pass.
- Videos play through the existing official Instagram click-to-load player on the place card. Nothing was downloaded, re-hosted or cropped; no frames are used as photos. She is already an owner-attested creator in `lib/creatorRights.js`.
- Score gate: the place's base Wayfind Score (`wayfindScore(rating, reviews)` from the live `wf_inventory` row, or the place's own cached Google details where the row has no rating) must be 9.0 or higher before her video's own +0.2 is counted. Her video never lifts a place over the line.
- Sponsored posts (`#ad`, `#GrouponPartner`, `#brevardzoopartner`) are not entered, following the iviethefoodie precedent in `lib/creatorVideos.js`: a brand-paid post is not an organic find and would launder advertising into the ranking.
- Captions in `lib/creatorCaptions.js` are Wayfind's own words, with no prices.

## Added (11 places, 16 videos)

| Place | placeId | Base score | Reels |
| --- | --- | --- | --- |
| Harry P. Leu Gardens, Orlando | ChIJCRCYGrx654gR3G9qoVbWlpY | 9.4 | DgQRE0-ThUe, DgQY9hnAuP9, DfW_09kglh4 (last year's footage) |
| Mangoni Italian Market Pizza, Winter Garden | ChIJRStTdYSD54gRhH5dTvKQLJI | 9.2 | DdyKT3vAoX9 |
| JoJo's Shake Bar, Pointe Orlando | ChIJE8ib-7x_54gR3rj5fZw1BKM | 9.2 | Deb5hN4gKH-, DfevHbmgqwl |
| The Great Escape Room Orlando (23 1/2 S Magnolia Ave) | ChIJgWr-M_x654gRRd7J_Abj-SY | 10 | Dd9Cs-8g-b5 |
| Mordisco Steakhouse, International Dr | ChIJQZWqDwB_54gRwgC3FkgEVys | 9.6 | Dd92AcYp0eg |
| Tibby's New Orleans Kitchen, Winter Park | ChIJTV2FLOpv54gRnKJoIUJxaTA | 9.4 | DeEv2wWgkNs |
| The Howey Mansion | ChIJ55iXpqGW54gRMcwTvxeeD5g | 9.0 | Ddufx7VJ3uy |
| Lake Apopka Wildlife Drive (2850 Lust Rd) | ChIJNTn4Jsud54gRNiSjBtKBnyg | 9.6 | DewOW2Hgv4y |
| Ponce de Leon Inlet Lighthouse & Museum | ChIJw2VLy7sp54gRE6a7GJmmDaY | 9.6 | DeN0Cb3NFTw |
| Boggy Creek Airboat Adventures (2001 E Southport Rd) | ChIJE1158xWa3YgRyxYmba83M0o | 9.6 | DeIfEnYt1xG, Dd5AzgVtUPA, Dd9XDAUAvKz |
| Solomon's Castle, Ona (4533 Solomon Rd) | ChIJ02eYWOfG3IgRZLgh4LgucUg | 9.2 | Df2nXHvA182 |

Already on cards before this intake: Catboat Clermont (DVymPmojQ0x), Myakka Canopy Walkway (DfcRzRvgDcB), Taza Cafe Fort Myers (De8D7NhtMqk), Silver Moon Drive-In, Old Sugar Mill Pancake House, Main Street Pizza Kissimmee.

Playback (read 2026-11-28 from each post's official Instagram embed page, recorded in `lib/instagramEmbedVerdicts.js`): 14 of the 16 play inside Wayfind. Mordisco (Dd92AcYp0eg) and Howey Mansion (Ddufx7VJ3uy) use licensed music, so Instagram's embed offers only a link out; Wayfind gives those two no player, per the owner rule that videos never send a visitor to Instagram. The session's network cannot reach Instagram, so the verdicts were read in a real browser and written in the classifier's own format.

Collabs: the Howey Mansion and Ponce Inlet Lighthouse Reels are Instagram collabs with the venue's own account. Neither caption is marked as paid, so they are entered like her other posts.

Boggy Creek: the Terror 2 page (bcairboats.com/orlando-halloween-event, read 2026-11-28) lists only the 2001 E Southport Rd address. Great Escape Room: her caption tags Downtown Orlando, which is the Magnolia Ave room.

## Left out: base score under 9.0

Baldwin Perk Caffè 8.8, BTW's Crafted Concoctions 8.5, Café Coquí 8.0, The Courtesy 8.8, Gaylord Palms 8.8 (four Reels incl. ICE! and the Coca-Cola suite), Great Southern Box Company 8.6, Kings Dining & Entertainment Orlando 8.6 (three Reels), Koko Kakigori Cafe 8.3, Pirates Dinner Adventure 8.6 (two Reels), Sci-Fi Dine-In Theater 8.2, SeaWorld Orlando 8.8, Vault 5421 8.9 (two Reels), Yoga Loft Tampa 8.6, Central Florida Zoo 8.6 (two Reels), The Bagel Nook Tampa (3.8 on 272 reviews).

## Left out: no score yet (Score pending on the card)

Mirada Lagoon, Snowcat Ridge, Wunder Glow (two Reels), Casa Del Despecho. Their rows carry no rating, so a 9.0 cannot be shown.

## Left out: no confident single location

Don Julio Mexican Kitchen (caption names several locations), Pal Campo (caption says Lake Mary; Wayfind's two Pal Campo rows are other branches), The Glass Knife "The Crossing" (two Winter Park locations, caption names neither), Uncle Julio's (no branch named).

## Left out: sponsored

Discovery Cove (DgF3-T3A6dL, #ad #GrouponPartner), Brevard Zoo (DeeoPaHg4wP and Decm_48JB1_, #brevardzoopartner).

## Left out: not a single Florida place

Las Vegas and Utah trip Reels (3), giveaways (4), news clips (I-4 truck fire, two SpaceX launch Reels), Warped Tour concert notice, Orlando Greek Fest (past three-day festival), Winter Garden Halloween light show (past city event), bioluminescent kayaking (self-guided, no business), the "12 things to do in Florida" roundup, the Visit New Smyrna Beach destination Reel, Adama Acres and Kingfisher Burrow (private Airbnb rentals).

## No Wayfind card yet

Narwhal New Smyrna Boat Tours, Pinstripes Orlando, Level99 Disney Springs (two Reels), Cañonita Lake Nona West, Myakka Elephant Ranch, Mistero 1 Pizza Waterford Lakes, Thai Thani Celebration, Baffone Italian Bakery & Kitchen, Earth Grounds Coffee + Matcha, Fragaria Ice Cream Maitland, Wildwood Vineyard (Indulge in the Film), Las Delicias Orlando, Norwood's Restaurant & Treehouse New Smyrna Beach (two Reels), Hurly-Burly at Disney's BoardWalk, WOFT Groveland, Thrift on 46 Sanford, Boardwalk Inn & Suites Daytona Beach, iSmash Winter Park (two Reels).

Building these cards needs each place's Google rating and review count to compute a real score. None of them is in Wayfind's inventory or cached place details, and this session had no free route to Google, so no card was invented and no score was guessed. They are the next batch once their Google details are fetched through the normal promotion pipeline.
