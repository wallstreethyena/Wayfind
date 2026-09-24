#!/usr/bin/env node
// scripts/check-fall-evidence-rules.mjs — unit-tests lib/fallEvidence.js, the
// rules the fall-discovery pipeline (scripts/fall-discovery/run.mjs) and the
// registry re-verification both run through. Pure — no network, no clock.
//
// The five acceptance facts this guard exists to pin, each executed against
// the real functions rather than re-derived here:
//   1. an old/previous-year pumpkin page ALONE -> insufficient
//   2. a current official menu listing -> strong
//   3. a name-only match -> rejected (reject_ambiguous — the only "reject"
//      shaped verdict decideAction can return; see its own comment)
//   4. a dated end in the past -> expire
//   5. outside the season, fallCardClass still returns "" — the discovery
//      pipeline's evidence rules and the card skin's date law are proven
//      against the SAME season boundary, not two definitions that can drift
import {
  ACTIONS, FALL_TERMS, SOURCE_TIERS, classifyEvidence, currentYearProof,
  decideAction, isOfficialTier, nameOnlyCandidate, offeringActive, verifiedInSeasonWindow,
} from "../lib/fallEvidence.js";
import { fallCardClass, fallSeasonEnd, FALL_CARD_IDS } from "../lib/fallSkin.js";

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// ── term list shape ─────────────────────────────────────────────────────
ok(FALL_TERMS.primary.includes("pumpkin") && FALL_TERMS.primary.includes("halloween") && FALL_TERMS.primary.includes("oktoberfest"),
  "the primary term list carries the core fall/Halloween vocabulary");
ok(FALL_TERMS.supporting.includes("maple") && FALL_TERMS.supporting.includes("butternut") && !FALL_TERMS.primary.includes("maple"),
  "maple/butternut are SUPPORTING only — never counted as primary");
ok(isOfficialTier(SOURCE_TIERS.official_site) && isOfficialTier(SOURCE_TIERS.business_material) && !isOfficialTier(SOURCE_TIERS.reputable_secondary),
  "official_* tiers are official; reputable_secondary is not");

// ── classifyEvidence: what a text says ──────────────────────────────────
{
  const e = classifyEvidence("Our Fall Specials menu: Spiced Pumpkin Latte, Caramel Apple Latte.", {});
  ok(e.hasPrimary && e.terms.includes("pumpkin") && e.terms.includes("caramel apple"), "classifyEvidence finds primary terms in real menu text");
  ok(!!e.offering && e.offering.length > 5, "a primary hit carries a real offering snippet");
}
{
  const e = classifyEvidence("A quiet neighborhood spot with sandwiches and salads.", {});
  ok(!e.hasPrimary && e.offering === null, "text with no fall vocabulary carries no primary hit and no fabricated offering");
}
{
  // supporting-only text (maple, no primary term) must not count as evidence
  const e = classifyEvidence("Try our maple butter pancakes any day of the year.", {});
  ok(!e.hasPrimary, "a SUPPORTING-only match (maple) never sets hasPrimary — maple alone is not a fall claim");
}
{
  // the place's own name is stripped before matching
  const e = classifyEvidence("Welcome to Pumpkin House. Open daily 8am-6pm.", { placeName: "Pumpkin House" });
  ok(!e.hasPrimary, "a term that appears ONLY inside the place's own name is stripped out and cannot count as evidence");
}

// ── nameOnlyCandidate: the Cidersmith rule ───────────────────────────────
ok(nameOnlyCandidate("Pumpkin House", "Welcome to Pumpkin House. Open daily 8am-6pm. Key lime pie, peach tea, pineapple smoothies.") === true,
  "a fall-coded NAME with no real offering on the page is a name-only candidate — the Cidersmith shape, executed");
ok(nameOnlyCandidate("Pumpkin House", "Our Fall Specials: Pumpkin Spice Latte, available now.") === false,
  "…but the SAME name is not name-only once the page carries independent primary evidence");
ok(nameOnlyCandidate("Joe's Diner", "Serving breakfast all day, no seasonal menu.") === false,
  "an ordinary name is never flagged name-only regardless of its page text");

