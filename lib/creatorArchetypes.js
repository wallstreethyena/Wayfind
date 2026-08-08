// lib/creatorArchetypes.js — the field that turns a list of handles into a
// network of voices: what each creator is FOR.
//
// Brand brief 2026-08-04, Part B. "You're not building a directory of places —
// you're building a network of trusted local voices, each with a different role
// in helping people experience their city."
//
// ── A ROLE THAT DOES NOT ROUTE IS A BADGE, AND BADGES ROT ──────────────────
// Every archetype below names the EXPERIENCES intents it feeds (the taxonomy
// lib/coupons.js and the mood rails already use: eatnow / brunch / nightout /
// datenight / familyfun / hiddengems / outdoors / cozyindoor). The role is a
// routing primitive first and a display label second. If it ever stops
// deciding where content surfaces, delete it rather than let it decorate.
//
// ── HOW BIG THE NETWORK ACTUALLY IS — RE-COUNTED 2026-08-07 ───────────────
// 15 creators, 170 spots. That is not the same claim as "15 handles appear in
// lib/creatorVideos.js": allCreators() only yields creators whose videos are
// renderable(), which requires a non-empty url, so seed rows with url:"" are
// correctly invisible here and always were. Re-derive from libraryStats()
// before quoting a number anywhere — the paragraph below is what the count
// looked like on 2026-08-04 and is kept because the REASONING still holds.
//
// ── (2026-08-04) THE NETWORK IS SIX PEOPLE TODAY, NOT THIRTY-EIGHT ─────────
// lib/creatorVideos.js names 38 handles, and that number is quoted as the size
// of the network. It is not. allCreators() only yields creators whose videos
// are renderable(), which requires a non-empty url, and the file holds 45
// entries / 59 creator lines against just 22 urls. libraryStats() states the
// live figure plainly: creatorCount 6, spotCount 22, cityCount 13.
//
// So the other 32 handles are seed rows for content that does not exist yet.
// Assigning them roles would be inventing identities for people whose work we
// are not showing — precisely the harm the brief warns about — so this file
// covers only creators who are actually live. That rule is unchanged; the
// number it applies to has grown to 15.
//
// ── NOTHING HERE RENDERS PUBLICLY YET, BY DESIGN ──────────────────────────
// Every assignment is `provisional: true`. These are claims about real named
// people, made by reading their captions, and a wrong one is damaging in public
// and worse in an outreach DM. archetypeFor() returns null for anything
// provisional, so the data model can ship, be reviewed and be corrected while
// the UI shows nothing. Flipping a single flag is what makes one visible.
//
// ── CONFIRMED 2026-08-05 BY THE OWNER ─────────────────────────────────────
// The four ASSIGNED creators below are confirmed and now resolve publicly.
// theerynlalonde and thefloridaqueenie_ stay unassigned: confirmation does not
// manufacture evidence, and one post is still not a pattern.
//
// Confirming makes the data live; it does not make anything VISIBLE. No surface
// reads archetypeFor() yet — that is B3, and it is separate work.
//
// ── 2026-08-07: SOMETHING FINALLY READS IT ────────────────────────────────
// The line above stopped being true. Owner asked for "the vibe for each of
// these influencers — a little line that tells what the lists they have are
// known for," which is exactly what `summary` is, so SocialFind.js now renders
// summaryFor() on every creator card. archetypeFor() is still unread and still
// B3; only the summary went live. A provisional row still renders NOTHING, so
// the gate that made this safe to ship early is the same gate protecting it now.
//
// Removal is a first-class state, not a deletion: set `removed: true` and the
// row stays as a record that the creator asked to be un-roled, so a future
// re-derivation cannot silently re-add them.

import { CONCEPTS } from "./experienceConcepts.js";

/**
 * The roles, each in the creator's own language, each routing somewhere real.
 * `identity` is written to be said TO them ("you help people find unforgettable
 * meals"), because the outreach kit reinforces identity rather than praising a
 * post. `line` is the third-person version for their card.
 */
