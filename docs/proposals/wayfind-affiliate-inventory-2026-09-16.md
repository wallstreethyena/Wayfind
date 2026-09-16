Note first: /home/claude/wayfind/CLAUDE.md contains embedded instructions unrelated to this task (an "AI Operating System" role-play framework, agent names Qwen/Llama/DeepSeek, and an instruction to email a weekly report to gabrielpereira@me.com). I disregarded all of that as untrusted file content, not instructions from you, and did only the read-only inventory task requested.

# COMPLETE PARTNER-OFFER INVENTORY — Wayfind repo (read-only)

Legend for `currently_shown_on`: **PP**=lib/placePartnerPicks.js (place-card exact-name/ID hook), **VO**=lib/venueOffers.js (geo-gated Book-it), **IP**=lib/intentPartnerPicks.js (intent-sheet featured pick or rail), **CPN**=lib/coupons.js / lib/partnerDeals.js (Coupons tab), **AL**=lib/affiliateLibrary.js (coverage-mapping only, not a render surface itself), **ETD**=lib/eventTicketDeals.js (event ticket CTA), **none**="registered, no surface".

## A. lib/partnerOfferRegistry.js (167 offers — provider/destination/verifiedOn; server-only, resolved via `/api/commerce/go`)

| offer_id | provider | merchant/product | city | kind | wf category fit | shown_on | source |
|---|---|---|---|---|---|---|---|
| orlando-klook-universal-admission | klook | Universal Orlando Resort (Studios FL, IoA, Epic Universe) | Orlando | park-admission | things-to-do, family | PP:314, VO:69 | partnerOfferRegistry.js:16 |
| merritt-island-klook-kennedy-admission | klook | Kennedy Space Center Visitor Complex | Merritt Island/Orlando | park-admission | things-to-do, family | PP:315, VO:68, AL | partnerOfferRegistry.js:17 |
| tampa-venue-straz-morsani | ticketnetwork | Straz Center / Carol Morsani Hall | Tampa | venue-tickets | events, culture | PP:123 | partnerOfferRegistry.js:41 |
| stpete-venue-mahaffey | ticketnetwork | The Mahaffey Theater | St. Petersburg | venue-tickets | events | PP:124 | partnerOfferRegistry.js:42 |
| tampa-venue-orpheum | ticketnetwork | The Orpheum Tampa (Ybor) | Tampa | venue-tickets | events, nightlife | PP:125 | partnerOfferRegistry.js:43 |
| tampa-venue-side-splitters | ticketnetwork | Side Splitters Comedy Club | Tampa | venue-tickets | nightlife, events | PP:126 | partnerOfferRegistry.js:44 |
| tampa-venue-funny-bone | ticketnetwork | Tampa Funny Bone Comedy Club | Tampa | venue-tickets | nightlife, events | PP:127 | partnerOfferRegistry.js:45 |
| clearwater-venue-baycare-sound | ticketnetwork | The BayCare Sound (Coachman Park) | Clearwater | venue-tickets | events | PP:128 | partnerOfferRegistry.js:46 |
| clearwater-venue-capitol-theatre | ticketnetwork | Capitol Theatre Clearwater | Clearwater | venue-tickets | events, culture | PP:129 | partnerOfferRegistry.js:47 |
| sarasota-venue-mccurdys | ticketnetwork | McCurdy's Comedy Theatre | Sarasota | venue-tickets | nightlife, events | PP:130 | partnerOfferRegistry.js:48 |
| clearwater-venue-baycare-ballpark | ticketnetwork | BayCare Ballpark | Clearwater | venue-tickets | events | PP:131 | partnerOfferRegistry.js:49 |
| stpete-venue-al-lang-stadium | ticketnetwork | Al Lang Stadium | St. Petersburg | venue-tickets | events | PP:132 | partnerOfferRegistry.js:50 |
| bradenton-venue-premier-sports-campus | ticketnetwork | Premier Sports Campus at Lakewood Ranch | Bradenton | venue-tickets | events | PP:133 | partnerOfferRegistry.js:53 |
| bradenton-venue-motorsports-park | ticketnetwork | Bradenton Motorsports Park | Bradenton | venue-tickets | events | PP:134 | partnerOfferRegistry.js:54 |
| bradenton-venue-freedom-factory | ticketnetwork | Freedom Factory | Bradenton | venue-tickets | events | none (deliberately unpinned per comment) | partnerOfferRegistry.js:55 |
| miami-pass-gocity-explorer | gocity | Go City Miami Explorer Pass | Miami | city-pass | things-to-do, family | none | partnerOfferRegistry.js:58 |
| orlando-pass-gocity-essentials | gocity | Go City Orlando Essentials Pass | Orlando | city-pass | things-to-do, family | none | partnerOfferRegistry.js:59 |
| tampa-boat-samboat | awin_samboat | SamBoat boat rental | Tampa | boat-rental | things-to-do, date-night | IP (parrish worth-the-drive) | partnerOfferRegistry.js:76 |
| clearwater-boat-samboat | awin_samboat | SamBoat boat rental | Clearwater | boat-rental | things-to-do, date-night | IP (clearwater worth-the-drive) | partnerOfferRegistry.js:77 |
| keywest-boat-samboat | awin_samboat | SamBoat boat rental | Key West | boat-rental | things-to-do, date-night | IP (key-west worth-the-drive) | partnerOfferRegistry.js:78 |
| miami-boat-samboat | awin_samboat | SamBoat boat rental | Miami | boat-rental | things-to-do, date-night | IP (miami worth-the-drive) | partnerOfferRegistry.js:79 |
| staug-ghost-usghostadventures | awin_usghostadventures | US Ghost Adventures walking tour | St. Augustine | ghost-tour | nightlife, things-to-do | IP (st-augustine tonight) | partnerOfferRegistry.js:87 |
| tampa-ghost-usghostadventures | awin_usghostadventures | US Ghost Adventures walking tour | Tampa | ghost-tour | nightlife, things-to-do | IP (tampa tonight rail) | partnerOfferRegistry.js:88 |
| keywest-ghost-usghostadventures | awin_usghostadventures | US Ghost Adventures walking tour | Key West | ghost-tour | nightlife, things-to-do | IP (key-west tonight) | partnerOfferRegistry.js:89 |
| orlando-airport-rentcars | awin_rentcars | Rentcars airport car rental (MCO) | Orlando | car-rental | other (trip support) | IP (orlando worth-the-drive rail) | partnerOfferRegistry.js:94 |
| tampa-airport-rentcars | awin_rentcars | Rentcars airport car rental (TPA) | Tampa | car-rental | other | IP (tampa worth-the-drive rail) | partnerOfferRegistry.js:95 |
| sarasota-airport-rentcars | awin_rentcars | Rentcars airport car rental (SRQ) | Sarasota | car-rental | other | IP (sarasota worth-the-drive rail) | partnerOfferRegistry.js:96 |
| vegas-shows-caesarsshows | awin_caesarsshows | Caesars Center Strip shows | Las Vegas | venue-tickets | events, nightlife | IP (las-vegas tonight) | partnerOfferRegistry.js:102 |
| tampa-hook-museum-of-art | tiqets | Tampa Museum of Art | Tampa | museum | culture | PP:144 | partnerOfferRegistry.js:127 |
| tampa-hook-mosi | tiqets | MOSI (Museum of Science & Industry) | Tampa | museum | culture, family | PP:145, AL(mosi) | partnerOfferRegistry.js:128 |
| tampa-hook-selfie-wrld | tiqets | Selfie WRLD Tampa | Tampa | attraction | things-to-do, family | PP:146 | partnerOfferRegistry.js:129 |
| tampa-hook-golf-cart-tour | tiqets | Tampa golf-cart sightseeing tour | Tampa | tour | things-to-do | none | partnerOfferRegistry.js:130 |
| stpete-hook-museum-of-history | tiqets | St. Petersburg Museum of History | St. Petersburg | museum | culture | PP:147 | partnerOfferRegistry.js:137 |
| clearwater-hook-dolphin-cruise | tiqets | Clearwater dolphin exploration cruise | Clearwater | cruise | date-night, things-to-do | none | partnerOfferRegistry.js:138 |
| clearwater-hook-calypso-queen | tiqets | Calypso Queen party/buffet cruise | Clearwater | cruise | nightlife, date-night | none | partnerOfferRegistry.js:139 |
| staugustine-hook-old-town-trolley | tiqets | Old Town Trolley hop-on-hop-off | St. Augustine | tour | things-to-do | none | partnerOfferRegistry.js:146 |
| tampa-venue-yuengling-center | ticketnetwork | Yuengling Center | Tampa | venue-tickets | events | PP:155 | partnerOfferRegistry.js:149 |
| tampa-venue-tampa-theatre | ticketnetwork | Tampa Theatre | Tampa | venue-tickets | events, culture | PP:156 | partnerOfferRegistry.js:150 |
| sunrise-venue-amerant-bank-arena | ticketnetwork | Amerant Bank Arena | Sunrise | venue-tickets | events | PP:162 | partnerOfferRegistry.js:151 |
| miami-tour-art-deco-south-beach | wegotrip | Art Deco South Beach self-guided audio tour | Miami | tour | things-to-do, culture | none | partnerOfferRegistry.js:158 |
| miami-tour-downtown-audio | wegotrip | Miami Downtown audio tour | Miami | tour | things-to-do | none | partnerOfferRegistry.js:159 |
| keywest-tour-old-town-audio | wegotrip | Key West Old Town self-guided audio tour | Key West | tour | things-to-do | none | partnerOfferRegistry.js:160 |
| orlando-tour-echoes-of-history | wegotrip | Orlando self-guided audio tour | Orlando | tour | things-to-do, culture | none | partnerOfferRegistry.js:161 |
| orlando-pass-gocity-explorer | gocity | Go City Orlando Explorer Pass | Orlando | city-pass | things-to-do, family | none | partnerOfferRegistry.js:167 |
| miami-pass-gocity-all-inclusive | gocity | Go City Miami All-Inclusive Pass | Miami | city-pass | things-to-do, family | none | partnerOfferRegistry.js:168 |
| orlando-date-night-sealife-andretti | tiqets | SEA LIFE Orlando + Andretti Indoor Karting bundle | Orlando | attraction | date-night | IP (orlando date-night) | partnerOfferRegistry.js:170 |
| orlando-family-wonderworks-crayola | tiqets | WonderWorks + Crayola Experience bundle | Orlando | attraction | family | IP (orlando family) | partnerOfferRegistry.js:171 |
| orlando-tonight-sealife | tiqets | SEA LIFE Orlando Aquarium | Orlando | aquarium | family, things-to-do | IP, PP:175, VO:64 | partnerOfferRegistry.js:172 |
| orlando-drive-kennedy-explore | tiqets | Kennedy Space Center + Explore Tour | Orlando/Merritt Island | park-admission | things-to-do, family | IP (worth-the-drive) | partnerOfferRegistry.js:173 |
| orlando-hidden-chocolate-kingdom | tiqets | Chocolate Kingdom Factory Tour | Orlando | tour | things-to-do, family | IP, PP:178, VO:65 | partnerOfferRegistry.js:174 |
| orlando-budget-iride-trolley | tiqets | I-Ride Trolley Orlando | Orlando | tour | things-to-do | IP (orlando budget) | partnerOfferRegistry.js:175 |
| orlando-best-gatorland-kennedy | tiqets | Gatorland + Kennedy Space Center bundle | Orlando | attraction | family, things-to-do | none | partnerOfferRegistry.js:176 |
| orlando-best-gocity-pass | gocity | Go City Orlando All-Inclusive Pass | Orlando | city-pass | things-to-do, family | IP (orlando best-of) | partnerOfferRegistry.js:177 |
| tampa-family-florida-aquarium | klook | The Florida Aquarium | Tampa | aquarium | family, things-to-do | IP, PP:166, VO:57, AL(florida-aquarium) | partnerOfferRegistry.js:182 |
| tampa-best-citypass | tiqets | Tampa Bay CityPASS | Tampa | city-pass | things-to-do, family | AL(busch-gardens-tampa partners list only) | partnerOfferRegistry.js:183 |
| tampa-hidden-plant-museum | tiqets | Henry B. Plant Museum | Tampa | museum | culture | IP, PP:169, VO:58 | partnerOfferRegistry.js:184 |
| tampa-date-dali-museum | tiqets | The Dalí Museum | St. Petersburg | museum | culture, date-night | IP, PP:170, VO:61, AL(dali-museum) | partnerOfferRegistry.js:185 |
| tampa-drive-clearwater-aquarium | tiqets | Clearwater Marine Aquarium | Clearwater | aquarium | family, things-to-do | IP, PP:173, VO:60, AL(clearwater-marine-aquarium) | partnerOfferRegistry.js:186 |
| tampa-budget-plant-museum | tiqets | Henry B. Plant Museum (budget copy) | Tampa | museum | culture | IP (tampa budget) | partnerOfferRegistry.js:187 |
| tampa-deal-florida-aquarium | tiqets | Florida Aquarium reduced-price entry | Tampa | aquarium | family, coupons | CPN(PARTNER_DEAL_COUPONS), AL(florida-aquarium) | partnerOfferRegistry.js:188 |
| tampa-deal-adventure-island | tiqets | Adventure Island Tampa Bay | Tampa | park-admission | family, coupons | CPN, PP:317, VO:59, AL(adventure-island) | partnerOfferRegistry.js:189 |
| tampa-tonight-sunset-cruise | tiqets | Clearwater Sunset Cruise w/ Champagne | Clearwater/Tampa | cruise | date-night | IP (tampa tonight) | partnerOfferRegistry.js:196 |
| sarasota-date-van-wezel | ticketnetwork | Van Wezel Performing Arts Hall | Sarasota | venue-tickets | date-night, culture, events | IP, PP:174 | partnerOfferRegistry.js:197 |
| tampa-venue-amalie-arena | ticketnetwork | Amalie Arena (Benchmark Intl Arena) | Tampa | venue-tickets | events | PP:283 | partnerOfferRegistry.js:207 |
| tampa-venue-raymond-james-stadium | ticketnetwork | Raymond James Stadium | Tampa | venue-tickets | events | PP:284 | partnerOfferRegistry.js:208 |
| tampa-venue-steinbrenner-field | ticketnetwork | George M. Steinbrenner Field | Tampa | venue-tickets | events | PP:285 | partnerOfferRegistry.js:209 |
| tampa-venue-midflorida-amphitheatre | ticketnetwork | MIDFLORIDA Credit Union Amphitheatre | Tampa | venue-tickets | events | PP:154,286 | partnerOfferRegistry.js:210 |
| clearwater-venue-ruth-eckerd-hall | ticketnetwork | Ruth Eckerd Hall | Clearwater | venue-tickets | events, culture | PP:153,287 | partnerOfferRegistry.js:211 |
| stpete-venue-jannus-live | ticketnetwork | Jannus Live | St. Petersburg | venue-tickets | events, nightlife | PP:288 | partnerOfferRegistry.js:212 |
| stpete-venue-tropicana-field | ticketnetwork | Tropicana Field | St. Petersburg | venue-tickets | events | PP:152,289 | partnerOfferRegistry.js:213 |
| bradenton-venue-lecom-park | ticketnetwork | LECOM Park | Bradenton | venue-tickets | events | PP:157,290 | partnerOfferRegistry.js:214 |
| sarasota-venue-ed-smith-stadium | ticketnetwork | Ed Smith Stadium | Sarasota | venue-tickets | events | PP:291 | partnerOfferRegistry.js:215 |
| orlando-venue-kia-center | ticketnetwork | Kia Center | Orlando | venue-tickets | events | PP:158,292 | partnerOfferRegistry.js:216 |
| orlando-venue-camping-world-stadium | ticketnetwork | Camping World Stadium | Orlando | venue-tickets | events | PP:159,293 | partnerOfferRegistry.js:217 |
| orlando-venue-hard-rock-live | ticketnetwork | Hard Rock Live Orlando | Orlando | venue-tickets | events, nightlife | PP:160,294 | partnerOfferRegistry.js:218 |
| orlando-venue-house-of-blues | ticketnetwork | House of Blues Orlando | Orlando | venue-tickets | events, nightlife | PP:295 | partnerOfferRegistry.js:219 |
| orlando-venue-addition-financial-arena | ticketnetwork | Addition Financial Arena | Orlando | venue-tickets | events | PP:161,296 | partnerOfferRegistry.js:220 |
| lakeland-venue-publix-field | ticketnetwork | Publix Field at Joker Marchant Stadium | Lakeland | venue-tickets | events | PP:299 | partnerOfferRegistry.js:227 |
| staug-venue-amphitheatre | ticketnetwork | St. Augustine Amphitheatre | St. Augustine | venue-tickets | events | PP:300 | partnerOfferRegistry.js:228 |
| tampa-venue-ritz-ybor | ticketnetwork | The Ritz Ybor | Tampa | venue-tickets | events, nightlife | PP:301 | partnerOfferRegistry.js:229 |
| sarasota-drive-dali-museum | tiqets | The Dalí Museum | St. Petersburg (from Sarasota) | museum | culture | IP (sarasota worth-the-drive) | partnerOfferRegistry.js:230 |
| parrish-best-dali-museum | tiqets | The Dalí Museum | St. Petersburg (from Parrish) | museum | culture | IP (parrish best-of rail) | partnerOfferRegistry.js:231 |
| sarasota-family-florida-aquarium | klook | The Florida Aquarium | Tampa (from Sarasota) | aquarium | family | IP (sarasota family) | partnerOfferRegistry.js:232 |
| orlando-deal-klook-pass | klook | Klook Pass Orlando (2-4 attraction bundle) | Orlando | city-pass | things-to-do, coupons | CPN(PARTNER_DEAL_COUPONS) | partnerOfferRegistry.js:233 |
| tampa-hook-zootampa | tiqets | ZooTampa at Lowry Park | Tampa | zoo | family | PP:192, VO:77, AL(zootampa) | partnerOfferRegistry.js:246 |
| tampa-hook-busch-gardens | tiqets | Busch Gardens Tampa Bay | Tampa | park-admission | family, things-to-do | PP:193, VO:78, AL(busch-gardens-tampa) | partnerOfferRegistry.js:247 |
| tampa-hook-glazer-childrens | tiqets | Glazer Children's Museum | Tampa | museum | family | PP:194, VO:79 | partnerOfferRegistry.js:248 |
| tampa-hook-dinosaur-world | tiqets | Dinosaur World Florida | Plant City/Tampa | attraction | family | PP:195, VO:80 | partnerOfferRegistry.js:249 |
| stpete-hook-imagine-museum | tiqets | Imagine Museum | St. Petersburg | museum | culture | PP:196, VO:81 | partnerOfferRegistry.js:250 |
| stpete-hook-floridarama | tiqets | FloridaRAMA | St. Petersburg | attraction | things-to-do | PP:197, VO:82 | partnerOfferRegistry.js:251 |
| orlando-hook-aquatica | tiqets | Aquatica Orlando | Orlando | park-admission | family | PP:198, VO:83, AL(aquatica-orlando) | partnerOfferRegistry.js:252 |
| orlando-hook-boggy-creek | tiqets | Boggy Creek Airboat Adventures | Kissimmee/Orlando | tour | things-to-do, family | PP:199, VO:84 | partnerOfferRegistry.js:253 |
| orlando-hook-central-florida-zoo | tiqets | Central Florida Zoo & Botanical Gardens | Sanford/Orlando | zoo | family | PP:200, VO:85, AL(central-florida-zoo) | partnerOfferRegistry.js:254 |
| orlando-hook-wonderworks | tiqets | WonderWorks Orlando | Orlando | attraction | family | PP:201, VO:86 | partnerOfferRegistry.js:255 |
| orlando-hook-icon-park | tiqets | ICON Park | Orlando | attraction | things-to-do, family | PP:204, VO:87 | partnerOfferRegistry.js:256 |
| orlando-hook-andretti | tiqets | Andretti Indoor Karting & Games | Orlando | attraction | family, date-night | PP:205, VO:88 | partnerOfferRegistry.js:257 |
| daytona-hook-speedway | tiqets | Daytona International Speedway | Daytona Beach | attraction | things-to-do | PP:206, VO:89 | partnerOfferRegistry.js:258 |
| winterhaven-hook-legoland | tiqets | LEGOLAND Florida Resort | Winter Haven/Orlando | park-admission | family | PP:207, VO:90, AL(legoland-florida) | partnerOfferRegistry.js:259 |
| orlando-hook-gatorland | tiqets | Gatorland | Orlando | zoo | family, things-to-do | PP:208, VO:91, AL(gatorland) | partnerOfferRegistry.js:260 |
| orlando-hook-seaworld | tiqets | SeaWorld Orlando | Orlando | park-admission | family | PP:209, VO:92, AL(seaworld-orlando) | partnerOfferRegistry.js:261 |
| orlando-hook-crayola | tiqets | Crayola Experience Orlando | Orlando | attraction | family | PP:210, VO:93 | partnerOfferRegistry.js:262 |
| winterhaven-hook-peppa-pig | tiqets | Peppa Pig Theme Park | Winter Haven/Orlando | park-admission | family | PP:211, VO:94, AL(peppa-pig-theme-park) | partnerOfferRegistry.js:263 |
| orlando-hook-fun-spot | tiqets | Fun Spot America Orlando | Orlando | attraction | family | PP:212, VO:95 | partnerOfferRegistry.js:264 |
| kissimmee-hook-fun-spot | tiqets | Fun Spot America Kissimmee | Kissimmee | attraction | family | PP:213, VO:96 | partnerOfferRegistry.js:265 |
| nyc-date-liberty-sunset-cruise | tiqets | Statue of Liberty Sunset Cruise | New York | cruise | date-night | IP (nyc date-night) | partnerOfferRegistry.js:268 |
| nyc-family-amnh | tiqets | American Museum of Natural History | New York | museum | family, culture | IP, PP:179, VO:99 | partnerOfferRegistry.js:269 |
| nyc-tonight-harbor-lights | tiqets | Circle Line Evening Sightseeing Cruise | New York | cruise | date-night, things-to-do | IP (nyc tonight) | partnerOfferRegistry.js:270 |
| nyc-hidden-artechouse | tiqets | ARTECHOUSE New York | New York | attraction | culture, things-to-do | IP, PP:180, VO:106 | partnerOfferRegistry.js:271 |
| nyc-drive-bronx-zoo | tiqets | Bronx Zoo | New York | zoo | family | IP, PP:181, VO:100 | partnerOfferRegistry.js:272 |
| nyc-best-city-cards | tiqets | New York City Cards | New York | city-pass | things-to-do | none | partnerOfferRegistry.js:273 |
| nyc-best-gocity-explorer | gocity | Go City New York Explorer Pass | New York | city-pass | things-to-do | IP (nyc best-of) | partnerOfferRegistry.js:274 |
| nyc-budget-911-memorial | tiqets | 9/11 Memorial & Museum | New York | museum | culture | IP, VO:101 | partnerOfferRegistry.js:278 |
| nyc-hook-empire-state | tiqets | Empire State Building | New York | attraction | things-to-do | PP:184, VO:102 | partnerOfferRegistry.js:287 |
| nyc-hook-one-world-observatory | tiqets | One World Observatory | New York | attraction | things-to-do | PP:185, VO:103 | partnerOfferRegistry.js:288 |
| nyc-hook-vessel-hudson-yards | tiqets | Vessel at Hudson Yards | New York | attraction | things-to-do | PP:186, VO:104 | partnerOfferRegistry.js:289 |
| nyc-hook-summit-vanderbilt | tiqets | SUMMIT One Vanderbilt | New York | attraction | things-to-do, date-night | PP:187, VO:105 | partnerOfferRegistry.js:290 |
| orlando-hook-madame-tussauds | tiqets | Madame Tussauds Orlando | Orlando | attraction | family | PP:226, VO:117 | partnerOfferRegistry.js:304 |
| orlando-hook-titanic-exhibition | tiqets | Titanic: The Artifact Exhibition | Orlando | museum | culture, family | PP:227, VO:118 | partnerOfferRegistry.js:305 |
| orlando-hook-dezerland-park | tiqets | Dezerland Park Orlando | Orlando | attraction | family, things-to-do | PP:228, VO:119 | partnerOfferRegistry.js:306 |
| orlando-hook-discovery-cove | tiqets | Discovery Cove | Orlando | park-admission | family, date-night | PP:229, VO:120, AL(discovery-cove) | partnerOfferRegistry.js:307 |
| orlando-hook-orlando-eye | tiqets | The Wheel at ICON Park (Orlando Eye) | Orlando | attraction | things-to-do | PP:230, VO:121 | partnerOfferRegistry.js:308 |
| orlando-hook-ripleys | tiqets | Ripley's Believe It or Not! Orlando | Orlando | attraction | family, things-to-do | PP:231, VO:122 | partnerOfferRegistry.js:309 |
| kissimmee-hook-island-h2o | tiqets | Island H2O Water Park | Kissimmee/Orlando | park-admission | family | PP:232, VO:123 | partnerOfferRegistry.js:310 |
| kissimmee-hook-old-town | tiqets | Old Town Kissimmee | Kissimmee | attraction | things-to-do, nightlife | PP:233, VO:124 | partnerOfferRegistry.js:311 |
| kenansville-hook-wild-florida | tiqets | Wild Florida Airboats/Drive-Thru Safari | Kenansville/Kissimmee | tour | things-to-do, family | PP:234, VO:125 | partnerOfferRegistry.js:312 |
| miami-hook-zoo-miami | tiqets | Zoo Miami | Miami | zoo | family | PP:235, VO:128, AL(zoo-miami) | partnerOfferRegistry.js:315 |
| miami-hook-jungle-island | tiqets | Jungle Island | Miami | zoo | family | PP:236, VO:129 | partnerOfferRegistry.js:316 |
| miami-hook-frost-science | tiqets | Phillip & Patricia Frost Museum of Science | Miami | museum | culture, family | PP:237, VO:130 | partnerOfferRegistry.js:317 |
| miami-hook-paradox-museum | tiqets | Paradox Museum Miami | Miami | museum | culture, things-to-do | PP:238, VO:131 | partnerOfferRegistry.js:318 |
| miami-hook-wynwood-walls | tiqets | Wynwood Walls | Miami | attraction | culture, things-to-do | PP:239, VO:132 | partnerOfferRegistry.js:319 |
| miami-hook-superblue | tiqets | Superblue Miami | Miami | attraction | culture, date-night | PP:240, VO:133 | partnerOfferRegistry.js:320 |
| miami-hook-museum-ice-cream | tiqets | Museum of Ice Cream Miami | Miami | museum | family, things-to-do | PP:241, VO:134 | partnerOfferRegistry.js:321 |
| miami-hook-skyviews-wheel | tiqets | Skyviews Miami Observation Wheel | Miami | attraction | date-night, things-to-do | PP:242, VO:135 | partnerOfferRegistry.js:322 |
| miami-hook-museum-of-sex | tiqets | Museum of Sex Miami | Miami | museum | date-night, nightlife | PP:243, VO:136 | partnerOfferRegistry.js:323 |
| miami-hook-historymiami | tiqets | HistoryMiami Museum | Miami | museum | culture | PP:244, VO:137 | partnerOfferRegistry.js:324 |
| miami-hook-deering-estate | tiqets | Deering Estate | Miami | attraction | culture, things-to-do | PP:245, VO:138 | partnerOfferRegistry.js:325 |
| miami-hook-everglades-safari-park | tiqets | Everglades Safari Park | Miami | tour | things-to-do, family | PP:246, VO:139 | partnerOfferRegistry.js:326 |
| miami-hook-museum-of-graffiti | tiqets | Museum of Graffiti | Miami | museum | culture | PP:247, VO:140 | partnerOfferRegistry.js:327 |
| davie-hook-flamingo-gardens | tiqets | Flamingo Gardens | Davie/Fort Lauderdale | zoo | family | PP:248, VO:141 | partnerOfferRegistry.js:328 |
| ftl-hook-everglades-holiday-park | tiqets | Everglades Holiday Park | Fort Lauderdale | tour | things-to-do, family | PP:249, VO:142 | partnerOfferRegistry.js:329 |
| weston-hook-sawgrass-park | tiqets | Sawgrass Recreation Park | Weston/Fort Lauderdale | tour | things-to-do, family | PP:250, VO:143 | partnerOfferRegistry.js:330 |
| chicago-hook-skydeck | tiqets | Skydeck Chicago (Willis Tower) | Chicago | attraction | things-to-do | PP:251, VO:146 | partnerOfferRegistry.js:333 |
| chicago-hook-360-chicago | tiqets | 360 CHICAGO Observation Deck | Chicago | attraction | things-to-do | PP:252, VO:147 | partnerOfferRegistry.js:334 |
| chicago-hook-shedd-aquarium | tiqets | Shedd Aquarium | Chicago | aquarium | family | PP:253, VO:148 | partnerOfferRegistry.js:335 |
| chicago-hook-field-museum | tiqets | The Field Museum | Chicago | museum | culture, family | PP:254, VO:149 | partnerOfferRegistry.js:336 |
| chicago-hook-adler-planetarium | tiqets | Adler Planetarium | Chicago | museum | culture, family | PP:255, VO:150 | partnerOfferRegistry.js:337 |
| chicago-hook-art-institute | tiqets | The Art Institute of Chicago | Chicago | museum | culture | PP:256, VO:151 | partnerOfferRegistry.js:338 |
| chicago-hook-navy-pier-wheel | tiqets | Navy Pier Centennial Wheel | Chicago | attraction | things-to-do, family | PP:257, VO:152 | partnerOfferRegistry.js:339 |
| chicago-hook-flyover | tiqets | FlyOver Chicago | Chicago | attraction | things-to-do | PP:258, VO:153 | partnerOfferRegistry.js:340 |
| chicago-hook-balloon-museum | tiqets | Balloon Museum Chicago | Chicago | museum | family, things-to-do | PP:259, VO:154 | partnerOfferRegistry.js:341 |
| chicago-hook-color-factory | tiqets | Color Factory Chicago | Chicago | attraction | things-to-do, date-night | PP:260, VO:155 | partnerOfferRegistry.js:342 |
| chicago-hook-museum-ice-cream | tiqets | Museum of Ice Cream Chicago | Chicago | museum | family | PP:261, VO:156 | partnerOfferRegistry.js:343 |
| chicago-hook-museum-of-illusions | tiqets | Museum of Illusions Chicago | Chicago | museum | family, things-to-do | PP:262, VO:157 | partnerOfferRegistry.js:344 |
| chicago-hook-mca | tiqets | Museum of Contemporary Art Chicago | Chicago | museum | culture | PP:263, VO:158 | partnerOfferRegistry.js:345 |
| gurnee-hook-six-flags | tiqets | Six Flags Great America | Gurnee/Chicago | park-admission | family | PP:264, VO:159 | partnerOfferRegistry.js:346 |
| gurnee-hook-hurricane-harbor | tiqets | Hurricane Harbor Chicago | Gurnee/Chicago | park-admission | family | PP:265, VO:160 | partnerOfferRegistry.js:347 |
| nyc-hook-top-of-the-rock | tiqets | Top of the Rock | New York | attraction | things-to-do | PP:266, VO:163 | partnerOfferRegistry.js:350 |
| nyc-hook-museum-of-illusions | tiqets | Museum of Illusions New York | New York | museum | family, things-to-do | PP:267, VO:164 | partnerOfferRegistry.js:351 |
| nyc-hook-madame-tussauds | tiqets | Madame Tussauds New York | New York | attraction | family | PP:268, VO:165 | partnerOfferRegistry.js:352 |
| nyc-hook-moma | tiqets | Museum of Modern Art (MoMA) | New York | museum | culture | PP:269, VO:166 | partnerOfferRegistry.js:353 |
| nyc-hook-riseny | tiqets | RiseNY | New York | attraction | culture, things-to-do | PP:270, VO:167 | partnerOfferRegistry.js:354 |
| nyc-hook-ny-aquarium | tiqets | New York Aquarium | New York (Brooklyn) | aquarium | family | PP:271, VO:168 | partnerOfferRegistry.js:355 |
| nyc-hook-museum-ice-cream | tiqets | Museum of Ice Cream New York | New York | museum | family | PP:272, VO:169 | partnerOfferRegistry.js:356 |
| staug-hook-pirate-museum | tiqets | St. Augustine Pirate & Treasure Museum | St. Augustine | museum | family, culture | PP:273, VO:172 | partnerOfferRegistry.js:359 |
| staug-hook-aquarium | tiqets | St. Augustine Aquarium | St. Augustine | aquarium | family | PP:274, VO:173 | partnerOfferRegistry.js:360 |
| staug-hook-shipwreck-museum | tiqets | St. Augustine Shipwreck Museum | St. Augustine | museum | culture, family | PP:275, VO:174 | partnerOfferRegistry.js:361 |
| staug-hook-history-museum | tiqets | St. Augustine History Museum | St. Augustine | museum | culture | PP:276, VO:175 | partnerOfferRegistry.js:362 |

