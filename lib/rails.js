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
  { id: "trending", artStale: true, title: "Most Talked About Near You", axis: "signal — creators are posting it, or demand is genuinely up",
    emptyWhy: "no creator post and no genuine demand surge near you yet",
    short: "What people are talking about", sub: "Creator posts and real demand, near you",
    cta: "See what's being talked about", art: "trending", href: "/trending", list: true },

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

  { id: "gems", title: "Places You'd Never Find", axis: "obscurity — excellent but under-reviewed",
    emptyWhy: "nothing nearby is both excellent and genuinely under-reviewed",
    short: "Great, and nobody found it", sub: "Over 4.6, under 600 reviews",
    cta: "Show me the gems", art: "gems", href: "/hidden-gems", list: true },

  { id: "drive", title: "Worth the Drive", axis: "distance — worth leaving town for",
    emptyWhy: "nothing within driving distance earns the trip today",
    short: "45 minutes, worth it", sub: "The ones that earn the tank",
    cta: "Show me what's worth it", art: "drive", href: "/worth-the-drive", list: true },

  { id: "tonight", title: "Tonight's Move", axis: "hours — still open when you get there",
    emptyWhy: "nothing near you is still open and worth going to tonight",
    short: "Still open when you arrive", sub: "Hours verified for tonight",
    cta: "Show me tonight", art: "tonight", href: "/tonight", list: true },

  { id: "datenight", title: "Date Night", axis: "the room — atmosphere for two",
    emptyWhy: "nothing nearby has the room for it tonight",
    short: "Quiet enough to talk", sub: "The room matters as much as the food",
    cta: "Book date night", art: "datenight", href: "/date-night", list: true },

  { id: "events", title: "Events Near You", axis: "ticketed and dated — it sells out",
    emptyWhy: "nothing ticketed and dated is coming up near you",
    short: "Dated, ticketed, selling out", sub: "Concerts and one-nighters near you",
    cta: "See what's on", art: "events", href: "/events", list: true },

  { id: "break", title: "The 30-Minute Break", axis: "time budget — must fit in 30 minutes",
    emptyWhy: "nothing nearby fits a thirty-minute break",
    short: "Back at your desk in 30", sub: "Counter-serve, wait times checked",
    cta: "Lunch picks near you", art: "break", href: "/restaurants", list: true },

  // The only rail whose payoff is reading rather than a ranked list. It opens
  // the guides library instead of place cards, so it carries no `list`.
  { id: "blog", title: "Local Guides", axis: "the writing — why a place is worth it, not just where",
    emptyWhy: "we have not written a guide for your area yet",
    short: "Written by someone who went", sub: "The catch, the parking, the hour",
    cta: "Read the guides", art: "blog", href: "/guides", guides: true },
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
  gems: "linear-gradient(165deg,#123B33,#0C2029 55%,#0B0E1A)",
  drive: "linear-gradient(165deg,#0E2D4E,#0D1830 55%,#0B0E1A)",
  tonight: "linear-gradient(165deg,#2A1B08,#161326 55%,#0B0E1A)",
  datenight: "linear-gradient(165deg,#4A0E1E,#210F26 55%,#0B0E1A)",
  events: "linear-gradient(165deg,#4A0E2C,#20102E 55%,#0B0E1A)",
  break: "linear-gradient(165deg,#4A3508,#231A0E 55%,#0B0E1A)",
  blog: "linear-gradient(165deg,#0C3C57,#0D2233 55%,#0B0E1A)",
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
export const RAIL_ART_V = "8";
// Mirrors the tile's own CSS width so a phone downloads the 380w file (~19KB)
// instead of the 760w one.
export const RAIL_ART_SIZES = "(max-width:900px) 76vw, (max-width:1100px) 34vw, 440px";

export function railArtSrcSet(base, ext) {
  return RAIL_ART_WIDTHS
    .map((w) => `${RAIL_ART_DIR}/${base}-${w}.${ext}?v=${RAIL_ART_V} ${w}w`)
    .join(", ");
}
export function railArtFallback(base) {
  return `${RAIL_ART_DIR}/${base}-760.jpg?v=${RAIL_ART_V}`;
}
