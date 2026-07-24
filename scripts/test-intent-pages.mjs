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

// Dedicated landing pages use the same owned artwork as their homepage cards.
ok(INTENT_PAGES["date-night"].art === "/cards/date-night-adobestock-190984224.jpeg", "date-night landing page matches its homepage hero card");
ok(INTENT_PAGES.family.art === "/cards/family-adobestock-794890098.jpeg", "family landing page matches its homepage hero card");
const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
ok(ic.includes("ranked lower for the drive"), "penalized rows explain themselves");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok((home.match(/family-adobestock-794890098\.jpeg/g) || []).length === 2, "family card uses the owned family artwork in both rails");
ok(!home.includes("setFamilyHeroImg"), "the owned family artwork no longer triggers an unused live-photo fetch");

// Shared references remain validated for metadata, while the visible landing
// hero stays locked to the owned card artwork.
ok(ic.includes("visible landing-page hero stays locked"), "the owned-art continuity rule is stated where the hero is built");
ok(ic.includes('sp.get("img")'), "landing page accepts the clicked card's own photoRef (?img=)");
ok(ic.includes("PHOTO_REF.test(v)"), "the passed ref is validated against the strict places-photo pattern");
ok(ic.includes("heroImg={def.art}"), "the visible landing hero stays locked to the matching card artwork");
ok(!ic.includes("def.heroFromList"), "landing heroes no longer repaint from live list photos");
ok(!ic.includes("w=1200"), "intent heroes respect the w=800 LCP cap");
ok(!home.includes('(familyHeroImg ? "&img=" + encodeURIComponent(familyHeroImg) : "")'), "the family card no longer overrides the owned landing-page artwork");
const bb = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
ok(bb.includes('const heroImg = "/cards/beach-adobestock-216195684.jpeg"'), "beach landing page matches its homepage hero card");

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
  ok(icSrc.includes("editorial={r.editorial_hook || null}") && !icSrc.includes("editorial={r.editorial}"), "rows render Wayfind editorial or nothing — never Google summary text");
  const lay = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  ok(/Impact-Site-Verification[\s\S]{0,40}/.test(lay) ? lay.includes('style={{ display: "none" }}>Impact-Site-Verification') : true, "the Impact text span must be display:none — it was leaking as visible page text");
}

console.log(`test-intent-pages: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
