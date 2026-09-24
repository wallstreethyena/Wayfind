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
// current offering.
//
// CORRECTED 2026-09-23 (independent PR #1495 audit, re-fetching Joy Coffee's
// live Square page): the original comment here read "Joy Coffee's live
// Square menu lists all seven pumpkin items, every one of them marked
// Unavailable" — that description was itself a misread. Direct inspection of
// the raw markup (curl, no JS execution) shows "Unavailable" is Alpine.js
// template boilerplate gated by `$store.location.isLocationClosedScheduling
// Disabled` — a WHOLE-STORE "closed for online scheduling right now" flag,
// never a per-item stock field — and BOTH the "Unavailable" branch and the
// real, priced, add-to-cart branch are always present in server-rendered
// HTML; only client-side JS (which a static fetch never runs) picks which one
// is actually shown. Proof this is not per-item signal: literally EVERY item
// on the menu carries the identical marker in the raw text, including plain
// Espresso and Cappuccino — a functioning coffee shop is not out of espresso.
// The genuinely reliable signal in the same text is the item's own catalog
// SKU: a real price (`$1.23`) rendered immediately after the marker means a
// live, priced, wired quick-add button exists for that exact item RIGHT NOW
// — proof of a real current offering, not a template artifact. A truly
// discontinued/sold-out item does not carry a working price the same way.
// So a marker is trusted as real unavailability only when NO price follows
// it closely; one that IS immediately followed by a price is overridden.
//
// TIGHTENED 2026-09-23 (re-audit of PR #1495): "a price right after the
// marker" alone is too permissive. Square and Toast item cards routinely
// print the catalog price next to a GENUINE "Sold out" badge, so
// "Pumpkin Spice Latte Sold out $6.00" must stay unavailable. The price
// override now applies only when the marker is STORE-LEVEL boilerplate: it
// sits next to (nearly) every price on the page (markers >= 90% of prices,
// with at least 5 prices). Measured on Joy Coffee's live Square page the
// same day: 35 markers, 35 prices. A page where only some items carry the
// marker is reporting real per-item stock, and the marker wins.
const STORE_BOILERPLATE_MIN_PRICES = 5;
const STORE_BOILERPLATE_RATIO = 0.9;
const UNAVAILABLE_RX = /\b(unavailable|sold out|out of stock|no longer available|not available|discontinued)\b/i;
const UNAVAILABLE_WINDOW = 30; // chars scanned right after a term for the marker above
const PRICE_RX = /\$\s?\d/;
const PRICE_OVERRIDE_WINDOW = 20; // chars scanned right after the marker itself for a real price

// A PERMANENT/YEAR-ROUND menu listing naming a fall-term item, with no
// explicit SEASONAL signal anywhere near it, is not evidence of a CURRENT
// seasonal offering — it is a standing house drink that happens to share a
// fall-sounding word. Real case, 2026-09-23 (Ryan's Coffee House, Parrish —
// WS3 official-site + live Square catalog check): the "Signature Lattes"
// board lists Ryan's Special, Parrish Honey Bee, Bananas Foster, Lavender
// Haze, CARAMEL APPLE MACCHIATO, Raspberry White Mocha and Salted Caramel
// Mocha as permanent, year-round signatures — no seasonal label, no dated
// window on any item. "caramel apple" is a load-bearing PRIMARY term
// (FALL_TERMS.primary), so without this check that one item alone would
// read as strong official proof of a fall offering it is not. Checked per
// PRIMARY occurrence, the same "any, not all" shape anyAvailable uses: one
// occurrence flagged as a permanent listing with no seasonal signal nearby
// does not condemn a DIFFERENT primary occurrence elsewhere on the same
// page that carries a real seasonal claim (e.g. a genuine "Fall Specials"
// section on the same menu).
const PERMANENT_LISTING_RX = /\bsignature\b/i;
const SEASONAL_SIGNAL_RX = /\b(seasonal|limited[- ]time|limited[- ]availability|while supplies last|fall menu|fall specials|holiday menu|only through|thru [a-z]+ \d)\b/i;
const LISTING_CONTEXT_WINDOW = 100; // chars scanned on EACH SIDE of a term for the markers above

