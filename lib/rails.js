// lib/rails.js — the 15 daypart rails.
//
// A rail is a CURATION, not a category. lib/categories.js CATEGORY_TILES holds
// the six browse categories (Food, Night out, Activities, Family, Stays,
// Shopping) that the top tabs render; those answer "what kind of place". A rail
// answers "why would I open this right now" — and each one owns exactly ONE
// axis that no other rail claims. If two rails could carry the same axis, one
// of them should not exist.
//
// METADATA ONLY. This module is imported by the CLIENT rail component, so
// anything it imports ships to the browser — which is why HOW a rail selects
// its places lives in lib/railSelect.js (server-only; it needs the seasons,
// creator-video, ranking and price modules). `list: true` says a rail shows
// ranked places; `guides: true` says it opens the guides library instead.
// Nothing anywhere invents a place — every card that ships comes out of the
// same engine the landing pages use.
//
// `art` is the basename in /public/cards-v8 (AVIF/WebP/JPEG at 380w and 760w).
// `regional` swaps art by region; see lib/dayparts.js regionFor().

export const RAILS = [
// v8.6 — `axis` IS AN INTERNAL FIELD. It is a note to whoever edits a
// selector, written as a sentence fragment ("demand — what people are
// searching", "source — a real person went and posted it"), and it was being
// interpolated straight into user-facing copy. Live on the homepage:
//   "Nothing near Sarasota clears this bar right now — demand — what people
//    are searching."
// Every rail now carries `emptyWhy`, a real clause that finishes the sentence
// it is dropped into. `axis` stays for the selector comments — it just never
// reaches a reader again.
  { id: "season", title: "Summer Picks", axis: "expires — only available this season",
    emptyWhy: "nothing nearby is genuinely ending this season",
    short: "Gone when summer goes", sub: "Back next year, not sooner",
    cta: "See what ends soon", art: "season", href: "/seasonal", list: true },

  { id: "today", title: "What Should We Do Today?", axis: "the whole day — a sequence, not one place",
    emptyWhy: "we could not build a full day near you yet",
    short: "Not one place. A whole day.", sub: "A plan in order, built around now",
    cta: "Plan our day", art: "today", href: "/things-to-do", list: true },

  // v8.6 — RENAMED, because the signal changed and the old name would now be a
  // lie. Owner's option (b), taken deliberately after (a) was ruled out by
  // measurement.
  //
  // WHY NOT (a). sourcesFor() was routing food and nightlife to three sources
  // that have never written a row while denying them wikipedia — fixed in this
  // same PR — but that only changes what the CRON WRITES GOING FORWARD. It
  // cannot retroactively populate the 164 wikipedia-only rows already in
  // wf_place_popularity, so Sarasota still measured 0 after the fix and there
  // was no honest way to claim the rail now fills.
  //
  // WHY (b) AND NOT (c). Every place already carries `reviews` — Google's
  // userRatingCount, which we already pay for, at 100% coverage. It is a real
  // demand signal. What it is NOT is a SPIKE: it measures how many people have
  // been, cumulatively, not how many are arriving this week. "Exploding
  // Trends" / "Everyone's searching this" / "See what's spiking" all claim
  // velocity this signal cannot support, and that claim is the single most
  // falsifiable thing on the page.
  //
  // So the rail keeps its slot and tells the truth instead. The real spike
  // signal (trendSignal.js, TREND_THRESHOLD) is untouched and still powers the
  // 🔥 disclosure on individual cards — it just no longer has a rail whose
  // headline over-promises it.
  // artStale (2026-08-16): the tile art still reads "EXPLODING TRENDS NEAR YOU
  // / Everyone's searching this. You should too." in baked type. The headline
  // on these tiles is PIXELS — see the note in DaypartRail.js: "Every card's
  // headline, sub and CTA are IN the artwork — the owner drew them there." So
  // renaming this rail in code did not change one word the reader sees, and
  // the tile kept making the spike claim the rename exists to retract.
  //
  // Until public/cards-v8/trending-*.{avif,webp,jpg} is redrawn, this rail
  // renders NO TILE. The rail itself is untouched: /trending still works and
  // every other surface still lists it. A missing tile costs one entry point;
  // a stale tile ships an unfalsifiable claim on the homepage, and that trade
  // is not close. Delete this flag the same day the new art lands, and
  // scripts/check-rail-art-matches-copy.mjs will make you pin the pair.
  // v8.7 — AXIS CHANGED BACK TO A LIVE SIGNAL (owner, 2026-08-18, on a
  // screenshot of this rail full of Siesta Beach and the Ringling: "it is not
  // working"). Volume read as a leaderboard of the famous. The rail now blends
  // the two signals the data genuinely carries — the TREND_THRESHOLD spike
  // flag and a real creator video (lib/railSelect.js) — so "talked about"
  // means being talked about NOW, and the claim is falsifiable per place.
  // artStale still applies: the tile art still reads "EXPLODING TRENDS NEAR
  // YOU / Everyone's searching this." in baked type until it is redrawn.
  // v8.17 (owner, 2026-08-19: "you also removed the top 20 trends amazon rail
  // card and the place cards along with it"). artStale is DROPPED and the
  // TILE IS BACK. The v8.6 hide was honest at the time — the art's baked
  // "EXPLODING TRENDS" claim had no live signal behind it. It does now:
  // v8.12 put the owner's 20 curated trends at the top of this drop, each
  // matched to verified local places, over the real spike flag and creator
  // signal. The rail's name returns to what the owner drew on the tile, so
  // the pixels and the code finally say the same thing — pinned in
  // check-rail-art-matches-copy.mjs.
  // v8.93.1 (owner, 2026-08-30, with the poster): the tile's baked type now
  // reads "TRENDING NEAR YOU / What people are searching and experiencing right
  // now." The copy below IS those words — the reader sees the image and never
  // this file, the rule the events and tonight tiles already follow. The old
  // sub ("The 20 trends taking over") also stated a COUNT the rail does not
  // promise: lib/trendTaxonomy holds however many are live and verified near
  // you, which on a quiet night is fewer than twenty.
  { id: "trending", title: "Exploding Trends Near You", axis: "signal — the owner's curated trends, creator posts, and genuine demand surges",
    emptyWhy: "no trend, creator post or demand surge is live near you yet",
    short: "Trending near you", sub: "What people are searching and experiencing right now",
    cta: "See what's exploding", art: "trending", href: "/trending", list: true },

  { id: "best", title: "The Best Around You", axis: "score — highest Wayfind Score, any category",
    emptyWhy: "we do not have enough scored places near you yet",
    short: "The highest score near you", sub: "Any category. No paid placement.",
    cta: "See the top scores", art: "best", href: "/best-of", list: true },

  { id: "eat", title: "Actually Worth Eating", axis: "the meal — food quality above all",
    emptyWhy: "nothing nearby clears the bar for a meal worth the trip",
    short: "Skip the bad meal", sub: "Ranked on the food, not the noise",
    cta: "Show me what's good", art: "eat", href: "/restaurants", list: true },

  { id: "beach", title: "Beach Day", axis: "the water",
    emptyWhy: "no beach near you clears the bar today",
    short: "The beach, decided", sub: "Tide, parking, and the good stretch",
    cta: "Find my beach", art: "beach", href: "/best-beaches", list: true },

  { id: "family", title: "Family Day, Decided", axis: "kids in tow",
    emptyWhy: "nothing nearby is a genuinely good day with kids",
    short: "Nobody melts down at 3pm", sub: "Kid-approved, pet-friendly, shade checked",
    cta: "Plan the day", art: "family", href: "/family",
    regional: { orlando: "family-orlando", fl: "family-fl" }, list: true },

  { id: "locals", title: "Locals Know", axis: "source — a real person went and posted it",
    emptyWhy: "no creator has posted about a place near you yet",
    short: "Someone actually went", sub: "Creators who posted it, near you",
    cta: "See what they found", art: "locals", href: "/things-to-do", list: true },

  // v8.33 (owner, 2026-08-22, handing over his own poster: "i have the [rail]
  // card for cindy which will have all of her videos for the place cards that
  // she reviewed"). ONE creator's own shelf, and the only rail on the page whose
  // axis is a PERSON.
  //
  // It does not duplicate `locals`. That rail's axis is "a real person went and
  // posted it" — any creator, any category, whoever is nearest. This one is a
  // named creator's body of work, with her own artwork on the tile and her own
  // indexable page behind the CTA. A reader who liked one of her finds wants the
  // rest of hers, not the next stranger's.
  //
  // THE COPY IS THE ARTWORK'S OWN COPY, deliberately. The tile she supplied
  // reads "Your next COFFEE SPOT? / WE ALREADY FOUND THE GOOD ONES. / FIND YOUR
  // CAFE", so the rail says that too — check-rail-art-matches-copy exists
  // because a tile whose baked type argues with its rail is a claim no source
  // guard can read. And because the tile promises coffee, the selector's
  // identity gate is isBreakfastPlace, not merely "she filmed it": her one
  // non-café spot (an indoor sensory playroom) is real, is on her creator page,
  // and has no business under a café headline.
  { id: "cindy", title: "Your Next Coffee Spot", axis: "one named creator — every café @cindy.selects filmed herself",
    emptyWhy: "she has not filmed a café near you yet",
    short: "We already found the good ones", sub: "Every café @cindy.selects filmed",
    cta: "Find your café", art: "cindy", href: "/creators/cindy.selects", list: true },

  { id: "gems", title: "Places You'd Never Find", axis: "obscurity — excellent but under-reviewed",
    emptyWhy: "nothing nearby is both excellent and genuinely under-reviewed",
    short: "Great, and nobody found it", sub: "Over 4.6, under 600 reviews",
    cta: "Show me the gems", art: "gems", href: "/hidden-gems", list: true },

  { id: "drive", title: "Worth the Drive", axis: "distance — worth leaving town for",
    emptyWhy: "nothing within driving distance earns the trip today",
    short: "45 minutes, worth it", sub: "The ones that earn the tank",
    cta: "Show me what's worth it", art: "drive", href: "/worth-the-drive", list: true },

  // v8.90 — THE COPY NOW MATCHES BOTH THE POSTER AND THE POOL.
  //
  // The owner's new tile art says "Concerts, live music, comedy & events
  // actually worth going out for tonight — ranked for right now", and the sub
  // said "Hours verified for tonight".
  //
  // That sub was a claim this product cannot back: opening hours are present on
  // 1.4% of rail rows, so for 98.6% of the cards under it nothing was verified.
  // It is also no longer what the rail SERVES — v8.83 gave `tonight` the comedy
  // clubs, theatres and music rooms it had never been offered (lib/showVenue.js),
  // on the owner's "why are we not offering comedy club". The tile was still
  // advertising a bar rail with checked hours.
  //
  // So the axis follows the pool: a room that puts on a night, ranked for the
  // hour you are reading it. `servableNow` (v8.82) is what keeps "right now"
  // honest — evidence where we have it, the daylight inference where we do not,
  // and unknown is served rather than invented.
  { id: "tonight", title: "Tonight's Move", axis: "the night out — shows, music and rooms that are open for it",
    emptyWhy: "nothing near you is still open and worth going to tonight",
    short: "Ranked for right now", sub: "Concerts, live music, comedy & events",
    cta: "Show me tonight", art: "tonight", href: "/tonight", list: true },

  // v8.93 (owner, 2026-08-30, with the poster): the tile's baked type now reads
  // "DATE NIGHT / An unforgettable night. Already planned." The words below
  // ARE those words, because the reader sees the image and never this file —
  // the same rule the events and tonight tiles follow. The old sub ("The room
  // matters as much as the food") described a poster that no longer exists.
  { id: "datenight", title: "Date Night", axis: "the room — atmosphere for two",
    emptyWhy: "nothing nearby has the room for it tonight",
    short: "Already planned", sub: "An unforgettable night, ranked for two",
    cta: "Book date night", art: "datenight", href: "/date-night", list: true },

  // v8.29.16 — THE OWNER'S OWN TILE, and the copy moved to meet it. The art he
  // supplied reads, in baked type: "WHAT'S HAPPENING NEAR YOU? / We already
  // picked the good stuff. / CONCERTS. FESTIVALS. SHOWS. POP-UPS. / The best
  // things happening near you — ranked by Wayfind. / SEE WHAT'S ON". The words
  // below are those words, because the reader sees the image, not this file —
  // scripts/check-rail-art-matches-copy.mjs is what keeps the two together.
  //
  // THE AXIS WIDENED, DELIBERATELY. It was "ticketed and dated — it sells out",
  // which the curated schedule now wired into this surface makes false: St.
  // Augustine's Nights of Lights and both Gasparillas are FREE, and a pop-up
  // sells nothing at all. The thing every card here really shares is the DATE —
  // it happens, then it is gone — and that still collides with no other rail
  // (tonight owns hours, datenight owns the room, best owns score).
  //
  // "ranked by Wayfind" on the art is a true claim and not a Score claim: these
  // rows are ranked (lib/frontEvents.js eventStature — curation, category,
  // imminence), and test-event-rail-images still forbids an event ever wearing
  // a Wayfind Score. The two do not conflict.
  { id: "events", title: "What's Happening Near You", axis: "the date — it happens once, then it is gone",
    emptyWhy: "nothing dated is coming up near you",
    short: "We already picked the good stuff", sub: "Concerts, festivals, shows and pop-ups",
    cta: "See what's on", art: "events", href: "/events", list: true },

  { id: "break", title: "The 30-Minute Break", axis: "time budget — must fit in 30 minutes",
    emptyWhy: "nothing nearby fits a thirty-minute break",
    short: "Back at your desk in 30", sub: "Counter-serve, wait times checked",
    cta: "Lunch picks near you", art: "break", href: "/restaurants", list: true },

  // v8.15 — the morning meal, from the reader's exact pinpoint (owner,
  // 2026-08-18: "the best breakfast places near the user … the exact pinpoint
  // from the maps function"). Axis is the MEAL + the morning radius —
  // lib/breakfast.js owns the identity, BREAKFAST_NEAR_MI owns the distance —
  // which no other rail claims: `eat` is any meal at any dinner distance,
  // `break` is a time budget. Tile art: owner's "BEST BREAKFAST PICKS." design.
  { id: "breakfast", title: "Best Breakfast Picks", axis: "the morning meal — breakfast identity, walk-or-short-drive radius",
    emptyWhy: "nothing near you is a genuinely good breakfast this morning",
    short: "Worth waking up for", sub: "Handpicked and local, near you now",
    cta: "See breakfast picks", art: "breakfast", href: "/restaurants", list: true },

  // v8.15 — the owner's researched birthday-experience guide (owner,
  // 2026-08-18: "best place to go on your birthday"). Axis is the OCCASION —
  // celebratory dining / group energy / entertainment, not a category, so
  // it cannot collide with datenight (the room) or events (dated tickets).
  // v8.26 — the curated registry is a SEED, not the universe. The rail
  // ranks nearby inventory (lib/birthdayPlace.js); "near you" is the
  // visitor's point at BIRTHDAY_NEAR_MI, never a 45-mile Tampa-Bay list.
  // Tile art: owner's "BIRTHDAY PLANS, SOLVED." design.
  { id: "birthday", title: "Birthday Plans, Solved", axis: "the occasion — birthday-worthy experiences near you",
    emptyWhy: "no birthday-worthy pick is close enough to you yet",
    short: "Make it worth remembering", sub: "Curated birthday picks near you",
    cta: "Plan the birthday", art: "birthday", href: "/things-to-do", list: true },

  // The only rail whose payoff is reading rather than a ranked list. It opens
  // the guides library instead of place cards, so it carries no `list`.
  { id: "blog", title: "Local Guides", axis: "the writing — why a place is worth it, not just where",
    emptyWhy: "we have not written a guide for your area yet",
    short: "Written by someone who went", sub: "The catch, the parking, the hour",
    cta: "Read the guides", art: "blog", href: "/guides", guides: true },

  // v8.66 (owner, 2026-08-26, with his own posters: "it needs its own amazon
  // rail card — image 3 is for the top 7 and image 4 is for the fall festive
  // and place and everything fall"). Both tiles are byte-derived from his
  // 941x1672 PNGs via scripts/make-rail-art.mjs — zero redraw. NO href on
  // either: the tile is a button (never a navigation) — chef opens the Ron
  // Duprat sheet in place, augtober opens the AUGTOBER fall surface in place
  // (DaypartRail hands both up to home.js, the sponsor/events pattern).
  // NEW filenames, so no RAIL_ART_V bump: nothing cached can be stale.
  { id: "chef", title: "Chef Ron Duprat's Top 7", axis: "testimony — a Top Chef's own list, in his order",
    emptyWhy: "Ron's list is unavailable right now",
    short: "Curated by a Top Chef", sub: "7 restaurants a Top Chef says are worth the trip",
    cta: "See Ron's Top 7", art: "chef", drop: true },

  { id: "augtober", title: "Augtober Events Near You", axis: "the season — fall and Halloween, while it lasts",
    emptyWhy: "no fall events are live near you yet",
    short: "Pumpkins, festivals & spooky nights", sub: "Florida fall plans worth showing up for",
    cta: "See everything fall", art: "augtober", drop: true },
];

