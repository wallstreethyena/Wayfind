// lib/creatorVideos.js — curated creator-video associations (Phase 1).
//
// UGC social proof + creator referral on the place DETAIL SHEET, which is a
// noindex client surface (see app/p/[id]/page.js:32). So a featured creator's
// benefit HERE is clicks/traffic to their video, not SEO — we credit them by
// handle and link out to their real video, keeping the referrer so the visit
// attributes to Wayfind in their analytics. NO JSON-LD lives here; VideoObject /
// ItemList schema is exclusively a /trending/[city] concern (Phase 2/3, indexable).
//
// Keyed to the SAME id the app already uses for a place (place.id — a Google
// place_id, an "fsq:..." id, or a synthetic id; stored verbatim, prefix included).
// Hand-curated entries that don't carry an id may match by name (+ an optional
// city token), which keeps curation practical. Client-safe, zero deps.

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// Presentation per platform: color + label only (the card renders the play
// affordance). No per-platform emoji-as-chrome, consistent with the redesign.
export const PLATFORM = {
  tiktok: { label: "TikTok", color: "#FF0050" },
  instagram: { label: "Instagram", color: "#E1306C" },
  youtube: { label: "YouTube", color: "#FF0000" },
  facebook: { label: "Facebook", color: "#1877F2" },
};

// v6.93 — the "r,g,b" triplet twin of PLATFORM[x].color, for CSS custom
// properties (box-shadow can't take a #hex through a var() directly). Kept
// as a literal map, not computed at runtime, so it can never drift silently
// out of sync with a hand-checked value — 4 platforms, cheap to keep exact.
export const PLATFORM_RGB = {
  tiktok: "255,0,80",
  instagram: "225,48,108",
  youtube: "255,0,0",
  facebook: "24,119,242",
};

