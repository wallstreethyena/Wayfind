// lib/rails.js — the 15 daypart rails.
//
// A rail is a CURATION, not a category. lib/categories.js CATEGORY_TILES holds
// the six browse categories (Food, Night out, Activities, Family, Stays,
// Shopping) that the top tabs render; those answer "what kind of place". A rail
// answers "why would I open this right now" — and each one owns exactly ONE axis
// that no other rail claims. If two rails could carry the same axis, one of them
// should not exist.
//
// `source` maps a rail onto the ranking engine that already exists:
// lib/landing.js rankedFor(catSlug, citySlug) with catSlug in
// {things-to-do, restaurants, beaches, nightlife}. `pick` narrows the ranked
// pool to the rail's axis. Nothing here invents a place — every card that ships
// comes out of the same engine the landing pages use.
//
// `art` is the basename in /public/cards-v8 (AVIF/WebP/JPEG at 380w and 760w).
// `regional` swaps art by region; see lib/dayparts.js regionFor().

export const RAILS = [
  { id: "season", title: "Summer Picks", axis: "expires — only available this season",
    short: "Gone when summer goes", sub: "Back next year, not sooner",
    cta: "See what ends soon", art: "season", href: "/seasonal",
    source: { cat: "things-to-do" } },

  { id: "today", title: "What Should We Do Today?", axis: "the whole day — a sequence, not one place",
    short: "Not one place. A whole day.", sub: "A plan in order, built around now",
    cta: "Plan our day", art: "today", href: "/things-to-do",
    source: { cat: "things-to-do" } },

  { id: "trending", title: "Exploding Trends Near You", axis: "demand — what people are searching",
    short: "Everyone's searching this", sub: "We found where to try it",
    cta: "See what's spiking", art: "trending", href: "/trending",
    source: { cat: "things-to-do" }, pick: (p) => !!p.trending },

  { id: "best", title: "The Best Around You", axis: "score — highest Wayfind Score, any category",
    short: "The highest score near you", sub: "Any category. No paid placement.",
    cta: "See the top scores", art: "best", href: "/best-of",
    source: { cat: "things-to-do" } },

  { id: "eat", title: "Actually Worth Eating", axis: "the meal — food quality above all",
    short: "Skip the bad meal", sub: "Ranked on the food, not the noise",
    cta: "Show me what's good", art: "eat", href: "/restaurants",
    source: { cat: "restaurants" } },

  { id: "beach", title: "Beach Day", axis: "the water",
    short: "The beach, decided", sub: "Tide, parking, and the good stretch",
    cta: "Find my beach", art: "beach", href: "/best-beaches",
    source: { cat: "beaches" } },

  { id: "family", title: "Family Day, Decided", axis: "kids in tow",
    short: "Nobody melts down at 3pm", sub: "Kid-approved, pet-friendly, shade checked",
    cta: "Plan the day", art: "family", href: "/family",
    regional: { orlando: "family-orlando", fl: "family-fl" },
    source: { cat: "things-to-do" } },

  { id: "locals", title: "Locals Know", axis: "source — a real person went and posted it",
    short: "Someone actually went", sub: "Creators who posted it, near you",
    cta: "See what they found", art: "locals", href: "/things-to-do",
    source: { cat: "things-to-do" } },

  { id: "gems", title: "Places You'd Never Find", axis: "obscurity — excellent but under-reviewed",
    short: "Great, and nobody found it", sub: "Over 4.6, under 600 reviews",
    cta: "Show me the gems", art: "gems", href: "/hidden-gems",
    source: { cat: "things-to-do" },
    // The axis stated as a rule, not a vibe. Same threshold the Hidden gem hook uses.
    pick: (p) => (p.rating || 0) >= 4.6 && (p.reviews || 0) >= 40 && (p.reviews || 0) <= 600 },

  { id: "drive", title: "Worth the Drive", axis: "distance — worth leaving town for",
    short: "45 minutes, worth it", sub: "The ones that earn the tank",
    cta: "Show me what's worth it", art: "drive", href: "/worth-the-drive",
    source: { cat: "things-to-do" }, pick: (p) => (p.distMi || 0) >= 12 },

  { id: "tonight", title: "Tonight's Move", axis: "hours — still open when you get there",
    short: "Still open when you arrive", sub: "Hours verified for tonight",
    cta: "Show me tonight", art: "tonight", href: "/tonight",
    source: { cat: "nightlife" } },

  { id: "datenight", title: "Date Night", axis: "the room — atmosphere for two",
    short: "Quiet enough to talk", sub: "The room matters as much as the food",
    cta: "Book date night", art: "datenight", href: "/date-night",
    source: { cat: "restaurants" } },

  { id: "events", title: "Events Near You", axis: "ticketed and dated — it sells out",
    short: "Dated, ticketed, selling out", sub: "Concerts and one-nighters near you",
    cta: "See what's on", art: "events", href: "/events",
    source: { cat: "things-to-do" } },

  { id: "break", title: "The 30-Minute Break", axis: "time budget — must fit in 30 minutes",
    short: "Back at your desk in 30", sub: "Counter-serve, wait times checked",
    cta: "Lunch picks near you", art: "break", href: "/restaurants",
    source: { cat: "restaurants" }, pick: (p) => (p.distMi || 0) <= 5 },

  // The only rail whose payoff is reading rather than a ranked list. It opens the
  // guides library instead of place cards, so it carries no `source`.
  { id: "blog", title: "Local Guides", axis: "the writing — why a place is worth it, not just where",
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