export const RAIL_IDS = RAILS.map((r) => r.id);
export const railById = (id) => RAILS.find((r) => r.id === id) || null;

/** Art basename for a rail in the given region. */
export function railArt(rail, region) {
  if (!rail) return null;
  if (rail.regional && rail.regional[region]) return rail.regional[region];
  return rail.art;
}

// Per-rail tile tint. It paints BEFORE the card art decodes and shows through
// nothing after — so the rail is never a row of grey rectangles on a cold cache,
// and each card holds its own identity during the first 100ms. Ported verbatim
// from the approved prototype.
export const RAIL_TINT = {
  season: "linear-gradient(165deg,#4E3208,#241A10 55%,#0B0E1A)",
  today: "linear-gradient(165deg,#123A56,#101C33 55%,#0B0E1A)",
  trending: "linear-gradient(165deg,#3B1350,#1A0B2E 55%,#0B0E1A)",
  best: "linear-gradient(165deg,#0B3A4A,#0C2036 55%,#0B0E1A)",
  eat: "linear-gradient(165deg,#4A2109,#26110A 55%,#0B0E1A)",
  beach: "linear-gradient(165deg,#0B4152,#0C2433 55%,#0B0E1A)",
  family: "linear-gradient(165deg,#123F27,#0D2320 55%,#0B0E1A)",
  locals: "linear-gradient(165deg,#3A1330,#170F2A 55%,#0B0E1A)",
  // v8.33 — pulled from the poster's own espresso-brown ground, so the tint
  // that paints before the art decodes is the art's colour, not a guess.
  cindy: "linear-gradient(165deg,#3A2416,#1D1410 55%,#0B0E1A)",
  gems: "linear-gradient(165deg,#123B33,#0C2029 55%,#0B0E1A)",
  drive: "linear-gradient(165deg,#0E2D4E,#0D1830 55%,#0B0E1A)",
  // v8.90 — pulled from the poster's own ground (the amber stage wash bleeding
  // into its violet-black surround), so the tint that paints before the art
  // decodes IS the art's colour rather than a guess. Same rule cindy follows.
  tonight: "linear-gradient(165deg,#3A2A0C,#241832 55%,#0B0E1A)",
  datenight: "linear-gradient(165deg,#4A0E1E,#210F26 55%,#0B0E1A)",
  events: "linear-gradient(165deg,#4A0E2C,#20102E 55%,#0B0E1A)",
  break: "linear-gradient(165deg,#4A3508,#231A0E 55%,#0B0E1A)",
  // v8.15 — breakfast warms toward the tile's yellow; birthday toward its mint.
  breakfast: "linear-gradient(165deg,#4A3A05,#241C0B 55%,#0B0E1A)",
  birthday: "linear-gradient(165deg,#0F3D33,#0D2422 55%,#0B0E1A)",
  blog: "linear-gradient(165deg,#0C3C57,#0D2233 55%,#0B0E1A)",
  chef: "linear-gradient(165deg,#1E2A22,#101710 55%,#0B0E1A)",
  augtober: "linear-gradient(165deg,#4A2508,#2A1508 55%,#0B0E1A)",
};
export const railTint = (id) => RAIL_TINT[id] || "linear-gradient(165deg,#1B2233,#0B0E1A)";

