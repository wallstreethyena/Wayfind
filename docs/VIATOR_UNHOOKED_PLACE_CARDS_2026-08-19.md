# Unhooked place cards for a real Viator hunt

Inventory only. No pins. No invented product URLs.

Revenue asked for existing, currently unhooked place cards that could honestly take a Viator tour or ticket (city + activity match possible). This list is the second-pass leftover after 11 place-card pins already shipped on PR #843.

Every name below was called through `placePartnerPick({ name })` on 2026-08-19 and returned **null**. None of these names is a beach, drum circle, Mallory Square, Pier 60, Tampa Riverwalk, Crystal River manatee site, or Winter Park scenic boat.

Exact string is what `placePartnerPick` would see. Do not invent a nearby alias.

## Top 19 (open these first)

| # | Exact place name | City | Likely activity | Why it is unhooked |
|---|---|---|---|---|
| 1 | Anna Maria Island Dolphin Tours | Anna Maria | Dolphin / sunset boat tour (named operator) | Never wired. Distinct operator card in `lib/summerUniverse.js`. Not Siesta Beach. |
| 2 | LeBarge Tropical Cruises | Sarasota | Sightseeing / sunset boat tour (named operator) | Never wired. Curated boat-tour card (`lib/curated.js`). |
| 3 | Silver Springs State Park Glass Bottom Boat Tours | Silver Springs | Glass-bottom boat (the card name *is* the product) | Never wired. Summer-universe venue. |
| 4 | Everglades City Airboat Tours | Everglades City | Airboat (named operator) | Never wired. Summer-universe venue. Not Boggy Creek / Wild Florida. |
| 5 | BK Adventure | Titusville | Bioluminescence kayak (named operator) | Never wired. Summer-universe venue. City is Titusville, not Cocoa Beach — needs a Titusville / Space Coast product, not the Cocoa Beach SKUs already pinned. |
| 6 | Yacht StarShip Cruises & Events | Tampa (also a Clearwater birthday-universe pin of the same name) | Dinner / sightseeing cruise (named operator) | Never wired. Curated dinner-cruise card. Confirm city on the live card before opening a product. |
| 7 | Homosassa Springs Marina | Homosassa | Scallop / snorkel charter from the marina | Never wired. Summer-universe venue. Not Crystal River manatee swim. |
| 8 | Canoe Outpost-Little Manatee River | Wimauma | Canoe / kayak rental and shuttle | Named in the 2026-08-19 rail audit as verified-but-NOT-wired (no partner inventory that day). Still a real operator card. |
| 9 | Ray's Canoe Hideaway | Bradenton / Manatee River | Canoe / kayak rental (named outfitter) | Never wired. Atlas editorial card. |
| 10 | Devil's Den Spring | Williston | Ticketed cave snorkel / dive | Never wired. Summer-universe venue. |
| 11 | Ginnie Springs Outdoors | High Springs | Private-spring tube / snorkel / dive ticket | Never wired. Summer-universe venue. |
| 12 | John Pennekamp Coral Reef State Park | Key Largo | Reef snorkel boat + park admission | Never wired. Summer-universe venue. Not the Key West seaport snorkel already pinned. |
| 13 | Dry Tortugas National Park | Key West | Yankee Freedom ferry / seaplane to Fort Jefferson | Never wired. Summer-universe venue. |
| 14 | Mote Science Education Aquarium (SEA) | Sarasota | Aquarium admission (new UTC campus) | Named in the 2026-08-19 rail audit as verified-but-NOT-wired. Also live as `Mote Science Education Aquarium` and `Mote SEA` — all three strings are unhooked. |
| 15 | Mote Marine Laboratory | Sarasota | Aquarium / lab admission (City Island campus) | Never wired. Distinct from Mote SEA (different placeId). Curated + summer-universe card. |
| 16 | The Bishop Museum of Science and Nature | Bradenton | Museum / planetarium admission | Named in the 2026-08-19 rail audit as verified-but-NOT-wired. Atlas + summer-universe card. |
| 17 | Sarasota Jungle Gardens | Sarasota | Zoo / garden admission | Named in the 2026-08-19 rail audit as verified-but-NOT-wired. Atlas + curated + summer-universe card. |
| 18 | Florida Railroad Museum | Parrish | Scenic train-ride ticket | Named in the 2026-08-19 rail audit as verified-but-NOT-wired. Atlas + gulf-coast guide `appQuery`. |
| 19 | Marie Selby Botanical Gardens | Sarasota | Garden admission | Never wired. Atlas + curated exact name. Summer universe uses the longer alias `Marie Selby Botanical Gardens Downtown Sarasota` — also unhooked. |

## Additional honest unhooked cards (20–28)

| # | Exact place name | City | Likely activity | Why it is unhooked |
|---|---|---|---|---|
| 20 | Sunken Gardens | St. Petersburg | Historic garden admission | Never wired. Summer-universe venue. |
| 21 | Big Cat Habitat & Gulf Coast Sanctuary | Sarasota | Sanctuary admission | Named in the 2026-08-19 rail audit as verified-but-NOT-wired. Atlas card. |
| 22 | Historic Spanish Point | Osprey | Historic-site / garden admission | Never wired. Atlas card. |
| 23 | The Ernest Hemingway Home and Museum | Key West | House-museum admission | Never wired. Summer-universe venue. Not Mallory Square. |
| 24 | Fairchild Tropical Botanic Garden | Coral Gables | Garden admission | Never wired. Summer-universe venue. |
| 25 | Loggerhead Marinelife Center | Juno Beach | Sea-turtle hospital / museum admission | Never wired. Summer-universe venue. |
| 26 | Orlando Science Center | Orlando | Science-museum admission | Never wired. Atlas card. |
| 27 | Ichetucknee Springs State Park | Fort White | Tube / park admission | Never wired. Summer-universe venue. |
| 28 | Myakka River State Park | Sarasota | Park admission; on-site airboat / canopy walk | Never wired. Summer-universe venue. Do not reuse the Ted Sperling mangrove SKU. |

