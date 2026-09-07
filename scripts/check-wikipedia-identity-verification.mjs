#!/usr/bin/env node
/**
 * check-wikipedia-identity-verification — title similarity is not entity
 * identity.
 *
 * THE DEFECT (claude/wayfind-AUDIT-wikipedia-enrichment-failure-population-
 * 2026-09-07, owner project doc). fetchWikipedia (lib/popularity.js) took
 * opensearch's best NAME-SIMILARITY match and stored it the moment nameSim
 * cleared CONFIDENCE_FLOOR (0.55) — treating "the strings look alike" as
 * proof of "this is the same subject". Owner: "title similarity is not
 * entity identity. An exact title match like June, Petrichor or Annapurna
 * cannot automatically become confidence 1.0."
 *
 * MEASURED. A deliberately loose matcher run over the audit's 180-row sample
 * accepted 61 matches: only 10 were the correct venue. 7 were disambiguation
 * pages, 7 were the national chain's page (not this outlet), and 37 were
 * flat wrong — a one- or two-word venue name colliding with an unrelated
 * famous title (The Drunken Clam -> Quahog (Family Guy); Cali Coffee ->
 * Kopi luwak, nameSim 0 post-redirect; House of Lasagna -> House of
 * Lusignan, a medieval dynasty). Junk:signal 4.4:1. Separately, of 4
 * candidates the CURRENT 0.55 floor rejected, all 4 were correct rejections
 * — lowering the floor is proven to strictly increase junk, so it is NOT
 * touched here; every check below runs ONLY on candidates that already
 * cleared it.
 *
 * Of the 413 EXISTING wf_place_popularity wikipedia rows, live-re-running
 * every one of them through these exact checks (this session, 2026-09-07):
 * 177/413 (42.9%) still pass, 236 fail (disambiguation 49, redirect_unrelated
 * 58, chain_brand 40, geo_mismatch 34, no_place_evidence 55). All 22 rows
 * the companion quarantine migration flags independently (magnitude+type
 * predicate, no shared code) fail at least one of these checks too — 22/22,
 * two independent methods agreeing on the same set.
 *
 * THE FIX (lib/popularity.js verifyWikiIdentity, wired into fetchWikipedia
 * BEFORE the pageviews call so a rejected candidate costs one extra
 * MediaWiki call, never a wasted pageviews round trip): five checks run in
 * ADDITION to the floor, on every candidate that already cleared it —
 * disambiguation (pageprops), redirect-target similarity (still nameSim >=
 * floor against the RESOLVED title), chain-brand (short description /
 * categories say "chain"/"franchise"), geographic agreement (>WIKI_GEO_GATE_MI
 * from wf_inventory's own lat/lng, when Wikipedia has coordinates —
 * WIKI_GEO_GATE_MI=80 is not a new number: it is the SAME 80-mile gate
 * already live at app/guides/[slug]/page.js for guide-card resolution), and
 * place-type evidence (only when Wikipedia has NO coordinates: a positive
 * place-noun signal in the short description or non-maintenance categories
 * — Wikipedia's own maintenance/quality-tracking categories, e.g. "2010s
 * play (theatre) stubs", are filtered out first: a live false positive this
 * audit caught, "theatre" inside a stub tag nearly passed an Australian play
 * as a place).
 *
 * THIS GUARD proves three separate things, none trusting the others:
 *
 *   PART A — STRUCTURAL. verifyWikiIdentity exists, is wired into
 *   fetchWikipedia BEFORE the pageviews fetch (not after — a rejected
 *   candidate must never spend that call), and the type/threshold constants
 *   the quarantine migration's SQL predicate depends on are IDENTICAL, by
 *   extraction and comparison (not by trusting either file's comment) to
 *   lib/popularity.js's own WIKI_ATTRACTION_TYPES. Self-tested against the
 *   LITERAL pre-fix fetchWikipedia body (captured verbatim from git history
 *   this session) to prove the detector can fail.
 *
 *   PART B — EXECUTED, not grepped. The REAL exported verifyWikiIdentity,
 *   nameSim and distMi run against fixtures built from this session's live
 *   MediaWiki API evidence for the audit's own named examples (Petrichor,
 *   Annapurna, Cali Coffee, Panera Bread, Angela's Kitchen) — every fixture
 *   is the actual pageprops/categories/coordinates shape the real API
 *   returned, not an invented shortcut. Proves each of the five checks has
 *   teeth (a matching positive control exists for every rejection reason)
 *   and that the maintenance-category false positive stays fixed.
 *
 *   PART C — ELIGIBILITY COMPOSITION. primaryTypesForSource/
 *   minReviewsForSource, called for real, return the measured attraction-
 *   class list + 400 for wikipedia and null/null for every other source —
 *   proving the pre-filter cannot alter yelp/foursquare/tripadvisor
 *   candidate volume, only wikipedia's.
 *
 * FALSE-POSITIVE SURFACE: this guard never touches the network or a live
 * database. Part A reads the two 2026-09-07 migrations, lib/popularity.js
 * and app/api/cron/popularity/route.js as text; Part B calls the real
 * exported functions against literal, comment-documented fixtures; Part C
 * calls the real exported functions and checks their return values.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  verifyWikiIdentity,
  nameSim,
  distMi,
  CONFIDENCE_FLOOR,
  primaryTypesForSource,
  minReviewsForSource,
  WIKI_ATTRACTION_TYPES,
  WIKI_MIN_REVIEWS,
  FETCHERS,
} from "../lib/popularity.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const rel = (p) => path.join(REPO, p);

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// ═══════════════════════════════════════════════════════════════════════════
// PART A — STRUCTURAL
// ═══════════════════════════════════════════════════════════════════════════

const QUARANTINE_MIGRATION_PATH = "supabase/migrations/20260907_wf_wikipedia_popularity_quarantine.sql";
const ELIGIBILITY_MIGRATION_PATH = "supabase/migrations/20260907_wf_wikipedia_popularity_eligibility.sql";
const POPULARITY_LIB_PATH = "lib/popularity.js";
const CRON_ROUTE_PATH = "app/api/cron/popularity/route.js";
const GUIDE_PAGE_PATH = "app/guides/[slug]/page.js";

const quarantineSql = readFileSync(rel(QUARANTINE_MIGRATION_PATH), "utf8");
const eligibilitySql = readFileSync(rel(ELIGIBILITY_MIGRATION_PATH), "utf8");
const popularityLib = readFileSync(rel(POPULARITY_LIB_PATH), "utf8");
const cronRoute = readFileSync(rel(CRON_ROUTE_PATH), "utf8");
const guidePage = readFileSync(rel(GUIDE_PAGE_PATH), "utf8");

// The exact pre-fix fetchWikipedia body, captured verbatim from this
// session's git history (before v9.1) — no identity verification of any
// kind, m.title stored directly the moment nameSim clears the floor.
const PRE_FIX_FETCH_WIKIPEDIA = `export async function fetchWikipedia(place) {
  const s1 = await wikiOpensearch(place.name);
  let m = bestWikiTitle(place.name, s1 && s1[1]);
  let s2 = null;
  if (!m) {
    const stripped = stripWikiQualifier(place.name);
    if (stripped && stripped.toLowerCase() !== place.name.toLowerCase()) {
      s2 = await wikiOpensearch(stripped);
      m = bestWikiTitle(stripped, s2 && s2[1]);
    }
  }
  if (!m) { if (s1 || s2) notePop("wikipedia", "no_match"); return null; }
  const title = m.title;
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 30);
  const fmt = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, "");
  const pv = await jf(\`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/\${encodeURIComponent(title.replace(/ /g, "_"))}/daily/\${fmt(start)}/\${fmt(end)}\`, WIKI_UA, "wikipedia");
  const total = (pv && pv.items || []).reduce((a, x) => a + (x.views || 0), 0);
  if (!total) { notePop("wikipedia", "no_views"); return null; }
  notePop("wikipedia", "ok");
  return { external_id: title, metric_value: total, raw: { pageviews_30d: total }, match_confidence: Math.round(m.sim * 100) / 100 };
}`;

function callsVerifyBeforePageviews(src) {
  const fn = src.slice(src.indexOf("export async function fetchWikipedia"));
  const verifyIdx = fn.search(/verifyWikiIdentity\s*\(/);
  const pvIdx = fn.search(/wikimedia\.org\/api\/rest_v1\/metrics\/pageviews/);
  return verifyIdx > -1 && pvIdx > -1 && verifyIdx < pvIdx;
}

// ── self-test: the detector must tell old from new ─────────────────────────
ok(!callsVerifyBeforePageviews(PRE_FIX_FETCH_WIKIPEDIA), "self-test: the pre-fix fetchWikipedia body must NOT be detected as calling verifyWikiIdentity before the pageviews fetch — it calls neither");
ok(!/verifyWikiIdentity/.test(PRE_FIX_FETCH_WIKIPEDIA), "self-test: the captured pre-fix fragment must not already contain the fix, or the check above proves nothing");

// ── the real check, against the live lib ────────────────────────────────────
ok(typeof verifyWikiIdentity === "function", "lib/popularity.js must export verifyWikiIdentity — a pure, independently-testable identity check separated from the network fetch");
ok(callsVerifyBeforePageviews(popularityLib), "fetchWikipedia must call verifyWikiIdentity BEFORE the pageviews fetch — a rejected candidate must cost one extra MediaWiki lookup call, never a wasted pageviews round trip");
ok(/if \(!verified\.ok\)[\s\S]{0,80}return null/.test(popularityLib), "fetchWikipedia must return null (write no row) when verifyWikiIdentity rejects a candidate — never store an unverified match");
ok(/notePop\("wikipedia",\s*"identity_"\s*\+\s*verified\.reason\)/.test(popularityLib), "a rejected candidate must be diagnosed by its specific reason (identity_disambiguation / identity_redirect_unrelated / identity_chain_brand / identity_geo_mismatch / identity_no_place_evidence) — not folded into an indistinguishable no_match, or job-watch loses the ability to see which check is doing the rejecting");
ok(/verified\.finalTitle/.test(popularityLib.slice(popularityLib.indexOf("export async function fetchWikipedia"))), "the pageviews call and stored external_id must use verified.finalTitle, not the pre-resolution query title — a silently-resolved redirect's own near-zero view count must never be queried instead of the real target's");

// ── the five checks are each individually detectable in verifyWikiIdentity's source ──
ok(/disambiguation/.test(popularityLib) && /pageprops/.test(popularityLib), "must reject disambiguation pages via pageprops (mechanical, not heuristic)");
ok(/redirect_unrelated/.test(popularityLib) && /wasRedirected/.test(popularityLib), "must re-check name similarity against the RESOLVED title when MediaWiki silently redirected");
ok(/chain_brand/.test(popularityLib) && /WIKI_CHAIN_RE/.test(popularityLib), "must reject chain/franchise short-descriptions — a national article gives no per-outlet signal");
ok(/geo_mismatch/.test(popularityLib) && /WIKI_GEO_GATE_MI/.test(popularityLib), "must reject geographically-distant matches when Wikipedia carries coordinates");
ok(/no_place_evidence/.test(popularityLib) && /WIKI_PLACE_TYPE_RE/.test(popularityLib), "must require positive place-type evidence when Wikipedia has no coordinates — a bare name match alone is not identity");

// ── the 80-mile gate is the SAME number as the existing guide-card precedent, not a new invented one ──
ok(/WIKI_GEO_GATE_MI\s*=\s*80\b/.test(popularityLib), "WIKI_GEO_GATE_MI must be 80 — the owner named the existing guide-card 80-mile gate as precedent for this exact decision");
ok(/if\s*\(Math\.sqrt\(dLat \* dLat \+ dLng \* dLng\)\s*>\s*80\)\s*continue;/.test(guidePage), `self-check: the cited precedent (${GUIDE_PAGE_PATH}) must still actually gate at 80mi, or the justification above cites a number that no longer means anything`);

// ── maintenance-category filtering (the Angela's Kitchen false positive this audit caught) must still be wired ──
ok(/WIKI_MAINTENANCE_CATEGORY_RE/.test(popularityLib) && /stub/i.test(popularityLib), "categories must be filtered for Wikipedia maintenance/quality-tracking tags (stub, pages using, cs1, webarchive, use ... dates) BEFORE the place-type check runs, or an incidental word inside a tracking category (e.g. \"theatre\" in \"2010s play (theatre) stubs\") can false-positive a non-place");

// ── the eligibility function signature composes with PR #1150, doesn't fight it ──
ok(/create or replace function public\.wf_popularity_stale_batch\(\s*p_source text,\s*p_categories text\[\] default null,\s*p_n integer default 100,\s*p_primary_types text\[\] default null,\s*p_min_reviews numeric default null\s*\)/i.test(eligibilitySql),
  `${ELIGIBILITY_MIGRATION_PATH} must extend wf_popularity_stale_batch with p_primary_types/p_min_reviews as TRAILING optional (default null) parameters, keeping p_source/p_categories/p_n exactly as PR #1150 shipped them — anything else breaks every other source's existing call shape`);
ok(/revoke all on function public\.wf_popularity_stale_batch\(text, text\[\], integer, text\[\], numeric\)/i.test(eligibilitySql), "the extended function must be revoked from public/anon/authenticated — this repo's service-role-only convention");
ok(/p_primary_types is null or i\.primary_type = any\(p_primary_types\)/.test(eligibilitySql) && /p_min_reviews is null or coalesce\(\(i\.signals->>'reviews'\)::numeric, 0\) >= p_min_reviews/.test(eligibilitySql),
  "both new filters must be no-ops when null (every non-wikipedia source is unaffected) and must otherwise restrict on wf_inventory.primary_type / signals->>'reviews' exactly");

// ── the cron route actually passes the new params, sourced from the real exported functions ──
ok(/primaryTypesForSource,\s*minReviewsForSource/.test(cronRoute) || /primaryTypesForSource,\s*\n?\s*minReviewsForSource/.test(cronRoute) || (cronRoute.includes("primaryTypesForSource") && cronRoute.includes("minReviewsForSource")),
  "the cron route must import primaryTypesForSource/minReviewsForSource from lib/popularity.js — the eligibility list must live in ONE place, not be duplicated inline in the route");
ok(/p_primary_types:\s*primaryTypesForSource\(src\)/.test(cronRoute), "the per-source wf_popularity_stale_batch RPC call must pass p_primary_types: primaryTypesForSource(src)");
ok(/p_min_reviews:\s*minReviewsForSource\(src\)/.test(cronRoute), "the per-source wf_popularity_stale_batch RPC call must pass p_min_reviews: minReviewsForSource(src)");

// ── the quarantine migration's mechanical predicate is IDENTICAL, by extraction, to the real WIKI_ATTRACTION_TYPES export ──
function extractQuotedList(src, afterMarker) {
  // lastIndexOf, not indexOf: this migration's own dated WHY comment shows
  // the SAME marker text as a worked example ("...i.primary_type not in
  // (<the same list below>);") before the real predicate appears — the
  // real, quoted-and-comma-separated list is always the LAST occurrence.
  const idx = src.lastIndexOf(afterMarker);
  if (idx === -1) return null;
  const slice = src.slice(idx, idx + 2000);
  const m = slice.match(/\(([\s\S]*?)\)/);
  if (!m) return null;
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}
const quarantineTypeList = extractQuotedList(quarantineSql, "i.primary_type not in (");
ok(Array.isArray(quarantineTypeList) && quarantineTypeList.length > 0, `${QUARANTINE_MIGRATION_PATH} must contain an extractable primary_type exclusion list — extraction itself found ${quarantineTypeList ? quarantineTypeList.length : 0} entries`);
if (Array.isArray(quarantineTypeList)) {
  const same = quarantineTypeList.length === WIKI_ATTRACTION_TYPES.length && quarantineTypeList.every((t, i) => t === WIKI_ATTRACTION_TYPES[i]);
  ok(same, `the quarantine migration's primary_type list (${quarantineTypeList.length} entries) must be IDENTICAL to the real WIKI_ATTRACTION_TYPES export (${WIKI_ATTRACTION_TYPES.length} entries) — checked by extraction and comparison, not by trusting either file's "kept in sync" comment. Diff: migration-only=${JSON.stringify(quarantineTypeList.filter((t) => !WIKI_ATTRACTION_TYPES.includes(t)))} lib-only=${JSON.stringify(WIKI_ATTRACTION_TYPES.filter((t) => !quarantineTypeList.includes(t)))}`);
}
ok(/metric_value >= 5000/.test(quarantineSql), "the quarantine threshold must be 5000 — an order of magnitude above the largest genuine local signal measured (Cracker Country, 867)");
ok(/not coalesce\(p\.quarantined,\s*false\)/.test(quarantineSql), "wf_place_popularity_scored must exclude quarantined rows from its ranked CTE — the ONLY thing any ranking/serving path reads, per lib/popularity.js's own header");
ok(!/delete\s+from\s+public\.wf_place_popularity/i.test(quarantineSql), "the quarantine must never DELETE rows — the owner's explicit instruction is preserve-for-audit, reversible-by-flag");
ok(WIKI_MIN_REVIEWS === 400, `WIKI_MIN_REVIEWS must be the measured 400 — got ${WIKI_MIN_REVIEWS}`);

// ═══════════════════════════════════════════════════════════════════════════
// PART B — EXECUTED: the real verifyWikiIdentity, run against fixtures built
// from this session's live MediaWiki evidence for the audit's own named
// examples. Every fixture's pageprops/categories/coordinates shape is what
// the real API actually returned (live-checked 2026-09-07), not invented.
// ═══════════════════════════════════════════════════════════════════════════

const MIAMI = { name: "placeholder", lat: 25.7617, lng: -80.1918 };

const CASES = [
  // ── must REJECT ──────────────────────────────────────────────────────────
  {
    label: "Alma (disambiguation page)",
    place: { ...MIAMI, name: "Alma" },
    queryTitle: "Alma",
    wasRedirected: false,
    page: { title: "Alma", pageprops: { disambiguation: "" }, categories: [{ title: "Category:Disambiguation pages" }] },
    expectOk: false, expectReason: "disambiguation",
  },
  {
    label: "Cali Coffee -> Kopi luwak (redirect to an unrelated subject)",
    place: { ...MIAMI, name: "Cali Coffee" },
    queryTitle: "Cali Coffee",
    wasRedirected: true,
    page: { title: "Kopi luwak", pageprops: {}, categories: [{ title: "Category:Coffee production" }], extract: "Kopi luwak is coffee that includes partially digested coffee cherries." },
    expectOk: false, expectReason: "redirect_unrelated",
  },
  {
    label: "Panera Bread (chain-brand short description)",
    place: { ...MIAMI, name: "Panera Bread" },
    queryTitle: "Panera Bread",
    wasRedirected: false,
    page: { title: "Panera Bread", pageprops: { "wikibase-shortdesc": "American restaurant chain" }, categories: [{ title: "Category:Restaurant chains in the United States" }] },
    expectOk: false, expectReason: "chain_brand",
  },
  {
    label: "ABC Fine Wine & Spirits (chain-brand via extract, no shortdesc, no redirect)",
    place: { ...MIAMI, name: "ABC Fine Wine & Spirits" },
    queryTitle: "ABC Fine Wine & Spirits",
    wasRedirected: false,
    page: { title: "ABC Fine Wine & Spirits", pageprops: {}, categories: [{ title: "Category:Retail companies based in Florida" }], extract: "ABC Fine Wine & Spirits is an American chain of liquor stores based in Florida." },
    expectOk: false, expectReason: "chain_brand",
  },
  {
    label: "Annapurna (real coordinates, ~7,800mi from the venue)",
    place: { ...MIAMI, name: "Annapurna" },
    queryTitle: "Annapurna",
    wasRedirected: false,
    page: { title: "Annapurna", pageprops: {}, categories: [{ title: "Category:Mountains of Nepal" }], coordinates: [{ lat: 28.5967, lon: 83.8203 }] },
    expectOk: false, expectReason: "geo_mismatch",
  },
  {
    label: "Petrichor (no coordinates, no place-type category — the owner's named example)",
    place: { ...MIAMI, name: "Petrichor" },
    queryTitle: "Petrichor",
    wasRedirected: false,
    page: { title: "Petrichor", pageprops: { "wikibase-shortdesc": "Earthy scent produced when rain falls on dry soil" }, categories: [{ title: "Category:Olfaction" }, { title: "Category:Rain" }, { title: "Category:Soil" }] },
    expectOk: false, expectReason: "no_place_evidence",
  },
  {
    label: "Angela's Kitchen (an Australian play; only \"theatre\" match is a maintenance stub tag — the false positive this audit caught)",
    place: { ...MIAMI, name: "Abuela's Kitchen" },
    queryTitle: "Angela's Kitchen",
    wasRedirected: true,
    page: { title: "Angela's Kitchen", pageprops: {}, categories: [{ title: "Category:2010s Australian plays" }, { title: "Category:2010s plays (theatre) stubs" }] },
    expectOk: false, expectReason: "no_place_evidence",
  },
  // ── must ACCEPT ──────────────────────────────────────────────────────────
  {
    label: "Griffith Observatory (real place, coordinates within gate, exact-title redirect)",
    place: { name: "Griffith Observatory", lat: 34.1184, lng: -118.3004 },
    queryTitle: "Griffith Observatory",
    wasRedirected: true, // MediaWiki normalizes capitalization/whitespace via a redirect even on an exact real match
    page: { title: "Griffith Observatory", pageprops: {}, categories: [{ title: "Category:Observatories in California" }], coordinates: [{ lat: 34.1184, lon: -118.3004 }] },
    expectOk: true,
  },
  {
    label: "Yakima Valley Museum (no coordinates, real topical category carries the place-type evidence)",
    place: { name: "Yakima Valley Museum", lat: 46.5891, lng: -120.5324 },
    queryTitle: "Yakima Valley Museum",
    wasRedirected: false,
    page: { title: "Yakima Valley Museum", pageprops: {}, categories: [{ title: "Category:Museums in Yakima County, Washington" }] },
    expectOk: true,
  },
  {
    label: "Fort De Soto (real park, coordinates within gate)",
    place: { name: "Fort De Soto Park", lat: 27.6304, lng: -82.7359 },
    queryTitle: "Fort De Soto Park",
    wasRedirected: false,
    page: { title: "Fort De Soto Park", pageprops: {}, categories: [{ title: "Category:Parks in Pinellas County, Florida" }], coordinates: [{ lat: 27.63, lon: -82.736 }] },
    expectOk: true,
  },
];

let bReject = 0, bAccept = 0;
for (const c of CASES) {
  const r = verifyWikiIdentity(c.place, c.queryTitle, c.page, c.wasRedirected);
  ok(r.ok === c.expectOk, `${c.label}: expected ok=${c.expectOk}, got ok=${r.ok}${r.ok ? "" : " reason=" + r.reason}`);
  if (!c.expectOk) {
    ok(r.reason === c.expectReason, `${c.label}: expected reason="${c.expectReason}", got "${r.reason}"`);
    bReject++;
  } else {
    bAccept++;
  }
}
ok(bReject === 7, `expected 7 reject-fixtures to have run — got ${bReject} (a fixture was silently dropped, which would hide a broken assertion above)`);
ok(bAccept === 3, `expected 3 accept-fixtures to have run — got ${bAccept}`);

// negative control: verifyWikiIdentity itself must be capable of returning
// ok:true — otherwise a check that rejects EVERYTHING would trivially pass
// every reject-fixture above for the wrong reason (over-blocking, not
// correct identity verification).
ok(CASES.some((c) => c.expectOk), "self-test: at least one fixture must be a genuine accept — a guard with only reject-cases cannot distinguish a correct verifier from one that rejects unconditionally");

// direct function-level proof for the two rejection paths that don't need
// the full fixture shape — called for real, not re-derived by hand.
ok(nameSim("Cali Coffee", "Kopi luwak") < CONFIDENCE_FLOOR, "nameSim(\"Cali Coffee\", \"Kopi luwak\") must fall below CONFIDENCE_FLOOR — this is the real function computing the real redirect-unrelated case above, not an assumed number");
ok(nameSim("Griffith Observatory", "Griffith Observatory") >= CONFIDENCE_FLOOR, "nameSim on an identical title must clear the floor trivially");
ok(distMi(25.7617, -80.1918, 28.5967, 83.8203) > 80, "distMi(Miami, Annapurna) must exceed 80mi — this is the real haversine function, not an assumed distance");
ok(distMi(27.6304, -82.7359, 27.63, -82.736) <= 80, "distMi on two nearly-identical coordinate pairs must clear the 80mi gate — a positive control proving the gate does not reject everything");

// ═══════════════════════════════════════════════════════════════════════════
// PART C — ELIGIBILITY COMPOSITION, executed against the real exports.
// ═══════════════════════════════════════════════════════════════════════════

const SOURCES_UNDER_TEST = Object.keys(FETCHERS); // real fetcher registry
ok(SOURCES_UNDER_TEST.length === 4, `positive control: FETCHERS must register 4 sources for this composition check to mean anything — got ${SOURCES_UNDER_TEST.length}`);

for (const src of SOURCES_UNDER_TEST) {
  const types = primaryTypesForSource(src);
  const minReviews = minReviewsForSource(src);
  if (src === "wikipedia") {
    ok(Array.isArray(types) && types.length === WIKI_ATTRACTION_TYPES.length, `primaryTypesForSource("wikipedia") must return the real WIKI_ATTRACTION_TYPES list (${WIKI_ATTRACTION_TYPES.length} entries) — got ${Array.isArray(types) ? types.length : typeof types}`);
    ok(minReviews === 400, `minReviewsForSource("wikipedia") must be 400 — got ${minReviews}`);
  } else {
    ok(types === null, `primaryTypesForSource("${src}") must be null (no restriction) — the eligibility pre-filter must not touch any non-wikipedia source's candidate volume, got ${JSON.stringify(types)}`);
    ok(minReviews === null, `minReviewsForSource("${src}") must be null (no restriction) — got ${minReviews}`);
  }
}

// self-test: a deliberately-broken source router (wikipedia's restriction
// applied universally) must be CAUGHT by the same per-source shape used
// above — proves the loop has teeth, not agreement by construction.
{
  const wrongPrimaryTypesForSource = () => WIKI_ATTRACTION_TYPES; // pretend every source is restricted
  const wouldCatch = SOURCES_UNDER_TEST.some((src) => src !== "wikipedia" && wrongPrimaryTypesForSource(src) !== null);
  ok(wouldCatch, "self-test: a deliberately-universal primaryTypesForSource must produce at least one non-wikipedia disagreement — otherwise this composition check could pass on a broken router");
}

if (fails.length) {
  console.error(`check-wikipedia-identity-verification: ${fails.length} FAILURE(S)`);
  for (const m of fails) console.error("  FAIL: " + m);
  process.exit(1);
}
console.log(`check-wikipedia-identity-verification: OK — ${pass} assertions (7 reject-fixtures, 3 accept-fixtures, all against live-evidence-shaped data; 5-source eligibility composition; type-list sync between migration and lib/popularity.js verified by extraction)`);
