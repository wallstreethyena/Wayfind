// lib/intentPages.js — data spine for the hero-card destination pages
// (date-night, family — stamped from the /best-beaches standard). Queries
// per intent + daypart mirror the in-app EXPERIENCES definitions; results
// come from our own guarded /api/places/search, are floored on REAL rating
// depth (family = the not-hidden-gems rule: proven, high-volume places),
// ranked by the ONE Bayesian score, and never decorated with claims the
// data doesn't carry. Pure helpers exported for the lock test.
// v6.57: the seasonal entry below derives its label, colour, hero photo and
// queries from the live season, so the page states the season it is showing.
// .js extension is required: the guard suite imports this module directly under
// Node ESM (scripts/test-intent-pages.mjs), which does not resolve extensionless
// specifiers the way the bundler does. Same convention as ./envAudit.js.
import { SEASON_META, currentSeason, seasonQueries } from "./seasons.js";
// v6.65: PRICE_ENUM moved to lib/price — one place derives price, and this
// file was one of three that independently mapped it.
import { PRICE_ENUM } from "./price.js";
// v6.72 — TIME AWARENESS (owner, 2026-07-30, third request).
//
// Every `queries` below used to branch on a raw `h >= 15` — a TWO-bucket day,
// and the hour touched nothing else. Same places, same order, same words at 8am
// and 8pm, because the hour picked a query set and stopped there. Three things
// changed, and all three route through ONE source:
//
//   queries  take the whole nowContext, not a bare hour, and split THREE ways
//   ranking  reweights per bucket (rankRows below) — not only re-queries
//   copy     states the bucket, the gate and the evidence (nowSubline)
//
// nowContext is pure and takes weather as an argument, so this module stays pure
// too — no fetch, no clock read — and every page is testable at a pinned hour.
// That is what makes the three-hour verification possible at all.
import { nowContext } from "./nowContext.js";
import { venueLean, coarseCat, conditionsAdjust } from "./ranking.js";
// v7.09 — the composition law below classifies a row by SECTION. It uses the
// app's existing classifier rather than a second one: a list that disagreed with
// the rest of the app about what counts as Food would be a new bug, not a fix.
import { primaryCategory, CATEGORY_SECTION } from "./placeCategory.js";
import { lawfulComparator } from "./lawfulOrder.js";
import { businessStatus } from "./businessStatus.js";
import { buildCollectionHeader, localizedCollectionDeck } from "./collectionHeader.js";

// Back-compat shim. `queries(h)` and `titles(h, city)` used to receive a bare
// float hour; they now receive the whole context. Any caller still passing a
// number gets a context built from it, so a missed call site degrades to
// correct-but-weatherless rather than throwing on `ctx.timeBucket`.
export function asCtx(x) {
  if (x && typeof x === "object" && x.timeBucket) return x;
  if (Number.isFinite(Number(x))) return nowContext({ hour: Number(x) });
  return nowContext({});
}

