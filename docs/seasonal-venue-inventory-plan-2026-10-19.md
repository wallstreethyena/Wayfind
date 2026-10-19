# Seasonal venue inventory plan, 2026-10-19

Read-only. Nothing in this file was applied to production. It lists the 65 confirmed events whose exact venue is absent from `wf_inventory`, then the 5 confirmed events whose exact `place_id` exists and has no stored photo. Halloween dates (22 October through 31 October 2026) are first.

Checked against organizer pages on 2026-10-19. A row here is a venue to resolve, not a card on a poster. No `place_id` in this list was invented.

## How a place gets into inventory, then gets its own photo

There are two sanctioned paths. Which one applies depends on whether the exact Google `place_id` is already in `wf_inventory`.

### A place that is not in `wf_inventory`

The permanent index is `wf_place_ids`. Inserting or updating a row there fires `wf_place_ids_enqueue`, which calls `wf_enqueue_promotion`. That function queues the id for the served metro, and it returns `skip:already-inventory` when the id is already a card. The queue drain is `scripts/promote-worker.mjs`. It is the same job as `app/api/cron/promote-index/route.js`: the same claim RPC, the same `decidePromotion()` verdict, and the same idempotent merge-duplicates upsert from `lib/promoteIndex.js`.

One Place Details call per claimed id. The field mask is `CORE_DETAILS_MASK` in `lib/promoteDetails.js`: `id,displayName,location,types,primaryType,businessStatus,photos`. The photo resource name is stored on the new inventory row in that same call. If the index row has no numeric rating and the enterprise ledger still has room, the worker uses `RATING_DETAILS_MASK` instead (`rating` and `userRatingCount` added). Photos stay on that mask too. A second photo call is not required.

The worker is idempotent and resumable. A place is claimed under a 15-minute lease with `FOR UPDATE SKIP LOCKED`. A rerun does not write the same place twice and does not delete. A locked inventory row is skipped by the seeder; this worker does not refresh a row that is already in `wf_inventory`.

Environment, read from `.env.local` and never printed: `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_SERVER_KEY`. `WAYFIND_GATE` must be `free` or `open`. An unset gate shuts spend off, and the Details call does not happen. The service-role key must be an `sb_secret_` key. A legacy JWT is refused before any Google call.

Command shape:

```
node scripts/promote-worker.mjs --metro tampa --limit 70
node scripts/promote-worker.mjs --metro st-pete --limit 70
node scripts/promote-worker.mjs --metro manatee-sarasota --limit 70
```

The worker claims whatever metro the new coordinates bucket into. Sarasota, Bradenton, Venice, and Palmetto land in `manatee-sarasota`. A place outside every named box can land in the broad `florida` bucket. `global` is skipped unless the run asks for it by name.

`--limit` is the maximum places this run, default 100. The script's own cost line is that limit times $0.017, which is the Pro overage in `lib/promoteDetails.js` after the 5,000/month free line (ledger cap 4,800). A bare insert with `signals` `{}` has no rating, so the worker prefers the Enterprise mask (`details_enterprise`, ledger cap 950) when that bucket allows it.

`scripts/promote-index.mjs` is the older hand tool for the same promotion. Its default plan is free: it reads both tables and writes nothing. `--enrich` pays for Place Details and still writes nothing. `--enrich --apply` writes after a backup and a typed confirmation. It is metro-scoped and has no single-`place_id` flag. Its mask also asks for `priceLevel` and `editorialSummary`, which bill above the worker's Pro mask. The worker is the path that matches the cron.

These 65 venues do not have a stored `place_id`. The fail-closed lookup already in the repo is the Text Search in `scripts/resolve-summer-place-ids.mjs`: `places:searchText`, field mask `places.id,places.displayName,places.location`, and a hit counts only when the name root matches and the point is inside 30 miles of the venue's own coordinates. A miss writes nothing. That script is wired to the summer registry, so it is the pattern, not the runner, for this list. `displayName` is a Pro field, so the call is `text_pro` (ledger cap 4,800 of Google's 5,000 free line). `scripts/creator-video-intake.mjs` uses the same search and refuses to invent an id, and it requires a video URL, so it is not this runner either.