function primaryOccurrencePromotable(hay, h) {
  const start = Math.max(0, h.index - LISTING_CONTEXT_WINDOW);
  const end = Math.min(hay.length, h.index + h.term.length + LISTING_CONTEXT_WINDOW);
  const ctx = hay.slice(start, end);
  if (!PERMANENT_LISTING_RX.test(ctx)) return true; // no "signature"/permanent-list marker nearby -> ordinary evidence, unaffected
  return SEASONAL_SIGNAL_RX.test(ctx); // explicitly marked a permanent/signature list, but ALSO carries a seasonal/dated signal right there -> still counts
}

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
  // read "Unavailable"/"Sold out"/etc. — OR does, but with a real price
  // right after the marker, which overrides it (see UNAVAILABLE_RX's comment
  // for why). If every occurrence is genuinely flagged with no price to
  // override it, the item is in the catalog but not currently offered.
  const markerCount = (hay.match(new RegExp(UNAVAILABLE_RX.source, "gi")) || []).length;
  const priceCount = (hay.match(new RegExp(PRICE_RX.source, "g")) || []).length;
  const storeLevelMarker = priceCount >= STORE_BOILERPLATE_MIN_PRICES && markerCount >= STORE_BOILERPLATE_RATIO * priceCount;
  const anyAvailable = primaryOccurrences.length === 0 ? true : primaryOccurrences.some((h) => {
    const after = hay.slice(h.index, h.index + h.term.length + UNAVAILABLE_WINDOW);
    const marker = UNAVAILABLE_RX.exec(after);
    if (!marker) return true;
    if (!storeLevelMarker) return false; // a per-item marker is real stock information, price or not
    const afterMarker = after.slice(marker.index + marker[0].length, marker.index + marker[0].length + PRICE_OVERRIDE_WINDOW);
    return PRICE_RX.test(afterMarker);
  });
  // At least one PRIMARY occurrence that is NOT merely a fall-sounding name
  // parked on a permanent/"signature" list with no seasonal signal nearby?
  // See PERMANENT_LISTING_RX's comment above (the Ryan's Coffee House case).
  const anyPromotable = primaryOccurrences.length === 0 ? true : primaryOccurrences.some((h) => primaryOccurrencePromotable(hay, h));
  // hay + primaryOccurrences are exposed (beyond terms/hasPrimary/offering)
  // so currentYearProof can run its OWN windowed staleness check around each
  // primary hit — see that function's comment for why a whole-PAGE year scan
  // is the wrong shape (a founding-year tagline or copyright notice anywhere
  // on the page must not condemn an unrelated fall claim elsewhere on it).
  return { terms, hasPrimary: !!primaryHit, offering, anyAvailable, anyPromotable, primaryOccurrences, hay };
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

// seasonStart(todayStr) — the Aug 26 that opened the fall season `todayStr`
// itself falls in, or (before that date each year, or once that season has
// closed) the most recently opened one. SHARED with
// scripts/check-fall-offering-freshness.mjs, which imports this rather than
// keeping its own copy, so "the season currently in force" cannot mean two
// different things in two files.
export function seasonStart(todayStr) {
  const y = Number(String(todayStr).slice(0, 4));
  const thisYear = `${y}-${FALL_SEASON_START_MD}`;
  return String(todayStr) >= thisYear ? thisYear : `${y - 1}-${FALL_SEASON_START_MD}`;
}