export const INTENT_PAGES = {
  // v6.59 — the destination for the orientation card ("Know what is around
  // you"), which is pinned first in the hero rail and previously opened nothing
  // at all: it was a plain <article>, not a control.
  //
  // The card promises "Wayfind ranks the local places worth your time". This
  // page is that promise made good — the general ranked list, no category
  // filter, so it delivers exactly what the card claims rather than sending the
  // user somewhere narrower. Broad queries across the four main categories, a
  // moderate floor so the list is populated in thin markets, and the standard
  // distance penalty.
  nearby: {
    headerDeck: (city) => "A sharp cross-section of " + city + ", across food, culture and things to do.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      // The share card's opening line. `promise` directly below already
      // carries the mechanism ("ranked by the Wayfind Score"), so this is the
      // half that does the emotional work. This is the owner's own framing.
      eyebrow: "The good stuff is closer than you think",
      line1: "Everything good near you",
      promise: "Every category near you, ranked by the Wayfind Score.",
      accent: "#F97316",
      art: "/brand/wayfind-default-hero-adobestock-289023289.jpeg",
    },
    eyebrows: ["Know what is around you", "Your area, ranked", "The short list near you"],
    accent: "#F97316",
    art: "/brand/wayfind-default-hero-adobestock-289023289.jpeg",
    floor: { rating: 4.3, reviews: 120 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    // The general list still covers all four categories, but WHICH member of
    // each category we ask for moves with the bucket, and the outdoor slot is
    // the one the weather gate can take away.
    queries: (c) => {
      const x = asCtx(c);
      const base = x.timeBucket === "morning"
        ? [{ cat: "attractions", q: "things to do this morning" }, { cat: "food", q: "best breakfast brunch" }, { cat: "food", q: "best coffee" }]
        : x.timeBucket === "afternoon"
        ? [{ cat: "attractions", q: "top things to do" }, { cat: "food", q: "best lunch" }, { cat: "attractions", q: "museum gallery indoor" }]
        : [{ cat: "food", q: "best dinner open late" }, { cat: "nightlife", q: "best bars" }, { cat: "attractions", q: "things to do tonight" }];
      return x.outdoorOK ? base.concat([{ cat: "attractions", q: "parks outdoors" }]) : base.concat([{ cat: "attractions", q: "indoor activity air conditioned" }]);
    },
    titles: [
      (c, city) => "What's actually worth your time in " + city,
      (c, city) => "You have driven past most of these",
      (c, city) => "Everything good near you, ranked",
    ],
    subs: [
      (city) => "Every category, ranked by the Wayfind Score. We left off anything under 120 reviews — not enough people to trust the rating.",
      (city) => "Food, drinks and things to do in " + city + ", in one ranked list. We left off anything under 120 reviews, because a handful of ratings is not evidence.",
      (city) => "Ranked by the Wayfind Score, which weighs a rating by how many people stand behind it. We left off anything under 120 reviews.",
    ],
  },
  "date-night": {
    headerDeck: (city) => "The best places for two in " + city + ", from intimate tables to after-dark charm.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      eyebrow: "Date night, decided",
      line1: "Tonight, decided",
      promise: "The best of the night for two — ranked, not guessed.",
      accent: "#F472B6",
      art: "/cards/date-night-adobestock-190984224.jpeg",
    },
    eyebrows: ["Date night, decided", "Two people, one good call"],
    accent: "#F472B6",
    art: "/cards/date-night-adobestock-190984224.jpeg",
    floor: { rating: 4.4, reviews: 150 },
    // Owner (2026-07-21, follow-up): the same distance rule as family —
    // -0.2 per started 5-mile block beyond 17 mi, rank order only.
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    // Three buckets, and the outdoor half of each one is gated. A "scenic sunset
    // spot" or a "botanical garden scenic walk" is exactly the recommendation
    // that ruins a date in a thunderstorm or a 96° heat index, so when the gate
    // is shut those slots become the indoor equivalent rather than being
    // demoted a few points and shown anyway.
    queries: (c) => {
      const x = asCtx(c);
      if (x.timeBucket === "morning") {
        return [{ cat: "food", q: "romantic cafe brunch" }, { cat: "food", q: "best coffee date" },
          x.outdoorOK ? { cat: "attractions", q: "botanical garden scenic walk" } : { cat: "attractions", q: "art gallery museum date" },
          { cat: "food", q: "bakery pastry" }];
      }
      if (x.timeBucket === "afternoon") {
        return [{ cat: "food", q: "romantic restaurant lunch" }, { cat: "food", q: "wine tasting winery" },
          x.outdoorOK ? { cat: "attractions", q: "scenic walk waterfront" } : { cat: "attractions", q: "museum aquarium indoor date" },
          { cat: "nightlife", q: "afternoon wine bar" }];
      }
      return [{ cat: "food", q: "romantic dinner intimate" }, { cat: "nightlife", q: "wine bar cocktail lounge" },
        x.outdoorOK ? { cat: "food", q: "waterfront dinner sunset views" } : { cat: "food", q: "candlelit dinner intimate" },
        x.outdoorOK ? { cat: "attractions", q: "scenic sunset spot" } : { cat: "attractions", q: "live theater show evening" }];
    },
    titles: [
      (c, city) => { const b = asCtx(c).timeBucket; return b === "morning" ? "Morning date" : b === "afternoon" ? "Afternoon date" : "Tonight"; },
      (c, city) => "Stop asking each other where to go",
      (c, city) => "The night you will both remember",
    ],
    subs: [
      (city) => "The best of " + city + " for two — ranked by the Wayfind Score, tuned to right now.",
      (city) => "Ranked for two in " + city + ". We left off anything under 150 reviews — a date is a bad night to gamble.",
      (city) => "The highest-scoring places for two in " + city + ", tuned to the hour. We left off anything under 150 reviews.",
    ],
  },
  family: {
    headerDeck: (city) => "The " + city + " outings that work for kids without boring the adults.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      eyebrow: "Memories for life",
      line1: "Family day, decided",
      promise: "The most-loved spots, proven by thousands of families.",
      accent: "#22C55E",
      art: "/cards/family-adobestock-794890098.jpeg",
    },
    eyebrows: ["Memories for life", "The whole family, agreed"],
    accent: "#22C55E",
    art: "/cards/family-adobestock-794890098.jpeg",
    // NOT hidden gems: proven crowd-pleasers only — the ≥500-review floor is
    // the same threshold "Locals Actually Recommend" rides on.
    floor: { rating: 4.5, reviews: 500 },
    // Owner rule, THIS list only: -0.2 (on the /10 scale) per started 5-mile
    // block beyond 17 mi — far places sink dynamically; nothing else changes.
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    // The gate matters MOST here. A Florida family at 3pm under a heat advisory
    // is the single case the owner named: an outdoor theme-park recommendation
    // then is not a slightly worse pick, it is the reason the day gets
    // abandoned. Suppressed, not demoted.
    queries: (c) => {
      const x = asCtx(c);
      const kids = x.timeBucket === "morning"
        ? [{ cat: "attractions", q: "family things to do morning kids" }, { cat: "food", q: "family breakfast pancakes" }]
        : x.timeBucket === "afternoon"
        ? [{ cat: "attractions", q: "family attractions things to do kids" }, { cat: "food", q: "ice cream unique dessert experience" }]
        : [{ cat: "attractions", q: "family evening activity kids" }, { cat: "food", q: "family restaurant dinner" }];
      return kids.concat(x.outdoorOK
        ? [{ cat: "attractions", q: "family theme park water park" }, { cat: "attractions", q: "aquarium zoo wildlife" }]
        : [{ cat: "attractions", q: "science museum children discovery indoor" }, { cat: "attractions", q: "aquarium indoor family" }]);
    },
    titles: [
      (c, city) => "Family day",
      (c, city) => "Where \"I am bored\" becomes \"can we go back?\"",
      (c, city) => "The day they will ask to repeat",
    ],
    subs: [
      (city) => "The most-loved family spots in " + city + " — proven by thousands, ranked by the Wayfind Score.",
      (city) => "Ranked by the Wayfind Score in " + city + ". We left off anything under 500 reviews — with kids in the car we want the sure thing.",
      (city) => "Only places thousands of families have already vouched for in " + city + ". We left off anything under 500 reviews.",
    ],
  },
  // v6.57 — Seasonal Picks joins this template.
  //
  // It previously opened a SHEET (openExpSheet("seasonal")): a hero card, a sort
  // control and one detail card. Every other list surface renders this template,
  // so it now does too — same eyebrow, headline, subhead, Share action, ranked
  // rows as /date-night and /family.
  //
  // Season-derived fields come from lib/seasons.js so the page names the season
  // it is ACTUALLY showing. The old copy read "pumpkin patches and vineyards in
  // fall, holiday lights in winter, beaches and water parks in summer" — in July
  // that is noise about two seasons the user is not in.
  //
  // No hardcoded count or temperature in `sub`: list length is dynamic per
  // location and the weather is live, so "16 places" or "94°" would be numbers
  // we cannot keep. The constraint is stated; the count renders from real rows.
  //
  // floor 4.0 matches the in-app EXPERIENCES.seasonal filter exactly, so the
  // page and the sheet cannot disagree about what qualifies.
  seasonal: {
    headerDeck: (city) => "The places and plans around " + city + " that genuinely fit this season.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      // Described the MECHANISM ("built for the season"). A card is an
      // invitation; the mechanism stays in `promise` directly below.
      //
      // A first pass read "Right now, not in general", which echoed line1
      // ("What actually works right now") two words later. This version also
      // sets up a deliberate contrast with best-of's "The permanent list":
      // one changes with the season, one does not. Both claims are true.
      eyebrow: "The list that changes with the weather",
      line1: "What actually works right now",
      promise: "Searched for the season, then ranked by the Wayfind Score.",
      accent: "#FBBF24",
      art: "/cards/summer-seasonal-adobestock-62707647.jpeg",
    },
    eyebrows: [SEASON_META[currentSeason()].label + " picks", "Built for the season you are in"],
    accent: SEASON_META[currentSeason()].color,
    art: SEASON_META[currentSeason()].heroImage || "/cards/summer-seasonal-adobestock-62707647.jpeg",
    floor: { rating: 4.0, reviews: 40 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    // The season picks the query bank; the bucket and the gate decide which half
    // of it runs. A summer bank is mostly water and shade — the exact set that
    // must not run during a storm or a heat advisory.
    queries: (c) => {
      const x = asCtx(c);
      const bank = seasonQueries(currentSeason()).map((q) => ({ cat: q.cat, q: q.keyword || "" }));
      const kept = x.outdoorOK ? bank : bank.filter((q) => !/beach|water|park|outdoor|garden|trail|kayak|boat|sunset/i.test(q.q));
      const extra = x.outdoorOK
        ? [{ cat: "attractions", q: x.timeBucket === "night" ? "evening outdoor event tonight" : "outdoor things to do" }]
        : [{ cat: "attractions", q: "indoor air conditioned museum aquarium" }];
      // A season bank filtered to nothing would leave the page empty, which is a
      // worse answer than the indoor substitute alone.
      return (kept.length ? kept : []).concat(extra);
    },
    titles: [
      (c, city) => SEASON_META[currentSeason()].label + " picks near you",
      (c, city) => "What actually works in " + city + " right now",
      (c, city) => "The season, handled",
    ],
    // The old variant-0 subhead ended "We left off anything with no cover."
    // rankRows filters on rating, reviews, maxReviews and maxPrice — there is
    // no cover, shade or indoor predicate anywhere in this repo, so that was a
    // stated filter with no implementing predicate: the exact fabrication this
    // page family already shipped once on /budget. The seasonal INTENT is
    // carried by `queries` (water, shade, indoor), which is real and is why
    // these results differ from /best-of — but a query bias is not an
    // exclusion, and the copy may not describe it as one.
    subs: [
      (city) => "Ranked for " + currentSeason() + " in " + city + " — water, shade, and somewhere cool to wait out the afternoon.",
      (city) => "What holds up in " + city + " this time of year, ranked by the Wayfind Score. We left off anything under 40 reviews.",
      (city) => "Searched for the season, then ranked by the Wayfind Score. We left off anything under 40 reviews.",
    ],
  },
  // v6.58 — "Perfect for tonight". The tile used to call setScreen("events"),
  // which is a WRONG DESTINATION, not a styling problem: a tile promising places
  // for tonight landed the user on the events calendar.
  //
  // COPY HONESTY: the approved subhead was "Filtered on live hours and drive
  // time. Anything closing within the hour is out." IntentPageClient does NOT
  // filter on hours — it floors on rating/reviews and applies distancePenalty
  // (verified: no openNow/isOpenNow/hours reference in the component). Claiming
  // an hours filter would be a claim about code that does not exist, which is
  // the exact failure the copy rules prevent. The subhead states what the page
  // actually does; if live-hours filtering ships later, the copy can grow into
  // it.
  tonight: {
    headerDeck: (city) => "Where " + city + " comes alive tonight, from dinner through the last good stop.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      eyebrow: "Perfect for tonight",
      line1: "Tonight, ranked",
      promise: "Where tonight actually happens near you, ranked for this hour.",
      accent: "#818CF8",
      art: "/cards/tonight-alfonso-scarpa-unsplash.jpg",
    },
    eyebrows: ["Perfect for tonight", "Tonight, sorted"],
    accent: "#818CF8",
    art: "/cards/tonight-alfonso-scarpa-unsplash.jpg",
    floor: { rating: 4.4, reviews: 150 },
    // "Perfect for tonight" is a mood too. Mixed is correct here; four
    // restaurants and a bar is not a night out, it is a dinner list. Morning-
    // only venue types are categorically wrong even when Google's text search
    // returns them for a broad food query.
    compose: {
      maxPerSection: 4,
      excludeTypes: ["breakfast_restaurant", "brunch_restaurant", "bagel_shop", "coffee_shop", "cafe", "bakery"],
    },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    // This list answers a future intent when read before dark. It must not turn
    // into a breakfast or lunch list merely because the reader is planning at
    // that hour; the heading still says Tonight's Move.
    queries: () => [
      { cat: "nightlife", q: "live music tonight" },
      { cat: "food", q: "dinner open late" },
      { cat: "nightlife", q: "cocktail bar lounge" },
      { cat: "attractions", q: "evening activity things to do tonight" },
    ],
    titles: [
      (c, city) => "Tonight, ranked",
      (c, city) => "Do not waste a good night",
      (c, city) => "Tonight, handled",
    ],
    // Same rule as worth-the-drive: no distance claims. "Within a short drive"
    // and "close enough to leave now" described a proximity bound that does not
    // exist — the distancePenalty below reorders results, it never excludes one.
    subs: [
      (city) => "The highest-scoring places in " + city + ", ranked by the Wayfind Score. We left off anything under 150 reviews — too thin to trust on a night out.",
      (city) => "Ranked by the Wayfind Score for tonight in " + city + ". We left off anything under 150 reviews.",
      (city) => "The short list for tonight in " + city + ". We left off anything under 150 reviews.",
    ],
  },
  // v6.58 — "Best of {city}". The tile called openCurated("today"); it now has a
  // page. Floor is the highest on the template deliberately: this list claims to
  // be the best in the market, so the depth requirement has to back that.
  "best-of": {
    headerDeck: (city) => "The places that define " + city + ", across food, culture and local landmarks.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      // "Best of" is a category header, not a promise — and a bare "best" with
      // no mechanism is exactly what check-copy-no-empty-hype catches. "Earned
      // it" is backed by the promise below: the highest-scoring places across
      // every review we hold.
      eyebrow: "The ones that earned it",
      line1: "The permanent list",
      promise: "The highest-scoring places in town, across every review we have.",
      accent: "#FBBF24",
      art: "/cards/best-of-adobestock-214368481.jpeg",
    },
    eyebrows: ["Best of", "The permanent list"],
    accent: "#FBBF24",
    art: "/cards/best-of-adobestock-214368481.jpeg",
    floor: { rating: 4.3, reviews: 200 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    // TIMELESS — the ONE page the time/weather layer deliberately does not
    // touch, and the copy is why. Title variant 1 is literally "The list that
    // does not change with the weather" and the subhead promises "the permanent
    // top of {city}, not a seasonal list". Gating this page would make both of
    // those false, and a copy claim that contradicts the code is the exact
    // failure check-intent-copy-matches-filter exists to catch. `timeless`
    // makes the exemption explicit and machine-readable instead of leaving it
    // as an accident of which queries someone remembered to convert.
    timeless: true,
    queries: (c) => [
      { cat: "attractions", q: "top attractions must see" },
      { cat: "food", q: "best restaurants" },
      { cat: "attractions", q: "iconic landmark" },
      { cat: "nightlife", q: "best bars" },
    ],
    titles: [
      (c, city) => "The highest-scoring places in " + city,
      (c, city) => "The list that does not change with the weather",
      (c, city) => "What " + city + " is actually known for",
    ],
    subs: [
      (city) => "Ranked by the Wayfind Score across every review we have. Nothing under 4.3, nothing under 200 reviews.",
      (city) => "The permanent top of " + city + ", not a seasonal list. We left off anything under 200 reviews and anything rated under 4.3.",
      (city) => "Every category, every review we have, one ranking. We left off anything under 200 reviews.",
    ],
  },
  // v6.58 — "Worth the drive". The tile opened openExpSheet("entertainment") with
  // a road-trip photo. The 110km radius mirrors EXPERIENCES.bucketlist, which is
  // the existing worth-the-drive class; the distancePenalty is DELIBERATELY
  // absent here — penalising distance on a list whose whole premise is "worth
  // the drive" would rank against its own thesis.
  "worth-the-drive": {
    headerDeck: (city) => "The day trips and landmarks near " + city + " that earn the extra miles.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      eyebrow: "Worth the drive",
      line1: "Worth the tank of gas",
      promise: "Springs, landmarks and day trips inside 30 miles. The strictest list we run.",
      accent: "#38BDF8",
      art: "/cards/worth-the-drive-roadtrip-hero.jpg",
    },
    eyebrows: ["Worth the drive", "The strictest list we run"],
    accent: "#38BDF8",
    art: "/cards/worth-the-drive-roadtrip-hero.jpg",
    floor: { rating: 4.6, reviews: 300 },
    // v7.09 — "day trips and landmarks that earn it" names a KIND of place, so
    // the list may only contain that kind. Measured before this line existed:
    // nine restaurants, headed by a Tampa Italian place, under a heading about
    // landmarks. The query bank was already asking for parks, springs and
    // iconic landmarks; review depth was overruling it on every seat.
    compose: { sections: ["Activities"] },
    // A day trip is the most expensive recommendation on the site — an hour of
    // driving before the mistake is visible. The gate matters MORE here, not
    // less. Night is deliberately narrow: a landmark you drive an hour for is
    // not a 9pm plan, so the evening bank asks for things open after dark.
    // v7.09 — NO NIGHT BRANCH. This bank used to swap at night to
    // { attractions: "evening show" } + { food: "destination restaurant dinner" },
    // which is what put nine restaurants under "day trips and landmarks" — and
    // then, once the composition refused the food query, left the rail EMPTY at
    // 1am with one weak "evening show" query to work from. Measured, both times.
    //
    // The daypart branch was the wrong instinct for THIS list. A day trip is a
    // PLAN: nobody reads "worth the drive" at midnight expecting to leave now,
    // they read it deciding what to do tomorrow. So the bank asks for the same
    // thing at every hour and the weather branch stays, because a storm still
    // argues against a springs day.
    queries: (c) => {
      const x = asCtx(c);
      const base = [{ cat: "attractions", q: "day trip worth the drive" }, { cat: "attractions", q: "iconic landmark tradition" }];
      return x.outdoorOK
        ? base.concat([{ cat: "attractions", q: "state park springs natural attraction" }, { cat: "attractions", q: "museum indoor attraction worth the drive" }])
        : base.concat([{ cat: "attractions", q: "museum indoor attraction worth the drive" }]);
    },
    // …and for the same reason, being CLOSED right now does not demote a
    // landmark here. openWeight is correct on "perfect for tonight" and wrong on
    // a list you are reading in order to plan a Saturday.
    planAhead: true,
    titles: [
      (c, city) => "Worth planning a drive around",
      (c, city) => "Worth the tank of gas",
      (c, city) => "The days you will drive for it",
    ],
    // NO DISTANCE CLAIMS HERE. Earlier copy said "out past the usual radius"
    // and that we left off anything reachable in ten minutes. Neither was true
    // at the time this was written: rankRows has no distance predicate, and
    // this entry deliberately has no distancePenalty. What actually
    // distinguishes this page is the FLOOR — 4.6/300 is the strictest in
    // INTENT_PAGES — plus the day-trip queries. Say that instead.
    //
    // v6.94 (owner: "the default for this page should be 30 miles distance
    // because the hero card is called worth the drive"): every OTHER intent
    // page still shares IntentPageClient.js's 32km (~20mi) default, but this
    // one now searches a real 30mi (48280m) via radiusM — a page literally
    // named "worth the drive" was searching a narrower radius than
    // family/date-night, which made the "day trips that earn the extra
    // miles" promise above false on this page's own default view. 30mi also
    // matches DRIVE_BAND.nearMi in lib/worthTheDrive.js, which already
    // assumed this list's own radius was 30mi when it decided where the
    // destination rail should start — so this also fixes a latent mismatch
    // between the two, not just the copy.
    radiusM: 48280,
    subs: [
      (city) => "The highest bar we set on any list: 4.6+ with 300+ reviews, ranked by the Wayfind Score.",
      (city) => "Day trips and landmarks near " + city + ", ranked by the Wayfind Score. We left off anything under 300 reviews and anything rated under 4.6.",
      (city) => "Ranked by the Wayfind Score on the strictest floor we use anywhere. We left off anything under 300 reviews.",
    ],
  },
  // v6.58 — "Big fun, small budget". COPY: no dollar figure. priceLevel is a
  // coarse enum ($, $$, $$$) and $$ maps to no specific amount, so "under $25 a
  // head" would be a number we do not have — on a page about money.
  budget: {
    headerDeck: (city) => "The lower-cost side of " + city + " without lowering the standard.",
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      eyebrow: "Big fun, small budget",
      line1: "Cheap is the filter, not the standard",
      promise: "Free parks, beaches and cheap days out — ranked like everything else.",
      accent: "#34D399",
      art: "/cards/budget-adobestock-299515685.jpeg",
    },
    eyebrows: ["Big fun, small budget", "Cheap, not cheap-feeling"],
    accent: "#34D399",
    art: "/cards/budget-adobestock-299515685.jpeg",
    // maxPrice 2 is what makes "$ and $$ only" TRUE. Without it this page
    // returned the same 22.3k-review restaurants as /seasonal, under a promise
    // it could not keep.
    floor: { rating: 4.4, reviews: 100, maxPrice: 2, freeOutdoor: true },
    // v7.09 — "BIG FUN, small budget". The noun is fun, and the list was five
    // restaurants. Two changes, both required, neither sufficient alone:
    //   · freeOutdoor above, or the free parks and beaches this page exists for
    //     are excluded by maxPrice for having no Google price at all;
    //   · maxPerSection 3, so cheap eats can appear — they are legitimately
    //     cheap fun — without taking every seat from the things to DO.
    compose: { sections: ["Activities", "Food"], maxPerSection: 3 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    // Cheap in Florida means outdoors — parks, springs, free beaches. That is
    // precisely the bank the gate has to be able to take away, or the budget
    // page becomes the worst offender on a storm day.
    queries: (c) => {
      const x = asCtx(c);
      const food = x.timeBucket === "morning" ? { cat: "food", q: "cheap breakfast highly rated" }
        : x.timeBucket === "afternoon" ? { cat: "food", q: "cheap eats highly rated" }
        : { cat: "food", q: "cheap dinner late night eats" };
      return x.outdoorOK
        ? [{ cat: "attractions", q: "free cheap affordable things to do" }, { cat: "attractions", q: "free admission park trail" }, food]
        : [{ cat: "attractions", q: "free admission museum indoor" }, { cat: "attractions", q: "cheap indoor activity" }, food];
    },
    titles: [
      (c, city) => "$ and $$ only, still rated 4.4+",
      (c, city) => "Nights you will remember that your wallet will not",
      (c, city) => "Cheap is the filter, not the standard",
    ],
    // Every variant here keeps a PRICE claim, which is what binds this page to
    // floor.maxPrice in the guard. Do not write a budget subhead that drops the
    // price language: the claim is the thing the check can see.
    subs: [
      (city) => "Google's two lowest price bands in " + city + ", ranked by the Wayfind Score. We left off anything pricier, and anything with no price on record.",
      (city) => "$ and $$ only in " + city + ", ranked by the Wayfind Score rather than by how cheap it is. We left off anything under 100 reviews.",
      (city) => "Big nights that do not cost one. $ and $$ only, and we left off anything with no price on record.",
    ],
  },
  "hidden-gems": {
    // SHARE CARD (v6.72). The OG route reads ONLY from `card` — it never touches
    // titles/subs/accent/art, and it never calls a runtime function.
    //
    // WHY IT IS A SEPARATE LITERAL BLOCK and not derived from the copy above:
    //   · `titles[i]` are functions of (ctx, city). Calling one would make the
    //     card time-dependent, and this route is served
    //     Cache-Control: immutable — a time-varying body behind an immutable
    //     cache is a card frozen at whatever hour the first scraper hit it.
    //   · `subs[i]` are FILTER DISCLOSURES ("we left off anything under 150
    //     reviews"). True, load-bearing on the page, and wrong as a share
    //     card's promise line — a card is an invitation, not a methodology note.
    //   · `accent`/`art` are duplicated here deliberately for seasonal, whose
    //     page values are season-derived at module load. The card must be the
    //     same bytes on every deploy.
    // A missing or incomplete `card` is a BUILD FAILURE (check-intent-cards).
    card: {
      eyebrow: "Hidden gems",
      line1: "Hidden gems",
      promise: "4.6 and up, under 3,000 reviews. Loved by locals, not overrun.",
      accent: "#A78BFA",
      art: "/cards/hidden-gems-adobestock-190689119.jpeg",
    },
    eyebrows: ["Hidden gems", "Loved, not overrun"],
    headerDeck: (city) => "The quietly excellent places in " + city + " most people walk right past.",
    accent: "#A78BFA",
    art: "/cards/hidden-gems-adobestock-190689119.jpeg",
    // THE GEM RULE: genuinely loved (4.6+) but NOT famous — a review CEILING of
    // 3000 is what keeps the tourist-magnets out. Chains are excluded downstream.
    floor: { rating: 4.6, reviews: 60, maxReviews: 3000 },
    // v7.09 — "the spots locals keep to themselves" names a MOOD, not a kind, so
    // this list may legitimately mix food, bars and small museums. What it may
    // not be is one category wearing the word "gems": measured live it came back
    // Food, Food, Food, Nightlife. A cap, not an allow-list.
    compose: { maxPerSection: 4 },
    heroFromList: true,
    queries: (c) => {
      const x = asCtx(c);
      const core = [{ cat: "food", q: "hidden gem restaurant local favorite" }, { cat: "attractions", q: "off the beaten path unique spot" }];
      const byBucket = x.timeBucket === "morning"
        ? [{ cat: "food", q: "unique cafe tucked away" }, { cat: "food", q: "local bakery hidden gem" }]
        : x.timeBucket === "afternoon"
        ? [{ cat: "food", q: "unique cafe tucked away" }, { cat: "attractions", q: "small museum lesser known" }]
        : [{ cat: "nightlife", q: "speakeasy hidden bar" }, { cat: "nightlife", q: "local dive live music" }];
      return core.concat(byBucket, x.outdoorOK ? [{ cat: "attractions", q: "secret garden overlook lesser known" }] : []);
    },
    titles: [
      (c, city) => "Hidden gems in " + city,
      (c, city) => "The places locals quietly hope you never find",
      (c, city) => "The spot you will swear you found first",
    ],
    // TRAP: never put a review MINIMUM and the review CEILING in the same
    // subhead. The number checks read the first "under N reviews" in the
    // string, so a variant carrying both binds the wrong number to the wrong
    // floor. One claim per subhead.
    subs: [
      (city) => "The spots locals keep to themselves in " + city + " — loved, but not overrun. Ranked by the Wayfind Score.",
      (city) => "4.6+ and under 3,000 reviews: the places " + city + " loves that the crowds have not found.",
      (city) => "Loved by the people who live here, missed by everyone else. We left off anything under 60 reviews.",
    ],
  },
};