// ── currentYearProof: the three verdicts, executed ──────────────────────
// 1. AN OLD / PREVIOUS-YEAR PUMPKIN PAGE ALONE -> "none" (feeds insufficient)
{
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.reputable_secondary,
    publishedAt: "2025-09-12",
    fetchedAt: "2026-09-23",
    text: "Our roundup of the best 2025 pumpkin spice drinks in Tampa Bay.",
    seasonYear: 2026,
  });
  ok(verdict === "none", `a previous-year secondary roundup yields "none", got "${verdict}"`);
}
{
  // an official page whose OWN TEXT pins the offering to a past year, even
  // though it was fetched live just now, must not read as current
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_site,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Check out our 2025 Fall Pumpkin Menu, back by popular demand!",
    seasonYear: 2026,
  });
  ok(verdict === "none", `stale content pinned to a past year beats a live fetch flag, got "${verdict}"`);
}
{
  // an undated aggregator/roundup with no publish date at all never reaches
  // medium, regardless of season
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.reputable_secondary,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Pumpkin spice season is here — check out these local favorites.",
    seasonYear: 2026,
  });
  ok(verdict === "none", `an undated secondary roundup never reaches strong/medium, got "${verdict}"`);
}
// 2. A CURRENT OFFICIAL MENU LISTING -> "strong"
{
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_menu_platform,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Fall Specials: Spiced Pumpkin Latte $6, Caramel Apple Latte $6.50, Pumpkin Bread $5.",
    seasonYear: 2026,
  });
  ok(verdict === "strong", `a live official ordering-platform page naming the item now is strong, got "${verdict}"`);
}
{
  // an official page/post EXPLICITLY DATED inside the current season, with
  // no live fetch — also strong
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_social,
    publishedAt: "2026-09-05",
    fetchedAt: null,
    text: "Our Halloween menu drops this week — pumpkin everything!",
    seasonYear: 2026,
  });
  ok(verdict === "strong", `an official post explicitly dated inside the current season is strong even without a live fetch, got "${verdict}"`);
}
// CORRECTED 2026-09-23 (independent PR #1495 audit, re-fetching Joy Coffee's
// live Square page — see lib/fallEvidence.UNAVAILABLE_RX's comment for the
// full technical finding). The ORIGINAL version of this test read Joy
// Coffee's page as "every one of its seven pumpkin items is marked
// Unavailable" and asserted that shape as "none" — that description was
// itself a misread. "Unavailable" immediately followed by a REAL PRICE is
// Alpine.js template boilerplate present for EVERY item on the page
// (confirmed live, including plain Espresso), never a per-item stock signal
// — so it is overridden. A GENUINELY sold-out item — no price rendered — is
// still correctly flagged as unavailable, which is what actually needs proof
// of a current offering. Both shapes are executed below, real Joy Coffee text
// included as the corrected positive control (this exact text is Joy
// Coffee's own current live Square catalog, re-fetched 2026-09-23).
{
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_menu_platform,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    // Store-level boilerplate: EVERY priced item on the page carries the
    // marker, plain Espresso included (Joy Coffee's live page, 2026-09-23:
    // 35 markers, 35 prices). Tightened in the re-audit: the price override
    // only applies to this page-wide shape.
    text: "Espresso Unavailable $3.50 Add. Cappuccino Unavailable $4.75 Add. Chocolate Croissant Unavailable $7.00 Add. Spiced Pumpkin Flat White Unavailable $6.00 Add. Classic Spiced Pumpkin Latte Unavailable $7.00 Add. Pumpkin Bread Unavailable $5.00 Add. Spiced Pumpkin Chai Unavailable $7.50 Add.",
    seasonYear: 2026,
  });
  ok(verdict === "strong", `a page-wide "Unavailable" marker next to EVERY price (store closed for online scheduling) is a template artifact, not real unavailability — this is CURRENT proof, got "${verdict}"`);
}
{
  // Re-audit probe: a GENUINE per-item "Sold out" badge printed next to the
  // catalog price, on a page where the other items are orderable, must stay
  // unavailable. The price alone never overrides a per-item marker.
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_menu_platform,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Espresso $3.50 Add. Cappuccino $4.75 Add. Latte $5.00 Add. Cold Brew $5.25 Add. Pumpkin Spice Latte Sold out $6.00. Mocha $5.50 Add.",
    seasonYear: 2026,
  });
  ok(verdict === "none", `a per-item "Sold out" badge beside its price, on a page whose other items are orderable, is real unavailability — not current proof, got "${verdict}"`);
}
{
  // a GENUINELY sold-out item — the marker with NO price to override it —
  // still correctly reads as not-currently-offered.
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_menu_platform,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Pumpkin Loaf: Sold Out. Come back another day.",
    seasonYear: 2026,
  });
  ok(verdict === "none", `a marker with no price anywhere near it (genuinely sold out, nothing to order) is not current proof, got "${verdict}"`);
}
ok(classifyEvidence("Pumpkin Latte Unavailable $7.00").anyAvailable === false,
  "classifyEvidence must NOT treat a lone per-item marker as boilerplate just because a price follows it (re-audit: Square/Toast print the price beside a real Sold out badge)");
