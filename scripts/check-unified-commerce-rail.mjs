// Locks the owner rule: each sheet/browse surface gets one mixed-provider
// commerce rail, one compact card language, real art, and one disclosure.
import { readFileSync } from "node:fs";

const [intentPagePath = "app/components/IntentPageClient.js", partnerPath = "app/components/IntentPartnerPick.js", homePath = "app/home.js"] = process.argv.slice(2);
const read = (file) => readFileSync(file, "utf8");
const intentPage = read(intentPagePath);
const partner = read(partnerPath);
const home = read(homePath);
let passed = 0;
const ok = (condition, message) => {
  if (!condition) {
    console.error(`check-unified-commerce-rail: FAIL — ${message}`);
    process.exit(1);
  }
  passed++;
};

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
const mountLines = (home.match(/\{browseCat === "[a-z]+" && center && <UnifiedBrowseCommerceRail[^\n]*/g) || []);
const bare = (home.match(/<UnifiedBrowseCommerceRail\b/g) || []).length;
ok(mountLines.length === bare, `every unified rail mount is guarded by a browseCat check (guarded ${mountLines.length}, total ${bare})`);
ok(mountLines.length >= 3, `the unified rail is actually mounted (got ${mountLines.length})`);
const seenCat = new Set();
for (const line of mountLines) {
  const guard = (line.match(/browseCat === "([a-z]+)"/) || [])[1];
  const prop = (line.match(/<UnifiedBrowseCommerceRail\s+cat="([a-z]+)"/) || [])[1];
  ok(!!prop, `the ${guard} rail declares its category as a cat= prop (the chip map is keyed category:sub, and sub ids collide across categories)`);
  ok(guard === prop, `the ${guard} rail's cat= prop matches the category it is guarded on (got cat="${prop}")`);
  ok(!seenCat.has(guard), `browse category "${guard}" mounts the unified rail exactly once — a second mount would double the rail`);
  seenCat.add(guard);
}
// The owner ask ("I want this done everywhere"): the money categories are covered.
for (const c of ["attractions", "food", "nightlife"]) {
  ok(seenCat.has(c), `browse category "${c}" has a bookable rail — food especially, which had none while 35 food tours sat in wf_experiences`);
}
ok(!/<UTDealsRail\b|<BookableExpRail\b/.test(home.slice(home.indexOf("browseCat === \"family\""), home.indexOf("function UnifiedBrowseCommerceRail"))), "browse rendering must not mount legacy provider-specific rails");
ok(/\/api\/experiences\?/.test(home) && /\/api\/deals\?category=/.test(home), "the browse rail must combine experiences and network deals");
ok(/if \(!image \|\| !d\.id\) continue/.test(home), "browse deal cards must require real artwork");
ok(/sort\(\(a, b\) => b\.score - a\.score\)/.test(home), "the mixed browse list must be strongest-first");
ok(/via \{card\.merchant\}/.test(home), "browse cards must identify their provider on the image");

console.log(`check-unified-commerce-rail: OK — ${passed} assertions`);
