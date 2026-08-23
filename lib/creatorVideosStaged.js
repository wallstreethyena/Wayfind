// lib/creatorVideosStaged.js — the CURATION BACKLOG, deliberately out of the app.
//
// v8.43. These are researched creator finds whose NATIVE post URL has not been
// captured yet: `url: ""`, plus an `evidenceUrl` (commented) pointing at where
// the find came from. Every one of them used to live in CURATED, in
// lib/creatorVideos.js, which is a CLIENT-BUNDLED module.
//
// They could never render from there. renderable() drops any video with an
// empty url, and every reader in that file — creatorVideosFor, videosByKey,
// spotsByCity, creatorStats, allCreators, regionsWithFinds, libraryStats —
// goes through it. So these entries contributed exactly nothing at runtime
// while shipping 16.2KB of unreachable data to every visitor's browser.
//
// The deploy gate is what found it: scripts/check-bundle.mjs failed on the
// route JS budget when a 93-place batch landed, and the honest fix was not to
// raise a ratchet that exists to be lowered — it was to stop shipping data
// nothing can read.
//
// WHAT CHANGED FOR A CURATOR. The old comment in creatorVideos.js promised
// that "a staged entry auto-appears AND auto-boosts the moment its url is
// filled — no other code change needed." That is no longer true, and the new
// workflow is better: fill the url here, then MOVE the entry into CURATED.
// Activating a place is now an explicit, reviewable edit rather than a silent
// one-character change that flips a venue into the live ranking — which
// matters more since v8.42, because a second creator on a place now moves it
// up the list and puts a badge on it.
//
// scripts/test-creator-corroboration.mjs asserts that CURATED holds no staged
// entries and that no runtime module imports this file, so the two can never
// quietly merge back together.
//
// NOT imported by lib/ or app/. Curation tooling only.