ok(classifyEvidence("pumpkin bread sold out $5. espresso $3. latte $5. mocha $5. cold brew $5. tea $3.").anyAvailable === false,
  "a sold-out pumpkin item among orderable items stays unavailable even with its price printed after the badge");
ok(classifyEvidence("Pumpkin Latte Unavailable. Ask your barista about our other drinks.").anyAvailable === false,
  "…but anyAvailable=false when the marker carries no price to override it — a genuine sold-out signal");
ok(classifyEvidence("Pumpkin Latte $7.00, in stock now.").anyAvailable === true,
  "…and anyAvailable=true when nothing marks it unavailable in the first place");
{
  // one available occurrence among several unavailable (genuinely, no price)
  // ones is still proof
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_menu_platform,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Pumpkin Bread: Sold Out. Pumpkin Spice Latte $6.00, ready to order.",
    seasonYear: 2026,
  });
  ok(verdict === "strong", `at least one AVAILABLE primary occurrence is still strong proof, got "${verdict}"`);
}
// medium: reputable secondary, dated in-season
{
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.reputable_secondary,
    publishedAt: "2026-09-15",
    fetchedAt: "2026-09-23",
    text: "This fall menu roundup names the venue's new Pumpkin Spice Latte.",
    seasonYear: 2026,
  });
  ok(verdict === "medium", `a reputable secondary source dated in the current season is medium, got "${verdict}"`);
}

// A past year ANYWHERE on the page (a founding-year tagline, a copyright
// notice) must not condemn an UNRELATED fall claim elsewhere on the same
// page — staleness is checked per occurrence, in a window around it, never
// across the whole page. Real regression, 2026-09-23: ghost-party.com's
// "Scaring Victims since 2007" made a page-wide scan misread its live,
// undated "spooky" tour claim as stale.
{
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_site,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Join us for spooky ghost tours every night. Scaring victims since 2007 in the heart of Ybor City.",
    seasonYear: 2026,
  });
  ok(verdict === "strong", `a 2007 founding-year tagline far from the actual "spooky" claim must not stale it out, got "${verdict}"`);
}
{
  // …but a year pinned RIGHT NEXT TO the term still stales that occurrence
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_site,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Our 2024 spooky season lineup has wrapped. Thanks for a great year!",
    seasonYear: 2026,
  });
  ok(verdict === "none", `a year pinned directly beside the ONLY primary occurrence still stales it, got "${verdict}"`);
}

