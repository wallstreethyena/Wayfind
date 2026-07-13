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
  { key: "aqua-tequila-parrish", match: { name: "Aqua Tequila", city: "Parrish" },
    address: "8950 US-301 N #133, Parrish, FL 34219", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@juliefranklinteam/photo/7563421625186536718", link_type: "native-photo", creator: "juliefranklinteam", views: "1.17K", caption: "A local's look at this new Mexican restaurant in Parrish.", warning: "Native link is a PHOTO post, not a video; creator->venue match is inferred. Confirm before render." }] },

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
