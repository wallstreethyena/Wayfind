// SERVER-ONLY curated destination registry for intent-sheet partner offers.
// Client code must import lib/intentPartnerPicks.js instead. The browser sends
// only provider + opaque offer id to /api/commerce/go; this module resolves the
// destination and the provider wrapper is applied behind that redirect.

const offer = (provider, destination, verifiedOn = "2026-08-01") =>
  Object.freeze({ provider, destination, verifiedOn });

export const PARTNER_OFFER_REGISTRY = Object.freeze({

  // ══ 2026-08-12, BATCH 2 — 15 more, and a METHOD CHANGE worth keeping.
  //
  // Slug-guessing is unnecessary and was the whole source of risk. TicketNetwork's
  // CITY HUB pages (/cities/<city>-fl-tickets) are server-rendered HTML carrying
  // both the true venue string and, in each event URL's trailing segment, the
  // CANONICAL venue slug. Extracting slugs from the hub instead of inventing them
  // removes the fuzzy-match problem at the source. Every URL below came from a hub
  // and was then confirmed against its own listing rows.
  //
  // TWO FINDINGS THIS TURNED UP:
  //   • "The BayCare Sound" IS the Coachman Park venue — renamed. That rename is
  //     exactly why the old "the-sound-at-coachman-park" slug fuzzy-matched to
  //     Del Mar, CALIFORNIA. This row is the correct Clearwater record.
  //   • "al-lopez-field" returns 200 with an echoed title and 40 rows reading
  //     "Al Hirschfeld Theatre, NEW YORK, NY". The stadium was demolished in 1989.
  //     Not wired — it is the cleanest example yet of why the title is worthless.
  //
  // Also refused: "straz-center" (alias slug — resolves to the canonical Carol
  // Morsani record below, wiring both would double-list one venue),
  // "duke-energy-center-for-the-arts" (duplicate of the Mahaffey record),
  // florida-strawberry-festival / sarasota-municipal-auditorium / bayfront-center
  // (hard 404, the last two demolished).
  "tampa-venue-straz-morsani": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/carol-morsani-hall-the-straz-center-tickets", "2026-08-12"),
  "stpete-venue-mahaffey": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/mahaffey-theater-at-the-duke-energy-center-for-the-arts-tickets", "2026-08-12"),
  "tampa-venue-orpheum": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/orpheum-tampa-tickets", "2026-08-12"),
  "tampa-venue-side-splitters": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/side-splitters-comedy-club-tickets", "2026-08-12"),
  "tampa-venue-funny-bone": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/funny-bone-comedy-club-tampa-tickets", "2026-08-12"),
  "clearwater-venue-baycare-sound": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/the-baycare-sound-tickets", "2026-08-12"),
  "clearwater-venue-capitol-theatre": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/nancy-and-david-bilheimer-capitol-theatre-tickets", "2026-08-12"),
  "sarasota-venue-mccurdys": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/mccurdys-comedy-theatre-tickets", "2026-08-12"),
  "clearwater-venue-baycare-ballpark": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/baycare-ballpark-tickets", "2026-08-12"),
  "stpete-venue-al-lang-stadium": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/al-lang-stadium-tickets", "2026-08-12"),
  // BRADENTON WAS DOWN TO ONE VENUE (LECOM Park). These four are the unlock, and
  // Bradenton is the closest real market to Parrish.
  "bradenton-venue-premier-sports-campus": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/premier-sports-campus-at-lakewood-ranch-tickets", "2026-08-12"),
  "bradenton-venue-motorsports-park": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/bradenton-motorsports-park-tickets", "2026-08-12"),
  "bradenton-venue-freedom-factory": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/freedom-factory-tickets", "2026-08-12"),
  // Go City. The /en/<city>/passes/<product> form is the reliable one; the
  // /en-us/products/ pattern 404s for Essentials. Tampa re-confirmed absent.
  "miami-pass-gocity-explorer": offer("gocity", "https://gocity.com/en/miami/passes/explorer", "2026-08-12"),
  "orlando-pass-gocity-essentials": offer("gocity", "https://gocity.com/en/orlando/passes/essentials", "2026-08-12"),

  // ══ SamBoat (Awin MID 32679) — APPROVED 2026-08-12, confirmed "Joined" in the
  // Awin dashboard the same day (US Ghost Adventures and GoToSea were checked
  // at the same time and are still Pending Approval, so they stay dark).
  //
  // All four fetched and content-verified 2026-08-12: each H1 reads "Boat rental
  // & yacht charter in <City>, United States" with real inventory listed.
  //
  // SLUGS ARE NOT PATTERN-GENERATABLE AND THIS VENDOR SOFT-404s. samboat.com
  // returns 200 for ANY unknown location slug, serving a generic worldwide
  // "Boat Rental World" page — a 1,242,393-byte fingerprint, identical every
  // time. Confirmed against a control (/boat-rental/nowhere-fake-city-xyz).
  // Dead under that signature and therefore ABSENT here: sarasota,
  // st-petersburg, anna-maria-island, bradenton, tampa-bay. Note the suffix is
  // inconsistent between live pages — "clearwater" but "key-west-usa" — so
  // never construct one.
  "tampa-boat-samboat": offer("awin_samboat", "https://www.samboat.com/boat-rental/tampa-florida", "2026-08-12"),
  "clearwater-boat-samboat": offer("awin_samboat", "https://www.samboat.com/boat-rental/clearwater", "2026-08-12"),
  "keywest-boat-samboat": offer("awin_samboat", "https://www.samboat.com/boat-rental/key-west-usa", "2026-08-12"),
  "miami-boat-samboat": offer("awin_samboat", "https://www.samboat.com/boat-rental/miami-usa", "2026-08-12"),

  // ══ 2026-08-18 — founder-approved Awin programmes (Ghost, Rentcars, Caesars).
  // Every destination below was fetched that day and confirmed BY PAGE BODY:
  // the H1 / listing names the city or airport, not merely the <title>.
  //
  // US Ghost Adventures — walking night tours. H1 on each page is
  // "Welcome To <City>'s #1 Rated Ghost Tour!".
  "staug-ghost-usghostadventures": offer("awin_usghostadventures", "https://usghostadventures.com/st-augustine-ghost-tour/", "2026-08-18"),
  "tampa-ghost-usghostadventures": offer("awin_usghostadventures", "https://usghostadventures.com/tampa-ghost-tour/", "2026-08-18"),
  "keywest-ghost-usghostadventures": offer("awin_usghostadventures", "https://usghostadventures.com/key-west-ghost-tour/", "2026-08-18"),
  //
  // Rentcars — airport car rental only. H1 names the airport (MCO / TPA / SRQ)
  // and the body lists on-airport rental companies. Direct fetch is Cloudflare
  // 403; the body was read through a browser-class fetch the same day.
  "orlando-airport-rentcars": offer("awin_rentcars", "https://www.rentcars.com/en/airports/united-states/mco-orlando-florida", "2026-08-18"),
  "tampa-airport-rentcars": offer("awin_rentcars", "https://www.rentcars.com/en/airports/united-states/tpa-tampa-florida", "2026-08-18"),
  "sarasota-airport-rentcars": offer("awin_rentcars", "https://www.rentcars.com/en/airports/united-states/srq-sarasota-bradenton-sarasota-florida", "2026-08-18"),
  //
  // Caesars Shows — Vegas only. /shows 302s to the Center Strip listing
  // (H1 "Best Las Vegas Shows on the Center Strip", named residencies in the
  // body). /las-vegas/shows/deals 302s to a hotel-deals page with almost no
  // show content — dropped, not wired.
  "vegas-shows-caesarsshows": offer("awin_caesarsshows", "https://www.caesars.com/las-vegas/shows", "2026-08-18"),

  // ══ 2026-08-12 — TRAVELPAYOUTS DEEPLINK BATCH (owner: "optimize all of the
  // tools from travelpayouts… add another 30 deeplinks where it makes sense").
  //
  // EVERY URL BELOW WAS FETCHED AND CONFIRMED BY PAGE CONTENT on 2026-08-12 —
  // the attraction/venue is named in the page BODY, not merely in the title.
  // That distinction is load-bearing for both vendors and cost us candidates:
  //
  //   • TICKETNETWORK fuzzy-matches an unrecognised slug to its nearest venue
  //     and ECHOES THE REQUESTED SLUG INTO <title> AND <h1>. "The Sound at
  //     Coachman Park" rendered a perfect Clearwater title over Del Mar, CA
  //     listings; "Sarasota Opera House" rendered over Sarasota County
  //     Fairgrounds. Both discarded. Only the listing rows ("<Venue>, <City>,
  //     <ST>") are ground truth.
  //   • TIQETS soft-404s a product requested under the WRONG city path,
  //     returning that city's hub page with a 200 — two Clearwater cruises
  //     filed under orlando-attractions-c79889 died this way and were dropped.
  //
  // Also discarded rather than guessed: Straz Center, Mahaffey, Dr. Phillips
  // (no TicketNetwork venue page), Charlotte Sports Park and Nathan Benderson
  // Park (hard 404), and all of Sarasota/Bradenton on Tiqets — that market does
  // not exist on Tiqets at all, so nobody should re-hunt it.

  // ── Tiqets · Tampa Bay corridor ──
  "tampa-hook-museum-of-art": offer("tiqets", "https://www.tiqets.com/en/tampa-museum-of-art-tickets-l269360/", "2026-08-12"),
  "tampa-hook-mosi": offer("tiqets", "https://www.tiqets.com/en/mosi-museum-of-science-industry-tickets-l209907/", "2026-08-12"),
  "tampa-hook-selfie-wrld": offer("tiqets", "https://www.tiqets.com/en/selfie-wrld-tampa-tickets-l242578/", "2026-08-12"),
  "tampa-hook-golf-cart-tour": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-tampa-guided-sightseeing-tour-in-golf-cart-p1123808/", "2026-08-12"),
  // RE-CHECKED LIVE 2026-08-12 and STILL DROPPED, confirming the 2026-08-08
  // finding rather than trusting it: the Downtown St. Petersburg Guided Tour
  // shows no price at all, and the St. Pete Beach Dolphin Racer says "We don't
  // have these tickets right now". Both pages NAME their product, so a
  // content-only check would have passed them — a commerce destination has to
  // clear the higher bar of actually being sellable.
  "stpete-hook-museum-of-history": offer("tiqets", "https://www.tiqets.com/en/st-petersburg-museum-of-history-tickets-l194208/", "2026-08-12"),
  "clearwater-hook-dolphin-cruise": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-clearwater-guided-dolphin-exploration-cruise-p1114205/", "2026-08-12"),
  "clearwater-hook-calypso-queen": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-clearwater-party-buffet-cruise-by-calypso-queen-p1096023/", "2026-08-12"),

  // ── Tiqets · day trips from the corridor ──
  // Kennedy Space Center is NOT added here. A prior session recorded the reason
  // and it still holds: the venue already sells through orlando-drive-kennedy-explore,
  // and a second KSC row would duplicate-claim it in lib/venueOffers.js. The page
  // verified fine — the conflict is ours, not theirs.
  "staugustine-hook-old-town-trolley": offer("tiqets", "https://www.tiqets.com/en/saint-augustine-attractions-c122690/tickets-for-hop-on-hop-off-st-augustine-old-town-trolley-p976311/", "2026-08-12"),

  // ── TicketNetwork · venue pages, /e/ path only (see the fuzzy-match note) ──
  "tampa-venue-yuengling-center": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/yuengling-center-tickets", "2026-08-12"),
  "tampa-venue-tampa-theatre": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/historic-duncan-auditorium-at-tampa-theatre-tickets", "2026-08-12"),
  "sunrise-venue-amerant-bank-arena": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/amerant-bank-arena-tickets", "2026-08-12"),

  // ── WeGoTrip · self-guided audio tours ──
  // The city segment is the soft-404 risk here: wegotrip.com/miami-d31/ returns
  // 200 for Victor Harbor, AUSTRALIA. The -dNNNNNNN city id is authoritative and
  // was taken from product-sitemap.xml, never constructed. Product ids DO 404
  // correctly, so only the city segment needed proving.
  "miami-tour-art-deco-south-beach": offer("wegotrip", "https://wegotrip.com/miami-d4164138/south-beach-in-miami-exploring-american-rivieras-timeless-art-deco-charm-p3221/", "2026-08-12"),
  "miami-tour-downtown-audio": offer("wegotrip", "https://wegotrip.com/miami-d4164138/miami-downtown-audio-tour-p27109/", "2026-08-12"),
  "keywest-tour-old-town-audio": offer("wegotrip", "https://wegotrip.com/key-west-d4160812/key-west-easy-stroll-or-bike-self-guided-audio-tour-through-the-heart-of-downtown-p1143/", "2026-08-12"),
  "orlando-tour-echoes-of-history": offer("wegotrip", "https://wegotrip.com/orlando-d4167147/discover-orlandos-past-a-self-guided-audio-tour-p8221/", "2026-08-12"),

  // ── Go City · passes ──
  // Go City has NO Tampa product (gocity.com/en/tampa is a hard 404) and lists
  // only Miami and Orlando in Florida. ZooTampa is sold as an attraction INSIDE
  // the Orlando pass — never present it as a Tampa pass.
  "orlando-pass-gocity-explorer": offer("gocity", "https://gocity.com/en/orlando/passes/explorer", "2026-08-12"),
  "miami-pass-gocity-all-inclusive": offer("gocity", "https://gocity.com/en/miami/passes/all-inclusive", "2026-08-12"),
  // Orlando — exact products verified in the provider browser on 2026-08-01.
  "orlando-date-night-sealife-andretti": offer("tiqets", "https://www.tiqets.com/en/sea-life-orlando-andretti-indoor-karting-b44735/"),
  "orlando-family-wonderworks-crayola": offer("tiqets", "https://www.tiqets.com/en/wonderworks-orlando-crayola-experience-b2784/"),
  "orlando-tonight-sealife": offer("tiqets", "https://www.tiqets.com/en/orlando-attractions-c79889/tickets-for-sea-life-orlando-p976215/"),
  "orlando-drive-kennedy-explore": offer("tiqets", "https://www.tiqets.com/en/merritt-island-attractions-c79867/tickets-for-ksc-explore-tour-p1034813/"),
  "orlando-hidden-chocolate-kingdom": offer("tiqets", "https://www.tiqets.com/en/orlando-attractions-c79889/tickets-for-chocolate-kingdom-factory-tour-p979525/"),
  "orlando-budget-iride-trolley": offer("tiqets", "https://www.tiqets.com/en/orlando-attractions-c79889/tickets-for-i-ride-trolley-0rlando-p1011971/"),
  "orlando-best-gatorland-kennedy": offer("tiqets", "https://www.tiqets.com/en/gatorland-orlando-kennedy-space-center-b1321/"),
  "orlando-best-gocity-pass": offer("gocity", "https://gocity.com/en/orlando/passes/all-inclusive"),

  // Tampa Bay + Sarasota market. The Klook aquarium product is the useful
  // destination behind the owner's older unlabelled short link; this replaces
  // the generic/no-sub-id placement with a server-tracked offer id.
  "tampa-family-florida-aquarium": offer("klook", "https://www.klook.com/en-US/activity/159925-the-florida-aquarium-ticket/"),
  "tampa-best-citypass": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-tampa-bay-citypass-p1002067/"),
  "tampa-hidden-plant-museum": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-henry-b-plant-museum-p1006254/"),
  "tampa-date-dali-museum": offer("tiqets", "https://www.tiqets.com/en/the-salvador-dali-museum-tickets-l233216/"),
  "tampa-drive-clearwater-aquarium": offer("tiqets", "https://www.tiqets.com/en/clearwater-marine-aquarium-tickets-l147957/"),
  "tampa-budget-plant-museum": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-henry-b-plant-museum-p1006254/"),
  "tampa-deal-florida-aquarium": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-the-florida-aquarium-entry-p975440/"),
  "tampa-deal-adventure-island": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-adventure-island-tampa-bay-p1016749/"),
  // Coverage-gap fill 2026-08-01: Tampa had no "tonight" pick. The Clearwater
  // buffet-cruise candidate first considered was confirmed dead ("Temporarily
  // unavailable" on its own product page and on the Tampa cruises collection
  // page) — this sunset cruise was checked in both places and is "Available
  // today" with a real evening departure, so it replaces that candidate rather
  // than shipping a guessed slug.
  "tampa-tonight-sunset-cruise": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-clearwater-sunset-cruise-with-champagne-p1114271/"),
  "sarasota-date-van-wezel": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/van-wezel-performing-arts-hall-tickets", "2026-08-12"),

  // TicketNetwork FL venue pages, added 2026-08-11 (CJ advertiser 2288710
  // active). Every slug below was fetched that day and verified BY CONTENT —
  // the page title names the venue ("Amalie Arena Tickets 2026 |
  // TicketNetwork") — never by status code alone. Straz Center, Mahaffey and
  // Dr. Phillips Center were WANTED but have no TicketNetwork venue page under
  // any tried slug (404): dropped rather than guessed, per the WeGoTrip
  // soft-404 lesson. Evergreen venue pages (no price/discount claims), so no
  // expiry robots — the commerce redirect fails soft if a page dies.
  "tampa-venue-amalie-arena": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/benchmark-international-arena-tickets", "2026-08-12"),
  "tampa-venue-raymond-james-stadium": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/raymond-james-stadium-tickets", "2026-08-12"),
  "tampa-venue-steinbrenner-field": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/george-m-steinbrenner-field-tickets", "2026-08-12"),
  "tampa-venue-midflorida-amphitheatre": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/midflorida-credit-union-amphitheatre-at-the-florida-state-fairgrounds-tickets", "2026-08-12"),
  "clearwater-venue-ruth-eckerd-hall": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/ruth-eckerd-hall-tickets", "2026-08-12"),
  "stpete-venue-jannus-live": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/jannus-live-tickets", "2026-08-12"),
  "stpete-venue-tropicana-field": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/tropicana-field-tickets", "2026-08-12"),
  "bradenton-venue-lecom-park": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/lecom-park-tickets", "2026-08-12"),
  "sarasota-venue-ed-smith-stadium": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/ed-smith-stadium-tickets", "2026-08-12"),
  "orlando-venue-kia-center": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/kia-center-tickets", "2026-08-12"),
  "orlando-venue-camping-world-stadium": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/camping-world-stadium-tickets", "2026-08-12"),
  "orlando-venue-hard-rock-live": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/hard-rock-live-orlando-tickets", "2026-08-12"),
  "orlando-venue-house-of-blues": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/house-of-blues-orlando-tickets", "2026-08-12"),
  "orlando-venue-addition-financial-arena": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/addition-financial-arena-tickets", "2026-08-12"),
  // portcharlotte-venue-charlotte-sports-park REMOVED 2026-08-12. Not a
  // re-path: the venue record is retired on TicketNetwork. /e/ 404s under every
  // slug tried and the legacy page renders "No events available" — a card that
  // sent a tap to an empty page. Consistent with the Rays having left it as
  // their spring-training home. Do not re-add without a content-verified page.

  "lakeland-venue-publix-field": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/publix-field-at-joker-marchant-stadium-tickets", "2026-08-12"),
  "staug-venue-amphitheatre": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/st-augustine-amphitheatre-tickets", "2026-08-12"),
  "tampa-venue-ritz-ybor": offer("ticketnetwork", "https://www.ticketnetwork.com/e/venues/the-ritz-ybor-tickets", "2026-08-12"),
  "sarasota-drive-dali-museum": offer("tiqets", "https://www.tiqets.com/en/the-salvador-dali-museum-tickets-l233216/"),
  "parrish-best-dali-museum": offer("tiqets", "https://www.tiqets.com/en/the-salvador-dali-museum-tickets-l233216/"),
  "sarasota-family-florida-aquarium": offer("klook", "https://www.klook.com/en-US/activity/159925-the-florida-aquarium-ticket/"),
  "orlando-deal-klook-pass": offer("klook", "https://www.klook.com/en-US/activity/81445-klook-pass-orlando/"),

  // ── Tampa Bay + Orlando attraction ticket hooks. 20 venues, each opened in
  // the Tiqets browser on 2026-08-07 and confirmed live/bookable with a real
  // price and same-window availability before shipping. Candidates that read
  // "we don't have these tickets right now" (St Pete Dolphin Racer) or showed
  // no price at all (Downtown St Pete tour, Wild Florida) were dropped rather
  // than guessed — CLAUDE.md, "assert on the response body, not the status
  // code". Kennedy Space Center is deliberately absent here: the venue already
  // sells through orlando-drive-kennedy-explore above, and a second KSC row
  // would duplicate-claim the venue in lib/venueOffers.js. Each id below is
  // wired to its exact place card by lib/venueOffers.js (geo-gated Book-it) and
  // lib/placePartnerPicks.js (place-card disclosure).
  "tampa-hook-zootampa": offer("tiqets", "https://www.tiqets.com/en/zootampa-at-lowry-park-tickets-l146461/", "2026-08-07"),
  "tampa-hook-busch-gardens": offer("tiqets", "https://www.tiqets.com/en/busch-gardens-tampa-bay-tickets-l146323/", "2026-08-07"),
  "tampa-hook-glazer-childrens": offer("tiqets", "https://www.tiqets.com/en/glazer-childrens-museum-tickets-l149342/", "2026-08-07"),
  "tampa-hook-dinosaur-world": offer("tiqets", "https://www.tiqets.com/en/dinosaur-world-florida-tickets-l158120/", "2026-08-07"),
  "stpete-hook-imagine-museum": offer("tiqets", "https://www.tiqets.com/en/saint-petersburg-attractions-c79928/tickets-for-imagine-museum-p1030117/", "2026-08-07"),
  "stpete-hook-floridarama": offer("tiqets", "https://www.tiqets.com/en/floridarama-tickets-l223732/", "2026-08-07"),
  "orlando-hook-aquatica": offer("tiqets", "https://www.tiqets.com/en/aquatica-orlando-tickets-l182935/", "2026-08-07"),
  "orlando-hook-boggy-creek": offer("tiqets", "https://www.tiqets.com/en/boggy-creek-airboat-adventures-tickets-l147816/", "2026-08-07"),
  "orlando-hook-central-florida-zoo": offer("tiqets", "https://www.tiqets.com/en/central-florida-zoo-botanical-gardens-tickets-l166468/", "2026-08-07"),
  "orlando-hook-wonderworks": offer("tiqets", "https://www.tiqets.com/en/wonderworks-orlando-tickets-l146485/", "2026-08-07"),
  "orlando-hook-icon-park": offer("tiqets", "https://www.tiqets.com/en/icon-park-tickets-l147005/", "2026-08-07"),
  "orlando-hook-andretti": offer("tiqets", "https://www.tiqets.com/en/andretti-indoor-karting-games-tickets-l147993/", "2026-08-07"),
  "daytona-hook-speedway": offer("tiqets", "https://www.tiqets.com/en/daytona-international-speedway-tickets-l186400/", "2026-08-07"),
  "winterhaven-hook-legoland": offer("tiqets", "https://www.tiqets.com/en/legoland-florida-park-tickets-l147672/", "2026-08-07"),
  "orlando-hook-gatorland": offer("tiqets", "https://www.tiqets.com/en/gatorland-orlando-tickets-l147632/", "2026-08-07"),
  "orlando-hook-seaworld": offer("tiqets", "https://www.tiqets.com/en/seaworld-orlando-tickets-l146322/", "2026-08-07"),
  "orlando-hook-crayola": offer("tiqets", "https://www.tiqets.com/en/crayola-experience-tickets-l149277/", "2026-08-07"),
  "winterhaven-hook-peppa-pig": offer("tiqets", "https://www.tiqets.com/en/peppa-pig-theme-park-florida-tickets-l271834/", "2026-08-07"),
  "orlando-hook-fun-spot": offer("tiqets", "https://www.tiqets.com/en/fun-spot-america-orlando-tickets-l147463/", "2026-08-07"),
  "kissimmee-hook-fun-spot": offer("tiqets", "https://www.tiqets.com/en/fun-spot-america-kissimmee-tickets-l147461/", "2026-08-07"),

  // New York — exact Tiqets collection/product pages verified 2026-08-01.
  "nyc-date-liberty-sunset-cruise": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-new-york-statue-of-liberty-sunset-cruise-p1093659/"),
  "nyc-family-amnh": offer("tiqets", "https://www.tiqets.com/en/american-museum-of-natural-history-amnh-tickets-l145532/"),
  "nyc-tonight-harbor-lights": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-new-york-harbor-lights-cruise-p974212/"),
  "nyc-hidden-artechouse": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-artechouse-new-york-p1009619/"),
  "nyc-drive-bronx-zoo": offer("tiqets", "https://www.tiqets.com/en/bronx-zoo-tickets-l146581/"),
  "nyc-best-city-cards": offer("tiqets", "https://www.tiqets.com/en/new-york-city-cards-l200067/"),
  "nyc-best-gocity-explorer": offer("gocity", "https://gocity.com/en/new-york/passes/explorer"),
  // Coverage-gap fill 2026-08-01: NYC had no "budget" pick. Standalone entry,
  // not the $72.99 One World Observatory bundle — confirmed "Available today"
  // on its own Tiqets product page.
  "nyc-budget-911-memorial": offer("tiqets", "https://www.tiqets.com/en/the-9-11-memorial-museum-tickets-l145772/"),

  // NYC place-card hooks, 2026-08-01. Sourced from Tiqets' own "Top 30 New
  // York" catalogue (shared to the owner's Drive same day by a Tiqets
  // partner-team address) and re-verified one by one in the provider browser
  // before shipping — the catalogue names the product and product id, never
  // the bookability or the live URL slug, so nothing here rides on the
  // catalogue's say-so alone. All four landed live with a real "Check
  // availability" CTA and a real price at verification time.
  "nyc-hook-empire-state": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-empire-state-building-express-entry-p975073/"),
  "nyc-hook-one-world-observatory": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-one-world-observatory-skip-all-lines-p975392/"),
  "nyc-hook-vessel-hudson-yards": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-vessel-at-hudson-yards-p993581/"),
  "nyc-hook-summit-vanderbilt": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-summit-one-vanderbilt-skip-the-line-ticket-guided-tour-p1110089/"),

  // ── 2026-08-08 attraction ticket hooks, batch 2 (owner ask: "+50 affiliate
  // deeplinks"). Every URL below was fetched on 2026-08-08 and confirmed to be
  // the exact venue/product page with a real from-price and same-window
  // availability. Guessed slugs REDIRECT to a generic city hub on Tiqets —
  // several candidates did exactly that during this harvest and were dropped,
  // along with "temporarily unavailable" / no-price / distant-availability
  // pages (Museum of Illusions Orlando, Museum of Sex NYC, Miami Seaquarium,
  // Guggenheim, Luna Park Coney Island, St. Augustine Oldest Store, all
  // Disney/Universal per-park pages). Venue l-pages preferred over p-products
  // so the link survives individual product churn.
  //
  // Orlando metro
  "orlando-hook-madame-tussauds": offer("tiqets", "https://www.tiqets.com/en/madame-tussauds-orlando-tickets-l147178/", "2026-08-08"),
  "orlando-hook-titanic-exhibition": offer("tiqets", "https://www.tiqets.com/en/titanic-the-artifact-exhibition-orlando-tickets-l172706/", "2026-08-08"),
  "orlando-hook-dezerland-park": offer("tiqets", "https://www.tiqets.com/en/dezerland-park-orlando-tickets-l214407/", "2026-08-08"),
  "orlando-hook-discovery-cove": offer("tiqets", "https://www.tiqets.com/en/discovery-cove-tickets-l146487/", "2026-08-08"),
  "orlando-hook-orlando-eye": offer("tiqets", "https://www.tiqets.com/en/the-wheel-at-icon-park-tm-tickets-l176406/", "2026-08-08"),
  "orlando-hook-ripleys": offer("tiqets", "https://www.tiqets.com/en/ripley-s-believe-it-or-not-orlando-tickets-l237035/", "2026-08-08"),
  "kissimmee-hook-island-h2o": offer("tiqets", "https://www.tiqets.com/en/island-h2o-live-tickets-l161122/", "2026-08-08"),
  "kissimmee-hook-old-town": offer("tiqets", "https://www.tiqets.com/en/old-town-kissimmee-tickets-l169108/", "2026-08-08"),
  "kenansville-hook-wild-florida": offer("tiqets", "https://www.tiqets.com/en/wild-florida-tickets-l146938/", "2026-08-08"),

  // Miami metro (incl. Davie / Fort Lauderdale / Weston)
  "miami-hook-zoo-miami": offer("tiqets", "https://www.tiqets.com/en/zoo-miami-tickets-l145816/", "2026-08-08"),
  "miami-hook-jungle-island": offer("tiqets", "https://www.tiqets.com/en/jungle-island-tickets-l255383/", "2026-08-08"),
  "miami-hook-frost-science": offer("tiqets", "https://www.tiqets.com/en/phillip-patricia-frost-museum-of-science-tickets-l220490/", "2026-08-08"),
  "miami-hook-paradox-museum": offer("tiqets", "https://www.tiqets.com/en/paradox-museum-miami-tickets-l199242/", "2026-08-08"),
  "miami-hook-wynwood-walls": offer("tiqets", "https://www.tiqets.com/en/wynwood-walls-tickets-l235862/", "2026-08-08"),
  "miami-hook-superblue": offer("tiqets", "https://www.tiqets.com/en/superblue-miami-tickets-l193660/", "2026-08-08"),
  "miami-hook-museum-ice-cream": offer("tiqets", "https://www.tiqets.com/en/museum-of-ice-cream-miami-tickets-l250318/", "2026-08-08"),
  "miami-hook-skyviews-wheel": offer("tiqets", "https://www.tiqets.com/en/skyviews-miami-observation-wheel-tickets-l203589/", "2026-08-08"),
  "miami-hook-museum-of-sex": offer("tiqets", "https://www.tiqets.com/en/museum-of-sex-tickets-l233553/", "2026-08-08"),
  "miami-hook-historymiami": offer("tiqets", "https://www.tiqets.com/en/historymiami-museum-tickets-l209757/", "2026-08-08"),
  "miami-hook-deering-estate": offer("tiqets", "https://www.tiqets.com/en/deering-estate-tickets-l229415/", "2026-08-08"),
  "miami-hook-everglades-safari-park": offer("tiqets", "https://www.tiqets.com/en/everglades-safari-park-tickets-l243018/", "2026-08-08"),
  "miami-hook-museum-of-graffiti": offer("tiqets", "https://www.tiqets.com/en/museum-of-graffiti-tickets-l181891/", "2026-08-08"),
  "davie-hook-flamingo-gardens": offer("tiqets", "https://www.tiqets.com/en/flamingo-gardens-tickets-l145813/", "2026-08-08"),
  "ftl-hook-everglades-holiday-park": offer("tiqets", "https://www.tiqets.com/en/everglades-holiday-park-tickets-l267067/", "2026-08-08"),
  "weston-hook-sawgrass-park": offer("tiqets", "https://www.tiqets.com/en/sawgrass-recreation-park-tickets-l145812/", "2026-08-08"),

  // Chicago metro (incl. Gurnee)
  "chicago-hook-skydeck": offer("tiqets", "https://www.tiqets.com/en/willis-tower-tickets-l145807/", "2026-08-08"),
  "chicago-hook-360-chicago": offer("tiqets", "https://www.tiqets.com/en/360-chicago-john-hancock-center-tickets-l145818/", "2026-08-08"),
  "chicago-hook-shedd-aquarium": offer("tiqets", "https://www.tiqets.com/en/chicago-attractions-c80816/tickets-for-shedd-aquarium-p976804/", "2026-08-08"),
  "chicago-hook-field-museum": offer("tiqets", "https://www.tiqets.com/en/the-field-museum-tickets-l150530/", "2026-08-08"),
  "chicago-hook-adler-planetarium": offer("tiqets", "https://www.tiqets.com/en/adler-planetarium-tickets-l209652/", "2026-08-08"),
  "chicago-hook-art-institute": offer("tiqets", "https://www.tiqets.com/en/the-art-institute-of-chicago-tickets-l147373/", "2026-08-08"),
  "chicago-hook-navy-pier-wheel": offer("tiqets", "https://www.tiqets.com/en/navy-pier-chicago-tickets-l146602/", "2026-08-08"),
  "chicago-hook-flyover": offer("tiqets", "https://www.tiqets.com/en/flyover-chicago-tickets-l237959/", "2026-08-08"),
  "chicago-hook-balloon-museum": offer("tiqets", "https://www.tiqets.com/en/balloon-museum-chicago-tickets-l269294/", "2026-08-08"),
  "chicago-hook-color-factory": offer("tiqets", "https://www.tiqets.com/en/color-factory-chicago-tickets-l253156/", "2026-08-08"),
  "chicago-hook-museum-ice-cream": offer("tiqets", "https://www.tiqets.com/en/chicago-attractions-c80816/tickets-for-museum-of-ice-cream-chicago-p1033768/", "2026-08-08"),
  "chicago-hook-museum-of-illusions": offer("tiqets", "https://www.tiqets.com/en/museum-of-illusions-chicago-tickets-l203898/", "2026-08-08"),
  "chicago-hook-mca": offer("tiqets", "https://www.tiqets.com/en/museum-of-contemporary-art-mca-tickets-l146381/", "2026-08-08"),
  "gurnee-hook-six-flags": offer("tiqets", "https://www.tiqets.com/en/six-flags-great-america-tickets-l189862/", "2026-08-08"),
  "gurnee-hook-hurricane-harbor": offer("tiqets", "https://www.tiqets.com/en/hurricane-harbor-chicago-tickets-l248283/", "2026-08-08"),

  // New York
  "nyc-hook-top-of-the-rock": offer("tiqets", "https://www.tiqets.com/en/30-rockefeller-plaza-tickets-l145554/", "2026-08-08"),
  "nyc-hook-museum-of-illusions": offer("tiqets", "https://www.tiqets.com/en/museum-of-illusions-new-york-tickets-l206250/", "2026-08-08"),
  "nyc-hook-madame-tussauds": offer("tiqets", "https://www.tiqets.com/en/madame-tussauds-new-york-tickets-l146991/", "2026-08-08"),
  "nyc-hook-moma": offer("tiqets", "https://www.tiqets.com/en/the-museum-of-modern-art-moma-tickets-l145518/", "2026-08-08"),
  "nyc-hook-riseny": offer("tiqets", "https://www.tiqets.com/en/riseny-tickets-l197614/", "2026-08-08"),
  "nyc-hook-ny-aquarium": offer("tiqets", "https://www.tiqets.com/en/new-york-aquarium-tickets-l146582/", "2026-08-08"),
  "nyc-hook-museum-ice-cream": offer("tiqets", "https://www.tiqets.com/en/museum-of-ice-cream-new-york-tickets-l168778/", "2026-08-08"),

  // St. Augustine (drive-radius day-trip corridor from the Orlando metro)
  "staug-hook-pirate-museum": offer("tiqets", "https://www.tiqets.com/en/st-augustine-pirate-treasure-museum-tickets-l146930/", "2026-08-08"),
  "staug-hook-aquarium": offer("tiqets", "https://www.tiqets.com/en/st-augustine-aquarium-tickets-l222443/", "2026-08-08"),
  "staug-hook-shipwreck-museum": offer("tiqets", "https://www.tiqets.com/en/st-augustine-shipwreck-museum-tickets-l197155/", "2026-08-08"),
  "staug-hook-history-museum": offer("tiqets", "https://www.tiqets.com/en/st-augustine-history-museum-tickets-l146908/", "2026-08-08"),
});

// Sarasota's remaining gaps (tonight, hidden-gems, budget, best-of) are filled
// in lib/intentPartnerPicks.js directly against real wf_experiences rows
// (provider "viator"), not through this registry — see PROVIDERS.viator in
// lib/commerceProviders.js: Viator offer ids resolve as a live product_code
// lookup against our own table, which already carries link_ok/fail_count
// verification, rather than a hand-pasted destination URL here.

export function partnerOfferById(id, provider) {
  const row = PARTNER_OFFER_REGISTRY[String(id || "")] || null;
  if (!row || (provider && row.provider !== provider)) return null;
  return row;
}