`scripts/seed-places.mjs` is not this path. It searches a metro grid by type. `--commit` writes `wf_inventory`. It cannot be aimed at one known `place_id`.

### A place already in `wf_inventory` with no photo

`scripts/backfill-photo-refs.mjs` selects `wf_inventory` rows whose `photo_ref` is null. One Place Details GET per row, field mask `photos` only. It writes only where `photo_ref` is still null. That is idempotent. The `photos` field is the `details_ids_only` SKU, which `lib/spendGate.js` records as carrying no charge, with a 9,500/month counter in front of it.

Environment: `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_SERVER_KEY`. `--dry` counts and samples with no Google call and no write. A metro argument limits the select (`node scripts/backfill-photo-refs.mjs --dry` then `node scripts/backfill-photo-refs.mjs tampa`).

The script has no `place_id` argument. A live run asks Google once for every photo-less operational row in that metro, up to 2,000 rows, not only the venues below. `--dry` is the safe first command.

`scripts/backfill-place-photos.mjs` is a different job. It never calls Google, it does not take a `place_id`, and it fills from Wikimedia. Do not run it against production for this list.

`scripts/data/seasonal-live-area-places-2026-10-19.sql` inserts Coachman Park and Clearwater Marine Aquarium into `wf_inventory` with no `photo_ref`. Applying that insert makes `wf_enqueue_promotion` return `skip:already-inventory`, so the worker will not fetch their photos. Leave those two out of `wf_inventory` until promotion runs, or insert them and then accept a separate photos-only Details call.

## Call estimate

Counts are Places API requests, not dollars beyond the rates the repo already records.

| Step | Requests | SKU |
|---|---|---|
| Resolve the 62 distinct venues in the 65-event list | 62 `places:searchText` | `text_pro` (free line 5,000, ledger cap 4,800). A miss is still one request and writes no id. |
| Promote each resolved id, photo included | up to 62 Place Details | `details_pro` at about $0.017 over the free line, or `details_enterprise` when the new index row has no rating and that ledger has room. |
| Photo for Benchmark and Seminole Heights, already in inventory | 2 Place Details if targeted | field mask `photos` only (`details_ids_only`). The shipped script cannot target two ids, so a metro run is one request per photo-less row in that metro, capped at 2,000. |
| Coachman Park and Clearwater Marine Aquarium | 2 Place Details | one each, via the promotion mask, which includes `photos`. A photos-only call is the alternative only after the SQL insert. |

Inside the 65, three venues are listed twice, so the search count is 62: Hampton Inn Odessa (K030 and K074), USF Theatre 1 (K073 and K120), and Bilheimer Capitol Theatre (K128 and H009). Benchmark International Arena is a fourth shared place, and it sits in the photo-less five (H029 and K122), so it is not part of the 62.

An ambiguous search is not a second guess. Those venues stay off the posters.

## Halloween, 22 October through 31 October

27 events. Sorted by start date.

