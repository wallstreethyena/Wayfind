// lib/trendMatch.js — deciding whether a qualified topic actually describes a
// real place already in wf_inventory.
//
// A TREND NEVER BECOMES A CARD. It becomes, at most, a reason to reorder a place
// that was already eligible. So this module's whole job is to refuse.
//
// THE MATCH THAT MUST NOT HAPPEN. "Natural wine" is a real rising concept, and a
// restaurant is a real place, and the two share a word. Matching them produces a
// card that tells a user this restaurant is a natural-wine destination when
// nothing in our data says it pours a single bottle. The user drives there. That
// is the failure — not a bad ranking, a false claim about a real business.
//
// SO: NEITHER A NAME NOR A VENUE TYPE IS SUFFICIENT. A place called "Natural Wine
// Co." is suggestive and proves nothing; a place Google types as `wine_bar` is
// the right SHAPE and still proves nothing about natural wine. Both caps are
// arithmetic, not comments — see NAME_ONLY_CEILING and the concept-specific
// evidence rule at the foot of matchConcept().
//
// What CLOSES a match is evidence that names the concept: a discriminating
// Wayfind tag, a VERIFIED editorial fact, or a VERIFIED editorial hook — things
// a human or a pipeline asserted about this venue, not a coincidence of spelling
// or a category that happens to be broad enough to contain the idea.
//
// Every verdict, accept or reject, carries its evidence and its reason. A match
// nobody can explain afterwards is a match nobody can audit.

import { CONCEPTS, normalizeTopic } from "./trendTaxonomy.js";

/**
 * Evidence weights. These are ADDITIVE up to a cap, and the ordering of their
 * magnitudes is the doctrine: a Google primaryType is the single strongest
 * machine signal, a verified editorial fact is the strongest human one, and a
 * name is worth almost nothing on its own.
 */
export const EVIDENCE_WEIGHTS = {
  primaryType: 0.45,      // Google's own strongest single classification
  editorialFact: 0.45,    // a VERIFIED atlas fact naming the concept
  tag: 0.30,              // Wayfind controlled tag / cuisine id
  secondaryType: 0.15,    // concept appears in google_types but not primaryType
  editorialHook: 0.15,    // the verified hook mentions it (weaker: prose, not a fact)
  name: 0.10,             // the venue name contains the concept — suggestive only
};

/**
 * The most a match can score from evidence that is not structured. A venue whose
 * ONLY evidence is its name and a loose secondary type tops out here — below
 * every concept's evidenceFloor, by construction. NAME_ONLY_CEILING is what
 * makes "do not match on venue name alone" a property of the arithmetic rather
 * than a comment.
 */
export const NAME_ONLY_CEILING = 0.25;

/** Google content older than this is not fresh enough to match on (Places ToS: 30d). */
export const MAX_CONTENT_AGE_DAYS = 30;

/**
 * Machine-readable rejection codes.
 *
 * Callers key on these, NEVER on the prose in `reason`. The prose is for humans
 * and is expected to change; a gap classifier that regexes it is one wording
 * tweak away from silently misrouting every rejection (CLAUDE.md — "assert the
 * invariant, not the string").
 */
export const MATCH_CODES = {
  OK: "ok",
  NO_CONCEPT: "no_concept",
  NO_PLACE_ID: "no_place_id",
  WRONG_METRO: "wrong_metro",
  NO_COORDS: "no_coords",
  NOT_OPERATIONAL: "not_operational",
  WRONG_CATEGORY: "wrong_category",
  DENIED_TYPE: "denied_type",
  STALE_CONTENT: "stale_content",
  NO_FRESHNESS: "no_freshness",
  NO_EVIDENCE: "no_evidence",
  // The venue is plausibly the right SHAPE (right category, right Google type)
  // but nothing says it actually offers THIS concept. This is the code that
  // separates "we own the venue and under-describe it" from "we do not have one".
  NO_SPECIFIC_EVIDENCE: "no_specific_evidence",
  BELOW_FLOOR: "below_floor",
};

const arr = (v) => (Array.isArray(v) ? v : []);
const norm = (s) => normalizeTopic(s);

/** Does a normalised haystack contain the needle as whole words? */
function containsPhrase(haystack, needle) {
  const h = norm(haystack), n = norm(needle);
  if (!h || !n) return false;
  return new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(h);
}

