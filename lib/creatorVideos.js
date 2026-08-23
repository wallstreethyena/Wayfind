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
        // creator: TODO — no handle in the share URL; do not fabricate.,
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
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@thefloridaqueenie_/video/7358206182676352298", creator: "thefloridaqueenie_", /* views: "756K", */ }] },
  { key: "perspire-lakewood-ranch", match: { name: "Perspire Sauna Studio", city: "Sarasota" },
    address: "309 N Cattlemen Rd, Sarasota, FL 34232", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@theerynlalonde/video/7593470206069017870", creator: "theerynlalonde", /* views: "390", */ }] },

  // ── FOOD (staged: url:"" until the native post is captured) ──
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

  // ── ACTIVITIES / ATTRACTIONS (staged) ──

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
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7668348057171365133", creator: "cindy.selects" }] },
  { key: "dolce-and-bake-orlando", match: { name: "Dolce", city: "Orlando" }, /* note: "Match root kept short — the business appears as both \"Dolce & Bake\" and \"Dolce and Bake Cafe/Bakery\" across sources, and the city gate (Orlando) is what actually excludes the unrelated Dolce Bakery & Cafe in Kissimmee, a different business at a different address.", */
    address: "8143 S John Young Pkwy, Orlando, FL", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7667937697171885326", creator: "cindy.selects" }] },
  { key: "seek-first-coffee-shop-orlando", match: { name: "Seek First", city: "Orlando" }, /* note: "Formerly \"But First Coffee Shop\" — some directories/ordering pages still carry the old name at the same Pine Castle address.", */
    address: "7726 Winegard Rd, Orlando, FL 32809", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7668826743108537613", creator: "cindy.selects" }] },
  { key: "neuroplay-sensory-playroom-orlando", match: { name: "NeuroPlay", city: "Orlando" },
    address: "6220 Hazeltine National Dr #111, Orlando, FL 32822", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7669065801369914638", creator: "cindy.selects" }] },
  { key: "ryans-coffee-house-parrish", placeId: "ChIJo_IdHf0lw4gRHDbQNKBRE84", match: { name: "Ryan", city: "Parrish" }, displayName: "Ryan's Coffee House", /* note: "2026-08-08 (owner: video not showing up): shipped without a placeId, relying entirely on the name+city PASS 2 fallback — which only fires for a place already in whatever pool Google's nearby search happened to load for that visitor. Confirmed via a live /api/places/search text query (this route, server-keyed) that the business is real, open, and correctly typed [\"coffee_shop\",\"cafe\",...] at this exact address — nothing wrong with the listing itself, just no placeId to resolve it once loaded. Root kept to \"Ryan\" for the PASS 2 fallback path (still useful if this ID is ever superseded) — norm() turns the apostrophe in \"Ryan's\" into a space, which can break a longer substring match depending on how Wayfind's own place-name string is punctuated. displayName carries the human label the sheet shows.", */
    address: "8231 US-301, Parrish, FL 34219", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7664006021349723405", creator: "cindy.selects" }] },
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
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@parrishfloridahomes/video/7625665948711718158", creator: "parrishfloridahomes" }] },
  { key: "mote-sea-aquarium-sarasota", placeId: "ChIJRyOEfAo5w4gR664aD_YYBLU", match: { name: "Mote Science Education Aquarium", city: "Sarasota" }, displayName: "Mote Science Education Aquarium (SEA)",
    address: "225 University Town Center Dr, Sarasota, FL 34243", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7647673425548430605", creator: "manateelittlelocals" }] },
  { key: "bishop-museum-bradenton", placeId: "ChIJr7ec9tEXw4gRwicCx3wfH2w", match: { name: "Bishop Museum", city: "Bradenton" }, displayName: "The Bishop Museum of Science and Nature",
    address: "201 10th St W, Bradenton, FL 34205", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7649896505108598047", creator: "manateelittlelocals" }] },
  { key: "eleanors-coffee-cakes-palmetto", placeId: "ChIJHR5ndAAXw4gR8YMNFEoI_f0", match: { name: "Eleanors Coffee", city: "Palmetto" }, displayName: "Eleanors Coffee & Cakes",
    address: "449 10th Ave W, Palmetto, FL 34221", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7651059904530205982", creator: "manateelittlelocals" }] },
  { key: "heritage-harbour-park-bradenton", placeId: "ChIJhTVjs3o7w4gRzLPhLiXpCXs", match: { name: "Heritage Harbour Park", city: "Bradenton" }, displayName: "Heritage Harbour Park",
    address: "Bradenton, FL 34212", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7656593993286913311", creator: "manateelittlelocals" }] },
  { key: "northeast-venice-park-nokomis", placeId: "ChIJFaUWcgBbw4gRDb7B9bck8OU", match: { name: "Northeast Venice Park", city: "Nokomis" }, displayName: "Northeast Venice Park",
    address: "3560 Laurel Rd E, Nokomis, FL 34275", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7652542591308729631", creator: "manateelittlelocals" }] },
  { key: "lakewood-ranch-library-bradenton", placeId: "ChIJ_wDB-_Mxw4gR7-VDggiDis0", match: { name: "Lakewood Ranch Library", city: "Bradenton" }, displayName: "Lakewood Ranch Library",
    address: "16410 Rangeland Pkwy, Bradenton, FL 34211", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7665365282323582238", creator: "manateelittlelocals" }] },
  { key: "aleur-event-collective-sarasota", placeId: "ChIJh3AM9dxBw4gRhaIkp0z8rQE", match: { name: "ALEUR", city: "Sarasota" }, displayName: "ALEUR-Event Collective",
    address: "1001 Central Ave, Sarasota, FL 34236", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7666837987786820895", creator: "manateelittlelocals" }] },
  { key: "jj-foxs-treehouse-bradenton", placeId: "ChIJeTU_Lhk9w4gRYtxmZ9i_yP4", match: { name: "JJ Fox", city: "Bradenton" }, displayName: "JJ Fox's Treehouse",
    address: "907 57th St E, Bradenton, FL 34208", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7662469985997983006", creator: "manateelittlelocals" }] },
  { key: "capybara-cafe-st-petersburg", placeId: "ChIJHTdUDQT9wogRB5cYNqzhm_E", match: { name: "Capybara Cafe", city: "St. Petersburg" }, displayName: "Capybara Cafe",
    address: "4703 Park St N, St. Petersburg, FL 33709", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7618749588236668191", creator: "manateelittlelocals" }] },
  { key: "hogans-place-gibsonton", placeId: "ChIJi0X6m8_RwogRmw_ipYjNjpc", match: { name: "Hogan's Place", city: "Gibsonton" }, displayName: "Hogan's Place",
    address: "7023 Gibsonton Dr, Gibsonton, FL 33534", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7643181676293639455", creator: "manateelittlelocals" }] },
  { key: "popstroke-sarasota", placeId: "ChIJATacWyI5w4gR-qfYvgyJnfk", match: { name: "PopStroke", city: "Sarasota" }, displayName: "PopStroke",
    address: "195 University Town Center Dr, Sarasota, FL 34243", category: "Activities",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@manateelittlelocals/video/7667009868250877214", creator: "manateelittlelocals" }] },
  { key: "joy-coffee-bradenton", match: { name: "Joy Coffee", city: "Bradenton" },
    address: "4524 14th St W, Bradenton, FL 34207", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7662923109749640461", creator: "cindy.selects" }] },

  // ── 2026-08-22 batch: four more @cindy.selects finds (owner-supplied links) ──
  //
  // PROVENANCE, stated because attribution is the whole game here. Captions came
  // from TikTok's own public oEmbed endpoint (no scraping). The VENUE came from
  // each video's own location tag — item.poi.address in TikTok's page data, read
  // through the owner's logged-in browser — wherever the creator tagged one, and
  // never from a hashtag. Two of the four carry no POI tag; for those the venue
  // is the one the caption names outright ("Root & Seed", "Tuscan Hills"), each
  // of which resolves to exactly ONE operating Florida business. Every address
  // was then resolved to a Google place_id via the Places text-search API with
  // this repo's own server key, so PASS 1 settles attribution exactly and no
  // name collision can hand the credit to the wrong business.
  //
  // The fifth link the owner sent (video 7668826743108537613) is already curated
  // above as seek-first-coffee-shop-orlando — a duplicate, not a new find, and it
  // is deliberately NOT repeated here: two entries whose videos overlap would
  // double-count the creator's spot total in allCreators().
  { key: "maple-street-biscuit-dr-phillips-orlando", placeId: "ChIJwTbbJpx_54gRN5aKRhMcC18", match: { name: "Maple Street Biscuit", city: "Orlando" }, displayName: "Maple Street Biscuit Company",
    /* note: "The video's own location tag reads 11810 Glass House Ln #140, Orlando — the Dr. Phillips store. EIGHT Florida locations share this name (Riverview, Tampa, St. Pete, Kissimmee, Winter Garden, Oviedo…), and the caption's #MapleStreetBiscuitCompany hashtag names none of them. The placeId is the only thing keeping this credit on the right storefront; do not fall back to name+city here.", */
    address: "11810 Glass House Ln #140, Orlando, FL 32836", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7675873812293963022", creator: "cindy.selects" }] },
  { key: "root-and-seed-lakewood-ranch", placeId: "ChIJNx9_bQA5w4gRnwQGGQQhsLQ", match: { name: "Root and Seed", city: "Bradenton" }, displayName: "Root & Seed",
    /* note: "City is Bradenton, not Lakewood Ranch, because Bradenton is what the postal address and Wayfind's own place record say (34202); the creator's #LakewoodRanch hashtag is the neighbourhood name, and a city key that no place record carries would strand this row in browse-by-location. match.name uses \"and\" rather than \"&\" on purpose — norm() turns \"&\" into a space, so \"Root & Seed\" normalises to \"root seed\" and would NOT be a substring of the listing's own \"Root and Seed - Coffee & Gluten free bakery\".", */
    address: "8209 Natures Way Unit 107, Bradenton, FL 34202", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7673644888927292685", creator: "cindy.selects" }] },
  { key: "tuscan-hills-coffee-parrish", placeId: "ChIJPSkey7Elw4gR5gvfcin8NQc", match: { name: "Tuscan Hills", city: "Parrish" }, displayName: "Tuscan Hills Coffee Company",
    /* note: "The creator names Wayfind's own score in the video (\"I looked them up on Wayfind and it gave Tuscan Hills a 7.8/10 — did Wayfind get this one right?\"). Small listing (5 Google ratings at curation time), so the Wayfind Score is thin here by design, not by error.", */
    address: "12205 81st St E, Parrish, FL 34219", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7673283810074676494", creator: "cindy.selects" }] },
  { key: "hashtag-cafe-sarasota", placeId: "ChIJEUEmzE1Bw4gRHHXe_oxJF7E", match: { name: "Hashtag Cafe", city: "Sarasota" }, displayName: "Hashtag Café",
    /* note: "Location tag on the video: 2781 Bee Ridge Rd, Sarasota. norm() strips the accent, so the \"Hashtag Cafe\" root really does match the listing's \"Hashtag Café\".", */
    address: "2781 Bee Ridge Rd, Sarasota, FL 34239", category: "Food",
    videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@cindy.selects/video/7671424535832431885", creator: "cindy.selects" }] },

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
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DZS1ZQGpK77/", creator: "katelynintampa" }] },
  { key: "lucky-tigre-tampa", match: { name: "Lucky Tigre", city: "Tampa" },
    address: "1901 N Howard Ave, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DYkwpV9Rr6Y/", creator: "katelynintampa" }] },
  { key: "palaus-restaurant-tampa", match: { name: "Palaus Restaurant", city: "Tampa" },
    address: "2301 N Armenia Ave, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DbTYFQupyxt/", creator: "katelynintampa" }] },
  // v8.42 — CORROBORATED. @cailincoastal filmed the same retro coffee shop
  // independently of @katelynintampa. Second of the two places in the library
  // that clear CORROBORATION_MIN_CREATORS (lib/trendSignal.js).
  { key: "atomic-cat-st-petersburg", placeId: "ChIJSbDatOjnwogRLPoi6_FtJrM",
    match: { name: "Atomic Cat", city: "St. Petersburg" },
    address: "10387 Gandy Blvd N, St. Petersburg, FL 33702", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/reel/DbHSDSmpR6r/", creator: "katelynintampa" },
      { platform: "instagram", url: "https://www.instagram.com/p/DbEPx0JP4bX/", creator: "cailincoastal", /* postedAt: "2026-07-21", */ }] },
  { key: "ro-hyde-park-tampa", match: { name: "Ro Hyde Park", city: "Tampa" },
    address: "1500 W Swann Ave, Tampa, FL 33606", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DbDuqRGpOal/", creator: "katelynintampa" }] },

  // ── @fashion.eat.travel — "Ara Ayala, Travel & Food, FL" (Miami) ──
  // v8.43 — CORROBORATED. @gabrielaromero11 filmed the same Wynwood bakery
  // independently of @fashion.eat.travel, for its weekend brunch. placeId added
  // with the second video, which also retires the accent worry in the note
  // below: PASS 1 no longer depends on how the û survives encoding.
  { key: "boulan-wynwood-miami", placeId: "ChIJ18poUgC32YgRBBvIMo3rIH8",
    match: { name: "Boulan", city: "Miami" }, /* note: "Root kept to \"Boulan\" — norm() strips the accent on Boûlan's û, so the accented form can silently fail a substring match depending on how Wayfind's own place-name string is encoded.", */
    address: "69 NW 24th St, Miami, FL 33127", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/reel/Dbihv67xOtC/", creator: "fashion.eat.travel" },
      { platform: "instagram", url: "https://www.instagram.com/p/DaXzACXOrPE/", creator: "gabrielaromero11", reach: 2135, /* postedAt: "2026-07-04", */ }] },
  { key: "mayfair-grill-miami", match: { name: "Mayfair Grill", city: "Miami" },
    address: "3000 Florida Ave, Coconut Grove, Miami, FL 33133", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbgRMv0lcsL/", creator: "fashion.eat.travel" }] },
  // v8.43 — CORROBORATED, and found the hard way: the Miami batch generated a
  // SECOND entry under this exact key before anything noticed, because the key
  // was derived from the venue and the venue was already here. Nothing in the
  // build would have caught it — creatorVideosFor() returns the FIRST placeId
  // match and CURATED.find() the first key match, so the later duplicate would
  // simply never have rendered, silently, forever. scripts/test-creator-
  // corroboration.mjs now fails the build on a duplicate key or placeId.
  { key: "el-churrascaso-miami-lakes", placeId: "ChIJxXAWDgCl2YgRjgwndTs5qbk",
    match: { name: "El Churrascaso", city: "Miami Lakes" },
    address: "7419 Miami Lakes Dr, Miami Lakes, FL 33014", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/reel/Dbdac7kxq5l/", creator: "fashion.eat.travel" },
      { platform: "instagram", url: "https://www.instagram.com/p/DXuw7y9Dq-g/", creator: "gabrielaromero11", reach: 453, /* postedAt: "2026-04-29", */ }] },

  // ── @neverboredinorlando (Central Florida day trips near Orlando) ──
  { key: "silver-moon-drive-in-lakeland", match: { name: "Silver Moon Drive-In", city: "Lakeland" },
    address: "4100 New Tampa Hwy, Lakeland, FL 33815", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DYDJ0rxJA8K/", creator: "neverboredinorlando" }] },
  { key: "catboat-clermont", match: { name: "Catboat Clermont", city: "Clermont" },
    address: "10354 Cypress Cove Ln, Clermont, FL 34711", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DVymPmojQ0x/", creator: "neverboredinorlando" }] },
  { key: "old-sugar-mill-pancake-house-de-leon-springs", match: { name: "Old Sugar Mill Pancake House", city: "De Leon Springs" },
    address: "601 Ponce De Leon Blvd, De Leon Springs, FL 32130", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DUx0WfhDSxh/", creator: "neverboredinorlando" }] },
  { key: "main-street-pizza-kissimmee", match: { name: "Main Street Pizza", city: "Kissimmee" },
    address: "16 Broadway, Kissimmee, FL 34741", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/reel/DbdVdP4g75L/", creator: "neverboredinorlando" }] },


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
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY7khOvx34K/", creator: "alexandramartin_tv", reach: 3400 }] },
  { key: "borti-pasta-bar-miami", placeId: "ChIJy5C9Qk2x2YgRe4lg1zuS8iA", match: { name: "Borti", city: "Miami" },
    address: "8300 NE 2nd Ave, Miami, FL 33138", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DalR3Xxxavv/", creator: "alexandramartin_tv", reach: 2400 }] },
  { key: "charlatam-miami", placeId: "ChIJsQI4pFG32YgRu9buf2FGB94", match: { name: "Charlatam", city: "Miami" },
    address: "2525 SW 3rd Ave, Miami, FL 33129", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbbyA0xN0PG/", creator: "alexandramartin_tv", reach: 545 }] },
  { key: "la-tiendita-ii-miami-beach", placeId: "ChIJ61FPT4W02YgRkJQX7JyuJx0", match: { name: "La Tiendita", city: "Miami Beach" },
    address: "414 16th St, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8ArSoxGca/", creator: "alexandramartin_tv", reach: 885 }] },
  { key: "wat-buddharangsi-homestead", placeId: "ChIJYTi0cLTC2YgRe4PpurmXWQM", match: { name: "Wat Buddharangsi", city: "Homestead" },
    address: "15200 SW 240th St, Homestead, FL 33032", category: "Activities",
    /* note: "City token is \"Homestead\" — what the temple is universally known by and what people search. Google's formatted address returns the postal designation \"Princeton, FL 33032\". Recorded so the call is checkable rather than opaque; attribution keys on placeId, so the token only affects directory grouping.", */
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZtB5VGRQJW/", creator: "alexandramartin_tv", reach: 9500 }] },
  { key: "hurrem-hammam-north-miami", placeId: "ChIJM6d-F5Gt2YgR4xiZtJnzG68", match: { name: "Hurrem Hammam", city: "North Miami" },
    address: "14652 Biscayne Blvd, North Miami, FL 33181", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZNWyDBR5MV/", creator: "alexandramartin_tv", reach: 7500 }] },
  { key: "ichimi-midtown-miami", placeId: "ChIJTwAMw0Cx2YgRw0ke2G7Z7ko", match: { name: "Ichimi", city: "Miami" },
    address: "118 Buena Vista Blvd, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYNta3cRRWQ/", creator: "alexandramartin_tv", reach: 2200 }] },
  { key: "mi-colombia-miami-beach", placeId: "ChIJT2rHbuay2YgRfsErmiRgvMQ", match: { name: "Mi Colombia", city: "Miami Beach" },
    address: "702 71st St, Miami Beach, FL 33141", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXxkLiAR4xW/", creator: "alexandramartin_tv", reach: 7700 }] },
  // v8.45 — CORROBORATED. Two Miami creators on the same downtown hotel
  // rooftop, independently.
  { key: "yamashiro-miami", placeId: "ChIJG-Tq3xy32YgR7QyvDubSiLA", match: { name: "Yamashiro", city: "Miami" },
    address: "159 NE 6th St, Miami, FL 33132", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DW7WWaxRtox/", creator: "alexandramartin_tv", reach: 6400 },
      { platform: "instagram", url: "https://www.instagram.com/p/DWMWQsTEQxh/", creator: "iviethefoodie", /* postedAt: "2026-03-22" */ }] },
  { key: "andres-carne-de-res-miami-beach", placeId: "ChIJOZIFBwC12YgRieEn821YBic", match: { name: "Andres Carne de Res", city: "Miami Beach" },
    address: "455 Lincoln Rd, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW44WKUxbgZ/", creator: "alexandramartin_tv", reach: 3800 }] },
  { key: "chefsfull-food-truck-miami", placeId: "ChIJ5Z1h9M3D2YgRkUQhvnVypfQ", match: { name: "Chefsfull", city: "Miami" },
    address: "9191 SW 137th Ave, Miami, FL 33186", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWkJnwERymp/", creator: "alexandramartin_tv", reach: 5000 }] },
  // v8.45 — CORROBORATED. @iviethefoodie filmed the same Doral tres leches
  // factory independently of @alexandramartin_tv.
  { key: "tres-leches-factory-doral", placeId: "ChIJqZppyNO72YgRGGXMaUINCMM", match: { name: "Tres Leches Factory", city: "Doral" },
    address: "5213 NW 79th Ave, Doral, FL 33166", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DWpUwoUxBs8/", creator: "alexandramartin_tv", reach: 6900 },
      { platform: "instagram", url: "https://www.instagram.com/p/DVjSnP4Ean7/", creator: "iviethefoodie", reach: 4572, /* postedAt: "2026-03-06" */ }] },
  { key: "bella-miami-beach", placeId: "ChIJ-WgWlqq12YgRLqHWVu34USo", match: { name: "Bella Miami Beach", city: "Miami Beach" },
    address: "236 21st St, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWFRNWCRDH2/", creator: "alexandramartin_tv", reach: 1800 }] },
  { key: "sushiato-doral", placeId: "ChIJpYiE0s6_2YgRncfqRBxOs_M", match: { name: "Sushiato", city: "Doral" },
    address: "4261 NW 107th Ave, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWAFlN6RQii/", creator: "alexandramartin_tv", reach: 4600 }] },
  { key: "domaselo-little-havana-miami", placeId: "ChIJnY-BzZS32YgRP-9tqv6E6xs", match: { name: "domaselo", city: "Miami" },
    address: "2691 SW 11th St, Miami, FL 33135", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUEoV86EU2W/", creator: "alexandramartin_tv", reach: 8800 }] },
  { key: "yambo-express-miami", placeId: "ChIJf4__A_HB2YgR9arNkSGbUaM", match: { name: "Yambo Express", city: "Miami" },
    address: "12005 SW 129th Ct, Miami, FL 33186", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTjJO5ikdG5/", creator: "alexandramartin_tv", reach: 29900 }] },
  // v8.43 — CORROBORATED, and the cleanest case in the library: two Miami
  // creators went to the same Hialeah counter six months apart and BOTH came
  // for the pan con bistec. That is the difference between a recommendation
  // and a consensus, which is exactly what the trend flag is for.
  { key: "pronto-cafe-hialeah", placeId: "ChIJA3BFE2G72YgRJ13Z8fc5eto", match: { name: "Pronto", city: "Hialeah" },
    address: "86 W 29th St, Hialeah, FL 33012", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DSlAeXbER_X/", creator: "alexandramartin_tv", reach: 1900 },
      { platform: "instagram", url: "https://www.instagram.com/p/DXsIouEkytg/", creator: "gabrielaromero11", reach: 769, /* postedAt: "2026-04-28", */ },
      // v8.45 — THREE CREATORS, the first place in the library to get there.
      // @iviethefoodie names this counter in her pan con lechon round-up.
      // That matters mechanically and not just as a milestone:
      // corroborationFromCount() runs 0.75 at two creators and 0.875 at three,
      // so this is the first entry sitting ABOVE the base of that curve.
      { platform: "instagram", url: "https://www.instagram.com/p/DUjZuW_EQuZ/", creator: "iviethefoodie", reach: 1668, /* postedAt: "2026-02-09" */ }] },
  { key: "la-casita-tropical-hollywood", placeId: "ChIJZ8VImgCp2YgRDymqli3x3IE", match: { name: "La Casita Tropical", city: "Hollywood" },
    address: "6301 Johnson St, Hollywood, FL 33024", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR0GLb1EbfZ/", creator: "alexandramartin_tv", reach: 26300 }] },
  { key: "ay-bendito-miami", placeId: "ChIJ687YflPA2YgR_QjPW4hRGyw", match: { name: "Ay Bendito", city: "Miami" },
    address: "9225 SW 137th Ave, Miami, FL 33186", category: "Food",
    /* note: "Her reel described this as a roving pop-up and pointed followers to the creator's IG for that week's spot. Google now lists a fixed Kendall address, which is what we key on. The caption below therefore claims a dish, not a schedule.", */
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXFm2CPR_Qa/", creator: "alexandramartin_tv", reach: 9600 }] },


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
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWwEk5aETOW/", creator: "secretsoftampabay", reach: 2800 }] },
  { key: "o-ku-tampa", placeId: "ChIJzY7HwxfDwogRLhC31vgX3ZY", match: { name: "O-Ku", city: "Tampa" },
    address: "2907 W Bay to Bay Blvd, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY1-DCgxzwQ/", creator: "secretsoftampabay", reach: 11900 }] },
  { key: "palmette-tampa", placeId: "ChIJzQJrFNfpwogRXVE296Q-hIM", match: { name: "Palmette", city: "Tampa" },
    address: "7627 W Courtney Campbell Cswy, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVqnRLIjhpX/", creator: "secretsoftampabay", reach: 1600 }] },
  { key: "predalina-tampa", placeId: "ChIJ7aECsrzFwogRKra8aP0X5cE", match: { name: "Predalina", city: "Tampa" },
    address: "1001 E Cumberland Ave, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTDIKkaka9Y/", creator: "secretsoftampabay", reach: 1900 }] },
  { key: "urban-stillhouse-st-petersburg", placeId: "ChIJq6q6ujDiwogRxFvyGOkUW9A", match: { name: "Urban Stillhouse", city: "St. Petersburg" },
    address: "2232 5th Ave S, St. Petersburg, FL 33712", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR9optOkYj7/", creator: "secretsoftampabay", reach: 7700 }] },
  { key: "sorsi-waterfront-tampa", placeId: "ChIJJeuujrDFwogRZWZ69psQAa4", match: { name: "SORSI", city: "Tampa" },
    address: "601 S Harbour Island Blvd Ste 100, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR4pktGkZGF/", creator: "secretsoftampabay", reach: 1000 }] },
  { key: "stovall-house-tampa", placeId: "ChIJ1ZTeIVrdwogRkMOsdzgVFYA", match: { name: "Stovall House", city: "Tampa" },
    address: "4621 Bayshore Blvd, Tampa, FL 33611", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DRab0KSDbJ4/", creator: "secretsoftampabay", reach: 1700 }] },
  { key: "piccolo-buco-tampa", placeId: "ChIJFRtVgujBwogRBhpnTaxHUE0", match: { name: "Piccolo Buco", city: "Tampa" },
    address: "14904 N Dale Mabry Hwy, Tampa, FL 33618", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DP_hrJJjayi/", creator: "secretsoftampabay", reach: 3300 }] },
  { key: "hyde-park-village-tampa", placeId: "ChIJQZRp15bDwogReY6sMTk-YWg", match: { name: "Hyde Park Village", city: "Tampa" },
    address: "1602 W Swann Ave, Tampa, FL 33606", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DPWEr2ijski/", creator: "secretsoftampabay", reach: 2800 }] },
  { key: "1983-tampa", placeId: "ChIJ0aB-cKPDwogRCb9YmF_OOhI", match: { name: "1983", city: "Tampa" },
    address: "2616 S MacDill Ave, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DN5gZSTji9i/", creator: "secretsoftampabay", reach: 1600 }] },
  { key: "circles-waterfront-apollo-beach", placeId: "ChIJ0Ts6lqTZwogRCYwOKw7pW2g", match: { name: "Circles Waterfront", city: "Apollo Beach" },
    address: "1212 Apollo Beach Blvd, Apollo Beach, FL 33572", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DNdU5P3OtXD/", creator: "secretsoftampabay", reach: 2000 }] },
  { key: "rocca-tampa", placeId: "ChIJ1WZIXhjFwogR1M-_3DXnG6Y", match: { name: "Rocca", city: "Tampa" },
    address: "323 W Palm Ave, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DMxU4QPuOeO/", creator: "secretsoftampabay", reach: 650 }] },
  { key: "st-regis-longboat-key", placeId: "ChIJaRL0syxrw4gRHAo4CxKP9IY", match: { name: "St. Regis Longboat Key", city: "Longboat Key" },
    address: "1601 Gulf of Mexico Dr, Longboat Key, FL 34228", category: "Hotels",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DLfaZB1uiVQ/", creator: "secretsoftampabay", reach: 944 }] },
  { key: "elliott-aster-st-petersburg", placeId: "ChIJnZwugRXhwogRpN-HY445tJM", match: { name: "Elliott Aster", city: "St. Petersburg" },
    address: "501 5th Ave NE, St. Petersburg, FL 33701", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DKmfEUFOM-j/", creator: "secretsoftampabay", reach: 1400 }] },
  { key: "barcelona-wine-bar-tampa", placeId: "ChIJI_OEjj7DwogRcWK3mnLt9fU", match: { name: "Barcelona Wine Bar", city: "Tampa" },
    address: "2907 W Bay to Bay Blvd Ste A100, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DKMjlvtOYDt/", creator: "secretsoftampabay", reach: 1200 }] },
  { key: "maru-rooftop-tampa", placeId: "ChIJ14hpXQDDwogRnzzMJmb0ylE", match: { name: "Maru", city: "Tampa" },
    address: "2909 W Bay to Bay Blvd Ste A-600, Tampa, FL 33629", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DJgsf_Eu-u6/", creator: "secretsoftampabay", reach: 2700 }] },
  { key: "riverwalk-terrace-tampa", placeId: "ChIJEeANUgDFwogRsSiGNytPdd0", match: { name: "Riverwalk Terrace", city: "Tampa" },
    address: "505 Water St, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DIL9_eyRdas/", creator: "secretsoftampabay", reach: 879 }] },
  { key: "latitude-28-clearwater-beach", placeId: "ChIJ6VPPdiz3wogRjsClFdAJ504", match: { name: "Latitude 28", city: "Clearwater Beach" },
    address: "691 S Gulfview Blvd, Clearwater Beach, FL 33767", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DIJpH5AxPtE/", creator: "secretsoftampabay", reach: 1800 }] },

  // ── @lifeinparrish — the home metro ──
  { key: "pjs-sandwich-shop-parrish", placeId: "ChIJqzsAbq4lw4gR46Lr7T6Fgi4", match: { name: "P J's Sandwich Shop", city: "Parrish" },
    address: "12342 US-301, Parrish, FL 34219", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbgbJhYB3dQ/", creator: "lifeinparrish", reach: 4 }] },


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
    /* note: "Two videos, one venue: the Harry Waugh Dessert Room sits inside Bern's and has no separate Google listing, so both reels resolve to the steakhouse. reachOf() takes the strongest, not the sum — a place is featured or it is not.", */
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/CvphpPutyPR/", creator: "influencetampa", reach: 8800 },
      { platform: "instagram", url: "https://www.instagram.com/p/DWBupkuDYSw/", creator: "influencetampa", reach: 1600 },
      // v8.45 — CORROBORATED. @influencetampa's two videos are ONE creator;
      // @iviethefoodie is the second, and the first to make this place trend.
      { platform: "instagram", url: "https://www.instagram.com/p/DcL8KUpxnIf/", creator: "iviethefoodie", reach: 5694, /* postedAt: "2026-08-18" */ }
    ] },
  { key: "salt-shack-on-the-bay-tampa", placeId: "ChIJWSwkNNXdwogRCJUtqnx7je0", match: { name: "Salt Shack", city: "Tampa" },
    address: "615 Channelside Dr, Tampa, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/CuCRAYzLv3z/", creator: "influencetampa", reach: 20600 }] },
  { key: "sucre-table-tampa", placeId: "ChIJURkn5v7DwogR5XfGAWpOE74", match: { name: "Sucré Table", city: "Tampa" },
    address: "Tampa, FL", category: "Food",
    /* note: "Her reel featured a limited-run croissant that is long gone. The caption below describes the BAKERY, not that menu — a curated line that outlives its subject is a lie with a delay on it.", */
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/CvPcmx2LYy7/", creator: "influencetampa", reach: 8600 }] },
  { key: "sapphire-tampa", placeId: "ChIJCUsmv-rDwogRFLK0RwWg_LE", match: { name: "Sapphire", city: "Tampa" },
    address: "4410 W Boy Scout Blvd, Tampa, FL 33607", category: "Nightlife",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYj6SHYOzM_/", creator: "influencetampa", reach: 3200 }] },
  { key: "hog-island-fish-camp-dunedin", placeId: "ChIJl9A3H2PxwogRqvtZC7HHe_I", match: { name: "Hog Island Fish Camp", city: "Dunedin" },
    address: "Dunedin, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXJuFhfDSVq/", creator: "influencetampa", reach: 1100 }] },
  { key: "fortu-st-petersburg", placeId: "ChIJdaUo-PPhwogRii2HqysdgjI", match: { name: "Fortu", city: "St. Petersburg" },
    address: "St. Petersburg, FL", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DQrRVyHjce9/", creator: "influencetampa", reach: 954 },
      { platform: "instagram", url: "https://www.instagram.com/p/DQ7--eQCS2A/", creator: "tampaterrencee", reach: 3500 }
    ] },
  { key: "alessi-bakery-tampa", placeId: "ChIJJ1tmaHbDwogRxB86-j_tUjw", match: { name: "Alessi", city: "Tampa" },
    address: "Tampa, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYMuJ4rOTBo/", creator: "influencetampa", reach: 2500 }] },
  { key: "beccofino-tampa", placeId: "ChIJoSQpEbDdwogR_pwYErjpEtk", match: { name: "Beccofino", city: "Tampa" },
    address: "5712 S MacDill Ave, Tampa, FL", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ7flZquUi5/", creator: "influencetampa", reach: 1700 }] },
  { key: "tate-and-tilly-tampa", placeId: "ChIJZevb9ZHAwogROpUBDf-kHQ8", match: { name: "Tate & Tilly", city: "Tampa" },
    address: "14369 N Dale Mabry Hwy, Tampa, FL", category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU0nQjVjUUd/", creator: "influencetampa", reach: 414 }] },
  { key: "cafe-rialto-tampa", placeId: "ChIJ69YTzXPFwogRRTUQ-HGDL7g", match: { name: "Café Rialto", city: "Tampa" },
    address: "1617 N Franklin St, Tampa, FL", category: "Food",
    /* note: "4.7 stars on only 24 reviews — clears the rating floor but NOT CREATOR_MIN_REVIEWS, so it earns no rank boost yet. It is a genuinely new opening; the floor will let it through on its own once enough people have been.", */
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYzX3OoutDc/", creator: "influencetampa", reach: 2900 }] },
  { key: "tampa-edition", placeId: "ChIJERKjMobFwogRU-c43PevXB0", match: { name: "Tampa EDITION", city: "Tampa" },
    address: "500 Channelside Dr, Tampa, FL 33602", category: "Hotels",
    /* note: "4.1 stars — BELOW CREATOR_MIN_RATING, so no rank boost. Her reel is about its Christmas decoration, which is seasonal; the seasonal side belongs in lib/creatorEvents.js, and this entry is only the hotel itself.", */
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DRpQm0iDRx0/", creator: "influencetampa", reach: 1600 }] },


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
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU_Cx5gjl47/", creator: "tampaterrencee", reach: 128700 }] },
  { key: "frankies-italian-deli-riverview", placeId: "ChIJeS-mqN_PwogRYCTAjzN5_FI", match: { name: "Frankie's Italian Deli", city: "Riverview" },
    address: "3930 US-301, Riverview, FL 33578", category: "Food",
    /* note: "Filed under Riverview, not Tampa. His caption said Tampa and his own commenters corrected him — Riverview is its own city, forty minutes out. We use the address, not the caption.", */
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DSViu5UiZRJ/", creator: "tampaterrencee", reach: 38200 }] },
  { key: "southern-luv-bbq-tampa", placeId: "ChIJQ4DLFKfrwogR-QrEqDFXpk8", match: { name: "Southern Luv", city: "Tampa" },
    address: "8019 Citrus Park Dr, Tampa, FL 33624", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTGKcdQDtV6/", creator: "tampaterrencee", reach: 8300 }] },
  { key: "due-amici-ybor-tampa", placeId: "ChIJn2Mfbv5654gRVPqvg4fcmlA", match: { name: "Due Amici", city: "Tampa" },
    address: "1724 E 7th Ave, Tampa, FL 33605", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DQHpIgyiQmR/", creator: "tampaterrencee", reach: 7500 }] },
  { key: "el-chuzo-tampa", placeId: "ChIJ7SBhwk_BwogR8Ld48Qfa3oo", match: { name: "El Chuzo", city: "Tampa" },
    address: "7101 N Armenia Ave, Tampa, FL 33604", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DKdbsVxoWco/", creator: "tampaterrencee", reach: 6500 }] },
  { key: "hungry-crab-tampa", placeId: "ChIJpxuhmQ63wogRdyNj0LVyOco", match: { name: "Hungry Crab", city: "Tampa" },
    address: "19601 Bruce B Downs Blvd, Tampa, FL 33647", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DQ-tsMejvYq/", creator: "tampaterrencee", reach: 5000 }] },
  { key: "jay-luigi-tampa", placeId: "ChIJn38erTXDwogRb0CWRhZeTmc", match: { name: "Jay Luigi", city: "Tampa" },
    address: "516 S Howard Ave, Tampa, FL 33606", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU57J1kjgfE/", creator: "tampaterrencee", reach: 2000 }] },
  // v8.44 — CORROBORATED. @eatsbylaurr filmed the same Dunedin pizzeria
  // independently of @tampaterrencee.
  { key: "madison-avenue-pizza-dunedin", placeId: "ChIJb0Uq9LLzwogRmm6jXRaFuEQ", match: { name: "Madison Avenue Pizza", city: "Dunedin" },
    address: "2660 Bayshore Blvd, Dunedin, FL 34698", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DTNnJTdCRJR/", creator: "tampaterrencee", reach: 1800 },
      { platform: "instagram", url: "https://www.instagram.com/p/DOWPbDKjXom/", creator: "eatsbylaurr", /* postedAt: "2025-09-08" */ }] },
  { key: "weeki-wachee-springs", placeId: "ChIJz3OOrDIg6IgRMKjzAPsV3NI", match: { name: "Weeki Wachee Springs", city: "Spring Hill" },
    address: "6131 Commercial Way, Spring Hill, FL 34606", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DIjUdubpr9w/", creator: "tampaterrencee", reach: 1000 }] },
  { key: "snack-trap-ybor-tampa", placeId: "ChIJmedZNwDPwogRst1K4Ya19DU", match: { name: "Snack trap", city: "Tampa" },
    address: "2205 N 22nd St, Tampa, FL 33605", category: "Nightlife",
    /* note: "12 reviews — well below CREATOR_MIN_REVIEWS, so no rank boost. Curated anyway so his video reaches the place card: a 6,100-like post about a twelve-review bar is exactly the case the floor was written for.", */
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DSBwcM1DsBj/", creator: "tampaterrencee", reach: 6100 }] },

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
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbqZ0FDJN9y/", creator: "tampaiman", reach: 267, /* postedAt: "2026-08-05", */ }] },
  { key: "arwa-coffee-temple-terrace", match: { name: "Arwa Coffee", city: "Temple Terrace" },
    address: "8633 N 56th St, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbjAv2TpLzw/", creator: "tampaiman", reach: 407, /* postedAt: "2026-08-02", */ }] },
  // v8.44 — CORROBORATED. @eatsbylaurr found the same Terrace Oaks counter
  // independently of @tampaiman. placeId added with the second video; Google's
  // suite number is Ste 24, not the Suite 23 the first caption gave.
  { key: "farooj-abo-alabed-temple-terrace", placeId: "ChIJ3TJxHZvHwogRwn4HI0koZbg", match: { name: "Farooj Abo AlAbed", city: "Temple Terrace" },
    address: "11401 N 56th St Ste 24, Temple Terrace, FL 33617", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DbQw4TXOyOG/", creator: "tampaiman", reach: 791, /* postedAt: "2026-07-26", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/DcKI6tHAdvS/", creator: "eatsbylaurr", reach: 278, /* postedAt: "2026-08-17" */ }] },
  { key: "papa-kanafa-temple-terrace", match: { name: "Papa Kanafa", city: "Temple Terrace" },
    address: "11401 N 56th St Suite 23, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbQw4TXOyOG/", creator: "tampaiman", reach: 791, /* postedAt: "2026-07-26", */ }] },
  { key: "juice-time-temple-terrace", match: { name: "Juice Time", city: "Temple Terrace" },
    address: "11401 N 56th St Suite 23, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbQw4TXOyOG/", creator: "tampaiman", reach: 791, /* postedAt: "2026-07-26", */ }] },
  { key: "qahwtea-tampa", match: { name: "Qahwtea", city: "Tampa" },
    address: "2319 E Fowler Ave, Tampa, FL 33612", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaTsOPMJOQB/", creator: "tampaiman", reach: 226, /* postedAt: "2026-07-02", */ }] },
  // v8.44 — CORROBORATED. @eatsbylaurr filmed the same Bruce B Downs burger
  // spot independently of @tampaiman, and her post is the highest-reach of the
  // pair — reachOf() takes the strongest single post, never the sum.
  { key: "slap-burger-tampa", placeId: "ChIJ6zjZ8QzHwogRqmeLP6LbLuo", match: { name: "Slap Burger", city: "Tampa" },
    address: "14915 Bruce B Downs Blvd, Tampa, FL 33613", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/Dao-eQ4JOSx/", creator: "tampaiman", reach: 754, /* postedAt: "2026-07-10", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/DZ-VnHaOu1c/", creator: "eatsbylaurr", reach: 4505, /* postedAt: "2026-06-24" */ }] },
  { key: "quiero-coffee-sarasota", match: { name: "Quiero Coffee", city: "Sarasota" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaLx1mJJMF-/", creator: "tampaiman", reach: 366, /* postedAt: "2026-06-29", */ }] },
  { key: "annapoorna-rasoi-tampa", match: { name: "Annapoorna Rasoi", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaYKbxwpEg9/", creator: "tampaiman", reach: 858, /* postedAt: "2026-07-04", */ }] },
  // TWO CREATORS, INDEPENDENTLY. Reach is the STRONGEST single post, never the
  // sum (reachOf() in lib/creatorBoost.js — a place is featured or it is not),
  // so a second video does not double the boost. What it does buy is
  // corroboration a reader can check for themselves.
  { key: "alessi-bakeries-tampa", match: { name: "Alessi Bakeries", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ8Di3PpY3X/", creator: "tampaiman", reach: 871, /* postedAt: "2026-06-23", */ },
             { platform: "instagram", url: "https://www.instagram.com/p/Dayg5BhB0x6/", creator: "stufftodointampabay", reach: 582, /* postedAt: "2026-07-14", */ }] },
  { key: "brewed-awakening-tampa", match: { name: "Brewed Awakening", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ2kUZCpGQ1/", creator: "tampaiman", reach: 1478, /* postedAt: "2026-06-21", */ }] },
  { key: "say-coffee-st-petersburg", match: { name: "Say Coffee", city: "St. Petersburg" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZycKGYJyU0/", creator: "tampaiman", reach: 432, /* postedAt: "2026-06-19", */ },
             { platform: "instagram", url: "https://www.instagram.com/p/DaBgdAyRrFI/", creator: "stufftodointampabay", reach: 182, /* postedAt: "2026-06-25", */ }] },
  { key: "cococello-st-petersburg", match: { name: "Cococello", city: "St. Petersburg" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZsUafKphmW/", creator: "tampaiman", reach: 352, /* postedAt: "2026-06-17", */ },
             { platform: "instagram", url: "https://www.instagram.com/p/DWZzHpACbfI/", creator: "tampaiman", reach: 2854, /* postedAt: "2026-03-27", */ }] },
  { key: "ichiban-sushi-ramen-tampa", match: { name: "Ichiban Sushi & Ramen", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZQtJKspsqS/", creator: "tampaiman", reach: 1784, /* postedAt: "2026-06-06", */ }] },
  { key: "shanghai-dumpling-house-tampa", match: { name: "Shanghai Dumpling House", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY2lXU_pPSV/", creator: "tampaiman", reach: 1736, /* postedAt: "2026-05-27", */ }] },
  { key: "aker-sweets-tampa", match: { name: "Aker Sweets", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYldoFmJoJ4/", creator: "tampaiman", reach: 2851, /* postedAt: "2026-05-20", */ }] },
  { key: "pasta-flame-tampa", match: { name: "Pasta Flame", city: "Tampa" },
    address: "10865 Cross Creek Blvd, Tampa, FL 33647", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYH6ZjtJhcB/", creator: "tampaiman", reach: 4055, /* postedAt: "2026-05-09", */ },
             { platform: "instagram", url: "https://www.instagram.com/p/DVXpNSgAFe4/", creator: "tampaiman", reach: 1756, /* postedAt: "2026-03-01", */ }] },
  { key: "eight-turn-crepe-wesley-chapel", match: { name: "Eight Turn Crepe", city: "Wesley Chapel" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYQMmZ3J8oG/", creator: "tampaiman", reach: 1321, /* postedAt: "2026-05-12", */ }] },
  { key: "99-cafe-tampa", match: { name: "99 Cafe", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXzCBtEpp8Y/", creator: "tampaiman", reach: 889, /* postedAt: "2026-05-01", */ }] },
  { key: "la-pinoz-pizza-longwood", match: { name: "La Pino'z Pizza", city: "Longwood" },
    address: "1050 W State Rd 434, Longwood, FL 32750", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXj4tBfCSOW/", creator: "tampaiman", reach: 623, /* postedAt: "2026-04-25", */ }] },
  { key: "sufrat-ramallah-tampa", match: { name: "Sufrat Ramallah", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXddCgICY7U/", creator: "tampaiman", reach: 21000, /* postedAt: "2026-04-22", */ }] },
  { key: "ghawar-restaurant-tampa", match: { name: "Ghawar Restaurant", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXaWmEmifXU/", creator: "tampaiman", reach: 2210, /* postedAt: "2026-04-21", */ }] },
  { key: "soul-of-korea-tampa", match: { name: "Soul of Korea", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXV25U0iUNw/", creator: "tampaiman", reach: 3706, /* postedAt: "2026-04-19", */ }] },
  { key: "doggy-dogs-tampa", match: { name: "Doggy Dogs", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW2eNA2CcXy/", creator: "tampaiman", reach: 941, /* postedAt: "2026-04-07", */ }] },
  { key: "saki-endless-sushi-hibachi-tampa", match: { name: "Saki Endless Sushi & Hibachi", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWuYHg3iaqd/", creator: "tampaiman", reach: 7236, /* postedAt: "2026-04-04", */ }] },
  { key: "byte-burger-tampa", match: { name: "BYTE", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWacZcxCWvO/", creator: "tampaiman", reach: 5677, /* postedAt: "2026-03-27", */ }] },
  { key: "kubana-kafe-tampa", match: { name: "Kubana Kafe", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU6LRc2iRv9/", creator: "tampaiman", reach: 3407, /* postedAt: "2026-02-18", */ }] },
  { key: "bibimgo-wesley-chapel", match: { name: "BiBimGo", city: "Wesley Chapel" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTUBXRjiQgJ/", creator: "tampaiman", reach: 4162, /* postedAt: "2026-01-09", */ }] },
  { key: "rosto-tampa", match: { name: "Rosto", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTIndw-iRvy/", creator: "tampaiman", reach: 2296, /* postedAt: "2026-01-05", */ }] },
  { key: "banus-chai-tampa", match: { name: "Banu's Chai", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DSVey-Jies0/", creator: "tampaiman", reach: 995, /* postedAt: "2025-12-16", */ }] },
  { key: "qamaria-tampa", match: { name: "Qamaria", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DR0SAvGCWbU/", creator: "tampaiman", reach: 1679, /* postedAt: "2025-12-03", */ }] },
  { key: "grind-haus-coffee-lutz", match: { name: "Grind Haus Coffee", city: "Lutz" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DQKfkSmCZCm/", creator: "tampaiman", reach: 1281, /* postedAt: "2025-10-23", */ }] },
  // ── @_adatewithkait — Orlando date nights and experiences ──
  { key: "akasaka-orlando", match: { name: "Akasaka", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8JslLxxTz/", creator: "_adatewithkait", reach: 193, /* postedAt: "2026-07-18", */ }] },
  { key: "bloom-ride-orlando", match: { name: "Bloom Ride", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ9DwVKCCmO/", creator: "_adatewithkait", reach: 122, /* postedAt: "2026-06-23", */ }] },
  { key: "teapioca-lounge-oviedo", match: { name: "Teapioca Lounge", city: "Oviedo" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ-3thLh6_P/", creator: "_adatewithkait", reach: 87, /* postedAt: "2026-06-24", */ }] },
  { key: "aurora-at-the-celeste-orlando", match: { name: "Aurora at The Celeste", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZyARU3RXNB/", creator: "_adatewithkait", reach: 86, /* postedAt: "2026-06-19", */ }] },
  { key: "the-dark-room-orlando", match: { name: "The Dark Room", city: "Orlando" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZn50K-RSQF/", creator: "_adatewithkait", reach: 226, /* postedAt: "2026-06-15", */ }] },
  { key: "azal-coffee-altamonte-springs", match: { name: "Azal Coffee", city: "Altamonte Springs" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZa-Yp9xa1A/", creator: "_adatewithkait", reach: 303, /* postedAt: "2026-06-10", */ }] },
  { key: "izuki-orlando", match: { name: "Izuki", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZI2KN3RWf4/", creator: "_adatewithkait", reach: 270, /* postedAt: "2026-06-03", */ }] },
  { key: "morimoto-asia-orlando", match: { name: "Morimoto Asia", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY98mpQxs_8/", creator: "_adatewithkait", reach: 99, /* postedAt: "2026-05-30", */ }] },
  { key: "bar-louie-winter-park", match: { name: "Bar Louie", city: "Winter Park" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY72oe6RtmX/", creator: "_adatewithkait", reach: 281, /* postedAt: "2026-05-29", */ }] },
  { key: "pisco-peruvian-gastrobar-orlando", match: { name: "Pisco Peruvian Gastrobar", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY0ObAJRHZZ/", creator: "_adatewithkait", reach: 83, /* postedAt: "2026-05-26", */ }] },
  { key: "ace-cafe-sanford", match: { name: "Ace Cafe", city: "Sanford" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYuZBPwxzm5/", creator: "_adatewithkait", reach: 149, /* postedAt: "2026-05-24", */ }] },
  { key: "wala-la-noodles-orlando", match: { name: "Wa La La Noodles", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYksrcuRlwk/", creator: "_adatewithkait", reach: 315, /* postedAt: "2026-05-20", */ }] },
  { key: "hh-bagels-altamonte-springs", match: { name: "H&H Bagels", city: "Altamonte Springs" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYfAjy0RT-6/", creator: "_adatewithkait", reach: 127, /* postedAt: "2026-05-18", */ }] },
  { key: "woodhouse-spa-altamonte-springs", match: { name: "Woodhouse Spa", city: "Altamonte Springs" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYVekDgx_cm/", creator: "_adatewithkait", reach: 216, /* postedAt: "2026-05-14", */ }] },
  { key: "parlor-doughnuts-orlando", match: { name: "Parlor Doughnuts", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYE5N5cR8YB/", creator: "_adatewithkait", reach: 137, /* postedAt: "2026-05-08", */ }] },
  { key: "banh-mi-go-orlando", match: { name: "Banh Mi Go", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DX8ULEFCpvi/", creator: "_adatewithkait", reach: 150, /* postedAt: "2026-05-04", */ }] },
  { key: "hamlin-house-social-orlando", match: { name: "Hamlin House Social", city: "Winter Garden" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXO7EbzkXiB/", creator: "_adatewithkait", reach: 185, /* postedAt: "2026-04-17", */ }] },
  { key: "baires-grill-orlando", match: { name: "Baires Grill", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXKruaXEeT8/", creator: "_adatewithkait", reach: 264, /* postedAt: "2026-04-15", */ }] },
  { key: "great-big-game-show-orlando", match: { name: "The Great Big Game Show", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWkCnINEVAP/", creator: "_adatewithkait", reach: 86, /* postedAt: "2026-03-31", */ }] },
  { key: "four-flamingos-orlando", match: { name: "Four Flamingos", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWUovChEda4/", creator: "_adatewithkait", reach: 78, /* postedAt: "2026-03-25", */ }] },
  { key: "color-me-mine-altamonte-springs", match: { name: "Color Me Mine", city: "Altamonte Springs" },
    category: "Family",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaL8-IYRL9a/", creator: "_adatewithkait", reach: 89, /* postedAt: "2026-06-29", */ }] },
  { key: "grove-resort-water-park-winter-garden", match: { name: "The Grove Resort & Water Park", city: "Winter Garden" },
    address: "14501 Grove Resort Ave, Winter Garden, FL 34787", category: "Stays",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbbhaJvtlFp/", creator: "magicalmaddieb", /* postedAt: "2026-07-30", */ }] },
  { key: "volcano-bay-orlando", match: { name: "Universal Volcano Bay", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXj9uMcgFWc/", creator: "magicalmaddieb", reach: 385, /* postedAt: "2026-04-25", */ }] },
  { key: "blue-man-group-orlando", match: { name: "Blue Man Group", city: "Orlando" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Davc2nGt2Jr/", creator: "magicalmaddieb", /* postedAt: "2026-07-13", */ }] },
  { key: "epic-universe-orlando", match: { name: "Universal Epic Universe", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DagwO9NgYZw/", creator: "magicalmaddieb", reach: 240, /* postedAt: "2026-07-07", */ }] },
  { key: "aquatica-orlando", match: { name: "Aquatica Orlando", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYfPNhxgnIb/", creator: "magicalmaddieb", reach: 138, /* postedAt: "2026-05-18", */ }] },
  { key: "pizza-ponte-disney-springs", match: { name: "Pizza Ponte", city: "Orlando" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYNN6vfgQ1D/", creator: "magicalmaddieb", reach: 165, /* postedAt: "2026-05-11", */ }] },
  { key: "ivory-nail-lounge-orlando", match: { name: "Ivory Nail Lounge", city: "Orlando" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYAHGzNgaOa/", creator: "magicalmaddieb", reach: 201, /* postedAt: "2026-05-06", */ }] },
  { key: "sage-head-spa-winter-park", match: { name: "Sage Head Spa", city: "Winter Park" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DX1ySKLgXFC/", creator: "magicalmaddieb", /* postedAt: "2026-05-02", */ }] },
  { key: "dollywood-splash-country", match: { name: "Dollywood's Splash Country" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8O6HnApNf/", creator: "magicalmaddieb", /* postedAt: "2026-07-18", */ }] },

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
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbsxXh2hdSD/", creator: "stufftodointampabay", reach: 137, /* postedAt: "2026-08-05", */ }] },
  { key: "howard-and-platt-tampa", match: { name: "Howard & Platt", city: "Tampa" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbqMjUxBpul/", creator: "stufftodointampabay", reach: 522, /* postedAt: "2026-08-04", */ }] },
  { key: "born-and-bread-bakehouse-lakeland", match: { name: "Born & Bread Bakehouse", city: "Lakeland" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbeNz-JhPPx/", creator: "stufftodointampabay", reach: 547, /* postedAt: "2026-07-31", */ }] },
  // v8.44 — CORROBORATED, and a correction. The 2026-08-06 batch REFUSED to add
  // this venue because Google's display name was literally "Tommy's Chophouse -
  // Opening Soon" — the right call at the time, and the reason a placeId was
  // never recorded. It is now OPERATIONAL with 66 reviews, and a second creator
  // has filmed it, so it finally earns both.
  { key: "tommys-chophouse-tampa", placeId: "ChIJC7huKWvFwogRBkI-LJuEHx8",
    match: { name: "Tommy's Chophouse", city: "Tampa" },
    address: "1622 E 7th Ave, Tampa, FL 33605", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DbYMItJhBTW/", creator: "stufftodointampabay", reach: 614, /* postedAt: "2026-07-28", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/Db9PerOJKxm/", creator: "eatsbylaurr", reach: 525, /* postedAt: "2026-08-12" */ }] },
  // v8.42 — CORROBORATED. @cailincoastal filmed the same drive-thru two weeks
  // after @stufftodointampabay did, independently. placeId added at the same
  // time so PASS 1 resolves it exactly rather than leaning on the name path.
  // Two distinct creators is what lib/trendSignal.js reads as corroboration;
  // reachOf() still takes the STRONGEST single post, never the sum, so the
  // second video buys corroboration and not a doubled boost.
  { key: "heights-drive-thru-tampa", placeId: "ChIJizhkpNfHwogRbx738MsVHK4",
    match: { name: "Heights Drive Thru", city: "Tampa" },
    address: "6505 N Florida Ave, Tampa, FL 33604", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DbQ4qH9BUjc/", creator: "stufftodointampabay", reach: 817, /* postedAt: "2026-07-26", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/Db4JkEsNn_e/", creator: "cailincoastal", /* postedAt: "2026-08-10", */ }] },
  { key: "circus-arts-foundry-tampa", match: { name: "Circus Arts Foundry", city: "Tampa" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbOL3rthpb0/", creator: "stufftodointampabay", reach: 515, /* postedAt: "2026-07-25", */ }] },
  { key: "nueva-cantina-tampa", match: { name: "Nueva Cantina", city: "Tampa" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbEgtYDhrLD/", creator: "stufftodointampabay", reach: 306, /* postedAt: "2026-07-21", */ }] },
  { key: "dairy-joy-tampa", match: { name: "Dairy Joy", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbBwea4h2VX/", creator: "stufftodointampabay", reach: 335, /* postedAt: "2026-07-20", */ }] },
  { key: "loveshackfancy-tampa", match: { name: "LoveShackFancy", city: "Tampa" },
    category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da-lXn3hlOF/", creator: "stufftodointampabay", reach: 237, /* postedAt: "2026-07-17", */ }] },
  { key: "birdettes-tampa", match: { name: "Birdette's" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da8AmPGhI6i/", creator: "stufftodointampabay", reach: 2394, /* postedAt: "2026-07-17", */ }] },
  { key: "book-rescuers", match: { name: "Book Rescuers" },
    category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da3vq20h_xT/", creator: "stufftodointampabay", reach: 923, /* postedAt: "2026-07-16", */ }] },
  { key: "beach-house-coffee-tampa-bay", match: { name: "Beach House Coffee" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DawFjyoxUlM/", creator: "stufftodointampabay", reach: 222, /* postedAt: "2026-07-13", */ }] },
  { key: "fit-bowl-co", match: { name: "Fit Bowl Co." },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dad6iPIBmWC/", creator: "stufftodointampabay", reach: 106, /* postedAt: "2026-07-02", */ }] },
  { key: "sunshine-needlepoint-tampa-bay", match: { name: "Sunshine Needlepoint" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaWHxuDyE9a/", creator: "stufftodointampabay", reach: 170, /* postedAt: "2026-07-03", */ }] },
  { key: "new-york-bagel-cafe-tampa", match: { name: "New York Bagel Cafe", city: "Tampa" },
    category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaOcFmUy7Iq/", creator: "stufftodointampabay", reach: 235, /* postedAt: "2026-06-30", */ }] },
  { key: "food-and-beer-tampa", match: { name: "Food+Beer", city: "Tampa" },
    category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZvql_MxaOJ/", creator: "stufftodointampabay", reach: 118, /* postedAt: "2026-06-18", */ }] },
  { key: "black-english-bookstore", match: { name: "Black English Bookstore" },
    category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZm5GpUx_K3/", creator: "stufftodointampabay", reach: 551, /* postedAt: "2026-06-15", */ }] },
  { key: "zen-glass-studio-st-petersburg", match: { name: "Zen Glass Studio", city: "St. Petersburg" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZdqNq5RkUd/", creator: "stufftodointampabay", reach: 834, /* postedAt: "2026-06-11", */ }] },
  { key: "gametime-tampa", match: { name: "Gametime", city: "Tampa" },
    category: "Family",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZaOKsDxD3J/", creator: "stufftodointampabay", reach: 77, /* postedAt: "2026-06-10", */ }] },
  // v8.44 — CORROBORATED. Google's canonical display name is "Roasted!" in
  // Temple Terrace, not "Roasted813" in Tampa; the match root stays as it was
  // (it still resolves the handle a reader recognises) and the placeId is what
  // now does the real work, which is exactly the split PASS 1 exists for.
  { key: "roasted813-tampa", placeId: "ChIJv30X8SzHwogRVHpiMio-n70",
    match: { name: "Roasted813", city: "Tampa" }, displayName: "Roasted!",
    address: "11301 N 56th St Ste 10, Temple Terrace, FL 33617", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DZVkJ70yIsT/", creator: "stufftodointampabay", reach: 235, /* postedAt: "2026-06-08", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/Da8MiUSu9nR/", creator: "eatsbylaurr", reach: 304, /* postedAt: "2026-07-18" */ }] },
  { key: "drip-ybor-tampa", match: { name: "Drip Ybor", city: "Tampa" },
    category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZI8YuHRPtY/", creator: "stufftodointampabay", reach: 548, /* postedAt: "2026-06-03", */ }] },
  // ═══════════════════════════════════════════════════════════════════════════
  // v8.42 — @cailincoastal, the Tampa Bay / St. Pete batch (2026-08-23).
  //
  // 25 posts supplied by the owner; 23 entered. Every one was read from its own
  // og:description (handle + date + caption, straight off instagram.com with a
  // crawler UA from the owner's Mac — no login, no scrape, cheaper than the
  // logged-in-Chrome route earlier batches used) and every venue was resolved
  // against Google Places v1 searchText before a line was written here. Each
  // entry therefore carries a REAL placeId, so PASS 1 resolves it exactly and
  // the name path is only ever a fallback.
  //
  // TWO WERE NOT ENTERED, deliberately:
  //   • DUbXg4DD_oU — a creator meet-up at The Osprey View, a WEDDING VENUE
  //     (Google primaryType wedding_venue, Thonotosassa). Real business, wrong
  //     product: a card here is a promise a reader can go, and they cannot.
  //   • Dak2XANuDri — "St Pete Sunrise Tours" has NO Google listing under that
  //     name; searchText returns four different operators. The caption states no
  //     address. Guessing which one she rode is exactly the mis-attribution the
  //     placeId-first resolver exists to prevent, so it stays out until the
  //     owner can name it.
  //
  // REACH is likes, and it is only recorded where Instagram actually exposed it
  // (2 of 25 — og:description carries the count intermittently). An absent reach
  // is absent, never a guess: lib/creatorBoost.js already treats it as "unknown"
  // and earns EVIDENCE_MIN_FRAC rather than nothing.
  //
  // TWO OF THESE ARE CORROBORATIONS, not new entries — Heights Drive-Thru
  // (@stufftodointampabay found it first) and Atomic Cat (@katelynintampa).
  // They are merged onto the existing entries above, which is what makes them
  // the first places in the library to clear CORROBORATION_MIN_CREATORS and
  // earn the trend flag (lib/trendSignal.js).
  //
  // NO PHOTO CONSENT ON FILE for this creator, so there is deliberately no
  // CREATOR_CONSENT row and no committed avatar: she renders initials and is
  // credited by handle with a followed link, which is nominative fair use.
  // lib/creatorRights.js is the reason, and one line there flips it the day the
  // owner has her yes in writing.
  // ═══════════════════════════════════════════════════════════════════════════

  { key: "forbici-st-petersburg", placeId: "ChIJ_8qUegDhwogRzpjJDDiY8Q4",
    match: { name: "Forbici", city: "St. Petersburg" }, displayName: "Forbici Modern Italian",
    address: "183 2nd Ave N, St. Petersburg, FL 33701", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcV4QqnxjHU/", creator: "cailincoastal", /* postedAt: "2026-08-22", */ }] },
  { key: "shaker-and-peel-oldsmar", placeId: "ChIJ6aH4CjTtwogRfryJ-BX89x4",
    match: { name: "Shaker & Peel", city: "Oldsmar" },
    address: "3159 Curlew Rd, Oldsmar, FL 34677", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcSRQteti52/", creator: "cailincoastal", /* postedAt: "2026-08-20", */ }] },
  { key: "cali-st-petersburg", placeId: "ChIJq9_svUThwogRG7K4WtuaWXY",
    match: { name: "CALI - St. Pete", city: "St. Petersburg" }, displayName: "CALI",
    address: "190 37th Ave N, St. Petersburg, FL 33704", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcOuXfqBCNW/", creator: "cailincoastal", /* postedAt: "2026-08-19", */ }] },
  { key: "buddy-brew-seminole", placeId: "ChIJRXYxgcD7wogRa-OrJa9lrz8",
    match: { name: "Buddy Brew Coffee", city: "Seminole" }, /* note: "The Tampa roaster has SEVERAL locations — the city gate and the placeId both pin this to the Seminole counter", */
    address: "7263 Seminole Blvd, Seminole, FL 33772", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcCLHeSPmqd/", creator: "cailincoastal", /* postedAt: "2026-08-14", */ }] },
  { key: "olivia-st-petersburg", placeId: "ChIJBZ4zDADhwogRoA7MoF0zKaE",
    match: { name: "OLIVIA", city: "St. Petersburg" },
    address: "211 1st Ave N, St. Petersburg, FL 33701", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db9vTbIt_k3/", creator: "cailincoastal", /* postedAt: "2026-08-12", */ }] },
  { key: "park-and-rec-st-petersburg", placeId: "ChIJDSP1V4PhwogRSo-PPfqZE0w",
    match: { name: "Park & Rec", city: "St. Petersburg" }, displayName: "Park & Rec DTSP",
    address: "100 4th St S, St. Petersburg, FL 33701", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db07OFNtdRr/", creator: "cailincoastal", /* postedAt: "2026-08-09", */ }] },
  // v8.44 — CORROBORATED, and a LIVE BUG CLOSED. @tampaiman's find was entered
  // by NAME ONLY as "oou-cha-tampa-bay" because his caption stated no city, and
  // @cailincoastal's was entered separately with a placeId. Two entries, one
  // venue, and norm() makes both roots the identical string "oou cha" — so PASS
  // 2 broke the tie on ARRAY ORDER and whichever sat earlier silently swallowed
  // the other's video. Merged onto the one that carries the placeId.
  { key: "oou-cha-pinellas-park", placeId: "ChIJXYwN3-XlwogRa3yrxh22C7o",
    match: { name: "Oou Cha", city: "Pinellas Park" },
    address: "6251 34th St N, Pinellas Park, FL 33781", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DauKX7yp6YH/", creator: "tampaiman", reach: 2336, /* postedAt: "2026-07-12", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/Dbvj9HmOtuW/", creator: "cailincoastal", /* postedAt: "2026-08-07", */ }] },
  { key: "craft-street-kitchen-oldsmar", placeId: "ChIJ-Z1yo6_twogR5GJkLIFUAYE",
    match: { name: "Craft Street Kitchen", city: "Oldsmar" },
    address: "3153 Curlew Rd, Oldsmar, FL 34677", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DboMuwgJylo/", creator: "cailincoastal", /* postedAt: "2026-08-04", */ }] },
  { key: "starlite-horizon-south-pasadena", placeId: "ChIJnej4u9b2wogRAAYRwwkuB4A",
    match: { name: "Starlite Horizon", city: "South Pasadena" }, displayName: "Starlite Horizon Dining Yacht",
    address: "3400 Pasadena Ave S, South Pasadena, FL 33707", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dbl9g3jP7k9/", creator: "cailincoastal", /* postedAt: "2026-08-03", */ }] },
  { key: "central-park-food-hall-st-petersburg", placeId: "ChIJ2cdLArvhwogRMMkAEPKsp2U",
    match: { name: "Central Park St Pete Food Hall", city: "St. Petersburg" }, displayName: "Central Park Food Hall",
    address: "551 Central Ave, St. Petersburg, FL 33701", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dba4caAul17/", creator: "cailincoastal", /* postedAt: "2026-07-30", */ }] },
  { key: "pin-on-grand-st-petersburg", placeId: "ChIJactSz_zjwogRHv9F_yOCXlw",
    match: { name: "Pin On Grand", city: "St. Petersburg" },
    address: "2458 Central Ave, St. Petersburg, FL 33712", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbY9yEWveE5/", creator: "cailincoastal", /* postedAt: "2026-07-29", */ }] },
  { key: "new-power-medicine-st-petersburg", placeId: "ChIJ54ykeVPjwogRL6BAo2YMlJk",
    match: { name: "New Power Medicine", city: "St. Petersburg" },
    /* note: "Google primaryType is medical_clinic. Kept factual on purpose — the caption describes a visit, and this file makes no health claim of any kind.", */
    address: "5454 Central Ave # C, St. Petersburg, FL 33707", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbWnntHPfiM/", creator: "cailincoastal", /* postedAt: "2026-07-28", */ }] },
  { key: "zees-barbeque-st-petersburg", placeId: "ChIJDVENUajjwogRhM7VwB41sqU",
    match: { name: "Zee's Barbeque", city: "St. Petersburg" },
    address: "515 22nd St S, St. Petersburg, FL 33712", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbOEwJiu9BC/", creator: "cailincoastal", /* postedAt: "2026-07-25", */ }] },
  { key: "dolphin-racer-south-pasadena", placeId: "ChIJBZcEIE_9wogRhe70u_z23DY",
    match: { name: "Dolphin Racer", city: "South Pasadena" },
    address: "3400 Pasadena Ave S, South Pasadena, FL 33707", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbHHttOP2lo/", creator: "cailincoastal", /* postedAt: "2026-07-22", */ }] },
  { key: "eclipse-cafe-tampa", placeId: "ChIJU6N76oDBwogRjU3JNe6seko",
    match: { name: "Eclipse Cafe", city: "Tampa" },
    address: "6118 Gunn Hwy, Tampa, FL 33625", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da6Fl_8PRIE/", creator: "cailincoastal", reach: 107, /* postedAt: "2026-07-17", */ }] },
  { key: "dirty-laundry-st-petersburg", placeId: "ChIJoWqi_IjjwogR34giX74JdM4",
    match: { name: "Dirty Laundry", city: "St. Petersburg" },
    address: "1742 Central Ave, St. Petersburg, FL 33712", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da00b0QP3zu/", creator: "cailincoastal", /* postedAt: "2026-07-15", */ }] },
  { key: "the-bagel-nook-tampa", placeId: "ChIJb665ozDFwogRNrVsepGJrNY",
    match: { name: "The Bagel Nook", city: "Tampa" }, /* note: "The brand has several Florida stores — placeId and the city gate pin this to the downtown Tampa one", */
    address: "300 W Tyler St Ste 210, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da0oFQas_m5/", creator: "cailincoastal", /* postedAt: "2026-07-15", */ }] },
  { key: "kungfu-kitchen-brandon", placeId: "ChIJMxRkEfbPwogRf7eSyMSsyOI",
    match: { name: "Kungfu Kitchen", city: "Brandon" }, /* note: "Google spells it 'Kungfu Kitchen'; the caption spells it 'Kung Fu Kitchen', which norm() reads as a DIFFERENT string — the placeId is what resolves it either way", */
    address: "1513 W Brandon Blvd, Brandon, FL 33511", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DayK-rgun66/", creator: "cailincoastal", /* postedAt: "2026-07-14", */ }] },
  { key: "fusillo-st-petersburg", placeId: "ChIJuTpIh6zhwogRVDPLO_oed7U",
    match: { name: "Fusillo", city: "St. Petersburg" }, displayName: "Fusillo Pasta St. Pete",
    address: "905 Central Ave, St. Petersburg, FL 33705", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DavfhuHuv9J/", creator: "cailincoastal", /* postedAt: "2026-07-13", */ }] },
  { key: "agave-social-tampa", placeId: "ChIJo9ZVDI7BwogRQmX2pgDkJFk",
    match: { name: "Agave Social", city: "Tampa" },
    address: "14803 N Dale Mabry Hwy, Tampa, FL 33618", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DafzW8tu19B/", creator: "cailincoastal", /* postedAt: "2026-07-07", */ }] },
  { key: "sodough-square-st-petersburg", placeId: "ChIJ25CTOATnwogRKwXjsYgh99I",
    match: { name: "Sodough Square", city: "St. Petersburg" },
    address: "6925 4th St N, St. Petersburg, FL 33702", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUWx4GQjwMt/", creator: "cailincoastal", reach: 75, /* postedAt: "2026-02-04", */ }] },
  // ═══════════════════════════════════════════════════════════════════════════
  // v8.43 — @gabrielaromero11, the Miami batch (2026-08-23).
  //
  // 78 posts supplied by the owner; 70 places entered. Same method as the
  // @cailincoastal batch above: og:description read straight off instagram.com
  // with a crawler UA, then EVERY venue resolved against Google Places v1
  // searchText before a line was written, so every entry carries a real placeId
  // and PASS 1 resolves it exactly.
  //
  // She is by some distance the highest-REACH creator in this library — the
  // corpus runs from 239 to 9,835 likes with a median near 2,300, where the
  // Tampa Bay batch topped out at 107. Her captions are in Spanish; every
  // caption BELOW is Wayfind's own words in English, as the rule requires, and
  // is a description of the place rather than a translation of her post.
  //
  // RESOLUTION CAUGHT FOUR WRONG VENUES, which is the reason it is done at all:
  // "Berry Mood" returned a Dollar Tree, "El Líder" a different Cuban
  // restaurant, "Pal Perrero" a padel club, and "Sugar Bloom 305" a temporarily
  // closed berry farm 20 miles away. Three were re-resolved correctly against a
  // second query; the fourth was dropped. A batch this size entered on caption
  // text alone would have shipped all four.
  //
  // EIGHT POSTS DELIBERATELY NOT ENTERED, each for a stated reason:
  //   • DZlalVEO9qP, DY5YZj4zQM8 — recipes. No venue.
  //   • DWWaUamDhC8 — a McDonald's toy promotion. Not a place.
  //   • DY2zpEDzwOf — a private short-term rental villa.
  //   • DWPcAV3EgmW — a private chef who cooks at YOUR home. No venue to visit.
  //   • DZAW1AwOp9p (Casa Selva) — no Google listing under any query tried.
  //   • DZ_Ax3KTytZ (Sugar Bloom 305) — a made-to-order home baker; the caption
  //     says so outright ("se hornean frescos bajo pedido"). No storefront.
  //   • DcMmMtvz5PA (Berry Mood) — no Google listing at EITHER address the
  //     caption gives; both queries returned unrelated businesses.
  //   • DVrcbrrDk38 — Cirque du Soleil's LUZIA at Gulfstream Park. A touring
  //     show, and it has since ended; the venue was not the recommendation.
  //
  // ONE POST FROM A DIFFERENT CREATOR IS ALSO HELD BACK. DM2rX-2Ans2 is a
  // @canchica round-up of ~10 Venezuelan spots, each with a real address, and
  // its venues resolve cleanly. It is out because entering three of them would
  // hand @canchica exactly CREATOR_PAGE_MIN_SPOTS and mint her an indexable
  // page whose every row embeds THE SAME video — thin by construction, off one
  // post, from August 2025. Two more posts from her and the whole round-up
  // becomes worth entering.
  //
  // TWO ARE CORROBORATIONS, merged onto the entries above rather than added
  // here: Boûlan Wynwood (@fashion.eat.travel found it first) and Pronto Café
  // in Hialeah (@alexandramartin_tv) — who, notably, filmed the same pan con
  // bistec a Miami creator independently went for six months later.
  //
  // NO PHOTO CONSENT ON FILE for this creator either — see the note on the
  // @cailincoastal batch above. She renders initials and is credited by handle
  // with a followed link.
  // ═══════════════════════════════════════════════════════════════════════════

  // Two videos, ONE creator, one venue — deliberately NOT corroboration.
  // creatorCountFor() counts distinct handles, so this stays at 1 and earns no
  // trend flag: a person with a favourite is not a town noticing.
  { key: "alfreds-bakery-doral", placeId: "ChIJWaAhpcG72YgRzHo_xlU6wLk",
    match: { name: "Alfreds Bakery", city: "Doral" },
    address: "10201 NW 58th St #103, Doral, FL 33178", category: "Food",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/Dap7jd8Ot6V/", creator: "gabrielaromero11", reach: 2137, /* postedAt: "2026-07-11", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/DWrAtrHjisw/", creator: "gabrielaromero11", /* postedAt: "2026-04-03", */ }] },
  // Same rule: one creator, two nights at the arena.
  { key: "kaseya-center-miami", placeId: "ChIJlZFyCaC22YgRbFtPKFIFrRM",
    match: { name: "Kaseya Center", city: "Miami" },
    address: "601 Biscayne Blvd, Miami, FL 33132", category: "Activities",
    videos: [
      { platform: "instagram", url: "https://www.instagram.com/p/DXIFkaPE_JV/", creator: "gabrielaromero11", reach: 291, /* postedAt: "2026-04-14", */ },
      { platform: "instagram", url: "https://www.instagram.com/p/DWbkA83jiz-/", creator: "gabrielaromero11", reach: 269, /* postedAt: "2026-03-28", */ }] },
  { key: "arepera-araguaney-miami", placeId: "ChIJiVoQKPW32YgRcBqp1YYscZ8",
    match: { name: "Arepera Araguaney", city: "Miami" },
    address: "705 W Flagler St, Miami, FL 33130", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcWG3n4uMQj/", creator: "gabrielaromero11", reach: 491, /* postedAt: "2026-08-22", */ }] },
  { key: "south-florida-off-road-tours-miami", placeId: "ChIJLdM5b4_p2YgRMMBQSpU30L0",
    match: { name: "South Florida Off Road Tours", city: "Miami" },
    address: "17380 SW 168th Ave, Miami, FL 33187", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcRx5FMznfn/", creator: "gabrielaromero11", reach: 239, /* postedAt: "2026-08-20", */ }] },
  { key: "aloha-catering-medley", placeId: "ChIJS6usPha72YgRyZo3Xspq74Q",
    match: { name: "Aloha Catering", city: "Medley" }, displayName: "Aloha Catering Miami",
    address: "7921 NW 66th St, Medley, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcPNRWCzJzH/", creator: "gabrielaromero11", reach: 3953, /* postedAt: "2026-08-19", */ }] },
  { key: "la-esquina-del-chicharron-miami", placeId: "ChIJ71QojyS32YgRUy2lCCIsHxI",
    match: { name: "La Esquina del Chicharrón", city: "Miami" },
    address: "169 NE 25th St, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db_pGQ3T50c/", creator: "gabrielaromero11", reach: 1366, /* postedAt: "2026-08-13", */ }] },
  { key: "manasota-key-resort-englewood", placeId: "ChIJPQBFR8mpxIgRUFHMPbfyzuk",
    match: { name: "Manasota Key Resort", city: "Englewood" },
    address: "985 Gulf Blvd, Englewood, FL 34223", category: "Hotels",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db6f1xAzXOz/", creator: "gabrielaromero11", reach: 1461, /* postedAt: "2026-08-11", */ }] },
  { key: "rio-grande-coral-way-miami", placeId: "ChIJcYG4UWq_2YgRE7QTzwGqb5Q",
    match: { name: "Rio Grande Churrascaria", city: "Miami" }, /* note: "TWO Rio Grande churrascarias are in this batch (this one and Hollywood) — the placeId separates them; the match roots deliberately carry the neighbourhood so the name path cannot either", */
    address: "11995 SW 26th St, Miami, FL 33175", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dav1ElQzMuM/", creator: "gabrielaromero11", reach: 7056, /* postedAt: "2026-07-13", */ }] },
  { key: "madame-olivia-midtown-miami", placeId: "ChIJXQKnpwKx2YgRpmpajKBcSsM",
    match: { name: "Madame Olivia Midtown", city: "Miami" }, /* note: "TWO Madame Olivia locations are in this batch. norm() makes neither root a substring of the other, and both carry a placeId", */
    address: "3417 NE 1st Ave, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dak2E0UOcdd/", creator: "gabrielaromero11", reach: 2140, /* postedAt: "2026-07-09", */ }] },
  { key: "hakuna-matata-pizzeria-miami", placeId: "ChIJ50CQep252YgRIBXSGDitzVk",
    match: { name: "Hakuna Matata Pizzeria", city: "Miami" },
    address: "8752 SW 40th St, Miami, FL 33165", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DajB-LGTgok/", creator: "gabrielaromero11", reach: 9323, /* postedAt: "2026-07-08", */ }] },
  { key: "la-macha-taqueria-doral", placeId: "ChIJy7RVBQC52YgRvXZ6o8vXHq8",
    match: { name: "La Macha Taqueria", city: "Doral" },
    address: "9619 NW 41st St, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DagbmIfTXeQ/", creator: "gabrielaromero11", reach: 4331, /* postedAt: "2026-07-07", */ }] },
  { key: "mister-o1-wynwood-miami", placeId: "ChIJcyAwPKy22YgRDQNU5lP6UVI",
    match: { name: "Mister O1 Extraordinary Pizza", city: "Miami" },
    address: "2315 N Miami Ave, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DadEBlNuu97/", creator: "gabrielaromero11", reach: 485, /* postedAt: "2026-07-06", */ }] },
  { key: "mister-1111-medley", placeId: "ChIJeypiAQK32YgR5snBbBJSwxA",
    match: { name: "Mister 11:11", city: "Medley" },
    address: "7300 NW 84th Ave, Medley, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ7tQqJOnQg/", creator: "gabrielaromero11", reach: 6385, /* postedAt: "2026-06-23", */ }] },
  { key: "inka-nikkei-miami", placeId: "ChIJz-3g0sDB2YgRO6WGPpqPHa0",
    match: { name: "Inka Nikkei", city: "Miami" },
    address: "14697 SW 104th St, Miami, FL 33186", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZzv0iCucEs/", creator: "gabrielaromero11", reach: 3637, /* postedAt: "2026-06-20", */ }] },
  { key: "the-best-acai-miami-beach", placeId: "ChIJNa1-V2O12YgRAqLfC-1lsb0",
    match: { name: "The Best Açaí", city: "Miami Beach" },
    address: "540 Lincoln Rd, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZvjdRiTC8X/", creator: "gabrielaromero11", reach: 5714, /* postedAt: "2026-06-18", */ }] },
  { key: "veganlitaly-coral-gables", placeId: "ChIJO5IyrXW32YgRnyXQP2MkKnE",
    match: { name: "Veganlitaly", city: "Coral Gables" },
    address: "3808 SW 8th St, Coral Gables, FL 33134", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZs4a5uT94X/", creator: "gabrielaromero11", reach: 650, /* postedAt: "2026-06-17", */ }] },
  { key: "sano-food-doral", placeId: "ChIJUaUivXS82YgRbT4THNosftc",
    match: { name: "Sano Food", city: "Doral" },
    address: "10712 NW 74th St, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZm30_eO869/", creator: "gabrielaromero11", reach: 5200, /* postedAt: "2026-06-15", */ }] },
  { key: "blast-house-burgers-miami", placeId: "ChIJnc76dwC52YgREdu7Qa8PasU",
    match: { name: "Blast House Burgers", city: "Miami" },
    address: "9401 SW 40th St, Miami, FL 33165", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZh1MTfOeco/", creator: "gabrielaromero11", reach: 2711, /* postedAt: "2026-06-13", */ }] },
  { key: "7tyone-miami-beach", placeId: "ChIJSdJjH-Wy2YgRUDTeZcMZAYo",
    match: { name: "7tyone", city: "Miami Beach" },
    address: "1130 Normandy Dr, Miami Beach, FL 33141", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZKtUL-uJFa/", creator: "gabrielaromero11", reach: 2993, /* postedAt: "2026-06-04", */ }] },
  { key: "madame-olivia-north-miami", placeId: "ChIJc4yzjOmz2YgRZL2ZoQs9QlY",
    match: { name: "Madame Olivia North Miami", city: "North Miami" },
    address: "1821 NE 123rd St, North Miami, FL 33181", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYkFfG7uw-M/", creator: "gabrielaromero11", reach: 1916, /* postedAt: "2026-05-20", */ }] },
  { key: "fresh-salad-doral", placeId: "ChIJj84kH5e72YgR3ZT20enUvB8",
    match: { name: "Fresh Salad Miami", city: "Doral" },
    address: "10201 NW 58th St Ste 104, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYe7vNvOpgz/", creator: "gabrielaromero11", reach: 1800, /* postedAt: "2026-05-18", */ }] },
  { key: "hot-dog-maracay-miami", placeId: "ChIJhUvU1XW32YgR9VD9MK8CMLU",
    match: { name: "Hot Dog Maracay", city: "Miami" },
    address: "900 NW 7th Ave, Miami, FL 33136", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYXQ8O1OC7T/", creator: "gabrielaromero11", reach: 1475, /* postedAt: "2026-05-15", */ }] },
  { key: "the-barking-bun-miami", placeId: "ChIJH2nbBnC32YgRnNJ3RywrVOk",
    match: { name: "The Barking Bun", city: "Miami" }, /* note: "The caption's four addresses do not line up one-to-one with its four names — Google's own listing is what fixed each one", */
    address: "1739 NE 2nd Ave, Miami, FL 33132", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYXQ8O1OC7T/", creator: "gabrielaromero11", reach: 1475, /* postedAt: "2026-05-15", */ }] },
  { key: "el-lider-hialeah", placeId: "ChIJdwA2tJml2YgRQmKB5vDJgHw",
    match: { name: "El Lider", city: "Hialeah" }, displayName: "El Lider Miami",
    address: "16969 NW 67th Ave, Hialeah, FL 33015", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYXQ8O1OC7T/", creator: "gabrielaromero11", reach: 1475, /* postedAt: "2026-05-15", */ }] },
  { key: "pal-perrero-miami", placeId: "ChIJ-W890xS72YgRy7dmUNbvdYU",
    match: { name: "Pal Perrero", city: "Miami" },
    address: "8405 NW 66th St, Miami, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYXQ8O1OC7T/", creator: "gabrielaromero11", reach: 1475, /* postedAt: "2026-05-15", */ }] },
  { key: "forages-southwest-ranches", placeId: "ChIJOaxANQeh2YgRFppt3GMgsJ8",
    match: { name: "Forages", city: "Southwest Ranches" },
    address: "7101 SW 185th Way suite 10, Southwest Ranches, FL 33332", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZYRjgxzXip/", creator: "gabrielaromero11", reach: 1464, /* postedAt: "2026-06-09", */ }] },
  { key: "crete-frozen-yogurt-medley", placeId: "ChIJ3QbpMBe72YgR_zGWHA1zLuo",
    match: { name: "Crete Frozen Yogurt", city: "Medley" },
    address: "7300 NW 84th Ave, Medley, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYCnLF0uM_a/", creator: "gabrielaromero11", reach: 2278, /* postedAt: "2026-05-07", */ }] },
  { key: "san-marco-miami-beach", placeId: "ChIJYViXK5-12YgRqxd40YLsIDs",
    match: { name: "San Marco Miami", city: "Miami Beach" },
    address: "840 1st St, Miami Beach, FL 33139", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZGQfZDzrHu/", creator: "gabrielaromero11", /* postedAt: "2026-06-02", */ }] },
  { key: "sardellis-hollywood", placeId: "ChIJ2ZZybj-r2YgRzW-AJXm_GKU",
    match: { name: "Sardelli's Italian Steakhouse", city: "Hollywood" },
    address: "331 Van Buren St, Hollywood, FL 33019", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZPymLiOXdF/", creator: "gabrielaromero11", reach: 1956, /* postedAt: "2026-06-06", */ }] },
  { key: "nino-gordo-wynwood-miami", placeId: "ChIJeScTbwa32YgRwfibKQG-Bxg",
    match: { name: "Niño Gordo", city: "Miami" }, displayName: "Niño Gordo Wynwood",
    address: "112 NW 28th St, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYSwfAiT9yk/", creator: "gabrielaromero11", reach: 2782, /* postedAt: "2026-05-13", */ }] },
  { key: "parrillada-da-silva-doral", placeId: "ChIJh7DSwQe82YgRAxyadBFFXPw",
    match: { name: "Parrillada Familiar Da Silva", city: "Doral" },
    address: "10720 NW 58th St, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZDBw1ruGAE/", creator: "gabrielaromero11", reach: 481, /* postedAt: "2026-06-01", */ }] },
  { key: "stl-cafe-miami", placeId: "ChIJjeUh8Tu32YgRY4P9OJblnB4",
    match: { name: "STL Café", city: "Miami" },
    address: "850 NW 42nd Ave Ste 101, Miami, FL 33126", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DY0O1O-TozG/", creator: "gabrielaromero11", reach: 3913, /* postedAt: "2026-05-26", */ }] },
  { key: "mokah-wynwood-miami", placeId: "ChIJF1LSW0S32YgRjBhh4JsaQfo",
    match: { name: "MŌKAH", city: "Miami" },
    address: "34 NW 29th St, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYuVObYubwx/", creator: "gabrielaromero11", reach: 620, /* postedAt: "2026-05-24", */ }] },
  { key: "sawa-coral-gables", placeId: "ChIJa8EUn-632YgRCPUPVpld-LI",
    match: { name: "Sawa Restaurant & Lounge", city: "Coral Gables" },
    address: "360 San Lorenzo Ave #1500, Coral Gables, FL 33146", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYrziHCusqY/", creator: "gabrielaromero11", reach: 267, /* postedAt: "2026-05-23", */ }] },
  { key: "balloon-museum-miami", placeId: "ChIJExeuhVm32YgRxtpe7J2Pfl0",
    match: { name: "Balloon Museum", city: "Miami" },
    address: "318 NW 23rd St, Miami, FL 33127", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYcTrZMOOw8/", creator: "gabrielaromero11", /* postedAt: "2026-05-17", */ }] },
  { key: "oh-mamma-miami", placeId: "ChIJc31-dGSx2YgRfPu3z13tJ0M",
    match: { name: "Oh Mamma", city: "Miami" },
    address: "210 NE 82nd St, Miami, FL 33138", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYZu42MOtED/", creator: "gabrielaromero11", reach: 721, /* postedAt: "2026-05-16", */ }] },
  { key: "brutal-pepitos-miami", placeId: "ChIJOZcVZ9S72YgRAek77F8bufE",
    match: { name: "Brutal Pepitos", city: "Miami" },
    address: "7429 NW 54th St, Miami, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYQLwqBzs12/", creator: "gabrielaromero11", reach: 1067, /* postedAt: "2026-05-12", */ }] },
  { key: "piacere-pizza-doral", placeId: "ChIJV7tZbwC72YgRbiUCKntZn6g",
    match: { name: "Piacere Wood Fired Pizza", city: "Doral" },
    address: "5675 NW 87th Ave Ste 100, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYKSxxxOC3z/", creator: "gabrielaromero11", reach: 5643, /* postedAt: "2026-05-10", */ }] },
  { key: "mister-corn-doral", placeId: "ChIJ-x7MrSS52YgRzkbWmZlQfFM",
    match: { name: "Mister Corn", city: "Doral" },
    address: "2005 NW 97th Ave k19, Doral, FL 33172", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYHtUMOuwXd/", creator: "gabrielaromero11", reach: 5207, /* postedAt: "2026-05-09", */ }] },
  { key: "el-sushi-by-soya-doral", placeId: "ChIJrbQZBQC_2YgRVlOuC4y6r54",
    match: { name: "El Sushi by Soya", city: "Doral" },
    address: "11402 NW 41st St #101, Doral, FL 33178", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DX-DTrnz9hG/", creator: "gabrielaromero11", reach: 2426, /* postedAt: "2026-05-05", */ }] },
  { key: "plant-the-future-miami", placeId: "ChIJZ1SqfrK22YgRsnv5agRpB9w",
    match: { name: "Plant the Future", city: "Miami" },
    address: "8484 NE 2nd Ave, Miami, FL 33138", category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DX4QCsIOO4g/", creator: "gabrielaromero11", /* postedAt: "2026-05-03", */ }] },
  { key: "southwest-ranches-farmers-market", placeId: "ChIJhRdita6n2YgRAXGrnFK-BH0",
    match: { name: "Southwest Ranches Farmer's Market", city: "Southwest Ranches" }, /* note: "The caption tags three vendor brands (@junglejuice.fl, @brasao.miami, @hummus.fl); the DESTINATION is the market they trade in, which is what Google lists and what a reader can actually go to", */
    address: "5150 S Flamingo Rd, Southwest Ranches, FL 33330", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXzMGabOvFV/", creator: "gabrielaromero11", reach: 1906, /* postedAt: "2026-05-01", */ }] },
  { key: "sifu-doral", placeId: "ChIJq19C-PK72YgRlgO2-QusVy0",
    match: { name: "SiFÚ", city: "Doral" }, displayName: "SiFÚ Doral",
    address: "8665 NW 66th St, Miami, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXwo-rDuSux/", creator: "gabrielaromero11", /* postedAt: "2026-04-30", */ }] },
  { key: "rosso-coffee-club-davie", placeId: "ChIJxV7_BnIJ2YgRx70VLv4ncu4",
    match: { name: "Rosso Coffee Club", city: "Davie" },
    address: "1975 S Flamingo Rd, Davie, FL 33325", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWEKQtLjtzt/", creator: "gabrielaromero11", reach: 1584, /* postedAt: "2026-03-19", */ }] },
  { key: "305-peruvian-miami", placeId: "ChIJmTRdUKO32YgRG_aLnXYf5HA",
    match: { name: "305 Peruvian Modern Cuisine", city: "Miami" },
    address: "261 SW 8th St, Miami, FL 33130", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXmPFRPDlw2/", creator: "gabrielaromero11", reach: 887, /* postedAt: "2026-04-26", */ }] },
  { key: "etaru-hallandale-beach", placeId: "ChIJo_QCg1-r2YgR68lZFkEcwBI",
    match: { name: "ETARU", city: "Hallandale Beach" },
    address: "111 S Surf Rd, Hallandale Beach, FL 33009", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXfQOTdEwth/", creator: "gabrielaromero11", reach: 3414, /* postedAt: "2026-04-23", */ }] },
  { key: "pincho-west-flagler-miami", placeId: "ChIJJ22PHSG52YgRA_B3TOLKzCA",
    match: { name: "PINCHO", city: "Miami" }, /* note: "PINCHO is a chain with several Miami locations — the placeId is what pins this to the West Flagler one she filmed", */
    address: "9251 W Flagler St, Miami, FL 33174", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXb_Pvxjk2R/", creator: "gabrielaromero11", reach: 2358, /* postedAt: "2026-04-22", */ }] },
  { key: "rio-grande-hollywood", placeId: "ChIJ_1YhUzur2YgReuu9jiegbIQ",
    match: { name: "Rio Grande Churrascaria Hollywood", city: "Hollywood" }, /* note: "See rio-grande-coral-way-miami", */
    address: "1655 S 21st Ave, Hollywood, FL 33020", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXXiUI9k9bs/", creator: "gabrielaromero11", reach: 2348, /* postedAt: "2026-04-20", */ }] },
  { key: "parrilla-point-medley", placeId: "ChIJ8Qku8Fa72YgR2nvM9nRyE7c",
    match: { name: "Parrilla Point", city: "Medley" },
    address: "7921 NW 66th St, Miami, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXPHNmHDmeb/", creator: "gabrielaromero11", reach: 2748, /* postedAt: "2026-04-17", */ }] },
  { key: "frenchies-calientes-southwest-ranches", placeId: "ChIJjThZb8Gh2YgRXPsrehmDaFc",
    match: { name: "Frenchies Calientes", city: "Southwest Ranches" }, displayName: "Frenchies Calientes Hot Dog",
    address: "5140 SW 208th Ln, Southwest Ranches, FL 33332", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXKqT6EE8S0/", creator: "gabrielaromero11", reach: 5724, /* postedAt: "2026-04-15", */ }] },
  { key: "naguara-hot-dogs-miami", placeId: "ChIJxXnzwtG72YgR2ngEfSeKA20",
    match: { name: "Na'guara hot dogs", city: "Miami" },
    address: "8490 NW 68th St, Miami, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXKqT6EE8S0/", creator: "gabrielaromero11", reach: 5724, /* postedAt: "2026-04-15", */ }] },
  { key: "diyon-hotdogs-miami", placeId: "ChIJ9_gKQCix2YgRoLXkxdjuleE",
    match: { name: "Diyon Hotdogs", city: "Miami" },
    address: "3621 NW 25th St, Miami, FL 33142", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXKqT6EE8S0/", creator: "gabrielaromero11", reach: 5724, /* postedAt: "2026-04-15", */ }] },
  { key: "metro-caracas-hotdog-miami", placeId: "ChIJy_82XJ232YgRyMPLruA8h8w",
    match: { name: "Metro Caracas Hotdog", city: "Miami" },
    address: "151 NE 27th St, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXKqT6EE8S0/", creator: "gabrielaromero11", reach: 5724, /* postedAt: "2026-04-15", */ }] },
  { key: "casa-tua-cucina-wynwood-miami", placeId: "ChIJBwFsXuW32YgREo290MTrQHM",
    match: { name: "Casa Tua Cucina", city: "Miami" }, displayName: "Casa Tua Cucina Wynwood",
    address: "NW 27th Terrace & NW 2nd Ave, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXEyDFsjjmS/", creator: "gabrielaromero11", reach: 9534, /* postedAt: "2026-04-13", */ }] },
  { key: "ava-coconut-grove-miami", placeId: "ChIJJffET7632YgRolxzqJYaBcc",
    match: { name: "AVA MediterrAegean", city: "Miami" },
    address: "2889 McFarlane Rd, Miami, FL 33133", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW_nHsijgDq/", creator: "gabrielaromero11", reach: 5341, /* postedAt: "2026-04-11", */ }] },
  { key: "by-brothers-miami", placeId: "ChIJz4Ucz5Lp2YgRG9sCckMPEQ0",
    match: { name: "By Brothers", city: "Miami" },
    address: "15515 SW 177th Ave, Miami, FL 33187", category: "Family",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW6dkXnDrJO/", creator: "gabrielaromero11", reach: 1541, /* postedAt: "2026-04-09", */ }] },
  { key: "lira-house-wynwood-miami", placeId: "ChIJZ6cL0-e32YgRPRoWEZzYz88",
    match: { name: "Lira House", city: "Miami" }, displayName: "Lira House Wynwood",
    address: "2000 NW 2nd Ave, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DW2DqvZCS-z/", creator: "gabrielaromero11", reach: 2985, /* postedAt: "2026-04-07", */ }] },
  { key: "lentrecote-sunny-isles-beach", placeId: "ChIJCSwptQKt2YgRYw-RZ3Xkl-8",
    match: { name: "Lentrecote", city: "Sunny Isles Beach" }, displayName: "Lentrecote French Restaurant",
    address: "18146 Collins Ave, Sunny Isles Beach, FL 33160", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWwKRhvDr_y/", creator: "gabrielaromero11", /* postedAt: "2026-04-05", */ }] },
  { key: "superblue-miami", placeId: "ChIJqU2oA4m32YgRYwF5JdM4I38",
    match: { name: "Superblue Miami", city: "Miami" },
    address: "1101 NW 23rd St, Miami, FL 33127", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWmqq4JDjhi/", creator: "gabrielaromero11", reach: 2187, /* postedAt: "2026-04-01", */ }] },
  { key: "le-specialita-coconut-grove-miami", placeId: "ChIJDYJ34TG32YgRL6OSt-0n5ss",
    match: { name: "Le Specialita", city: "Miami" }, displayName: "Le Specialita Café & Market",
    address: "2653 S Bayshore Dr, Miami, FL 33133", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWhhYt0DvB9/", creator: "gabrielaromero11", reach: 5102, /* postedAt: "2026-03-30", */ }] },
  { key: "majestic-portuguese-bakehouse-miami", placeId: "ChIJgfpf6Qm32YgRGTHIgOFBjW4",
    match: { name: "Majestic Portuguese Bakehouse", city: "Miami" },
    address: "3340 Coral Wy, Miami, FL 33145", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWeMFQSjn9e/", creator: "gabrielaromero11", reach: 5020, /* postedAt: "2026-03-29", */ }] },
  { key: "milagros-farm-miami", placeId: "ChIJl2S_W9Lr2YgRtdR9_YtEUHU",
    match: { name: "Milagros Farm", city: "Miami" },
    address: "17721 SW 104th St, Miami, FL 33196", category: "Family",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWZCiwujhpC/", creator: "gabrielaromero11", reach: 1769, /* postedAt: "2026-03-27", */ }] },
  { key: "mayami-wynwood-miami", placeId: "ChIJhe3DKSu32YgRVOWZEyWPqdo",
    match: { name: "Mayami", city: "Miami" }, displayName: "Mayami Wynwood",
    address: "127 NW 23rd St, Miami, FL 33127", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWUpDtpjpLX/", creator: "gabrielaromero11", reach: 2981, /* postedAt: "2026-03-25", */ }] },
  { key: "tu-sancocho-express-doral", placeId: "ChIJBaHYVHq72YgRRJ6ayeJqRpo",
    match: { name: "Tu Sancocho Express", city: "Doral" },
    address: "7415 NW 54th St, Doral, FL 33166", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWJoyzaDvVQ/", creator: "gabrielaromero11", reach: 6738, /* postedAt: "2026-03-21", */ }] },
  { key: "pasta-e-basta-miami", placeId: "ChIJxQ7i2J-x2YgR4VgRLlrYkNs",
    match: { name: "Pasta e Basta", city: "Miami" },
    address: "30 NW 34th St Ste 110, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DV80-8Rjvzl/", creator: "gabrielaromero11", reach: 6167, /* postedAt: "2026-03-16", */ }] },
  { key: "signor-sassi-hallandale-beach", placeId: "ChIJw0TRvEat2YgROpFgeN-2rc4",
    match: { name: "Signor Sassi", city: "Hallandale Beach" },
    address: "1006 E Hallandale Beach Blvd, Hallandale Beach, FL 33009", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DV6IuicDhpa/", creator: "gabrielaromero11", reach: 1611, /* postedAt: "2026-03-15", */ }] },
  { key: "el-nano-coral-gables", placeId: "ChIJE_-bfqi32YgRuEbR3HQXiq4",
    match: { name: "El Ñaño", city: "Coral Gables" }, displayName: "El Ñaño Miami",
    address: "339 Miracle Mile, Miami, FL 33134", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DV1EEk_jsIl/", creator: "gabrielaromero11", reach: 9835, /* postedAt: "2026-03-13", */ }] },
  { key: "mangiamo-doral", placeId: "ChIJze21JQC72YgRI4f9-Z7ofEY",
    match: { name: "Mangiamo", city: "Doral" },
    address: "7369 NW 34th St, Doral, FL 33122", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVwiZaXju28/", creator: "gabrielaromero11", reach: 661, /* postedAt: "2026-03-11", */ }] },
  { key: "canta-corazon-wynwood-miami", placeId: "ChIJab7ZGDu32YgR377f_tXuWzU",
    match: { name: "Canta Corazón", city: "Miami" }, displayName: "Canta Corazón Wynwood",
    address: "2445 N Miami Ave, Miami, FL 33127", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVoHYrrDiBu/", creator: "gabrielaromero11", reach: 6128, /* postedAt: "2026-03-08", */ }] },
  // ═══════════════════════════════════════════════════════════════════════════
  // v8.44 — @eatsbylaurr, Tampa Bay (2026-08-23).
  //
  // 30 posts supplied, 27 places entered, 2 of them merged above as
  // CORROBORATIONS instead: Tommy's Chophouse (Ybor) and Roasted813, both of
  // which @stufftodointampabay had already found. Same method as the two
  // batches above — og:description off instagram.com with a crawler UA, then
  // every venue resolved against Google Places v1 before a line was written.
  //
  // TOMMY'S CHOPHOUSE IS ALSO A CORRECTION. The 2026-08-06 batch REFUSED to add
  // it because Google's display name was literally "Tommy's Chophouse - Opening
  // Soon" — the right call then. It is now OPERATIONAL with 66 reviews, so this
  // is the entry finally earning its placeId, from a second creator.
  //
  // ONE POST NOT ENTERED: DaeAToOJAAD is the Netflix House Stranger Things
  // experience in DALLAS, TEXAS. Wayfind is a Florida product; a card for it is
  // a place a reader here cannot go.
  //
  // OWNER NOTE, honoured: "the japonoze store is great with kids btw" — Ebisu
  // is filed under Family rather than Shopping on the strength of that.
  //
  // NO PHOTO CONSENT on file for this creator either; she renders initials and
  // is credited by handle with a followed link. See the note on the
  // @cailincoastal batch.
  // ═══════════════════════════════════════════════════════════════════════════
  { key: "sogna-napoli-tampa", placeId: "ChIJjVv1s8PBwogRKcHMfbnnYiQ",
    match: { name: "Sogna Napoli", city: "Tampa" }, displayName: "Sogna Napoli Trattoria & Pizzeria", note: "Her caption calls it 'Spacca Napoli'; Google lists 'Sogna Napoli Trattoria & Pizzeria' at that exact address and there is no second Napoli trattoria on that block. Google's name is the one a reader will see on the door, so it is the one keyed here.",
    address: "12913 N Dale Mabry Hwy, Tampa, FL 33618", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/C_i-9OFxzKh/", creator: "eatsbylaurr", reach: 8803, /* postedAt: "2024-09-05" */ }] },
  { key: "burger-culture-lutz", placeId: "ChIJm_MbVcLHwogRdDvs5papv1A",
    match: { name: "Burger Culture", city: "Tampa" }, note: "Her caption says Lutz; Google's address is N Florida Ave, Tampa 33613, immediately south of the Lutz line. The address is the fact, so the city gate is Tampa.",
    address: "15526 N Florida Ave, Tampa, FL 33613", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcRnHGjppJT/", creator: "eatsbylaurr", reach: 122, /* postedAt: "2026-08-20" */ }] },
  { key: "lady-and-the-mug-tampa", placeId: "ChIJiQg4SH7FwogRREQj9LKv9JA",
    match: { name: "Lady and the Mug", city: "Tampa" },
    address: "510 W Grand Central Ave, Tampa, FL 33606", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcMgE1QpSX9/", creator: "eatsbylaurr", reach: 235, /* postedAt: "2026-08-18" */ }] },
  { key: "bodega-bus-tampa", placeId: "ChIJpYJWz2_FwogRdPdhUqFdUYg",
    match: { name: "Bodega Bus", city: "Tampa" },
    address: "505 N Franklin St, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcHUNpnpGKK/", creator: "eatsbylaurr", reach: 490, /* postedAt: "2026-08-16" */ }] },
  { key: "sodough-square-tampa", placeId: "ChIJL3wQOF3DwogRspNmaImYNks",
    match: { name: "SoDough Square", city: "Tampa" }, note: "DISTINCT from sodough-square-st-petersburg — same brand, different location, different placeId. @cailincoastal filmed the St. Pete one; this is Tampa.",
    address: "138 S Dale Mabry Hwy A, Tampa, FL 33609", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DcBueVYux2S/", creator: "eatsbylaurr", reach: 746, /* postedAt: "2026-08-14" */ }] },
  { key: "ebisu-tampa", placeId: "ChIJl4yUMAC3wogRIsIpAqpCHRs",
    match: { name: "Ebisu", city: "Tampa" }, displayName: "Ebisu Tampa",
    address: "6234 Commerce Palms Dr, Tampa, FL 33647", category: "Family",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db60LmPJd2e/", creator: "eatsbylaurr", reach: 368, /* postedAt: "2026-08-11" */ }] },
  { key: "brewly-cafe-tampa", placeId: "ChIJObt0oc3FwogRp6S69IOrc98",
    match: { name: "Brewly Cafe", city: "Tampa" },
    address: "411 N Florida Ave, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db4EfTYJM_n/", creator: "eatsbylaurr", reach: 137, /* postedAt: "2026-08-10" */ }] },
  { key: "station-house-bbq-tampa", placeId: "ChIJ3Rit2Qq5wogRKv1xCNAklSs",
    match: { name: "Station House BBQ", city: "Tampa" },
    address: "5214 N Nebraska Ave, Tampa, FL 33603", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dby6I8HJY78/", creator: "eatsbylaurr", reach: 1092, /* postedAt: "2026-08-08" */ }] },
  { key: "ploy-thai-brandon", placeId: "ChIJo9jsaGTOwogRdOmdOfqbAxc",
    match: { name: "Ploy Thai", city: "Brandon" },
    address: "1941 W Brandon Blvd, Brandon, FL 33511", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbtAgOvuTOO/", creator: "eatsbylaurr", reach: 152, /* postedAt: "2026-08-06" */ }] },
  { key: "sofresh-tampa", placeId: "ChIJsxvw2YvEwogRCqbQZ7wpHUE",
    match: { name: "SoFresh", city: "Tampa" }, note: "A chain with many Florida locations; the placeId pins this to the downtown Tampa store she filmed.",
    address: "512 N Franklin St, Tampa, FL 33602", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbqULBMuaMf/", creator: "eatsbylaurr", reach: 63, /* postedAt: "2026-08-05" */ }] },
  { key: "cairo-cravings-temple-terrace", placeId: "ChIJy0nsMePHwogRDUr5WXBynR8",
    match: { name: "Cairo Cravings", city: "Temple Terrace" },
    address: "11009 N 56th St, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dbi1cHNuK0r/", creator: "eatsbylaurr", reach: 671, /* postedAt: "2026-08-02" */ }] },
  { key: "brick-and-mortar-st-petersburg", placeId: "ChIJm6YHl4PhwogRHXgaRna2Ndc",
    match: { name: "Brick & Mortar", city: "St. Petersburg" },
    address: "539 Central Ave, St. Petersburg, FL 33701", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbbHW8COJxe/", creator: "eatsbylaurr", reach: 202, /* postedAt: "2026-07-30" */ }] },
  { key: "nazs-halal-tampa", placeId: "ChIJ12-F9xTHwogR2epNwOfvBfU",
    match: { name: "Naz's Halal Food", city: "Tampa" },
    address: "1815 E Fowler Ave, Tampa, FL 33612", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbV5JkkOqPJ/", creator: "eatsbylaurr", reach: 157, /* postedAt: "2026-07-28" */ }] },
  { key: "perro-y-salsa-tampa", placeId: "ChIJLYqwFgDBwogR8jv9-KOOKAc",
    match: { name: "Perro Y Salsa", city: "Tampa" },
    address: "5415 W Linebaugh Ave, Tampa, FL 33624", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbQnTFUuCh6/", creator: "eatsbylaurr", reach: 230, /* postedAt: "2026-07-26" */ }] },
  { key: "marina-grille-clearwater-beach", placeId: "ChIJ352SLTf3wogR5QAhr23PJhE",
    match: { name: "Marina Grille", city: "Clearwater Beach" },
    address: "411 E Shore Dr, Clearwater, FL 33767", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbHE8hGJ7pR/", creator: "eatsbylaurr", reach: 122, /* postedAt: "2026-07-22" */ }] },
  { key: "the-red-bird-temple-terrace", placeId: "ChIJL_P88M3HwogRxAdUGTdrcQE",
    match: { name: "The Red Bird", city: "Temple Terrace" },
    address: "11301 N 56th St Ste 6, Temple Terrace, FL 33617", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbEafgeJt4J/", creator: "eatsbylaurr", reach: 101, /* postedAt: "2026-07-21" */ }] },
  { key: "ganges-sarasota", placeId: "ChIJ9VVjJQA5w4gRgCmeYa3DAMM",
    match: { name: "Ganges Restaurant", city: "Sarasota" }, displayName: "Ganges Restaurant & Bar",
    address: "5013 Ringwood Meadow, Sarasota, FL 34235", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da-m1xiOmHA/", creator: "eatsbylaurr", reach: 89, /* postedAt: "2026-07-19" */ }] },
  { key: "sunda-new-asian-tampa", placeId: "ChIJ4VV6ppbDwogRbOl5NqhG6kA",
    match: { name: "Sunda New Asian", city: "Tampa" },
    address: "3648 Midtown Dr, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DayaiokJw2k/", creator: "eatsbylaurr", reach: 176, /* postedAt: "2026-07-14" */ }] },
  { key: "alimento-tampa", placeId: "ChIJwZnbpBHpwogR3PZgkgesIoc",
    match: { name: "alimento", city: "Tampa" },
    address: "2966 N Dale Mabry Hwy, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DavUl-jOt2i/", creator: "eatsbylaurr", reach: 114, /* postedAt: "2026-07-13" */ }] },
  { key: "happy-fish-tampa", placeId: "ChIJ3xGkbI3DwogRApmOd1WDFHA",
    match: { name: "Happy Fish", city: "Tampa" },
    address: "4046 Fiesta Plaza, Tampa, FL 33607", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Dagf38apoqC/", creator: "eatsbylaurr", reach: 163, /* postedAt: "2026-07-07" */ }] },
  { key: "rock-n-roll-sushi-apollo-beach", placeId: "ChIJ8RJCVp3ZwogRo-_z9hFUKjU",
    match: { name: "Rock N Roll Sushi", city: "Apollo Beach" },
    address: "6170 Paseo Al Mar Blvd #103, Apollo Beach, FL 33572", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DabG49Gp5O6/", creator: "eatsbylaurr", reach: 123, /* postedAt: "2026-07-05" */ }] },
  { key: "international-plaza-tampa", placeId: "ChIJN55L42rGt4kRTHYc4QFZM3c",
    match: { name: "International Plaza", city: "Tampa" }, displayName: "International Plaza and Bay Street", note: "A mall, entered as the destination the post is actually about — she walks Bay Street's restaurant row rather than recommending one room.",
    address: "2223 N Westshore Blvd, Tampa, FL 33607", category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaQh0dOuUNg/", creator: "eatsbylaurr", reach: 100, /* postedAt: "2026-07-01" */ }] },
  { key: "con-amor-tampa", placeId: "ChIJj_gXZRrFwogRQGeho6l9TPk",
    match: { name: "Con Amor", city: "Tampa" },
    address: "5240 N Florida Ave, Tampa, FL 33603", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZ0AnocOmW5/", creator: "eatsbylaurr", reach: 173, /* postedAt: "2026-06-20" */ }] },
  { key: "sea-worthy-fish-bar-tierra-verde", placeId: "ChIJwRGBsWcdw4gRNBMBx_4nXvk",
    match: { name: "Sea Worthy Fish Bar", city: "Tierra Verde" },
    address: "1110 Pinellas Bayway S, Tierra Verde, FL 33715", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DZnOZbCuVRa/", creator: "eatsbylaurr", reach: 163, /* postedAt: "2026-06-15" */ }] },
  // ═══════════════════════════════════════════════════════════════════════════
  // v8.45 — @iviethefoodie, Miami / Broward (2026-08-23).
  //
  // 57 posts supplied, 38 places entered. Same method as the three batches
  // above: crawler-UA og:description, then every venue resolved against Google
  // Places v1 before a line was written.
  //
  // SHE IS THE HIGHEST-REACH CREATOR IN THE LIBRARY (287 to 9,493 likes) and the
  // first whose feed is mostly NOTABLE rooms rather than neighbourhood finds —
  // two Michelin-starred kitchens (Boia De, MAASS), two omakase counters, a
  // caviar tasting menu, and Bern's, which is the single most-reviewed venue in
  // the whole library at 9,868 Google reviews.
  //
  // NINETEEN POSTS NOT ENTERED, and the reasons matter more here than in any
  // earlier batch because the failure modes are new:
  //
  // 1. SPONSORED POSTS — SEVEN of them (DoorDash x2, Wingstop, Krispy Kreme,
  //    Square, a Mister O1 giveaway, and a Night Owl Cookies product collab that
  //    is her own line). THIS IS THE LINE THAT MATTERS. A brand-paid post is not
  //    an organic find, and lib/trendSignal.js's whole claim to be allowed near
  //    the ranking is that no creator input here is monetized. Entering an #ad
  //    venue as a creator recommendation would launder advertising into a list
  //    that prints "no paid placement" on itself. Two of the seven were not even
  //    posted BY her — @nightowlcookies posted them and tagged her.
  // 2. OUT OF MARKET — San Sebastián and Madrid. Wayfind is Florida.
  // 3. CLOSED — Knaus Berry Farm and Frankie & Wally's both return
  //    CLOSED_TEMPORARILY. Knaus is SEASONAL (it shuts for the summer and
  //    reopens around November) and is worth adding then; it is not a dead
  //    business, it is a shut one, and a card for it today sends a reader to a
  //    locked gate.
  // 4. NO GOOGLE LISTING — Chuckie's Steaks n Hoagies (Westchester) returns a
  //    Fort Lauderdale cheesesteak shop and a mall Charleys, neither of which is
  //    it. Tita's Glorieta returns a "Tita's Food Truck" in HIALEAH when her
  //    caption says Allapattah — a food truck whose location the sources
  //    disagree about is the exact mis-attribution PASS 1 exists to prevent.
  // 5. NOT A RECOMMENDATION — a Tame Impala concert with no venue named, a
  //    Burger Bash recap, a one-day donut collab that is over, and a post
  //    reporting MAGGOTS in a catering order. That last one is a complaint, and
  //    a complaint is not a place card in either direction: neither the venue
  //    she warns about nor the one she thanks is entered.
  //
  // ROUNDUPS: her ranked lists (top-10 BBQ, top-10 South Florida eats) name
  // venues by @handle with no address, which is not enough to resolve safely.
  // The three roundups that DO carry addresses contributed four entries
  // (Go Greek, Yauca, The Butcher Shop, Papo Llega y Pon).
  //
  // HER PARTNERSHIP: the owner reports a partnership with this creator and that
  // her own Foodie Map may be fetched. Checked on the day — iviethefoodie.com's
  // Food Map page and Shop are BOTH "Coming Soon" and publish no venue data, so
  // every entry below still comes from her posts. If the partnership involves
  // payment or other consideration, see the note in lib/creatorRights.js: a paid
  // creator cannot keep feeding lib/trendSignal.js's corroboration source
  // without breaking the claim that page makes.
  // ═══════════════════════════════════════════════════════════════════════════
  { key: "carvel-bird-road-miami", placeId: "ChIJd_ueXDW_2YgR_KpiHatf9mA",
    match: { name: "Carvel", city: "Miami" },
    address: "4226 SW 152nd Ave, Miami, FL 33185", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db7K8W_KxbS/", creator: "iviethefoodie", reach: 4790, /* postedAt: "2026-08-11" */ }] },
  { key: "miami-slice-coconut-grove", placeId: "ChIJuUT523632YgRBMFdMCwrT7A",
    match: { name: "Miami Slice", city: "Miami" }, displayName: "Miami Slice Coconut Grove", note: "3.9 stars on 12 reviews — a brand-new room. Below the floor, added with NO rank boost.",
    address: "2996 McFarlane Rd, Miami, FL 33133", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Db3MVxTxnLO/", creator: "iviethefoodie", reach: 2764, /* postedAt: "2026-08-10" */ }] },
  { key: "shops-at-merrick-park-coral-gables", placeId: "ChIJE62csu632YgRyNLkXVYldRo",
    match: { name: "Shops at Merrick Park", city: "Coral Gables" }, note: "Roll Model is a SUNDAY FARMERS-MARKET POP-UP with no fixed address of its own. The destination a reader can actually go to is the market, which is what Google lists and what is keyed here.",
    address: "4310 Ponce de Leon Blvd, Coral Gables, FL 33146", category: "Shopping",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DbOePOPRd_D/", creator: "iviethefoodie", reach: 7655, /* postedAt: "2026-07-25" */ }] },
  { key: "ockap-caviar-brickell-miami", placeId: "ChIJAQDA5oO22YgRgz9gUAZZk4c",
    match: { name: "Ockap Caviar & Cuisine", city: "Miami" },
    address: "1060 Brickell Ave, Miami, FL 33131", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/Da5fR7ZBf9U/", creator: "iviethefoodie", reach: 1797, /* postedAt: "2026-07-16" */ }] },
  { key: "takay-coral-way-miami", placeId: "ChIJQ47WSc232YgRAjB9GMNA6I8",
    match: { name: "Takay", city: "Miami" },
    address: "2296 Coral Wy, Miami, FL 33145", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DaTnCh1xKef/", creator: "iviethefoodie", reach: 9493, /* postedAt: "2026-07-02" */ }] },
  { key: "buccan-sandwich-shop-coral-gables", placeId: "ChIJjexh77G32YgRjlfjbczZVVQ",
    match: { name: "Buccan Sandwich Shop", city: "Coral Gables" },
    address: "100 Miracle Mile, Coral Gables, FL 33134", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYII53NRSZr/", creator: "iviethefoodie", reach: 893, /* postedAt: "2026-05-09" */ }] },
  { key: "honey-veil-south-miami", placeId: "ChIJ5UFpka3H2YgRtMJVgnk4JwE",
    match: { name: "Honey Veil", city: "South Miami" }, displayName: "Honey Veil South Miami",
    address: "5748 Sunset Dr, South Miami, FL 33143", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXxPLfYxNiI/", creator: "iviethefoodie", reach: 3393, /* postedAt: "2026-04-30" */ }] },
  { key: "popup-bagels-aventura", placeId: "ChIJ3Xp9YOGt2YgRIQUPDTGnNmE",
    match: { name: "PopUp Bagels", city: "Aventura" },
    address: "2958 NE 199th St, Aventura, FL 33180", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXhccyXESl9/", creator: "iviethefoodie", reach: 3654, /* postedAt: "2026-04-24" */ }] },
  { key: "hausmash-weston", placeId: "ChIJfUZrOACn2YgR--4cIuDDuzQ",
    match: { name: "Hausmash", city: "Weston" },
    address: "4571 Weston Rd, Weston, FL 33331", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWmoGZ1ETgV/", creator: "iviethefoodie", reach: 4336, /* postedAt: "2026-04-01" */ }] },
  { key: "venetian-pool-coral-gables", placeId: "ChIJO2jhb4m32YgRvulhfY9IMx0",
    match: { name: "Venetian Pool", city: "Coral Gables" },
    address: "2701 De Soto Blvd, Coral Gables, FL 33134", category: "Activities",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWcIa6VkZkC/", creator: "iviethefoodie", /* postedAt: "2026-03-28" */ }] },
  { key: "taco-mexico-homestead", placeId: "ChIJmV2XCADd2YgRde64fCaxsmc",
    match: { name: "Taco Mexico", city: "Homestead" }, note: "Her caption is explicit that this place has no Instagram and no website, 'just an address'. Google does list it, which is the only reason it could be entered at all.",
    address: "28755 SW 142nd Ct, Homestead, FL 33033", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWOySAbkZr1/", creator: "iviethefoodie", /* postedAt: "2026-03-23" */ }] },
  { key: "maass-fort-lauderdale", placeId: "ChIJF6pqghMB2YgRl7OIepJ4H0s",
    match: { name: "MAASS", city: "Fort Lauderdale" }, displayName: "MAASS Restaurant at the Four Seasons",
    address: "525 N Fort Lauderdale Beach Blvd, Fort Lauderdale, FL 33304", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWFGLzpEdoH/", creator: "iviethefoodie", reach: 2618, /* postedAt: "2026-03-19" */ }] },
  { key: "karyu-miami", placeId: "ChIJWx-tm-Sx2YgR-WmuniqfB_g",
    match: { name: "Karyu", city: "Miami" },
    address: "40 NE 41st St, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWAKVRSkfTr/", creator: "iviethefoodie", reach: 5295, /* postedAt: "2026-03-17" */ }] },
  { key: "daniels-steakhouse-fort-lauderdale", placeId: "ChIJN6KbW5kB2YgRADEpRSHNiU8",
    match: { name: "Daniel's", city: "Fort Lauderdale" }, displayName: "Daniel's, A Florida Steakhouse",
    address: "620 S Federal Hwy, Fort Lauderdale, FL 33301", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVwpmK1lDY1/", creator: "iviethefoodie", reach: 1936, /* postedAt: "2026-03-11" */ }] },
  { key: "drinking-pig-bbq-coconut-grove", placeId: "ChIJ21LFT4a32YgRyb1IpODQgs4",
    match: { name: "Drinking Pig BBQ", city: "Miami" },
    address: "3444 Main Hwy #16, Miami, FL 33133", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVmKbrPkQNh/", creator: "iviethefoodie", reach: 3661, /* postedAt: "2026-03-07" */ }] },
  { key: "sanguich-little-havana-miami", placeId: "ChIJhw4bDvq22YgRt1rD2Am4AxY",
    match: { name: "Sanguich", city: "Miami" },
    address: "2057 SW 8th St, Miami, FL 33135", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVgdZj0Ea12/", creator: "iviethefoodie", reach: 2570, /* postedAt: "2026-03-05" */ }] },
  { key: "over-under-downtown-miami", placeId: "ChIJzwEW8bK32YgRoeQcKaBkwrs",
    match: { name: "Over Under", city: "Miami" }, note: "Same shape as Merrick Park: Flagler St Bakery pops up here on Sunday mornings and has no address of its own. The bar is the destination.",
    address: "151 E Flagler St, Miami, FL 33131", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVbrkgVEfza/", creator: "iviethefoodie", reach: 1207, /* postedAt: "2026-03-03" */ }] },
  { key: "cry-baby-creamery-palmetto-bay", placeId: "ChIJzSTGD_rF2YgRur0EKGn_Gsg",
    match: { name: "Cry Baby Creamery", city: "Palmetto Bay" }, note: "Three locations in the caption (Palmetto Bay, West Kendall, South Kendall); the placeId pins the original.",
    address: "17389 S Dixie Hwy, Palmetto Bay, FL 33157", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVRIOXbkQ0n/", creator: "iviethefoodie", reach: 4004, /* postedAt: "2026-02-27" */ }] },
  { key: "edan-bistro-north-miami", placeId: "ChIJPy3IMAKy2YgRfP0FgOWAG2U",
    match: { name: "Edan Bistro", city: "North Miami" },
    address: "650 NE 125th St, North Miami, FL 33161", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVMsPgrEcMr/", creator: "iviethefoodie", reach: 6005, /* postedAt: "2026-02-25" */ }] },
  { key: "humo-bodegon-north-miami-beach", placeId: "ChIJd24p_Wut2YgREj-DrhuLKEU",
    match: { name: "Humo Bodegon", city: "North Miami Beach" },
    address: "2261 NE 164th St, North Miami Beach, FL 33160", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DWzZQwWkWk_/", creator: "iviethefoodie", /* postedAt: "2026-04-06" */ }] },
  { key: "voodoo-doughnut-wynwood-miami", placeId: "ChIJy1mepf-32YgRbyBzPI647n4",
    match: { name: "Voodoo Doughnut", city: "Miami" },
    address: "2401 NW 2nd Ave, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DVBnnX6kVGf/", creator: "iviethefoodie", reach: 2069, /* postedAt: "2026-02-21" */ }] },
  { key: "skinny-louie-south-miami", placeId: "ChIJfR41HgDH2YgRPJvOcefxI0c",
    match: { name: "Skinny Louie", city: "South Miami" },
    address: "6022 S Dixie Hwy Unit D, South Miami, FL 33143", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DU3riuJkeXW/", creator: "iviethefoodie", reach: 3793, /* postedAt: "2026-02-17" */ }] },
  { key: "delicious-by-carlotta-gelati-weston", placeId: "ChIJ3zmyGIsJ2YgRVTBoYAuLo8c",
    match: { name: "Delicious by Carlotta Gelati", city: "Weston" },
    address: "143 Weston Rd, Weston, FL 33326", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUrIFR6kR7p/", creator: "iviethefoodie", reach: 2932, /* postedAt: "2026-02-12" */ }] },
  { key: "my-cousin-nick-coral-gables", placeId: "ChIJ5927yBu32YgRhW6nCcO80-g",
    match: { name: "My Cousin Nick", city: "Coral Gables" },
    address: "2207 Ponce de Leon Blvd, Coral Gables, FL 33134", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DURfaSREWrN/", creator: "iviethefoodie", reach: 2182, /* postedAt: "2026-02-02" */ }] },
  { key: "wunderbar-davie", placeId: "ChIJr6p-2SKn2YgRq7wT9LkBsvk",
    match: { name: "Wunderbar", city: "Davie" }, displayName: "Wunderbar German Kitchen & Biergarten",
    address: "4995 Volunteer Rd, Davie, FL 33330", category: "Night out",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUHE9EekeBo/", creator: "iviethefoodie", reach: 5215, /* postedAt: "2026-01-29" */ }] },
  { key: "myka-brickell-miami", placeId: "ChIJIf5xTgC32YgRChhM8pC28cU",
    match: { name: "MYKA", city: "Miami" }, displayName: "MYKA Greek Frozen Yogurt", note: "3.6 stars — below the 4.2 creator floor, so it is added with NO rank boost, per the 2026-08-06 precedent. The creator's find is still credited and linked.",
    address: "777 Brickell Ave, Miami, FL 33131", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUBzT5rkT5p/", creator: "iviethefoodie", reach: 4117, /* postedAt: "2026-01-27" */ }] },
  { key: "francesco-martucci-wynwood-miami", placeId: "ChIJM5vU2qS32YgReejUakiPOQ4",
    match: { name: "Francesco Martucci", city: "Miami" },
    address: "10 NE 27th St, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DT_jCn2EY2_/", creator: "iviethefoodie", reach: 1356, /* postedAt: "2026-01-26" */ }] },
  { key: "hate-mondays-tavern-miami", placeId: "ChIJY47wgm7B2YgR4eWL-Iy4bn8",
    match: { name: "Hate Mondays Tavern", city: "Miami" },
    address: "12461 SW 130th St A2 A3, Miami, FL 33186", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTye9RLEf3f/", creator: "iviethefoodie", reach: 5227, /* postedAt: "2026-01-21" */ }] },
  { key: "ghee-wynwood-miami", placeId: "ChIJyZpQsa222YgRTVzO326qSV8",
    match: { name: "Ghee", city: "Miami" }, displayName: "Ghee Indian Kitchen", note: "Ghee has more than one South Florida location; the placeId pins this to the Wynwood room.",
    address: "63 NW 24th St, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTv5xrVkcKG/", creator: "iviethefoodie", reach: 2405, /* postedAt: "2026-01-20" */ }] },
  { key: "charlies-ice-cream-westchester-miami", placeId: "ChIJA0WpTAG52YgRI9H50ZhfmqE",
    match: { name: "Charlie's Ice Cream", city: "Miami" },
    address: "2475 SW 97th Ave, Miami, FL 33165", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTbh7fhkRFF/", creator: "iviethefoodie", reach: 4506, /* postedAt: "2026-01-12" */ }] },
  { key: "boia-de-little-haiti-miami", placeId: "ChIJte0b2xux2YgRr8f-xaLb0jw",
    match: { name: "Boia De", city: "Miami" },
    address: "5205 NE 2nd Ave, Miami, FL 33137", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DTOfZ9VkeBH/", creator: "iviethefoodie", reach: 6878, /* postedAt: "2026-01-07" */ }] },
  { key: "go-greek-yogurt-coconut-grove", placeId: "ChIJy7ck47K32YgRdj5lpfRK5uU",
    match: { name: "Go Greek Yogurt", city: "Miami" },
    address: "3000 Florida Ave Ste 114, Miami, FL 33133", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DYTB3FHR3_w/", creator: "iviethefoodie", reach: 3803, /* postedAt: "2026-05-13" */ }] },
  { key: "yauca-wynwood-miami", placeId: "ChIJ6XVQENW32YgRTWc7CXMsAjo",
    match: { name: "Yauca", city: "Miami" },
    address: "555 NW 29th St, Miami, FL 33127", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DXuVo3KkTwR/", creator: "iviethefoodie", reach: 1028, /* postedAt: "2026-04-29" */ }] },
  { key: "butcher-shop-deli-palmetto-bay", placeId: "ChIJk5Z6oJDG2YgRyAWZS8mqhNM",
    match: { name: "The Butcher Shop", city: "Palmetto Bay" },
    address: "14235 S Dixie Hwy, Palmetto Bay, FL 33176", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUjZuW_EQuZ/", creator: "iviethefoodie", reach: 1668, /* postedAt: "2026-02-09" */ }] },
  { key: "papo-llega-y-pon-miami", placeId: "ChIJXRQFsCS32YgR7FGFBSuy-p4",
    match: { name: "Papo Llega Y Pon", city: "Miami" },
    address: "2928 NW 17th Ave, Miami, FL 33142", category: "Food",
    videos: [{ platform: "instagram", url: "https://www.instagram.com/p/DUjZuW_EQuZ/", creator: "iviethefoodie", reach: 1668, /* postedAt: "2026-02-09" */ }] },
];


function cityMatches(place, locName, city) {
  if (!city) return true;
  const hay = norm([place && place.city, place && place.address, locName].filter(Boolean).join(" "));
  return hay.includes(norm(city));
}

// RENDER SAFETY (v5.98): only videos with a real, non-empty url are ever
// returned, so an entry mid-curation (a) never renders a broken link-out to ""
// and (b) never counts as "has a video" for the ranking boost — an
// invisible-video boost would break the "no paid placement, ranked on real
// reviews" promise.
//
// v8.43 — THE STAGED ENTRIES THEMSELVES HAVE MOVED OUT, to
// lib/creatorVideosStaged.js. This file is CLIENT-BUNDLED, and 23 entries that
// this very function guarantees can never render were shipping ~18KB of
// unreachable data to every visitor. The deploy gate (scripts/check-bundle.mjs)
// is what surfaced it when a 93-place batch pushed the route past its budget,
// and the honest fix was to stop shipping data nothing can read rather than to
// raise a ratchet that exists to be lowered.
//
// So the old promise here — "a staged entry auto-appears the moment its url is
// filled, no other code change needed" — is retired ON PURPOSE. A curator now
// fills the url in the staged file and MOVES the entry here, which makes
// activating a place an explicit, reviewable edit instead of a silent
// one-character change that flips a venue into the live ranking. That matters
// more since v8.42: a second creator on a place now moves it up the list and
// puts a badge on it.
function renderable(videos) {
  return (videos || []).filter((v) => v && typeof v.url === "string" && v.url.trim().length > 0);
}

// v8.42 — THE RESOLVER INDEX, built once at module load instead of rebuilt on
// every call.
//
// MEASURED, not guessed: creatorVideosFor() was running norm() over all ~220
// curated names on every single lookup, so a lookup that MISSES — which is most
// of them, since most places are not curated — cost 28.6µs. lib/lawfulOrder.js
// calls it once per row (twice, since v8.42 added the corroboration read), so a
// 120-row ranked list was spending ~7ms inside this file before anything was
// drawn. That is the "O(n) registry walk turns a list into a jank frame" hazard
// lawfulOrder's own header warns about, and it was already real.
//
// CURATED is a module-level literal that nothing mutates, so this index can
// never go stale — which is precisely why this is an index and not a result
// cache keyed on untrusted place fields. Same two passes, same tiebreak, same
// answers; the only thing that changed is that the normalisation happens once.
// A placeId collision would be a curation bug (two entries claiming one venue),
// so the first entry wins exactly as the old linear scan's `return` did.
const BY_PLACE_ID = new Map();
const BY_NAME = [];
for (const e of CURATED) {
  if (e.placeId && !BY_PLACE_ID.has(String(e.placeId))) BY_PLACE_ID.set(String(e.placeId), e);
  if (e.match && e.match.name) {
    const cnm = norm(e.match.name);
    if (cnm) BY_NAME.push({ e, cnm, len: cnm.length });
  }
  // v8.43 — stamp each video with its ENTRY key, once, here.
  //
  // lib/creatorCaptions.js keys on "<entry key>|<url>" because the url alone is
  // not unique: a round-up post recommends several venues, so one Instagram URL
  // legitimately carries a different caption per venue (the four Venezuelan
  // hot-dog stands). A video object handed to a sheet has no idea which entry it
  // came from, so it is told here — derived from data the file already holds, so
  // it costs the bundle nothing, and done at load rather than in renderable(),
  // which runs on every ranked row.
  for (const v of e.videos || []) if (v && typeof v === "object") v.k = e.key;
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
    const hit = BY_PLACE_ID.get(pid);
    if (hit) return renderable(hit.videos);
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
  for (const idx of BY_NAME) {
    const at = nm.indexOf(idx.cnm);
    if (at < 0) continue;
    const score = (at === 0 ? 1000 : 0) + idx.len;
    if (score <= bestScore) continue;
    if (!cityMatches(place, locName, idx.e.match.city)) continue;
    best = idx.e;
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
  // v8.42 — the @cailincoastal batch. Same rule as every row above: real
  // published city-center coordinates, used ONLY to sort "browse by location"
  // nearest-first. Never shown, and never presented as a venue's own position.
  // "South Pasadena" is the Starlite yacht's and Dolphin Racer's own municipal
  // city per Google, not the "St. Pete" the captions say — the address is the
  // fact, and a caption's shorthand is not a reason to file it under a city it
  // is not in.
  Oldsmar: { lat: 28.0339, lng: -82.6651 },
  "Pinellas Park": { lat: 27.8428, lng: -82.6995 },
  Seminole: { lat: 27.8397, lng: -82.7912 },
  Brandon: { lat: 27.9378, lng: -82.2859 },
  "South Pasadena": { lat: 27.7539, lng: -82.7370 },
  // v8.43 — the @gabrielaromero11 Miami batch. Same rule again: real published
  // city-center coordinates, used ONLY to sort "browse by location"
  // nearest-first, never shown and never presented as a venue's own position.
  // Several of these are the venue's own municipality rather than the "Miami"
  // her captions say — Medley, Doral and Southwest Ranches are separate towns,
  // and the ADDRESS is the fact.
  Medley: { lat: 25.8376, lng: -80.3345 },
  "Coral Gables": { lat: 25.7215, lng: -80.2684 },
  "Southwest Ranches": { lat: 26.0592, lng: -80.4083 },
  "Sunny Isles Beach": { lat: 25.9498, lng: -80.1223 },
  "Hallandale Beach": { lat: 25.9812, lng: -80.1484 },
  Davie: { lat: 26.0765, lng: -80.2521 },
  Englewood: { lat: 26.9620, lng: -82.3529 },
  // v8.44 — the @eatsbylaurr batch. Only one town she covers was missing:
  // Tierra Verde is its own island community on the Pinellas Bayway, not
  // "St. Pete", which is what her caption calls it. The address is the fact.
  "Tierra Verde": { lat: 27.6931, lng: -82.7248 },
  // v8.45 — the @iviethefoodie batch. Same rule: real published city-center
  // coordinates, sort-only, never shown.
  "South Miami": { lat: 25.7079, lng: -80.2939 },
  Aventura: { lat: 25.9565, lng: -80.1392 },
  "Palmetto Bay": { lat: 25.6220, lng: -80.3239 },
  "North Miami Beach": { lat: 25.9331, lng: -80.1625 },
  Weston: { lat: 26.1004, lng: -80.3998 },
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
    byCity.get(city).push({
      key: e.key,
      name: e.displayName || e.match.name,
      city,
      placeId: e.placeId || null,
      // v8.33 — `e.match.address` was ALWAYS undefined: every entry in CURATED
      // carries `address`/`category` at the ENTRY root, never inside `match`.
      // So the browse sheet has been rendering address:null for every row since
      // v6.94 while the real address sat one level up. The match-level read is
      // kept first in case an entry ever puts it there; the entry root is the
      // fallback that actually fires.
      address: e.match.address || e.address || null,
      category: e.match.category || e.category || null,
      video: vids[0],
    });
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

// v8.33 — the FEATURED creator: the one whose own shelf the homepage carries,
// with her own artwork on the tile (public/cards-v8/cindy-*). Named here rather
// than typed into lib/rails.js, lib/railSelect.js and the creator page copy
// separately, so a future swap is one edit and cannot leave a rail pointing at
// a handle the copy no longer names.
export const FEATURED_CREATOR = "cindy.selects";

/**
 * Does this place carry a renderable video by ONE specific creator?
 * The same resolver every other surface uses (placeId first, then name+city),
 * narrowed to a handle — so a creator-specific rail can never pick up a place
 * a DIFFERENT creator filmed, which is the whole failure mode of a rail whose
 * tile carries one person's face.
 */
export function hasVideoByCreator(place, handle, locName) {
  const want = norm(handle);
  if (!want) return false;
  try {
    return creatorVideosFor(place, locName).some((v) => v && v.creator && norm(v.creator) === want);
  } catch (e) {
    return false;
  }
}

/**
 * v8.42 — HOW MANY DISTINCT CREATORS filmed this place (owner, 2026-08-23:
 * "if a place has multiple influencers then make sure to make it rank higher
 * and add a trending badge on it").
 *
 * DISTINCT is the whole point, and it is why this is a Set of handles and not
 * `creatorVideosFor(p).length`. One creator posting the same venue three times
 * is a person with a favourite; three creators finding it separately is a place
 * the town has noticed. Only the second is evidence, and only the second may
 * move a ranking — a video count would have let any single creator mint a
 * "trending" badge by posting twice.
 *
 * Unattributed videos (a Facebook share URL with no handle, e.g. the Mai-Kai
 * entry) count for NOTHING here rather than as an anonymous extra creator:
 * corroboration is a claim about independent people, and we cannot make that
 * claim about a post whose author we do not know.
 *
 * Pure, client-safe, and synchronous — which is what lets lib/trendSignal.js
 * read it on surfaces that never touch the network.
 */
export function creatorCountFor(place, locName) {
  try {
    const seen = new Set();
    for (const v of creatorVideosFor(place, locName)) {
      if (v && v.creator) seen.add(norm(v.creator));
    }
    return seen.size;
  } catch (e) {
    return 0;
  }
}

// v8.33 — the bar a creator clears to get their own indexable /creators/<handle>
// page (lib/creatorPages.js). It lives HERE, in the client-safe module, rather
// than only in creatorPages.js, because the CLIENT surfaces that link to those
// pages (sheets/SocialFind.js) must ask the same question without importing the
// server-only page module. One constant, two readers, no drift.
export const CREATOR_PAGE_MIN_SPOTS = 3;

/** Does this creator have an indexable page to link to? */
export function hasCreatorPage(handle) {
  const h = norm(handle);
  if (!h || !/^[A-Za-z0-9._-]{1,40}$/.test(String(handle || ""))) return false;
  const { creators } = allCreators();
  const row = creators.find((c) => norm(c.handle) === h);
  return !!row && row.count >= CREATOR_PAGE_MIN_SPOTS;
}

export function allCreators() {
  const byHandle = new Map();
  const unattributed = [];
  for (const e of CURATED) {
    for (const v of renderable(e.videos)) {
      // v8.33 — placeId/address/category ride along so the indexable creator
      // pages (lib/creatorPages.js) can render a real address and a real deep
      // link without re-walking CURATED with a second, drift-prone reader.
      const spot = { key: e.key, name: e.displayName || (e.match && e.match.name) || e.key, city: (e.match && e.match.city) || "", platform: v.platform, video: v, placeId: e.placeId || null, address: e.address || null, category: e.category || null };
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
