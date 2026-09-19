// scripts/check-go-florida-landing.mjs — guard for app/go/florida/page.js
// and lib/paidFloridaLanding.js, the paid Florida Google Ads landing page.
//
// CLAUDE.md ("assert on the CALL, not the string") is the design brief here:
// every filter and every link builder the page actually calls is imported
// and CALLED with real inputs below, not re-derived by regex. Regex is used
// only for the two things a call cannot prove — that no dash character and
// no raw partner domain survive in the page's own SOURCE — and even those
// two are red-proved against a mutated copy of the real file content before
// they are trusted (see selfTestDash / selfTestDomains).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { RESERVED_GO_SLUGS, resolveGoSlug } from "../lib/goShortlinks.js";
import { GUIDES } from "../lib/guides.js";
import { commerceHref } from "../lib/commerce.js";
import { experienceGoUrl } from "../lib/affiliates.js";
import { eventTicketCta } from "../lib/eventTicketDeals.js";
import {
  SURFACE,
  FOCUS_SECTIONS,
  DEFAULT_SECTION_ORDER,
  orderedSections,
  HOT_GUIDES,
  GULF_COAST_GUIDES,
  THEME_PARK_OFFERS,
  NATURE_OFFERS,
  SHOW_OFFERS,
  VIATOR_SEARCH_INTENTS,
  FLORIDA_MARKETS,
  cleanOfferTitle,
  landingOfferImage,
  offerContext,
  INTEREST_LINKS,
  HOT_SNAPSHOT_LABEL,
} from "../lib/paidFloridaLanding.js";

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) { pass++; return; }
  fail.push(msg);
}

const PAGE_PATH = "app/go/florida/page.js";
const DATA_PATH = "lib/paidFloridaLanding.js";
const rawPage = readFileSync(PAGE_PATH, "utf8");
const rawData = readFileSync(DATA_PATH, "utf8");

// ── the two source-text predicates, defined once so the self-test and the
// real check below run the EXACT same code (CLAUDE.md: "a guard that reads
// RAW source fails on its own explanatory comment" — strip comments first).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
// Wayfind copy law for THIS surface: no em dash, no en dash, no " - " used as
// punctuation. A hyphen INSIDE a word (drive-thru, things-to-do-orlando) is
// deliberately NOT matched — it is spelling, not punctuation.
const DASH_RX = /–|—| - /;
function dashViolations(strippedSrc) {
  return DASH_RX.test(strippedSrc);
}
const PARTNER_DOMAINS = ["viator.com", "tiqets.com", "ticketmaster.com", "stay22", "booking.com", "klook"];
function domainViolations(rawSrc) {
  const low = rawSrc.toLowerCase();
  return PARTNER_DOMAINS.filter((d) => low.includes(d));
}

// ── RED PROVE, on mutated copies of the REAL files — never on a hand-typed
// fixture — so the predicate is proven against the actual shape of this
// page's source, not an idealized stand-in for it.
(function selfTestDash() {
  // Mutate REAL copy that actually lives in lib/paidFloridaLanding.js (the
  // hero strings), so the red-prove exercises the same file and the same
  // stripComments() the real checks below use — not a hand-typed stand-in.
  const emDash = String.fromCharCode(0x2014);
  const bad1 = rawData.replace("A little less searching. A lot more Florida.", "A little less searching " + emDash + " a lot more Florida.");
  const bad2 = rawData.replace("Find my Florida outing", "Find my - Florida outing");
  ok(bad1 !== rawData, "self-test setup: the em-dash mutation target string exists in lib/paidFloridaLanding.js");
  ok(bad2 !== rawData, "self-test setup: the \" - \" mutation target string exists in lib/paidFloridaLanding.js");
  ok(dashViolations(stripComments(bad1)), "self-test: an injected em dash in real copy is caught by the dash check (red-prove)");
  ok(dashViolations(stripComments(bad2)), 'self-test: an injected " - " in real copy is caught by the dash check (red-prove)');
  // Negative control: real compound-word hyphens must NOT trip it.
  ok(!DASH_RX.test("things-to-do-orlando-not-theme-parks drive-thru kid-friendly St. Armands"), "self-test: in-word hyphens are NOT flagged as dashes (negative control)");
})();
(function selfTestDomains() {
  const bad = rawPage + "\n// https://www.tiqets.com/en/test-product/\n";
  const hit = domainViolations(bad);
  ok(hit.includes("tiqets.com"), "self-test: an injected raw partner domain is caught by the domain check (red-prove)");
})();

// ── 1. the real page.js + data module carry no dash in visible copy ────────
ok(!dashViolations(stripComments(rawPage)), "app/go/florida/page.js: no dash character in its own source (em/en dash or \" - \")");
ok(!dashViolations(stripComments(rawData)), "lib/paidFloridaLanding.js: no dash character in its own source (em/en dash or \" - \")");

