// scripts/test-intent-pages.mjs — locks the intent-page rules (owner):
// the family distance decay (-0.2 per started 5mi block past 17, THIS list
// only), photo-from-the-list heroes, floors, and honest why-lines.
import { readFileSync } from "fs";
import { INTENT_PAGES, distanceDeduction, rankRows, toRow } from "../lib/intentPages.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const cfg = INTENT_PAGES.family.distancePenalty;
ok(cfg && cfg.freeMi === 17 && cfg.per === 5 && cfg.deduct === 0.2, "family decay is the owner's exact rule (17mi free, -0.2/5mi)");
const dcfg = INTENT_PAGES["date-night"].distancePenalty;
ok(dcfg && dcfg.freeMi === 17 && dcfg.per === 5 && dcfg.deduct === 0.2, "date-night carries the SAME distance rule (owner follow-up)");
ok(distanceDeduction(17, cfg) === 0, "17 mi exactly: no deduction");
ok(Math.abs(distanceDeduction(18, cfg) - 0.2) < 1e-9, "18 mi: first block bites (-0.2)");
ok(Math.abs(distanceDeduction(22.1, cfg) - 0.4) < 1e-9, "22.1 mi: second block (-0.4)");
ok(Math.abs(distanceDeduction(47, cfg) - 1.2) < 1e-9, "47 mi: -1.2 — far places sink hard");
ok(distanceDeduction(5, cfg) === 0 && distanceDeduction(NaN, cfg) === 0, "close or unknown distance: untouched");

// decay reorders: a stronger-but-far place drops below a close solid one
const origin = { lat: 27.5, lng: -82.5 };
const near = { id: "a", name: "Near", rating: 4.6, reviews: 3000, lat: 27.5, lng: -82.52 };  // ~1mi
const far = { id: "b", name: "Far", rating: 4.8, reviews: 5000, lat: 27.5, lng: -83.05 };    // ~30mi
const ranked = rankRows([near, far], { rating: 4.5, reviews: 500 }, { origin, penalty: cfg });
ok(ranked[0].id === "a", "a 4.8 thirty miles out ranks below a 4.6 nearby (family rule)");
const unranked = rankRows([near, far], { rating: 4.5, reviews: 500 }, { origin, penalty: null });
ok(unranked[0].id === "b", "with no penalty config, pure quality order holds (the rule is opt-in per list)");
ok(ranked.find((r) => r.id === "b").deduction >= 0.4, "the deduction is carried on the row for the why-line");

// hero-from-list + card photo
ok(INTENT_PAGES.family.heroFromList === true, "family hero comes from the list's own best photo");
const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
ok(ic.includes("ranked lower for the drive"), "penalized rows explain themselves");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes("familyHeroImg ?"), "family card wears the area's best family photo, art only as fallback");
ok(/heroRefFromPlaces\(j\.places, \{ minRating: 4\.5, minReviews: 500 \}\)/.test(home), "card photo comes from a PROVEN family place (same floor as the list)");

// THE CONTINUITY RULE (owner, 2026-07-22): the photo you clicked is the photo
// you land on — the hero never flashes a different image first.
ok(ic.includes("THE CONTINUITY RULE"), "the rule is stated where the hero is built");
ok(ic.includes('sp.get("img")'), "landing page accepts the clicked card's own photoRef (?img=)");
ok(ic.includes("PHOTO_REF.test(v)"), "the passed ref is validated against the strict places-photo pattern");
ok(/passedRef \? "\/api\/photo\?ref=" \+ encodeURIComponent\(passedRef\) \+ "&w=800"/.test(ic), "a passed photo wins and is never repainted");
ok(/def\.heroFromList \? \(rows && rows\[0\] && rows\[0\]\.photoRef[\s\S]+?: null\)/.test(ic), "heroFromList with no passed photo holds the dark shell — NEVER another card's art");
ok(!ic.includes("w=1200"), "intent heroes respect the w=800 LCP cap");
ok(home.includes('(familyHeroImg ? "&img=" + encodeURIComponent(familyHeroImg) : "")'), "the family card hands its photo to the landing page");
const bb = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
ok(!bb.includes("w=1200"), "beach page hero respects the w=800 LCP cap too");

// v6.56 (owner): brand dedupe + Wayfind-editorial-only rows + the hidden
// verification span.
{
  const a = { id: "m1", name: "Melt N Dip", rating: 4.9, reviews: 5200, lat: 27.5, lng: -82.52 };
  const b = { id: "m2", name: "Melt N Dip", rating: 4.9, reviews: 2000, lat: 27.5, lng: -82.53 };
  const c = { id: "x1", name: "Big Cat Habitat", rating: 4.6, reviews: 4400, lat: 27.5, lng: -82.54 };
  const out = rankRows([a, b, c], { rating: 4.5, reviews: 500 }, { origin: { lat: 27.5, lng: -82.5 }, penalty: null });
  ok(out.filter((r) => r.name === "Melt N Dip").length === 1, "one card per brand — duplicate branches collapse");
  ok(out.some((r) => r.id === "m1"), "the best-ranked branch is the one kept");
  const icSrc = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
  ok(icSrc.includes('.eq("verified", true).in("place_id"'), "intent rows fetch VERIFIED Wayfind hooks in one call");
  ok(icSrc.includes("editorial={r.editorial_hook || r.ai_line || null}") && !/editorial=\{r\.editorial\}/.test(icSrc), "rows render Wayfind editorial (verified hook OR the LLM Atlas line), never Google summary text");
ok(icSrc.includes('fetch("/api/blurbs"'), "cards without a verified hook get an LLM editorial line in the Wayfind voice");
  const lay = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  ok(/Impact-Site-Verification[\s\S]{0,40}/.test(lay) ? lay.includes('style={{ display: "none" }}>Impact-Site-Verification') : true, "the Impact text span must be display:none — it was leaking as visible page text");
}

// v6.58 (owner): the date-night card wears the area's best real photo too —
// same continuity contract as family.
ok(home.includes("dateHeroImg ?"), "date-night card lost its real-photo hero (art must be fallback only)");
ok(home.includes('(dateHeroImg ? "&img=" + encodeURIComponent(dateHeroImg) : "")'), "the date-night card no longer hands its photo to the landing page");
ok(/heroRefFromPlaces\(j\.places, \{ minRating: 4\.4, minReviews: 150 \}\)/.test(home), "date-night card photo must come from the SAME floor the date-night list rides on");

// v6.60 (owner): the Hidden Gems page — loved (4.6+) but NOT famous (review
// CEILING 3000), each card carrying the LLM editorial line.
ok(INTENT_PAGES["hidden-gems"] && INTENT_PAGES["hidden-gems"].floor.maxReviews === 3000, "the gem rule: a 3000-review CEILING keeps the tourist-magnets out");
ok(INTENT_PAGES["hidden-gems"].floor.rating === 4.6, "gems must be genuinely loved (4.6+)");
{ const rows = [{ id: "a", name: "Famous", rating: 4.8, reviews: 9000, lat: 27.5, lng: -82.5 }, { id: "b", name: "Gem", rating: 4.7, reviews: 400, lat: 27.5, lng: -82.5 }]; const out = rankRows(rows, INTENT_PAGES["hidden-gems"].floor, { origin: { lat: 27.5, lng: -82.5 }, penalty: null }); ok(out.length === 1 && out[0].id === "b", "the 9000-review magnet is filtered; the 400-review gem stays"); }
ok(home.includes("gems_hero_open") && home.includes('window.location.assign("/hidden-gems'), "the Hidden Gems hero opens the page");

console.log(`test-intent-pages: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