| Row | Venue | Address | City | Event it unlocks | Event date |
|---|---|---|---|---|---|
| K002 | Dunedin Community Center | 1920 Pinehurst Road | Dunedin | Monsters & Mayhem Haunted House | 2026-10-22 to 2026-10-24 |
| K027 | Lealman Exchange Community Center | 5175 45th St. N., Lealman, FL 33714 | Lealman | Dracula A Comedy of Terrors, presented by Beyond the Wings Theater | 2026-10-23 to 2026-10-25 |
| K005 | Oaklawn Cemetery | North Morgan Street, Tampa, FL 33602 | Tampa | A Not-So-Spooky Oaklawn Cemetery Walking Tour | 2026-10-24 |
| K009 | Malcom E. Beard Sheriff's Operations Center | 2008 E. 8th Ave, Tampa, FL 33605 | Tampa | Sheriff Chad Chronister's Pumpkin Patch | 2026-10-24 |
| K020 | 53rd Ave Church of Christ | 3412 53rd Avenue East, Bradenton, FL 34203 | Bradenton | FREE Pumpkin Lights & Candy Nights: A Good Old-Fashioned Trunk or Treat | 2026-10-24 |
| K023 | Homosassa Civic Club | 5530 S. Mason Creek Road, Homosassa, 34448 | Homosassa | Trunk or Treat and Halloween Party and Costume Contest | 2026-10-24 to 2026-10-31 |
| K024 | Shoppes at Golden Acres | 9750 Little Road, New Port Richey, FL 34654 | New Port Richey | Hunt for Bluey a Halloween Adventure | 2026-10-24 |
| K025 | Sports Complex/Discovery Playground | 150 Jasmine Avenue, Tarpon Springs, FL 34689 | Tarpon Springs | Halloween Bash | 2026-10-24 |
| K026 | Riverview High School | 11311 Boyette Road, Riverview, FL 33569 | Riverview | Trick or Treat Street 2026 | 2026-10-24 |
| K029 | The Church of Jesus Christ of Latter-day Saints | 10606 Hilltop Drive, New Port Richey, FL 34654-2510 | New Port Richey | Neighborhood Fall Festival | 2026-10-24 |
| K030 | Hampton Inn Odessa Trinity | 11780 Florida 54, Odessa, FL 33556 | Odessa | Not So Spooky Halloween Craft Market | 2026-10-24 |
| K013 | Italian Club of Tampa | 1731 East 7th Avenue, Tampa, FL 33605 | Tampa | Fall Festival | 2026-10-25 |
| K038 | The Brass Tap, Sunlake Plaza | 18835 Florida 54, Lutz, FL 33558 | Lutz | Trick or Treat Street @ Sunlake Plaza | 2026-10-27 |
| K048 | Sykes Plaza | Sykes Plaza, University of Tampa. The concert calendar does not print a street number. | Tampa | Ars Sonora: Halloween Concert | 2026-10-27 |
| K049 | SOS Fishhawk | 10560 Browning Rd, Lithia, FL 33547 | Lithia | FREE Autism Community Trunk-or-Treat: Where Every Child Belongs | 2026-10-29 |
| K018 | Bardmoor YMCA | 8495 Bryan Dairy Rd., Largo, FL 33777 | Largo | Family Fun Event: Boo Bash | 2026-10-30 |
| K034 | Hernando Beach canals | Canal route only. Marlin Canal, Cheeks Creek Canal, Rock Bass Canal, and Tarpon Canal. No single street address. | Hernando Beach | Haunting For Hunger Halloween Boat Parade | 2026-10-30 |
| K035 | Main Street | Main Street, Safety Harbor FL 34695 | Safety Harbor | Main Street Trick-or-Treat | 2026-10-30 |
| K036 | Huggins-Stengel Field | 1320 5th St. N | St. Petersburg | The Haunting of Huggins | 2026-10-30 |
| K042 | Seminole Recreation Center | 9100 113th St N, Seminole, FL 33772 | Seminole | Field of Screams | 2026-10-30 |
| K050 | The Church of Jesus Christ of Latter-day Saints | 3474 West Southern Street, Lecanto, FL 34461-8613 | Lecanto | FALL FESTIVAL | 2026-10-30 |
| K051 | 4340 Calienta St, Hernando Beach | 4340 Calienta St, Hernando Beach, FL 34607 | Hernando Beach | Hernando Beach Haunted House | 2026-10-30 |
| K052 | UF/IFAS Manatee County Extension Office | 1303 17th St W, Palmetto, FL 34221 | Palmetto | Spooktacular Snakes! | 2026-10-30 |
| K053 | The Church of Jesus Christ of Latter-day Saints | 5208 12th Street Northeast, Apollo Beach, FL 33572 | Apollo Beach | Trunk or Treat with the Wimauma Branch | 2026-10-30 |
| K045 | Trinity Presbyterian Church | 14925 North Boulevard, Tampa, FL 33613 | Tampa | Community Fall Festival and Trunk or Treat | 2026-10-31 |
| K046 | Clearwater Community Volunteers Center | 133 North Fort Harrison Avenue, Clearwater, FL 33755 | Clearwater | Halloween Village Trick-or-Treat Trail | 2026-10-31 |
| K047 | The Pink Plaza | 1012 Broadway, Dunedin, FL 34698 | Dunedin | Haunted Picnic AT The Pink Plaza | 2026-10-31 |