export const STAGED = [
  { key: "juicys-famous-fair-food-bradenton", match: { name: "Juicy's Famous Fair Food", city: "Bradenton" },
    address: "2319 Cortez Rd W, Bradenton, FL 34207", category: "Food",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/jiggs-landing-preserve-r3UWTa1H", */ /* needsNativeUrl: true, */ creator: "camargz", /* views: "1,004,129", */ caption: "A creator's run through the burgers and fair-food classics at this Bradenton spot." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/jiggs-landing-preserve-r3UWTa1H", */ /* needsNativeUrl: true, */ creator: "l3xiluthor", /* views: "403,180", */ caption: "A local's taste test of the funnel cakes, corn dogs, and fried Oreos here." }] },
  { key: "los-laureles-supermarket-bradenton", match: { name: "Los Laureles Supermarket", city: "Bradenton" },
    address: "2424 Manatee Ave E, Bradenton, FL 34208", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/palma-sola-causeway-park-EQCElueU", */ /* needsNativeUrl: true, */ creator: "camargz", /* views: "314,602", */ caption: "A creator's take on the authentic Mexican tacos from this Bradenton market's taqueria." }] },
  { key: "sweet-krunch-bradenton", match: { name: "Sweet Krunch", city: "Bradenton" },
    address: "5605 Manatee Ave W, Bradenton, FL 34209", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/jiggs-landing-preserve-r3UWTa1H", */ /* needsNativeUrl: true, */ creator: "camargz", /* views: "106,107", */ caption: "A creator's visit for the Korean fried chicken at this West Bradenton spot." }] },
  { key: "wingstop-bradenton", match: { name: "Wingstop", city: "Bradenton" },
    address: "3553 1st St E, Bradenton, FL 34208", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/old-main-street-bradenton-YdfX6sGz", */ /* needsNativeUrl: true, */ creator: "flossakushie", /* views: "7.4M", */ caption: "A creator reacts to Wingstop's wings.", /* warning: "'Food REACTION' video — often NOT filmed at the venue. Confirm it's an actual visit before it renders." */ }] },
  { key: "pier-22-bradenton", match: { name: "Pier 22", city: "Bradenton" },
    address: "1200 1st Ave W, Bradenton, FL 34205", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/bradenton-riverwalk-eG-mq5BW", */ /* needsNativeUrl: true, */ creator: "beachsammy", /* views: "1.6K", */ caption: "A creator's stop for calamari, oysters, and steak at this downtown Bradenton waterfront restaurant." }] },
  { key: "la-violetta-sarasota", match: { name: "La Violetta", city: "Sarasota" },
    address: "4837 Swift Rd Ste 100, Sarasota, FL 34231", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/marcello-ristorante-6Ph63Fen", */ /* needsNativeUrl: true, */ creator: "thecrazycreativeteacher", /* views: "64.1K", */ caption: "A creator's visit to this rustic Italian restaurant in Sarasota." }] },
  { key: "michelles-brown-bag-cafe-sarasota", match: { name: "Michelle's Brown Bag Cafe", city: "Sarasota" },
    address: "630 S Orange Ave, Sarasota, FL 34236", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/burns-court-sarasota-cRLOcPRK", */ /* needsNativeUrl: true, */ creator: "thesarasotalocals", /* views: "83K", */ caption: "A local's bagel-and-lunch stop at this downtown Sarasota cafe." }] },
  { key: "project-coffee-sarasota", match: { name: "Project Coffee", city: "Sarasota" }, /* note: "TWO locations (also 1419 5th St) - disambiguate", */
    address: "538 S Pineapple Ave, Sarasota, FL 34236", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/sarasota/rosemary-district-Kl0KoiLK", */ /* needsNativeUrl: true, */ creator: "makayluhhhhh", /* views: "3.2K", */ caption: "A creator's order of strawberry matcha and a mocha at this Sarasota coffee shop." }] },
  { key: "ofkors-bakery-sarasota", match: { name: "OfKors Bakery", city: "Sarasota" }, /* note: "TWO locations (also 3945 Cattlemen Rd) - disambiguate", */
    address: "1359 Main St, Sarasota, FL 34236", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/main-street-sarasota--rMBNiqp", */ /* needsNativeUrl: true, */ creator: "inna_revega", /* views: "1.8K", */ caption: "A creator's visit for blini, sandwiches, and desserts at this Sarasota European bakery." }] },
  { key: "arts-and-central-sarasota", match: { name: "Arts & Central", city: "Sarasota" },
    address: "611 Central Ave, Sarasota, FL 34236", category: "Food",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/sarasota/rosemary-district-Kl0KoiLK", */ /* needsNativeUrl: true, */ creator: "sarasotarealtorkatrin", /* views: "4K", */ caption: "A creator's night out for American food and cocktails in Sarasota's Rosemary District." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/sarasota/rosemary-district-Kl0KoiLK", */ /* needsNativeUrl: true, */ creator: "srqtiff", /* views: "2.7K", */ caption: "A creator's look at the art-inspired menu at this Rosemary District restaurant." }] },
  { key: "tide-tables-cortez", match: { name: "Tide Tables Restaurant and Marina", city: "Cortez" }, /* note: "City is Cortez, not Holmes Beach", */
    address: "12507 Cortez Rd W, Cortez, FL 34215", category: "Food",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/holmes-beach/tide-tables-restaurant-and-marina-GdciCRDd", */ /* needsNativeUrl: true, */ creator: "pinkpalmettotravelclub", /* views: "27.6K", */ caption: "A creator's waterfront meal of grouper and peel-and-eat shrimp in Cortez." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/holmes-beach/tide-tables-restaurant-and-marina-GdciCRDd", */ /* needsNativeUrl: true, */ creator: "michaelrenick3", /* views: "23.6K", */ caption: "A creator's plate of grouper and key lime pie at this Cortez marina restaurant." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/holmes-beach/tide-tables-restaurant-and-marina-GdciCRDd", */ /* needsNativeUrl: true, */ creator: "mickeyguru_shalon", /* views: "2.8K", */ caption: "A creator's grouper bites with a waterfront view in Cortez." }] },
  { key: "star-fish-company-cortez", match: { name: "Star Fish Company", city: "Cortez" }, /* note: "City is Cortez", */
    address: "12306 46th Ave W, Cortez, FL 34215", category: "Food",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/cortez-historic-fishing-village-bboCou8V", */ /* needsNativeUrl: true, */ creator: "sarahsoutdooradventuresfl", /* views: "17.1K", */ caption: "A creator's Cortez seafood guide featuring this dockside fish market." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/cortez-historic-fishing-village-bboCou8V", */ /* needsNativeUrl: true, */ creator: "movemetolwr", /* views: "8.1K", */ caption: "A creator's fresh dockside seafood stop at this Cortez market." }] },
  { key: "dry-dock-longboat-key", match: { name: "Dry Dock Waterfront Grill", city: "Longboat Key" }, /* note: "City is Longboat Key, not Sarasota", */
    address: "412 Gulf of Mexico Dr, Longboat Key, FL 34228", category: "Food",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/dry-dock-waterfront-grill-RUvJLGtJ", */ /* needsNativeUrl: true, */ creator: "godfatherofmeat", /* views: "10.6K", */ caption: "A creator's waterfront dining pick on Longboat Key." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/dry-dock-waterfront-grill-RUvJLGtJ", */ /* needsNativeUrl: true, */ creator: "beachsammy", /* views: "7K", */ caption: "A creator's Longboat Key waterfront restaurant roundup." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/dry-dock-waterfront-grill-RUvJLGtJ", */ /* needsNativeUrl: true, */ creator: "explorewithmedaily", /* views: "2.6K", */ caption: "A quick creator visit to this Longboat Key waterfront grill." }] },
  { key: "tookies-and-treats-ellenton", match: { name: "Tookies & Treats", city: "Ellenton" },
    address: "5355 Factory Shops Blvd, Ellenton, FL 34222", category: "Food",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/ellenton/ellenton-premium-outlets--uQsdLV_", */ /* needsNativeUrl: true, */ creator: "tookiesandtreats", /* views: "53.5K", */ caption: "A look at the scratch-made cookies and cobblers at this Ellenton bakery.", /* warning: "@tookiesandtreats is the bakery's OWN account - business self-promo, not independent-creator UGC. Label as the venue's own post or hold." */ }] },
  { key: "olearys-tiki-bar-sarasota", match: { name: "O'Leary's Tiki Bar", city: "Sarasota" },
    address: "5 Bayfront Dr, Sarasota, FL 34236", category: "Nightlife",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/restaurants/united-states/sarasota/lido-key-tiki-bar-t97vUvtd", */ /* needsNativeUrl: true, */ creator: "explorewithmedaily", /* views: "107K", */ caption: "A creator's visit to this bayfront tiki bar in Sarasota." }] },
  { key: "myakka-river-state-park", match: { name: "Myakka River State Park", city: "Sarasota" },
    address: "13208 State Road 72, Sarasota, FL 34241", category: "Activities",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/myakka-river-state-park-0OHjRrkg", */ /* needsNativeUrl: true, */ creator: "followmeaway", /* views: "2.1M", */ caption: "A creator's wildlife and alligator encounter at this Sarasota state park." }] },
  { key: "siesta-beach-sarasota", match: { name: "Siesta Beach", city: "Sarasota" }, /* note: "distinct from Siesta Key Village", */
    address: "948 Beach Rd, Sarasota, FL 34242", category: "Activities",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", */ /* needsNativeUrl: true, */ creator: "thingstodotampabay", /* views: "1.8M", */ caption: "A creator's guide to Siesta Key's famous public beach." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", */ /* needsNativeUrl: true, */ creator: "sarasotajenn", /* views: "591.1K", */ caption: "A local's Siesta Key beach day and exploration." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", */ /* needsNativeUrl: true, */ creator: "paolamorenou_", /* views: "542.8K", */ caption: "A creator's take on Siesta Beach as a low-cost Florida day out." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", */ /* needsNativeUrl: true, */ creator: "danaystojeiro", /* views: "415.6K", */ caption: "A creator's guide to Siesta Beach." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", */ /* needsNativeUrl: true, */ creator: "thingstodo.florida", /* views: "272.0K", */ caption: "A creator's walkthrough of Siesta Key Beach." }] },
  { key: "siesta-key-village", match: { name: "Siesta Key Village", city: "Sarasota" }, /* note: "district, not one venue", */
    address: "Ocean Blvd & Canal Rd, Sarasota, FL 34242", category: "Shopping",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/siesta-key-beach-XLQvli5C", */ /* needsNativeUrl: true, */ creator: "thingstodotampabay", /* views: "678.7K", */ caption: "A creator's tour of the shops and dining in Siesta Key Village." }] },
  { key: "gamble-plantation-ellenton", match: { name: "Gamble Plantation Historic State Park", city: "Ellenton" },
    address: "3708 Patten Ave, Ellenton, FL 34222", category: "Activities",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/ellenton/gamble-plantation-historic-state-park-UYNCdJeC", */ /* needsNativeUrl: true, */ creator: "historical.cheese", /* views: "806.3K", */ caption: "A creator's visit to this antebellum historic site in Ellenton." }] },
  { key: "ca-dzan-the-ringling-sarasota", match: { name: "Ca' d'Zan", city: "Sarasota" }, /* note: "inside The Ringling estate, not standalone", */
    address: "5401 Bay Shore Rd, Sarasota, FL 34243", category: "Activities",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/ca-dzan-CqHZzLpb", */ /* needsNativeUrl: true, */ creator: "everencephotography", /* views: "607.4K", */ caption: "A creator's sunset shots of the Ca' d'Zan mansion at The Ringling." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/ca-dzan-CqHZzLpb", */ /* needsNativeUrl: true, */ creator: "thefloridaqueenie_", /* views: "392.2K", */ caption: "A creator's visit to The Ringling and the Ca' d'Zan mansion." }] },
  { key: "robinson-preserve-bradenton", match: { name: "Robinson Preserve", city: "Bradenton" },
    address: "1704 99th St NW, Bradenton, FL 34209", category: "Activities",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/bradenton/riverview-pointe-preserve-H64Bu1wa", */ /* needsNativeUrl: true, */ creator: "mustseeflorida", /* views: "246.2K", */ caption: "A creator's outdoor and family guide to this Bradenton nature preserve." }] },
  { key: "st-armands-circle-sarasota", match: { name: "St. Armands Circle", city: "Sarasota" }, /* note: "district, not one venue", */
    address: "300 Madison Dr, Sarasota, FL 34236", category: "Shopping",
    videos: [{ platform: "tiktok", url: "", /* evidenceUrl: "https://airial.travel/attractions/united-states/sarasota/st-armands-circle-gNqAAyh8", */ /* needsNativeUrl: true, */ creator: "sarasota_fl_living", /* views: "89.9K", */ caption: "A local's roundup of restaurants around St. Armands Circle." }] },
  { key: "bradenton-motorsports-park", match: { name: "Bradenton Motorsports Park", city: "Bradenton" }, /* note: "NOT LECOM Park (baseball). 'FL2K' is an event held here.", */
    address: "21000 State Road 64 E, Bradenton, FL 34212", category: "Activities",
    videos: [
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", */ /* needsNativeUrl: true, */ creator: "jairmr2", /* views: "607.6K", */ caption: "A creator's day at the FL2K drag-racing event at Bradenton Motorsports Park." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", */ /* needsNativeUrl: true, */ creator: "f90.0li", /* views: "447.8K", */ caption: "A creator's FL2K drag-racing experience at this Bradenton strip." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", */ /* needsNativeUrl: true, */ creator: "racingflorida", /* views: "201.8K", */ caption: "A creator's drag-racing run at Bradenton Motorsports Park." },
      { platform: "tiktok", url: "", /* evidenceUrl: "https://www.airial.travel/attractions/united-states/bradenton/lecom-park-bradenton-F-0YByN9", */ /* needsNativeUrl: true, */ creator: "visions_chronicles", /* views: "160.2K", */ caption: "A creator's FL2K car experience at this Bradenton drag strip." }] },
];