/**
 * Judge one (concept, place) pair.
 *
 * `place` is a wf_inventory row plus optional joined editorial:
 *   { place_id, name, category, metro, google_types[], primary_type, tags[],
 *     status, lat, lng, refreshed_at, signals{}, editorial?{ hook, facts[], verified } }
 *
 * Returns { matched, confidence, evidence[], reason }. `reason` is always set.
 */
export function matchConcept(conceptKey, place, opts) {
  const c = CONCEPTS[conceptKey];
  const { metro, nowMs = Date.now() } = opts || {};
  if (!c) return { matched: false, code: MATCH_CODES.NO_CONCEPT, confidence: 0, evidence: [], reason: `"${conceptKey}" is not a declared concept` };
  if (!place) return { matched: false, code: MATCH_CODES.NO_CONCEPT, confidence: 0, evidence: [], reason: "no place" };

  // ── HARD GATES. Each returns a DISTINCT reason, because "rejected" collapses
  //    four different operational problems into one useless number in a report.

  // A row without a real Google Place ID cannot be reconciled, deduped or linked.
  if (!place.place_id || typeof place.place_id !== "string" || place.place_id.length < 6) {
    return { matched: false, code: MATCH_CODES.NO_PLACE_ID, confidence: 0, evidence: [], reason: "no valid Google Place ID" };
  }
  // AGENTS.md §12 — a wrong-city result is worse than no result.
  if (metro && place.metro && place.metro !== metro) {
    return { matched: false, code: MATCH_CODES.WRONG_METRO, confidence: 0, evidence: [], reason: `wrong metro: place is in "${place.metro}", matching for "${metro}"` };
  }
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
    return { matched: false, code: MATCH_CODES.NO_COORDS, confidence: 0, evidence: [], reason: "place has no usable coordinates" };
  }
  // A closed business must never be boosted onto a surface.
  const status = String(place.status || "").toUpperCase();
  if (status && status !== "OPERATIONAL") {
    return { matched: false, code: MATCH_CODES.NOT_OPERATIONAL, confidence: 0, evidence: [], reason: `business status is ${status}, not OPERATIONAL` };
  }
  if (!c.categories.includes(place.category)) {
    return { matched: false, code: MATCH_CODES.WRONG_CATEGORY, confidence: 0, evidence: [], reason: `category "${place.category}" is not one of ${c.categories.join("/")} for concept "${conceptKey}"` };
  }

  const types = arr(place.google_types).map(norm);
  const primary = norm(place.primary_type);

  // A disqualifying type vetoes regardless of what else matched — this is what
  // keeps a sporting-goods store out of "pickleball" and a beach out of a
  // bookable kayak tour (AGENTS.md §8).
  const denied = c.denyTypes.map(norm).filter((d) => d === primary || types.includes(d));
  if (denied.length) {
    return { matched: false, code: MATCH_CODES.DENIED_TYPE, confidence: 0, evidence: [], reason: `disqualifying place type(s): ${denied.join(", ")}` };
  }

  // Google content freshness. Stale content means the types/status/price we are
  // judging on may no longer be true, and per Places ToS we should not be
  // holding it anyway.
  const refreshed = Date.parse(place.refreshed_at || place.last_verified_at || "");
  if (Number.isFinite(refreshed)) {
    const ageDays = (nowMs - refreshed) / 86400000;
    if (ageDays > MAX_CONTENT_AGE_DAYS) {
      return { matched: false, code: MATCH_CODES.STALE_CONTENT, confidence: 0, evidence: [], reason: `Google content is ${ageDays.toFixed(0)}d old, past the ${MAX_CONTENT_AGE_DAYS}d freshness limit` };
    }
  } else {
    return { matched: false, code: MATCH_CODES.NO_FRESHNESS, confidence: 0, evidence: [], reason: "place has no content-refresh timestamp — freshness cannot be established" };
  }

  // ── POSITIVE EVIDENCE ────────────────────────────────────────────────────
  const evidence = [];
  let score = 0;
  const add = (kind, detail) => { evidence.push({ kind, detail, weight: EVIDENCE_WEIGHTS[kind] }); score += EVIDENCE_WEIGHTS[kind]; };

  if (primary && c.primaryTypes.map(norm).includes(primary)) add("primaryType", place.primary_type);

  const secondary = c.types.map(norm).filter((t) => types.includes(t) && t !== primary);
  if (secondary.length) add("secondaryType", secondary.join(", "));

  const tags = arr(place.tags).map(norm);
  const tagHits = c.tagEvidence.map(norm).filter((t) => tags.includes(t));
  if (tagHits.length) add("tag", tagHits.join(", "));

  // VERIFIED editorial only. An unverified atlas row is a draft — treating a
  // draft as evidence would let an unreviewed model output justify a match.
  const ed = place.editorial;
  if (ed && ed.verified === true) {
    const factHit = arr(ed.facts).find((f) => c.aliases.some((a) => containsPhrase(f && f.claim, a)));
    if (factHit) add("editorialFact", String(factHit.claim).slice(0, 120));
    else if (c.aliases.some((a) => containsPhrase(ed.hook, a))) add("editorialHook", String(ed.hook).slice(0, 120));
  }

  const nameHit = c.aliases.find((a) => containsPhrase(place.name, a));
  if (nameHit) add("name", place.name);

  if (!evidence.length) {
    return { matched: false, code: MATCH_CODES.NO_EVIDENCE, confidence: 0, evidence: [], reason: `no evidence linking "${conceptKey}" to this place` };
  }

  // ── THE CONCEPT-SPECIFIC EVIDENCE RULE ───────────────────────────────────
  //
  // Google has no "Korean coffee" type. It has `coffee_shop`. It has no
  // "pickleball" type either — it has `sports_complex`. EVERY concept in this
  // taxonomy is narrower than any Google type that could describe it, so type
  // evidence establishes the venue SHAPE and can never, on its own, establish
  // the CONCEPT.
  //
  // This was found by running the pipeline rather than reading it: "Bayshore
  // Coffee Roasters", a fixture written specifically as a negative control for
  // korean_coffee, matched at 0.90 confidence. Its tags were `coffee` and
  // `cafe`, both of which sat in the concept's evidence list, so the venue's own
  // type vouched for a cuisine nobody had ever asserted it served. Narrowing the
  // tag lists to discriminators fixed that instance; this rule fixes the CLASS,
  // because primaryType + secondaryType alone still reached exactly the 0.60
  // floor without one word of evidence about Korea.
  //
  // So a match requires at least one piece of evidence that names THIS concept:
  //   · a discriminating Wayfind tag           (someone classified it)
  //   · a VERIFIED editorial fact              (someone sourced it)
  //   · a VERIFIED editorial hook              (someone wrote it, verified)
  //
  // A venue NAME is deliberately not on that list. "The Listening Bar" is an
  // exact alias hit and proves nothing — which is the whole content of "do not
  // match on venue name alone", now enforced by arithmetic rather than comment.
  const SPECIFIC = ["tag", "editorialFact", "editorialHook"];
  const specific = evidence.filter((e) => SPECIFIC.includes(e.kind));
  const structural = evidence.some((e) => e.kind === "primaryType" || e.kind === "tag" || e.kind === "editorialFact");
  const confidence = structural ? Math.min(1, score) : Math.min(NAME_ONLY_CEILING, score);

  if (!specific.length) {
    return {
      matched: false, code: MATCH_CODES.NO_SPECIFIC_EVIDENCE, confidence, evidence,
      reason:
        `evidence (${evidence.map((e) => e.kind).join(", ")}) establishes the venue type but nothing names "${conceptKey}" — ` +
        `a ${place.primary_type || "venue"} is the right shape, not proof it offers this`,
    };
  }
  if (confidence < c.evidenceFloor) {
    return {
      matched: false, code: MATCH_CODES.BELOW_FLOOR, confidence, evidence,
      reason: `confidence ${confidence.toFixed(2)} is below the ${c.evidenceFloor} floor for "${conceptKey}" (evidence: ${evidence.map((e) => e.kind).join(", ")})`,
    };
  }

  return {
    matched: true, code: MATCH_CODES.OK, confidence, evidence,
    reason: `${evidence.map((e) => `${e.kind}=${e.detail}`).join("; ")} → confidence ${confidence.toFixed(2)} ≥ floor ${c.evidenceFloor}`,
  };
}

