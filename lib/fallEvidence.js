// lib/fallEvidence.js — THE EVIDENCE RULES for fall/Halloween offering
// discovery. Pure, no network, no clock reads (every "now" is a caller-
// supplied argument) — so this module is unit-testable byte-for-byte and
// importable from both scripts/fall-discovery/run.mjs (a Node script) and
// scripts/check-fall-evidence-rules.mjs (a guard) with identical answers.
//
// WHY THIS EXISTS. The 2026-09-10 audit (docs/audits/fall-food-and-social-
// 2026-09-10.json) rejected "Local creator food visits" and "Joe the Boar"
// leads for one reason, verbatim: "Salted caramel, maple, or toasted
// marshmallow in a creator caption is fall-adjacent wording, not proof of a
// seasonal program." This file makes that judgment call a function instead
// of a one-off audit note, so the next audit does not have to re-derive it,
// and a script can apply it mechanically at scale.
//
// THE CENTRAL DISTINCTION: a fall WORD is not fall EVIDENCE.
//   - A place's own NAME containing a fall word (Cidersmith, Pumpkin House)
//     proves nothing about what it sells today. FALL_REJECTED_IDS already
//     pins Cidersmith out for exactly this ("cider in the NAME; the house
//     list is key lime, peach tea, pineapple").
//   - An UNDATED or PREVIOUS-YEAR page naming pumpkin spice is a claim about
//     some fall, not necessarily this one. A roundup article of unknown
//     publication year is the same shape wearing a byline.
// So the pool exists in two runtime checks (classifyEvidence extracts WHAT a
// text says; currentYearProof judges WHETHER that says it is true now) and a
// decision table (decideAction) that turns both, plus place-identity facts,
// into exactly one of seven actions — never a bare "yes".

import { FALL_SEASON_START_MD, fallSeasonEnd } from "./fallSkin.js";

// ── THE TERM LIST ───────────────────────────────────────────────────────
// `primary` terms are load-bearing: at least one must appear (after the
// place's own name is stripped out of the text, see classifyEvidence) before
// any evidence is considered real. `supporting` terms (maple, butternut) are
// real fall words but too generic to stand alone — "maple" appears on menus
// year-round (maple bacon, maple syrup) with no seasonal claim attached, so a
// supporting-only match can describe a snippet but can never by itself carry
// classifyEvidence.hasPrimary, and therefore can never drive decideAction to
// "add"/"refresh". Longer phrases are listed first so "pumpkin spice" is
// matched as itself rather than only as a "pumpkin" substring loss of detail.
export const FALL_TERMS = Object.freeze({
  primary: Object.freeze([
    "pumpkin spice", "white pumpkin", "apple cider", "caramel apple",
    "seasonal menu", "fall menu", "pumpkin", "harvest", "halloween",
    "spooky", "oktoberfest", "fall", "autumn",
  ]),
  supporting: Object.freeze(["maple", "butternut"]),
});

// ── SOURCE TIERS ─────────────────────────────────────────────────────────
// Ranked implicitly by how hard they are to fake. "official_*" tiers are the
// business speaking for itself (its own site, its own ordering platform, its
// own verified social account, or a document it published — a PDF menu, a
// press kit). "reputable_secondary" is someone ELSE describing the business
// (a news roundup, a blog "best fall menus" post) — useful, never sufficient
// alone unless it is dated inside the current season (see currentYearProof).
export const SOURCE_TIERS = Object.freeze({
  official_site: "official_site",
  official_menu_platform: "official_menu_platform",
  official_social: "official_social",
  business_material: "business_material",
  reputable_secondary: "reputable_secondary",
});

const OFFICIAL_TIERS = Object.freeze(new Set([
  SOURCE_TIERS.official_site,
  SOURCE_TIERS.official_menu_platform,
  SOURCE_TIERS.official_social,
  SOURCE_TIERS.business_material,
]));
export function isOfficialTier(tier) { return OFFICIAL_TIERS.has(tier); }