// ── Copy rotation ───────────────────────────────────────────────────────────
// Every copy slot is an ARRAY so the page does not read the same on the second
// visit (variable reward — the same reason lib/hooks.js rotates the hero cards).
//
// VARIANT 0 IS CANONICAL. generateMetadata and the OG card always render it, so
// the description a crawler or a link unfurl sees is stable across fetches. Only
// the on-page copy rotates.
//
// ROTATION HAPPENS AFTER MOUNT, never during render. IntentPageClient is a
// client component under a plain server page, so Next renders it to HTML on the
// server first; choosing a variant during render would make the server HTML and
// the first client render disagree. That is a hydration mismatch, and on this
// codebase a hydration mismatch does not garble one headline — it takes the
// whole page's interactivity down (the 3d95dd7 outage class).
//
// One integer identifies the exact eyebrow + title + sub combination shown, so a
// PostHog impression and a tap can be joined without carrying three fields.
// Slots have different lengths on purpose; each is indexed modulo its own.
const at = (arr, v) => arr[(((Number(v) || 0) % arr.length) + arr.length) % arr.length];
export const intentEyebrow = (def, v = 0) => at(def.eyebrows, v);
export const intentTitle = (def, c, city, v = 0) => at(def.titles, v)(asCtx(c), city);
export const intentSub = (def, city, v = 0) => at(def.subs, v)(city);
export const intentVariantCount = (def) => def.titles.length;
export function intentHeader(def, ctx, city, v = 0, localContext = "") {
  const deck = typeof def.headerDeck === "function" ? def.headerDeck(city) : (def.headerDeck || intentSub(def, city, v));
  return buildCollectionHeader({
    eyebrow: intentEyebrow(def, v),
    title: intentTitle(def, ctx, city, v),
    deck: localizedCollectionDeck(deck, localContext),
    city,
  });
}

