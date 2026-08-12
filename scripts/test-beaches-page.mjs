// scripts/test-beaches-page.mjs — locks the /beaches/[metro] shareable
// ranking (owner, 2026-07-21): real-metric why-lines, curated share photos
// with recorded reasons, honest conditions (no water-quality until sourced),
// OG card from the curated best picture.
import { readFileSync } from "fs";
import { BEACH_METROS, BEACH_SHARE_PHOTO, rankBeaches, beachWhy } from "../lib/beaches.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

ok(Object.keys(BEACH_METROS).length === 3, "three metro groups");
for (const k of Object.keys(BEACH_METROS)) {
  const p = BEACH_SHARE_PHOTO[k];
  ok(p && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(p.photo_ref), k + ": curated share photo is a real Google resource ref");
  ok(p && p.why && p.why.length > 20, k + ": the pick's reason is recorded (a standard to beat)");
}

const ranked = rankBeaches([
  { name: "A", rating: 4.8, reviews: 6457 },
  { name: "B", rating: 5, reviews: 21 },
  { name: "C", rating: 4.7, reviews: 9074 },
]);
ok(ranked[0].name !== "B", "a 5.0 from a handful never outranks proven depth (Bayesian)");
ok(ranked.every((b, i) => b.rank === i + 1), "ranks are 1..n");
const dd = rankBeaches([{ name: "Ben T Davis Beach", rating: 4.2, reviews: 1863 }, { name: "Ben T Davis beach", rating: 4.2, reviews: 656 }]);
ok(dd.length === 1 && dd[0].reviews === 1863, "same-name rows collapse to the strongest (case-insensitive)");
const why = beachWhy(ranked[0], "Sarasota");
ok(/\/10/.test(why) && /reviews/.test(why), "why-line speaks the metric");
ok(!/sand|water|crowd|clear|beautiful/i.test(why), "why-line never invents physical claims");