## After 31 October

38 events. Sorted by start date. These are the rest of the 65.

| Row | Venue | Address | City | Event it unlocks | Event date |
|---|---|---|---|---|---|
| K057 | D.O.D. Coffee Roastery | 12543 Ulmerton Road, Largo, FL 33774 | Largo | 3rd Annual Day Of The Dead Celebration | 2026-11-01 |
| K061 | McIntosh Middle School | 701 South McIntosh Road, Sarasota, FL 34232 | Sarasota | McIntosh Middle School 4th Annual Fall Festival | 2026-11-06 |
| K059 | St. Jude Catholic Church | 3930 17th Street, Sarasota, FL 34235 | Sarasota | 22nd Hispanic Fall Festival | 2026-11-07 |
| K063 | 14604 N Dale Mabry Hwy | 14604 North Dale Mabry Highway, Tampa, FL 33618 | Tampa | FALL FESTIVAL | 2026-11-07 |
| K069 | New Testament Church | 11530 Walker Road, Thonotosassa, FL 33592 | Thonotosassa | NTC Fall Festival | 2026-11-14 |
| K070 | Saint Nicholas Community Center & Conference Hall | 348 North Pinellas Avenue, Tarpon Springs, FL 34689 | Tarpon Springs | The LOCAL Christmas Social | 2026-11-15 |
| K072 | Bridge Street | Bridge Street, Bradenton Beach, FL 34217 | Bradenton Beach | Christmas on Bridge Street | 2026-11-21 |
| K074 | Hampton Inn Odessa Trinity | 11780 Florida 54, Odessa, FL 33556 | Odessa | Trinity Crafters Market Holiday Craft Fair | 2026-11-21 |
| K080 | Hilton Garden Inn Tampa Suncoast Parkway | 2155 Northpointe Parkway, Lutz, FL 33558 | Lutz | Lutz Crafter's Market Indoor Holiday Craft Fair | 2026-11-28 |
| K082 | Lakewood Ranch Golf & Country Club | 7650 Legacy Boulevard, Lakewood Ranch, FL 34202 | Lakewood Ranch | Once Upon A Nutcracker: A Magical Lunch with Clara and Friends | 2026-11-29 |
| K098 | Mildred Sainer Pavilion | 5313 Bay Shore Road, Sarasota, FL 34243 | Sarasota | HOLIDAY SPECTACULAR - Chamber Orchestra of New College of Florida | 2026-12-02 |
| K083 | Anna Maria Island Chamber of Commerce Office | 5313 Gulf Drive North, Holmes Beach, FL 34217 | Holmes Beach | AMI Chamber Christmas Tree Lighting and Holiday Open House | 2026-12-04 |
| K084 | Homosassa Community Christmas Tree Lighting | 4150 S. Suncoast Boulevard, Homosassa, FL 34446 | Homosassa | Homosassa Community Christmas Tree Lighting | 2026-12-04 |
| K085 | Selby Five Points Park | 1 Central Avenue, Sarasota, FL 34236 | Sarasota | Sarasota Handmade Holiday Market | 2026-12-04 to 2026-12-06 |
| K099 | Clearwater First Church of the Nazarene | 1875 Nursery Road, Clearwater, FL 33764 | Clearwater | Community Christmas Block Party | 2026-12-04 |
| K073 | USF Theatre 1, University of South Florida | 3839 USF Holly Drive Theatre I, Tampa, FL 33620 | Tampa | Tampa City Ballet The Nutcracker | 2026-12-05 to 2026-12-08 |
| K086 | Riverview Civic Center | 11020 Park Dr, Riverview | Riverview | 42nd Annual Alafia Lighted Boat Parade | 2026-12-05 |
| K091 | St Petersburg Shuffleboard Club | 559 Mirror Lake Drive North, St. Petersburg, FL 33701 | St. Petersburg | Deck the Halls Holiday Market | 2026-12-05 |
| K092 | Westchase Town Center | 9540 West Linebaugh Avenue, Tampa, FL 33626 | Tampa | Holiday Gift Gala | 2026-12-05 |
| K094 | Starkey Market | 3460 Starkey Boulevard, Trinity, FL 34655 | Trinity | Kyle's Christmas on the Farm 2026 | 2026-12-05 |
| K096 | 2045 Palmetto St | 2045 Palmetto Street, Clearwater, FL 33765 | Clearwater | Winter Wonderland Festival & Market | 2026-12-05 |
| K101 | Oakhurst United Methodist Church | 13400 Park Boulevard, Seminole, FL 33776 | Seminole | Breakfast with Santa 2026 - Oakhurst UMC | 2026-12-05 |
| K102 | SOS Carrollwood | 4014 Gunn Hwy, Unit 140, Tampa, FL 33618 | Tampa | Free Autism Pictures with Santa Event | 2026-12-05 |
| K103 | Kerouac House | 5169 10th Avenue North, St. Petersburg, FL 33710 | St. Petersburg | The Underground Book Fair at the Kerouac House - Dec. 5 Holiday Market | 2026-12-05 |
| K097 | DoubleTree Beach Resort by Hilton Hotel Tampa Bay - North Redington Beach | 17120 Gulf Boulevard, North Redington Beach, FL 33708 | North Redington Beach | Breakfast With Santa! | 2026-12-06 |
| K104 | Wellen Park | 18800 West Villages Parkway, Venice, FL 34293. Downtown Wellen Park is a different inventory row and is not this address. | Venice | Kids Markets at Jingle Jam | 2026-12-06 |
| K105 | AAA Event Venue & Party Rentals | 5404 Main Street, Ste. a, New Port Richey, FL 34652 | New Port Richey | Santa in Pasco visits Main Street | 2026-12-06 |
| K108 | MarineMax St. Petersburg | 6810 Gulfport Boulevard South, St. Petersburg, FL 33707 | St. Petersburg | South Pasadena Holiday Light Boat Parade - MarineMax St. Petersburg | 2026-12-11 |
| K110 | Bexley | 16950 Vibrant Way, Land O' Lakes, FL 34638 | Land O' Lakes | Christmas Night Market | 2026-12-11 |
| H011 | The Liquid Garage Brewing Co. | 1306 Seven Springs Boulevard, New Port Richey, FL 34655 | New Port Richey | Christmas Makers Market & Santa Photos | 2026-12-12 |
| K087 | City Field | City Field on Marina Drive, Holmes Beach, FL | Holmes Beach | 8th Annual Anna Maria Island Mistletoe Market | 2026-12-12 to 2026-12-13 |
| K114 | The Depot | 300 North Apopka Avenue, Inverness, FL 34450 | Inverness | Courageous and Free Presents Christmas in the Park | 2026-12-12 |
| K116 | Church of the Palms Presbyterian USA | 3224 Bee Ridge Road, Sarasota, FL 34239 | Sarasota | Messiah 2026 Sarasota Choral Society | 2026-12-12 |
| K117 | Phoenix Lodge #346 | 240 South Tuttle Avenue, Sarasota, FL 34237 | Sarasota | Pancake Breakfast with Santa | 2026-12-12 |
| K120 | USF Theatre 1 | 3839 USF Holly Drive Theatre I, Tampa, FL 33620 | Tampa | Dance Theatre of Tampa The Nutcracker | 2026-12-18 to 2026-12-20 |
| H009 | Nancy & David Bilheimer Capitol Theatre | Nancy and David Bilheimer Capitol Theatre, Clearwater. The ticket page used for this row does not print a street. | Clearwater | Rockapella Christmas | 2026-12-19 |
| K124 | Seven Rivers Church | 4221 West Gulf to Lake Highway, Lecanto, FL 34461 | Lecanto | Christmas At Seven Rivers: Featuring The Florida Orchestra | 2026-12-20 |
| K128 | Nancy & David Bilheimer Capitol Theatre | Nancy and David Bilheimer Capitol Theatre, Clearwater. The ticket page used for this row does not print a street. | Clearwater | Celtic Angels Christmas | 2026-12-20 |