// Art asset ladder: /public/cards-v8/<base>-<w>.<ext>.
//   AVIF + WebP at 380w and 760w  -> what every current browser actually gets
//   JPEG at 760w only             -> the <img> fallback for a browser that
//                                    supports neither, which is not a browser
//                                    worth generating a second ladder for
// RAIL_ART_V busts the CDN when a card's art is replaced but its filename is
// not — the exact bug that once made a swapped card look ignored.
export const RAIL_ART_DIR = "/cards-v8";
export const RAIL_ART_WIDTHS = [380, 760];
// v9 (2026-08-19): busts every phone's 30-day cache of the v8.15 REDRAWN
// birthday/breakfast tiles — the owner's own posters shipped in #804 under
// the same filenames, so cached clients kept showing the mocks. The owner saw
// exactly that and read it as his art never being used. Bump this whenever
// art bytes change under an existing name.
// v10 (2026-08-21): the events tile is the owner's "WHAT'S HAPPENING NEAR
// YOU?" poster, replacing the purple "YOUR NIGHT STARTS HERE" art under the
// same five filenames. Without this bump every phone that has seen the home
// page in the last 30 days keeps the old one — which is exactly how a swapped
// card came to look ignored in v8.15.
// v11 (2026-08-29): the tonight tile is the owner's "TONIGHT'S MOVE" poster —
// NIGHTLIFE / concerts, live music, comedy & events — replacing the previous
// art under the same five filenames. Same reason as v10 and v9: without this
// bump every phone that has seen the home page in the last 30 days keeps the
// old card, which is exactly how a swapped tile came to look ignored in v8.15
// and why the owner said "I still see the old card".
// v12 (2026-08-29): the datenight tile is the owner's "BEST NIGHT. / EVERY
// DETAIL." poster under the same five filenames. Same cache-bust reason.
// v13 (2026-08-30): Date Night derivatives were regenerated WITHOUT the 9:16
// center-crop that clipped the left-aligned wordmark. Same filenames.
// v14 (2026-08-30): founder lock — DATE NIGHT / Impress. Every time. Adobe
// poster (1086×1448, 3:4) replaces BEST NIGHT / EVERY DETAIL under the same
// five filenames. Full frame, no cover crop.
// v15 (2026-08-30): the owner's new DATE NIGHT poster — "An unforgettable
// night. Already planned." — at 941×1672, which IS the 9:16 tile box, so the
// v14 letterbox goes with it. Same five filenames, so without this bump every
// phone that opened the home page in the last 30 days keeps the old card:
// the v8.15 bug, and the reason he said "I still see the old card" in v8.90.
// v16 (2026-08-30): the trending tile is the owner's TRENDING NEAR YOU poster
// ("What people are searching and experiencing right now"), replacing the
// purple "Everyone's searching this" art under the same five filenames. Same
// reason as every bump before it: without this every phone that opened the
// home page in the last 30 days keeps the old card.
export const RAIL_ART_V = "16";
// Mirrors the tile's own CSS width so a phone downloads the 380w file (~19KB)
// instead of the 760w one.
export const RAIL_ART_SIZES = "(max-width:900px) 76vw, (max-width:1100px) 34vw, 440px";