// ── Ryan's Coffee House, Parrish (WS3 + WS4, 2026-09-23) — a real
// candidate the registry re-verification pass found and did NOT add. Four
// cases, each executed against the real pipeline, not re-derived here:
//   (a) only a 2025-dated article about "White Pumpkin" -> insufficient
//   (b) a CURRENT official menu naming a fall-term drink, but only on a
//       permanent "signature" list with no seasonal label/dated window ->
//       not promotable (the anyPromotable / PERMANENT_LISTING_RX rule)
//   (c) a live official menu explicitly labelling "White Pumpkin" as a
//       fall/seasonal item -> strong, action add
//   (d) fallCardClass stays "" for Ryan's id, which is not on the registry
{
  // (a) the ONLY real source found this run: a 2025-dated roundup mentioning
  // White Pumpkin — never refreshed for 2026, the same "old page alone"
  // shape as the Paradeco/Oxford Exchange/On Swann roundup.
  const proof = currentYearProof({
    sourceTier: SOURCE_TIERS.reputable_secondary,
    publishedAt: "2025-10-01",
    fetchedAt: null,
    text: "Ryan's Coffee House brings back its White Pumpkin Latte for fall 2025 — a seasonal favorite.",
    seasonYear: 2026,
  });
  ok(proof === "none", `(a) a 2025-dated article about White Pumpkin, with no 2026 iteration, yields "none", got "${proof}"`);
  ok(decideAction({ proof, inRegistry: false }) === "insufficient", "(a) …and that proof alone decides insufficient, never add");
}
{
  // (b) Ryan's REAL current menu, live-fetched 2026-09-23: the "Signature
  // Lattes" board names Caramel Apple Macchiato among six other permanent
  // drinks (Ryan's Special, Parrish Honey Bee, Bananas Foster, Lavender
  // Haze, Raspberry White Mocha, Salted Caramel Mocha) — "caramel apple" IS
  // a primary FALL_TERM, but nothing on the page marks it seasonal or gives
  // it a window; it is a year-round house drink, not a fall offering.
  const proof = currentYearProof({
    sourceTier: SOURCE_TIERS.official_site,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Signature Lattes: Ryan's Special, Parrish Honey Bee, Bananas Foster, Lavender Haze, Caramel Apple Macchiato, Raspberry White Mocha, Salted Caramel Mocha. Available year-round.",
    seasonYear: 2026,
  });
  ok(proof === "none", `(b) a fall-term drink on a permanent "signature" list with no seasonal label/window is not current proof, got "${proof}"`);
  ok(decideAction({ proof, inRegistry: false }) === "insufficient", "(b) …not promotable — decideAction never reaches add/refresh on it");
  // the SAME item, on a page that ALSO carries an explicit seasonal signal
  // right next to it, is not neutralized — a genuine fall relaunch of a
  // "signature" item still counts.
  const relaunched = currentYearProof({
    sourceTier: SOURCE_TIERS.official_site,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Our Fall Specials: the Caramel Apple Macchiato is back for a limited time this season.",
    seasonYear: 2026,
  });
  ok(relaunched === "strong", `(b, control) the same term WITH an explicit seasonal signal nearby is still strong proof, got "${relaunched}"`);
}
{
  // (c) the hypothetical this pass did NOT find: a live official menu that
  // labels White Pumpkin fall/seasonal outright.
  const proof = currentYearProof({
    sourceTier: SOURCE_TIERS.official_menu_platform,
    publishedAt: null,
    fetchedAt: "2026-09-23",
    text: "Our seasonal fall menu is here: White Pumpkin Latte, Salted Caramel Cold Brew, and more — available now.",
    seasonYear: 2026,
  });
  ok(proof === "strong", `(c) a live official menu explicitly labelling White Pumpkin fall/seasonal is strong, got "${proof}"`);
  ok(decideAction({ proof, inRegistry: false }) === "add", "(c) …and strong proof on a new candidate decides add");
}
{
  // (d) as things actually stand: Ryan's is NOT in the registry, so the
  // card never renders for it, in season or not.
  const RYANS_ID = "ChIJo_IdHf0lw4gRHDbQNKBRE84";
  ok(!FALL_CARD_IDS.has(RYANS_ID), "(d) Ryan's Coffee House is not on FALL_CARD_IDS — this pass found it insufficient, not verified");
  ok(fallCardClass(RYANS_ID, "2026-10-01") === "", `(d) fallCardClass(Ryan's id, in-season date) is "" while Ryan's is not in the registry`);
}

// ── verifiedInSeasonWindow: the CURRENT season, not the date's own year ──
// FIXED 2026-09-23 (independent PR #1495 audit finding): a `today` is now
// required, and the window is anchored to the season `today` sits in — a
// verification from a PRIOR season must not pass just because it once fell
// inside THAT season's own window. See the function's own comment in
// lib/fallEvidence.js for the full story of the bug this replaces.
ok(verifiedInSeasonWindow("2026-09-23", "2026-09-23") === true, "a same-day verification is inside the current season");
ok(verifiedInSeasonWindow("2025-10-01", "2026-09-23") === false, "a PRIOR season's own verification no longer counts as current — the exact fixed bug");
ok(verifiedInSeasonWindow("2026-07-04", "2026-09-23") === false, "a date before this year's season opened is not inside it");
ok(verifiedInSeasonWindow("2026-12-25", "2026-09-23") === false, "a date in the future relative to today is not a real verification yet");
ok(verifiedInSeasonWindow(null, "2026-09-23") === false && verifiedInSeasonWindow("2026-09-23", null) === false,
  "no verified date, or no today, is never a pass — never a guess");