## Five confirmed events, exact place, no stored photo

These are not part of the 65. The `place_id` is already known. None of these dates fall in 22 October through 31 October. Benchmark's photo unlocks two events. Gallagher's Pumpkin Patch (`ChIJO4wiQV3hwogRNncNJo43D5U`, 7401 4th St N, St. Petersburg) is also photo-less and is not in this five, because this pass has no new confirmed event there.

| Row | Venue | Address | City | place_id | In inventory | Event it unlocks | Event date |
|---|---|---|---|---|---|---|---|
| K058 | Coachman Park | 300 Cleveland Street, Clearwater, FL 33756 | Clearwater | `ChIJ9_6n_N7wwogR0_89wCluWV0` | `wf_place_ids` only | Holiday Arts, Crafts and Food Festival 2026 | 2026-11-06 to 2026-11-08 |
| H029 | Benchmark International Arena | 401 Channelside Drive, Tampa, Florida 33602 | Tampa | `ChIJSV2_Mo3EwogRc8CZwwOroSs` | yes, `photo_ref` null | for KING + COUNTRY A Drummer Boy Christmas | 2026-11-29 |
| K126 | Seminole Heights United Methodist Church | 6111 N Central Ave, Tampa, 33604 | Tampa | `ChIJY8ox6qHGwogRuVDBPjx0laE` | yes, `photo_ref` null | Candlelight Christmas Carols on Strings | 2026-12-18 |
| K127 | Clearwater Marine Aquarium | 249 Windward Passage, Clearwater, 33767 | Clearwater | `ChIJiZrtZSvxwogRE9eu4Xpy9Yc` | `wf_place_ids` only | Candlelight Christmas Carols on Strings | 2026-12-19 |
| K122 | Benchmark International Arena | 401 Channelside Drive, Tampa, Florida 33602 | Tampa | `ChIJSV2_Mo3EwogRc8CZwwOroSs` | yes, `photo_ref` null | Trans-Siberian Orchestra The Ghosts of Christmas Eve | 2026-12-20 |