// Each entry: { key, placeId?, match?: { name, city? }, videos: [video, ...] }
//   video: { platform, url, creator?, caption?, thumbnail?, views?, postedAt? }
// `key` is a stable id the server-only lib/trending.js joins on (so blurbs/addresses
// for the indexable pages live there, not in this client-bundled module).
// A place resolves its curated videos by placeId first, then by name (+ city token).
// `caption` is ALWAYS Wayfind's own words, never the creator's verbatim caption
// (copyright + duplicate-content); the credit + link-out is how the creator benefits.
const CURATED = [
  {
    key: "spinning-coffee-bradenton",
    match: { name: "Spinning Coffee", city: "Bradenton" },
    videos: [
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@cindy.selects/video/7661821646973586702",
        creator: "cindy.selects",
        caption: "A local creator's visit to this Bradenton coffee spot.",
      },
    ],
  },
  {
    // Mai-Kai (Fort Lauderdale) — seeds the multi-city flow. Keyed by name+city;
    // resolving the Google Place ID + upserting wf_place_ids is deferred (blocked
    // by the Places-429 / no local key). TODO(curation): the Facebook share link
    // carries no handle — supply the creator's name/handle to complete the credit.
    key: "mai-kai-fort-lauderdale",
    match: { name: "Mai-Kai", city: "Fort Lauderdale" },
    videos: [
      {
        platform: "facebook",
        url: "https://www.facebook.com/share/r/1EPX6DN118/",
        // creator: TODO — no handle in the share URL; do not fabricate.
        caption: "Fort Lauderdale's tiki landmark since 1956: a Polynesian dinner show, reservations required.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // v5.98 — July-2026 creator-video research. Matched to VERIFIED venues by
  // name+city (NEVER the aggregator slug — those are wrong: Juicy's/Sweet Krunch
  // mis-mapped to "jiggs-landing", the drag strip to "lecom-park"). Entries with a
  // real `url` render + boost now; entries with url:"" are STAGED (a curator opens
  // evidenceUrl, finds the creator's actual post, fills `url` + confirms platform).
  // A staged entry never renders (renderable() drops url:"") — never link a user to
  // the aggregator instead of the creator. captions are ALWAYS Wayfind's own words.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── RENDER NOW (real native creator URLs) ──
  { key: "marie-selby-sarasota", match: { name: "Marie Selby Botanical Gardens", city: "Sarasota" },
    address: "1534 Mound St, Sarasota, FL 34236", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@thefloridaqueenie_/video/7358206182676352298", creator: "thefloridaqueenie_", views: "756K", caption: "A local creator's visit to these downtown Sarasota bayfront gardens." }] },
  { key: "perspire-lakewood-ranch", match: { name: "Perspire Sauna Studio", city: "Sarasota" },
    address: "309 N Cattlemen Rd, Sarasota, FL 34232", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@theerynlalonde/video/7593470206069017870", creator: "theerynlalonde", views: "390", caption: "A creator's infrared-sauna session at this Lakewood Ranch-area studio." }] },

  // ── FOOD (staged: url:"" until the native post is captured) ──
  { key: "juicys-famous-fair-food-bradenton", match: { name: "Juicy's Famous Fair Food", city: "Bradenton" },
    address: "2319 Cortez Rd W, Bradenton, FL 34207", category: "Food",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/jiggs-landing-preserve-r3UWTa1H", needsNativeUrl: true, creator: "camargz", views: "1,004,129", caption: "A creator's run through the burgers and fair-food classics at this Bradenton spot." },
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/jiggs-landing-preserve-r3UWTa1H", needsNativeUrl: true, creator: "l3xiluthor", views: "403,180", caption: "A local's taste test of the funnel cakes, corn dogs, and fried Oreos here." }] },
  { key: "los-laureles-supermarket-bradenton", match: { name: "Los Laureles Supermarket", city: "Bradenton" },
    address: "2424 Manatee Ave E, Bradenton, FL 34208", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/palma-sola-causeway-park-EQCElueU", needsNativeUrl: true, creator: "camargz", views: "314,602", caption: "A creator's take on the authentic Mexican tacos from this Bradenton market's taqueria." }] },
  { key: "sweet-krunch-bradenton", match: { name: "Sweet Krunch", city: "Bradenton" },
    address: "5605 Manatee Ave W, Bradenton, FL 34209", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/jiggs-landing-preserve-r3UWTa1H", needsNativeUrl: true, creator: "camargz", views: "106,107", caption: "A creator's visit for the Korean fried chicken at this West Bradenton spot." }] },
  { key: "wingstop-bradenton", match: { name: "Wingstop", city: "Bradenton" },
    address: "3553 1st St E, Bradenton, FL 34208", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/old-main-street-bradenton-YdfX6sGz", needsNativeUrl: true, creator: "flossakushie", views: "7.4M", caption: "A creator reacts to Wingstop's wings.", warning: "'Food REACTION' video — often NOT filmed at the venue. Confirm it's an actual visit before it renders." }] },
  { key: "pier-22-bradenton", match: { name: "Pier 22", city: "Bradenton" },
    address: "1200 1st Ave W, Bradenton, FL 34205", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/bradenton-riverwalk-eG-mq5BW", needsNativeUrl: true, creator: "beachsammy", views: "1.6K", caption: "A creator's stop for calamari, oysters, and steak at this downtown Bradenton waterfront restaurant." }] },
  { key: "la-violetta-sarasota", match: { name: "La Violetta", city: "Sarasota" },
    address: "4837 Swift Rd Ste 100, Sarasota, FL 34231", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/marcello-ristorante-6Ph63Fen", needsNativeUrl: true, creator: "thecrazycreativeteacher", views: "64.1K", caption: "A creator's visit to this rustic Italian restaurant in Sarasota." }] },
  { key: "michelles-brown-bag-cafe-sarasota", match: { name: "Michelle's Brown Bag Cafe", city: "Sarasota" },
    address: "630 S Orange Ave, Sarasota, FL 34236", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/burns-court-sarasota-cRLOcPRK", needsNativeUrl: true, creator: "thesarasotalocals", views: "83K", caption: "A local's bagel-and-lunch stop at this downtown Sarasota cafe." }] },
  { key: "project-coffee-sarasota", match: { name: "Project Coffee", city: "Sarasota" }, note: "TWO locations (also 1419 5th St) - disambiguate",
    address: "538 S Pineapple Ave, Sarasota, FL 34236", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/sarasota/rosemary-district-Kl0KoiLK", needsNativeUrl: true, creator: "makayluhhhhh", views: "3.2K", caption: "A creator's order of strawberry matcha and a mocha at this Sarasota coffee shop." }] },
  { key: "ofkors-bakery-sarasota", match: { name: "OfKors Bakery", city: "Sarasota" }, note: "TWO locations (also 3945 Cattlemen Rd) - disambiguate",
    address: "1359 Main St, Sarasota, FL 34236", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/main-street-sarasota--rMBNiqp", needsNativeUrl: true, creator: "inna_revega", views: "1.8K", caption: "A creator's visit for blini, sandwiches, and desserts at this Sarasota European bakery." }] },
  { key: "arts-and-central-sarasota", match: { name: "Arts & Central", city: "Sarasota" },
    address: "611 Central Ave, Sarasota, FL 34236", category: "Food",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/sarasota/rosemary-district-Kl0KoiLK", needsNativeUrl: true, creator: "sarasotarealtorkatrin", views: "4K", caption: "A creator's night out for American food and cocktails in Sarasota's Rosemary District." },
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/sarasota/rosemary-district-Kl0KoiLK", needsNativeUrl: true, creator: "srqtiff", views: "2.7K", caption: "A creator's look at the art-inspired menu at this Rosemary District restaurant." }] },
  { key: "tide-tables-cortez", match: { name: "Tide Tables Restaurant and Marina", city: "Cortez" }, note: "City is Cortez, not Holmes Beach",
    address: "12507 Cortez Rd W, Cortez, FL 34215", category: "Food",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/holmes-beach/tide-tables-restaurant-and-marina-GdciCRDd", needsNativeUrl: true, creator: "pinkpalmettotravelclub", views: "27.6K", caption: "A creator's waterfront meal of grouper and peel-and-eat shrimp in Cortez." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/holmes-beach/tide-tables-restaurant-and-marina-GdciCRDd", needsNativeUrl: true, creator: "michaelrenick3", views: "23.6K", caption: "A creator's plate of grouper and key lime pie at this Cortez marina restaurant." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/holmes-beach/tide-tables-restaurant-and-marina-GdciCRDd", needsNativeUrl: true, creator: "mickeyguru_shalon", views: "2.8K", caption: "A creator's grouper bites with a waterfront view in Cortez." }] },
  { key: "star-fish-company-cortez", match: { name: "Star Fish Company", city: "Cortez" }, note: "City is Cortez",
    address: "12306 46th Ave W, Cortez, FL 34215", category: "Food",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/cortez-historic-fishing-village-bboCou8V", needsNativeUrl: true, creator: "sarahsoutdooradventuresfl", views: "17.1K", caption: "A creator's Cortez seafood guide featuring this dockside fish market." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/cortez-historic-fishing-village-bboCou8V", needsNativeUrl: true, creator: "movemetolwr", views: "8.1K", caption: "A creator's fresh dockside seafood stop at this Cortez market." }] },
  { key: "dry-dock-longboat-key", match: { name: "Dry Dock Waterfront Grill", city: "Longboat Key" }, note: "City is Longboat Key, not Sarasota",
    address: "412 Gulf of Mexico Dr, Longboat Key, FL 34228", category: "Food",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/dry-dock-waterfront-grill-RUvJLGtJ", needsNativeUrl: true, creator: "godfatherofmeat", views: "10.6K", caption: "A creator's waterfront dining pick on Longboat Key." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/dry-dock-waterfront-grill-RUvJLGtJ", needsNativeUrl: true, creator: "beachsammy", views: "7K", caption: "A creator's Longboat Key waterfront restaurant roundup." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/dry-dock-waterfront-grill-RUvJLGtJ", needsNativeUrl: true, creator: "explorewithmedaily", views: "2.6K", caption: "A quick creator visit to this Longboat Key waterfront grill." }] },
  { key: "tookies-and-treats-ellenton", match: { name: "Tookies & Treats", city: "Ellenton" },
    address: "5355 Factory Shops Blvd, Ellenton, FL 34222", category: "Food",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/ellenton/ellenton-premium-outlets--uQsdLV_", needsNativeUrl: true, creator: "tookiesandtreats", views: "53.5K", caption: "A look at the scratch-made cookies and cobblers at this Ellenton bakery.", warning: "@tookiesandtreats is the bakery's OWN account - business self-promo, not independent-creator UGC. Label as the venue's own post or hold." }] },
  // aqua-tequila-parrish / @juliefranklinteam REMOVED (owner, 2026-08-02):
  // "this link is not accurate it take me to a home now agua tequila we
  // should remove it." Confirmed live — @juliefranklinteam is a real-estate
  // team account (the avatar is literally their realty logo); the TikTok
  // "photo" post the creator->venue match pointed at was a home listing, not
  // Aqua Tequila. This is exactly the failure this entry's own note warned
  // about when it was staged: "creator->venue match is inferred. Confirm
  // before render." It rendered before anyone confirmed it, and the
  // inference was wrong. Deleted rather than re-staged — no evidence this
  // creator ever actually posted about the restaurant.

  // ── NIGHTLIFE (staged) ──
  { key: "olearys-tiki-bar-sarasota", match: { name: "O'Leary's Tiki Bar", city: "Sarasota" },
    address: "5 Bayfront Dr, Sarasota, FL 34236", category: "Nightlife",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/lido-key-tiki-bar-t97vUvtd", needsNativeUrl: true, creator: "explorewithmedaily", views: "107K", caption: "A creator's visit to this bayfront tiki bar in Sarasota." }] },

  // ── ACTIVITIES / ATTRACTIONS (staged) ──
  { key: "myakka-river-state-park", match: { name: "Myakka River State Park", city: "Sarasota" },
    address: "13208 State Road 72, Sarasota, FL 34241", category: "Activities",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/myakka-river-state-park-0OHjRrkg", needsNativeUrl: true, creator: "followmeaway", views: "2.1M", caption: "A creator's wildlife and alligator encounter at this Sarasota state park." }] },
  { key: "siesta-beach-sarasota", match: { name: "Siesta Beach", city: "Sarasota" }, note: "distinct from Siesta Key Village",
    address: "948 Beach Rd, Sarasota, FL 34242", category: "Activities",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", needsNativeUrl: true, creator: "thingstodotampabay", views: "1.8M", caption: "A creator's guide to Siesta Key's famous public beach." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", needsNativeUrl: true, creator: "sarasotajenn", views: "591.1K", caption: "A local's Siesta Key beach day and exploration." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", needsNativeUrl: true, creator: "paolamorenou_", views: "542.8K", caption: "A creator's take on Siesta Beach as a low-cost Florida day out." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", needsNativeUrl: true, creator: "danaystojeiro", views: "415.6K", caption: "A creator's guide to Siesta Beach." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", needsNativeUrl: true, creator: "thingstodo.florida", views: "272.0K", caption: "A creator's walkthrough of Siesta Key Beach." }] },
  { key: "siesta-key-village", match: { name: "Siesta Key Village", city: "Sarasota" }, note: "district, not one venue",
    address: "Ocean Blvd & Canal Rd, Sarasota, FL 34242", category: "Shopping",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", needsNativeUrl: true, creator: "thingstodotampabay", views: "678.7K", caption: "A creator's tour of the shops and dining in Siesta Key Village." }] },
  { key: "gamble-plantation-ellenton", match: { name: "Gamble Plantation Historic State Park", city: "Ellenton" },
    address: "3708 Patten Ave, Ellenton, FL 34222", category: "Activities",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/ellenton/gamble-plantation-historic-state-park-UYNCdJeC", needsNativeUrl: true, creator: "historical.cheese", views: "806.3K", caption: "A creator's visit to this antebellum historic site in Ellenton." }] },
  { key: "ca-dzan-the-ringling-sarasota", match: { name: "Ca' d'Zan", city: "Sarasota" }, note: "inside The Ringling estate, not standalone",
    address: "5401 Bay Shore Rd, Sarasota, FL 34243", category: "Activities",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/ca-dzan-CqHZzLpb", needsNativeUrl: true, creator: "everencephotography", views: "607.4K", caption: "A creator's sunset shots of the Ca' d'Zan mansion at The Ringling." },
      { platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/ca-dzan-CqHZzLpb", needsNativeUrl: true, creator: "thefloridaqueenie_", views: "392.2K", caption: "A creator's visit to The Ringling and the Ca' d'Zan mansion." }] },
  { key: "robinson-preserve-bradenton", match: { name: "Robinson Preserve", city: "Bradenton" },
    address: "1704 99th St NW, Bradenton, FL 34209", category: "Activities",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/riverview-pointe-preserve-H64Bu1wa", needsNativeUrl: true, creator: "mustseeflorida", views: "246.2K", caption: "A creator's outdoor and family guide to this Bradenton nature preserve." }] },
  { key: "st-armands-circle-sarasota", match: { name: "St. Armands Circle", city: "Sarasota" }, note: "district, not one venue",
    address: "300 Madison Dr, Sarasota, FL 34236", category: "Shopping",
    videos: [{ platform: "tiktok", url: "", evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/st-armands-circle-gNqAAyh8", needsNativeUrl: true, creator: "sarasota_fl_living", views: "89.9K", caption: "A local's roundup of restaurants around St. Armands Circle." }] },
  { key: "bradenton-motorsports-park", match: { name: "Bradenton Motorsports Park", city: "Bradenton" }, note: "NOT LECOM Park (baseball). 'FL2K' is an event held here.",
    address: "21000 State Road 64 E, Bradenton, FL 34212", category: "Activities",
    videos: [
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", needsNativeUrl: true, creator: "jairmr2", views: "607.6K", caption: "A creator's day at the FL2K drag-racing event at Bradenton Motorsports Park." },
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", needsNativeUrl: true, creator: "f90.0li", views: "447.8K", caption: "A creator's FL2K drag-racing experience at this Bradenton strip." },
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", needsNativeUrl: true, creator: "racingflorida", views: "201.8K", caption: "A creator's drag-racing run at Bradenton Motorsports Park." },
      { platform: "tiktok", url: "", evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", needsNativeUrl: true, creator: "visions_chronicles", views: "160.2K", caption: "A creator's FL2K car experience at this Bradenton drag strip." }] },

  // ═══════════════════════════════════════════════════════════════════════════
  // v6.91 (2026-08-02) — owner-directed batch, the "Wayfind found another..." /
  // "Wayfind hasn't missed yet" @cindy.selects series (a real, ongoing creator
  // partnership — Cindy is running her own content specifically crediting
  // Wayfind as the discovery source). Every entry below: video opened and its
  // on-video location tag read directly (not inferred from the caption text),
  // address verified against a live business-directory listing, RENDER NOW
  // (real native TikTok URLs, not staged). match.name deliberately uses the
  // shortest safe root token for each business — apostrophes and "&"/"and"
  // normalize inconsistently across sources (norm() turns punctuation into a
  // bare space, not nothing), so a longer exact-looking name can silently fail
  // the substring match against however Wayfind's own place-name string is
  // actually punctuated. The city gate (cityMatches) carries the rest of the
  // disambiguation weight.
  // ═══════════════════════════════════════════════════════════════════════════
  { key: "jabal-coffee-house-orlando", match: { name: "Jabal Coffee House", city: "Orlando" },
    address: "8335 S John Young Pkwy, Orlando, FL 32819", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7668348057171365133", creator: "cindy.selects", caption: "A creator's iced coffee order at this Orlando coffee shop, a stop she didn't expect to find in the plaza it's tucked into." }] },
  { key: "dolce-and-bake-orlando", match: { name: "Dolce", city: "Orlando" }, note: "Match root kept short — the business appears as both \"Dolce & Bake\" and \"Dolce and Bake Cafe/Bakery\" across sources, and the city gate (Orlando) is what actually excludes the unrelated Dolce Bakery & Cafe in Kissimmee, a different business at a different address.",
    address: "8143 S John Young Pkwy, Orlando, FL", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7667937697171885326", creator: "cindy.selects", caption: "A creator's cappuccino and pastry stop at this Orlando café and bakery." }] },
  { key: "seek-first-coffee-shop-orlando", match: { name: "Seek First", city: "Orlando" }, note: "Formerly \"But First Coffee Shop\" — some directories/ordering pages still carry the old name at the same Pine Castle address.",
    address: "7726 Winegard Rd, Orlando, FL 32809", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7668826743108537613", creator: "cindy.selects", caption: "A creator's flan latte order at this Pine Castle-area Orlando coffee shop." }] },
  { key: "neuroplay-sensory-playroom-orlando", match: { name: "NeuroPlay", city: "Orlando" },
    address: "6220 Hazeltine National Dr #111, Orlando, FL 32822", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7669065801369914638", creator: "cindy.selects", caption: "A parent creator's visit to this Orlando indoor sensory playroom built for toddlers." }] },
  { key: "ryans-coffee-house-parrish", match: { name: "Ryan", city: "Parrish" }, note: "Root kept to \"Ryan\" — norm() turns the apostrophe in \"Ryan's\" into a space, which can break a longer substring match depending on how Wayfind's own place-name string is punctuated.",
    address: "8231 US-301, Parrish, FL 34219", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7664006021349723405", creator: "cindy.selects", caption: "A creator's order of a salted caramel mocha and a maple-gouda melt at this Parrish coffee house." }] },
  { key: "joy-coffee-bradenton", match: { name: "Joy Coffee", city: "Bradenton" },
    address: "4524 14th St W, Bradenton, FL 34207", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7662923109749640461", creator: "cindy.selects", caption: "A creator's iced Joy Latte and coffee cake stop at this Bradenton coffee shop, which also has a toddler play area." }] },

  // ═══════════════════════════════════════════════════════════════════════════
  // v6.94 (2026-08-02, owner: "add these influencers... the more we have these
  // the more we will gain the respect from the users") — three new creator
  // partnerships, same verification bar as the cindy.selects batch above:
  // every reel opened and read directly (own real captions, own real
  // addresses given by the creator or cross-checked against a live
  // business-directory listing), RENDER NOW (real native Instagram reel/post
  // URLs — canonical /reel/<id>/ or /p/<id>/ form, no username prefix, so
  // lib/videoEmbed.js's regex actually resolves an embeddable player).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── @katelynintampa — "Katelyn | Tampa Local Guide" (Tampa / St. Pete) ──
  { key: "catrinas-tacos-tampa", match: { name: "Catrina's Tacos", city: "Tampa" },
    address: "1611 N Howard Ave, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DZS1ZQGpK77/", creator: "katelynintampa", caption: "A creator's visit to this taco spot tucked inside a 1905 former Bank of Tampa building." }] },
  { key: "lucky-tigre-tampa", match: { name: "Lucky Tigre", city: "Tampa" },
    address: "1901 N Howard Ave, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DYkwpV9Rr6Y/", creator: "katelynintampa", caption: "A creator's tasting of the Filipino-inspired menu at this West Tampa restaurant." }] },
  { key: "palaus-restaurant-tampa", match: { name: "Palaus Restaurant", city: "Tampa" },
    address: "2301 N Armenia Ave, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DbTYFQupyxt/", creator: "katelynintampa", caption: "A creator's whole fried yellowtail snapper, hand-picked and fried to order, at this Tampa Cuban restaurant." }] },
  { key: "atomic-cat-st-petersburg", match: { name: "Atomic Cat", city: "St. Petersburg" },
    address: "10387 Gandy Blvd N, St. Petersburg, FL 33702", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DbHSDSmpR6r/", creator: "katelynintampa", caption: "A creator's stop at this retro 70s-themed coffee shop in St. Petersburg." }] },
  { key: "ro-hyde-park-tampa", match: { name: "Ro Hyde Park", city: "Tampa" },
    address: "1500 W Swann Ave, Tampa, FL 33606", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DbDuqRGpOal/", creator: "katelynintampa", caption: "A creator's lunch omakase at this Hyde Park sushi restaurant." }] },

  // ── @fashion.eat.travel — "Ara Ayala, Travel & Food, FL" (Miami) ──
  { key: "boulan-wynwood-miami", match: { name: "Boulan", city: "Miami" }, note: "Root kept to \"Boulan\" — norm() strips the accent on Boûlan's û, so the accented form can silently fail a substring match depending on how Wayfind's own place-name string is encoded.",
    address: "69 NW 24th St, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/Dbihv67xOtC/", creator: "fashion.eat.travel", caption: "A creator's slow-morning coffee and pastry stop at this European-style Wynwood cafe." }] },
  { key: "mayfair-grill-miami", match: { name: "Mayfair Grill", city: "Miami" },
    address: "3000 Florida Ave, Coconut Grove, Miami, FL 33133", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbgRMv0lcsL/", creator: "fashion.eat.travel", caption: "A creator's Miami Spice tasting menu at this Coconut Grove restaurant." }] },
  { key: "el-churrascaso-miami-lakes", match: { name: "El Churrascaso", city: "Miami Lakes" },
    address: "7419 Miami Lakes Dr, Miami Lakes, FL 33014", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/Dbdac7kxq5l/", creator: "fashion.eat.travel", caption: "A creator's Brazilian steakhouse spread, meats served by the pound, at this Miami Lakes spot." }] },

  // ── @neverboredinorlando (Central Florida day trips near Orlando) ──
  { key: "silver-moon-drive-in-lakeland", match: { name: "Silver Moon Drive-In", city: "Lakeland" },
    address: "4100 New Tampa Hwy, Lakeland, FL 33815", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DYDJ0rxJA8K/", creator: "neverboredinorlando", caption: "A creator's retro drive-in date night at this 75-year-old Lakeland theater, one of only four left in Florida." }] },
  { key: "catboat-clermont", match: { name: "Catboat Clermont", city: "Clermont" },
    address: "10354 Cypress Cove Ln, Clermont, FL 34711", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DVymPmojQ0x/", creator: "neverboredinorlando", caption: "A creator's self-driven mini-boat tour across the Clermont Chain of Lakes." }] },
  { key: "old-sugar-mill-pancake-house-de-leon-springs", match: { name: "Old Sugar Mill Pancake House", city: "De Leon Springs" },
    address: "601 Ponce De Leon Blvd, De Leon Springs, FL 32130", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DUx0WfhDSxh/", creator: "neverboredinorlando", caption: "A creator's cook-your-own pancake brunch inside De Leon Springs State Park's old sugar mill." }] },
  { key: "main-street-pizza-kissimmee", match: { name: "Main Street Pizza", city: "Kissimmee" },
    address: "16 Broadway, Kissimmee, FL 34741", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DbdVdP4g75L/", creator: "neverboredinorlando", caption: "A creator's attempt at Florida's biggest pizza, a 36-inch Monster, at this downtown Kissimmee pizzeria." }] },

  // ── EXCLUDE (do not add) ──
  // Caddy's Bradenton (801 Riverside Dr E) — PERMANENTLY CLOSED (~Mar 2026). @beachsammy 2.4K.
  //   Do not feature a closed venue. Brand still operates elsewhere — drop this address only.
  // @terranandcassie "Bradenton fishing/sunset" 212.4K — no venue identified. Hold until a
  //   native post pins a real place.
];

function cityMatches(place, locName, city) {
  if (!city) return true;
  const hay = norm([place && place.city, place && place.address, locName].filter(Boolean).join(" "));
  return hay.includes(norm(city));
}

// RENDER SAFETY (v5.98): most researched entries are STAGED with url:"" +
// evidenceUrl + needsNativeUrl:true — a curator fills the real creator-post url
// before they go live. Only videos with a real, non-empty url are ever returned,
// so a staged entry (a) never renders a broken link-out to "" and (b) never counts
// as "has a video" for the ranking boost (an invisible-video boost would break the
// "no paid placement, ranked on real reviews" promise). A staged entry auto-appears
// AND auto-boosts the moment its url is filled — no other code change needed.
function renderable(videos) {
  return (videos || []).filter((v) => v && typeof v.url === "string" && v.url.trim().length > 0);
}

// Curated videos for a stable entry key (used by the server-only trending pages,
// which own the place blurbs/addresses and join to videos on this key).
export function videosByKey(key) {
  const e = CURATED.find((x) => x.key === key);
  return e ? renderable(e.videos) : [];
}

// Curated creator videos for a place (possibly empty). `locName` is the app's
// current location label, used only to corroborate a name-based city match.
export function creatorVideosFor(place, locName) {
  if (!place) return [];
  const pid = place.id != null ? String(place.id) : "";
  const nm = norm(place.name);
  for (const e of CURATED) {
    if (e.placeId && pid && String(e.placeId) === pid) return renderable(e.videos);
    if (e.match && nm) {
      const cnm = norm(e.match.name);
      if (cnm && nm.includes(cnm) && cityMatches(place, locName, e.match.city)) return renderable(e.videos);
    }
  }
  return [];
}

// v6.93 — "the Social Media Find bookshelf" (owner). The library today only
// has real coverage in a handful of Florida metros (see CURATED above); a
// visitor outside all of them should see an honest "not here yet, but here's
// where" recommendation instead of nothing. Grouped by the SAME match.city
// token creatorVideosFor() gates on, counting curated PLACES (not videos —
// a place with 3 videos from 3 creators is still one spot to visit), staged
// (url:"") entries excluded since they don't render anywhere yet.
export function regionsWithFinds() {
  const byCity = new Map();
  for (const e of CURATED) {
    const city = e.match && e.match.city;
    if (!city || !renderable(e.videos).length) continue;
    byCity.set(city, (byCity.get(city) || 0) + 1);
  }
  return Array.from(byCity, ([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

// v6.93 — creator "profile" stats for the Social Media Find sheet: every
// curated, renderable spot a given creator (by handle, case-insensitive) has
// been featured at, so the sheet can say "cindy.selects — 7 spots featured"
// instead of just the one place the user tapped in from. Never rehosts the
// creator's own photo (CREATOR_VIDEO_SPEC.md) — callers render an initials
// avatar and link out to the creator's real profile instead.
export function creatorStats(handle) {
  if (!handle) return { handle: null, count: 0, spots: [] };
  const h = norm(handle);
  const spots = [];
  for (const e of CURATED) {
    const vids = renderable(e.videos).filter((v) => v.creator && norm(v.creator) === h);
    if (vids.length) spots.push({ key: e.key, name: (e.match && e.match.name) || e.key, city: (e.match && e.match.city) || "", video: vids[0] });
  }
  return { handle, count: spots.length, spots };
}

// v6.93 — "this shelf needs to have all of the influencers in our app easy
// to see, all organized nicely, in one page" (owner). The full library
// directory for the Social Media Find sheet's "See all" view: every
// renderable curated video, grouped by creator (one row per real handle,
// most-featured first), plus a separate bucket for the rare entry with no
// creator handle to credit (e.g. a Facebook share link with none in it —
// "do not fabricate" a name for it, per the entry's own note). Each spot
// keeps its real `video` object so a caller can either link straight out to
// it or, if the place happens to already be loaded nearby, open the full
// Social Find sheet for it (matched by video.url — the one thing guaranteed
// unique per entry).
// v6.94 — city centroids for the curated regions above, used ONLY to order
// the "browse by location" default view nearest-you-first (owner: "make
// image 1 the default... organized by location... let the user see
// everything going on" — fixing the hero card defaulting into one repeated
// creator's single video). Real, public city-center coordinates, not an
// estimate of any one venue's location — so this never claims a precision
// ("0.3 mi") it cannot back up, same fail-closed spirit as beachMilesFrom()
// in lib/beaches.js. No coordinate here is ever shown to a user, only used
// to SORT.
const CITY_COORDS = {
  Orlando: { lat: 28.5384, lng: -81.3789 },
  Bradenton: { lat: 27.4989, lng: -82.5748 },
  Sarasota: { lat: 27.3364, lng: -82.5307 },
  Parrish: { lat: 27.5942, lng: -82.4257 },
  "Fort Lauderdale": { lat: 26.1224, lng: -80.1373 },
  // v6.94 — added alongside the first katelynintampa / fashion.eat.travel /
  // neverboredinorlando curated entries so spotsByCity() can place their real
  // cities honestly instead of falling back to alphabetical.
  Tampa: { lat: 27.9506, lng: -82.4572 },
  "St. Petersburg": { lat: 27.7676, lng: -82.6403 },
  Miami: { lat: 25.7617, lng: -80.1918 },
  "Miami Lakes": { lat: 25.9098, lng: -80.3153 },
  Lakeland: { lat: 28.0395, lng: -81.9498 },
  Clermont: { lat: 28.5494, lng: -81.7729 },
  "De Leon Springs": { lat: 29.1247, lng: -81.3593 },
  Kissimmee: { lat: 28.2920, lng: -81.4076 },
};

function haversineMi(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// v6.94 — "Browse by location" default view. Every renderable curated spot,
// grouped by city, cities ordered nearest-`center`-first when center is
// available (else alphabetically — never a fabricated "near you" claim
// without real coordinates to back it up). This is what the consolidated
// hero card now opens into by default, instead of one specific creator's
// single video.
export function spotsByCity(center) {
  const byCity = new Map();
  for (const e of CURATED) {
    const city = e.match && e.match.city;
    const vids = renderable(e.videos);
    if (!city || !vids.length) continue;
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push({ key: e.key, name: e.match.name, city, video: vids[0] });
  }
  const cLat = center && typeof center.lat === "number" ? center.lat : null;
  const cLng = center && typeof center.lng === "number" ? center.lng : null;
  const groups = Array.from(byCity, ([city, spots]) => {
    const coords = CITY_COORDS[city];
    const distMi = cLat != null && cLng != null && coords ? haversineMi(cLat, cLng, coords.lat, coords.lng) : null;
    return { city, spots, distMi };
  });
  groups.sort((a, b) => {
    if (a.distMi != null && b.distMi != null) return a.distMi - b.distMi;
    if (a.distMi != null) return -1;
    if (b.distMi != null) return 1;
    return a.city.localeCompare(b.city);
  });
  return groups;
}

export function allCreators() {
  const byHandle = new Map();
  const unattributed = [];
  for (const e of CURATED) {
    for (const v of renderable(e.videos)) {
      const spot = { key: e.key, name: (e.match && e.match.name) || e.key, city: (e.match && e.match.city) || "", platform: v.platform, video: v };
      if (v.creator) {
        const h = norm(v.creator);
        if (!byHandle.has(h)) byHandle.set(h, { handle: v.creator, spots: [] });
        byHandle.get(h).spots.push(spot);
      } else {
        unattributed.push(spot);
      }
    }
  }
  const creators = Array.from(byHandle.values())
    .map((c) => ({ handle: c.handle, count: c.spots.length, spots: c.spots }))
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));
  return { creators, unattributed };
}

// v6.94 — one-line stats for the CONSOLIDATED hero card (owner: "she already
// found it" teaser + "X more creators / N spots"). Built from allCreators()/
// regionsWithFinds() rather than recomputed independently, so the hero card
// teaser and the full directory can never disagree about the numbers.
export function libraryStats() {
  const { creators, unattributed } = allCreators();
  const distinctSpots = new Set();
  for (const c of creators) for (const s of c.spots) distinctSpots.add(s.key);
  for (const s of unattributed) distinctSpots.add(s.key);
  return {
    topCreator: creators[0] || null,
    creatorCount: creators.length,
    spotCount: distinctSpots.size,
    cityCount: regionsWithFinds().length,
  };
}
