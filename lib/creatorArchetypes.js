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
// ── THE NETWORK IS SIX PEOPLE TODAY, NOT THIRTY-EIGHT ─────────────────────
// lib/creatorVideos.js names 38 handles, and that number is quoted as the size
// of the network. It is not. allCreators() only yields creators whose videos
// are renderable(), which requires a non-empty url, and the file holds 45
// entries / 59 creator lines against just 22 urls. libraryStats() states the
// live figure plainly: creatorCount 6, spotCount 22, cityCount 13.
//
// So the other 32 handles are seed rows for content that does not exist yet.
// Assigning them roles would be inventing identities for people whose work we
// are not showing — precisely the harm the brief warns about — so this file
// covers the six who are actually live and nobody else.
//
// ── NOTHING HERE RENDERS PUBLICLY YET, BY DESIGN ──────────────────────────
// Every assignment is `provisional: true`. These are claims about real named
// people, made by reading their captions, and a wrong one is damaging in public
// and worse in an outreach DM. archetypeFor() returns null for anything
// provisional, so the data model can ship, be reviewed and be corrected while
// the UI shows nothing. Flipping a single flag is what makes one visible.
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
  "cindy.selects": Object.freeze({
    archetype: "food_expert",
    provisional: true,
    evidence: "7 spots: 6 are coffee shops, cafés or bakeries (Spinning Coffee, Jabal, Dolce, Seek First, Ryan's, Joy). The 7th is an indoor sensory playroom, and two coffee captions mention toddler play areas — a real family signal, but not the through-line.",
  }),
  katelynintampa: Object.freeze({
    archetype: "food_expert",
    provisional: true,
    evidence: "5 spots, 5 food: tacos in a 1905 bank building, a Filipino-inspired menu, whole fried yellowtail snapper, a retro coffee shop, lunch omakase. No non-food post.",
  }),
  neverboredinorlando: Object.freeze({
    archetype: "experience_curator",
    provisional: true,
    evidence: "4 spots, none of them a straightforward restaurant: a 75-year-old drive-in, a self-driven mini-boat tour, cook-your-own pancakes inside a state park, and a 36-inch pizza attempt. Two involve food and neither is about the food.",
  }),
  "fashion.eat.travel": Object.freeze({
    archetype: "food_expert",
    provisional: true,
    evidence: "3 spots, 3 food: a Wynwood café, a Miami Spice tasting menu, a Brazilian steakhouse. Consistent, but a 3-post sample — lower confidence than the two above.",
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