const page = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
ok(page.includes("wf_nearest_beaches"), "page reads the real beach engine");
ok(page.includes("generateStaticParams"), "three pages prerender (shareable, fast)");
ok(page.includes("/api/og/beaches?metro="), "OG share card wired into metadata");
const parts = readFileSync(new URL("../app/best-beaches/[metro]/parts.js", import.meta.url), "utf8");
// spec v6.54: rip-current and UV chips are REMOVED (product decision);
// every beach row carries its OWN live chips + Healthy-Beaches water quality
ok(!/rip current/i.test(parts) && !/uvIndexMax/.test(parts), "rip-current and UV render nowhere");
ok(parts.includes("BeachLiveChips") && parts.includes("mode=lite"), "each beach fetches its own water temp + wind + waves");
ok(parts.includes("wf_beach_water") && parts.includes("Advisory — check before swimming"), "water quality chip reads the Healthy-Beaches table, advisory-first");
ok(parts.includes("last known"), "stale readings say so");
ok(parts.includes("tested "), "every water reading shows its freshness");
ok(parts.includes("BackControl") && parts.includes("window.history.back()"), "sticky back control: history first, our fallback second");
const pageSrc2 = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
// RE-POINTED (commit bff5f05 "image-forward beach cards, water chips off the
// list (v6.60) (#291)"): the per-row <BeachLiveChips> was deliberately
// removed from the list ("they remain in the detail sheet"). The per-row
// correctness guarantee — a row/sheet shows ITS OWN beach's values, never
// the #1 beach's — now lives in app/home.js: the detail sheet's beach
// conditions are loaded via `loadBeachConditions(detail)` inside a
// `useEffect(..., [detail])` that resets state to null before every fetch,
// so each open is keyed to whichever place is actually open and can never
// carry over a different beach's reading. Verified against app/home.js.
ok(!pageSrc2.includes("<BeachLiveChips"), "v6.60: live water chips are OFF the list — the beach photo sells, chips live in the detail sheet");
{
  const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
  ok(/setBeachCond\(null\);\s*setBeachCondLoading\(true\);/.test(home) && /loadBeachConditions\(detail\)/.test(home) && /\[detail\]/.test(home.slice(home.indexOf("loadBeachConditions(detail)") - 400, home.indexOf("loadBeachConditions(detail)") + 400)),
    "chips render per beach's OWN values — the detail sheet resets to null and refetches loadBeachConditions(detail) on every [detail] change, so it can never show the #1 beach's values on another");
}
// THE RULE: verified editorial replaces the metric sentence (core law)
ok(pageSrc2.includes("editorialsFor(") && pageSrc2.includes("ed.why"), "verified wf_editorial rows replace the metric prose");
// RE-POINTED (same commit bff5f05): the "Plan it:" label was renamed to
// "Know before you go:" — same underlying fields (ed.watchOut/ed.goodToKnow),
// confirmed unchanged via `git show bff5f05^:app/best-beaches/[metro]/page.js`
// (only the label text changed), now collapsed behind "How we verified this".
ok(pageSrc2.includes("Know before you go:") && pageSrc2.includes("ed.watchOut, ed.goodToKnow") && pageSrc2.includes("How we verified this"), "know_before (ed.watchOut/ed.goodToKnow) renders as the 'Know before you go' line, collapsed behind the verify details");
ok(pageSrc2.includes("Sourced:"), "sources footnote renders (transparency = the brand)");
ok(/water QUALITY[\s\S]{0,80}no wired source/i.test(parts), "water quality stays absent until a real source is wired");
ok(parts.includes("navigator.share"), "native share with clipboard fallback");
// THE FORMULA IS NO LONGER COPIED, so this no longer compares two copies of
// its constants (2026-08-06). It used to read `const m = 60; const C = 3.9;`
// out of both lib/google.js and lib/beaches.js and assert they matched — a
// real check while beaches.js inlined the formula, and one that could never
// have caught what actually went wrong: lib/landing.js held a THIRD
// implementation, using those same constants in a different expression, on a
// 0–50 scale, returning 39 for an unrated place. Same constants, different
// formula, and not one of the two files this looked at.
//
// Both now import lib/wayfindScore.js, so drift is impossible rather than
// detected. The assertion becomes the stronger one: that neither file has gone
// back to declaring its own. The FORMULA is exercised by running it, in
// scripts/check-ranking-integrity.mjs.
const gsrc = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const bsrc = readFileSync(new URL("../lib/beaches.js", import.meta.url), "utf8");
const importsShared = (src) => /from "\.\/wayfindScore\.js"/.test(src);
ok(importsShared(gsrc), "lib/google.js takes the Wayfind Score from lib/wayfindScore.js");
ok(importsShared(bsrc), "lib/beaches.js takes the Wayfind Score from lib/wayfindScore.js");
ok(!/function wayfindScore\s*\(/.test(bsrc), "lib/beaches.js no longer declares its own copy of the formula");
const og = readFileSync(new URL("../app/api/og/beaches/route.js", import.meta.url), "utf8");
// SUPERSEDED 2026-08-12 (owner: "I want every image we have used for text share
// deleted. I want to work on new ones."). The beaches OG card no longer paints a
// photo at all, so pinning it to the beach hero JPEG would fail the build for
// obeying that instruction. The image itself still ships — the beaches PAGE uses
// it — it is only the SHARE render that went photo-free.
//
// The claim underneath was "the share card and the page do not drift apart".
// That is now held one level up by check-share-card.mjs, which asserts NO
// share/OG renderer references any photo — a stronger invariant than matching
// one filename. What is left to assert here is that this route did not quietly
// grow its own art while the rest went bare.
ok(!/\/cards\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)/.test(og.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")),
   "the beaches share card must stay photo-free until the new design lands (owner, 2026-08-12)");
// SUPERSEDED 2026-08-12 — the route no longer constructs its own ImageResponse
// because there is one share card now (app/api/og/card.jsx) and every surface
// calls shareCardResponse(). The claim underneath was "this is a real dynamic
// image, not a static file", and going through the shared renderer proves that
// more strongly than owning a constructor: the model this route hands over
// carries the live beach count and review total.
ok(og.includes("shareCardResponse") && og.includes("beachesModel"),
   "the beaches share card must render through the one renderer with the live ranking's own numbers");
ok(!/["'`][^"'`]*\.(png|jpe?g|webp)["'`]/.test(og), "no static file may stand in for the beaches share card");


// RE-POINTED (commit 3b9005b "fix(revenue): render tours CLIENT-SIDE so they
// actually appear (v6.61) (#302)"): the SSR/build-time read of wf_experiences
// returned empty (no service key at prerender), so the tours rail moved to a
// client island, TourStrip (app/components/TourStrip.js), which fetches
// /api/experiences at runtime; the server-only read now lives in
// lib/experiencesServe.js (serveExperiences), called only from the API route.
// Every guarantee below still holds, just re-homed to where the behavior
// actually lives now.
{
  const src = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
  ok(src.includes("<TourStrip") && src.includes("waterOnly"), "the beach tours render via the client TourStrip (water-only)");
  const ts = readFileSync(new URL("../app/components/TourStrip.js", import.meta.url), "utf8");
  const serve = readFileSync(new URL("../lib/experiencesServe.js", import.meta.url), "utf8");
  ok(ts.includes('"use client"') && !/SUPABASE_SERVICE_ROLE_KEY|VIATOR_API_KEY|s\.key/.test(ts), "tours read must stay server-only — TourStrip is a client component and holds no service/API key");
  ok(!/"use client"/.test(serve) && /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(new URL("../lib/serverCache.js", import.meta.url), "utf8")), "the service key lives only in the server-only serveExperiences call chain (lib/serverCache.sbEnv), never in a client component");
  ok(/href=\{t\.url\}/.test(ts) && /\/pid=\/\.test\(t\.url\)/.test(ts), "tour links must be Viator's OWN product_url VERBATIM (mcid+pid intact) — a link missing pid= never ships (never hand-built, never unattributed)");
  ok(ts.includes('rel="noopener sponsored nofollow"'), "affiliate links must carry nofollow+sponsored");
  ok(ts.includes("items.length < 2") && /return null/.test(ts), "the section hides below 2 tours — never a lonely ad");
  ok(ts.includes("may earn a commission"), "the disclosure line is required");
  ok(ts.includes("wayfindScore(t.rating, t.reviews)"), "tour tiles carry the ONE Score");
}
// v6.55b Stay lane: the house hotel pattern, honestly.
{
  const src = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
  ok(src.includes("booking.com/searchresults.html?ss="), "the stay lane lost the plain-Booking pattern Stay22 LinkSwap monetizes");
  ok(src.includes("Stay near {beaches[0].name}"), "the stay card must anchor on the REAL #1 beach, never an invented hotel claim");
  ok(!/best hotel|top hotel/i.test(src), "no invented hotel superlatives on this page");
}

// v6.58 (owner editorial rewrite): decision-first page locks.
{
  const src = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
  ok(src.includes("The Best Beaches Near {NEAR_LABEL[params.metro]"), "H1 lost the search-language Near form");
  ok(src.includes("Looking for a quick answer?") && src.includes("Best overall:"), "the quick-answer block is gone — decision-first is the page's whole point");
  ok(src.includes("QUICK_LABEL[b.id]") && !/Best sand:.*hardcoded/.test(src), "quick answers render ONLY for beaches actually present and serving");
  // v6.72: the hero's markup and CSS moved to app/components/EditorialLandingHero
  // so the cuisine chooser inherits this look instead of copying it. The
  // composition RULE is unchanged — the split image/panel hero must still exist —
  // but it is now the page PLUS the template, read together. Same treatment
  // test-brand.mjs already applies to the ranked shell.
  const composed = src + "\n" + readFileSync(new URL("../app/components/EditorialLandingHero.js", import.meta.url), "utf8");
  ok(composed.includes("-hero`") && composed.includes("-panel`") && composed.includes("-media`"), "premium split hero lost its image/panel composition");
  ok(/prefix = "wf-beach-premium"/.test(composed), "the beaches page still renders under its original class prefix — the extraction was proven byte-identical against it");
  ok(src.includes('variant="premium"') && src.includes("No paid placement. No sponsored rankings."), "premium hero lost its share action or trust signal");
  ok(src.includes("Stop searching. Start choosing.") && src.includes("the shortlist we’d send a friend"), "premium hero lost its confident editorial hook");
  ok(src.includes("How we verified this") && src.includes("<details"), "the depth must collapse behind How-we-verified-this — too many words on a phone otherwise");
  ok(src.includes("Why Wayfind ranked them this way") && src.includes('i === 2 && beaches.length > 3'), "the trust section after rank 3 is gone");
  ok(src.includes("Partner stay option — it does not affect this ranking."), "the stay card lost its no-conflict label — it clashes with no-paid-placement without it");
  ok(src.includes("Know before you go:"), "the one practical line is gone");
  // Intent sheets now use the subject-neutral editorial template under their
  // own prefix. The beach page remains on its original prefix above; this
  // assertion protects the back-control handoff through the new template.
  const rep = readFileSync(new URL("../app/components/RankedExperiencePage.js", import.meta.url), "utf8");
  const editorialHero = readFileSync(new URL("../app/components/EditorialLandingHero.js", import.meta.url), "utf8");
  ok(/backControl=\{topLeft\}/.test(rep), "RankedExperiencePage no longer forwards the back control to its editorial hero");
  ok(editorialHero.includes("backControl || (") && editorialHero.includes("/brand/wayfind-wordmark-transparent-v2.png"), "editorial hero lost the back-control slot or official Wayfind logo");
  const icx = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
  ok(icx.includes('topLeft={<BackControl fallback="/" variant="editorial" />}'), "family/date-night lost their back button");
}


console.log(`test-beaches-page: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