export const ARCHETYPES = Object.freeze({
  food_expert: Object.freeze({
    label: "Food Expert",
    identity: "you help people find unforgettable meals",
    line: "finds the meals worth the drive",
    intents: Object.freeze(["eatnow", "brunch"]),
  }),
  night_scene: Object.freeze({
    label: "Night Out",
    identity: "you know where the night actually goes",
    line: "knows where the night actually goes",
    intents: Object.freeze(["nightout", "datenight"]),
  }),
  family_creator: Object.freeze({
    label: "Family Creator",
    identity: "you help families make memories",
    line: "finds the places that work with kids in tow",
    intents: Object.freeze(["familyfun"]),
  }),
  experience_curator: Object.freeze({
    label: "Experience Curator",
    identity: "you uncover things most people never find",
    line: "uncovers the places most people drive past",
    intents: Object.freeze(["hiddengems", "outdoors"]),
  }),
  travel_guide: Object.freeze({
    label: "Travel Guide",
    identity: "you make people want to visit",
    line: "makes people want to visit",
    intents: Object.freeze([]),          // cross-intent, city-level
  }),
  community_voice: Object.freeze({
    label: "Community Voice",
    identity: "you make your city stronger",
    line: "makes this city stronger",
    intents: Object.freeze([]),          // cross-intent, city-level
  }),
  lifestyle_creator: Object.freeze({
    label: "Lifestyle Creator",
    identity: "you create a feeling",
    line: "captures how a place actually feels",
    intents: Object.freeze([]),          // cross-intent, visual surfaces
  }),
});

export const ARCHETYPE_KEYS = Object.freeze(Object.keys(ARCHETYPES));

/**
 * DRAFT assignments, derived from each creator's own curated spots and captions
 * in lib/creatorVideos.js — never from the handle. `historical.cheese` is not
 * self-evidently a food account, and none of these were guessed that way.
 *
 * `evidence` records what the call was made on, so a reviewer can check it
 * without re-reading the corpus and a wrong one is arguable rather than opaque.
 *
 * ONE PRIMARY ROLE, no secondary. With 1–7 spots per creator a secondary role
 * is over-fitting a handful of posts; the routing already falls back to the
 * VIDEO's own place when a post sits outside its creator's role, which is the
 * honest way to handle a food creator's occasional beach day.
 */
