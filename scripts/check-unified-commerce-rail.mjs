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
ok((partner.match(/never changes our scores or rankings/g) || []).length === 1, "the sheet rail must render one disclosure");

const mounts = home.match(/<UnifiedBrowseCommerceRail\b/g) || [];
ok(mounts.length === 3, "home browse surfaces must use only the three intended unified rail mounts");
ok(!/<UTDealsRail\b|<BookableExpRail\b/.test(home.slice(home.indexOf("browseCat === \"family\""), home.indexOf("function UnifiedBrowseCommerceRail"))), "browse rendering must not mount legacy provider-specific rails");
ok(/\/api\/experiences\?/.test(home) && /\/api\/deals\?category=/.test(home), "the browse rail must combine experiences and network deals");
ok(/if \(!image \|\| !d\.id\) continue/.test(home), "browse deal cards must require real artwork");
ok(/sort\(\(a, b\) => b\.score - a\.score\)/.test(home), "the mixed browse list must be strongest-first");
ok(/via \{card\.merchant\}/.test(home), "browse cards must identify their provider on the image");

console.log(`check-unified-commerce-rail: OK — ${passed} assertions`);
