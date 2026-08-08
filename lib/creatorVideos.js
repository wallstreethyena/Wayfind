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
  // v6.95 (owner: "for facebook also and tiktok instagram and even x we need
  // to fetch from everywhere") — white, not a "brand blue," because that's
  // X's own actual mark on a dark surface (their dark-mode UI is white on
  // black); every other platform here gets a saturated hue that reads at a
  // glance, and white still reads clean for pill text/borders/glow without
  // pretending X has a color it doesn't.
  x: { label: "X", color: "#FFFFFF" },
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
  x: "255,255,255",
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
  { key: "ryans-coffee-house-parrish", placeId: "ChIJo_IdHf0lw4gRHDbQNKBRE84", match: { name: "Ryan", city: "Parrish" }, displayName: "Ryan's Coffee House", note: "2026-08-08 (owner: video not showing up): shipped without a placeId, relying entirely on the name+city PASS 2 fallback — which only fires for a place already in whatever pool Google's nearby search happened to load for that visitor. Confirmed via a live /api/places/search text query (this route, server-keyed) that the business is real, open, and correctly typed [\"coffee_shop\",\"cafe\",...] at this exact address — nothing wrong with the listing itself, just no placeId to resolve it once loaded. Root kept to \"Ryan\" for the PASS 2 fallback path (still useful if this ID is ever superseded) — norm() turns the apostrophe in \"Ryan's\" into a space, which can break a longer substring match depending on how Wayfind's own place-name string is punctuated. displayName carries the human label the sheet shows.",
    address: "8231 US-301, Parrish, FL 34219", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7664006021349723405", creator: "cindy.selects", caption: "A creator's order of a salted caramel mocha and a maple-gouda melt at this Parrish coffee house." }] },
  // ── 2026-08-08 batch: @manateelittlelocals + @parrishfloridahomes ─────────
  //
  // PROVENANCE, because it is unusual and worth stating. TikTok and Instagram
  // both refuse automated fetching (robots.txt), so the captions behind these
  // entries were read through the owner's own logged-in browser, and every
  // placeId below was then resolved by CALLING this app's own
  // /api/places/search against the venue named in the caption. Nothing here is
  // inferred from a URL: a shortcode carries no venue, and a video pinned to
  // the wrong business would hand that business an unearned +0.7.
  //
  // SIX of the owner's eighteen TikToks are deliberately NOT here:
  //   • 7666145500608957726 — a product/restock post, no venue at all
  //   • 7638649545693416735 — Pass-a-Grille Beach resolves to a NEIGHBORHOOD
  //     with no rating; no rating means no Wayfind Score, so the boost has
  //     nothing to attach to
  //   • 7648309733404724510 — "Frankie's, an Italian deli in Southwest
  //     Florida" resolves to Riverview, which is Tampa, not southwest Florida.
  //     Plausible is not verified.
  //   • 7669122397286452511 (Wildcore Club), 7661786767351188767 (Whitney's),
  //     7650713334408285470 (SkyBeach Resort) — no unambiguous Google match
  // Each needs one line from the owner naming the venue, then it lands.
  { key: "gamble-creek-farms-parrish", placeId: "ChIJfUYeWmAlw4gReflS439GCg0", match: { name: "Gamble Creek", city: "Parrish" }, displayName: "Gamble Creek Farms",
    address: "14950 Golf Course Rd, Parrish, FL 34219", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@parrishfloridahomes/video/7625665948711718158", creator: "parrishfloridahomes", caption: "A local realtor's visit to this Parrish farm for farm-fresh goods and sunflowers." }] },
  { key: "mote-sea-aquarium-sarasota", placeId: "ChIJRyOEfAo5w4gR664aD_YYBLU", match: { name: "Mote Science Education Aquarium", city: "Sarasota" }, displayName: "Mote Science Education Aquarium (SEA)",
    address: "225 University Town Center Dr, Sarasota, FL 34243", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7647673425548430605", creator: "manateelittlelocals", caption: "A family creator's walk through the sharks, jellyfish and sea turtle rehab at the UTC aquarium." }] },
  { key: "bishop-museum-bradenton", placeId: "ChIJr7ec9tEXw4gRwicCx3wfH2w", match: { name: "Bishop Museum", city: "Bradenton" }, displayName: "The Bishop Museum of Science and Nature",
    address: "201 10th St W, Bradenton, FL 34205", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7649896505108598047", creator: "manateelittlelocals", caption: "A local family flags the free-admission weekends for Manatee County residents at this Bradenton science museum." }] },
  { key: "eleanors-coffee-cakes-palmetto", placeId: "ChIJHR5ndAAXw4gR8YMNFEoI_f0", match: { name: "Eleanors Coffee", city: "Palmetto" }, displayName: "Eleanors Coffee & Cakes",
    address: "449 10th Ave W, Palmetto, FL 34221", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7651059904530205982", creator: "manateelittlelocals", caption: "A creator's coffee stop inside the historic 1912 Palmetto building." }] },
  { key: "heritage-harbour-park-bradenton", placeId: "ChIJhTVjs3o7w4gRzLPhLiXpCXs", match: { name: "Heritage Harbour Park", city: "Bradenton" }, displayName: "Heritage Harbour Park",
    address: "Bradenton, FL 34212", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7656593993286913311", creator: "manateelittlelocals", caption: "A family creator's find: a fully fenced park tucked behind the Target and Costco on State Road 64." }] },
  { key: "northeast-venice-park-nokomis", placeId: "ChIJFaUWcgBbw4gRDb7B9bck8OU", match: { name: "Northeast Venice Park", city: "Nokomis" }, displayName: "Northeast Venice Park",
    address: "3560 Laurel Rd E, Nokomis, FL 34275", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7652542591308729631", creator: "manateelittlelocals", caption: "A family creator's first look at this newly opened park near Venice." }] },
  { key: "lakewood-ranch-library-bradenton", placeId: "ChIJ_wDB-_Mxw4gR7-VDggiDis0", match: { name: "Lakewood Ranch Library", city: "Bradenton" }, displayName: "Lakewood Ranch Library",
    address: "16410 Rangeland Pkwy, Bradenton, FL 34211", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7665365282323582238", creator: "manateelittlelocals", caption: "A family creator's free rainy-day option: the children's wing at the Lakewood Ranch library." }] },
  { key: "aleur-event-collective-sarasota", placeId: "ChIJh3AM9dxBw4gRhaIkp0z8rQE", match: { name: "ALEUR", city: "Sarasota" }, displayName: "ALEUR-Event Collective",
    address: "1001 Central Ave, Sarasota, FL 34236", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7666837987786820895", creator: "manateelittlelocals", caption: "A creator's night at a women-owned-business gathering held at this Sarasota event space." }] },
  { key: "jj-foxs-treehouse-bradenton", placeId: "ChIJeTU_Lhk9w4gRYtxmZ9i_yP4", match: { name: "JJ Fox", city: "Bradenton" }, displayName: "JJ Fox's Treehouse",
    address: "907 57th St E, Bradenton, FL 34208", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7662469985997983006", creator: "manateelittlelocals", caption: "A family creator's indoor escape from the heat at this Bradenton play space." }] },
  { key: "capybara-cafe-st-petersburg", placeId: "ChIJHTdUDQT9wogRB5cYNqzhm_E", match: { name: "Capybara Cafe", city: "St. Petersburg" }, displayName: "Capybara Cafe",
    address: "4703 Park St N, St. Petersburg, FL 33709", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7618749588236668191", creator: "manateelittlelocals", caption: "A family creator's up-close visit with the capybaras and kangaroos at this St. Pete animal experience." }] },
  { key: "hogans-place-gibsonton", placeId: "ChIJi0X6m8_RwogRmw_ipYjNjpc", match: { name: "Hogan's Place", city: "Gibsonton" }, displayName: "Hogan's Place",
    address: "7023 Gibsonton Dr, Gibsonton, FL 33534", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7643181676293639455", creator: "manateelittlelocals", caption: "A family creator's visit during baby-animal season at this farm south of Tampa." }] },
  { key: "popstroke-sarasota", placeId: "ChIJATacWyI5w4gR-qfYvgyJnfk", match: { name: "PopStroke", city: "Sarasota" }, displayName: "PopStroke",
    address: "195 University Town Center Dr, Sarasota, FL 34243", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7667009868250877214", creator: "manateelittlelocals", caption: "A family creator's morning meetup at the UTC putting course." }] },
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


  // ════════════════════════════════════════════════════════════════════════════
  // v6.96 (2026-08-06, owner: "lets make sure to link these instagram influencer
  // and add the places like we have been ... make sure the places receive a b[o]ost
  // due to the influencer video") — @alexandramartin_tv, 20 reels, all South Florida.
  //
  // EVERY entry carries a REAL Google placeId. That is new, and it is the point.
  // Until this batch, curated Miami entries matched by NAME only, and no Miami
  // place existed in wf_inventory at all — so creatorVideosFor() never matched a
  // feed place, and app/home.js's VIDEO_BOOST (45) had nothing to apply to. The
  // three fashion.eat.travel Miami entries above had been in that state since
  // v6.94. Fixed at the root, in this order: (1) unlocked the miami metro via the
  // app's own /api/city/unlock (90 places + 145 Viator experiences), (2) resolved
  // all 20 venues through the app's own /api/places/search to real place_ids,
  // (3) upserted them through the canonical wf_add_inventory_place RPC as
  // source='creator_curation'. Verified live: wf_best_picks(25.7617,-80.1918)
  // returns every one of them.
  //
  // CAPTIONS ARE WAYFIND'S OWN WORDS, as everywhere else in this file — her real
  // captions are her copyright and would be duplicate content. Each line below
  // keeps the SPECIFIC thing she actually showed (the Sunday-only market, the
  // walk-up window, oxtail on Saturdays) because that detail is what makes a
  // recommendation worth reading. The credit + link-out is how she benefits.
  // ════════════════════════════════════════════════════════════════════════════

  // ── @alexandramartin_tv — South Florida food + hidden gems ──
  // NOTE on ordering: the entry for the venue literally named "PASTA" is placed
  // BEFORE "Borti Pasta Bar" ON PURPOSE, and must stay there. norm("pasta") is a
  // substring of norm("borti pasta bar"), so under the old first-match-wins
  // matcher this order actively mis-attributes Borti's reel to PASTA. That is
  // exactly what we want the arrangement to do: it makes the collision REAL in
  // the data, so scripts/check-creator-video-boost.mjs genuinely fails if anyone
  // reintroduces order-dependent matching. Ordering these "safely" would hide
  // the bug from the guard written to catch it.
  { key: "pasta-wynwood-miami", placeId: "ChIJN_06nHi32YgRySCC7mR6HUM", match: { name: "PASTA", city: "Miami" },
    address: "124 NW 28th St, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY7khOvx34K/", creator: "alexandramartin_tv", reach: 3400, caption: "A creator's date-night plate at this Wynwood room that came from Peru, where every noodle is made from scratch." }] },
  { key: "borti-pasta-bar-miami", placeId: "ChIJy5C9Qk2x2YgRe4lg1zuS8iA", match: { name: "Borti", city: "Miami" },
    address: "8300 NE 2nd Ave, Miami, FL 33138", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DalR3Xxxavv/", creator: "alexandramartin_tv", reach: 2400, caption: "A creator's carbonara, cooked at the pass with the chef, at this Miami pasta bar." }] },
  { key: "charlatam-miami", placeId: "ChIJsQI4pFG32YgRu9buf2FGB94", match: { name: "Charlatam", city: "Miami" },
    address: "2525 SW 3rd Ave, Miami, FL 33129", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbbyA0xN0PG/", creator: "alexandramartin_tv", reach: 545, caption: "A creator's fried chicken and BBQ ribs at this Latin American kitchen just off Brickell — built for a group table." }] },
  { key: "la-tiendita-ii-miami-beach", placeId: "ChIJ61FPT4W02YgRkJQX7JyuJx0", match: { name: "La Tiendita", city: "Miami Beach" },
    address: "414 16th St, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8ArSoxGca/", creator: "alexandramartin_tv", reach: 885, caption: "A creator's Peruvian sandwich from this tiny South Beach market — a takeout counter three blocks from the sand." }] },
  { key: "wat-buddharangsi-homestead", placeId: "ChIJYTi0cLTC2YgRe4PpurmXWQM", match: { name: "Wat Buddharangsi", city: "Homestead" },
    address: "15200 SW 240th St, Homestead, FL 33032", category: "Activities",
    note: "City token is \"Homestead\" — what the temple is universally known by and what people search. Google's formatted address returns the postal designation \"Princeton, FL 33032\". Recorded so the call is checkable rather than opaque; attribution keys on placeId, so the token only affects directory grouping.",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZtB5VGRQJW/", creator: "alexandramartin_tv", reach: 9500, caption: "A creator's Sunday at this Buddhist temple's weekly Thai street-food market — pad thai, satay and mango sticky rice cooked on the spot, 10:30am to 2pm only." }] },
  { key: "hurrem-hammam-north-miami", placeId: "ChIJM6d-F5Gt2YgR4xiZtJnzG68", match: { name: "Hurrem Hammam", city: "North Miami" },
    address: "14652 Biscayne Blvd, North Miami, FL 33181", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZNWyDBR5MV/", creator: "alexandramartin_tv", reach: 7500, caption: "A creator's day inside a 20,000 sq ft Ottoman-style bathhouse — marble hammam, kese scrub, cold plunge and an ice igloo." }] },
  { key: "ichimi-midtown-miami", placeId: "ChIJTwAMw0Cx2YgRw0ke2G7Z7ko", match: { name: "Ichimi", city: "Miami" },
    address: "118 Buena Vista Blvd, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYNta3cRRWQ/", creator: "alexandramartin_tv", reach: 2200, caption: "A creator's tonkotsu ramen and bao buns at this Midtown Miami pan-Asian counter." }] },
  { key: "mi-colombia-miami-beach", placeId: "ChIJT2rHbuay2YgRfsErmiRgvMQ", match: { name: "Mi Colombia", city: "Miami Beach" },
    address: "702 71st St, Miami Beach, FL 33141", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXxkLiAR4xW/", creator: "alexandramartin_tv", reach: 7700, caption: "A creator's visit to a family-run Colombian cafeteria in North Miami Beach, cooking the same homemade plates for 39 years." }] },
  { key: "yamashiro-miami", placeId: "ChIJG-Tq3xy32YgR7QyvDubSiLA", match: { name: "Yamashiro", city: "Miami" },
    address: "159 NE 6th St, Miami, FL 33132", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW7WWaxRtox/", creator: "alexandramartin_tv", reach: 6400, caption: "A creator's rooftop brunch downtown — matcha French toast and katsu sandos at the Miami outpost of a century-old Los Angeles restaurant." }] },
  { key: "andres-carne-de-res-miami-beach", placeId: "ChIJOZIFBwC12YgRieEn821YBic", match: { name: "Andres Carne de Res", city: "Miami Beach" },
    address: "455 Lincoln Rd, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW44WKUxbgZ/", creator: "alexandramartin_tv", reach: 3800, caption: "A creator's night at the Lincoln Road outpost of Colombia's loudest party steakhouse — chicharrón, arepas and a floor that turns into a dance." }] },
  { key: "chefsfull-food-truck-miami", placeId: "ChIJ5Z1h9M3D2YgRkUQhvnVypfQ", match: { name: "Chefsfull", city: "Miami" },
    address: "9191 SW 137th Ave, Miami, FL 33186", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWkJnwERymp/", creator: "alexandramartin_tv", reach: 5000, caption: "A creator's Jamaican plate from this Kendall food truck — Thursday through Sunday, oxtail on Saturdays." }] },
  { key: "tres-leches-factory-doral", placeId: "ChIJqZppyNO72YgRGGXMaUINCMM", match: { name: "Tres Leches Factory", city: "Doral" },
    address: "5213 NW 79th Ave, Doral, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWpUwoUxBs8/", creator: "alexandramartin_tv", reach: 6900, caption: "A creator's cuatro leches at the Doral bakery that has been supplying South Florida restaurants since 2001 — you have probably eaten it without knowing." }] },
  { key: "bella-miami-beach", placeId: "ChIJ-WgWlqq12YgRLqHWVu34USo", match: { name: "Bella Miami Beach", city: "Miami Beach" },
    address: "236 21st St, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWFRNWCRDH2/", creator: "alexandramartin_tv", reach: 1800, caption: "A creator's hand-made pasta at this small Mediterranean-leaning Italian room off Collins, tucked inside a hotel." }] },
  { key: "sushiato-doral", placeId: "ChIJpYiE0s6_2YgRncfqRBxOs_M", match: { name: "Sushiato", city: "Doral" },
    address: "4261 NW 107th Ave, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWAFlN6RQii/", creator: "alexandramartin_tv", reach: 4600, caption: "A creator's run through the fusion-roll menu at this Doral sushi room." }] },
  { key: "domaselo-little-havana-miami", placeId: "ChIJnY-BzZS32YgRP-9tqv6E6xs", match: { name: "domaselo", city: "Miami" },
    address: "2691 SW 11th St, Miami, FL 33135", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUEoV86EU2W/", creator: "alexandramartin_tv", reach: 8800, caption: "A creator's sourdough from a walk-up window in Little Havana, where every loaf is stone-milled and baked from scratch." }] },
  { key: "yambo-express-miami", placeId: "ChIJf4__A_HB2YgR9arNkSGbUaM", match: { name: "Yambo Express", city: "Miami" },
    address: "12005 SW 129th Ct, Miami, FL 33186", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTjJO5ikdG5/", creator: "alexandramartin_tv", reach: 29900, caption: "A creator's Nicaraguan fritanga — carne asada straight off the grill — at this Kendall truck from the Yambo family." }] },
  { key: "pronto-cafe-hialeah", placeId: "ChIJA3BFE2G72YgRJ13Z8fc5eto", match: { name: "Pronto", city: "Hialeah" },
    address: "86 W 29th St, Hialeah, FL 33012", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DSlAeXbER_X/", creator: "alexandramartin_tv", reach: 1900, caption: "A creator's pan con bistec at the Hialeah Cuban cafe people argue about." }] },
  { key: "la-casita-tropical-hollywood", placeId: "ChIJZ8VImgCp2YgRDymqli3x3IE", match: { name: "La Casita Tropical", city: "Hollywood" },
    address: "6301 Johnson St, Hollywood, FL 33024", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR0GLb1EbfZ/", creator: "alexandramartin_tv", reach: 26300, caption: "A creator's chicharrones at the Hollywood spot people drive across the state for, alongside a full Dominican menu." }] },
  { key: "ay-bendito-miami", placeId: "ChIJ687YflPA2YgR_QjPW4hRGyw", match: { name: "Ay Bendito", city: "Miami" },
    address: "9225 SW 137th Ave, Miami, FL 33186", category: "Food",
    note: "Her reel described this as a roving pop-up and pointed followers to the creator's IG for that week's spot. Google now lists a fixed Kendall address, which is what we key on. The caption below therefore claims a dish, not a schedule.",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXFm2CPR_Qa/", creator: "alexandramartin_tv", reach: 9600, caption: "A creator's mofongo, alcapurrias and pastelón at this Puerto Rican kitchen in Kendall." }] },


  // ════════════════════════════════════════════════════════════════════════════
  // v6.96b (2026-08-06) — @secretsoftampabay (Tampa / St. Pete: new openings,
  // upscale rooms, date night) and @lifeinparrish (the home metro).
  //
  // Every video now records `reach` — LIKES, read off the post, named for what
  // it is because Instagram exposes no play count anywhere readable. It drives
  // lib/creatorBoost.js, where more reach earns a larger boost (owner: "the
  // higher the view count the bigger the boost").
  //
  // FOUR OF HER PICKS ARE HANDLED SPECIALLY, and each is a rule, not a one-off:
  //   • Haven (South Tampa), 4.5 / 1,168 — NOT ADDED. Her reel said "serving
  //     till summer 2026"; Google now returns CLOSED_PERMANENTLY. It is August.
  //   • Tommy's Chophouse (Ybor) — NOT ADDED. Google's own display name is
  //     "Tommy's Chophouse - Opening Soon" and it carries 15 reviews. We do not
  //     recommend a restaurant that has not opened.
  //   • Palmette (3.7 / 56) and Riverwalk Terrace (3.9 / 88) — ADDED, but they
  //     sit BELOW CREATOR_MIN_RATING, so creatorBoostFor() returns 0 for both.
  //     Her video still shows on their place cards and in her directory; it
  //     just does not move them up a list headed "best near you". The floor
  //     governs rank only.
  // ════════════════════════════════════════════════════════════════════════════

  { key: "rio-izakaya-tampa", placeId: "ChIJw3vqvtndwogRobHwt-M78qw", match: { name: "Rio Izakaya", city: "Tampa" },
    address: "5232 Bridge St, Tampa, FL 33611", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWwEk5aETOW/", creator: "secretsoftampabay", reach: 2800, caption: "A creator's first look at this elevated Japanese room in the Westshore Marina District." }] },
  { key: "o-ku-tampa", placeId: "ChIJzY7HwxfDwogRLhC31vgX3ZY", match: { name: "O-Ku", city: "Tampa" },
    address: "2907 W Bay to Bay Blvd, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY1-DCgxzwQ/", creator: "secretsoftampabay", reach: 11900, caption: "A creator's tour of this Bay to Bay sushi and robata room — hamachi carpaccio, seared scallop, hanger steak in black garlic shoyu." }] },
  { key: "palmette-tampa", placeId: "ChIJzQJrFNfpwogRXVE296Q-hIM", match: { name: "Palmette", city: "Tampa" },
    address: "7627 W Courtney Campbell Cswy, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVqnRLIjhpX/", creator: "secretsoftampabay", reach: 1600, caption: "A creator's visit to this brasserie on the Courtney Campbell Causeway, inside the Westin Tampa Bay." }] },
  { key: "predalina-tampa", placeId: "ChIJ7aECsrzFwogRKra8aP0X5cE", match: { name: "Predalina", city: "Tampa" },
    address: "1001 E Cumberland Ave, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTDIKkaka9Y/", creator: "secretsoftampabay", reach: 1900, caption: "A creator's return to this Water Street Mediterranean room after its refresh." }] },
  { key: "urban-stillhouse-st-petersburg", placeId: "ChIJq6q6ujDiwogRxFvyGOkUW9A", match: { name: "Urban Stillhouse", city: "St. Petersburg" },
    address: "2232 5th Ave S, St. Petersburg, FL 33712", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR9optOkYj7/", creator: "secretsoftampabay", reach: 7700, caption: "A creator's holiday evening at this St. Pete distillery restaurant, which decorates hard for Christmas." }] },
  { key: "sorsi-waterfront-tampa", placeId: "ChIJJeuujrDFwogRZWZ69psQAa4", match: { name: "SORSI", city: "Tampa" },
    address: "601 S Harbour Island Blvd Ste 100, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR4pktGkZGF/", creator: "secretsoftampabay", reach: 1000, caption: "A creator's spritz in the sun at this Harbour Island aperitivo bar." }] },
  { key: "stovall-house-tampa", placeId: "ChIJ1ZTeIVrdwogRkMOsdzgVFYA", match: { name: "Stovall House", city: "Tampa" },
    address: "4621 Bayshore Blvd, Tampa, FL 33611", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DRab0KSDbJ4/", creator: "secretsoftampabay", reach: 1700, caption: "A creator's look inside the Arabian Nights party at this Bayshore social club — a members event, not a walk-in." }] },
  { key: "piccolo-buco-tampa", placeId: "ChIJFRtVgujBwogRBhpnTaxHUE0", match: { name: "Piccolo Buco", city: "Tampa" },
    address: "14904 N Dale Mabry Hwy, Tampa, FL 33618", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DP_hrJJjayi/", creator: "secretsoftampabay", reach: 3300, caption: "A creator's opening night at Cooper's Hawk's Roman trattoria concept on North Dale Mabry." }] },
  { key: "hyde-park-village-tampa", placeId: "ChIJQZRp15bDwogReY6sMTk-YWg", match: { name: "Hyde Park Village", city: "Tampa" },
    address: "1602 W Swann Ave, Tampa, FL 33606", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DPWEr2ijski/", creator: "secretsoftampabay", reach: 2800, caption: "A creator's autumn afternoon at this open-air Tampa village, which fills with pumpkins the moment the season turns." }] },
  { key: "1983-tampa", placeId: "ChIJ0aB-cKPDwogRCb9YmF_OOhI", match: { name: "1983", city: "Tampa" },
    address: "2616 S MacDill Ave, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DN5gZSTji9i/", creator: "secretsoftampabay", reach: 1600, caption: "A creator's preview of this South Tampa restaurant, bar and arcade before it opened." }] },
  { key: "circles-waterfront-apollo-beach", placeId: "ChIJ0Ts6lqTZwogRCYwOKw7pW2g", match: { name: "Circles Waterfront", city: "Apollo Beach" },
    address: "1212 Apollo Beach Blvd, Apollo Beach, FL 33572", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DNdU5P3OtXD/", creator: "secretsoftampabay", reach: 2000, caption: "A creator's afternoon at this Apollo Beach waterfront restaurant you can reach by boat, with a beach lounge and a second bar." }] },
  { key: "rocca-tampa", placeId: "ChIJ1WZIXhjFwogR1M-_3DXnG6Y", match: { name: "Rocca", city: "Tampa" },
    address: "323 W Palm Ave, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DMxU4QPuOeO/", creator: "secretsoftampabay", reach: 650, caption: "A creator's table-side mozzarella cart at this Tampa Heights Italian room." }] },
  { key: "st-regis-longboat-key", placeId: "ChIJaRL0syxrw4gRHAo4CxKP9IY", match: { name: "St. Regis Longboat Key", city: "Longboat Key" },
    address: "1601 Gulf of Mexico Dr, Longboat Key, FL 34228", category: "Hotels",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DLfaZB1uiVQ/", creator: "secretsoftampabay", reach: 944, caption: "A creator's stay at this Longboat Key beach resort." }] },
  { key: "elliott-aster-st-petersburg", placeId: "ChIJnZwugRXhwogRpN-HY445tJM", match: { name: "Elliott Aster", city: "St. Petersburg" },
    address: "501 5th Ave NE, St. Petersburg, FL 33701", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DKmfEUFOM-j/", creator: "secretsoftampabay", reach: 1400, caption: "A creator's opening visit to this dining room at the Vinoy in downtown St. Pete." }] },
  { key: "barcelona-wine-bar-tampa", placeId: "ChIJI_OEjj7DwogRcWK3mnLt9fU", match: { name: "Barcelona Wine Bar", city: "Tampa" },
    address: "2907 W Bay to Bay Blvd Ste A100, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DKMjlvtOYDt/", creator: "secretsoftampabay", reach: 1200, caption: "A creator's stop for the South Tampa happy hour here, weekdays four to six." }] },
  { key: "maru-rooftop-tampa", placeId: "ChIJ14hpXQDDwogRnzzMJmb0ylE", match: { name: "Maru", city: "Tampa" },
    address: "2909 W Bay to Bay Blvd Ste A-600, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DJgsf_Eu-u6/", creator: "secretsoftampabay", reach: 2700, caption: "A creator's first night at this rooftop cocktail and seafood bar above Bay to Bay." }] },
  { key: "riverwalk-terrace-tampa", placeId: "ChIJEeANUgDFwogRsSiGNytPdd0", match: { name: "Riverwalk Terrace", city: "Tampa" },
    address: "505 Water St, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DIL9_eyRdas/", creator: "secretsoftampabay", reach: 879, caption: "A creator's opening look at this terrace bar on the Tampa Riverwalk." }] },
  { key: "latitude-28-clearwater-beach", placeId: "ChIJ6VPPdiz3wogRjsClFdAJ504", match: { name: "Latitude 28", city: "Clearwater Beach" },
    address: "691 S Gulfview Blvd, Clearwater Beach, FL 33767", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DIJpH5AxPtE/", creator: "secretsoftampabay", reach: 1800, caption: "A creator's Thai-leaning tasting dinner at this Clearwater Beach resort restaurant — a one-night menu, not the everyday one." }] },

  // ── @lifeinparrish — the home metro ──
  { key: "pjs-sandwich-shop-parrish", placeId: "ChIJqzsAbq4lw4gR46Lr7T6Fgi4", match: { name: "P J's Sandwich Shop", city: "Parrish" },
    address: "12342 US-301, Parrish, FL 34219", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbgbJhYB3dQ/", creator: "lifeinparrish", reach: 4, caption: "A creator's Italian sub, with the house sub dressing, at the Parrish sandwich counter that has been open 42 years." }] },


  // ════════════════════════════════════════════════════════════════════════════
  // v6.96c (2026-08-06) — @influencetampa (Courtney). Tampa Bay: dessert rooms,
  // waterfront seafood, new coffee shops, the iconic institutions. Her reach is
  // the highest in the library — the Salt Shack reel alone is 20,600 likes.
  //
  // TWO POSTS FROM THIS BATCH ARE NOT PLACES and are handled elsewhere:
  //   • Her monthly "events around Tampa Bay" round-up (20 dated events in one
  //     post) and the Water Street holiday-lights reel are EVENTS, not venues.
  //     They belong in lib/creatorEvents.js, which carries dates and expiry.
  //     Putting a dated thing in a place list is how you end up recommending a
  //     festival that finished five months ago.
  //   • Pura Vida (announced for Water Street and Midtown) is NOT OPEN. Same
  //     rule as Tommy's Chophouse: we do not recommend a restaurant that has
  //     not opened. Its reel stays uncurated until it has a real listing.
  // ════════════════════════════════════════════════════════════════════════════

  // ── @influencetampa — Tampa Bay ──
  { key: "berns-steak-house-tampa", placeId: "ChIJKQXHdmfDwogRJFCLuT7eJ6I", match: { name: "Bern's Steak House", city: "Tampa" },
    address: "1208 S Howard Ave, Tampa, FL 33606", category: "Food",
    note: "Two videos, one venue: the Harry Waugh Dessert Room sits inside Bern's and has no separate Google listing, so both reels resolve to the steakhouse. reachOf() takes the strongest, not the sum — a place is featured or it is not.",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/CvphpPutyPR/", creator: "influencetampa", reach: 8800, caption: "A creator's night in the Harry Waugh Dessert Room — private booths built from old wine casks, a phone on the wall to request a song from the live pianist." },
      { platform: "instagram", url: "https://www.instagram.com/p/DWBupkuDYSw/", creator: "influencetampa", reach: 1600, caption: "A creator's case for the Tampa institution: every steak arrives with soup, salad, potato and onion rings, and reservations open sixty days out." }
    ] },
  { key: "salt-shack-on-the-bay-tampa", placeId: "ChIJWSwkNNXdwogRCJUtqnx7je0", match: { name: "Salt Shack", city: "Tampa" },
    address: "615 Channelside Dr, Tampa, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/CuCRAYzLv3z/", creator: "influencetampa", reach: 20600, caption: "A creator's waterfront afternoon — peel-and-eat shrimp, catch of the day, and yucca fries in sofrito. No reservations, so go early." }] },
  { key: "sucre-table-tampa", placeId: "ChIJURkn5v7DwogR5XfGAWpOE74", match: { name: "Sucré Table", city: "Tampa" },
    address: "Tampa, FL", category: "Food",
    note: "Her reel featured a limited-run croissant that is long gone. The caption below describes the BAKERY, not that menu — a curated line that outlives its subject is a lie with a delay on it.",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/CvPcmx2LYy7/", creator: "influencetampa", reach: 8600, caption: "A creator's visit to this Tampa pastry kitchen, known for laminated croissants and a rotating run of one-off specials." }] },
  { key: "sapphire-tampa", placeId: "ChIJCUsmv-rDwogRFLK0RwWg_LE", match: { name: "Sapphire", city: "Tampa" },
    address: "4410 W Boy Scout Blvd, Tampa, FL 33607", category: "Nightlife",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYj6SHYOzM_/", creator: "influencetampa", reach: 3200, caption: "A creator's night at this dinner-and-a-show room where every table faces the stage and a DJ takes over after ten. Check the dress code first." }] },
  { key: "hog-island-fish-camp-dunedin", placeId: "ChIJl9A3H2PxwogRqvtZC7HHe_I", match: { name: "Hog Island Fish Camp", city: "Dunedin" },
    address: "Dunedin, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXJuFhfDSVq/", creator: "influencetampa", reach: 1100, caption: "A creator's lunch a few blocks off the Dunedin main strip — parmesan-crusted hogfish, red and white chowders, fish landed by local boats." }] },
  { key: "fortu-st-petersburg", placeId: "ChIJdaUo-PPhwogRii2HqysdgjI", match: { name: "Fortu", city: "St. Petersburg" },
    address: "St. Petersburg, FL", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DQrRVyHjce9/", creator: "influencetampa", reach: 954, caption: "A creator's four-course dinner at this Michelin-listed downtown St. Pete room — lobster dumplings in ginger broth, black miso cod, an ube cheesecake." },
      { platform: "instagram", url: "https://www.instagram.com/p/DQ7--eQCS2A/", creator: "tampaterrencee", reach: 3500, caption: "A second creator on the same room, six weeks earlier — the Japanese-leaning pan-Asian menu that put it on the Michelin list." }
    ] },
  { key: "alessi-bakery-tampa", placeId: "ChIJJ1tmaHbDwogRxB86-j_tUjw", match: { name: "Alessi", city: "Tampa" },
    address: "Tampa, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYMuJ4rOTBo/", creator: "influencetampa", reach: 2500, caption: "A creator's stop at the Tampa bakery that has been open since 1912, now in a larger room with a bar and a patio. Do not leave without the scacciata." }] },
  { key: "beccofino-tampa", placeId: "ChIJoSQpEbDdwogR_pwYErjpEtk", match: { name: "Beccofino", city: "Tampa" },
    address: "5712 S MacDill Ave, Tampa, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ7flZquUi5/", creator: "influencetampa", reach: 1700, caption: "A creator's coursed-out dinner at this small South Tampa Italian room, where the cacio e pepe is finished at the table." }] },
  { key: "tate-and-tilly-tampa", placeId: "ChIJZevb9ZHAwogROpUBDf-kHQ8", match: { name: "Tate & Tilly", city: "Tampa" },
    address: "14369 N Dale Mabry Hwy, Tampa, FL", category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU0nQjVjUUd/", creator: "influencetampa", reach: 414, caption: "A creator's browse through this North Tampa gift shop, stocked largely from local makers — cookware, toys, jewellery and a Tampa section." }] },
  { key: "cafe-rialto-tampa", placeId: "ChIJ69YTzXPFwogRRTUQ-HGDL7g", match: { name: "Café Rialto", city: "Tampa" },
    address: "1617 N Franklin St, Tampa, FL", category: "Food",
    note: "4.7 stars on only 24 reviews — clears the rating floor but NOT CREATOR_MIN_REVIEWS, so it earns no rank boost yet. It is a genuinely new opening; the floor will let it through on its own once enough people have been.",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYzX3OoutDc/", creator: "influencetampa", reach: 2900, caption: "A creator's coffee inside this historic downtown event space, now open as a cafe with a tea room." }] },
  { key: "tampa-edition", placeId: "ChIJERKjMobFwogRU-c43PevXB0", match: { name: "Tampa EDITION", city: "Tampa" },
    address: "500 Channelside Dr, Tampa, FL 33602", category: "Hotels",
    note: "4.1 stars — BELOW CREATOR_MIN_RATING, so no rank boost. Her reel is about its Christmas decoration, which is seasonal; the seasonal side belongs in lib/creatorEvents.js, and this entry is only the hotel itself.",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DRpQm0iDRx0/", creator: "influencetampa", reach: 1600, caption: "A creator's look at this downtown Tampa hotel, which decorates heavily through the holidays." }] },


  // ════════════════════════════════════════════════════════════════════════════
  // v6.96e (2026-08-06) — @tampaterrencee. The biggest reach in the library by a
  // wide margin (the Sculley's reel alone is 128,700 likes, ten times anything
  // else here) and, for that reason, the batch that needed the most discipline.
  //
  // HE IS A VIRAL-MOMENT ACCOUNT, NOT A RECOMMENDATION ACCOUNT. Of 21 posts the
  // owner sent, ELEVEN name a venue and are curated below. TEN NAME NONE — a
  // packed bar, a concert, a sunset, a DJ set, a flood barrier — and are NOT
  // curated, because the only way to file them would be to guess which venue,
  // and a guess dressed as a recommendation is the exact failure this library
  // exists to prevent. His reach makes that worse, not better: a wrong guess
  // carried by a 128K-like post is a loud wrong guess.
  //
  // One post is deliberately excluded even though its venue IS identifiable:
  // the Rick Ross set (25.3K likes) was a PRIVATE COMPANY PARTY, as the
  // commenters point out. We do not list a party the public cannot attend.
  // ════════════════════════════════════════════════════════════════════════════

  // ── @tampaterrencee — Tampa Bay ──
  { key: "sculleys-madeira-beach", placeId: "ChIJD9Xl7lT8wogRJxFfsfNLji4", match: { name: "Sculley's", city: "Madeira Beach" },
    address: "190 Boardwalk Pl E, Madeira Beach, FL 33708", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU_Cx5gjl47/", creator: "tampaterrencee", reach: 128700, caption: "A creator takes on the 64oz Bloody Mary at this John's Pass boardwalk seafood house — the single most-watched find in the library." }] },
  { key: "frankies-italian-deli-riverview", placeId: "ChIJeS-mqN_PwogRYCTAjzN5_FI", match: { name: "Frankie's Italian Deli", city: "Riverview" },
    address: "3930 US-301, Riverview, FL 33578", category: "Food",
    note: "Filed under Riverview, not Tampa. His caption said Tampa and his own commenters corrected him — Riverview is its own city, forty minutes out. We use the address, not the caption.",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DSViu5UiZRJ/", creator: "tampaterrencee", reach: 38200, caption: "A creator's chicken cutlet tacos at this Long Island-style Italian deli south of Tampa." }] },
  { key: "southern-luv-bbq-tampa", placeId: "ChIJQ4DLFKfrwogR-QrEqDFXpk8", match: { name: "Southern Luv", city: "Tampa" },
    address: "8019 Citrus Park Dr, Tampa, FL 33624", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTGKcdQDtV6/", creator: "tampaterrencee", reach: 8300, caption: "A creator's tray at this Citrus Park barbecue joint — brisket, ribs and the sides that come with them." }] },
  { key: "due-amici-ybor-tampa", placeId: "ChIJn2Mfbv5654gRVPqvg4fcmlA", match: { name: "Due Amici", city: "Tampa" },
    address: "1724 E 7th Ave, Tampa, FL 33605", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DQHpIgyiQmR/", creator: "tampaterrencee", reach: 7500, caption: "A creator's pizza and pasta on Ybor's 7th Avenue, at the room locals argue is the city's best." }] },
  { key: "el-chuzo-tampa", placeId: "ChIJ7SBhwk_BwogR8Ld48Qfa3oo", match: { name: "El Chuzo", city: "Tampa" },
    address: "7101 N Armenia Ave, Tampa, FL 33604", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DKdbsVxoWco/", creator: "tampaterrencee", reach: 6500, caption: "A creator takes on the outsized burger at this Colombian grill on North Armenia — a shareable challenge, not a solo lunch." }] },
  { key: "hungry-crab-tampa", placeId: "ChIJpxuhmQ63wogRdyNj0LVyOco", match: { name: "Hungry Crab", city: "Tampa" },
    address: "19601 Bruce B Downs Blvd, Tampa, FL 33647", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DQ-tsMejvYq/", creator: "tampaterrencee", reach: 5000, caption: "A creator's all-you-can-eat seafood boil in New Tampa — crab legs, shrimp and corn by the bag." }] },
  { key: "jay-luigi-tampa", placeId: "ChIJn38erTXDwogRb0CWRhZeTmc", match: { name: "Jay Luigi", city: "Tampa" },
    address: "516 S Howard Ave, Tampa, FL 33606", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU57J1kjgfE/", creator: "tampaterrencee", reach: 2000, caption: "A creator's dinner at this SoHo Italian room, one of the highest-rated in the city." }] },
  { key: "madison-avenue-pizza-dunedin", placeId: "ChIJb0Uq9LLzwogRmm6jXRaFuEQ", match: { name: "Madison Avenue Pizza", city: "Dunedin" },
    address: "2660 Bayshore Blvd, Dunedin, FL 34698", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTNnJTdCRJR/", creator: "tampaterrencee", reach: 1800, caption: "A creator takes on one of the largest pizzas in the country at this Dunedin pizzeria — thin crust, and bigger than the table." }] },
  { key: "weeki-wachee-springs", placeId: "ChIJz3OOrDIg6IgRMKjzAPsV3NI", match: { name: "Weeki Wachee Springs", city: "Spring Hill" },
    address: "6131 Commercial Way, Spring Hill, FL 34606", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DIjUdubpr9w/", creator: "tampaterrencee", reach: 1000, caption: "A creator's kayak down the spring run about 45 minutes north of Tampa — 74-degree water year round, with manatees and turtles on the way." }] },
  { key: "snack-trap-ybor-tampa", placeId: "ChIJmedZNwDPwogRst1K4Ya19DU", match: { name: "Snack trap", city: "Tampa" },
    address: "2205 N 22nd St, Tampa, FL 33605", category: "Nightlife",
    note: "12 reviews — well below CREATOR_MIN_REVIEWS, so no rank boost. Curated anyway so his video reaches the place card: a 6,100-like post about a twelve-review bar is exactly the case the floor was written for.",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DSBwcM1DsBj/", creator: "tampaterrencee", reach: 6100, caption: "A creator's stop for the wings at this small Ybor bar." }] },

  // ── EXCLUDE (do not add) ──
  // @tampaterrencee — TEN posts NAME NO VENUE and are deliberately uncurated:
  //   a packed bar on a Thursday (13.2K), a concert (17.3K), a second concert
  //   (12.2K), "boxing at the patio" (15.4K), an unnamed bar (2.3K), an outdoor
  //   DJ set (4.0K), a sunset (1.1K), and the AquaFence flood barrier (2.7K).
  //   High reach is not identification. Filing any of these means guessing the
  //   venue, and a guess carried by a 15K-like post is a loud, confident lie.
  //   If he names one later, curate it then.
  // @tampaterrencee — Rick Ross pop-up "at the farm" (25.3K). Venue arguably
  //   identifiable, but the commenters confirm it was a PRIVATE COMPANY PARTY.
  //   We do not list something the public cannot attend.
  // Pura Vida (Water Street + Midtown Tampa) — @influencetampa, 1.9K likes.
  //   ANNOUNCED, NOT OPEN. Her own reel is filmed at the West Palm location. Add
  //   each Tampa location under its own real placeId once it opens.
  // Water Street (the district) — @influencetampa holiday-lights reel. Google
  //   resolves it to a ROUTE with no rating: it is a street, not a venue. The
  //   holiday display is seasonal and belongs in lib/creatorEvents.js.
  // Haven, 2208 W Morrison Ave, Tampa — @secretsoftampabay, 4.1K likes, 4.5/1,168.
  //   CLOSED_PERMANENTLY per Google (her Feb reel announced it would serve "till
  //   summer 2026"; a new seafood concept is promised). Re-add the SUCCESSOR under
  //   its own name and placeId when it opens — never reuse this one.
  // Tommy's Chophouse, 1622 E 7th Ave, Ybor — @secretsoftampabay, 4.2K likes.
  //   Google display name is "Tommy's Chophouse - Opening Soon", 15 reviews. Add
  //   when it is genuinely open AND clears CREATOR_MIN_REVIEWS.
  // Knaus Berry Farm (16790 SW 177th Ave, Miami) — @alexandramartin_tv, real reel
  //   (https://www.instagram.com/p/DU60JV2jajL/), 4.6★ / 4,054 reviews, and DELIBERATELY
  //   NOT ADDED. Google returns businessStatus CLOSED_TEMPORARILY: it is a seasonal farm
  //   that shuts every summer and reopens around late October. isOperational() allows only
  //   OPERATIONAL, and the rule here is that we never recommend a venue that is shut today.
  //   ADD IT when it reopens — placeId ChIJmQAtQVTd2YgRp2sYrjBwi1M, city "Miami",
  //   category Food — and re-check the status first.
  // Caddy's Bradenton (801 Riverside Dr E) — PERMANENTLY CLOSED (~Mar 2026). @beachsammy 2.4K.
  //   Do not feature a closed venue. Brand still operates elsewhere — drop this address only.
  // @terranandcassie "Bradenton fishing/sunset" 212.4K — no venue identified. Hold until a
  //   native post pins a real place.

  // ═══════════════════════════════════════════════════════════════════════════
  // 2026-08-07 — THREE NEW CREATORS, 59 POSTS READ ONE AT A TIME.
  //
  // Owner supplied the post URLs; every entry below was opened in a real
  // browser and read. Name, city and address come from the CREATOR'S OWN
  // CAPTION — not from an aggregator, not from a guess. Where a caption did
  // not state the city, `match` carries the NAME ONLY and `address` is absent,
  // because the alternative is inventing a location for a real business.
  //
  // `reach` IS LIKES, and it is the number the post actually showed. The owner
  // quoted view counts for several of these; views are not readable from a post
  // page or any embed, so recording them would be recording a guess, and
  // lib/creatorBoost.js says in its own comments that a number claiming to be
  // something it is not will eventually be quoted back to a creator. Where a
  // post showed no like count, `reach` is ABSENT rather than 0 — absent earns
  // EVIDENCE_MIN_FRAC, whereas 0 would assert that nobody liked it.
  //
  // `caption` is Wayfind's own words throughout, per the rule at the top of
  // this file. The creators' captions are their copyright; the credit and the
  // link-out are how they benefit.
  //
  // Posts deliberately NOT entered, with the reason:
  //   DYdNZ8ZprXy, DaL8-IYRL9a  giveaways — DaL8 is entered for the STUDIO it
  //     names (Color Me Mine), not as a giveaway; DYdNZ8 names no venue of its own.
  //   DY0P-IlCqmn, DVEnkbaEXTl  posted by @roasted813, not by the creators here.
  //   DaBRzWMpwMf  a pop-up (@flourmyday) with no fixed address to send anyone to.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── @tampaiman — Tampa Bay, halal-first ──
  { key: "la-la-cafe-st-petersburg", match: { name: "La La Cafe", city: "St. Petersburg" },
    address: "4416 66th St N, St. Petersburg, FL 33709", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbqZ0FDJN9y/", creator: "tampaiman", reach: 267, postedAt: "2026-08-05", caption: "A Vietnamese cafe on 66th Street North, filmed by a local creator for the matcha and the rubber-duck wall." }] },
  { key: "arwa-coffee-temple-terrace", match: { name: "Arwa Coffee", city: "Temple Terrace" },
    address: "8633 N 56th St, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbjAv2TpLzw/", creator: "tampaiman", reach: 407, postedAt: "2026-08-02", caption: "A Yemeni coffee house in Temple Terrace with a prayer room, filmed by a local creator." }] },
  { key: "farooj-abo-alabed-temple-terrace", match: { name: "Farooj Abo AlAbed", city: "Temple Terrace" },
    address: "11401 N 56th St Suite 23, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbQw4TXOyOG/", creator: "tampaiman", reach: 791, postedAt: "2026-07-26", caption: "Lebanese charcoal-grilled chicken inside the N 56th Street halal food court, filmed by a local creator." }] },
  { key: "papa-kanafa-temple-terrace", match: { name: "Papa Kanafa", city: "Temple Terrace" },
    address: "11401 N 56th St Suite 23, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbQw4TXOyOG/", creator: "tampaiman", reach: 791, postedAt: "2026-07-26", caption: "Kunafa counter inside the N 56th Street halal food court, filmed by a local creator." }] },
  { key: "juice-time-temple-terrace", match: { name: "Juice Time", city: "Temple Terrace" },
    address: "11401 N 56th St Suite 23, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbQw4TXOyOG/", creator: "tampaiman", reach: 791, postedAt: "2026-07-26", caption: "Juice and dessert counter inside the N 56th Street halal food court, filmed by a local creator." }] },
  { key: "qahwtea-tampa", match: { name: "Qahwtea", city: "Tampa" },
    address: "2319 E Fowler Ave, Tampa, FL 33612", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaTsOPMJOQB/", creator: "tampaiman", reach: 226, postedAt: "2026-07-02", caption: "A Yemeni coffee shop on East Fowler Avenue, filmed by a local creator before its grand opening." }] },
  { key: "slap-burger-tampa", match: { name: "Slap Burger", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dao-eQ4JOSx/", creator: "tampaiman", reach: 754, postedAt: "2026-07-10", caption: "A halal smash-burger counter open late, filmed by a local creator." }] },
  { key: "oou-cha-tampa-bay", match: { name: "Oou Cha" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DauKX7yp6YH/", creator: "tampaiman", reach: 2336, postedAt: "2026-07-12", caption: "A Tampa Bay tea cafe, filmed by a local creator for the blueberry matcha." }] },
  { key: "quiero-coffee-sarasota", match: { name: "Quiero Coffee", city: "Sarasota" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaLx1mJJMF-/", creator: "tampaiman", reach: 366, postedAt: "2026-06-29", caption: "A Latina-owned coffee and matcha stand, filmed by a local creator at a Sarasota event." }] },
  { key: "annapoorna-rasoi-tampa", match: { name: "Annapoorna Rasoi", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaYKbxwpEg9/", creator: "tampaiman", reach: 858, postedAt: "2026-07-04", caption: "Halal Indo-Chinese and street-style Indian cooking in Tampa, filmed by a local creator." }] },
  // TWO CREATORS, INDEPENDENTLY. Reach is the STRONGEST single post, never the
  // sum (reachOf() in lib/creatorBoost.js — a place is featured or it is not),
  // so a second video does not double the boost. What it does buy is
  // corroboration a reader can check for themselves.
  { key: "alessi-bakeries-tampa", match: { name: "Alessi Bakeries", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ8Di3PpY3X/", creator: "tampaiman", reach: 871, postedAt: "2026-06-23", caption: "A Tampa bakery and food market running since 1912, filmed by a local creator." },
             { platform: "instagram", url: "https://www.instagram.com/p/Dayg5BhB0x6/", creator: "stufftodointampabay", reach: 582, postedAt: "2026-07-14", caption: "The same Tampa bakery after its renovation, filmed by a second local creator." }] },
  { key: "brewed-awakening-tampa", match: { name: "Brewed Awakening", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ2kUZCpGQ1/", creator: "tampaiman", reach: 1478, postedAt: "2026-06-21", caption: "Cuban cold brew in Tampa, filmed by a local creator." }] },
  { key: "say-coffee-st-petersburg", match: { name: "Say Coffee", city: "St. Petersburg" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZycKGYJyU0/", creator: "tampaiman", reach: 432, postedAt: "2026-06-19", caption: "A Vietnamese cafe in St. Pete, filmed by a local creator." },
             { platform: "instagram", url: "https://www.instagram.com/p/DaBgdAyRrFI/", creator: "stufftodointampabay", reach: 182, postedAt: "2026-06-25", caption: "The same St. Pete Vietnamese coffee house, filmed by a second local creator." }] },
  { key: "cococello-st-petersburg", match: { name: "Cococello", city: "St. Petersburg" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZsUafKphmW/", creator: "tampaiman", reach: 352, postedAt: "2026-06-17", caption: "Thai coconut ice cream in St. Pete, filmed by a local creator." },
             { platform: "instagram", url: "https://www.instagram.com/p/DWZzHpACbfI/", creator: "tampaiman", reach: 2854, postedAt: "2026-03-27", caption: "Coconut-bowl ice cream and mango sticky rice matcha, filmed by a local creator." }] },
  { key: "ichiban-sushi-ramen-tampa", match: { name: "Ichiban Sushi & Ramen", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZQtJKspsqS/", creator: "tampaiman", reach: 1784, postedAt: "2026-06-06", caption: "A Seminole Heights sushi room open four decades, filmed by a local creator." }] },
  { key: "shanghai-dumpling-house-tampa", match: { name: "Shanghai Dumpling House", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY2lXU_pPSV/", creator: "tampaiman", reach: 1736, postedAt: "2026-05-27", caption: "Handmade soup dumplings in Tampa, filmed by a local creator." }] },
  { key: "aker-sweets-tampa", match: { name: "Aker Sweets", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYldoFmJoJ4/", creator: "tampaiman", reach: 2851, postedAt: "2026-05-20", caption: "Nablus-style kunafa and Levantine sweets, filmed by a local creator at the first US location." }] },
  { key: "pasta-flame-tampa", match: { name: "Pasta Flame", city: "Tampa" },
    address: "10865 Cross Creek Blvd, Tampa, FL 33647", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYH6ZjtJhcB/", creator: "tampaiman", reach: 4055, postedAt: "2026-05-09", caption: "Tableside cheese-wheel pasta on Cross Creek Boulevard, filmed by a local creator." },
             { platform: "instagram", url: "https://www.instagram.com/p/DVXpNSgAFe4/", creator: "tampaiman", reach: 1756, postedAt: "2026-03-01", caption: "Halal Italian cooking with homemade pasta, filmed by a local creator." }] },
  { key: "eight-turn-crepe-wesley-chapel", match: { name: "Eight Turn Crepe", city: "Wesley Chapel" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYQMmZ3J8oG/", creator: "tampaiman", reach: 1321, postedAt: "2026-05-12", caption: "Japanese-style savoury and sweet crepes in Wesley Chapel, filmed by a local creator." }] },
  { key: "99-cafe-tampa", match: { name: "99 Cafe", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXzCBtEpp8Y/", creator: "tampaiman", reach: 889, postedAt: "2026-05-01", caption: "A South Tampa cafe where the menu runs on 99-cent endings, filmed by a local creator." }] },
  { key: "la-pinoz-pizza-longwood", match: { name: "La Pino'z Pizza", city: "Longwood" },
    address: "1050 W State Rd 434, Longwood, FL 32750", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXj4tBfCSOW/", creator: "tampaiman", reach: 623, postedAt: "2026-04-25", caption: "Halal Indian-style pizza near Orlando, filmed by a local creator." }] },
  { key: "sufrat-ramallah-tampa", match: { name: "Sufrat Ramallah", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXddCgICY7U/", creator: "tampaiman", reach: 21000, postedAt: "2026-04-22", caption: "A Palestinian breakfast spread inside Ramallah Market, filmed by a local creator." }] },
  { key: "ghawar-restaurant-tampa", match: { name: "Ghawar Restaurant", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXaWmEmifXU/", creator: "tampaiman", reach: 2210, postedAt: "2026-04-21", caption: "Traditional Levantine cooking in Tampa, filmed by a local creator." }] },
  { key: "soul-of-korea-tampa", match: { name: "Soul of Korea", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXV25U0iUNw/", creator: "tampaiman", reach: 3706, postedAt: "2026-04-19", caption: "Halal Korean cooking, a Tampa local favourite, filmed by a local creator." }] },
  { key: "doggy-dogs-tampa", match: { name: "Doggy Dogs", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW2eNA2CcXy/", creator: "tampaiman", reach: 941, postedAt: "2026-04-07", caption: "A South Tampa food truck doing beef hot dogs and smash burgers, filmed by a local creator." }] },
  { key: "saki-endless-sushi-hibachi-tampa", match: { name: "Saki Endless Sushi & Hibachi", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWuYHg3iaqd/", creator: "tampaiman", reach: 7236, postedAt: "2026-04-04", caption: "All-you-can-eat sushi and hibachi in Tampa, filmed by a local creator." }] },
  { key: "byte-burger-tampa", match: { name: "BYTE", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWacZcxCWvO/", creator: "tampaiman", reach: 5677, postedAt: "2026-03-27", caption: "A halal smash-burger spot in Tampa, filmed by a local creator." }] },
  { key: "kubana-kafe-tampa", match: { name: "Kubana Kafe", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU6LRc2iRv9/", creator: "tampaiman", reach: 3407, postedAt: "2026-02-18", caption: "A Cuban-owned coffee shop in South Tampa, filmed by a local creator." }] },
  { key: "bibimgo-wesley-chapel", match: { name: "BiBimGo", city: "Wesley Chapel" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTUBXRjiQgJ/", creator: "tampaiman", reach: 4162, postedAt: "2026-01-09", caption: "Halal Korean rice bowls built to order in Wesley Chapel, filmed by a local creator." }] },
  { key: "rosto-tampa", match: { name: "Rosto", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTIndw-iRvy/", creator: "tampaiman", reach: 2296, postedAt: "2026-01-05", caption: "Syrian-style rotisserie chicken in Tampa, filmed by a local creator." }] },
  { key: "banus-chai-tampa", match: { name: "Banu's Chai", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DSVey-Jies0/", creator: "tampaiman", reach: 995, postedAt: "2025-12-16", caption: "A Desi chai cart doing pani puri, filmed by a local creator." }] },
  { key: "qamaria-tampa", match: { name: "Qamaria", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR0SAvGCWbU/", creator: "tampaiman", reach: 1679, postedAt: "2025-12-03", caption: "Chocolate-covered mousse pastries in Tampa Bay, filmed by a local creator." }] },
  { key: "grind-haus-coffee-lutz", match: { name: "Grind Haus Coffee", city: "Lutz" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DQKfkSmCZCm/", creator: "tampaiman", reach: 1281, postedAt: "2025-10-23", caption: "A moody rustic cafe at Lutz Lake Crossing, filmed by a local creator." }] },
  // ── @_adatewithkait — Orlando date nights and experiences ──
  { key: "akasaka-orlando", match: { name: "Akasaka", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8JslLxxTz/", creator: "_adatewithkait", reach: 193, postedAt: "2026-07-18", caption: "A sushi room in Orlando, filmed by a local creator on its new menu." }] },
  { key: "bloom-ride-orlando", match: { name: "Bloom Ride", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ9DwVKCCmO/", creator: "_adatewithkait", reach: 122, postedAt: "2026-06-23", caption: "A 90-minute themed afternoon-tea bus ride past Orlando landmarks, filmed by a local creator." }] },
  { key: "teapioca-lounge-oviedo", match: { name: "Teapioca Lounge", city: "Oviedo" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ-3thLh6_P/", creator: "_adatewithkait", reach: 87, postedAt: "2026-06-24", caption: "A boba counter in Oviedo at Alafaya Square, filmed by a local creator." }] },
  { key: "aurora-at-the-celeste-orlando", match: { name: "Aurora at The Celeste", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZyARU3RXNB/", creator: "_adatewithkait", reach: 86, postedAt: "2026-06-19", caption: "A three-course tasting menu inside The Celeste, filmed by a local creator." }] },
  { key: "the-dark-room-orlando", match: { name: "The Dark Room", city: "Orlando" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZn50K-RSQF/", creator: "_adatewithkait", reach: 226, postedAt: "2026-06-15", caption: "A bar running a month of scratch-made espresso martinis, filmed by a local creator." }] },
  { key: "azal-coffee-altamonte-springs", match: { name: "Azal Coffee", city: "Altamonte Springs" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZa-Yp9xa1A/", creator: "_adatewithkait", reach: 303, postedAt: "2026-06-10", caption: "Traditional Yemeni coffee and desserts in Altamonte Springs, filmed by a local creator on opening week." }] },
  { key: "izuki-orlando", match: { name: "Izuki", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZI2KN3RWf4/", creator: "_adatewithkait", reach: 270, postedAt: "2026-06-03", caption: "An 18-course omakase counter in Orlando, filmed by a local creator." }] },
  { key: "morimoto-asia-orlando", match: { name: "Morimoto Asia", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY98mpQxs_8/", creator: "_adatewithkait", reach: 99, postedAt: "2026-05-30", caption: "A pan-Asian dining room at Disney Springs, filmed by a local creator on its Passport to Asia menu." }] },
  { key: "bar-louie-winter-park", match: { name: "Bar Louie", city: "Winter Park" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY72oe6RtmX/", creator: "_adatewithkait", reach: 281, postedAt: "2026-05-29", caption: "A Winter Park Village patio bar, filmed by a local creator on its weekday happy hour." }] },
  { key: "pisco-peruvian-gastrobar-orlando", match: { name: "Pisco Peruvian Gastrobar", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY0ObAJRHZZ/", creator: "_adatewithkait", reach: 83, postedAt: "2026-05-26", caption: "Peruvian cooking and summer cocktails in Orlando, filmed by a local creator." }] },
  { key: "ace-cafe-sanford", match: { name: "Ace Cafe", city: "Sanford" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYuZBPwxzm5/", creator: "_adatewithkait", reach: 149, postedAt: "2026-05-24", caption: "A downtown Sanford room doing live music and Sunday brunch, filmed by a local creator." }] },
  { key: "wala-la-noodles-orlando", match: { name: "Wa La La Noodles", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYksrcuRlwk/", creator: "_adatewithkait", reach: 315, postedAt: "2026-05-20", caption: "Hand-pulled beef noodles in Orlando, filmed by a local creator." }] },
  { key: "hh-bagels-altamonte-springs", match: { name: "H&H Bagels", city: "Altamonte Springs" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYfAjy0RT-6/", creator: "_adatewithkait", reach: 127, postedAt: "2026-05-18", caption: "New-York-style bagels in Altamonte Springs, filmed by a local creator." }] },
  { key: "woodhouse-spa-altamonte-springs", match: { name: "Woodhouse Spa", city: "Altamonte Springs" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYVekDgx_cm/", creator: "_adatewithkait", reach: 216, postedAt: "2026-05-14", caption: "A day spa in Altamonte Springs, filmed by a local creator." }] },
  { key: "parlor-doughnuts-orlando", match: { name: "Parlor Doughnuts", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYE5N5cR8YB/", creator: "_adatewithkait", reach: 137, postedAt: "2026-05-08", caption: "A doughnut counter in Orlando, filmed by a local creator on a limited seasonal box." }] },
  { key: "banh-mi-go-orlando", match: { name: "Banh Mi Go", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DX8ULEFCpvi/", creator: "_adatewithkait", reach: 150, postedAt: "2026-05-04", caption: "Banh mi and pho in Orlando's SoDo, filmed by a local creator at its grand opening." }] },
  { key: "hamlin-house-social-orlando", match: { name: "Hamlin House Social", city: "Winter Garden" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXO7EbzkXiB/", creator: "_adatewithkait", reach: 185, postedAt: "2026-04-17", caption: "Courts, food and a patio in one room at Hamlin, filmed by a local creator." }] },
  { key: "baires-grill-orlando", match: { name: "Baires Grill", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXKruaXEeT8/", creator: "_adatewithkait", reach: 264, postedAt: "2026-04-15", caption: "An Argentine grill in Orlando, filmed by a local creator." }] },
  { key: "great-big-game-show-orlando", match: { name: "The Great Big Game Show", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWkCnINEVAP/", creator: "_adatewithkait", reach: 86, postedAt: "2026-03-31", caption: "A team-vs-team live game show in Orlando, filmed by a local creator." }] },
  { key: "four-flamingos-orlando", match: { name: "Four Flamingos", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWUovChEda4/", creator: "_adatewithkait", reach: 78, postedAt: "2026-03-25", caption: "A Richard Blais seafood room at the Hyatt Regency Grand Cypress, filmed by a local creator." }] },
  { key: "color-me-mine-altamonte-springs", match: { name: "Color Me Mine", city: "Altamonte Springs" },
    category: "Family",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaL8-IYRL9a/", creator: "_adatewithkait", reach: 89, postedAt: "2026-06-29", caption: "A paint-your-own pottery studio in Altamonte Springs, filmed by a local creator." }] },
  { key: "grove-resort-water-park-winter-garden", match: { name: "The Grove Resort & Water Park", city: "Winter Garden" },
    address: "14501 Grove Resort Ave, Winter Garden, FL 34787", category: "Stays",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbbhaJvtlFp/", creator: "magicalmaddieb", postedAt: "2026-07-30", caption: "An Orlando family resort with its own water park, filmed by a local creator." }] },
  { key: "volcano-bay-orlando", match: { name: "Universal Volcano Bay", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXj9uMcgFWc/", creator: "magicalmaddieb", reach: 385, postedAt: "2026-04-25", caption: "Universal's water park and its after-hours summer nights, filmed by a local creator." }] },
  { key: "blue-man-group-orlando", match: { name: "Blue Man Group", city: "Orlando" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Davc2nGt2Jr/", creator: "magicalmaddieb", postedAt: "2026-07-13", caption: "The Blue Man Group residency at ICON Park, filmed by a local creator." }] },
  { key: "epic-universe-orlando", match: { name: "Universal Epic Universe", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DagwO9NgYZw/", creator: "magicalmaddieb", reach: 240, postedAt: "2026-07-07", caption: "Universal's newest park and its after-hours nights, filmed by a local creator." }] },
  { key: "aquatica-orlando", match: { name: "Aquatica Orlando", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYfPNhxgnIb/", creator: "magicalmaddieb", reach: 138, postedAt: "2026-05-18", caption: "Aquatica's after-dark Aqua Glow event, filmed by a local creator." }] },
  { key: "pizza-ponte-disney-springs", match: { name: "Pizza Ponte", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYNN6vfgQ1D/", creator: "magicalmaddieb", reach: 165, postedAt: "2026-05-11", caption: "Roman-style slices at Disney Springs, filmed by a local creator." }] },
  { key: "ivory-nail-lounge-orlando", match: { name: "Ivory Nail Lounge", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYAHGzNgaOa/", creator: "magicalmaddieb", reach: 201, postedAt: "2026-05-06", caption: "A nail salon in the Orlando area, filmed by a local creator." }] },
  { key: "sage-head-spa-winter-park", match: { name: "Sage Head Spa", city: "Winter Park" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DX1ySKLgXFC/", creator: "magicalmaddieb", postedAt: "2026-05-02", caption: "A head-spa treatment room in Winter Park, filmed by a local creator." }] },
  { key: "dollywood-splash-country", match: { name: "Dollywood's Splash Country" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8O6HnApNf/", creator: "magicalmaddieb", postedAt: "2026-07-18", caption: "Dollywood's water park in the Smoky Mountains, filmed by a Florida creator on a trip." }] },

  // ── @stufftodointampabay — Tampa Bay things to do (2026-08-07) ──
  // Same rule as the batch above: every post opened and read. This creator is
  // the widest of the five by CATEGORY rather than by geography — bookstores,
  // glassblowing, needlepoint, aerial arts, an arcade — which is why so many of
  // these carry a category other than Food. Four supplied posts are not entered:
  // an August events round-up and an Anna Maria Island itinerary (both are lists,
  // not a venue we can send someone to), and two whose venue city the caption
  // never states are entered by NAME ONLY.
  { key: "cookie-dough-bliss-tampa", match: { name: "Cookie Dough Bliss", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbsxXh2hdSD/", creator: "stufftodointampabay", reach: 137, postedAt: "2026-08-05", caption: "Edible cookie dough by the spoonful in Tampa, filmed by a local creator." }] },
  { key: "howard-and-platt-tampa", match: { name: "Howard & Platt", city: "Tampa" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbqMjUxBpul/", creator: "stufftodointampabay", reach: 522, postedAt: "2026-08-04", caption: "A SoHo dining room with a Tuesday-to-Friday happy hour, filmed by a local creator." }] },
  { key: "born-and-bread-bakehouse-lakeland", match: { name: "Born & Bread Bakehouse", city: "Lakeland" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbeNz-JhPPx/", creator: "stufftodointampabay", reach: 547, postedAt: "2026-07-31", caption: "An artisan bakehouse in Lakeland known for croissants and cruffins, filmed by a local creator." }] },
  { key: "tommys-chophouse-tampa", match: { name: "Tommy's Chophouse", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbYMItJhBTW/", creator: "stufftodointampabay", reach: 614, postedAt: "2026-07-28", caption: "A new Ybor steakhouse named for a Tampa architect, filmed by a local creator." }] },
  { key: "heights-drive-thru-tampa", match: { name: "Heights Drive Thru", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbQ4qH9BUjc/", creator: "stufftodointampabay", reach: 817, postedAt: "2026-07-26", caption: "A drive-thru bodega in Tampa Heights doing coffee, sandwiches and groceries, filmed by a local creator." }] },
  { key: "circus-arts-foundry-tampa", match: { name: "Circus Arts Foundry", city: "Tampa" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbOL3rthpb0/", creator: "stufftodointampabay", reach: 515, postedAt: "2026-07-25", caption: "Aerial-arts classes for all levels in Tampa Bay, filmed by a local creator." }] },
  { key: "nueva-cantina-tampa", match: { name: "Nueva Cantina", city: "Tampa" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbEgtYDhrLD/", creator: "stufftodointampabay", reach: 306, postedAt: "2026-07-21", caption: "Tequila-infused soft-serve margaritas downtown, filmed by a local creator." }] },
  { key: "dairy-joy-tampa", match: { name: "Dairy Joy", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbBwea4h2VX/", creator: "stufftodointampabay", reach: 335, postedAt: "2026-07-20", caption: "A retro Tampa ice cream stand open since 1958, filmed by a local creator." }] },
  { key: "loveshackfancy-tampa", match: { name: "LoveShackFancy", city: "Tampa" },
    category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da-lXn3hlOF/", creator: "stufftodointampabay", reach: 237, postedAt: "2026-07-17", caption: "The brand's first Tampa store, at Hyde Park Village, filmed by a local creator." }] },
  { key: "birdettes-tampa", match: { name: "Birdette's" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8AmPGhI6i/", creator: "stufftodointampabay", reach: 2394, postedAt: "2026-07-17", caption: "A craft cafe in Tampa Bay where you make something and take it home, filmed by a local creator." }] },
  { key: "book-rescuers", match: { name: "Book Rescuers" },
    category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da3vq20h_xT/", creator: "stufftodointampabay", reach: 923, postedAt: "2026-07-16", caption: "Affordable pre-loved books, filmed by a local creator." }] },
  { key: "beach-house-coffee-tampa-bay", match: { name: "Beach House Coffee" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DawFjyoxUlM/", creator: "stufftodointampabay", reach: 222, postedAt: "2026-07-13", caption: "A beach-house-styled coffee shop in Tampa Bay, filmed by a local creator." }] },
  { key: "fit-bowl-co", match: { name: "Fit Bowl Co." },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dad6iPIBmWC/", creator: "stufftodointampabay", reach: 106, postedAt: "2026-07-02", caption: "Acai bowls and fruit smoothies, filmed by a local creator." }] },
  { key: "sunshine-needlepoint-tampa-bay", match: { name: "Sunshine Needlepoint" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaWHxuDyE9a/", creator: "stufftodointampabay", reach: 170, postedAt: "2026-07-03", caption: "A needlepoint shop in Tampa Bay built for sitting and stitching, filmed by a local creator." }] },
  { key: "new-york-bagel-cafe-tampa", match: { name: "New York Bagel Cafe", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaOcFmUy7Iq/", creator: "stufftodointampabay", reach: 235, postedAt: "2026-06-30", caption: "Bagels and iced coffee inside Carrollwood Village Park, filmed by a local creator." }] },
  { key: "food-and-beer-tampa", match: { name: "Food+Beer", city: "Tampa" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZvql_MxaOJ/", creator: "stufftodointampabay", reach: 118, postedAt: "2026-06-18", caption: "Big screens, beer and matchday atmosphere in Tampa, filmed by a local creator." }] },
  { key: "black-english-bookstore", match: { name: "Black English Bookstore" },
    category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZm5GpUx_K3/", creator: "stufftodointampabay", reach: 551, postedAt: "2026-06-15", caption: "A bookstore and community hub for Black literature and history, filmed by a local creator." }] },
  { key: "zen-glass-studio-st-petersburg", match: { name: "Zen Glass Studio", city: "St. Petersburg" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZdqNq5RkUd/", creator: "stufftodointampabay", reach: 834, postedAt: "2026-06-11", caption: "Beginner-friendly glassblowing in St. Pete, filmed by a local creator." }] },
  { key: "gametime-tampa", match: { name: "Gametime", city: "Tampa" },
    category: "Family",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZaOKsDxD3J/", creator: "stufftodointampabay", reach: 77, postedAt: "2026-06-10", caption: "Arcade games, mini bowling and food under one roof, filmed by a local creator." }] },
  { key: "roasted813-tampa", match: { name: "Roasted813", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZVkJ70yIsT/", creator: "stufftodointampabay", reach: 235, postedAt: "2026-06-08", caption: "The viral dot cake, from a Tampa dessert maker, filmed by a local creator." }] },
  { key: "drip-ybor-tampa", match: { name: "Drip Ybor", city: "Tampa" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZI8YuHRPtY/", creator: "stufftodointampabay", reach: 548, postedAt: "2026-06-03", caption: "A pottery wheel session in Ybor, filmed by a local creator." }] },
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

  // PASS 1 — exact Google place_id, across EVERY entry, before any name guessing.
  // A place_id identifies exactly one venue, so this can never mis-attribute a
  // creator's video to the wrong business.
  //
  // v6.96 — this used to be ONE loop that tried placeId and name per entry and
  // returned the first hit either way, which made attribution depend on array
  // ORDER. That is a real bug, not a theoretical one: the @alexandramartin_tv
  // batch added an entry whose venue is genuinely named "PASTA", and norm()
  // makes "pasta" a substring of "borti pasta bar". Under the old loop, whichever
  // of the two sat earlier in CURATED stole the other's video — even though BOTH
  // carry a correct placeId that would have resolved them exactly.
  const pid = place.id != null ? String(place.id) : "";
  if (pid) {
    for (const e of CURATED) {
      if (e.placeId && String(e.placeId) === pid) return renderable(e.videos);
    }
  }

  // PASS 2 — name (+ city) fallback, for hand-curated entries with no id yet.
  // BEST match wins, never the first one found, so array order cannot decide
  // attribution here either. "Best" is: a curated name that begins the place's
  // name outranks one buried inside it, and among equals the longer wins.
  //
  // Both halves are load-bearing. Length alone does NOT separate the real
  // collision — norm("Borti") and norm("PASTA") are both 5 characters, and
  // "borti pasta bar" contains both — but only "borti" starts it. A curated
  // name is the venue's leading name in every entry in this file, so
  // prefix-beats-substring is the honest tiebreak, not a hack for one pair.
  const nm = norm(place.name);
  if (!nm) return [];
  let best = null;
  let bestScore = 0;
  for (const e of CURATED) {
    if (!e.match) continue;
    const cnm = norm(e.match.name);
    if (!cnm) continue;
    const at = nm.indexOf(cnm);
    if (at < 0) continue;
    const score = (at === 0 ? 1000 : 0) + cnm.length;
    if (score <= bestScore) continue;
    if (!cityMatches(place, locName, e.match.city)) continue;
    best = e;
    bestScore = score;
  }
  return best ? renderable(best.videos) : [];
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
    if (vids.length) spots.push({ key: e.key, name: e.displayName || (e.match && e.match.name) || e.key, city: (e.match && e.match.city) || "", video: vids[0] });
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
  // 2026-08-08 batch. Centroids only — this table sorts, it is never shown
  // (see the note at the top of CITY_COORDS); a "35 mi" label built from a
  // city centre would claim a precision the data cannot back.
  Palmetto: { lat: 27.5214, lng: -82.5726 },
  Nokomis: { lat: 27.1181, lng: -82.4442 },
  Gibsonton: { lat: 27.8542, lng: -82.3756 },
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
  // v6.96 — the @alexandramartin_tv South Florida batch. Real, public city-center
  // coordinates; used ONLY to sort the "browse by location" view nearest-first,
  // never shown to a user and never presented as a venue's own position.
  // 2026-08-07 — the @tampaiman / @_adatewithkait / @magicalmaddieb batch. Same
  // rule as every entry above: real published city-center coordinates, used ONLY
  // to sort "browse by location" nearest-first. Never shown, and never presented
  // as a venue's own position. A city that a caption did not state is NOT here —
  // those entries match by name alone and sort after the located ones.
  "Temple Terrace": { lat: 28.0353, lng: -82.3893 },
  "Wesley Chapel": { lat: 28.2397, lng: -82.3279 },
  Lutz: { lat: 28.1511, lng: -82.4615 },
  Longwood: { lat: 28.7031, lng: -81.3384 },
  "Altamonte Springs": { lat: 28.6611, lng: -81.3656 },
  Oviedo: { lat: 28.6700, lng: -81.2081 },
  Sanford: { lat: 28.8003, lng: -81.2731 },
  "Winter Park": { lat: 28.6000, lng: -81.3392 },
  "Winter Garden": { lat: 28.5653, lng: -81.5862 },
  "Miami Beach": { lat: 25.7907, lng: -80.1300 },
  "North Miami": { lat: 25.8901, lng: -80.1867 },
  Doral: { lat: 25.8195, lng: -80.3553 },
  Hialeah: { lat: 25.8576, lng: -80.2781 },
  Homestead: { lat: 25.4687, lng: -80.4776 },
  Hollywood: { lat: 26.0112, lng: -80.1495 },
  // v6.96b — the @secretsoftampabay batch.
  "Clearwater Beach": { lat: 27.9775, lng: -82.8271 },
  "Apollo Beach": { lat: 27.7728, lng: -82.4070 },
  "Longboat Key": { lat: 27.4128, lng: -82.6584 },
  Dunedin: { lat: 28.0197, lng: -82.7873 },
  "Madeira Beach": { lat: 27.7973, lng: -82.7998 },
  Riverview: { lat: 27.8661, lng: -82.3265 },
  "Spring Hill": { lat: 28.4769, lng: -82.5254 },
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
    // displayName ?? match.name (2026-08-07, owner screenshot): match.name is
    // the MATCHER'S root, deliberately shortened for robustness — the Parrish
    // row is "Ryan" because norm() breaks "Ryan's" on the apostrophe. Renders
    // straight from the matcher leaked that root into the browse sheet as a
    // place apparently named "Ryan". Rows whose match root is not a human
    // label carry displayName; the matcher keeps its root untouched.
    byCity.get(city).push({ key: e.key, name: e.displayName || e.match.name, city, video: vids[0] });
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
      const spot = { key: e.key, name: e.displayName || (e.match && e.match.name) || e.key, city: (e.match && e.match.city) || "", platform: v.platform, video: v };
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