// ── Intent page -> coupon / tour vocabulary ─────────────────────────────────
// ONE map, because this is exactly the shape that has cost this repo a PR twice
// (three art maps, two area_known_for definitions). The coupon registry keys on
// the EXPERIENCES badge vocabulary — eatnow, datenight, familyfun, nightout,
// outdoors, cozyindoor, hiddengems — and the intent pages key on URL slugs.
// Something has to translate; it translates here and nowhere else.
//
// A null is a DELIBERATE absence, not a gap to fill later:
//   best-of / worth-the-drive  the timeless and day-trip lists. A "local deals"
//                              strip on a permanent best-of list is a different
//                              promise from the one the page makes.
//   nearby / budget            no honest badge. `nearby` is every category at
//                              once and `budget` has no counterpart in the
//                              coupon vocabulary; mapping either to `eatnow`
//                              would put restaurant deals under a heading that
//                              says "on this list" when they may not be on it.
// When a real budget/nearby coupon intent exists, add it HERE.
export const INTENT_COUPON_BADGE = {
  "date-night": "datenight",
  family: "familyfun",
  tonight: "nightout",
  "hidden-gems": "hiddengems",
  seasonal: "outdoors",
  nearby: null,
  budget: null,
  "best-of": null,
  "worth-the-drive": null,
};

