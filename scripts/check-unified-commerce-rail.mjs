// Locks the owner rule: each sheet/browse surface gets one mixed-provider
// commerce rail, one compact card language, real art, and one disclosure.
import { readFileSync } from "node:fs";

const [intentPagePath = "app/components/IntentPageClient.js", partnerPath = "app/components/IntentPartnerPick.js", homePath = "app/home.js", browseRailPath = "app/components/UnifiedBrowseCommerceRail.js"] = process.argv.slice(2);
const read = (file) => readFileSync(file, "utf8");
const intentPage = read(intentPagePath);
const partner = read(partnerPath);
const home = read(homePath);
const browseRail = read(browseRailPath);
let passed = 0;
const ok = (condition, message) => {
  if (!condition) {
    console.error(`check-unified-commerce-rail: FAIL — ${message}`);
    process.exit(1);
  }
  passed++;
};

ok(/nextDynamic\(\(\) => import\("\.\/components\/UnifiedBrowseCommerceRail"\), \{ ssr: false \}\)/.test(home),
  "home lazily imports the exact extracted browse rail module, keeping it out of the eager route bundle");

ok((intentPage.match(/<IntentPartnerPick\b/g) || []).length === 1, "intent sheets must mount exactly one commerce rail");
ok(!/<CouponStrip\b|<ViatorRail\b/.test(intentPage), "legacy coupon and provider rails must not sit beside the mixed rail");
ok(/\/api\/deals\?category=/.test(partner) && /couponsForIntent/.test(partner), "the sheet rail must join network offers and local coupons");
ok(/commerceHref\(/.test(partner), "bookable products must use Wayfind's tracked redirect");
ok(/if \(!pick\.image/.test(partner) && !/Wayfind bookable/.test(partner), "cards without real artwork must fail closed instead of rendering a placeholder");
ok(/via \{pick\.merchant\}/.test(partner), "each card must identify its provider");
ok(/evidenceScore\(b\) - evidenceScore\(a\)/.test(partner), "the complete mixed list must be ordered by evidence");
ok(/railRef\.current/.test(partner) && /rail\.scrollLeft = 0/.test(partner) && /\[city, intent\]/.test(partner), "a city or intent change must reset the rail to its top-ranked card");
ok((partner.match(/never changes our scores or rankings/g) || []).length === 1, "the sheet rail must render one disclosure");

// 2026-08-04 — this pinned the count at 3, which froze the rail's reach as
// correct: it mounted on attractions, family and hotels, and Food, Nightlife,
// Shopping and Beach had no bookable rail at all. A magic number cannot tell
// "someone added a stray duplicate" from "someone covered a category that was
// missing", and the owner asked for the second one everywhere.
//
// The INVARIANT is what is asserted now: every mount is guarded by a browseCat
// check, declares the SAME category as its cat= prop, and no category is
// mounted twice. That still catches a stray or duplicated rail — which is what
// the count was really for — without forbidding coverage.
// RE-POINTED v8.13.1 (2026-08-18): #790 gated the Stays and Shopping mounts
// on organic results (`view.length > 0` — no affiliate-only screen; its own
// scripts/test-session-map-parity.mjs pins that), but this pattern only
// recognised the bare `center &&` shape, so guarded < total and main went
// red with no tree able to satisfy both guards. The optional gate is now part
// of the recognised GUARDED shape — everything this check protects (every
// mount behind a browseCat check, cat= matches the guard, no category twice,
// no stray bare mounts) is unchanged.
const mountLines = (home.match(/\{browseCat === "[a-z]+" && center && (?:view\.length > 0 && )?<UnifiedBrowseCommerceRail[^\n]*/g) || []);
const bare = (home.match(/<UnifiedBrowseCommerceRail\b/g) || []).length;
ok(mountLines.length === bare, `every unified rail mount is guarded by a browseCat check (guarded ${mountLines.length}, total ${bare})`);
ok(mountLines.length >= 3, `the unified rail is actually mounted (got ${mountLines.length})`);
const seenCat = new Set();
for (const line of mountLines) {
  const guard = (line.match(/browseCat === "([a-z]+)"/) || [])[1];
  const prop = (line.match(/<UnifiedBrowseCommerceRail[^>]*\bcat="([a-z]+)"/) || [])[1];
  ok(!!prop, `the ${guard} rail declares its category as a cat= prop (the chip map is keyed category:sub, and sub ids collide across categories)`);
  ok(guard === prop, `the ${guard} rail's cat= prop matches the category it is guarded on (got cat="${prop}")`);
  ok(!seenCat.has(guard), `browse category "${guard}" mounts the unified rail exactly once — a second mount would double the rail`);
  ok(/\bsub=\{sub\}/.test(line), `browse category "${guard}" passes the active submenu instead of freezing every chip to All`);
  ok(/\bkey=\{\[browseCat, sub, center\.lat, center\.lng\]\.join\(":"\)\}/.test(line),
    `browse category "${guard}" remounts the rail for category, submenu and both coordinates so prior inventory cannot paint stale`);
  seenCat.add(guard);
}
// The owner ask ("all menus/submenus"): every browse category is wired. A
// category with no strictly matching inventory still renders honestly empty.
for (const c of ["food", "nightlife", "attractions", "beach", "family", "hotels", "shopping"]) {
  ok(seenCat.has(c), `browse category "${c}" has exactly one Bookable-near rail mount`);
}
ok(!/<UTDealsRail\b|<BookableExpRail\b/.test(home), "browse rendering must not mount legacy provider-specific rails");
ok(/\/api\/experiences\?/.test(browseRail) && /\/api\/deals\?category=/.test(browseRail), "the extracted browse rail must combine experiences and network deals");
ok(/if \(!image \|\| !d\.id\) continue/.test(browseRail), "browse deal cards must require real artwork");
ok(/sort\(\(a, b\) => b\.score - a\.score \|\| \(b\.rankBonus \|\| 0\) - \(a\.rankBonus \|\| 0\)\)/.test(browseRail), "the mixed browse list must be strongest-first, using bounded relevance bonuses only as the tie-break");
ok(/via \{card\.merchant\}/.test(browseRail), "browse cards must identify their provider on the image");

// Lane D — every card in the menu-category rail becomes a measurable funnel
// row tagged by category:sub. Strip comments before any position/presence
// check (CLAUDE.md: "a guard that greps raw source fails on its own
// explanatory comment").
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const railStart = browseRail.indexOf("function UnifiedBrowseCommerceRail(");
ok(railStart !== -1, "UnifiedBrowseCommerceRail exists in its extracted component module");
const railEnd = browseRail.indexOf("\nfunction ", railStart + 10);
const railBody = stripComments(railStart !== -1 ? browseRail.slice(railStart, railEnd === -1 ? undefined : railEnd) : "");
// Positive control (CLAUDE.md §"assert the syntactic position"): prove the
// slice actually captured the real component before trusting any assertion
// scoped to it — an empty or wrong slice would make every check below vacuous.
ok(railBody.includes("browse_partner_rail"), "positive control: the sliced+stripped rail body is the real browse rail component");

ok(/emitCommerce\(\s*"commerce_impression"/.test(railBody),
  "the browse rail emits commerce_impression inside its own function body (not a comment) — without it a card here cannot become a measurable funnel row");
ok(/emitCommerce\(\s*"commerce_cta_clicked"/.test(railBody),
  "the browse rail emits commerce_cta_clicked on click, ahead of the redirect");

// F1 (2026-09-16 audit): "the event fires" is not "the payload is what the
// funnel needs" — lock the PAYLOAD and the DOM WIRING those events depend on,
// not merely the event names. Counted, never merely detected once (CLAUDE.md:
// "a value that exists N times → count it").
const contentIdCount = (railBody.match(/content_id:\s*`\$\{browseCat\}:\$\{sub \|\| "all"\}`/g) || []).length;
ok(contentIdCount === 2,
  `both emitCommerce calls (impression + cta_clicked) carry content_id: \`\${browseCat}:\${sub || "all"}\` — exactly 2 occurrences (got ${contentIdCount}); fewer would mean an event lost its category:sub tag and every funnel row after it collides across chips`);
const impressionBlock = (railBody.match(/emitCommerce\(\s*"commerce_impression"[\s\S]*?\}\);/) || [""])[0];
const ctaBlock = (railBody.match(/emitCommerce\(\s*"commerce_cta_clicked"[\s\S]*?\}\);/) || [""])[0];
ok(impressionBlock.length > 0 && ctaBlock.length > 0, "positive control: both emitCommerce call blocks were actually sliced out of the rail body before checking their payload");
ok(/surface:\s*"browse_partner_rail"/.test(impressionBlock), 'commerce_impression carries surface: "browse_partner_rail" — without it this rail\'s impressions cannot be told apart from any other rail in the funnel');
ok(/surface:\s*"browse_partner_rail"/.test(ctaBlock), 'commerce_cta_clicked carries surface: "browse_partner_rail" for the same reason');
ok(/data-offer-id=\{card\.key\}/.test(railBody), "every card carries data-offer-id={card.key} — the impression observer below reads this exact attribute to find which offer intersected");
ok(/data-rank=\{index \+ 1\}/.test(railBody), "every card carries data-rank={index + 1} — rank_bucket() reads this exact attribute for both impression and click events");
ok(/querySelectorAll\("\[data-offer-id\]"\)/.test(railBody), 'the impression observer actually queries "[data-offer-id]" — proving the attribute above is not merely rendered but wired to something that reads it');

// Every commerceHref( call in the file must carry a category-qualified
// content id. contentId: sub (or `sub || "all"`) collided every "all" submenu
// across every category — sub alone cannot tell food:all from nightlife:all
// apart. Counted, not merely detected once (CLAUDE.md: "a value that exists N
// times → count it; includes cannot tell 1 from 2").
const hrefCalls = (browseRail.match(/commerceHref\(/g) || []).length;
const taggedCalls = (browseRail.match(/contentId:\s*`\$\{browseCat\}:/g) || []).length;
ok(hrefCalls >= 3, `the browse rail calls commerceHref at least 3 times (got ${hrefCalls}) — fewer would mean a card lost its tracked redirect`);
ok(taggedCalls >= 3, `at least 3 commerceHref calls carry a category-qualified content id (got ${taggedCalls})`);
ok(hrefCalls === taggedCalls,
  `every commerceHref( call carries contentId: \`\${browseCat}:...\` (commerceHref calls: ${hrefCalls}, category-tagged: ${taggedCalls}) — an untagged call collides "all" across every category`);
ok(!/contentId:\s*sub\b/.test(stripComments(browseRail)),
  'no commerceHref call is left keyed on the bare submenu id (contentId: sub / contentId: sub || "all") — that is exactly the cross-category collision this lane fixed');

// Positive control: prove the bare-`sub` regex above actually catches the
// shape it exists to catch, rather than merely being absent from today's file
// by coincidence (CLAUDE.md: "an absence → prove the probe finds a known
// positive first").
const fixtureBadHref = 'const href = commerceHref({ provider: "viator", offerId: card.offerId, surface: "browse_partner_rail", contentId: sub || "all" });';
ok(/contentId:\s*sub\b/.test(stripComments(fixtureBadHref)),
  "positive control: a fixture reverting to contentId: sub is actually flagged by the bare-sub regex above");

// R1 (2026-09-16 audit): every MENU_PARTNER_OFFERS row has quality10 null ->
// score -1, so a pure score sort buries every one of them behind every scored
// Viator/UT row, and BOOKABLE_NEAR_LIMIT (50) then drops them entirely on a
// busy chip. The fix is lib/menuReserveSlots.js's interleaveReserved(), CALLED
// (not grepped) here with fabricated rows — CLAUDE.md, "assert on the call,
// not on the string".
ok(/import\s*\{[^}]*\binterleaveReserved\b[^}]*\}\s*from\s*["'][^"']*\/lib\/menuReserveSlots["']/.test(browseRail),
  "the browse rail imports interleaveReserved from lib/menuReserveSlots — a bundle-tiny pure helper, not reimplemented inline");
ok(/interleaveReserved\(/.test(railBody), "the rail's own function body actually CALLS interleaveReserved (not merely imports it)");
ok(/MENU_RESERVE\b/.test(browseRail) && /MENU_RESERVE_CADENCE\b/.test(browseRail),
  "MENU_RESERVE and MENU_RESERVE_CADENCE are declared constants, not magic numbers passed inline");

const { interleaveReserved } = await import("../lib/menuReserveSlots.js");
const scoredRow = (i) => ({ key: `viator:${i}`, score: 100 - i, source: "experience" });
const menuRow = (i, distMi) => ({ key: `menu:${i}`, score: -1, source: "menu", distMi });

// 100 scored + 12 menu rows: the first 50 must contain EXACTLY 6 menu rows,
// at the documented cadence-4-after-the-top-6 positions, and every scored
// row's relative order must be untouched.
const scored100 = Array.from({ length: 100 }, (_, i) => scoredRow(i));
const menu12 = Array.from({ length: 12 }, (_, i) => menuRow(i, 12 - i)); // descending distMi on purpose: proves re-sort-by-distance, not input order
const mixedInput = [...scored100, ...menu12];
const interleaved = interleaveReserved(mixedInput, 6, 4).slice(0, 50);
const menuInFirst50 = interleaved.filter((r) => r.source === "menu");
ok(menuInFirst50.length === 6, `the first 50 cards contain exactly 6 menu rows (got ${menuInFirst50.length})`);
const expectedMenuPositions = [6, 10, 14, 18, 22, 26];
const actualMenuPositions = interleaved.reduce((acc, r, idx) => { if (r.source === "menu") acc.push(idx); return acc; }, []);
ok(JSON.stringify(actualMenuPositions) === JSON.stringify(expectedMenuPositions),
  `menu rows land at the documented positions — 6 untouched top scored cards, then one every 4th slot (expected ${JSON.stringify(expectedMenuPositions)}, got ${JSON.stringify(actualMenuPositions)})`);
// Closest-first: menu12 was built with DESCENDING distMi (index 0 = farthest),
// so this only passes if interleaveReserved actually sorts by distance rather
// than trusting input order.
ok(menuInFirst50.every((r, i) => i === 0 || r.key !== menuInFirst50[i - 1].key) && menuInFirst50.map((r) => r.key).join(",") === "menu:11,menu:10,menu:9,menu:8,menu:7,menu:6",
  `reserved menu rows are ordered by distMi ascending, not input order (got ${menuInFirst50.map((r) => r.key).join(",")})`);
const scoredInInterleaved = interleaved.filter((r) => r.source !== "menu").map((r) => r.key);
const scoredOriginalOrder = scored100.slice(0, scoredInInterleaved.length).map((r) => r.key);
ok(JSON.stringify(scoredInInterleaved) === JSON.stringify(scoredOriginalOrder),
  "the scored rows keep the exact relative order the score sort gave them — reservation never reorders a scored card");

// 0 menu rows: output is the input, untouched — not a copy that merely looks equal.
const scoredOnly = Array.from({ length: 10 }, (_, i) => scoredRow(i));
ok(interleaveReserved(scoredOnly, 6, 4) === scoredOnly, "with 0 menu rows, interleaveReserved returns the exact same array reference (no-op)");

// 3 menu rows, more than enough scored rows: all 3 must appear.
const menu3 = [menuRow(0, 5), menuRow(1, 1), menuRow(2, 3)];
const withThree = interleaveReserved([...scoredOnly, ...menu3], 6, 4);
ok(withThree.filter((r) => r.source === "menu").length === 3, "with 3 menu rows (fewer than MENU_RESERVE), all 3 appear rather than padding to 6");

// Red-prove control: an enormous cadence only ever satisfies
// `slot % cadence === 0` once (at slot 0, right after the head) within a
// 50-card window — every OTHER reserved row would need a cadence multiple
// past position 1000 to appear, i.e. never inside BOOKABLE_NEAR_LIMIT. That
// is exactly the "menu rows never actually show" failure this reservation
// exists to prevent, and it is what this assertion would catch if a future
// change let the rail pass an unbounded or wrong cadence through.
const badCadence = interleaveReserved(mixedInput, 6, 1000).slice(0, 50);
const badPositions = badCadence.reduce((acc, r, idx) => { if (r.source === "menu") acc.push(idx); return acc; }, []);
ok(badPositions.length === 1 && badPositions[0] === 6,
  `positive control: an enormous cadence places only ONE reserved row (at the guaranteed head+1 slot) inside the first 50 — proving the cadence parameter is load-bearing, not decorative (got ${JSON.stringify(badPositions)})`);

console.log(`check-unified-commerce-rail: OK — ${passed} assertions`);