export const ASSIGNMENTS = Object.freeze({
  // ── 2026-08-07 — three creators added the same day their spots were curated ──
  // Owner asked for "the vibe for each of these influencers, a little line that
  // tells what the lists that they have are known for." That is exactly what
  // `summary` has always been, so these are rows here rather than a second
  // parallel file — and the same day, SocialFind.js started RENDERING
  // summaryFor(), which closes the "nothing reads this yet" gap the header of
  // this file has carried since B3 was deferred.
  //
  // Each evidence line below was written after reading ALL of that creator's
  // supplied posts end to end, not after skimming the venue names. They are
  // non-provisional because the pattern is unambiguous at 35, 21 and 9 spots
  // respectively — the opposite of theerynlalonde and thefloridaqueenie_, who
  // stay unassigned at one post each because one post is still not a pattern.
  stufftodointampabay: Object.freeze({
    summary: "Answers the question the app is named for: what is there to DO in Tampa Bay this week — glassblowing, needlepoint, aerial arts, bookstores and arcades as readily as a bakery.",
    archetype: "experience_curator",
    provisional: false,
    evidence: "23 spots and the widest CATEGORY spread of any creator in the library: 11 food, but also a glassblowing studio, a needlepoint shop, an aerial-arts gym, a pottery wheel, two bookstores, a craft cafe, an arcade and a clothing store. The framing is consistently an activity rather than a meal — 'looking for a unique indoor activity', 'a summer outing that is budget friendly'. Two of the spots corroborate places @tampaiman found independently.",
  }),
  tampaiman: Object.freeze({
    summary: "Finds halal Tampa Bay before anyone else — Yemeni and Palestinian coffee houses, Levantine grills, Korean and Thai openings — and posts the address and the hours with it.",
    archetype: "food_expert",
    provisional: false,
    evidence: "35 spots, 34 of them food. The through-line is not a cuisine, it is BEING FIRST: 'Tampa's first', 'Tampa's newest' or a pre-opening visit appears in 19 of the captions. Halal is the second axis (16 captions say so explicitly). Ownership is named constantly — Palestinian, Lebanese, Syrian, Yemeni, Cuban, Thai, Bangladeshi. The one non-restaurant is a food market. Captions routinely carry the full street address and opening hours, which is why so many of these entries could be curated with a real address.",
  }),
  _adatewithkait: Object.freeze({
    summary: "Plans the night out in Orlando — omakase counters, tasting menus and cocktail rooms, with a spa day, a pottery studio or a live game show when dinner is not the point.",
    archetype: "experience_curator",
    provisional: false,
    evidence: "21 spots. 14 are restaurants, which on its own would read food_expert — but the selection is by OCCASION, not by cuisine: an 18-course omakase, a three-course prix fixe, a happy hour, a bottomless brunch. The remaining 7 settle it: a day spa, a paint-your-own pottery studio, a live team-vs-team game show, a themed afternoon-tea bus ride, a padel-and-food club. 'Date night' or 'girls' day' appears in the caption of 9 of them.",
  }),
  magicalmaddieb: Object.freeze({
    summary: "Reads the Orlando theme parks from the inside — after-hours events, water parks and resort stays, and whether the upcharge ticket is actually worth it.",
    archetype: "travel_guide",
    provisional: false,
    evidence: "9 spots. 5 are theme or water parks (Volcano Bay, Epic Universe, Aquatica, Dollywood's Splash Country) plus a resort with its own water park; 4 of those 5 are specifically about an AFTER-HOURS or upcharge event, and one caption asks outright 'let's see if it's worth the ticket price?'. The remaining spots orbit the same trip: a Disney Springs slice, a nail salon, a head spa. Cross-intent and city-level, which is what travel_guide is for — she is not ranking meals, she is telling you how to spend a park day.",
  }),

  "cindy.selects": Object.freeze({
    summary: "Lives in the cafe end of Bradenton and Sarasota — coffee, pastry, slow mornings, and the rare spot that works with a toddler in tow.",
    archetype: "food_expert",
    provisional: false,
    evidence: "7 spots: 6 are coffee shops, cafés or bakeries (Spinning Coffee, Jabal, Dolce, Seek First, Ryan's, Joy). The 7th is an indoor sensory playroom, and two coffee captions mention toddler play areas — a real family signal, but not the through-line.",
  }),
  katelynintampa: Object.freeze({
    summary: "Eats her way through Tampa's neighbourhood restaurants — tacos in a 1905 bank, whole fried snapper, lunch omakase. Go to her for the room locals already know.",
    archetype: "food_expert",
    provisional: false,
    evidence: "5 spots, 5 food: tacos in a 1905 bank building, a Filipino-inspired menu, whole fried yellowtail snapper, a retro coffee shop, lunch omakase. No non-food post.",
  }),
  neverboredinorlando: Object.freeze({
    summary: "Plans the day, not the meal. Drive-in theatres, self-driven boat tours, cook-your-own pancakes in a state park — Central Florida day trips you would not think of.",
    archetype: "experience_curator",
    provisional: false,
    evidence: "4 spots, none of them a straightforward restaurant: a 75-year-old drive-in, a self-driven mini-boat tour, cook-your-own pancakes inside a state park, and a 36-inch pizza attempt. Two involve food and neither is about the food.",
  }),
  "fashion.eat.travel": Object.freeze({
    summary: "Miami dining with a polished eye — Wynwood cafes, tasting menus, a Brazilian steakhouse spread.",
    archetype: "food_expert",
    provisional: false,
    evidence: "3 spots, 3 food: a Wynwood café, a Miami Spice tasting menu, a Brazilian steakhouse. Consistent, but a 3-post sample — lower confidence than the two above.",
  }),
  alexandramartin_tv: Object.freeze({
    summary: "Hunts the hole-in-the-wall end of South Florida — food trucks, walk-up windows, family kitchens open forty years, a Sunday temple market. Go to her for the place you have driven past a hundred times.",
    archetype: "food_expert",
    provisional: false,
    evidence: "20 spots, the largest sample of any creator here, and 18 are straightforwardly food: fried chicken, a Peruvian sandwich counter, carbonara, ramen, a Colombian cafeteria of 39 years, a rooftop brunch, a Jamaican truck, a tres leches factory, a Little Havana sourdough window, pan con bistec, chicharrones. The two that are not (a Turkish hammam, and a Buddhist temple whose draw in her reel is the Sunday Thai food market) do not shift the through-line. Confirmed, not provisional, because 18/20 is not a close call.",
  }),
  secretsoftampabay: Object.freeze({
    summary: "First through the door at Tampa Bay's new rooms, and drawn to the polished end of them: rooftops, hotel dining rooms, tasting menus, opening nights. Go to her for date night and for what opened last month.",
    archetype: "experience_curator",
    provisional: false,
    evidence: "20 spots. Almost every one is a NEW opening, a refresh, or a one-night menu rather than a standing recommendation — Tommy's Chophouse before it opened, Rio Izakaya's soft opening, O-Ku's first week, 1983 pre-open, a White Lotus tasting dinner, a fall-decor afternoon at Hyde Park Village, two years of one food festival. Food is the subject but timing is the through-line, which is experience_curator rather than food_expert: what she is actually expert in is what is happening in Tampa Bay this month.",
  }),
  // 2026-08-08 batch.
  manateelittlelocals: Object.freeze({
    summary: "Manatee and Sarasota with two small kids in tow — free parks and libraries, indoor escapes from the heat, museums with resident-free weekends, and the occasional animal experience worth the drive.",
    archetype: "family_creator",
    provisional: false,
    evidence: "11 curated spots. Every one is chosen through the same lens — will this work with young children, and what does it cost: a fenced park behind the Target on SR-64, the children's wing of a library, an indoor play space billed as an escape from the heat, free-admission weekends at the Bishop. The two out-of-county entries (Capybara Cafe in St. Pete, Hogan's Place in Gibsonton) are day trips, which is the same lens at a longer range. family_creator is the honest fit; travel_guide would overstate the geography and food_expert is simply not what the account is.",
  }),
  parrishfloridahomes: Object.freeze({
    summary: "A Parrish realtor posting the town's own small businesses.",
    archetype: null,
    provisional: true,
    evidence: "1 spot (a farm on Golf Course Rd). Insufficient evidence for a role, and the account's primary business is real estate rather than local discovery — which is worth reading carefully before assigning one, since a realtor's incentive to feature a place is not the same as a guide's. Revisit with a body of posts.",
  }),
  lifeinparrish: Object.freeze({
    summary: "Covers Parrish itself, one local business at a time.",
    archetype: null,
    provisional: true,
    evidence: "1 spot (a 42-year-old sandwich counter on US-301). Insufficient evidence for a role, and the account is small. The owner reports a partnership is agreed; revisit once there is a body of posts to read rather than assigning a role to a partner as a courtesy.",
  }),
  influencetampa: Object.freeze({
    summary: "A city guide to Tampa Bay rather than a food account — the dessert room at Bern's, waterfront seafood, a new coffee shop, the 1912 bakery, a gift shop worth the drive up Dale Mabry, plus a round-up of what is on each month. Go to her to plan a weekend, not just a meal.",
    archetype: "travel_guide",
    provisional: false,
    evidence: "11 curated spots plus monthly Tampa Bay event round-ups. Food is the majority (8 of 11) but the rest are a gift shop, a hotel and a dinner-and-a-show room, and the round-up posts cover festivals, concerts and markets across the whole bay. travel_guide is the cross-intent, city-level role and is the honest fit; food_expert would be true of most individual posts and wrong about the account.",
  }),
  tampaterrencee: Object.freeze({
    summary: "Goes where the crowd is, and the crowd follows. Oversized food and loud rooms — a 64oz Bloody Mary on the John's Pass boardwalk, one of the largest pizzas in the country, all-you-can-eat crab, Ybor wings. Go to him for the thing you will film, not the quiet dinner.",
    archetype: "lifestyle_creator",
    provisional: false,
    evidence: "21 posts, and the shape matters more than the count: only 11 name a venue at all. The rest are a packed bar, two concerts, a sunset, a DJ set, a flood barrier — moments, not recommendations. Where he does name a place it skews to spectacle food and nightlife rather than a cuisine or a neighbourhood. lifestyle_creator (\"captures how a place actually feels\") is the honest read; food_expert would claim a curatorial intent the corpus does not show.",
  }),
  // TWO LIVE CREATORS ARE DELIBERATELY UNASSIGNED. One post is not a pattern,
  // and a role invented from a single visit is exactly the wrong-label harm the
  // brief calls out. They render no role until there is more to read or they
  // tell us themselves.
  theerynlalonde: Object.freeze({
    archetype: null,
    provisional: true,
    evidence: "1 spot (an infrared-sauna session). Insufficient evidence — a single wellness post does not establish a role.",
  }),
  thefloridaqueenie_: Object.freeze({
    archetype: null,
    provisional: true,
    evidence: "1 spot (Marie Selby Botanical Gardens). Insufficient evidence.",
  }),
});