// The /api/moment/picks vocabulary (lib/momentIntents.MOMENT_INTENT_IDS) is a
// THIRD set of ids. Same rule as above: it is translated here, once. The route
// rejects an unknown intent with a 400, so a wrong value is loud rather than
// silently empty — which is why every entry below is a real MOMENT_INTENT_ID.
export const INTENT_MOMENT_ID = {
  "date-night": "datenight",
  family: "family",
  tonight: "nightout",
  "hidden-gems": "gem",
  seasonal: "outdoors",
  budget: "budget",
  "best-of": "bestof",
  "worth-the-drive": "bestof",
  nearby: "bestof",
};

// Which intent pages carry bookable tour inventory. Mirrors the `viator: true`
// flag on the EXPERIENCES rows the reference sheet reads. A page not listed
// renders NO rail — never an empty one.
export const INTENT_HAS_TOURS = {
  "date-night": true,
  family: true,
  tonight: true,
  seasonal: true,
  "worth-the-drive": true,
  "hidden-gems": true,
  nearby: false,
  budget: false,
  "best-of": true,
};

// ── The line that says WHY ───────────────────────────────────────────────────
// Owner rule: the header must state the three things that produced this list —
// the bucket, the gate, and the evidence for the gate. NEVER a generic line. If
// we cannot say why, we did not adapt and must not claim to.
//
// This is ADDITIVE to each page's own headline (which carries the intent) and
// sits above the filter subhead (which carries the floors). Order on the page:
//   what this list is  ->  why it looks like this RIGHT NOW  ->  what we cut.
//
// COPY HONESTY, same rule as the subheads: the "indoors" half of this line is
// only ever emitted when rankRows ACTUALLY suppressed outdoor rows, because
// `ctx.outdoorOK` is the single value that drives both. It is not a mood.
// A timeless page returns null — /best-of promises a list that does not change
// with the weather, so it must not print a line saying the weather changed it.
export function nowSubline(def, ctx, city) {
  if (!ctx || (def && def.timeless)) return null;
  const place = city && city !== "your town" ? city : null;
  const lead = ctx.timeBucket === "night"
    ? (place ? "Tonight around " + place : "Tonight")
    : (ctx.isWeekend ? ctx.dayName + " " : "") + (ctx.timeBucket === "morning" ? "morning" : "afternoon") + " picks" + (place ? " near " + place : "");
  const s = lead + " — " + ctx.reason;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function distanceDeduction(distMi, cfg) {
  if (!cfg || !isFinite(distMi) || distMi <= cfg.freeMi) return 0;
  return Math.ceil((distMi - cfg.freeMi) / cfg.per) * cfg.deduct;
}
const R = 3958.8;
export function distMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

import { TRENDING_BONUS } from "./wayfindScore.js";

const m = 60, C0 = 3.9;
export const bayes = (rating, reviews) => (Number(rating) > 0 ? ((reviews || 0) / ((reviews || 0) + m)) * Number(rating) + (m / ((reviews || 0) + m)) * C0 : 0);

// Google's priceLevel enum -> 1..4. FREE and INEXPENSIVE both collapse to 1:
// a free museum and a cheap taqueria are the same answer to "what can I afford".

// REST place JSON (our /api/places/search) -> the row the shell renders.
export function toRow(p) {
  if (!p) return null;
  const name = (p.displayName && p.displayName.text) || p.name;
  const reviews = p.userRatingCount != null ? p.userRatingCount : p.reviews;
  const photoRef = p.photos && p.photos[0] && p.photos[0].name;
  if (!name || !p.id || !(Number(p.rating) > 0)) return null;
  const la = p.location && (p.location.latitude != null ? p.location.latitude : p.lat);
  const ln = p.location && (p.location.longitude != null ? p.location.longitude : p.lng);
  return {
    // v6.60: priceLevel is already in the /api/places/search FIELD_MASK
    // ("places.priceLevel") but toRow dropped it, so NO page could filter on
    // price. That made /budget's "$ and $$ only" a claim about a filter that did
    // not exist, and left /budget returning the same 22k-review restaurants as
    // /seasonal. Google's enum normalised to 1..4; FREE and INEXPENSIVE both
    // collapse to 1. null when Google has no price for the place.
    priceLevel: PRICE_ENUM[p.priceLevel] != null ? PRICE_ENUM[p.priceLevel] : (Number.isFinite(p.priceNum) ? p.priceNum : null),
    id: p.id, name, rating: Number(p.rating), reviews: Number(reviews) || 0,
    lat: isFinite(la) ? Number(la) : null, lng: isFinite(ln) ? Number(ln) : null,
    photoRef: photoRef && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoRef) ? photoRef : null,
    editorial: (p.editorialSummary && p.editorialSummary.text) || null,
    // v6.71 (Wave 2): date-night/family queries never search FOR beaches, but
    // a text query like "waterfront dinner sunset views" or "scenic sunset
    // spot" can still surface an actual beach from Google (types carries it —
    // FIELD_MASK on /api/places/search already requests places.types, this
    // just stops toRow from dropping it). The caller uses this only to decide
    // which ids are worth a beach-signal lookup; the DB read is the real gate
    // (a name/type false-positive just gets an empty result, never a wrong one).
    types: Array.isArray(p.types) ? p.types : [],
    // v6.72: hours reach the row. Both fields were ALREADY in the /api/places/
    // search FIELD_MASK ("places.regularOpeningHours", "places.utcOffsetMinutes")
    // and toRow dropped both — which is why /tonight's subhead had to be written
    // around the fact that it could not filter on hours ("IntentPageClient does
    // NOT filter on hours", see the comment on that entry). Now it can: the
    // names below are the shape lib/businessStatus.businessStatus() reads, so
    // open-now and minutes-to-close are real signals in rankRows rather than a
    // claim we had to avoid making.
    oh: p.regularOpeningHours || null,
    utcOffset: Number.isFinite(Number(p.utcOffsetMinutes)) ? Number(p.utcOffsetMinutes) : null,
  };
}