// ── offeringActive: dated offerings ─────────────────────────────────────
ok(offeringActive({ starts: "2026-09-19", ends: "2026-11-08", today: "2026-10-01" }) === true, "a dated offering is active within its window");
ok(offeringActive({ starts: "2026-09-19", ends: "2026-11-08", today: "2026-11-09" }) === false, "…and inactive the day after its end date");
ok(offeringActive({ starts: "2026-09-19", ends: "2026-11-08", today: "2026-09-01" }) === false, "…and inactive before it starts");
ok(offeringActive({ today: null }) === false, "no today, no verdict — never a guess");

// ── decideAction: the seven-way table, executed ─────────────────────────
ok(decideAction({ placeOperational: false }) === "remove_closed", "a closed/excluded place is remove_closed regardless of any evidence");
ok(decideAction({ ambiguous: true }) === "reject_ambiguous", "an unresolved candidate (ambiguous place match) is rejected, never guessed into a place_id");
ok(decideAction({ hasUrl: false }) === "needs_url", "no known source at all -> needs_url, not a silent skip");
// 3. NAME-ONLY -> rejected. decideAction has no bare "reject" verdict; the
// only reject-shaped action in the 7-way ACTIONS enum is reject_ambiguous,
// and that is what a name-only match resolves to — it is never "add".
ok(decideAction({ nameOnly: true, proof: "strong" }) === "reject_ambiguous",
  "name-only NEVER reaches add, even if proof somehow reads strong — nameOnly is checked before proof");
ok(ACTIONS.includes("reject_ambiguous") && !ACTIONS.includes("reject"), "reject_ambiguous is the only reject-shaped verdict in the action set");
// 4. A DATED END IN THE PAST -> expire
ok(decideAction({ endsPast: true, proof: "strong" }) === "expire", "an offering whose own end date has passed is expire, even with otherwise-strong proof");
// 6/7. real proof adds or refreshes; no proof is insufficient
ok(decideAction({ proof: "strong", inRegistry: false }) === "add", "strong proof on a NEW candidate is add");
ok(decideAction({ proof: "strong", inRegistry: true }) === "refresh", "strong proof on an EXISTING registry member is refresh, not add");
ok(decideAction({ proof: "medium", inRegistry: false }) === "add", "medium proof is still real current-season proof and can add");
ok(decideAction({ proof: "none" }) === "insufficient", "no current-year proof is insufficient — the default outcome, never a silent add");
ok(decideAction({}) === "insufficient", "the all-defaults case (no evidence given) is insufficient, not add");
// ordering: remove_closed beats everything, even when other facts look fine
ok(decideAction({ placeOperational: false, proof: "strong", hasUrl: true }) === "remove_closed",
  "remove_closed outranks strong proof — a place that no longer exists cannot be refreshed");

// ── the season boundary is ONE law, shared with the card skin ───────────
ok(fallCardClass("not-a-real-place-id", "2026-12-05") === "", "fallCardClass returns '' outside the season (positive control on the shared law)");
ok(fallSeasonEnd(2026) === "2026-11-26", `fallEvidence's currentYearProof reads the SAME season-end fallSkin computes (${fallSeasonEnd(2026)})`);
{
  // and currentYearProof itself refuses an in-season claim once the date
  // named is actually past that shared boundary (Thanksgiving 2026 + 1)
  const verdict = currentYearProof({
    sourceTier: SOURCE_TIERS.official_social,
    publishedAt: "2026-11-27",
    fetchedAt: null,
    text: "Last call for our pumpkin menu!",
    seasonYear: 2026,
  });
  ok(verdict === "none", `a post dated the day AFTER the season ends is not in-season proof, got "${verdict}"`);
}

if (fails.length) {
  console.error(`check-fall-evidence-rules: FAIL (${fails.length} of ${pass + fails.length})`);
  for (const m of fails) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-fall-evidence-rules: OK — ${pass} assertions (old/undated evidence stays insufficient, a live official listing is strong, name-only is rejected, a passed end date expires, and the season boundary is one shared law)`);