const norm = (h) => String(h || "").trim().toLowerCase();

/**
 * The PUBLIC role for a handle, or null.
 *
 * Returns null for: an unknown creator, an unassigned one, a removed one, and
 * — critically — anything still `provisional`. Every assignment is provisional
 * today, so this returns null for all six on purpose: the model ships, the UI
 * shows nothing, and confirmation is a one-flag change per creator.
 *
 * Callers render NOTHING on null. Never a default label, never "Creator" —
 * the house pattern is that a missing value renders nothing at all.
 */
/**
 * A short, public description of what a creator is known for, or null.
 *
 * v6.96 (owner: "we need to summarize each influencer to tell our user what
 * type of experiences this influencer is known for"). Same safety rule as
 * archetypeFor(): these are claims about real named people, written from
 * reading their own curated spots, so a PROVISIONAL or removed creator returns
 * null and the UI renders nothing rather than a guess or a default.
 *
 * A summary can exist WITHOUT an archetype resolving (the two answer different
 * questions — "what are they known for" vs "which intents do they feed"), but
 * it obeys the same provisional gate.
 */
export function summaryFor(handle) {
  const row = ASSIGNMENTS[norm(handle)] || ASSIGNMENTS[String(handle || "").trim()];
  if (!row || row.removed || row.provisional) return null;
  return typeof row.summary === "string" && row.summary.trim() ? row.summary : null;
}

