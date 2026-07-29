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
// the inlined formula must never drift from lib/google's wayfindScore
const gsrc = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const bsrc = readFileSync(new URL("../lib/beaches.js", import.meta.url), "utf8");
const consts = (src) => { const m = src.match(/const m = (\d+);\s*\n?\s*const C = ([\d.]+);/); return m && m[1] + "/" + m[2]; };
ok(consts(gsrc) === "60/3.9" && consts(bsrc) === "60/3.9", "beaches.js formula constants match lib/google wayfindScore (60/3.9)");
const og = readFileSync(new URL("../app/api/og/beaches/route.js", import.meta.url), "utf8");
ok(og.includes("beach-adobestock-216195684.jpeg"), "share card matches the owned beach hero artwork");
ok(og.includes("ImageResponse"), "real OG image, not a static fallback");


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
  // v6.47: the hero markup moved out of RankedExperiencePage into
  // app/components/CollectionHero.js (shared with the in-app experience screen),
  // so the hero shell is now BOTH files. Split into two assertions rather than
  // one loosened grep: the page must still hand a back control to the hero, and
  // the hero must still render it alongside the official wordmark.
  const rep = readFileSync(new URL("../app/components/RankedExperiencePage.js", import.meta.url), "utf8");
  const chero = readFileSync(new URL("../app/components/CollectionHero.js", import.meta.url), "utf8");
  ok(/topLeft=\{topLeft\}/.test(rep), "RankedExperiencePage no longer forwards the back control to the hero — /best-beaches loses its ← Back");
  ok(chero.includes("topLeft || null") && chero.includes("/brand/wayfind-wordmark-transparent-v2.png"), "hero shell lost the back-control slot or the official transparent wordmark");
  const icx = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
  ok(icx.includes('topLeft={<BackControl fallback="/" />}'), "family/date-night lost their back button");
}


console.log(`test-beaches-page: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