// verifiedInSeasonWindow(dateStr, todayStr) — is a "YYYY-MM-DD"
// verified/checked date dated inside the CURRENT fall season window: the
// Aug 26 - Thanksgiving run that `todayStr` itself sits in, or (off-season)
// the one most recently closed — never a DIFFERENT season just because the
// date being tested happens to fall inside its OWN year's window.
//
// FIXED 2026-09-23 (independent PR #1495 audit finding). The previous
// version read the YEAR OFF `dateStr` itself ("is dateStr inside its own
// year's Aug26-Thanksgiving window?", via inSeasonWindow(dateStr,
// yearOf(dateStr))), so a verification from a PRIOR season passed forever —
// a date once inside its own past window is always inside its own past
// window, no matter how much later this function is asked about it. This
// guard's own self-test encoded that as correct:
// `verifiedInSeasonWindow("2025-10-01") === true`, with no `today` in sight
// and no way for it to ever become false. A September 2025 re-check says
// nothing about whether an offering is still true in September 2026 — that
// was exactly the gap a stale FALL_OFFERING_SOURCES entry could hide behind
// indefinitely, since re-verifying nothing would still read as compliant.
// `todayStr` is now REQUIRED, and the window is anchored to
// seasonStart(todayStr) — the season currently open, or the one most
// recently elapsed — never to whatever year `dateStr` happens to name.
// scripts/check-fall-registry-integrity.mjs uses this, passing its own
// `today` (lib/siteTime.siteTodayStr()), to prove a FALL_OFFERING_SOURCES
// `verified` date is a real, CURRENT-season recheck, not a stale one a prior
// season's own window would have let through.
export function verifiedInSeasonWindow(dateStr, todayStr) {
  if (!dateStr || !todayStr) return false;
  const start = seasonStart(todayStr);
  const end = fallSeasonEnd(yearOf(start));
  return dateStr >= start && dateStr <= end && dateStr <= todayStr;
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

// EVERGREEN_OFFERING_TERMS — orchestrator directive 2026-09-23. A
// YEAR_ROUND_EVERGREEN_IDS place's own copy sometimes never uses a
// FALL_TERMS word at all (Mortem Manor's real text: "haunted house",
// "scares", "creepiest" — never "Halloween"/"spooky"). For THESE ids only,
// the theme itself — described in THIS vocabulary — is the evidence, not a
// seasonal claim.
export const EVERGREEN_OFFERING_TERMS = Object.freeze([
  "haunted", "haunted house", "horror", "ghost", "scares", "slasher",
]);

// A themed venue's marketing copy can describe a theme that used to exist —
// so theme vocabulary ALONE is not enough; the page must also show the place
// is actually operating right now (hours, a ticket/booking CTA, or a "open
// now"/"open year-round" claim), the same "hours, tickets or dates visible"
// bar the orchestrator specified.
const OPERATING_STATUS_RX = /\b(buy tickets|get tickets|tickets?\s*(?:&|and)\s*pricing|book(?:\s+now|\s+tickets)?|view hours|open\s+(?:now|year-round|daily|nightly))\b/i;

// evergreenThemeLive(placeId, text, meta?) -> true only when ALL of: the id
// is on YEAR_ROUND_EVERGREEN_IDS, the page (its own name stripped out) uses
// an evergreen theme term, AND the page shows the place operating today.
// This is WORD-LEVEL evidence only — it still needs a `verified` date, and
// (per the same directive) that date must still fall inside the current
// season window like every other entry; this function exists only to answer
// "is the THEME live", the harder half FALL_TERMS alone cannot answer for
// these ids. Executed by check-fall-registry-integrity.mjs is NOT required —
// this is the rule a human re-verification pass runs BY HAND against a live
// page before writing lib/fallPool.FALL_OFFERING_SOURCES.verified; the guard
// then just checks that verified date is real and in-window, same as anyone
// else. Real case, 2026-09-23: Mortem Manor's page passes (haunted house +
// "BUY TICKETS ONLINE NOW"); Ice Screamin's current page does NOT (its own
// site now reads "Handcrafted Ice Cream, Dubai Chocolate & Milkshakes" —
// zero horror vocabulary of any kind, the theme itself is gone).
export function evergreenThemeLive(placeId, text, meta = {}) {
  if (!YEAR_ROUND_EVERGREEN_IDS.has(placeId)) return false;
  const raw = String(text == null ? "" : text);
  const hay = stripPlaceName(raw.toLowerCase(), meta && meta.placeName);
  const hasTheme = EVERGREEN_OFFERING_TERMS.some((t) => new RegExp(`\\b${escapeRx(t)}\\b`, "i").test(hay));
  return hasTheme && OPERATING_STATUS_RX.test(hay);
}

// currentYearProof({ sourceTier, publishedAt, fetchedAt, text, seasonYear,
//                     offeringWindow, today })
//   -> "strong" | "medium" | "none"
//
// strong: an OFFICIAL source (the business's own site/menu platform/social/
//   material) that either (a) was fetched live right now (fetchedAt set) and
//   is not itself claiming a past year, or (b) is an official page/post
//   EXPLICITLY DATED inside the current season.
// medium: a REPUTABLE SECONDARY source (someone else's coverage), reached
//   two ways: (i) it is explicitly dated inside the current season, or
//   (ii) — POLICY FIX 2026-09-23, orchestrator directive (Dead Coconut Club:
//   a real article, real 2026 dates, published 2026-07-22, before the season
//   starts) — the article instead states the OFFERING's OWN explicit
//   start/end window (`offeringWindow`), and that window is active on `today`
//   regardless of when the covering article itself was published. An article
//   previewing an event two months early is not "stale" just because Aug 26
//   had not arrived yet when it ran; the offering's own dates are the fact
//   that matters, and they are checked directly with offeringActive() below.
// none:   everything else, including a page with no primary evidence term,
//   a name-only match, an undated aggregator, content pinned to a past year
//   regardless of tier, or a fall-term item that only appears on a
//   permanent/"signature" listing with no seasonal signal anywhere near it
//   (see PERMANENT_LISTING_RX above — the Ryan's Coffee House case).
export function currentYearProof({ sourceTier, publishedAt, fetchedAt, text, seasonYear, offeringWindow, today } = {}) {
  const evidence = classifyEvidence(text, {});
  if (!evidence.hasPrimary) return "none";
  // Present in the catalog but marked Unavailable/Sold out everywhere it
  // appears is not proof the offering is live right now.
  if (!evidence.anyAvailable) return "none";
  // A fall-term item that lives only on a permanent/"signature" list, with
  // no seasonal signal anywhere near it, is not proof of a CURRENT seasonal
  // offering — it is a year-round house drink sharing a fall-sounding word.
  if (!evidence.anyPromotable) return "none";
  const year = Number.isFinite(Number(seasonYear)) ? Number(seasonYear)
    : (fetchedAt ? yearOf(fetchedAt) : (publishedAt ? yearOf(publishedAt) : NaN));
  const stale = everyOccurrencePinnedToPastYear(evidence.hay, evidence.primaryOccurrences, year);
  const official = isOfficialTier(sourceTier);
  if (official && !stale && fetchedAt) return "strong";
  if (official && !stale && inSeasonWindow(publishedAt, year)) return "strong";
  if (sourceTier === SOURCE_TIERS.reputable_secondary && !stale && inSeasonWindow(publishedAt, year)) return "medium";
  if (sourceTier === SOURCE_TIERS.reputable_secondary && !stale && offeringWindow
    && offeringActive({ starts: offeringWindow.starts, ends: offeringWindow.ends, today: today || fetchedAt })) return "medium";
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