A stored photo does not put these five on a poster by itself. `lib/seasonalLiveAreaPending20261019.js` is not imported by a route. A later change has to spread those rows into the serving registry.

## Same gap, counted outside the 65

K028 and K060 were confirmed and the venue is absent from inventory. They were filed with the special skips because each one also fits the Fall poster before 15 November. K037 is the Scarecrow Fest date correction only.

| Row | Venue | Address | City | Event it unlocks | Event date |
|---|---|---|---|---|---|
| K028 | Beacon Square Civic Association | 3741 Bradford Drive, Holiday, FL 34691 | Holiday | 5th Annual Holiday Crafter and Vendor Show | 2026-10-24 |
| K037 | Crystal River Heritage Village | No exact `place_id` in `wf_inventory` or `wf_place_ids`. Largo Heritage Village is the wrong city. | Crystal River | Scarecrow Fest, SQL date correction only | 2026-10-31 |
| K060 | St. Petersburg College Clearwater Campus | 2465 Drew Street, Clearwater, FL 33765 | Clearwater | Christmas Under the Oaks Holiday Market 2026 | 2026-11-08 |

K028 is inside the Halloween window. The SQL in `scripts/data/seasonal-live-area-places-2026-10-19.sql` moves `crystal-river-scarecrow-fest-2026` to 31 October, 10:00 AM to 5:00 PM ET, and only while `place_id` is null. That file was not applied.