## Also honest, open if the top 28 miss

| Exact place name | City | Likely activity | Why it is unhooked / caution |
|---|---|---|---|
| Keys Huka Dive | Casey Key | Snorkel / dive charter (named shop) | Atlas card. City is Casey Key, not Siesta Key. |
| Robbie's of Islamorada | Islamorada | Tarpon feeding + boat docks | Summer-universe venue. Restaurant-dock hybrid; only pin a product that names Robbie's. |
| Florida Caverns State Park | Marianna | Cavern tour + park admission | Summer-universe venue. |
| Edward Ball Wakulla Springs State Park | Wakulla Springs | Glass-bottom boat + spring swim / park admission | Summer-universe venue. |
| Blue Spring State Park | Orange City | Park admission / spring swim (summer) | Summer-universe venue. Not Crystal River. |
| Rainbow Springs State Park | Dunnellon | Park admission / paddle / swim | Summer-universe venue. |
| Wekiwa Springs State Park | Apopka | Park admission / swim / kayak | Summer-universe venue. |
| Kelly Park - Rock Springs | Apopka | Tube / county-park admission | Summer-universe venue. |
| Disney's Typhoon Lagoon Water Park | Orlando | Water-park ticket | UT hooks Magic Kingdom / EPCOT / Hollywood Studios / Animal Kingdom, not this exact name. |
| Disney's Blizzard Beach Water Park | Orlando | Water-park ticket | Same as Typhoon Lagoon — exact name is unhooked. |
| Ca' d'Zan | Sarasota | Mansion tour (Ringling estate, separately timed) | Curated + guide `appQuery`. Atlas spelling is `Ca' d’Zan` (unicode apostrophe) — also unhooked. |
| The John and Mable Ringling Museum of Art | Sarasota | Museum admission | Guide `appQuery`. `The Ringling` and `Ringling Museum of Art` are also unhooked. Prior rail audit: Viator had a drive-by trolley, not admission — only keep a product whose title is museum/estate admission. |
| Venetian Pool | Coral Gables | Historic-pool admission | Guide `appQuery` in `lib/guidesSummer2026.js`. |
| Fruit & Spice Park | Homestead | Garden / park admission | Summer-universe venue. |
| J.N. Ding Darling National Wildlife Refuge | Sanibel | Wildlife-drive / tram / park fee | Summer-universe venue. |
| Warm Mineral Springs | North Port | Mineral-spring admission | Atlas card. |
| Sarasota Art Museum | Sarasota | Museum admission | Atlas card. |
| Harry P. Leu Gardens | Orlando | Garden admission | Atlas card. |
| Gamble Plantation Historic State Park | Ellenton | Historic-site admission | Atlas card. |
| Papa's Pilar Distillery | Key West | Distillery tour | Guide pick in `lib/guidesSummer2026.js` (`appQuery`). |
| PopStroke | Sarasota | Mini-golf ticket | Creator-video place card (`lib/creatorVideos.js`). Named in the 2026-08-19 rail audit as verified-but-NOT-wired. |
| Oscar Scherer State Park | Osprey | Park admission / paddle | Atlas card. Wrong put-in for the Lido mangrove SKUs. |
| Tarpon Springs Sponge Docks | Tarpon Springs | Sponge-boat / district tour | Summer-universe venue. Pin only a product that names the docks or a sponge boat, not a generic Tampa walk. |
| Smugglers Cove Adventure Golf | Sarasota | Mini-golf ticket | Atlas card. |

## Do not open (locked or already covered)

| Name | Why not |
|---|---|
| Any already-hooked card (the 11 Viator pins, plus Tiqets / UT / Klook / TicketNetwork aliases) | Already monetized. |
| Siesta Beach, Lido Beach, Fort Lauderdale Beach, Caladesi / Honeymoon / Fort De Soto as beach days | Beach / drum-circle lock. |
| Mallory Square, Pier 60, Tampa Riverwalk | Editorial lock. |
| Three Sisters Springs, Hunter Springs Park | Crystal River manatee lane. |
| Scenic Boat Tour | Winter Park. Forbidden. |
| Weeki Wachee Springs | Same placeId as the already-pinned `Weeki Wachee Springs State Park`. Not a new card. |
| Universal / Disney theme-park names already on UT | Already hooked. Typhoon / Blizzard are the exception (exact names unhooked). |

## How this was built

- Sources: `lib/summerUniverse.js` venue names, `lib/birthdayUniverse.js` venue names, `lib/curated.js` names, `data/atlas/editorial-cards.json` names, guide `appQuery` strings, `lib/creatorVideos.js` match names, plus the 2026-08-19 rail-audit “verified-but-NOT-wired” list in `lib/placePartnerPicks.js`.
- Hook check: `placePartnerPick({ name }) === null` for every row (run 2026-08-19).
- Restaurants, hotels, free city parks, generic marinas, and districts without a bookable activity were dropped.

Lane: cursor cloud (Wayfind lane)
