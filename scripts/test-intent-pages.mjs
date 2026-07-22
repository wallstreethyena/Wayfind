// scripts/test-intent-pages.mjs — locks the intent-page rules (owner):
// the family distance decay (-0.2 per started 5mi block past 17, THIS list
// only), photo-from-the-list heroes, floors, and honest why-lines.
import { readFileSync } from "fs";
import { INTENT_PAGES, distanceDeduction, rankRows, toRow } from "../lib/intentPages.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const cfg = INTENT_PAGES.family.distancePenalty;
ok(cfg && cfg.freeMi === 17 && cfg.per === 5 && cfg.deduct === 0.2, "family decay is the owner's exact rule (17mi free, -0.2/5mi)");
ok(!INTENT_PAGES["date-night"].distancePenalty, "date-night has NO distance decay — the rule is family-only");
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
ok(unranked[0].id === "b", "without the rule (date-night), pure quality order holds");
ok(ranked.find((r) => r.id === "b").deduction >= 0.4, "the deduction is carried on the row for the why-line");

// hero-from-list + card photo
ok(INTENT_PAGES.family.heroFromList === true, "family hero comes from the list's own best photo");
const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
ok(ic.includes("def.heroFromList && rows && rows[0] && rows[0].photoRef"), "page hero swaps to the top pick's photo");
ok(ic.includes("ranked lower for the drive"), "penalized rows explain themselves");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes("familyHeroImg ||"), "family card wears the area's best family photo, art only as fallback");
ok(/rating >= 4\.5 && x\.reviews >= 500/.test(home), "card photo comes from a PROVEN family place (same floor as the list)");

console.log(`test-intent-pages: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