/**
 * Match one qualified topic against a pool of inventory rows.
 *
 * Returns matches sorted by confidence, AND every rejection with its reason —
 * the rejections are what the gap report reads to tell "no venue exists here"
 * apart from "a venue exists but is unclassified", which need opposite fixes.
 */
export function matchTopicToInventory(conceptKey, places, opts) {
  const matches = [], rejections = [];
  for (const p of places || []) {
    const v = matchConcept(conceptKey, p, opts);
    if (v.matched) matches.push({ place_id: p.place_id, name: p.name, ...v });
    else rejections.push({ place_id: p.place_id || null, name: p.name || null, code: v.code, reason: v.reason, confidence: v.confidence, evidence: v.evidence || [] });
  }
  matches.sort((a, b) => b.confidence - a.confidence);
  return { conceptKey, matches, rejections };
}

/** Gap classifications — mutually exclusive, each implying a different remedy. */
export const GAP_KINDS = {
  NO_LOCAL_VENUE: "no local venue is likely — nothing in inventory is even the right category",
  INVENTORY_COVERAGE: "a local venue may exist but inventory lacks coverage — candidate for Google discovery",
  NEEDS_CLASSIFICATION: "candidate places exist but lack the classification to prove the match — reclassify, do not search",
  NEEDS_EDITORIAL: "a place may match but needs editorial verification before it can carry the concept",
  TOO_ABSTRACT: "topic is too abstract or product-oriented to become a place query",
  GEO_INAPPROPRIATE: "topic is geographically inappropriate for this metro",
  NEEDS_APPROVAL: "query requires owner approval before any metered search",
};