// Every ladder is 760×1350 (~9:16), matching the shared tile box
// (--wf8-ratio:.5625).
//
// v8.93 — THE PER-RAIL OVERRIDE IS GONE, and that is the fix rather than a
// tidy-up. v14's poster was 1086×1448 (3:4), so it was given its own intrinsic
// and drawn with object-fit:contain to avoid the #1031 left-edge crop — which
// letterboxed it, and the maroon band above the art in the owner's screenshot
// IS that letterbox. The new poster he supplied is 941×1672 = 0.5628, the tile
// box to three decimals, so it cover-fits with nothing clipped and nothing
// padded. An empty map would be dead weight the next reader has to reason
// about, so the whole mechanism goes with the poster that needed it; restore
// it (and the contain rule beside it) only for another off-ratio poster.
export const RAIL_ART_DEFAULT_SIZE = { width: 760, height: 1350 };
export function railArtSize() {
  return RAIL_ART_DEFAULT_SIZE;
}

export function railArtSrcSet(base, ext) {
  return RAIL_ART_WIDTHS
    .map((w) => `${RAIL_ART_DIR}/${base}-${w}.${ext}?v=${RAIL_ART_V} ${w}w`)
    .join(", ");
}
export function railArtFallback(base) {
  return `${RAIL_ART_DIR}/${base}-760.jpg?v=${RAIL_ART_V}`;
}