// ── Bucket weighting ────────────────────────────────────────────────────────
// Owner rule 4: the bucket must REWEIGHT results, not only choose the query set.
// Re-querying alone was the whole bug — a different query bank that returns the
// same well-reviewed places in the same Bayesian order reads as "nothing
// changed", which is exactly what the owner kept seeing.
//
// Returns a delta on the /10 display scale (the same scale rankRows keys on, so
// these are commensurate with distanceDeduction). Deliberately small: a bucket
// preference should reorder near-ties and surface a different top three, never
// bury a 4.8 under a 4.2.
//
// morning -> quieter and closer.  night -> energy and open-late.
export function bucketWeight(row, ctx) {
  if (!ctx) return 0;
  const cat = coarseCat(row);
  const { lean } = venueLean(row);
  const b = ctx.timeBucket;
  let d = 0;

  if (b === "morning") {
    // Quieter: cafes and low-key places beat nightlife, which is mostly shut.
    if (cat === "Food") d += 0.5;
    if (cat === "Nightlife") d -= 1.5;
    if (cat === "Shopping") d -= 0.2;
    // Closer: the morning is the errand-radius bucket. This is ON TOP of any
    // per-page distancePenalty and applies even on pages that have none.
    if (Number.isFinite(row.distMi)) d -= Math.min(0.8, Math.max(0, (row.distMi - 8) * 0.03));
  } else if (b === "afternoon") {
    if (cat === "Activities") d += 0.5;
    if (cat === "Nightlife") d -= 0.8;
  } else {
    // Energy after dark.
    if (cat === "Nightlife") d += 1.0;
    if (cat === "Food") d += 0.4;
    if (cat === "Activities") d -= 0.4;
    if (cat === "Shopping") d -= 0.8;
  }
  // Weekend afternoons and evenings carry more appetite for a real outing.
  if (ctx.isWeekend && cat === "Activities" && b !== "morning") d += 0.3;
  if (lean === "outdoor" && ctx.outdoorOK && b !== "afternoon") d += 0.2;
  return d;
}