/**
 * Classify why a qualified topic produced no match. This decides whether we
 * SPEND MONEY (discovery) or fix data we already have (reclassify), so getting
 * it wrong is expensive in both directions: searching Google for a concept whose
 * venue we already own but mislabelled burns quota to rediscover our own row.
 */
export function classifyGap(conceptKey, matchResult, opts) {
  const { metro, inventoryCount = 0 } = opts || {};
  const c = CONCEPTS[conceptKey];
  const rej = matchResult.rejections || [];

  if (!c) return { kind: "TOO_ABSTRACT", detail: GAP_KINDS.TOO_ABSTRACT, conceptKey, metro };

  // A NEAR MISS is a place that produced concept-specific evidence and still
  // fell short of the floor — i.e. we own the venue and are under-describing it.
  // Searching Google here would spend quota rediscovering our own row.
  //
  // NO_SPECIFIC_EVIDENCE is deliberately NOT a near miss: a museum scoring 0.60
  // against "bioluminescent kayaking" purely on `tourist_attraction` is not a
  // kayak operator we mislabelled, and treating it as one would suppress the
  // discovery search that gap actually needs. Keyed on the CODE so a reworded
  // message cannot silently reclassify every gap in the system.
  const nearMisses = rej.filter((r) => r.code === MATCH_CODES.BELOW_FLOOR);
  if (nearMisses.length) {
    return {
      kind: "NEEDS_CLASSIFICATION", detail: GAP_KINDS.NEEDS_CLASSIFICATION, conceptKey, metro,
      candidates: nearMisses.slice(0, 10).map((r) => ({ place_id: r.place_id, name: r.name, confidence: r.confidence })),
    };
  }
  const editorialBlocked = rej.filter((r) => r.code === MATCH_CODES.NO_SPECIFIC_EVIDENCE &&
    Array.isArray(r.evidence) && r.evidence.some((e) => e.kind === "primaryType"));
  if (editorialBlocked.length) {
    return { kind: "NEEDS_EDITORIAL", detail: GAP_KINDS.NEEDS_EDITORIAL, conceptKey, metro, candidates: editorialBlocked.slice(0, 10) };
  }
  // Nothing in the right category at all in a metro we DO have inventory for →
  // a genuine coverage hole, and the only case that justifies a metered search.
  const rightCategory = rej.filter((r) => r.code !== MATCH_CODES.WRONG_CATEGORY && r.code !== MATCH_CODES.WRONG_METRO);
  if (inventoryCount > 0 && !rightCategory.length) {
    return { kind: "INVENTORY_COVERAGE", detail: GAP_KINDS.INVENTORY_COVERAGE, conceptKey, metro, searchable: true };
  }
  if (inventoryCount === 0) {
    return { kind: "NO_LOCAL_VENUE", detail: GAP_KINDS.NO_LOCAL_VENUE, conceptKey, metro, searchable: false };
  }
  return { kind: "INVENTORY_COVERAGE", detail: GAP_KINDS.INVENTORY_COVERAGE, conceptKey, metro, searchable: true };
}