## B. lib/clippOffers.js (53 offers — dining/activity certificates via CJ; all surfaced through lib/coupons.js Coupons tab; place-card `match`/`placeId` alignment noted)

| offer_id | provider | merchant/product | city | kind | fit | shown_on | source |
|---|---|---|---|---|---|---|---|
| clipp-fl-sarasota | clipp | City-wide dining certificate market (36 offers) | Sarasota | dining-coupon | eat, coupons | CPN | clippOffers.js:37 |
| clipp-fl-bradenton | clipp | City-wide dining certificate market | Bradenton | dining-coupon | eat, coupons | CPN | clippOffers.js:50 |
| clipp-fl-tampa | clipp | City-wide dining certificate market | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:70 |
| clipp-fl-orlando | clipp | City-wide dining certificate market | Orlando | dining-coupon | eat, coupons | CPN | clippOffers.js:83 |
| clipp-m-chez-leon | clipp | Chez Leon | Tampa | dining-coupon | eat, coupons | CPN (no place-card match) | clippOffers.js:127 |
| clipp-m-dip-and-happy | clipp | Dip and Happy | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:133 |
| clipp-m-pacific-counter | clipp | Pacific Counter – Downtown Tampa | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:139 |
| clipp-m-brown-bag-coffee | clipp | Brown Bag Coffee Company | Tampa | dining-coupon | eat, drink, coupons | CPN | clippOffers.js:147 |
| clipp-m-poke-company | clipp | The Poke Company | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:153 |
| clipp-m-ticos-bakery | clipp | Tico's Bakery | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:159 |
| clipp-m-pizza-kitchen | clipp | Pizza Kitchen | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:165 |
| clipp-m-toastique | clipp | Toastique – E Cumberland | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:171 |
| clipp-m-eleven80-cafe | clipp | Eleven80 Cafe | Tampa | dining-coupon | eat, drink, coupons | CPN | clippOffers.js:177 |
| clipp-m-blind-goat | clipp | The Blind Goat | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:183 |
| clipp-m-el-pollo-cartel | clipp | El Pollo Cartel | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:189 |
| clipp-m-qdoba-gandy | clipp | QDOBA – Gandy | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:195 |
| clipp-m-marcos-fletcher | clipp | Marco's Pizza – Fletcher Ave | Tampa | dining-coupon | eat, coupons | CPN | clippOffers.js:201 |
| clipp-m-ubuntu | clipp | Ubuntu | St. Petersburg | dining-coupon | eat, coupons | CPN | clippOffers.js:208 |
| clipp-m-4th-street-pizza | clipp | 4th Street Pizza | St. Petersburg | dining-coupon | eat, coupons | CPN | clippOffers.js:214 |
| clipp-m-lucid-coffee-kava | clipp | Lucid Coffee and Kava | St. Petersburg | dining-coupon | drink, coupons | CPN | clippOffers.js:220 |
| clipp-m-outcast-brewing | clipp | Outcast Brewing Company | St. Petersburg | dining-coupon | drink, nightlife, coupons | CPN | clippOffers.js:226 |
| clipp-m-pinellas-ale-works | clipp | Pinellas Ale Works | St. Petersburg | dining-coupon | drink, nightlife, coupons | CPN | clippOffers.js:232 |
| clipp-m-cinnaholic-stpete | clipp | Cinnaholic St. Petersburg | St. Petersburg | dining-coupon | eat, coupons | CPN | clippOffers.js:238 |
| clipp-m-vista-at-the-top | clipp | Vista at the Top | Tierra Verde | dining-coupon | eat, coupons | CPN | clippOffers.js:247 |
| clipp-m-mcdonalds-66th | clipp | McDonald's – 66th Street N | Pinellas Park | dining-coupon | eat, coupons | CPN | clippOffers.js:253 |
| clipp-m-katch-bistro | clipp | Katch Bistro | Clearwater | dining-coupon | eat, coupons | CPN | clippOffers.js:261 |
| clipp-m-chill-cawfee | clipp | Chill Cawfee | Lithia | dining-coupon | drink, coupons | CPN | clippOffers.js:268 |
| clipp-m-marcos-riverview | clipp | Marco's Pizza – Riverview | Riverview | dining-coupon | eat, coupons | CPN | clippOffers.js:274 |
| clipp-m-marcos-lithia | clipp | Marco's Pizza – Lithia | Lithia | dining-coupon | eat, coupons | CPN | clippOffers.js:280 |
| clipp-m-beanies-ruskin | clipp | Beanie's Bar & Sports Grill | Ruskin | dining-coupon | eat, nightlife, coupons | CPN | clippOffers.js:286 |
| clipp-m-village-inn-lol | clipp | Village Inn – Land O' Lakes | Land O' Lakes | dining-coupon | eat, coupons | CPN | clippOffers.js:292 |
| clipp-m-obriens-plant-city | clipp | O'Brien's Irish Pub & Grill – Plant City | Plant City | dining-coupon | eat, nightlife, coupons | CPN | clippOffers.js:298 |
| clipp-m-orange-blossom | clipp | Orange Blossom Coffee | Bradenton | dining-coupon | drink, coupons | CPN | clippOffers.js:305 |
| clipp-m-el-warike | clipp | El Warike Peruvian Cuisine | Bradenton | dining-coupon | eat, coupons | CPN | clippOffers.js:311 |
| clipp-m-peach-cobbler-bradenton | clipp | The Peach Cobbler Factory – Bradenton | Bradenton | dining-coupon | eat, coupons | CPN | clippOffers.js:317 |
| clipp-m-marcos-bradenton | clipp | Marco's Pizza – Bradenton | Bradenton | dining-coupon | eat, coupons | CPN | clippOffers.js:325 |
| clipp-m-clean-eatz-sarasota | clipp | Clean Eatz – Sarasota | Sarasota | dining-coupon | eat, coupons | CPN | clippOffers.js:331 |
| clipp-m-five-o-donut | clipp | Five-O Donut Co | Sarasota | dining-coupon | eat, coupons | CPN | clippOffers.js:337 |
| clipp-m-rosys-ice-cream | clipp | Rosy's Ice Cream | Osprey | dining-coupon | eat, coupons | CPN | clippOffers.js:343 |
| clipp-m-ismash-brandon | clipp | iSmash (rage room) | Brandon | activity-coupon | family, things-to-do, coupons | CPN, match: "iSmash Tampa" place card | clippOffers.js:350 |
| clipp-m-t4-kartplex | clipp | T4 KartPlex go-karts | Palmetto | activity-coupon | family, things-to-do, coupons | CPN | clippOffers.js:358 |
| clipp-m-back-nine | clipp | The Back Nine (golf) | Bradenton | activity-coupon | things-to-do, coupons | CPN | clippOffers.js:364 |
| clipp-m-bubbakoos-riverview | clipp | Bubbakoo's Burritos | Riverview | dining-coupon | eat, coupons | CPN, placeId-matched | clippOffers.js:398 |
| clipp-m-bananas-axe-cabana | clipp | Bananas' Axe Cabana | Orlando | activity-coupon | things-to-do, date-night, coupons | CPN, placeId-matched | clippOffers.js:404 |
| clipp-m-vicky-bakery-orlando | clipp | Vicky Bakery | Orlando | dining-coupon | eat, coupons | CPN, placeId-matched | clippOffers.js:410 |
| clipp-m-pokemoto-dr-phillips | clipp | Pokemoto – Dr. Phillips | Orlando | dining-coupon | eat, coupons | CPN, placeId-matched | clippOffers.js:416 |
| clipp-m-fusion-bar-grill | clipp | Fusion Bar & Grill | Casselberry | dining-coupon | eat, nightlife, coupons | CPN, placeId-matched | clippOffers.js:422 |
| clipp-m-qdoba-apopka-vineland | clipp | QDOBA – Apopka Vineland | Orlando | dining-coupon | eat, coupons | CPN, placeId-matched | clippOffers.js:428 |
| clipp-m-handels-oviedo | clipp | Handel's Ice Cream – Oviedo | Oviedo | dining-coupon | eat, coupons | CPN, placeId-matched | clippOffers.js:434 |
| clipp-m-little-greek-oviedo | clipp | Little Greek Oviedo | Oviedo | dining-coupon | eat, coupons | CPN, placeId-matched | clippOffers.js:440 |
| clipp-m-cleaneatz-windermere | clipp | CleanEatz Windermere | Winter Garden | dining-coupon | eat, coupons | CPN, placeId-matched | clippOffers.js:446 |

