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
ok(pageSrc2.includes("<BeachLiveChips id={b.id}"), "chips render per ROW — never the number-one beach's values on others");
// THE RULE: verified editorial replaces the metric sentence (core law)
ok(pageSrc2.includes("editorialsFor(") && pageSrc2.includes("ed.why"), "verified wf_editorial rows replace the metric prose");
ok(pageSrc2.includes("Plan it:"), "know_before + best_time render as the Plan-it line");
ok(pageSrc2.includes("Sourced:"), "sources footnote renders (transparency = the brand)");
ok(/water QUALITY[\s\S]{0,80}no wired source/i.test(parts), "water quality stays absent until a real source is wired");
ok(parts.includes("navigator.share"), "native share with clipboard fallback");
// the inlined formula must never drift from lib/google's wayfindScore
const gsrc = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const bsrc = readFileSync(new URL("../lib/beaches.js", import.meta.url), "utf8");
const consts = (src) => { const m = src.match(/const m = (\d+);\s*\n?\s*const C = ([\d.]+);/); return m && m[1] + "/" + m[2]; };
ok(consts(gsrc) === "60/3.9" && consts(bsrc) === "60/3.9", "beaches.js formula constants match lib/google wayfindScore (60/3.9)");
const og = readFileSync(new URL("../app/api/og/beaches/route.js", import.meta.url), "utf8");
ok(og.includes("BEACH_SHARE_PHOTO"), "share card uses the curated best picture");
ok(og.includes("ImageResponse"), "real OG image, not a static fallback");


// v6.55 "Make it a beach day" — the revenue rail's honesty contract.
{
  const src = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
  ok(src.includes("SUPABASE_SERVICE_ROLE_KEY") && !src.includes('"use client"'), "tours read must stay server-only — the service key must never reach a client component");
  ok(src.includes("viatorDirectUrl(t.product_url) || t.product_url") && !/viator\.com\/tours\/[^\"]*\$\{/.test(src), "tour links must be Viator's OWN product_url through the ONE tracking wrapper — never hand-built, never unattributed");
  ok(src.includes('rel="noreferrer nofollow sponsored"'), "affiliate links must carry nofollow+sponsored — this is an INDEXED page");
  ok(src.includes("tours.length >= 2"), "the section hides below 2 tours — never a lonely ad");
  ok(src.includes("may earn a commission"), "the disclosure line is required");
  ok(src.includes("wfTourScore(t.rating, t.reviews)"), "tour tiles carry the ONE Score");
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
  ok(src.includes("How we verified this") && src.includes("<details"), "the depth must collapse behind How-we-verified-this — too many words on a phone otherwise");
  ok(src.includes("Why Wayfind ranked them this way") && src.includes('i === 2 && beaches.length > 3'), "the trust section after rank 3 is gone");
  ok(src.includes("Partner stay option — it does not affect this ranking."), "the stay card lost its no-conflict label — it clashes with no-paid-placement without it");
  ok(src.includes("Know before you go:"), "the one practical line is gone");
  const rep = readFileSync(new URL("../app/components/RankedExperiencePage.js", import.meta.url), "utf8");
  ok(rep.includes("topLeft || null") && rep.includes("fontSize: 23, fontWeight: 800"), "hero shell lost the back-control slot or the bigger wordmark");
  const icx = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
  ok(icx.includes('topLeft={<BackControl fallback="/" />}'), "family/date-night lost their back button");
}


console.log(`test-beaches-page: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