function escapeRx(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Strip literal occurrences of the place's own name out of the haystack
// before matching, so a term that appears ONLY inside the business's name
// (a page that says nothing but "Welcome to Pumpkin House") can never count
// as real evidence. Case/whitespace tolerant; requires a 3+ char name so a
// one-letter name can't nuke the whole haystack.
function stripPlaceName(hay, placeName) {
  const name = String(placeName || "").trim().toLowerCase();
  if (name.length < 3) return hay;
  return hay.split(name).join(" ");
}

// classifyEvidence(text, meta) -> { terms, hasPrimary, offering, anyAvailable, primaryOccurrences, hay }
//   terms:     distinct matched term strings (primary + supporting), in the
//              order first seen in the text.
//   hasPrimary: true iff at least one PRIMARY term matched outside the
//              place's own name — the load-bearing fact every other function
//              in this file reads.
//   offering:  a short snippet of the source text around the first primary
//              match (the "offering" a human/report can read), or null when
//              hasPrimary is false. Never fabricated — it is always a
//              substring of the actual input.
//   anyAvailable: false only when EVERY primary occurrence is immediately
//              flagged Unavailable/Sold out (see UNAVAILABLE_RX below).
//   primaryOccurrences / hay: every primary-term hit's index into the
//              lowercased, name-stripped haystack — the low-level data
//              currentYearProof reuses for its own windowed staleness check.
//              Not meant as a stable per-call API beyond this module, but
//              exported implicitly on the return value for that one caller.
// A term FOLLOWED closely by one of these is a menu platform saying the item
// exists in the catalog but is NOT currently sellable — not proof of a
// current offering. Found for real, 2026-09-23: Joy Coffee's live Square
// menu lists all seven pumpkin items, every one of them marked Unavailable.
const UNAVAILABLE_RX = /\b(unavailable|sold out|out of stock|no longer available|not available|discontinued)\b/i;
const UNAVAILABLE_WINDOW = 30; // chars scanned right after a term for the marker above

export function classifyEvidence(text, meta = {}) {
  const raw = String(text == null ? "" : text);
  const hay = stripPlaceName(raw.toLowerCase(), meta && meta.placeName);
  const allTerms = [...FALL_TERMS.primary, ...FALL_TERMS.supporting].slice().sort((a, b) => b.length - a.length);
  const firstByTerm = [];
  const primaryOccurrences = [];
  for (const term of allTerms) {
    const rx = new RegExp(`\\b${escapeRx(term)}\\b`, "gi");
    let m;
    let seenFirst = false;
    while ((m = rx.exec(hay)) !== null) {
      if (!seenFirst) { firstByTerm.push({ term, index: m.index }); seenFirst = true; }
      if (FALL_TERMS.primary.includes(term)) primaryOccurrences.push({ term, index: m.index });
      if (rx.lastIndex === m.index) rx.lastIndex += 1; // defensive: no zero-width term in this list, but never loop forever
    }
  }
  firstByTerm.sort((a, b) => a.index - b.index);
  const seen = new Set();
  const terms = [];
  for (const h of firstByTerm) { if (!seen.has(h.term)) { seen.add(h.term); terms.push(h.term); } }
  const primaryHit = firstByTerm.find((h) => FALL_TERMS.primary.includes(h.term));
  let offering = null;
  if (primaryHit) {
    const start = Math.max(0, primaryHit.index - 60);
    const end = Math.min(hay.length, primaryHit.index + 90);
    // A real substring of the input (lowercased, name-stripped) — never
    // fabricated text. Casing is not load-bearing for a report snippet.
    offering = hay.slice(start, end).replace(/\s+/g, " ").trim();
  }
  // At least one PRIMARY occurrence whose immediate follow-on text does NOT
  // read "Unavailable"/"Sold out"/etc.? If every occurrence is flagged, the
  // item is in the catalog but not currently offered — see UNAVAILABLE_RX.
  const anyAvailable = primaryOccurrences.length === 0 ? true : primaryOccurrences.some((h) => {
    const after = hay.slice(h.index, h.index + h.term.length + UNAVAILABLE_WINDOW);
    return !UNAVAILABLE_RX.test(after);
  });
  // hay + primaryOccurrences are exposed (beyond terms/hasPrimary/offering)
  // so currentYearProof can run its OWN windowed staleness check around each
  // primary hit — see that function's comment for why a whole-PAGE year scan
  // is the wrong shape (a founding-year tagline or copyright notice anywhere
  // on the page must not condemn an unrelated fall claim elsewhere on it).
  return { terms, hasPrimary: !!primaryHit, offering, anyAvailable, primaryOccurrences, hay };
}

// A candidate whose ONLY reason to be considered is that its own name is
// fall-coded (Cidersmith, "The Pumpkin House"), with no real offering found
// anywhere in its page text. classifyEvidence already strips the name out of
// the page text before matching, so if the stripped page carries no primary
// term, the name is doing all the work — which decideAction refuses to pay
// out (name-only always resolves to reject_ambiguous, never "add").
export function nameOnlyCandidate(placeName, pageText) {
  const nameSaysFall = classifyEvidence(String(placeName || ""), {}).hasPrimary;
  if (!nameSaysFall) return false;
  const page = classifyEvidence(pageText, { placeName });
  return !page.hasPrimary;
}

const YEAR_WINDOW = 40; // chars scanned on EACH SIDE of a primary hit for a pinned year
const YEAR_RX = /\b(20\d{2})\b/g;

// Is the fall claim ITSELF pinned to a past year? Checked per PRIMARY
// occurrence, in a window around just that occurrence — not the whole page.
// A page-wide scan was tried first and produced a real false negative
// (ghost-party.com, 2026-09-23: "Scaring Victims since 2007" made the whole
// page read as pinned to 2007, condemning an otherwise-live, undated,
// evergreen "spooky" claim it has nothing to do with). An occurrence is
// "stale" only when a year appears in ITS OWN window and every year in that
// window is before `currentYear`; the whole text is "stale" only when EVERY
// primary occurrence is stale this way — one clean occurrence is enough to
// keep the source in play, the same "any, not all" shape anyAvailable uses.
function everyOccurrencePinnedToPastYear(hay, occurrences, currentYear) {
  if (!occurrences.length || !Number.isFinite(currentYear)) return false;
  return occurrences.every((h) => {
    const start = Math.max(0, h.index - YEAR_WINDOW);
    const end = Math.min(hay.length, h.index + h.term.length + YEAR_WINDOW);
    const years = [...hay.slice(start, end).matchAll(YEAR_RX)].map((m) => Number(m[1]));
    if (!years.length) return false; // no year pinned near THIS occurrence -> not proven stale
    return years.every((y) => y < currentYear);
  });
}

function monthDayOf(dateStr) { return String(dateStr || "").slice(5, 10); }
function yearOf(dateStr) { const y = Number(String(dateStr || "").slice(0, 4)); return Number.isFinite(y) ? y : NaN; }

// Is `dateStr` (a "YYYY-MM-DD") inside the fall season window of `year`
// (Aug 26 - Thanksgiving, the same law lib/fallSkin enforces for the card
// skin)? Reused here so "dated in the current season" means the SAME season
// the site is currently showing, not a different definition growing beside
// it.
function inSeasonWindow(dateStr, year) {
  if (!dateStr || !Number.isFinite(year)) return false;
  if (yearOf(dateStr) !== year) return false;
  const md = monthDayOf(dateStr);
  return md >= FALL_SEASON_START_MD && md <= monthDayOf(fallSeasonEnd(year));
}

// verifiedInSeasonWindow(dateStr) — is a "YYYY-MM-DD" verified/checked date
// itself dated inside ITS OWN year's fall season window (Aug 26 -
// Thanksgiving)? Deliberately NOT "inside the CURRENT calendar year's
// window" — it reads the year off the date being tested, the same way
// currentYearProof's inSeasonWindow(publishedAt, year) does, so a guard that
// calls this keeps answering correctly whenever it happens to run (build day
// in October, a stale CI box in February) rather than only while today
// itself sits inside the season. scripts/check-fall-registry-integrity.mjs
// uses this to prove a FALL_OFFERING_SOURCES `verified` date is a real,
// current-season recheck and not a date left over from a different year.
export function verifiedInSeasonWindow(dateStr) {
  return inSeasonWindow(dateStr, yearOf(dateStr));
}

// YEAR_ROUND_EVERGREEN_IDS — the documented, evidence-backed exemption
// scripts/check-fall-registry-integrity.mjs requires for any place admitted
// on a YEAR-ROUND BUSINESS TRAIT rather than a dated seasonal claim (a fall
// menu item, a Sept-Nov event run). A place on this list still needs a real
// FALL_OFFERING_SOURCES record with an https source, offering text and a
// `verified` date — it is exempt only from the "that date must fall inside
// THIS season's window" requirement, because the claim it backs ("haunted
// house", "spooky lounge", "ghost tours") is not a claim about THIS season,
// it is a claim about what the business permanently is. That is never a
// silent exemption: every id below carries the specific text (from
// lib/fallPool.FALL_PLACE_IDS / FALL_OFFERING_SOURCES) that makes it a
// business-trait claim rather than a seasonal one, so a future addition has
// to clear the same bar in writing, not just get appended to a list.
export const YEAR_ROUND_EVERGREEN_IDS = Object.freeze(new Set([
  // SpookEasy Lounge, Ybor — offering text: "year-round spooky lounge:
  // potion cocktails, oddities decor" (own decor/concept, not a seasonal menu)
  "ChIJ7QVjUK_FwogRaTLY8uxOico",
  // Dracula's Legacy Wine Bar, Tampa — "vampire-THEMED wine bar interior:
  // candlelit, coffin decor" (the theming IS the venue, every night of the year)
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk",
  // Ice Screamin, Tampa — "horror-themed scoop shop: slasher decor, horror
  // movies playing" (a permanent shop concept, not a fall-dated offering)
  "ChIJB2B8mYzHwogRkZIDCDARWww",
  // Ghost Party Haunted Tours, Ybor — "haunted-history walking tours of
  // Ybor, year-round" (the operator's own site: nightly tours, no season)
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0",
  // Mortem Manor, Kissimmee — "year-round walk-through haunted house +
  // burial simulator" (a permanent attraction, open every month)
  "ChIJd6lmgVh_3YgREzqTBf28i6U",
  // Orlando Ghosts (US Ghost Adventures) — "ghost tours and haunted pub
  // crawls, downtown Orlando" (a standing tour operation, not a seasonal run)
  "ChIJUS9EYpll54gR63QOjYM4vDw",
  // Fear at the Pier, Panama City Beach — "year-round walk-through haunted
  // attraction: live actors, special effects, monsters" (open all year per
  // the operator's own page: "It's Halloween everyday at fear at the pier!")
  "ChIJ2Z9gE5eNk4gRz-Ey8y0ahfM",
]));

// currentYearProof({ sourceTier, publishedAt, fetchedAt, text, seasonYear })
//   -> "strong" | "medium" | "none"
//
// strong: an OFFICIAL source (the business's own site/menu platform/social/
//   material) that either (a) was fetched live right now (fetchedAt set) and
//   is not itself claiming a past year, or (b) is an official page/post
//   EXPLICITLY DATED inside the current season.
// medium: a REPUTABLE SECONDARY source (someone else's coverage), but only
//   when it is explicitly dated inside the current season — an undated
//   roundup or one dated to a prior year never reaches medium.
// none:   everything else, including a page with no primary evidence term,
//   a name-only match, an undated aggregator, or content pinned to a past
//   year regardless of tier.
export function currentYearProof({ sourceTier, publishedAt, fetchedAt, text, seasonYear } = {}) {
  const evidence = classifyEvidence(text, {});
  if (!evidence.hasPrimary) return "none";
  // Present in the catalog but marked Unavailable/Sold out everywhere it
  // appears is not proof the offering is live right now.
  if (!evidence.anyAvailable) return "none";
  const year = Number.isFinite(Number(seasonYear)) ? Number(seasonYear)
    : (fetchedAt ? yearOf(fetchedAt) : (publishedAt ? yearOf(publishedAt) : NaN));
  const stale = everyOccurrencePinnedToPastYear(evidence.hay, evidence.primaryOccurrences, year);
  const official = isOfficialTier(sourceTier);
  if (official && !stale && fetchedAt) return "strong";
  if (official && !stale && inSeasonWindow(publishedAt, year)) return "strong";
  if (sourceTier === SOURCE_TIERS.reputable_secondary && !stale && inSeasonWindow(publishedAt, year)) return "medium";
  return "none";
}

// offeringActive({ starts, ends, today }) — a DATED offering (an event-
// shaped run, e.g. "Fall at the Farm Sep 19 - Nov 8") is active only within
// its own window. A pure menu-item offering has no starts/ends and this
// function is simply not asked about it.
export function offeringActive({ starts, ends, today } = {}) {
  if (!today) return false;
  if (ends && ends < today) return false;
  if (starts && starts > today) return false;
  return true;
}

export const ACTIONS = Object.freeze([
  "add", "refresh", "expire", "remove_closed", "reject_ambiguous", "insufficient", "needs_url",
]);

// decideAction(ctx) -> one of ACTIONS. Every input is a plain fact the
// caller (the run script, or a guard fixture) already computed; this
// function only orders the facts into one verdict, so the ORDER here is the
// whole policy and is deliberately linear, most-fundamental-fact-first:
//
//   1. the place itself is gone (closed/excluded)      -> remove_closed
//   2. the candidate could not be resolved to ONE place -> reject_ambiguous
//   3. nothing to check (no source at all)              -> needs_url
//   4. the only "evidence" was the place's own name      -> reject_ambiguous
//   5. a dated offering's own end date has passed        -> expire
//   6. real, current-season proof exists (strong/medium) -> add or refresh
//   7. otherwise                                          -> insufficient
export function decideAction(ctx = {}) {
  const {
    inRegistry = false,
    placeOperational = true,
    hasUrl = true,
    ambiguous = false,
    nameOnly = false,
    endsPast = false,
    proof = "none",
  } = ctx;

  if (!placeOperational) return "remove_closed";
  if (ambiguous) return "reject_ambiguous";
  if (!hasUrl) return "needs_url";
  if (nameOnly) return "reject_ambiguous";
  if (endsPast) return "expire";
  if (proof === "strong" || proof === "medium") return inRegistry ? "refresh" : "add";
  return "insufficient";
}