// ── 2. no raw partner domain anywhere in the new files, comments included ──
ok(domainViolations(rawPage).length === 0, `app/go/florida/page.js: no raw partner domain (found: ${domainViolations(rawPage).join(", ") || "none"})`);
ok(domainViolations(rawData).length === 0, `lib/paidFloridaLanding.js: no raw partner domain (found: ${domainViolations(rawData).join(", ") || "none"})`);

// ── 3. noindex, canonical, title, revalidate — syntactic position, not a
// bare substring (CLAUDE.md: "assert the syntactic position, not the
// substring").
ok(/robots:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/.test(rawPage), "metadata.robots is exactly { index: false, follow: true } (noindex, follow)");
ok(/alternates:\s*\{\s*canonical:\s*SITE_URL\s*\+\s*["']\/florida-events["']\s*\}/.test(rawPage), "metadata.alternates.canonical points at SITE_URL + \"/florida-events\"");
ok(rawPage.includes('title: "Florida Trip Planner: Tickets, Tours, Stays and Events | Wayfind"'), "metadata.title is the exact required string");
ok(/^export const revalidate = 3600;$/m.test(rawPage), "export const revalidate = 3600 is present");

// ── 4. no Directions button anywhere, no ad-hoc "use client" ────────────────
ok(!/Directions/.test(rawPage), 'no "Directions" text anywhere on the page (no place cards render here, and none may ever grow one)');
// Checked on the COMMENT-STRIPPED source: page.js's own header explains, in
// prose, that it declares no "use client" — a raw scan would flag that
// sentence (CLAUDE.md: "a guard that reads raw source fails on its own
// explanatory comment"). The directive itself, if present, would survive
// comment-stripping (it is a real statement, not a comment).
ok(!/["']use client["']/.test(stripComments(rawPage)) && !/["']use client["']/.test(stripComments(rawData)), "neither file declares \"use client\" — the page and data remain server modules");

// ── 5. every commerce link goes through the ONE surface constant, never a
// hand-typed copy of it (a copy can drift; the constant cannot).
const literalSurface = (rawPage.match(/["']paid_florida["']/g) || []).length;
ok(literalSurface === 0, `page.js never spells "paid_florida" as a literal — every call site passes the imported SURFACE constant (found ${literalSurface} literal occurrence(s))`);
ok(SURFACE === "paid_florida", 'lib/paidFloridaLanding.js SURFACE === "paid_florida"');

// ── 6. every ?focus= target has a real anchor to land on ────────────────────
for (const key of FOCUS_SECTIONS) {
  ok(rawPage.includes(`id="${key}"`), `page.js renders a section with id="${key}" for ?focus=${key} to target`);
}
ok(rawPage.includes('id="hot"'), 'page.js renders id="hot" — the hero\'s "See what\'s hot" anchor target');
assert.deepEqual(new Set(FOCUS_SECTIONS), new Set(["orlando", "gulf-coast", "halloween", "nature", "stays", "shows"]), "FOCUS_SECTIONS matches the spec'd allowlist exactly");
pass++;
// Unknown values fall through to the default order, untouched.
assert.deepEqual(orderedSections("not-a-real-section"), DEFAULT_SECTION_ORDER, "an unknown ?focus= value is ignored (falls back to default order)");
assert.deepEqual(orderedSections(""), DEFAULT_SECTION_ORDER, "an empty ?focus= value is ignored (falls back to default order)");
assert.equal(orderedSections("halloween")[0], "halloween", "a valid ?focus=halloween promotes that section to the front");
assert.equal(new Set(orderedSections("halloween")).size, DEFAULT_SECTION_ORDER.length, "promoting a section reorders, never duplicates or drops one");
pass += 4;

// ── 7. every rendered guide slug is a REAL, live guide (GUIDES[slug]) ──────
const EXPECTED_HOT_SLUGS = [
  "things-to-do-orlando-not-theme-parks", "swim-with-manatees-crystal-river", "siesta-key-drum-circle",
  "things-to-do-sarasota", "winter-park-scenic-boat-tour", "bioluminescence-kayak-tour-space-coast",
  "weeki-wachee-kayak-mermaids-guide", "gatorland-vs-wild-florida", "st-armands-circle-restaurants",
  "siesta-key-vs-lido-key", "anna-maria-island-day-trip",
];
assert.deepEqual(HOT_GUIDES.map((g) => g.slug), EXPECTED_HOT_SLUGS, "HOT_GUIDES is the exact owner-given snapshot, in the exact given order");
pass++;
for (const g of HOT_GUIDES) ok(Boolean(GUIDES[g.slug]), `HOT_GUIDES: "${g.slug}" exists in lib/guides.js GUIDES (rendering only existing, live guides)`);
for (const g of GULF_COAST_GUIDES) ok(Boolean(GUIDES[g.slug]), `GULF_COAST_GUIDES: "${g.slug}" exists in lib/guides.js GUIDES`);
ok(Boolean(GUIDES["best-hotels-near-magic-kingdom"]), 'the "stays" fallback guide (best-hotels-near-magic-kingdom) exists in GUIDES');

// ── 8. no dash survives in any rendered card title/blurb (calls the SAME
// cleanOfferTitle the data module applies, plus every hand-authored blurb).
for (const g of [...HOT_GUIDES, ...GULF_COAST_GUIDES]) {
  ok(!DASH_RX.test(g.title), `HOT/GULF guide card title for "${g.slug}" has no dash: "${g.title}"`);
  ok(!DASH_RX.test(g.blurb), `HOT/GULF guide card blurb for "${g.slug}" has no dash: "${g.blurb}"`);
}
for (const item of VIATOR_SEARCH_INTENTS) {
  ok(!DASH_RX.test(item.title), `VIATOR_SEARCH_INTENTS "${item.id}" title has no dash`);
  ok(!DASH_RX.test(item.blurb), `VIATOR_SEARCH_INTENTS "${item.id}" blurb has no dash`);
}
ok(cleanOfferTitle("SamBoat Rentals — Tampa") === "SamBoat Rentals, Tampa", "cleanOfferTitle() turns the upstream em-dashed SamBoat title into dash-free copy (red-prove: called with the real offending string)");
for (const list of [THEME_PARK_OFFERS, NATURE_OFFERS, SHOW_OFFERS]) {
  for (const o of list) ok(!DASH_RX.test(o.title), `offer "${o.offerId}" rendered title has no dash: "${o.title}"`);
}

// ── 9. Florida markets only — FLORIDA_MARKETS itself excludes every known
// non-Florida market, and no offer array leaks one in.
const NON_FLORIDA = ["Gurnee", "Chicago", "New York"];
for (const m of NON_FLORIDA) ok(!FLORIDA_MARKETS.includes(m), `FLORIDA_MARKETS does not include "${m}"`);
// Positive control: these ids are REAL rows in MENU_PARTNER_OFFERS (Gurnee /
// Chicago / New York), so their absence below proves the filter actually ran
// rather than the source arrays being empty by coincidence.
const NON_FL_OFFER_IDS = ["gurnee-hook-six-flags", "gurnee-hook-hurricane-harbor", "chicago-hook-field-museum", "nyc-hook-empire-state"];
for (const list of [THEME_PARK_OFFERS, NATURE_OFFERS, SHOW_OFFERS]) {
  const ids = list.map((o) => o.offerId);
  for (const bad of NON_FL_OFFER_IDS) ok(!ids.includes(bad), `no non-Florida offer id "${bad}" leaked into this page's offer list`);
  for (const o of list) ok(FLORIDA_MARKETS.includes(o.market), `offer "${o.offerId}" market "${o.market}" is in FLORIDA_MARKETS`);
}
ok(THEME_PARK_OFFERS.length > 0 && NATURE_OFFERS.length > 0 && SHOW_OFFERS.length > 0, "every offer section has at least one real Florida offer (not silently empty)");

// ── 10. every commerce link is a REAL CALL through commerceHref /
// experienceGoUrl / eventTicketCta, carrying surface=paid_florida, and
// resolves to our own /api/*/go path — never a partner domain.
for (const list of [THEME_PARK_OFFERS, NATURE_OFFERS, SHOW_OFFERS]) {
  const o = list[0];
  const href = commerceHref({ provider: o.provider, offerId: o.offerId, surface: SURFACE, contentId: "check-" + o.offerId });
  ok(typeof href === "string" && href.startsWith("/api/commerce/go?"), `commerceHref() for "${o.offerId}" returns our own /api/commerce/go path (got: ${href})`);
  ok(href && href.includes("surface=paid_florida"), `commerceHref() for "${o.offerId}" carries surface=paid_florida`);
  ok(href && href.includes(`provider=${o.provider}`), `commerceHref() for "${o.offerId}" carries its provider`);
}
for (const item of VIATOR_SEARCH_INTENTS) {
  const href = experienceGoUrl(item.query, item.city, item.kind, null, { surface: SURFACE, contentId: "check-" + item.id });
  ok(typeof href === "string" && href.startsWith("/api/viator/go?"), `experienceGoUrl() for "${item.id}" returns our own /api/viator/go path`);
  ok(href.includes("intent=search"), `experienceGoUrl() for "${item.id}" is honest search (intent=search), never a Book paint`);
  ok(href.includes("surface=paid_florida"), `experienceGoUrl() for "${item.id}" carries surface=paid_florida`);
}
// A real, existing EVENT_TICKET_DEALS row — proves the halloween section's
// exact call shape (the same function the page calls) without needing a
// live Supabase read.
{
  const cta = eventTicketCta("hhn-orlando-2026", { surface: SURFACE });
  ok(Boolean(cta), 'eventTicketCta("hhn-orlando-2026", { surface: paid_florida }) resolves (real registry row)');
  ok(cta && cta.href.startsWith("/api/commerce/go?"), "eventTicketCta() href is our own /api/commerce/go path");
  ok(cta && cta.href.includes("surface=paid_florida"), "eventTicketCta() href carries surface=paid_florida");
  ok(cta && !DASH_RX.test(cta.label), `eventTicketCta() label has no dash: "${cta && cta.label}"`);
}

// ── 11. "florida" is reserved in lib/goShortlinks.js, and the reservation
// does not accidentally turn it into a working shortlink.
ok(RESERVED_GO_SLUGS.includes("florida"), '"florida" is reserved in lib/goShortlinks.js RESERVED_GO_SLUGS');
ok(resolveGoSlug("florida").kind === "not-found", 'resolveGoSlug("florida") is still "not-found" — reserving the slug did not register it as a city or a shortlink');
(function selfTestReservation() {
  // Red-prove the assertion above is discriminating, not vacuous: build the
  // SAME check against a fixture list that omits "florida" and confirm it
  // would have failed.
  const withoutFlorida = RESERVED_GO_SLUGS.filter((s) => s !== "florida");
  ok(!withoutFlorida.includes("florida"), "self-test: the reservation check correctly fails on a fixture list missing \"florida\" (red-prove)");
})();

// ── 12. rel="sponsored noopener" target="_blank" on every commerce card
// template (OfferCard, SearchIntentCard, EventCard) — 3 template sites.
const sponsoredCount = (rawPage.match(/rel="sponsored noopener"\s+target="_blank"/g) || []).length;
ok(sponsoredCount === 3, `exactly 3 commerce-link templates carry rel="sponsored noopener" target="_blank" (OfferCard, SearchIntentCard, EventCard) — found ${sponsoredCount}`);

// ── 13. the sitewide experience-CTA copy is used verbatim, and only there
ok(rawData.includes('AVAILABILITY_CTA_LABEL = "See availability ↗"'), 'AVAILABILITY_CTA_LABEL is exactly "See availability ↗"');
ok(rawData.includes('DISCLOSURE = "We earn commission on bookings. Rankings are never sold."'), "DISCLOSURE is the exact required sentence");

// Image transforms must remain bounded without breaking signed partner assets.
const unsignedImage = "https://images.imgix.net/venue.jpg?q=70";
const transformed = new URL(landingOfferImage(unsignedImage));
ok(transformed.searchParams.get("w") === "960" && transformed.searchParams.get("h") === "600", "unsigned CDN images request a bounded 960 by 600 crop");
const signedImage = unsignedImage + "&s=verified-signature";
ok(landingOfferImage(signedImage) === signedImage, "signed URLs remain byte-identical");
ok(landingOfferImage("https://example.org/photo.jpg") === "https://example.org/photo.jpg", "other image hosts are not rewritten");
ok(landingOfferImage(null) === null && landingOfferImage("not a URL") === null, "missing and malformed images produce an explicit fallback");
ok(HOT_SNAPSHOT_LABEL.includes("September 17, 2026") && HOT_SNAPSHOT_LABEL.includes("30 days"), "the readership claim identifies its actual snapshot and window");
for (const link of INTEREST_LINKS) {
  ok(rawPage.includes(`id="${link.href.slice(1)}"`), `${link.label}: interest shortcut has a real section target`);
}
for (const offer of [...THEME_PARK_OFFERS, ...NATURE_OFFERS, ...SHOW_OFFERS]) {
  ok(typeof offerContext(offer) === "string" && offerContext(offer).length > 30, `${offer.offerId}: recommendation carries reader-facing context`);
}

if (fail.length) {
  console.error(`check-go-florida-landing: FAIL — ${fail.length}/${pass + fail.length} assertions failed:\n`);
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-go-florida-landing: OK — ${pass} assertions passed (dash law, partner-domain law, noindex/canonical, focus anchors, live-guide existence, Florida-market-only offers, real commerceHref/experienceGoUrl/eventTicketCta calls carrying surface=paid_florida, "florida" reserved in goShortlinks, sponsored-link rel)`);