export function archetypeFor(handle) {
  return resolveRole(ASSIGNMENTS[norm(handle)] || ASSIGNMENTS[String(handle || "").trim()]);
}

/**
 * PURE, and exported for one specific reason: while EVERY assignment is
 * provisional, archetypeFor() returns null for all of them — so an assertion
 * that "an unassigned creator renders nothing" passes for the WRONG REASON
 * (provisional, not unassigned) and cannot see a default-label regression at
 * all. A mutation adding `|| ARCHETYPES.lifestyle_creator` was caught by
 * nothing until this was split out.
 *
 * Testing this directly with { archetype: null, provisional: false } exercises
 * the unassigned branch that the provisional gate otherwise hides.
 */
export function resolveRole(row) {
  if (!row || row.removed || row.provisional || !row.archetype) return null;
  const a = ARCHETYPES[row.archetype];
  return a ? { key: row.archetype, ...a } : null;
}

/** The draft assignment INCLUDING provisional ones — review tooling only. */
export function draftArchetypeFor(handle) {
  const row = ASSIGNMENTS[norm(handle)] || ASSIGNMENTS[String(handle || "").trim()];
  if (!row || row.removed) return null;
  return { ...row, archetypeLabel: row.archetype ? ARCHETYPES[row.archetype].label : null };
}

/** Confirmed creators whose role feeds `intent`. Empty until something is confirmed. */
export function creatorsForIntent(intent) {
  const want = String(intent || "").trim();
  if (!want) return [];
  return Object.keys(ASSIGNMENTS).filter((h) => {
    const a = archetypeFor(h);
    return !!a && a.intents.includes(want);
  });
}

/** Every intent any archetype routes to — used by the guard to prove they are real. */
export function routedIntents() {
  const out = new Set();
  for (const k of ARCHETYPE_KEYS) for (const i of ARCHETYPES[k].intents) out.add(i);
  return [...out];
}

// Concepts and archetypes are different axes and must not be confused: a
// CONCEPT classifies a Viator product by title, an ARCHETYPE classifies a
// person by their body of work. Imported only so the guard can assert the two
// vocabularies stay distinct rather than drifting into one another.
export const CONCEPT_KEYS_FOR_GUARD = Object.freeze(Object.keys(CONCEPTS));