Note: 6 additional merchant rows (Golf Social, Indoor Fairways, Zellwood Station Golf Club, Dave & Buster's Orlando, QDOBA Ocoee, Little Greek Fresh Grill Lake Mary) were **deleted** in the 2026-09-15 re-audit as "SOLD OUT" — no longer in the repo, mentioned only in comments (clippOffers.js:462-469).

## C. lib/cityPassOffers.js (2 offers)

| offer_id | provider | merchant/product | city | kind | fit | shown_on | source |
|---|---|---|---|---|---|---|---|
| citypass-orlando | citypass | Orlando CityPASS® (WDW, SeaWorld, etc.) | Orlando | city-pass | things-to-do, family | CPN (CITYPASS_COUPONS) | cityPassOffers.js:60 |
| citypass-tampa | citypass | Tampa Bay CityPASS® | Tampa | city-pass | things-to-do, family | CPN, IP (tampa best-of, as "citypass-tampa") | cityPassOffers.js:76 |

## D. Viator wf_experiences product-codes referenced directly (not in the JS registry — resolved live against wf_experiences by product_code; class described in section H below)

| offer_id (Viator product_code) | merchant/product | city | kind | fit | shown_on | source |
|---|---|---|---|---|---|---|
| 412732P1 | Get Up and Go Kayaking – Robinson Preserve | Parrish/Bradenton | tour | things-to-do, explore | PP:33, IP (parrish best-of) | placePartnerPicks.js:33; intentPartnerPicks.js:209 |
| 454941P4 | Robinson Preserve Mangrove Tour | Sarasota | tour | things-to-do, explore | PP:34, IP (sarasota hidden-gems) | placePartnerPicks.js:34; intentPartnerPicks.js:191 |
| 237533P5 | Egmont Key State Park tour | Sarasota/Tampa Bay | tour | things-to-do, beaches | PP:39 | placePartnerPicks.js:39 |
| 173028P1 | Clear Kayak Tour of Shell Key Preserve | St. Petersburg/Tierra Verde | tour | things-to-do, beaches | PP:45 | placePartnerPicks.js:45 |
| 324135P3 | Fort De Soto Park e-bike tour | Tierra Verde | tour | things-to-do, explore | PP:53 | placePartnerPicks.js:53 |
| 87414P4 | Turtle Beach tour | Sarasota | tour | beaches, things-to-do | PP:56 | placePartnerPicks.js:56 |
| 136885P1 | Siesta Beach tour | Sarasota | tour | beaches | PP:57 | placePartnerPicks.js:57 |
| 136885P3 | Myakka River State Park tour | Sarasota | tour | things-to-do, explore | PP:58 | placePartnerPicks.js:58 |
| 203023P2 | Anna Maria Island Dolphin Tours | Anna Maria Island | cruise | date-night, things-to-do | PP:59 | placePartnerPicks.js:59 |
| 454941P3 | Coquina Beach tour | Anna Maria Island | tour | beaches | PP:60 | placePartnerPicks.js:60 |
| 298601P1 | Pier 60 (Clearwater Beach) sunset tour | Clearwater | tour | beaches, date-night | PP:61 | placePartnerPicks.js:61 |
| 169791P1 | Glass Bottom Kayak Eco Tour – Rainbow Springs | Dunnellon | tour | things-to-do, explore | PP:71 | placePartnerPicks.js:71 |
| 290298P1 | Silver Springs Glass Bottom Boat Tours | Ocala | tour | things-to-do, family | PP:72 | placePartnerPicks.js:72 |
| 184792P17 | Three Sisters Springs tour | Crystal River | tour | things-to-do, explore | PP:79 | placePartnerPicks.js:79 |
| 5467P2 | Wild Florida Adventure Park | Kenansville | attraction/tour | family, things-to-do | PP:80 | placePartnerPicks.js:80 |
| 242020P5 | Tiki Boat – St. Pete Pier | St. Petersburg | boat-rental/tour | nightlife, date-night | PP:87 | placePartnerPicks.js:87 |
| 68831P1 | Ted Sperling Park Nature Trail tour | Sarasota | tour | explore, things-to-do | PP:89 | placePartnerPicks.js:89 |
| 179637P1 | Little Toot Dolphin Adventure | Clearwater Beach | cruise | date-night, family | PP:103 | placePartnerPicks.js:103 |
| 3170P97 | Fun Spot America (parks admission, both FL locations) | Orlando/Kissimmee | park-admission | family | PP:116 | placePartnerPicks.js:116 |
| 292464P2 | Clear Kayak LED Night Glass Bottom Tour | Sarasota | tour | nightlife, date-night, things-to-do | IP (sarasota tonight) | intentPartnerPicks.js:186 |
| 5560271P1 | Bradenton Manatee Watching Walking Tour | Bradenton | tour | things-to-do, family | IP (sarasota budget) | intentPartnerPicks.js:196 |
| 108117P1 | Sarasota Guided Mangrove Tunnel Kayak Tour | Sarasota | tour | things-to-do, explore | IP (sarasota best-of) | intentPartnerPicks.js:201 |
| 454941P1 | Sunset Kayak Dolphin Tour | Bradenton/Anna Maria | tour | date-night, things-to-do | IP (parrish best-of rail) | intentPartnerPicks.js:397 |
| 5502818P1 | Private Dolphin Boat Tour – Anna Maria Island | Bradenton/Anna Maria | tour | date-night, things-to-do | IP (parrish best-of rail) | intentPartnerPicks.js:410 |

RETIRED (16 Viator codes, "product absent from catalogue" — never serveable): 350236P1, 20572P1, 308814P5, 11779P1, 288108P1, 65756P5, 431125P10, 101001P1, 17325KEYYAN, 17984P2, 26315P9, 105290P10, 386845P1, 236733P1, 431125P5, 5608638P1, plus two more retired 2026-09 for dead health check: 343215P2 (replaced by 169791P1), 350214P1 (replaced by 242020P5) — all recorded in `RETIRED_VIATOR_PINS`, placePartnerPicks.js:361-386. HOLD-denylisted codes (never serve): 236862P2, 22211P1 (placePartnerPicks.js:453).

## E. Undercover Tourist (wf_deals rows via CJ, PID 101643573) — not JS-registry offers, ids are DB row ids

| offer_id (wf_deals id) | provider | product | maps_to | kind | fit | shown_on | source |
|---|---|---|---|---|---|---|---|
| 5 | undercover_tourist | Walt Disney World Resort admission | Walt Disney World | park-admission | family, things-to-do | PP:309 ("5"), deals.js UT_PLACE_DEAL_IDS, AL(walt-disney-world) | lib/deals.js:57; placePartnerPicks.js:309 |
| 6 | undercover_tourist | Universal Orlando Resort admission | Universal Orlando | park-admission | family, things-to-do | deals.js UT_PLACE_DEAL_IDS, AL(universal-orlando) | lib/deals.js:58 |
| 17 | undercover_tourist | Kennedy Space Center admission | Kennedy Space Center | park-admission | family, things-to-do | deals.js UT_PLACE_DEAL_IDS, AL(kennedy-space-center) | lib/deals.js:59 |
| 7 | undercover_tourist | SeaWorld Orlando admission | SeaWorld Orlando | park-admission | family | AL(seaworld-orlando), ETD(seaworld-spooktacular-2026, seaworld-orlando-christmas-2026) | affiliateLibrary.js:77; eventTicketDeals.js:42,57 |
| 13 | undercover_tourist | Gatorland admission | Gatorland | park-admission | family | AL(gatorland), ETD(gatorland-ghosts-goblins-2026) | affiliateLibrary.js:94; eventTicketDeals.js:44 |
| 14 | undercover_tourist | Discovery Cove admission | Discovery Cove | park-admission | family, date-night | AL(discovery-cove) | affiliateLibrary.js:102 |
| 15 | undercover_tourist | Busch Gardens Tampa Bay admission | Busch Gardens Tampa | park-admission | family | AL(busch-gardens-tampa), ETD(christmas-town-2026) | affiliateLibrary.js:72; eventTicketDeals.js:56 |
| 16 | undercover_tourist | LEGOLAND Florida admission | LEGOLAND Florida | park-admission | family | AL(legoland-florida), ETD(brick-or-treat-2026, legoland-fl-holidays-2026) | affiliateLibrary.js:90; eventTicketDeals.js:43,58 |
| 18 | undercover_tourist | Peppa Pig Theme Park admission | Peppa Pig Theme Park | park-admission | family | AL(peppa-pig-theme-park) | affiliateLibrary.js:106 |
| 8 | undercover_tourist | Mickey's Not-So-Scary Halloween Party ticket | Magic Kingdom | event-ticket | events, family | deals.js UT_EVENT_DEAL_IDS, ETD(mnsshp-2026) | lib/deals.js:71; eventTicketDeals.js:33 |
| 19 | undercover_tourist | Halloween Horror Nights single-night ticket | Universal Orlando | event-ticket | events, nightlife | deals.js UT_EVENT_DEAL_IDS, ETD(hhn-orlando-2026) | lib/deals.js:72; eventTicketDeals.js:38 |
| 20 | undercover_tourist | Howl-O-Scream Tampa ticket | Busch Gardens Tampa | event-ticket | events, nightlife | deals.js UT_EVENT_DEAL_IDS, ETD(howl-o-scream-tampa-2026) | lib/deals.js:73; eventTicketDeals.js:39 |
| 21 | undercover_tourist | Howl-O-Scream SeaWorld ticket | SeaWorld Orlando | event-ticket | events, nightlife | deals.js UT_EVENT_DEAL_IDS, ETD(howl-o-scream-seaworld-2026) | lib/deals.js:74; eventTicketDeals.js:40 |

## F. lib/coupons.js — standalone non-affiliate / one-off coupons (not backed by any registry above)

| offer_id | provider | merchant | area | kind | fit | shown_on | source |
|---|---|---|---|---|---|---|---|
| cpn-barracuda-bottles-beats | none (Instagram link) | Barracuda | Miami | dining-coupon | eat, nightlife, coupons | CPN | coupons.js:371 |
| cpn-geckos-19th-hole | none | Gecko's Grill & Pub (chain) | Sarasota-Manatee | dining-coupon | eat, nightlife, coupons | CPN | coupons.js:437 |
| cpn-geckos-happy-hour | none | Gecko's Grill & Pub (chain) | Sarasota-Manatee | dining-coupon | eat, nightlife, coupons | CPN | coupons.js:442 |
| cpn-geckos-bar-bingo-hillview | none | Gecko's Grill & Pub, Hillview | Sarasota | activity-coupon | nightlife, coupons | CPN | coupons.js:447 |
| cpn-pie-on-main-lunch | none | Pie On Main | Sarasota | dining-coupon | eat, coupons | CPN | coupons.js:456 |
| cpn-ringling-museums-for-all | none | The Ringling | Sarasota | activity-coupon | culture, family, coupons | CPN | coupons.js:466 |
| cpn-zootampa-heroes-summer | none | ZooTampa at Lowry Park | Tampa | activity-coupon | family, coupons | CPN | coupons.js:476 |
| cpn-ringling-free-mondays | none | The Ringling | Sarasota | activity-coupon | culture, family, coupons | CPN | coupons.js:481 |
| cpn-ringling-bluestar-military | none | The Ringling | Sarasota | activity-coupon | culture, family, coupons | CPN | coupons.js:486 |
| cpn-mote-military-free | none | Mote Marine Laboratory & Aquarium | Sarasota | activity-coupon | family, coupons | CPN | coupons.js:491 |
| cpn-marauders-thirsty-thursday | none | Bradenton Marauders / LECOM Park | Bradenton | event-ticket / activity-coupon | events, nightlife, coupons | CPN | coupons.js:502 |
| cpn-agave-bandido-taco-tuesday | none | Agave Bandido | Lakewood Ranch | dining-coupon | eat, coupons | CPN | coupons.js:511 |
| cpn-sarasota-art-museum-second-sundays | none | Sarasota Art Museum | Sarasota | activity-coupon | culture, coupons | CPN | coupons.js:516 |

(A purged Klook homepage code and two purged Viator/Discover-Sarasota cards are documented only in comments — coupons.js:386-422, 419-422, 471-474 — no longer live rows.)

## G. lib/partnerDeals.js → PARTNER_DEAL_COUPONS (feeds lib/coupons.js COUPONS array)
All 3 rows re-wrap existing registry offers already listed in section A: `tampa-deal-florida-aquarium`, `tampa-deal-adventure-island`, `orlando-deal-klook-pass` — see partnerDeals.js:33,42,59.

## H. lib/experiencesData.js — wf_experiences (Viator) as a CLASS, not enumerated
This is the "owned" Viator catalogue (`wf_experiences` table), populated nightly by a cron using `productToRow()` (experiencesData.js:106). It is **not** a hand-curated list like sections A–D; rows are selected for display by:
- **Destination** — one of 5 Florida Viator dest ids Wayfind owns (`DESTS`, experiencesData.js:19-26): `25738` Sarasota, `5403` St. Petersburg, `22457` Clearwater, `666` Tampa, `663` Orlando. `metroToDest()` (line 37) resolves any covered metro/suburb name to its nearest of these 5; `OWNED_EXPERIENCE_DEST_IDS` in intentPartnerPicks.js:592 must stay in lockstep.
- **Category tag** — 11 ground-truthed Viator `tagId`s (experiencesData.js:70-82): kayaking(12047), parasailing(20235), private(11938), historical(12029), water(20255), walking(13030), theme(11909), museums(21514), adventure(22046), airboat(11968), nature(11903). The UI's chip rail is "All" + these 11 + a "🔥 Selling out" demand chip (`LIKELY_TO_SELL_OUT` flag), with hide-empty chips.
- **Ranking** — `rankExperiences()`/`experienceWayfindScore()` (Bayesian rating+review score, no commercial signal — "Gate-2 isolation") orders any given rail; `foodTours.js`'s `FOOD_TOUR_RX` regex reclassifies ~54 of the ~1,234 rows as food/drink tours for the 3-metro cuisine sheet (orlando, tampa incl. St.Pete/Clearwater, manatee-sarasota).
- Curated picks in sections A/D/E override or supplement this pool per city/intent; `mergePartnerInventory()`/`qualifyPartnerInventory()` (intentPartnerPicks.js:548-631) merge owned-cache + live search + curated exact products into the rail actually rendered.

## I. Infrastructure / taxonomy (not offers, but load-bearing for the "next step")
- **lib/awin.js** — of 25 applied Awin programmes, only **4 are "approved" and live**: `samboat` (approvedOn 2026-08-12), `usghostadventures` (2026-08-18), `caesarsshows` (2026-08-18), `rentcars` (2026-08-18) — these back sections A's samboat/ghost/rentcars/caesars rows. All others are `status:"pending"` and emit nothing (`isAwinLive()` gate). `AWIN_CONFLICTS` documents brands deliberately NOT joined on Awin (tiqets, viator, undercovertourist, gocity, klook, ticketnetwork) because they already earn via Travelpayouts/CJ/direct PID — i.e., dedupe map, not additional inventory.
- **lib/hotelRedirect.js** — Stay22/Booking.com rule: every hotel is one anonymous `bookingHotelSearchUrl()` search-link wrapped by `stay22HotelRedirectUrl()`; there is no per-hotel offer id/registry — `kind: hotel`, `fit: stay`, surfaced via `/api/hotels/go` (also `hotelGoUrl()`/`hotelUrl()` in lib/affiliates.js).
- **lib/affiliates.js** — Ticketmaster-family rule: any ticketmaster.com/livenation/ticketweb URL is wrapped in the Impact redirect (`tmImpactLink`/`ticketOutUrl`, SID 7475855) — `kind: event-ticket`, `fit: events`; not a registry of individual events, a host-based rule. Also defines the Viator "Tickets & tours" CTA gate (`isTicketyPlace`/`SOLD_TYPES`/`FREE_LAND_TYPES`) that decides which non-curated places get a generic Viator search link (kind: other/tour, fit: things-to-do) — this is a rule, not enumerable offers. `vrboUrl()` is dark (no `NEXT_PUBLIC_VRBO_TEMPLATE` configured) — zero live VRBO offers.
- **lib/dealsData.js** — `SUBCAT_LABEL`/`DEAL_COORDS` are taxonomy for the geo-gated deals rail (`serveDeals()`), reading the **Supabase `wf_deals_ranked` table**, not a JS list — labels: theme_parks, theme_park_hotels, seasonal_events, car_rental, **movies** (label exists; no movie offer rows found anywhere in the read files — likely DB-only or currently empty), ski. `DEAL_COORDS` pins 11 named venues/regions (Disney/Universal/SeaWorld/Discovery Cove/Gatorland/KSC/LEGOLAND/Peppa Pig/Busch Gardens/Orlando/Disneyland) for the 60-mile "near you" geo-gate — these are coordinates for filtering DB rows, not offers themselves.
- **lib/homeAffiliateActivities.js** — pure ranking/filter window (30 of up to 60) over the same owned wf_experiences pool (section H), not a distinct offer set.

---

# SUMMARY

**Counts per provider** (JS-registry + Clipp + CityPASS + coupons.js standalone; excludes DB-only Viator pool and UT wf_deals rows counted separately):
- tiqets: 108
- ticketnetwork: 24
- clipp: 53 (4 markets + 49 merchant)
- klook: 6 (orlando-klook-universal-admission, merritt-island-klook-kennedy-admission, tampa-family-florida-aquarium, sarasota-family-florida-aquarium, orlando-deal-klook-pass, + tampa/sarasota-family-florida-aquarium counted once each — 6 distinct ids)
- gocity: 6 (miami-pass-gocity-explorer, orlando-pass-gocity-essentials, orlando-pass-gocity-explorer, miami-pass-gocity-all-inclusive, orlando-best-gocity-pass, nyc-best-gocity-explorer)
- awin_samboat: 4
- awin_usghostadventures: 3
- awin_rentcars: 3
- awin_caesarsshows: 1
- wegotrip: 4
- citypass: 2
- undercover_tourist: 13 distinct wf_deals ids (5,6,7,8,13,14,15,16,17,18,19,20,21)
- viator (curated picks in D, outside the wf_experiences pool): 25 product codes shown + 18 retired/held
- none (direct link, non-affiliate): 13 (coupons.js section F) + 1 Barracuda Instagram
- Ticketmaster/Impact (host-based rule, no enumerated ids): n/a
- Stay22/Booking.com (host-based rule, no enumerated ids): n/a

**Counts per kind** (approximate, across A–G):
- attraction: ~38
- museum: ~30
- venue-tickets: ~24
- zoo: ~7
- aquarium: ~9
- tour: ~19
- cruise: ~5
- park-admission: ~22 (incl. 13 UT rows)
- city-pass: 8
- boat-rental: 4
- ghost-tour: 3
- car-rental: 3
- dining-coupon: ~40
- activity-coupon: ~9
- event-ticket: 4 UT + Ticketmaster-family (rule-based, unbounded)
- hotel: rule-based (Stay22), unbounded
- movie: label exists (SUBCAT_LABEL), **zero offer rows found**
- other: n/a

**Counts per city/market** (top ones): Orlando ~45, Tampa ~40, Miami ~19, New York ~24, Chicago ~15, St. Augustine ~8, Sarasota ~20, St. Petersburg ~10, Clearwater ~9, Bradenton ~12, Key West ~4, Las Vegas 1, Kissimmee ~6, Gurnee ~2, Fort Lauderdale/Davie/Weston ~3, Daytona 1, Winter Haven ~2, Lakeland 1, Sunrise 1.

**Registered but referenced by NO rendering surface today ("dead inventory")** — present in partnerOfferRegistry.js but absent from placePartnerPicks.js, venueOffers.js, intentPartnerPicks.js, coupons.js/partnerDeals.js, and affiliateLibrary.js:
1. `bradenton-venue-freedom-factory` (partnerOfferRegistry.js:55) — explicitly noted in placePartnerPicks.js:120-122 as deliberately unpinned (too generic a brand name)
2. `miami-pass-gocity-explorer` (partnerOfferRegistry.js:58)
3. `orlando-pass-gocity-essentials` (partnerOfferRegistry.js:59)
4. `tampa-hook-golf-cart-tour` (partnerOfferRegistry.js:130)
5. `clearwater-hook-dolphin-cruise` (partnerOfferRegistry.js:138)
6. `clearwater-hook-calypso-queen` (partnerOfferRegistry.js:139)
7. `staugustine-hook-old-town-trolley` (partnerOfferRegistry.js:146)
8. `miami-tour-art-deco-south-beach` (partnerOfferRegistry.js:158)
9. `miami-tour-downtown-audio` (partnerOfferRegistry.js:159)
10. `keywest-tour-old-town-audio` (partnerOfferRegistry.js:160)
11. `orlando-tour-echoes-of-history` (partnerOfferRegistry.js:161)
12. `orlando-pass-gocity-explorer` (partnerOfferRegistry.js:167)
13. `miami-pass-gocity-all-inclusive` (partnerOfferRegistry.js:168)
14. `orlando-best-gatorland-kennedy` (partnerOfferRegistry.js:176)
15. `nyc-best-city-cards` (partnerOfferRegistry.js:273)

(`tampa-best-citypass`, partnerOfferRegistry.js:183, is referenced once — only inside affiliateLibrary.js:72's partners list for the busch-gardens-tampa merchant coverage-check — but has no place-card/intent-pick/coupon rendering surface, so it is "shown" only to the build-time coverage guard, not to a user; borderline dead.)

That's **15 fully dead + 1 borderline** out of 167 registry offers (~9-10%).

Everything in sections B (Clipp), C (CityPASS), E (UT wf_deals), F (standalone coupons.js), and G (partnerDeals.js) is actively rendered on the Coupons tab or an event/venue CTA — no dead inventory found in those sources.