// ── Open now, and long enough to matter ─────────────────────────────────────
// Owner rule 4, second half: "Multiply everything by isOpenNow AND
// time-remaining-to-close — a museum shutting at 6 is a bad 5:45 pick."
//
// A MULTIPLIER, not an additive nudge, because "closed" is categorically
// different from "slightly worse" — no additive penalty small enough to be safe
// on unknown hours is large enough to bury a closed 4.9. Returns 0..1.
//
// UNKNOWN HOURS ARE NEVER PUNISHED (1.0). Google's coverage of regularOpeningHours
// is patchy, and a place with no hours on record is not evidence of a closed
// place — treating it as one would silently delete good rows in thin markets,
// which is the same mistake floor.maxPrice made before it excluded only rows
// with a KNOWN price above the cap.
export const CLOSING_SOON_MINS = 90;
export function openWeight(row, nowMs) {
  const st = businessStatus(row, nowMs);
  if (st.open === null) return 1;          // hours unknown -> no opinion
  if (st.open === false) return 0.35;      // closed: still visible, never on top
  const nt = st.nextTransition;
  if (!nt || nt.type !== "close") return 1; // open, and open-ended (24h)
  const mins = nt.inMinutes;
  if (mins >= CLOSING_SOON_MINS) return 1;
  // Linear fade over the last 90 minutes, floored at 0.4. At 15 minutes to
  // close a place is barely worth the drive; at 89 it is essentially fine.
  return 0.4 + 0.6 * (mins / CLOSING_SOON_MINS);
}

// ─── THE COMPOSITION LAW ────────────────────────────────────────────────────
// A LIST MUST BE WHAT ITS HEADING SAYS IT IS.
//
// THE BUG (owner, 2026-08-09, from his phone): "Worth the drive" — "the
// strictest list we run, day trips and landmarks that earn it" — was returning
// NINE RESTAURANTS. Measured live in Bradenton: Rocca, Beso, Armature Works,
// Dry Dock Waterfront Grill. "Hidden gems" was Food/Food/Food. "Big fun, small
// budget" was five restaurants. Five of the nine home sections were the same
// restaurant list wearing five different promises.
//
// WHY IT HAPPENS, and why no amount of query tuning fixes it: rankRows sorts by
// a Bayesian score over rating and REVIEW DEPTH. A restaurant carries thousands
// of reviews; a state park carries a few hundred. Put both in one pool and the
// restaurant wins every seat, every time, whatever the query asked for. The
// query bank was already right — worth-the-drive asks for "day trip",
// "iconic landmark", "state park springs" — and the ranking quietly overruled it.
//
// So the promise becomes a DECLARED CONSTRAINT that the ranker has to satisfy,
// not a hope about what the search returns:
//
//   sections       an allow-list. A heading that names a KIND of place admits
//                  only that kind. "Day trips and landmarks" is Activities.
//   maxPerSection  a share cap for headings that name a MOOD rather than a kind
//                  ("hidden gems", "perfect for tonight"). Those may mix — they
//                  may not be one category in a trench coat.
//
// Both live in INTENT_PAGES next to the copy that makes the promise, and both
// are enforced inside rankRows, so the card in the home rail and the card on the
// page it links to are ranked by the same rule. Two surfaces that disagree about
// one question is the bug class this repo keeps deleting.
//
// WHAT IS NEVER RELAXED. When a composed list comes back short, the ladder in
// IntentRail widens the radius and then lowers the review FLOOR. It never widens
// the KIND. A thin honest list is a smaller failure than a full dishonest one:
// the reader can forgive three day trips, and cannot forgive being told a
// steakhouse is a landmark.

/**
 * The section a row belongs to: "Food" | "Nightlife" | "Activities" | null.
 *
 * coarseCat, NOT primaryCategory — because coarseCat is what RailCard prints in
 * the eyebrow, and the cap has to count what the READER counts. Measured live
 * before this line: hidden-gems showed five cards labelled "Food" under a cap of
 * four, because primaryCategory read Aqua Tequila (bar + restaurant) as
 * Nightlife while the card above it said Food. A cap the reader can see broken
 * is worse than no cap: it makes the app look like it cannot count.
 */
export function sectionOfRow(r) {
  try { return coarseCat(r) || primaryCategory(r) || null; } catch (e) { return null; }
}

/** PURE. Does this row belong on this intent's list at all? */
export function sectionAllowed(r, compose) {
  const excluded = compose && Array.isArray(compose.excludeTypes) ? compose.excludeTypes : [];
  if (excluded.length) {
    const types = Array.isArray(r && r.types) ? r.types.map((t) => String(t || "").toLowerCase()) : [];
    if (types.some((t) => excluded.indexOf(t) > -1)) return false;
  }
  const allow = compose && Array.isArray(compose.sections) ? compose.sections : null;
  if (!allow || !allow.length) return true;
  const sec = sectionOfRow(r);
  // An UNCLASSIFIABLE row is refused by a list that names a kind. Google returns
  // plenty of rows whose types say nothing useful; admitting them is how the
  // restaurant crept back in the first place, one "point_of_interest" at a time.
  return !!sec && allow.indexOf(sec) > -1;
}

/**
 * PURE. Apply the share cap to an ALREADY-SORTED list, so the rows that survive
 * are the best of each section rather than the first N of the biggest one.
 */
export function capBySection(rows, compose) {
  const max = compose && Number(compose.maxPerSection) > 0 ? Number(compose.maxPerSection) : 0;
  if (!max) return Array.isArray(rows) ? rows : [];
  const count = {};
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const sec = sectionOfRow(r) || "?";
    const n = count[sec] || 0;
    if (n >= max) continue;
    count[sec] = n + 1;
    out.push(r);
  }
  return out;
}

/**
 * PURE. Choose which of an intent's queries to actually spend a Places call on.
 *
 * The rail runs a bounded number of queries per intent to keep Google billing
 * flat. It used to take the FIRST n of the bank — and at night worth-the-drive's
 * bank leads with { attractions } then { food: "destination restaurant dinner" },
 * so the second call bought a list the composition then had to throw away, while
 * the day-trip queries further down the bank never ran at all. Spend the calls
 * on queries whose category the list is allowed to show.
 */
export function composeQueries(bank, compose, n) {
  const all = Array.isArray(bank) ? bank.filter(Boolean) : [];
  const allow = compose && Array.isArray(compose.sections) ? compose.sections : null;
  const take = Number(n) > 0 ? Number(n) : all.length;
  if (!allow || !allow.length) return all.slice(0, take);
  const sectionOfCat = (cat) => CATEGORY_SECTION[String(cat || "").toLowerCase()] || null;
  const eligible = all.filter((q) => { const sec = sectionOfCat(q.cat); return sec && allow.indexOf(sec) > -1; });
  // Every query in the bank is off-list — a bank/composition mismatch, which is
  // an authoring bug. Spend the calls anyway rather than render an empty rail;
  // the row filter still holds the promise.
  return (eligible.length ? eligible : all).slice(0, take);
}

/** A stateful predicate form of capBySection, for use inside a filter chain. */
export function capBySectionGate(compose) {
  const max = compose && Number(compose.maxPerSection) > 0 ? Number(compose.maxPerSection) : 0;
  if (!max) return () => true;
  const count = {};
  return (r) => {
    const sec = sectionOfRow(r) || "?";
    const n = count[sec] || 0;
    if (n >= max) return false;
    count[sec] = n + 1;
    return true;
  };
}

export function rankRows(rows, floor, opts) {
  const seen = new Set();
  const seenBrand = new Set(); // owner (2026-07-22): one card per brand — three Melt N Dips is one Melt N Dip
  const brandKey = (r) => String(r.name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const origin = opts && opts.origin;
  const pen = opts && opts.penalty;
  // v6.72: the time/weather context. ABSENT ctx = the old pure-quality ranking,
  // unchanged — every existing caller and every existing test keeps its exact
  // behaviour, and the new behaviour is opt-in by passing ctx.
  const ctx = opts && opts.ctx ? opts.ctx : null;
  // v7.09 — the composition this list PROMISED. Absent = unconstrained, which is
  // every existing caller's exact previous behaviour.
  const compose = (opts && opts.compose) || null;
  const planAhead = !!(opts && opts.planAhead);
  // v7.09 — GOOGLE DOES NOT PRICE A STATE PARK. maxPrice excludes any row with
  // no price on record. That is right for a restaurant (an unknown price is not
  // evidence of a cheap one) and exactly backwards for the free outdoors: parks,
  // trails, springs and public beaches carry no priceLevel at all, so "Big fun,
  // small budget" was excluding the things that cost NOTHING and filling up with
  // cheap dinners instead. `floor.freeOutdoor` admits an unpriced row ONLY when
  // the app already classifies it as outdoors — evidence, not optimism.
  const pricePasses = (r, f) => {
    if (f.maxPrice == null) return true;
    if (r.priceLevel != null) return r.priceLevel <= f.maxPrice;
    if (!f.freeOutdoor) return false;
    try { return venueLean(r).lean === "outdoor"; } catch (e) { return false; }
  };
  const nowMs = opts && opts.nowMs != null ? opts.nowMs : undefined;
  const withDist = (rows || []).filter(Boolean).map((r) => {
    const d = origin && isFinite(r.lat) ? distMi(origin.lat, origin.lng, r.lat, r.lng) : null;
    return { ...r, distMi: d, deduction: pen && d != null ? distanceDeduction(d, pen) : 0 };
  });
  // v6.63 — THE BUG THE OWNER PHOTOGRAPHED (2026-08-08, a Parrish café list):
  // American Honey Creamery rendered at rank 1 showing 9.3, and Ryan's Coffee
  // House rendered at rank 2 showing 10.0. Both numbers were right; the order
  // was wrong. The key below used to be:
  //
  //   (bayes(rating,reviews)/5)*10 − r.deduction + (trending ? +0.6 : 0)
  //   then × openWeight, + conditions, + bucket
  //
  // which has NO creator-video term at all — so the +0.7 that made Ryan's a
  // 10.0 was invisible to this sort — and `r.deduction` is `distanceDeduction`,
  // the per-mile drive decay lib/wayfindScore.js explicitly retired ("it is
  // what put a shown 9.2 BELOW two shown 9.0s"), which pushed the farther
  // 10.0 down again.
  //
  // Now: the governed score (the number the card prints) is the primary key,
  // and the whole conditions composite — weather, daypart bucket, open-now —
  // survives ONLY as a tie-breaker between rows showing the same number. See
  // lib/lawfulOrder.js for why ties are the common case rather than the edge
  // case on a one-decimal scale.
  //
  // The weather GATE below is untouched: suppressing an outdoor row on a storm
  // day is a filter, not a reordering, and it still runs at full force.
  const ctxKey = (r) => {
    if (!ctx) return 0;
    const cond = conditionsAdjust(r, { weather: ctx.weather && ctx.weather.known ? { temp: ctx.weather.tempF, rain: ctx.weather.rainPct, wet: ctx.weather.isWet } : null, hour: ctx.hour, isWeekend: ctx.isWeekend }) / 10;
    // v7.09 — `planAhead` lists (worth-the-drive) are read to plan a future day,
    // so "closed right now" is not evidence against them. Every other term —
    // weather gate, conditions, daypart — still applies.
    return (cond + bucketWeight(r, ctx)) * (planAhead ? 1 : openWeight(r, nowMs));
  };
  return withDist
    // THE WEATHER GATE (owner rule 3). Outdoor categories are SUPPRESSED when
    // the gate is shut, not demoted — "a beach rec during a thunderstorm is the
    // same class as a Sarasota deal shown in Orlando". A demotion still shows
    // it, and on a short list a demoted row is often still on screen.
    //
    // This is the implementing predicate that makes the "indoors, because…"
    // half of nowSubline a true statement rather than a mood. Both read the
    // same ctx.outdoorOK; neither can drift from the other.
    //
    // `timeless` pages opt out (see /best-of). ctx absent = no gate.
    .filter((r) => {
      if (!ctx || ctx.outdoorOK) return true;
      const { lean, water } = venueLean(r);
      return !(water || lean === "outdoor");
    })
    // v6.60: maxPrice makes a price claim enforceable. A row with NO price from
    // Google is EXCLUDED when maxPrice is set — on a page that promises "$ and
    // $$ only", an unknown price is not evidence of a cheap place, and letting
    // unknowns through is exactly how /budget filled up with 22k-review
    // restaurants. Pages without maxPrice are unaffected.
    .filter((r) => r.rating >= floor.rating && r.reviews >= floor.reviews && (floor.maxReviews == null || r.reviews <= floor.maxReviews) && pricePasses(r, floor))
    // THE COMPOSITION LAW, section half: a heading that names a KIND of place
    // admits only that kind. See the block above rankRows for why the query bank
    // could never hold this line on its own.
    .filter((r) => sectionAllowed(r, compose))
    .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    // lawfulSort stamps governed_score on every row, which is also what
    // IconicPlaceCard reads back to draw the chip — one number, one derivation.
    .sort(lawfulComparator(ctxKey))
    .filter((r) => { const k = brandKey(r); if (seenBrand.has(k)) return false; seenBrand.add(k); return true; })
    // …and the share half. AFTER the sort, so what survives is the best of each
    // section rather than the first N of whichever one carries the most reviews.
    .filter(capBySectionGate(compose))
    .slice(0, 12);
}
